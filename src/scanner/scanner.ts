import { open, opendir, stat } from "node:fs/promises";
import type { Dirent, Stats } from "node:fs";
import { join, normalize, resolve } from "node:path";
import { ALWAYS_EXCLUDED_SET } from "../utils/always-excluded.js";
import { isConfigFile, isTestFile, languageForPath } from "../utils/file.js";
import { getGitIgnoreHandle, type GitIgnoreHandle } from "../utils/gitignore.js";
import { toPosixRelativePath } from "../utils/path.js";
import { PathIsFileError, PathNotFoundError, type UnreadableFile } from "./errors.js";
import type { DiscoveryResult, FileCategory, ScannedFileMetadata, ScanTotals } from "./results.js";

export interface ScannerOptions {
  /**
   * Extra gitignore rules to always apply, in addition to the repository's
   * own `.gitignore`. The scanner prepends these so always-excluded paths
   * win even if a repo's `.gitignore` would un-ignore them.
   */
  extraIgnoreRules?: readonly string[];
}

export interface Scanner {
  /** Run discovery over the repository rooted at `inputPath`. */
  scan(inputPath: string): Promise<DiscoveryResult>;
}

/**
 * Repository discovery scanner.
 *
 * Contract:
 * - Resolves `inputPath` to a canonical absolute directory, throwing
 *   `PathNotFoundError` / `PathIsFileError` for bad input.
 * - Detects (but does not analyze) Git history: only the presence of a
 *   `.git` entry is recorded.
 * - Walks the tree recursively, applying gitignore semantics per-directory.
 * - Always excludes `.git`, `node_modules`, `dist`, `build`, `coverage`,
 *   and `.codebase-doctor`, regardless of the repository's gitignore.
 * - Never follows symlinks that point outside the repository root.
 * - Reads file *metadata* only — never file contents (avoiding loading
 *   large files into memory).
 * - Produces deterministic, POSIX-relative `ScannedFileMetadata`.
 */
export function createScanner(options: ScannerOptions = {}): Scanner {
  return new RepositoryScanner(options.extraIgnoreRules ?? []);
}

class RepositoryScanner implements Scanner {
  private readonly extraIgnoreRules: readonly string[];

  constructor(extraIgnoreRules: readonly string[]) {
    this.extraIgnoreRules = extraIgnoreRules;
  }

  /** Resolve a user-supplied path to a canonical absolute directory. */
  private async resolveRoot(inputPath: string): Promise<string> {
    const resolved = normalize(resolve(process.cwd(), inputPath));
    let info: Stats;
    try {
      info = await stat(resolved);
    } catch {
      throw new PathNotFoundError(inputPath, resolved);
    }
    if (info.isFile()) {
      throw new PathIsFileError(resolved);
    }
    return resolved;
  }

  async scan(inputPath: string): Promise<DiscoveryResult> {
    const rootPath = await this.resolveRoot(inputPath);
    const startedAt = Date.now();
    const isGitRepository = await this.detectGitRepository(rootPath);
    const { files, totals, unreadable } = await this.walkFiles(rootPath, rootPath);
    return {
      rootPath,
      isGitRepository,
      durationMs: Date.now() - startedAt,
      files,
      totals,
      unreadable,
    };
  }

  /** Detect whether a `.git` entry exists (dir, or file for worktrees). */
  private async detectGitRepository(rootPath: string): Promise<boolean> {
    try {
      const info = await stat(join(rootPath, ".git"));
      return info.isDirectory() || info.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Iterative depth-first walk. The root's gitignore handle is loaded
   * first; each directory gets its own handle so rules apply to the
   * subtree of the directory where the `.gitignore` lives.
   */
  private async walkFiles(
    rootPath: string,
    startDir: string,
  ): Promise<{
    files: ScannedFileMetadata[];
    totals: ScanTotals;
    unreadable: UnreadableFile[];
  }> {
    const files: ScannedFileMetadata[] = [];
    const unreadable: UnreadableFile[] = [];
    let totalDirectories = 0;
    let totalBytes = 0;
    let sourceFiles = 0;
    let testFiles = 0;
    let configFiles = 0;
    let skipCount = 0;

    const stack: Array<{ dir: string; handle: GitIgnoreHandle }> = [
      { dir: startDir, handle: await getGitIgnoreHandle(startDir, this.extraIgnoreRules) },
    ];

    const processMetadata = (metadata: ScannedFileMetadata): void => {
      files.push(metadata);
      totalBytes += metadata.sizeBytes;
      if (metadata.isSource) sourceFiles += 1;
      if (metadata.isTest) testFiles += 1;
      if (metadata.isConfig) configFiles += 1;
    };

    const noteUnreadable = (rel: string, err: unknown): void => {
      skipCount += 1;
      unreadable.push({
        path: rel,
        error: err instanceof Error ? err.message : String(err),
        reason: "read-error",
      });
    };

    while (stack.length > 0) {
      const { dir, handle } = stack.pop()!;
      let entries: Dirent[];
      try {
        entries = await readDirSafe(dir);
      } catch (err) {
        totalDirectories += 1;
        noteUnreadable(toPosixRelativePath(rootPath, dir), err);
        continue;
      }

      for (const entry of entries) {
        const absolutePath = join(dir, entry.name);
        const rel = toPosixRelativePath(rootPath, absolutePath);

        if (entry.isDirectory()) {
          // Never traverse into always-excluded dirs.
          if (ALWAYS_EXCLUDED_SET.has(entry.name)) {
            skipCount += 1;
            continue;
          }
          // Symlinked directories are never crossed (they may escape root).
          if (entry.isSymbolicLink()) {
            skipCount += 1;
            continue;
          }
          // Apply the directory's own gitignore. Git's trailing-slash
          // patterns (`generated/`) match only a directory path written
          // WITH the trailing slash, so we test `rel + "/"`. Bare patterns
          // (`build`) match the bare name, exactly like git.
          if (handle.isIgnored(`${rel}/`)) {
            skipCount += 1;
            continue;
          }
          totalDirectories += 1;
          const childHandle = await getGitIgnoreHandle(absolutePath, this.extraIgnoreRules);
          stack.push({ dir: absolutePath, handle: childHandle });
          continue;
        }

        if (entry.isFile()) {
          // Symlinked files pointing outside the root are not processed.
          if (entry.isSymbolicLink()) {
            skipCount += 1;
            continue;
          }
          if (handle.isIgnored(rel)) {
            skipCount += 1;
            continue;
          }
          try {
            processMetadata(await this.readFileMetadata(absolutePath, rel));
          } catch (err) {
            noteUnreadable(rel, err);
          }
          continue;
        }

        // Sockets, fifos, devices, unknown types: skip silently.
        skipCount += 1;
      }
    }

    files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

    const totals: ScanTotals = {
      totalFiles: files.length,
      totalDirectories,
      totalBytes,
      sourceFiles,
      testFiles,
      configFiles,
      skipCount,
    };

    return { files, totals, unreadable };
  }

  /** Read a file's metadata (size, line count) without reading full contents. */
  private async readFileMetadata(absolutePath: string, rel: string): Promise<ScannedFileMetadata> {
    const sizeBytes = (await stat(absolutePath)).size;
    const lineCount = await this.countLines(absolutePath);
    const isSource = languageForPath(rel) !== null;
    const isTest = isTestFile(rel);
    const isConfig = isConfigFile(rel);
    return {
      path: rel,
      absolutePath,
      isSource,
      isTest,
      isConfig,
      sizeBytes,
      lineCount,
      category: categorize(rel, isSource, isConfig, isTest),
    };
  }

  /**
   * Count newline-terminated lines without loading the file into memory.
   * A file that does not end in a newline still counts its final line.
   * `endsWithNewline` tracks the byte that ended the last chunk.
   */
  private async countLines(filePath: string): Promise<number> {
    const handle = await open(filePath, "r");
    try {
      const BUFFER_SIZE = 64 * 1024;
      const buf = Buffer.alloc(BUFFER_SIZE);
      let lines = 0;
      let hasContent = false;
      let endedWithNewline = false;
      for (;;) {
        const { bytesRead } = await handle.read(buf, 0, BUFFER_SIZE, null);
        if (bytesRead === 0) break;
        hasContent = true;
        for (let i = 0; i < bytesRead; i++) {
          if (buf[i] === 0x0a) lines += 1;
        }
        endedWithNewline = buf[bytesRead - 1] === 0x0a;
      }
      if (hasContent && !endedWithNewline) {
        // A non-empty file with no trailing newline still has one line.
        lines += 1;
      }
      return lines;
    } finally {
      try {
        await handle.close();
      } catch {
        // best-effort close
      }
    }
  }
}

async function readDirSafe(dir: string): Promise<Dirent[]> {
  const dh = await opendir(dir);
  try {
    const entries: Dirent[] = [];
    for await (const entry of dh) {
      entries.push(entry);
    }
    return entries;
  } finally {
    try {
      await dh.close();
    } catch {
      // best-effort close
    }
  }
}

/** Classify a file into a discovery-level category. */
function categorize(
  rel: string,
  isSource: boolean,
  isConfig: boolean,
  _isTest: boolean,
): FileCategory {
  if (isSource) {
    return rel.toLowerCase().endsWith(".d.ts") ? "type-definition" : "source";
  }
  if (isConfig) return "config";
  const base = rel.split("/").pop()?.toLowerCase() ?? rel;
  if (rel.includes("/__fixtures__/") || base.startsWith("fixture")) return "fixture";
  if (/\.(md|markdown|txt|rst)$/.test(base)) return "documentation";
  return "unknown";
}

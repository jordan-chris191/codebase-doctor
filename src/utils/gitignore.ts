import { join, posix } from "node:path";
import { readFile } from "node:fs/promises";
import ignore, { type Ignore } from "ignore";

/**
 * A directory-scoped gitignore matcher, compiled from the `.gitignore`
 * file in that directory plus any explicitly-added extra rules.
 *
 * This mirrors git's semantics: rules in a directory's `.gitignore` apply
 * to files and subdirectories beneath that directory only.
 */
export class GitIgnoreHandle {
  readonly directory: string;
  private readonly matcher: Ignore;

  private constructor(directory: string, matcher: Ignore) {
    this.directory = directory;
    this.matcher = matcher;
  }

  /**
   * Load a handle for `directory`, adding `extraRules` (raw gitignore
   * lines) first so unconditionally-excluded paths always win regardless
   * of what the repository's own `.gitignore` says.
   */
  static async load(
    directory: string,
    extraRules: readonly string[] = [],
  ): Promise<GitIgnoreHandle> {
    const matcher = ignore().add([...extraRules]);
    const gitIgnorePath = join(directory, ".gitignore");
    try {
      const raw = await readFile(gitIgnorePath, "utf8");
      matcher.add(raw);
    } catch {
      // No readable `.gitignore`; the extra rules still apply.
    }
    return new GitIgnoreHandle(directory, matcher);
  }

  /**
   * Whether `posixPath` (slash-separated, relative to `this.directory`) is
   * ignored. A bare pattern like `build` matches both files and
   * directories of that name (matching git's default), while a trailing-
   * slash pattern like `build/` matches directories only — the `ignore`
   * package implements this itself.
   */
  isIgnored(posixPath: string): boolean {
    return this.matcher.ignores(posixPath);
  }
}

/** Lazy-initialized handles keyed by the *directory* they represent, so a
 * `.gitignore` is parsed at most once per scan. */
const handleCache = new Map<string, GitIgnoreHandle>();

/** Load (and cache) the gitignore handle for `directory`. */
export function getGitIgnoreHandle(
  directory: string,
  extraRules: readonly string[] = [],
): Promise<GitIgnoreHandle> {
  const key = posix.normalize(directory);
  const cached = handleCache.get(key);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }
  return GitIgnoreHandle.load(directory, extraRules).then((handle) => {
    handleCache.set(key, handle);
    return handle;
  });
}

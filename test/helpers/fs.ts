import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A disposable fixture repo with an automatic cleanup hook. */
export interface FixtureRepo {
  root: string;
  /** Remove the fixture tree. Safe to call more than once. */
  cleanup(): Promise<void>;
}

/** A registry of fixture cleanups, run at the end of a test run. */
const registrations: Array<() => Promise<void>> = [];

/** Register a cleanup so it runs when the test environment tears down. */
export function trackCleanup(cleanup: () => Promise<void>): void {
  registrations.push(cleanup);
}

/** Run all registered cleanups (idempotent). */
export async function runCleanups(): Promise<void> {
  while (registrations.length > 0) {
    const fn = registrations.pop()!;
    await fn().catch(() => undefined);
  }
}

/**
 * Build a disposable fixture repo on disk from a map of relative path →
 * content. Directories are created as needed. `root` is the temp dir that
 * holds the fixture.
 */
export async function makeFixtureRepo(files: Record<string, string>): Promise<FixtureRepo> {
  const root = await mkdtemp(join(tmpdir(), "cbd-test-"));
  await writeFixtureFiles(root, files);
  return {
    root,
    cleanup: async (): Promise<void> => {
      await rm(root, { recursive: true, force: true });
    },
  };
}

async function writeFixtureFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [rel, content] of Object.entries(files)) {
    const absolute = join(root, rel);
    if (rel.endsWith("/")) {
      await mkdir(absolute, { recursive: true });
      continue;
    }
    await mkdir(join(absolute, ".."), { recursive: true });
    await writeFile(absolute, content, "utf8");
  }
}

/**
 * Create a symlink at `linkPath` pointing to `target`.
 * On Windows this may fail without Developer Mode or elevated privileges;
 * callers that need a symlink should treat this as potentially unsupported.
 */
export async function makeLink(linkPath: string, target: string): Promise<void> {
  await symlink(target, linkPath);
}

export { join, tmpdir };

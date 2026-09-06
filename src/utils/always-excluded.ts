/**
 * Directories that are always excluded from scans regardless of what the
 * repository's own `.gitignore` says. These rarely contain first-party
 * source and would otherwise dominate the walk (and, for `node_modules`,
 * `.git`, bloat `dist` sizes).
 */
export const ALWAYS_EXCLUDED_DIRS: readonly string[] = [
  ".git", // git internals
  "node_modules", // third-party deps
  "dist", // build output
  "build", // build output
  "coverage", // test coverage output
  ".codebase-doctor", // our own scan artifacts
];

/** Set of the always-excluded dir names, for O(1) lookup. */
export const ALWAYS_EXCLUDED_SET: ReadonlySet<string> = new Set(ALWAYS_EXCLUDED_DIRS);

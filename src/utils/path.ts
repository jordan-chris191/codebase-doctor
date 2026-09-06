import { sep } from "node:path";

/**
 * Normalize a filesystem path to POSIX-style separators (`/`), regardless
 * of the host operating system. Paths persisted in ScanResults are always
 * POSIX-relative, so agents and consumers get stable output on Windows and
 * POSIX alike.
 */
export function toPosixPath(input: string): string {
  return input.replaceAll(sep === "\\" ? "\\" : "/", "/");
}

/**
 * Convert an absolute filesystem path to a POSIX-style path relative to
 * `rootPath`. `rootPath` must be a normalized absolute path and `targetPath`
 * must be inside it (both should be produced by the scanner). If `targetPath`
 * equals `rootPath`, returns "." to match `node:path`'s `relative` semantics.
 */
export function toPosixRelativePath(rootPath: string, targetPath: string): string {
  const relative = targetPath.startsWith(rootPath)
    ? targetPath.slice(rootPath.length).replace(/^[\\/]+/, "")
    : targetPath;
  if (relative === "") {
    return ".";
  }
  return toPosixPath(relative);
}

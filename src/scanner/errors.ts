/**
 * Errors raised by repository discovery / scanning.
 * These are distinct from `AnalyzerError` (parsing) and intentionally
 * carry structured context so the CLI and MCP layer can render them.
 */

/** Base class for all scanner errors. */
export class ScanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScanError";
  }
}

/** Raised when the input path does not resolve to an existing directory. */
export class PathNotFoundError extends ScanError {
  readonly inputPath: string;
  /** Path that actually failed to resolve (the canonical absolute path). */
  readonly resolvedPath: string;

  constructor(inputPath: string, resolvedPath: string) {
    super(`Directory not found: ${inputPath} (resolved to ${resolvedPath})`);
    this.name = "PathNotFoundError";
    this.inputPath = inputPath;
    this.resolvedPath = resolvedPath;
  }
}

/** Raised when the input path resolves to a file, not a directory. */
export class PathIsFileError extends ScanError {
  readonly resolvedPath: string;

  constructor(resolvedPath: string) {
    super(`Not a directory (it is a file): ${resolvedPath}`);
    this.name = "PathIsFileError";
    this.resolvedPath = resolvedPath;
  }
}

/** Raised when the resolved path is not a Git repository. */
export class NotARepositoryError extends ScanError {
  readonly resolvedPath: string;

  constructor(resolvedPath: string) {
    super(`Not a Git repository: ${resolvedPath}`);
    this.name = "NotARepositoryError";
    this.resolvedPath = resolvedPath;
  }
}

/**
 * A file that could not be read during the scan. The scan continues (the
 * file is skipped) and the aggregate is reported at the end rather than
 * aborting the whole walk.
 */
export interface UnreadableFile {
  /** POSIX-relative path of the file that could not be read. */
  readonly path: string;
  /** The error that occurred while reading. */
  readonly error: string;
  /** Human-readable reason. */
  readonly reason: "read-error";
}

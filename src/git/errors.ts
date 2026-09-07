import { AnalyzerError } from "../analyzers/errors.js";

/**
 * Errors raised by Git repository analysis (Phase 1E).
 * These distinguish the distinct failure modes so callers never mistake an
 * empty repository for a command failure, and never get fabricated zeroes.
 */

/** Base class for Git-analysis errors. */
export class GitAnalysisError extends AnalyzerError {
  constructor(message: string) {
    super(message);
    this.name = "GitAnalysisError";
  }
}

/** Raised when the target is not a Git working tree. */
export class NotAGitRepositoryError extends GitAnalysisError {
  readonly resolvedPath: string;

  constructor(resolvedPath: string) {
    super(`Not a Git repository: ${resolvedPath}`);
    this.name = "NotAGitRepositoryError";
    this.resolvedPath = resolvedPath;
  }
}

/** Raised when the `git` executable cannot be run. */
export class GitUnavailableError extends GitAnalysisError {
  constructor(detail: string) {
    super(`Git executable unavailable: ${detail}`);
    this.name = "GitUnavailableError";
  }
}

/** Raised when a Git command fails unexpectedly (not an empty repo). */
export class GitCommandError extends GitAnalysisError {
  readonly command: string;
  readonly stderr: string;

  constructor(command: string, stderr: string) {
    super(`Git command failed: ${command}${stderr ? ` — ${stderr}` : ""}`);
    this.name = "GitCommandError";
    this.command = command;
    this.stderr = stderr;
  }
}

/** Raised when Git output is not in the expected machine-readable shape. */
export class GitOutputError extends GitAnalysisError {
  constructor(detail: string) {
    super(`Malformed Git output: ${detail}`);
    this.name = "GitOutputError";
  }
}

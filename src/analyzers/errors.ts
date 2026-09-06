/** Errors raised during repository scanning and analysis. */
export class AnalyzerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalyzerError";
  }
}

/** Raised when a file cannot be read or parsed for reasons other than it
 * being unsupported. */
export class FileParseError extends Error {
  readonly filePath: string;

  constructor(filePath: string, cause: unknown) {
    super(`Failed to parse ${filePath}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "FileParseError";
    this.filePath = filePath;
  }
}

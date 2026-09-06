export { createScanner, type Scanner, type ScannerOptions } from "./scanner.js";
export {
  PathIsFileError,
  PathNotFoundError,
  ScanError,
  NotARepositoryError,
  type UnreadableFile,
} from "./errors.js";
export type { DiscoveryResult, FileCategory, ScannedFileMetadata, ScanTotals } from "./results.js";

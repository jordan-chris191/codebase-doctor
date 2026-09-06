/**
 * Public barrel export for the `codebase-doctor` package.
 *
 * Consumers import domain types and the top-level orchestrator from here.
 */
export type { Language } from "./types/language.js";
export type { FileInfo, FileKind } from "./types/file.js";
export type {
  Module,
  ModuleExport,
  ModuleReference,
  ExportKind,
  ImportType,
} from "./types/module.js";
export type { DependencyEdge, DependencyType, DependencyCycle } from "./types/dependency.js";
export type {
  Finding,
  FindingCategory,
  FindingSeverity,
  FindingLocation,
} from "./types/finding.js";
export type { Hotspot, RepoStats } from "./types/stats.js";
export type { ScanResult } from "./types/scan.js";
export { createScanner, type Scanner, type ScannerOptions } from "./scanner/index.js";
export {
  PathIsFileError,
  PathNotFoundError,
  ScanError,
  NotARepositoryError,
  type UnreadableFile,
} from "./scanner/errors.js";
export type { DiscoveryResult, ScannedFileMetadata, ScanTotals } from "./scanner/results.js";

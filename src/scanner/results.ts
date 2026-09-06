import type { UnreadableFile } from "./errors.js";

/**
 * File-level category for a discovered file (derived from name/ext, and
 * used to distinguish source/config/fixture/doc files during discovery).
 */
export type FileCategory =
  "source" | "config" | "fixture" | "documentation" | "type-definition" | "unknown";

/** Deterministic metadata produced for every discovered file. */
export interface ScannedFileMetadata {
  /** Path relative to the repository root, POSIX-style. */
  readonly path: string;
  /** Absolute filesystem path (internal; not part of public results). */
  readonly absolutePath: string;
  /** True for `.ts/.tsx/.js/.jsx`. */
  readonly isSource: boolean;
  /** True when this is a test file (`.test.`/`.spec.` in the name). */
  readonly isTest: boolean;
  /** True when this is a config file. */
  readonly isConfig: boolean;
  /** Size in bytes. */
  readonly sizeBytes: number;
  /** Number of newline-terminated lines. */
  readonly lineCount: number;
  /** Category of the file. */
  readonly category: FileCategory;
}

/** Aggregate counters for the whole scan. */
export interface ScanTotals {
  readonly totalFiles: number;
  readonly totalDirectories: number;
  readonly totalBytes: number;
  readonly sourceFiles: number;
  readonly testFiles: number;
  readonly configFiles: number;
  readonly skipCount: number;
}

/** The result of repository discovery. */
export interface DiscoveryResult {
  /** Absolute, canonical root of the scan. */
  readonly rootPath: string;
  /** Whether the root is a Git repository. */
  readonly isGitRepository: boolean;
  /** Duration of discovery, in milliseconds. */
  readonly durationMs: number;
  /** Metadata for every discovered, non-ignored file (sorted by path). */
  readonly files: readonly ScannedFileMetadata[];
  readonly totals: ScanTotals;
  /** Files that exist but could not be read (skipped, scan continues). */
  readonly unreadable: readonly UnreadableFile[];
}

import type { Language } from "./language.js";

/** The kind of file, derived from its path and usage. */
export type FileKind =
  "source" | "test" | "config" | "fixture" | "documentation" | "type-definition" | "unknown";

/**
 * Descriptive metadata about a single file in the repository.
 * All fields are position-independent and fully deterministic.
 */
export interface FileInfo {
  /** Path relative to the repository root, using `/` separators. */
  readonly path: string;
  /** Language of the file, if it is a supported source file. */
  readonly language: Language | null;
  /** Size in bytes. */
  readonly sizeBytes: number;
  /** Total number of lines (including blank lines). */
  readonly lineCount: number;
  /** Number of non-blank, non-comment lines. */
  readonly codeLineCount: number;
  /** Whether the file is a test file. */
  readonly isTest: boolean;
  /** Whether the file is a configuration file. */
  readonly isConfig: boolean;
  /** Derived classification of the file. */
  readonly kind: FileKind;
}

import type { Language } from "../types/language.js";
import type { ModuleExport, ModuleReference } from "../types/module.js";

/**
 * Everything an analyzer reports about a single source file.
 * This is the raw, per-file output of parsing — before any graph
 * construction or cross-file aggregation happens.
 */
export interface FileAnalysis {
  /** Absolute path to the file. */
  readonly filePath: string;
  /** Symbols this file exports. */
  readonly exports: readonly ModuleExport[];
  /** Dependencies this file references. */
  readonly references: readonly ModuleReference[];
  /** Cyclomatic complexity of the file's functions. */
  readonly complexity: number;
  /** Names of functions declared in this file. */
  readonly functions: readonly string[];
  /** Names of classes declared in this file. */
  readonly classes: readonly string[];
  /** Human-readable description of the module's purpose, if detectable. */
  readonly summary: string | null;
}

/**
 * The contract every programming-language analyzer must implement.
 * For Phase 1, only the TypeScript/JavaScript analyzer exists.
 */
export interface LanguageAnalyzer {
  /** Unique name of the analyzer (e.g. "typescript"). */
  readonly name: string;
  /** The languages this analyzer understands. */
  readonly languages: readonly Language[];
  /**
   * Whether this analyzer should handle a given file.
   * Used during discovery to route files to the correct analyzer.
   */
  canHandle(filePath: string): boolean;
  /** Analyze a single source file, returning its parsed structure. */
  analyzeFile(filePath: string, content: string): FileAnalysis;
}

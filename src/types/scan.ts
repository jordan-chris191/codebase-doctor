import type { DependencyCycle, DependencyEdge } from "./dependency.js";
import type { FileInfo } from "./file.js";
import type { Finding } from "./finding.js";
import type { Language } from "./language.js";
import type { Module } from "./module.js";
import type { Hotspot, RepoStats } from "./stats.js";

/**
 * The complete result of scanning a repository.
 * This is the top-level artifact produced by the analysis pipeline and
 * consumed by every consumer (CLI, MCP, etc.).
 */
export interface ScanResult {
  /** Absolute path to the repository root. */
  readonly rootPath: string;
  /** Timestamp when the scan completed (ISO 8601). */
  readonly scanTimestamp: string;
  /** Schema version of this result format. Bump on breaking changes. */
  readonly schemaVersion: 1;
  /** Total time the scan took, in milliseconds. */
  readonly durationMs: number;
  /** Languages detected in the repository. */
  readonly languages: readonly Language[];
  /** Per-file metadata. */
  readonly files: readonly FileInfo[];
  /** Extracted modules (one per source file). */
  readonly modules: readonly Module[];
  /** Dependency edges. */
  readonly dependencies: readonly DependencyEdge[];
  /** Circular dependency groups. */
  readonly cycles: readonly DependencyCycle[];
  /** Repository-level Git statistics. */
  readonly stats: RepoStats | null;
  /** Hotspot files, most risky first. */
  readonly hotspots: readonly Hotspot[];
  /** Detected findings. */
  readonly findings: readonly Finding[];
}

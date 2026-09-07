import type { DiscoveryResult, ScannedFileMetadata } from "../scanner/results.js";
import type { FileAnalysis } from "../analyzers/interfaces.js";
import type { DependencyGraph } from "../types/dependency.js";
import type { RepoStats } from "../types/stats.js";
import type { Finding } from "../types/finding.js";
import type { Hotspot } from "../types/stats.js";

/**
 * Everything the findings engine consumes. Phase 1F never re-parses source,
 * never re-runs the scanner, dependency resolver, or Git analysis — it reads
 * the previously-produced structures.
 */
export interface FindingsContext {
  /** Repository discovery output (Phase 1B). */
  readonly discovery: DiscoveryResult;
  /** Per-file source analysis keyed by absolute path (Phase 1C). */
  readonly analyses: ReadonlyMap<string, FileAnalysis>;
  /** Dependency graph (Phase 1D). Null when not computed. */
  readonly graph: DependencyGraph | null;
  /** Git statistics (Phase 1E). Null when not computed. */
  readonly stats: RepoStats | null;
}

/** The top-level output of Phase 1F. */
export interface FindingsResult {
  /** Absolute root path of the analyzed repository. */
  readonly rootPath: string;
  /** Findings, deterministically ordered. */
  readonly findings: readonly Finding[];
  /** Hotspots, deterministically ordered. */
  readonly hotspots: readonly Hotspot[];
}

/** Index files by absolute path for O(1) lookup. */
export function indexByAbsolutePath(
  files: readonly ScannedFileMetadata[],
): Map<string, ScannedFileMetadata> {
  const map = new Map<string, ScannedFileMetadata>();
  for (const file of files) {
    map.set(file.absolutePath, file);
  }
  return map;
}

/** Compute fan-in/fan-out from the dependency graph's internal edges. */
export function computeFanDegrees(graph: DependencyGraph): {
  fanIn: Map<string, number>;
  fanOut: Map<string, number>;
} {
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  for (const edge of graph.edges) {
    if (edge.kind !== "internal") continue;
    fanOut.set(edge.source, (fanOut.get(edge.source) ?? 0) + 1);
    fanIn.set(edge.target, (fanIn.get(edge.target) ?? 0) + 1);
  }
  return { fanIn, fanOut };
}

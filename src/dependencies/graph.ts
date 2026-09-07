import type { DiscoveryResult } from "../scanner/results.js";
import type { FileAnalysis } from "../analyzers/interfaces.js";
import type { ImportType, ModuleExport } from "../types/module.js";
import type {
  DependencyClassification,
  DependencyEdge,
  DependencyGraph,
  DependencyNode,
  DependencyType,
  UnresolvedDependency,
} from "../types/dependency.js";
import { createModuleResolver, type ModuleResolver, type ResolveResult } from "./resolver.js";
import { detectCycles } from "./cycles.js";

/**
 * Build the repository-level dependency graph from Phase 1C analysis.
 *
 * Consumes `DiscoveryResult` (scanned files) and the per-file `FileAnalysis`
 * produced by the analyzer (references + re-export sources) and produces a
 * deterministic `DependencyGraph`:
 *
 * - `nodes`: internal source files
 * - `edges`: classified edges — each carries `kind`
 *   (internal/external/unresolved) plus `type` (static/type-only/dynamic/
 *   commonjs/side-effect) and `weight` (occurrence count)
 * - `cycles`: canonical cycles
 * - `unresolved`: retained list of references that could not be resolved
 *
 * Phase 1C `ModuleReference.kind` is hard-coded to `internal`; this layer
 * resolves references against the filesystem and sets the true classification.
 */

/** Options for building a graph. */
export interface GraphBuildOptions {
  /** Path to a tsconfig; defaults to `<root>/tsconfig.json`. */
  tsconfigPath?: string;
}

interface EdgeKey {
  source: string;
  target: string;
  kind: DependencyClassification;
  type: DependencyType;
  specifier: string;
}

/** Build the graph for a scanned repository. */
export function buildDependencyGraph(
  discovery: DiscoveryResult,
  analyses: Map<string, FileAnalysis>,
  options: GraphBuildOptions = {},
): DependencyGraph {
  const resolver: ModuleResolver = createModuleResolver(discovery.rootPath, options);

  // 1. Nodes: scanned source files (config/fixture excluded from graph nodes).
  const nodes: DependencyNode[] = [];
  const nodeSet = new Set<string>();
  for (const file of discovery.files) {
    if (!file.isSource || file.category === "config") {
      continue;
    }
    nodes.push({ path: file.path, absolutePath: file.absolutePath });
    nodeSet.add(file.absolutePath);
  }

  // 2. Resolve references + re-exports into weighted edges.

  // Accumulator: edgeKey → count.
  const edgeCounts = new Map<string, EdgeKey & { count: number }>();
  const unresolved: UnresolvedDependency[] = [];

  const addEdge = (key: EdgeKey): void => {
    const k = `${key.source}\u0000${key.target}\u0000${key.kind}\u0000${key.type}\u0000${key.specifier}`;
    const existing = edgeCounts.get(k);
    if (existing === undefined) {
      edgeCounts.set(k, { ...key, count: 1 });
    } else {
      existing.count += 1;
    }
  };

  const record = (
    sourceFile: string,
    specifier: string,
    importType: ImportType,
    result: ResolveResult,
  ): void => {
    if (result.kind === "unresolved") {
      unresolved.push({ sourceFile, specifier, importType });
      addEdge({
        source: sourceFile,
        target: specifier,
        kind: "unresolved",
        type: importType,
        specifier,
      });
      return;
    }
    if (result.kind === "external") {
      addEdge({
        source: sourceFile,
        target: specifier,
        kind: "external",
        type: importType,
        specifier,
      });
      return;
    }
    addEdge({
      source: sourceFile,
      target: result.absolutePath,
      kind: "internal",
      type: importType,
      specifier,
    });
  };

  for (const file of discovery.files) {
    if (!file.isSource) {
      continue;
    }
    const analysis = analyses.get(file.absolutePath);
    if (analysis === undefined) {
      continue;
    }

    // Re-export targets first, so they can upgrade matching reference edges.
    // `export { x } from "./m"` and `export * as ns from "./m"` are STATIC
    // dependencies; a pure `export * from "./m"` (which appears only as a
    // reference, with no named re-export export) is SIDE-EFFECT.
    const reExportTypeBySource = new Map<string, ImportType>();
    for (const exp of analysis.exports) {
      if (exp.source !== null) {
        reExportTypeBySource.set(exp.source, exportImportType(exp));
      }
    }

    // (a) import/require/export-collected references.
    for (const ref of analysis.references) {
      // If this reference is actually a named re-export (static/type-only),
      // use the re-export's type rather than the analyzer's side-effect label.
      const type = reExportTypeBySource.get(ref.source) ?? ref.type;
      record(
        file.absolutePath,
        ref.source,
        type,
        resolver.resolveReference(ref.source, file.absolutePath),
      );
    }

    // (b) re-export sources not already covered by a reference. Nearly all
    // re-exports appear as both a reference and an export; this covers any
    // that didn't (e.g. an export whose source was only emitted as an export).
    for (const [expSource, importType] of reExportTypeBySource) {
      record(
        file.absolutePath,
        expSource,
        importType,
        resolver.resolveReference(expSource, file.absolutePath),
      );
    }
  }

  // 3. Materialize edges (with weight) and sort deterministically.
  const edges: DependencyEdge[] = [...edgeCounts.values()].map(({ count, ...key }) => ({
    ...key,
    weight: count,
  }));
  edges.sort(compareEdges);

  // 4. Cycles over internal nodes.
  const cycles = detectCycles(nodeSet, edges);

  // 5. Unresolved, sorted deterministically.
  unresolved.sort(compareUnresolved);

  return {
    rootPath: discovery.rootPath,
    nodes,
    edges,
    cycles,
    unresolved,
  };
}

/** The import kind a re-export represents. */
function exportImportType(exp: ModuleExport): ImportType {
  return exp.kind === "type" ? "type-only" : "static";
}

/** Deterministic edge comparison: source, kind, target, type, specifier. */
function compareEdges(a: DependencyEdge, b: DependencyEdge): number {
  return (
    cmp(a.source, b.source) ||
    cmp(a.kind, b.kind) ||
    cmp(a.target, b.target) ||
    cmp(a.type, b.type) ||
    cmp(a.specifier, b.specifier)
  );
}

function compareUnresolved(a: UnresolvedDependency, b: UnresolvedDependency): number {
  return (
    cmp(a.sourceFile, b.sourceFile) ||
    cmp(a.specifier, b.specifier) ||
    cmp(a.importType, b.importType)
  );
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

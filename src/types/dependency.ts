/**
 * The dependency graph: how modules (source files) reference each other.
 * Produced by Phase 1D from the Phase 1C `ModuleReference`/`ModuleExport`
 * data. Fields are readonly, deterministic, and serialization-friendly.
 */

import type { ImportType } from "./module.js";

/**
 * How a module reference was made — mirrors `ImportType`.
 * `static` is a plain (value) import/re-export; the rest are self-describing.
 */
export type DependencyType = ImportType;

/**
 * The resolution classification of a dependency.
 *
 * - `internal`  — the reference resolved to a source file inside the repo.
 * - `external`  — the reference resolves to a package/outside-the-repo module.
 * - `unresolved`— the reference could not be resolved to a file.
 */
export type DependencyClassification = "internal" | "external" | "unresolved";

/** A node in the repository-level dependency graph (a source file). */
export interface DependencyNode {
  /** Repository-relative POSIX path, e.g. `src/foo.ts`. */
  readonly path: string;
  /** Absolute filesystem path (internal to the engine). */
  readonly absolutePath: string;
}

/**
 * An edge in the dependency graph, describing how one module depends on
 * another.
 *
 * - `source` is the importing module's absolute path.
 * - `target` is the resolved absolute path (internal) or the original
 *   package/specifier (external, unresolved).
 * - `kind` is the resolution classification (`internal`/`external`/`unresolved`).
 * - `type` is how the reference was made (`static`, `type-only`, `dynamic`,
 *   `commonjs`, `side-effect`).
 * - `weight` is the number of distinct import/re-export occurrences that
 *   produced this edge.
 * - `specifier` is the original module specifier as written in the source,
 *   preserving the reason the edge exists.
 */
export interface DependencyEdge {
  /** Absolute path (module ID) of the dependant. */
  readonly source: string;
  /** Absolute path (internal) or original specifier (external/unresolved). */
  readonly target: string;
  /** Resolution classification. */
  readonly kind: DependencyClassification;
  /** How the dependency was referenced. */
  readonly type: DependencyType;
  /** Number of distinct import statements creating this edge. */
  readonly weight: number;
  /** The exact original import/require/re-export specifier. */
  readonly specifier: string;
}

/**
 * A dependency the resolver could not map to a file or package. Retained so
 * later diagnostics can explain it; never silently discarded.
 */
export interface UnresolvedDependency {
  /** Absolute path of the importing module. */
  readonly sourceFile: string;
  /** The original module specifier that could not be resolved. */
  readonly specifier: string;
  /** How the reference was made (static, type-only, dynamic, …). */
  readonly importType: ImportType;
}

/** The complete repository-level dependency graph (deterministic). */
export interface DependencyGraph {
  /** Repository-relative POSIX path of the scanned root. */
  readonly rootPath: string;
  /** Internal source-file nodes, sorted by normalized POSIX path. */
  readonly nodes: readonly DependencyNode[];
  /** Dependency edges, sorted deterministically. */
  readonly edges: readonly DependencyEdge[];
  /** Circular dependency groups, each represented once canonically. */
  readonly cycles: readonly DependencyCycle[];
  /** References that could not be resolved, sorted deterministically. */
  readonly unresolved: readonly UnresolvedDependency[];
}

/** A cycle in the dependency graph — a group of modules that depend on
 * each other transitively in a loop. `members` are absolute paths. */
export interface DependencyCycle {
  /** Absolute paths of the modules participating in the cycle. */
  readonly members: readonly string[];
}

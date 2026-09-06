/**
 * An edge in the dependency graph, describing how one node depends on another.
 */
export interface DependencyEdge {
  /** Module ID of the dependant. */
  readonly source: string;
  /** Module ID (internal) or package name (external) of the dependency. */
  readonly target: string;
  /** Nature of the dependency. */
  readonly type: DependencyType;
  /** Number of import statements creating this edge. */
  readonly weight: number;
}

export type DependencyType = "internal" | "external" | "type-only" | "dynamic" | "commonjs";

/**
 * A cycle in the dependency graph — a group of modules that depend on
 * each other transitively in a loop.
 */
export interface DependencyCycle {
  /** IDs of the modules participating in the cycle. */
  readonly members: readonly string[];
}

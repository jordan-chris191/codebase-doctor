/**
 * A finding is a detected issue or observation within the repository.
 * Findings are always produced by deterministic rules over the computed
 * data model — never by AI.
 */
export interface Finding {
  /** Stable identifier for this specific finding instance. */
  readonly id: string;
  /** Category of the finding. */
  readonly category: FindingCategory;
  /** Normalized severity level. */
  readonly severity: FindingSeverity;
  /** Short, human-readable title. */
  readonly title: string;
  /** Longer description of the issue. */
  readonly description: string;
  /** Where the finding points to (file, module, or dependency). */
  readonly location: FindingLocation;
}

export type FindingCategory =
  | "circular-dependency"
  | "complexity"
  | "large-file"
  | "missing-tests"
  | "unused-dependency"
  | "dead-code";

export type FindingSeverity = "info" | "low" | "medium" | "high";

export interface FindingLocation {
  readonly type: "file" | "module" | "dependency";
  readonly path: string;
  readonly lineStart?: number;
  readonly lineEnd?: number;
}

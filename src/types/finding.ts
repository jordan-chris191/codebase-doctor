/**
 * A finding is a detected issue or observation within the repository.
 * Findings are always produced by deterministic rules over the computed
 * data model — never by AI.
 */
export interface Finding {
  /** Stable identifier for this specific finding instance. */
  readonly id: string;
  /** The deterministic rule that produced this finding. */
  readonly ruleId: string;
  /** Category of the finding. */
  readonly category: FindingCategory;
  /** Normalized severity level (assigned deterministically by the rule). */
  readonly severity: FindingSeverity;
  /** Short, human-readable title (fixed per rule). */
  readonly title: string;
  /** Deterministic explanation (may interpolate measured/threshold). */
  readonly description: string;
  /** Where the finding points to (file, module, or dependency). */
  readonly location: FindingLocation;
  /** The measured value of the rule's metric. */
  readonly measured: number;
  /** The threshold the metric compared against. */
  readonly threshold: number;
  /** Short, structured pointer to the evidence/source of the finding. */
  readonly evidence: string;
}

export type FindingCategory =
  | "circular-dependency"
  | "complexity"
  | "large-file"
  | "missing-tests"
  | "unused-dependency"
  | "dead-code"
  | "churn"
  | "fan-in"
  | "fan-out";

export type FindingSeverity = "info" | "low" | "medium" | "high";

export interface FindingLocation {
  readonly type: "file" | "module" | "dependency";
  readonly path: string;
  readonly lineStart?: number;
  readonly lineEnd?: number;
}

import type { Finding, FindingLocation } from "../types/finding.js";
import type { ScannedFileMetadata } from "../scanner/results.js";
import type { FileAnalysis } from "../analyzers/interfaces.js";
import type { GitFileChurn } from "../types/stats.js";
import type { DependencyGraph } from "../types/dependency.js";

/**
 * Deterministic findings rules. Each rule is a pure function over ONE metric
 * from the upstream analysis. Rules are explicit and explainable: every
 * finding carries the measured value, the threshold, and a deterministic
 * description. No AI, no opaque scores.
 *
 * Thresholds are documented constants (see also REPORT.md):
 * - complexity ≥ 15
 * - churn (add+del) ≥ 200
 * - fan-out (distinct internal deps) ≥ 20
 * - fan-in (distinct internal dependents) ≥ 10
 * - cycle membership → always
 * - large-complex: lines ≥ 800 AND complexity ≥ 15
 */

/** Threshold for the `high-complexity` rule. */
export const COMPLEXITY_THRESHOLD = 15;
/** Threshold for the `high-churn` rule. */
export const CHURN_THRESHOLD = 200;
/** Threshold for the `high-fan-out` rule. */
export const FAN_OUT_THRESHOLD = 20;
/** Threshold for the `high-fan-in` rule. */
export const FAN_IN_THRESHOLD = 10;
/** Threshold for the `large-file` dimension of `large-complex-file`. */
export const LARGE_FILE_LINES = 800;

/** Build a Finding from a rule + location + measured/threshold. */
function find(
  rule: {
    ruleId: string;
    category: string;
    severity: "info" | "low" | "medium" | "high";
    title: string;
  },
  location: FindingLocation,
  measured: number,
  threshold: number,
): Finding {
  const description = `${rule.title}: measured ${measured}, threshold ${threshold}`;
  return {
    id: `${rule.ruleId}:${location.path}`,
    ruleId: rule.ruleId,
    category: rule.category as Finding["category"],
    severity: rule.severity,
    title: rule.title,
    description,
    location,
    measured,
    threshold,
    evidence: `${rule.ruleId}@${location.path}`,
  };
}

/** Rule: files with cyclomatic complexity ≥ COMPLEXITY_THRESHOLD. */
export function highComplexityRules(
  files: readonly ScannedFileMetadata[],
  analyses: ReadonlyMap<string, FileAnalysis>,
): Finding[] {
  const out: Finding[] = [];
  for (const file of files) {
    if (!file.isSource) continue;
    const analysis = analyses.get(file.absolutePath);
    if (analysis === undefined) continue;
    const c = analysis.complexity;
    if (c >= COMPLEXITY_THRESHOLD) {
      out.push(
        find(
          {
            ruleId: "high-complexity",
            category: "complexity",
            severity: "high",
            title: "High cyclomatic complexity",
          },
          { type: "file", path: file.path },
          c,
          COMPLEXITY_THRESHOLD,
        ),
      );
    }
  }
  return out;
}

/** Rule: files with churn ≥ CHURN_THRESHOLD. */
export function highChurnRules(churn: readonly GitFileChurn[]): Finding[] {
  const out: Finding[] = [];
  for (const entry of churn) {
    if (entry.churn >= CHURN_THRESHOLD) {
      out.push(
        find(
          { ruleId: "high-churn", category: "churn", severity: "medium", title: "High file churn" },
          { type: "file", path: entry.path },
          entry.churn,
          CHURN_THRESHOLD,
        ),
      );
    }
  }
  return out;
}

/** Rule: modules with fan-out (distinct internal deps) ≥ FAN_OUT_THRESHOLD. */
export function highFanOutRules(
  fanOut: ReadonlyMap<string, number>,
  paths: ReadonlyMap<string, string>,
): Finding[] {
  const out: Finding[] = [];
  for (const [abs, deg] of fanOut) {
    if (deg >= FAN_OUT_THRESHOLD) {
      const path = paths.get(abs) ?? abs;
      out.push(
        find(
          {
            ruleId: "high-fan-out",
            category: "fan-out",
            severity: "medium",
            title: "High dependency fan-out",
          },
          { type: "module", path },
          deg,
          FAN_OUT_THRESHOLD,
        ),
      );
    }
  }
  return out;
}

/** Rule: modules with fan-in (distinct internal dependents) ≥ FAN_IN_THRESHOLD. */
export function highFanInRules(
  fanIn: ReadonlyMap<string, number>,
  paths: ReadonlyMap<string, string>,
): Finding[] {
  const out: Finding[] = [];
  for (const [abs, deg] of fanIn) {
    if (deg >= FAN_IN_THRESHOLD) {
      const path = paths.get(abs) ?? abs;
      out.push(
        find(
          {
            ruleId: "high-fan-in",
            category: "fan-in",
            severity: "low",
            title: "High dependency fan-in",
          },
          { type: "module", path },
          deg,
          FAN_IN_THRESHOLD,
        ),
      );
    }
  }
  return out;
}

/** Rule: files participating in a dependency cycle. One finding per member. */
export function dependencyCycleRules(
  graph: DependencyGraph,
  paths: ReadonlyMap<string, string>,
): Finding[] {
  const out: Finding[] = [];
  const memberPaths = new Set<string>();
  for (const cycle of graph.cycles) {
    for (const member of cycle.members) {
      const path = paths.get(member) ?? member;
      memberPaths.add(path);
    }
  }
  for (const path of [...memberPaths].sort()) {
    out.push(
      find(
        {
          ruleId: "dependency-cycle",
          category: "circular-dependency",
          severity: "high",
          title: "Part of a dependency cycle",
        },
        { type: "module", path },
        1, // participating
        1,
      ),
    );
  }
  return out;
}

/** Rule: files that are both large and complex. */
export function largeComplexFileRules(
  files: readonly ScannedFileMetadata[],
  analyses: ReadonlyMap<string, FileAnalysis>,
): Finding[] {
  const out: Finding[] = [];
  for (const file of files) {
    if (!file.isSource) continue;
    const analysis = analyses.get(file.absolutePath);
    if (analysis === undefined) continue;
    if (file.lineCount >= LARGE_FILE_LINES && analysis.complexity >= COMPLEXITY_THRESHOLD) {
      out.push(
        find(
          {
            ruleId: "large-complex-file",
            category: "large-file",
            severity: "high",
            title: "Large and complex file",
          },
          { type: "file", path: file.path },
          file.lineCount,
          LARGE_FILE_LINES,
        ),
      );
    }
  }
  return out;
}

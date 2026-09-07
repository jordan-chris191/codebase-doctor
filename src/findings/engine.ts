import type { Finding } from "../types/finding.js";
import type { FindingsContext, FindingsResult } from "./types.js";
import { indexByAbsolutePath, computeFanDegrees } from "./types.js";
import {
  highComplexityRules,
  highChurnRules,
  highFanOutRules,
  highFanInRules,
  dependencyCycleRules,
  largeComplexFileRules,
} from "./rules.js";
import { buildHotspots } from "./hotspots.js";

/**
 * Deterministic findings engine. Consumes Phase 1A–1E outputs and produces
 * findings + hotspots. Ordering is fully deterministic and independent of
 * object iteration order.
 */

/** Severity rank for deterministic ordering (highest first). */
const SEVERITY_RANK: Record<Finding["severity"], number> = {
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

/** Run all rules over the given context and assemble the result. */
export function runFindings(context: FindingsContext): FindingsResult {
  const { discovery, analyses, graph, stats } = context;
  const byPath = indexByAbsolutePath(discovery.files);

  // Absolute path -> POSIX-relative path, for graph-based rules.
  const relPath = new Map<string, string>();
  for (const file of discovery.files) {
    relPath.set(file.absolutePath, file.path);
  }

  const findings: Finding[] = [
    ...highComplexityRules(discovery.files, analyses),
    ...(stats ? highChurnRules(stats.fileChurn) : []),
  ];

  if (graph !== null) {
    const { fanIn, fanOut } = computeFanDegrees(graph);
    findings.push(...highFanInRules(fanIn, relPath));
    findings.push(...highFanOutRules(fanOut, relPath));
    findings.push(...dependencyCycleRules(graph, relPath));
  }

  findings.push(...largeComplexFileRules(discovery.files, analyses));

  // Deduplicate: a file may be flagged by both `high-complexity` and
  // `large-complex-file` (different rules → different ruleIds, so they are
  // distinct findings). Dedupe only exact (ruleId, path) collisions.
  const unique = new Map<string, Finding>();
  for (const f of findings) {
    const key = `${f.ruleId}:${f.location.path}`;
    if (!unique.has(key)) {
      unique.set(key, f);
    }
  }

  const ordered = [...unique.values()].sort(compareFindings);
  const hotspots = buildHotspots(ordered, relPath, byPath, analyses, graph);

  return {
    rootPath: discovery.rootPath,
    findings: ordered,
    hotspots,
  };
}

/** Deterministic finding sort: severity, ruleId, path, measured (desc). */
function compareFindings(a: Finding, b: Finding): number {
  return (
    (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0) ||
    cmp(a.ruleId, b.ruleId) ||
    cmp(a.location.path, b.location.path) ||
    b.measured - a.measured
  );
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

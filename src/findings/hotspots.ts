import type { Finding } from "../types/finding.js";
import type { Hotspot } from "../types/stats.js";
import type { ScannedFileMetadata } from "../scanner/results.js";
import type { FileAnalysis } from "../analyzers/interfaces.js";
import type { DependencyGraph } from "../types/dependency.js";
import { computeFanDegrees } from "./types.js";

/**
 * Deterministic hotspot construction.
 *
 * A hotspot is a file that triggers ≥ 2 distinct "priority" rules
 * (high-complexity, high-churn, high-fan-out, high-fan-in, dependency-cycle).
 * It is NOT an opaque composite score: `signals` carries the raw measured
 * values, `findings` lists the contributing rule IDs, and `ranking` is simply
 * the number of distinct contributing signals.
 */

/** Rule IDs that count as hotspot signals. */
const PRIORITY_RULES = new Set([
  "high-complexity",
  "high-churn",
  "high-fan-out",
  "high-fan-in",
  "dependency-cycle",
]);

interface Signals {
  complexity: number;
  churn: number;
  fanOut: number;
  fanIn: number;
  ruleIds: string[];
}

/** Build hotspots from the already-ordered findings. */
export function buildHotspots(
  findings: readonly Finding[],
  relPath: ReadonlyMap<string, string>,
  files: ReadonlyMap<string, ScannedFileMetadata>,
  analyses: ReadonlyMap<string, FileAnalysis>,
  graph: DependencyGraph | null,
): Hotspot[] {
  const byAbs = collectSignals(findings, relPath, files, analyses, graph);

  const hotspots: Hotspot[] = [];
  for (const [abs, signals] of byAbs) {
    const contributing = signals.ruleIds.filter((r) => PRIORITY_RULES.has(r));
    if (contributing.length >= 2) {
      hotspots.push({
        filePath: relPath.get(abs) ?? abs,
        signals: {
          complexity: signals.complexity,
          churn: signals.churn,
          fanOut: signals.fanOut,
          fanIn: signals.fanIn,
          inCycle: signals.ruleIds.includes("dependency-cycle"),
        },
        findings: [...contributing].sort(),
        ranking: contributing.length,
      });
    }
  }

  return hotspots.sort((a, b) => b.ranking - a.ranking || cmp(a.filePath, b.filePath));
}

/** Gather raw signals per file from findings + analyses + graph. */
function collectSignals(
  findings: readonly Finding[],
  relPath: ReadonlyMap<string, string>,
  files: ReadonlyMap<string, ScannedFileMetadata>,
  analyses: ReadonlyMap<string, FileAnalysis>,
  graph: DependencyGraph | null,
): Map<string, Signals> {
  // Lookup absolute path by rel path.
  const absByRel = new Map<string, string>();
  for (const [abs, p] of relPath) {
    absByRel.set(p, abs);
  }

  const out = new Map<string, Signals>();
  const ensureAbs = (abs: string): Signals => {
    let s = out.get(abs);
    if (s === undefined) {
      s = { complexity: 0, churn: 0, fanOut: 0, fanIn: 0, ruleIds: [] };
      out.set(abs, s);
    }
    return s;
  };

  // From findings: contributing rule IDs + measured signals.
  for (const f of findings) {
    const abs = absByRel.get(f.location.path);
    if (abs === undefined) continue;
    const s = ensureAbs(abs);
    s.ruleIds.push(f.ruleId);
    if (f.ruleId === "high-complexity" || f.ruleId === "large-complex-file") {
      s.complexity = f.measured;
    }
    if (f.ruleId === "high-churn") {
      s.churn = f.measured;
    }
  }

  // From analyses: raw complexity for every source file.
  for (const [abs] of files) {
    const analysis = analyses.get(abs);
    if (analysis !== undefined) {
      ensureAbs(abs).complexity = analysis.complexity;
    }
  }

  // From graph: fan-in/out for every node.
  if (graph !== null) {
    const { fanIn, fanOut } = computeFanDegrees(graph);
    for (const node of graph.nodes) {
      const s = ensureAbs(node.absolutePath);
      s.fanIn = fanIn.get(node.absolutePath) ?? 0;
      s.fanOut = fanOut.get(node.absolutePath) ?? 0;
    }
  }

  return out;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

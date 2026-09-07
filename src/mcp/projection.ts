import type { ScanResult } from "../types/scan.js";
import type { Finding } from "../types/finding.js";
import type { RepoStats } from "../types/stats.js";
import { toPosixRelativePath } from "../utils/path.js";
import type { ScanSummary } from "./summary.js";

/**
 * Project the canonical `ScanResult` into a compact, agent-oriented `ScanSummary`
 * for the `scan_repository` MCP tool.
 *
 * This is the MCP presentation layer's responsibility: the underlying engine
 * still produces the full `ScanResult` (single source of truth, unchanged),
 * and this function deterministically REDUCES it for transport — retaining
 * repository-level signals (counts, languages, dependency totals, cycles,
 * hotspots, notable findings, highest-risk files, a bounded Git summary)
 * while omitting the per-item bulk (every dependency edge, every exported
 * symbol, every file's metadata, the full Git history) that makes the raw
 * result too large for an MCP tool response.
 *
 * The projection is pure and deterministic: given the same `ScanResult` it
 * always produces the same summary, so repository facts remain reproducible.
 * No repository fact is invented, and nothing AI-generated is added.
 */

/** Cap on how many per-signal, highest-risk file lists to emit. */
const TOP_FILES_LIMIT = 10;

/** Cap on how many Git churn files to emit. */
const TOP_GIT_CHURN_LIMIT = 10;

/** Map an absolute filesystem path to a repo-relative POSIX path. */
function toRelative(rootPath: string, abs: string): string {
  return toPosixRelativePath(rootPath, abs);
}

/** Aggregate per-`FileKind` counts from the file list. */
function byKindCounts(result: ScanResult): ScanSummary["counts"]["byKind"] {
  const counts = {
    source: 0,
    test: 0,
    config: 0,
    documentation: 0,
    fixture: 0,
    typeDefinition: 0,
    unknown: 0,
  };
  for (const f of result.files) {
    switch (f.kind) {
      case "source":
        counts.source += 1;
        break;
      case "test":
        counts.test += 1;
        break;
      case "config":
        counts.config += 1;
        break;
      case "documentation":
        counts.documentation += 1;
        break;
      case "fixture":
        counts.fixture += 1;
        break;
      case "type-definition":
        counts.typeDefinition += 1;
        break;
      default:
        counts.unknown += 1;
        break;
    }
  }
  return counts;
}

/** Count files per detected language, deterministically sorted. */
function languageBreakdown(result: ScanResult): ScanSummary["languages"] {
  return [...result.languages]
    .map((language) => ({
      language,
      fileCount: result.files.filter((f) => f.language === language).length,
    }))
    .sort((a, b) => (a.language < b.language ? -1 : a.language > b.language ? 1 : 0));
}

/** Dependency totals by classification, plus unresolved reference detail. */
function dependencySummary(result: ScanResult): ScanSummary["dependencies"] {
  let internal = 0;
  let external = 0;
  let unresolved = 0;
  const unresolvedRefs: Array<{
    sourceFile: string;
    specifier: string;
    importType: ScanSummary["dependencies"]["unresolvedRefs"][number]["importType"];
  }> = [];

  for (const edge of result.dependencies) {
    switch (edge.kind) {
      case "internal":
        internal += 1;
        break;
      case "external":
        external += 1;
        break;
      case "unresolved":
        unresolved += 1;
        unresolvedRefs.push({
          sourceFile: toRelative(result.rootPath, edge.source),
          specifier: edge.specifier,
          importType: edge.type,
        });
        break;
    }
  }

  // Deterministic: sort unresolved refs by (sourceFile, specifier).
  unresolvedRefs.sort(
    (a, b) =>
      (a.sourceFile < b.sourceFile ? -1 : a.sourceFile > b.sourceFile ? 1 : 0) ||
      (a.specifier < b.specifier ? -1 : a.specifier > b.specifier ? 1 : 0),
  );

  return { internal, external, unresolved, unresolvedRefs };
}

/** Project cycles: absolute members → repo-relative POSIX paths. */
function cycleSummary(result: ScanResult): ScanSummary["cycles"] {
  return result.cycles.map((cycle) => ({
    size: cycle.members.length,
    members: cycle.members.map((m) => toRelative(result.rootPath, m)),
  }));
}

/** Compact form of a finding, preserving the risk signal. */
function compactFinding(f: Finding): ScanSummary["findings"][number] {
  return {
    ruleId: f.ruleId,
    severity: f.severity,
    category: f.category,
    location: f.location.path,
    title: f.title,
    measured: f.measured,
    threshold: f.threshold,
  };
}

/**
 * Highest-risk files by the core deterministic signals. Each list is selected
 * from the matching rule's findings, ordered by the metric the rule measured
 * (highest first, then path), and capped for transport.
 */
function fileSignals(result: ScanResult): ScanSummary["files"] {
  const findings = result.findings;

  const repeated = (ruleId: string): Array<{ path: string; value: number }> =>
    findings
      .filter((f) => f.ruleId === ruleId)
      .map((f) => ({ path: f.location.path, value: f.measured }))
      .sort((a, b) => b.value - a.value || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      .slice(0, TOP_FILES_LIMIT);

  const highComplexity = repeated("high-complexity").map((f) => ({
    path: f.path,
    complexity: f.value,
  }));
  const highChurn = repeated("high-churn").map((f) => ({
    path: f.path,
    churn: f.value,
  }));
  const highFanIn = repeated("high-fan-in").map((f) => ({
    path: f.path,
    fanIn: f.value,
  }));
  const highFanOut = repeated("high-fan-out").map((f) => ({
    path: f.path,
    fanOut: f.value,
  }));

  return { highComplexity, highChurn, highFanIn, highFanOut };
}

/** Bounded Git summary, or null when stats are absent (non-Git repo). */
function gitSummary(stats: RepoStats | null): ScanSummary["git"] {
  if (stats === null) {
    return null;
  }
  return {
    totalCommits: stats.totalCommits,
    totalContributors: stats.totalContributors,
    firstCommitDate: stats.firstCommitDate,
    lastCommitDate: stats.lastCommitDate,
    topChurnFiles: stats.fileChurn.slice(0, TOP_GIT_CHURN_LIMIT).map((f) => ({
      path: f.path,
      churn: f.churn,
    })),
    recentActivity: stats.recentActivity.map((c) => ({
      hash: c.hash,
      author: c.author,
      date: c.date,
      subject: c.subject,
    })),
  };
}

/** Project a full `ScanResult` into the compact `ScanSummary`. */
export function projectScanSummary(result: ScanResult): ScanSummary {
  return {
    schemaVersion: result.schemaVersion,
    rootPath: result.rootPath,
    scanTimestamp: result.scanTimestamp,
    durationMs: result.durationMs,
    counts: {
      files: result.files.length,
      modules: result.modules.length,
      byKind: byKindCounts(result),
      dependencies: result.dependencies.length,
      cycles: result.cycles.length,
      findings: result.findings.length,
      hotspots: result.hotspots.length,
    },
    languages: languageBreakdown(result),
    dependencies: dependencySummary(result),
    cycles: cycleSummary(result),
    hotspots: result.hotspots,
    findings: result.findings.map(compactFinding),
    files: fileSignals(result),
    git: gitSummary(result.stats),
  };
}

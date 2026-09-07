import { readFileSync } from "node:fs";
import type { ScanResult } from "./types/scan.js";
import type { FileInfo, FileKind } from "./types/file.js";
import type { Language } from "./types/language.js";
import type { Module, ModuleExport } from "./types/module.js";
import type { DependencyEdge, DependencyCycle } from "./types/dependency.js";
import type { Finding } from "./types/finding.js";
import type { Hotspot, RepoStats } from "./types/stats.js";
import { createScanner } from "./scanner/scanner.js";
import { createTypeScriptAnalyzer, type FileAnalysis } from "./analyzers/index.js";
import { buildDependencyGraph } from "./dependencies/graph.js";
import { analyzeGitRepository } from "./git/analysis.js";
import { runFindings } from "./findings/engine.js";
import type { FileCategory, ScannedFileMetadata } from "./scanner/results.js";
import { languageForPath } from "./utils/file.js";

/**
 * The analysis engine: a pure orchestrator that runs each deterministic stage
 * ONCE over a repository and aggregates everything into a canonical
 * `ScanResult`. This is the single source of truth that the CLI, future MCP,
 * and any consumer share. It never re-parses source, never rebuilds the graph,
 * and never re-runs Git.
 */

export interface EngineOptions {
  /** Number of recent commits to retain. Default 10. */
  readonly recentLimit?: number;
}

/** Map a scanner file category to a `FileKind`. */
function categoryToKind(category: FileCategory): FileKind {
  switch (category) {
    case "source":
      return "source";
    case "config":
      return "config";
    case "fixture":
      return "fixture";
    case "documentation":
      return "documentation";
    case "type-definition":
      return "type-definition";
    default:
      return "unknown";
  }
}

/** Project a scanned file into the `FileInfo` schema. */
function toFileInfo(meta: ScannedFileMetadata, codeLineCount: number): FileInfo {
  const language: Language | null = languageForPath(meta.path);
  return {
    path: meta.path,
    language,
    sizeBytes: meta.sizeBytes,
    lineCount: meta.lineCount,
    codeLineCount,
    isTest: meta.isTest,
    isConfig: meta.isConfig,
    kind: categoryToKind(meta.category),
  };
}

/** Project a `FileAnalysis` into a `Module`. */
function toModule(absPath: string, relPath: string, analysis: FileAnalysis): Module {
  return {
    id: absPath,
    path: relPath,
    exports: [...analysis.exports] as ModuleExport[],
  };
}

/**
 * Run the full deterministic pipeline for a repository and return a canonical
 * `ScanResult`. `scanTimestamp` records when the analysis ran (the single
 * time-varying field; all other data is fully deterministic for a fixed repo).
 * Git analysis is best-effort: a non-Git directory yields `stats: null`
 * rather than an error.
 */
export async function scanRepository(
  rootPath: string,
  options: EngineOptions = {},
): Promise<ScanResult> {
  const startedAt = Date.now();
  const recentLimit = options.recentLimit ?? 10;
  const scanner = createScanner();
  const scannerOut = await scanner.scan(rootPath);

  const discovery = scannerOut;

  // Analyze every source file (one parse pass).
  const analyzer = createTypeScriptAnalyzer();
  const analyses = new Map<string, FileAnalysis>();
  const modules: Module[] = [];
  for (const file of discovery.files) {
    if (!file.isSource) continue;
    try {
      const content = readFileSync(file.absolutePath, "utf8");
      const analysis = analyzer.analyzeFile(file.absolutePath, content);
      analyses.set(file.absolutePath, analysis);
      modules.push(toModule(file.absolutePath, file.path, analysis));
    } catch {
      // A single unparseable file must not abort the scan; it is skipped.
    }
  }
  modules.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  // Dependency graph (single pass, consumes analyses).
  const graph = buildDependencyGraph(discovery, analyses);

  // Git statistics (best-effort; non-Git → null).
  let stats: RepoStats | null = null;
  try {
    stats = await analyzeGitRepository(discovery.rootPath, { recentLimit });
  } catch {
    stats = null;
  }

  // Findings + hotspots (pure consumer of the above).
  const findingsResult = runFindings({ discovery, analyses, graph, stats });

  // Files (deterministic, POSIX path order). codeLineCount is approximated
  // by the scanner's line count (a second parse is deliberately avoided).
  const files: FileInfo[] = discovery.files.map((f) => toFileInfo(f, f.lineCount));
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const edges: DependencyEdge[] = [...graph.edges];
  const cycles: DependencyCycle[] = [...graph.cycles];
  const hotspots: Hotspot[] = [...findingsResult.hotspots];
  const findings: Finding[] = [...findingsResult.findings];

  const languages = new Set<Language>();
  for (const f of files) {
    if (f.language !== null) languages.add(f.language);
  }

  return {
    rootPath: discovery.rootPath,
    scanTimestamp: new Date().toISOString(),
    schemaVersion: 1,
    durationMs: Date.now() - startedAt,
    languages: [...languages],
    files,
    modules,
    dependencies: edges,
    cycles,
    stats,
    hotspots,
    findings,
  };
}

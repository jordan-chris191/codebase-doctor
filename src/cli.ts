#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { Command } from "commander";
import { createScanner } from "./scanner/scanner.js";
import { ScanError } from "./scanner/errors.js";
import { createTypeScriptAnalyzer, type FileAnalysis } from "./analyzers/index.js";
import { buildDependencyGraph } from "./dependencies/graph.js";
import { analyzeGitRepository } from "./git/analysis.js";
import { GitAnalysisError } from "./git/errors.js";
import { runFindings } from "./findings/engine.js";
import type { DiscoveryResult } from "./scanner/results.js";

/**
 * Run repository discovery against `path` (defaults to cwd), then print a
 * compact summary. Later phases will persist a full ScanResult; discovery
 * output is intentionally human-readable for now.
 */
async function scanCommand(pathValue?: string): Promise<void> {
  const targetPath = pathValue ?? process.cwd();
  const scanner = createScanner();
  try {
    const result: DiscoveryResult = await scanner.scan(targetPath);
    printScanSummary(result);
  } catch (err) {
    if (err instanceof ScanError) {
      // eslint-disable-next-line no-console
      console.error(`Error: ${err.message}`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }
}

function printScanSummary(result: DiscoveryResult): void {
  const kinds = new Map<string, number>();
  for (const f of result.files) {
    kinds.set(f.category, (kinds.get(f.category) ?? 0) + 1);
  }
  const kindsLine = [...kinds.entries()].map(([k, n]) => `${k}: ${n}`).join(", ");
  // eslint-disable-next-line no-console
  console.log(`Scanned ${result.rootPath}`);
  // eslint-disable-next-line no-console
  console.log(`  isGitRepository: ${result.isGitRepository}`);
  // eslint-disable-next-line no-console
  console.log(
    `  ${result.totals.totalFiles} files, ${result.totals.totalDirectories} dirs, ` +
      `(${kindsLine})`,
  );
  // eslint-disable-next-line no-console
  console.log(`  took ${result.durationMs}ms`);
  if (result.unreadable.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`  ${result.unreadable.length} file(s) unreadable`);
  }
}

/**
 * Run the full deterministic pipeline for a repository and emit findings +
 * hotspots. Reuses the scanner/analyzer/graph/git layers; no re-scanning.
 */
async function findingsCommand(
  pathValue: string | undefined,
  opts: { recent: string },
): Promise<void> {
  const targetPath = pathValue ?? process.cwd();
  const recentLimit = Number.parseInt(opts.recent, 10) || 10;
  const scanner = createScanner();
  const analyzer = createTypeScriptAnalyzer();
  try {
    const discovery = await scanner.scan(targetPath);

    // Analyze every source file.
    const analyses = new Map<string, FileAnalysis>();
    for (const file of discovery.files) {
      if (!file.isSource) continue;
      try {
        analyses.set(
          file.absolutePath,
          analyzer.analyzeFile(file.absolutePath, readFileSync(file.absolutePath, "utf8")),
        );
      } catch (err) {
        // A single unparseable file must not abort findings.
        if (err instanceof Error) {
          // eslint-disable-next-line no-console
          console.error(`Warning: skipping ${file.path}: ${err.message}`);
        }
      }
    }

    const graph = buildDependencyGraph(discovery, analyses);
    const stats = await analyzeGitRepository(targetPath, { recentLimit });
    const result = runFindings({ discovery, analyses, graph, stats });
    printFindings(result);
  } catch (err) {
    if (err instanceof ScanError || err instanceof GitAnalysisError) {
      // eslint-disable-next-line no-console
      console.error(`Error: ${err.message}`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }
}

function printFindings(result: Awaited<ReturnType<typeof runFindings>>): void {
  // eslint-disable-next-line no-console
  console.log(`Findings for ${result.rootPath}`);
  // eslint-disable-next-line no-console
  console.log(`  findings: ${result.findings.length}`);
  for (const f of result.findings.slice(0, 20)) {
    // eslint-disable-next-line no-console
    console.log(`    [${f.severity}] ${f.ruleId} ${f.location.path} (${f.description})`);
  }
  // eslint-disable-next-line no-console
  console.log(`  hotspots: ${result.hotspots.length}`);
  for (const h of result.hotspots.slice(0, 10)) {
    // eslint-disable-next-line no-console
    console.log(`    ${h.filePath} ranking=${h.ranking} signals=${JSON.stringify(h.signals)}`);
  }
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("codebase-doctor")
    .description("Structured architectural intelligence for repositories, exposed via MCP")
    .version("0.1.0");

  program
    .command("scan")
    .description("Analyze a repository and print a summary")
    .argument("[path]", "directory to scan (defaults to current working directory)")
    .action(scanCommand);

  program
    .command("git")
    .description("Analyze the Git history of a repository and print statistics")
    .argument("[path]", "directory to analyze (defaults to current working directory)")
    .option("--recent <n>", "number of recent commits to show (default 10)", "10")
    .action(async (pathValue: string | undefined, opts: { recent: string }) => {
      const targetPath = pathValue ?? process.cwd();
      const recentLimit = Number.parseInt(opts.recent, 10) || 10;
      try {
        const stats = await analyzeGitRepository(targetPath, { recentLimit });
        printGitStats(stats);
      } catch (err) {
        if (err instanceof GitAnalysisError) {
          // eslint-disable-next-line no-console
          console.error(`Error: ${err.message}`);
          process.exitCode = 1;
          return;
        }
        throw err;
      }
    });

  program
    .command("findings")
    .description("Run deterministic findings and hotspot analysis on a repository")
    .argument("[path]", "directory to analyze (defaults to current working directory)")
    .option("--recent <n>", "number of recent commits to consider (default 10)", "10")
    .action(findingsCommand);

  return program;
}

function printGitStats(stats: Awaited<ReturnType<typeof analyzeGitRepository>>): void {
  // eslint-disable-next-line no-console
  console.log("Git analysis");
  // eslint-disable-next-line no-console
  console.log(`  commits: ${stats.totalCommits}`);
  // eslint-disable-next-line no-console
  console.log(`  contributors: ${stats.totalContributors}`);
  // eslint-disable-next-line no-console
  console.log(`  first commit: ${stats.firstCommitDate ?? "(none)"}`);
  // eslint-disable-next-line no-console
  console.log(`  last commit: ${stats.lastCommitDate ?? "(none)"}`);
  if (stats.fileChurn.length > 0) {
    const top = stats.fileChurn
      .slice(0, 3)
      .map((f) => `${f.path} (${f.churn})`)
      .join(", ");
    // eslint-disable-next-line no-console
    console.log(`  top churn: ${top}`);
  }
  // eslint-disable-next-line no-console
  console.log(`  recent: ${stats.recentActivity.length} commit(s)`);
}

// Only auto-run when this module is the entry point (i.e. invoked as the
// CLI), so `buildProgram` stays importable and testable in isolation.
//
// The entry can reach us through a symlink (the npm `bin` shim), so the
// comparison resolves BOTH sides to their real path before comparing.
// Resolving also normalizes path separators, which keeps this correct on
// Windows (`\`) and POSIX (`/`) alike.
function isMainModule(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    const entryReal = realpathSync(entry);
    const selfReal = fileURLToPath(import.meta.url);
    return realpathSync(entryReal) === realpathSync(selfReal);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  buildProgram().parseAsync(process.argv);
}

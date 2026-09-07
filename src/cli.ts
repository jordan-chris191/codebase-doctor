#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { ScanError } from "./scanner/errors.js";
import { scanRepository } from "./engine.js";
import { analyzeGitRepository } from "./git/analysis.js";
import { GitAnalysisError } from "./git/errors.js";
import type { ScanResult } from "./types/scan.js";

/**
 * Run the full analysis pipeline against `path` and print the result.
 * `--json` prints the canonical `ScanResult` as stable JSON on stdout.
 * Presentation-only: all analysis logic lives in the engine.
 */
async function scanCommand(pathValue: string | undefined, opts: { json?: boolean }): Promise<void> {
  const targetPath = pathValue ?? process.cwd();
  try {
    const result = await scanRepository(targetPath);
    if (opts.json) {
      // JSON mode: stdout carries ONLY the deterministic JSON document.
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      return;
    }
    printScanReport(result);
  } catch (err) {
    if (err instanceof ScanError) {
      if (opts.json) {
        process.stdout.write(JSON.stringify({ error: { message: err.message } }) + "\n");
      } else {
        // eslint-disable-next-line no-console
        console.error(`Error: ${err.message}`);
      }
      process.exitCode = 1;
      return;
    }
    throw err;
  }
}

/** A concise human-readable repository overview. */
function printScanReport(result: ScanResult): void {
  // eslint-disable-next-line no-console
  console.log(`Repository`);
  // eslint-disable-next-line no-console
  console.log(`  root: ${result.rootPath}`);
  // eslint-disable-next-line no-console
  console.log(`  languages: ${result.languages.join(", ") || "(none)"}`);

  // eslint-disable-next-line no-console
  console.log(`Files`);
  // eslint-disable-next-line no-console
  console.log(`  ${result.files.length} file(s)`);
  const sourceCount = result.files.filter((f) => f.kind === "source").length;
  // eslint-disable-next-line no-console
  console.log(`  ${sourceCount} source file(s)`);

  // eslint-disable-next-line no-console
  console.log(`Code analysis`);
  const functions = result.modules.reduce((n, m) => n + exportsCount(m.exports), 0);
  // eslint-disable-next-line no-console
  console.log(`  ${result.modules.length} module(s)`);
  // eslint-disable-next-line no-console
  console.log(`  ${functions} exported symbol(s)`);

  // eslint-disable-next-line no-console
  console.log(`Dependencies`);
  // eslint-disable-next-line no-console
  console.log(`  ${result.dependencies.length} edge(s)`);
  // eslint-disable-next-line no-console
  console.log(`  ${result.cycles.length} cycle(s)`);

  // eslint-disable-next-line no-console
  console.log(`Git`);
  if (result.stats === null) {
    // eslint-disable-next-line no-console
    console.log(`  (not a Git repository)`);
  } else {
    // eslint-disable-next-line no-console
    console.log(
      `  ${result.stats.totalCommits} commit(s), ${result.stats.totalContributors} contributor(s)`,
    );
  }

  const bySeverity = new Map<string, number>();
  for (const f of result.findings) {
    bySeverity.set(f.severity, (bySeverity.get(f.severity) ?? 0) + 1);
  }
  const severityLine = [...bySeverity.entries()].map(([s, n]) => `${s}: ${n}`).join(", ");
  // eslint-disable-next-line no-console
  console.log(`Findings`);
  // eslint-disable-next-line no-console
  console.log(`  ${result.findings.length} finding(s)${severityLine ? ` (${severityLine})` : ""}`);
  // eslint-disable-next-line no-console
  console.log(`Hotspots`);
  // eslint-disable-next-line no-console
  console.log(`  ${result.hotspots.length} hotspot(s)`);

  // eslint-disable-next-line no-console
  console.log(`Completed in ${result.durationMs}ms (schema v${result.schemaVersion})`);
}

/** Count exported symbols across a module's export list. */
function exportsCount(exports: readonly { kind: string }[]): number {
  return exports.length;
}

/** Write a machine-readable Git-error to stderr (JSON mode). */
function writeJsonError(message: string): void {
  process.stdout.write(JSON.stringify({ error: { message } }) + "\n");
}

/**
 * Run the full deterministic pipeline once and print its findings + hotspots.
 * `--json` emits a stable machine-readable document on stdout.
 */
async function findingsCommand(
  pathValue: string | undefined,
  opts: { recent: string; json?: boolean },
): Promise<void> {
  const targetPath = pathValue ?? process.cwd();
  const recentLimit = Number.parseInt(opts.recent, 10) || 10;
  try {
    const result = await scanRepository(targetPath, { recentLimit });
    if (opts.json) {
      process.stdout.write(
        JSON.stringify({ findings: result.findings, hotspots: result.hotspots }, null, 2) + "\n",
      );
      return;
    }
    printFindings(result);
  } catch (err) {
    if (err instanceof ScanError || err instanceof GitAnalysisError) {
      if (opts.json) {
        writeJsonError(err.message);
      } else {
        // eslint-disable-next-line no-console
        console.error(`Error: ${err.message}`);
      }
      process.exitCode = 1;
      return;
    }
    throw err;
  }
}

function printFindings(result: ScanResult): void {
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
    .option("--json", "emit the canonical ScanResult as JSON on stdout")
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
    .option("--json", "emit findings+hotspots as JSON on stdout")
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

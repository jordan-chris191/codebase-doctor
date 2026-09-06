#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { createScanner } from "./scanner/scanner.js";
import { ScanError } from "./scanner/errors.js";
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

  return program;
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

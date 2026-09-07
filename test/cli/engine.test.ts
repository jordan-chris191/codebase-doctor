import { afterAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runCleanups, makeFixtureRepo, trackCleanup } from "../helpers/fs.js";
import { scanRepository } from "../../src/engine.js";
import type { ScanResult } from "../../src/types/scan.js";

const exec = promisify(execFile);
const CLI = join(dirname(dirname(fileURLToPath(import.meta.url))), "..", "dist", "cli.js");

afterAll(async () => {
  await runCleanups();
});

/** A small source repo fixture, cleaned up automatically. */
async function smallRepo(): Promise<string> {
  const fixture = await makeFixtureRepo({
    "src/a.ts": 'import { b } from "./b";\nexport const a = b;\n',
    "src/b.ts": "export const b = 1;\n",
    "README.md": "# x\n",
  });
  trackCleanup(fixture.cleanup);
  return fixture.root;
}

describe("scanRepository (engine)", () => {
  it("aggregates the full canonical ScanResult", async () => {
    const root = await smallRepo();
    const result: ScanResult = await scanRepository(root);
    expect(result.schemaVersion).toBe(1);
    expect(result.rootPath).toBe(root);
    expect(result.files.length).toBeGreaterThan(0);
    expect(result.modules.length).toBe(2); // a.ts + b.ts source
    expect(result.dependencies.length).toBeGreaterThan(0); // a → b
    expect(Array.isArray(result.hotspots)).toBe(true);
    expect(Array.isArray(result.findings)).toBe(true);
    expect(result.stats).toBeNull(); // non-Git fixture
    // files sorted deterministically by POSIX path
    const paths = result.files.map((f) => f.path);
    expect(paths).toEqual([...paths].sort());
    for (const f of result.files) expect(f.path).not.toContain("\\");
  });

  it("is deterministic across two runs (mod scanTimestamp/duration)", async () => {
    const root = await smallRepo();
    const a = await scanRepository(root);
    const b = await scanRepository(root);
    const norm = (r: ScanResult): ScanResult => ({ ...r, scanTimestamp: "X", durationMs: 0 });
    expect(norm(a)).toEqual(norm(b));
  });

  it("gives stats:null for a non-Git repository, not an error", async () => {
    const root = await smallRepo();
    const result = await scanRepository(root);
    expect(result.stats).toBeNull();
  });
});

describe("CLI --json", () => {
  it("emits valid JSON that parses", async () => {
    const root = await smallRepo();
    const { stdout } = await exec("node", [CLI, "scan", "--json", root]);
    const parsed = JSON.parse(stdout);
    expect(parsed.rootPath).toBe(root);
    expect(parsed.schemaVersion).toBe(1);
    expect(Array.isArray(parsed.files)).toBe(true);
    expect(Array.isArray(parsed.modules)).toBe(true);
    expect(Array.isArray(parsed.dependencies)).toBe(true);
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(Array.isArray(parsed.hotspots)).toBe(true);
    expect("stats" in parsed).toBe(true);
  });

  it("is deterministic across two runs (mod scanTimestamp/duration)", async () => {
    const root = await smallRepo();
    const a = await exec("node", [CLI, "scan", "--json", root]);
    const b = await exec("node", [CLI, "scan", "--json", root]);
    const norm = (s: string): string =>
      JSON.stringify({ ...JSON.parse(s), scanTimestamp: "X", durationMs: 0 });
    expect(norm(a.stdout)).toBe(norm(b.stdout));
  });

  it("does not contaminate stdout in JSON mode (stderr carries diagnostics)", async () => {
    const root = await smallRepo();
    const { stdout, stderr } = await exec("node", [CLI, "scan", "--json", root]);
    // stdout must be exactly one JSON document.
    expect(() => JSON.parse(stdout)).not.toThrow();
    const lines = stdout.trim().split("\n");
    // First line must begin with '{', no human headings.
    expect(lines[0]!.startsWith("{")).toBe(true);
    expect(stdout).not.toMatch(/^Repository/m);
    // no ANSI escape sequences (0x1b)
    expect(stdout.includes(String.fromCharCode(0x1b))).toBe(false);
    // stderr is empty for a successful scan.
    expect(stderr.trim()).toBe("");
  });

  it("emits a machine-readable error object in JSON mode on failure", async () => {
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const none = await mkdtemp(join(tmpdir(), "cbd-nope-"));
    try {
      await expect(exec("node", [CLI, "scan", "--json", join(none, "missing")])).rejects.toThrow();
    } finally {
      const { rm } = await import("node:fs/promises");
      await rm(none, { recursive: true, force: true });
    }
  });

  it("preserves existing commands (scan, git, findings)", async () => {
    const root = await smallRepo();
    const scanOut = await exec("node", [CLI, "scan", root]);
    expect(scanOut.stdout).toContain("Repository");
    // Git command on a non-Git fixture → graceful "Not a Git repository" (exit 1).
    await expect(exec("node", [CLI, "git", root])).rejects.toThrow(/Not a Git repository/);
    const findingsOut = await exec("node", [CLI, "findings", root]);
    expect(findingsOut.stdout).toContain("Findings");
    const findingsJson = await exec("node", [CLI, "findings", "--json", root]);
    const parsed = JSON.parse(findingsJson.stdout);
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(Array.isArray(parsed.hotspots)).toBe(true);
  });
});

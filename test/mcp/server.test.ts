import { afterAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { join } from "node:path";
import { runCleanups, makeFixtureRepo, trackCleanup } from "../helpers/fs.js";
import { trackedGitRepo } from "../git/helpers.js";
import { createMcpServer } from "../../src/mcp/server.js";
import { projectScanSummary } from "../../src/mcp/projection.js";
import { scanRepository } from "../../src/engine.js";

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

/** Wire up a client + server over an in-memory transport pair. */
async function connectClient(): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);
  return client;
}

/**
 * A richer fixture that deterministically triggers findings + a cycle:
 * - a dependency cycle (a → b → c → a)
 * - a high-complexity file (≥15 decision points)
 * - a high-fan-out hub file (≥20 distinct internal deps)
 * - several files with high fan-in (dependents of a shared module)
 * - unresolved references (missing relative import + bare package)
 */
async function richRepo(): Promise<string> {
  const files: Record<string, string> = {
    // Cycle.
    "src/a.ts": 'import { b } from "./b";\nexport const a = b;\n',
    "src/b.ts": 'import { c } from "./c";\nexport const b = c;\n',
    "src/c.ts": 'import { a } from "./a";\nexport const c = a;\n',
    // High complexity (15+ decision points).
    "src/complex.ts":
      "let n = 0;\n" +
      Array.from({ length: 16 }, (_, i) => `if (x${i}) n += ${i};\n`).join("") +
      "export { n };\n" +
      "declare const x0: boolean; declare const x1: boolean; declare const x2: boolean; declare const x3: boolean; declare const x4: boolean; declare const x5: boolean; declare const x6: boolean; declare const x7: boolean; declare const x8: boolean; declare const x9: boolean; declare const x10: boolean; declare const x11: boolean; declare const x12: boolean; declare const x13: boolean; declare const x14: boolean; declare const x15: boolean;\n",
    // Unresolved references (missing relative + bare package) and one genuine
    // external library (present in node_modules, resolved by TypeScript as a
    // package import → external classification).
    "src/unresolved.ts":
      'import missing from "./does-not-exist";\nimport pack from "some-package";\nimport React from "react";\nexport const unresolved = [missing, pack, React];\n',
    "node_modules/react/index.d.ts": "export = {};\n",
    // Fan-in hub: many files import hub.ts.
    "src/shared.ts": "export const shared = 1;\n",
  };
  // High fan-out hub importing 20 distinct internal modules. Also
  // high-complexity so it triggers ≥2 priority rules → a hotspot.
  files["src/hub.ts"] =
    Array.from({ length: 22 }, (_, i) => `import { m${i} } from "./lib/mod${i}";\n`).join("") +
    "let hubN = 0;\n" +
    Array.from({ length: 15 }, (_, i) => `if (hubCond${i}) hubN += ${i};\n`).join("") +
    "declare const hubCond0: boolean; declare const hubCond1: boolean; declare const hubCond2: boolean; declare const hubCond3: boolean; declare const hubCond4: boolean; declare const hubCond5: boolean; declare const hubCond6: boolean; declare const hubCond7: boolean; declare const hubCond8: boolean; declare const hubCond9: boolean; declare const hubCond10: boolean; declare const hubCond11: boolean; declare const hubCond12: boolean; declare const hubCond13: boolean; declare const hubCond14: boolean;\n" +
    "export const hub = [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11, m12, m13, m14, m15, m16, m17, m18, m19, m20, m21, hubN];\n";
  for (let i = 0; i < 22; i++) {
    files[`src/lib/mod${i}.ts`] = `export const m${i} = ${i};\n`;
  }
  // 12 files importing the shared hub (fan-in on src/shared.ts).
  for (let i = 0; i < 12; i++) {
    files[`src/use/shared${i}.ts`] =
      'import { shared } from "../shared";\nexport const s' + i + " = shared + " + i + ";\n";
  }
  const fixture = await makeFixtureRepo(files);
  trackCleanup(fixture.cleanup);
  return fixture.root;
}

/** A disposable Git repo with a couple of commits (for git-summary presence). */
async function gitRepo(): Promise<string> {
  const repo = await trackedGitRepo([
    {
      message: "init",
      steps: [{ type: "write", file: "src/gitA.ts", content: "export const a = 1;\n" }],
    },
    {
      message: "edit",
      steps: [{ type: "write", file: "src/gitB.ts", content: "export const b = 2;\n" }],
    },
  ]);
  return repo.root;
}

describe("MCP server (scan_repository)", () => {
  it("returns a compact ScanSummary for a valid rootPath", async () => {
    const root = await smallRepo();
    const client = await connectClient();
    const result = await client.callTool({
      name: "scan_repository",
      arguments: { rootPath: root },
    });
    expect(result.isError).toBeUndefined();
    // Tool content is the serialized compact ScanSummary.
    const text = result.content[0]?.type === "text" ? result.content[0].text : "";
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.rootPath).toBe(root);
    const counts = parsed.counts as { files?: number; modules?: number; dependencies?: number };
    expect(counts.files).toBeGreaterThan(0);
    expect(counts.modules).toBeGreaterThan(0);
    expect(counts.dependencies).toBeGreaterThan(0);
    expect(Array.isArray(parsed.cycles)).toBe(true);
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(Array.isArray(parsed.hotspots)).toBe(true);
    // The full per-item sections are NOT echoed into the tool response.
    expect(Array.isArray(parsed.files)).toBe(false);
    expect(Array.isArray(parsed.modules)).toBe(false);
    expect(Array.isArray(parsed.dependencies)).toBe(false);
  });

  it("returns a structured tool error for a nonexistent rootPath", async () => {
    const client = await connectClient();
    const missing = join(await smallRepo(), "does-not-exist");
    const result = await client.callTool({
      name: "scan_repository",
      arguments: { rootPath: missing },
    });
    expect(result.isError).toBe(true);
    const text = result.content[0]?.type === "text" ? result.content[0].text : "";
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    expect(parsed.error?.message).toMatch(/not found/i);
    // No fabricated ScanResult: an error envelope, not a result object.
    expect(parsed.error?.message).toBeDefined();
    expect("rootPath" in parsed).toBe(false);
  });

  it("returns a structured tool error when rootPath points at a file", async () => {
    const root = await smallRepo();
    const client = await connectClient();
    const result = await client.callTool({
      name: "scan_repository",
      arguments: { rootPath: join(root, "README.md") },
    });
    expect(result.isError).toBe(true);
    const text = result.content[0]?.type === "text" ? result.content[0].text : "";
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    expect(parsed.error?.message).toMatch(/not a directory/i);
  });

  it("derives the same repository counts as scanRepository() directly", async () => {
    const root = await smallRepo();
    const client = await connectClient();
    const toolResult = await client.callTool({
      name: "scan_repository",
      arguments: { rootPath: root },
    });
    const text = toolResult.content[0]?.type === "text" ? toolResult.content[0].text : "";
    const viaTool = JSON.parse(text) as {
      schemaVersion?: number;
      counts?: {
        files?: number;
        modules?: number;
        dependencies?: number;
        findings?: number;
        hotspots?: number;
      };
    };
    const direct = await scanRepository(root);
    expect(viaTool.schemaVersion).toBe(direct.schemaVersion);
    expect(viaTool.counts?.files).toBe(direct.files.length);
    expect(viaTool.counts?.modules).toBe(direct.modules.length);
    expect(viaTool.counts?.dependencies).toBe(direct.dependencies.length);
    expect(viaTool.counts?.findings).toBe(direct.findings.length);
    expect(viaTool.counts?.hotspots).toBe(direct.hotspots.length);
  });

  it("returns a compact summary with the expected field shapes on success", async () => {
    const root = await smallRepo();
    const client = await connectClient();
    const toolResult = await client.callTool({
      name: "scan_repository",
      arguments: { rootPath: root },
    });
    expect(toolResult.isError).toBeUndefined();
    const text = toolResult.content[0]?.type === "text" ? toolResult.content[0].text : "";
    const parsed = JSON.parse(text) as {
      schemaVersion?: number;
      scanTimestamp?: string;
      languages?: Array<{ language?: string; fileCount?: number }>;
      counts?: Record<string, number>;
      dependencies?: {
        internal?: number;
        external?: number;
        unresolved?: number;
        unresolvedRefs?: unknown[];
      };
      cycles?: unknown[];
      hotspots?: unknown[];
      findings?: unknown[];
      files?: Record<string, unknown[]>;
      git?: unknown;
    };
    expect(typeof parsed.schemaVersion).toBe("number");
    expect(typeof parsed.scanTimestamp).toBe("string");
    expect(Array.isArray(parsed.languages)).toBe(true);
    for (const l of parsed.languages ?? []) {
      expect(typeof l.language).toBe("string");
      expect(typeof l.fileCount).toBe("number");
    }
    expect(typeof parsed.counts?.files).toBe("number");
    expect(typeof parsed.counts?.modules).toBe("number");
    expect(typeof parsed.dependencies?.internal).toBe("number");
    expect(typeof parsed.dependencies?.external).toBe("number");
    expect(Array.isArray(parsed.cycles)).toBe(true);
    expect(Array.isArray(parsed.hotspots)).toBe(true);
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(parsed.files?.highComplexity).toBeDefined();
    // best-effort Git: a non-Git fixture yields null git, not an error.
    expect(parsed.git).toBeNull();
  });

  it("never throws from callTool when the engine fails", async () => {
    const client = await connectClient();
    // A path that cannot resolve to a directory.
    const bad = join(await smallRepo(), "missing-folder");
    let caught = false;
    try {
      const result = await client.callTool({
        name: "scan_repository",
        arguments: { rootPath: bad },
      });
      expect(result.isError).toBe(true);
    } catch {
      caught = true;
    }
    expect(caught).toBe(false);
  });

  it("returns a materially smaller response than the full ScanResult", async () => {
    const root = await richRepo();
    const result = await scanRepository(root);
    const summary = projectScanSummary(result);
    const fullSize = JSON.stringify(result).length;
    const summarySize = JSON.stringify(summary).length;
    // Dropping the per-item bulk (edges, exported symbols, per-file metadata)
    // must yield a substantially smaller payload — an order of magnitude or
    // more on this sizeable fixture.
    expect(summarySize).toBeLessThan(fullSize * 0.1);
    expect(summarySize).toBeLessThan(fullSize);
    // And the actual MCP tool response must reflect that reduction.
    const client = await connectClient();
    const toolResult = await client.callTool({
      name: "scan_repository",
      arguments: { rootPath: root },
    });
    const text = toolResult.content[0]?.type === "text" ? toolResult.content[0].text : "";
    // The MCP layer serializes the summary (a wrapper may add a few chars), so
    // assert it stays a small fraction of the full ScanResult rather than an
    // exact length match.
    expect(text.length).toBeLessThan(summarySize * 2 + 512);
    expect(text.length).toBeLessThan(fullSize * 0.1);
  });

  it("preserves important architectural signals in the summary", async () => {
    const root = await richRepo();
    const result = await scanRepository(root);
    const summary = projectScanSummary(result);

    // Counts reflect the canonical result.
    expect(summary.counts.files).toBe(result.files.length);
    expect(summary.counts.modules).toBe(result.modules.length);
    expect(summary.counts.dependencies).toBe(result.dependencies.length);
    expect(summary.counts.cycles).toBe(result.cycles.length);
    expect(summary.counts.findings).toBe(result.findings.length);
    expect(summary.counts.hotspots).toBe(result.hotspots.length);
    // Source/config/documentation/test counts derived from file kinds.
    expect(summary.counts.byKind.source).toBeGreaterThan(0);
    // The sum of all file kinds equals the total file count.
    const kindTotal = Object.values(summary.counts.byKind).reduce((a, b) => a + b, 0);
    expect(kindTotal).toBe(summary.counts.files);

    // Language breakdown is populated.
    expect(summary.languages.length).toBeGreaterThan(0);
    expect(summary.languages[0]!.fileCount).toBeGreaterThan(0);

    // Dependency totals classified; unresolved refs retained.
    expect(summary.dependencies.internal).toBeGreaterThan(0);
    expect(summary.dependencies.external).toBeGreaterThan(0);
    expect(summary.dependencies.unresolved).toBeGreaterThan(0);
    expect(summary.dependencies.unresolvedRefs.length).toBeGreaterThan(0);
    // Unresolved refs are repo-relative and deterministic.
    expect(summary.dependencies.unresolvedRefs[0]!.sourceFile).toMatch(/^src\//);
    expect(summary.dependencies.unresolvedRefs[0]!.specifier).toMatch(/./);
    expect(summary.dependencies.unresolvedRefs[0]!.importType).toMatch(
      /^(static|type-only|dynamic|commonjs|side-effect)$/,
    );

    // The cycle is present with repo-relative members.
    expect(summary.cycles.length).toBeGreaterThan(0);
    for (const cycle of summary.cycles) {
      expect(cycle.members.every((m) => m.startsWith("src/"))).toBe(true);
    }

    // Hotspots + findings present (findings are compact, not full objects).
    expect(summary.hotspots.length).toBeGreaterThan(0);
    expect(summary.findings.length).toBeGreaterThan(0);
    const first = summary.findings[0]!;
    expect(first.ruleId).toMatch(/./);
    expect(first.location.startsWith("src/")).toBe(true);
    expect(typeof first.measured).toBe("number");
    expect("description" in first).toBe(false);

    // High-risk file signals selected from findings.
    expect(summary.files.highComplexity.length).toBeGreaterThan(0);
    expect(summary.files.highComplexity[0]!.complexity).toBeGreaterThanOrEqual(15);
    expect(summary.files.highFanOut.length).toBeGreaterThan(0);
    expect(summary.files.highFanOut[0]!.fanOut).toBeGreaterThanOrEqual(20);
    expect(summary.files.highFanIn.length).toBeGreaterThan(0);
    // Top-N caps hold deterministically.
    for (const list of Object.values(summary.files)) {
      expect(list.length).toBeLessThanOrEqual(10);
    }
  });

  it("exposes a bounded Git summary when the root is a Git repository", async () => {
    const root = await gitRepo();
    const result = await scanRepository(root);
    const summary = projectScanSummary(result);
    expect(summary.git).not.toBeNull();
    expect(summary.git!.totalCommits).toBe(2);
    expect(summary.git!.totalContributors).toBe(1);
    expect(summary.git!.firstCommitDate).not.toBeNull();
    expect(summary.git!.lastCommitDate).not.toBeNull();
    expect(summary.git!.recentActivity.length).toBe(2);
    expect(summary.git!.recentActivity[0]!.subject).toMatch(/./);
    expect(Array.isArray(summary.git!.topChurnFiles)).toBe(true);
  });

  it("is deterministic: projecting the same ScanResult twice yields the same summary", async () => {
    const root = await richRepo();
    const result = await scanRepository(root);
    const once = JSON.stringify(projectScanSummary(result));
    const twice = JSON.stringify(projectScanSummary(result));
    expect(twice).toBe(once);
  });
});

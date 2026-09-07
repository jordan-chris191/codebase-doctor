import { afterAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { join } from "node:path";
import { runCleanups, makeFixtureRepo, trackCleanup } from "../helpers/fs.js";
import { createMcpServer } from "../../src/mcp/server.js";
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

describe("MCP server (scan_repository)", () => {
  it("returns a canonical ScanResult for a valid rootPath", async () => {
    const root = await smallRepo();
    const client = await connectClient();
    const result = await client.callTool({
      name: "scan_repository",
      arguments: { rootPath: root },
    });
    expect(result.isError).toBeUndefined();
    // Tool content is the serialized ScanResult.
    const text = result.content[0]?.type === "text" ? result.content[0].text : "";
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.rootPath).toBe(root);
    expect(Array.isArray(parsed.files)).toBe(true);
    expect(Array.isArray(parsed.modules)).toBe(true);
    expect(Array.isArray(parsed.dependencies)).toBe(true);
    expect(Array.isArray(parsed.cycles)).toBe(true);
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(Array.isArray(parsed.hotspots)).toBe(true);
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

  it("produces the same structure as scanRepository() directly", async () => {
    const root = await smallRepo();
    const client = await connectClient();
    const toolResult = await client.callTool({
      name: "scan_repository",
      arguments: { rootPath: root },
    });
    const text = toolResult.content[0]?.type === "text" ? toolResult.content[0].text : "";
    const viaTool = JSON.parse(text) as {
      schemaVersion?: number;
      rootPath?: string;
      files?: unknown[];
      modules?: unknown[];
      dependencies?: unknown[];
    };
    const direct = await scanRepository(root);
    expect(viaTool.schemaVersion).toBe(direct.schemaVersion);
    expect(viaTool.rootPath).toBe(direct.rootPath);
    expect(viaTool.files?.length).toBe(direct.files.length);
    expect(viaTool.modules?.length).toBe(direct.modules.length);
    expect(viaTool.dependencies?.length).toBe(direct.dependencies.length);
  });

  it("returns a ScanResult with the expected field shapes on success", async () => {
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
      languages?: unknown[];
      files?: Array<{ path?: string }>;
      stats?: unknown;
    };
    expect(typeof parsed.schemaVersion).toBe("number");
    expect(typeof parsed.scanTimestamp).toBe("string");
    expect(Array.isArray(parsed.languages)).toBe(true);
    for (const f of parsed.files ?? []) expect(typeof f.path).toBe("string");
    // best-effort Git: a non-Git fixture yields null stats, not an error.
    expect(parsed.stats).toBeNull();
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
});

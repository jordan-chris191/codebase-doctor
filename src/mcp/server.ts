/**
 * MCP server adapter for Codebase Doctor.
 *
 * A thin consumer over the deterministic analysis engine: it exposes the
 * canonical `scanRepository` → `ScanResult` pipeline as an MCP tool over
 * stdio, without re-implementing any scanning, AST, dependency, Git,
 * findings, or hotspot logic. This layer is presentation/transport only.
 */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { scanRepository } from "../engine.js";
import { PathIsFileError, PathNotFoundError } from "../scanner/errors.js";

/** Server identity reported during the MCP handshake. */
const SERVER_NAME = "codebase-doctor";

/** Server version reported during the MCP handshake. */
const SERVER_VERSION = "0.1.0";

/** Safely unwrap a human-readable message from an unknown thrown value. */
function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown error";
}

/** Map an engine/scanner failure to a clear, structured tool error message. */
function scanFailureMessage(err: unknown): string {
  if (err instanceof PathNotFoundError) {
    return `Directory not found: ${err.inputPath}`;
  }
  if (err instanceof PathIsFileError) {
    return `Not a directory (it is a file): ${err.resolvedPath}`;
  }
  return `Scan failed: ${toErrorMessage(err)}`;
}

/**
 * Create the MCP server exposing the `scan_repository` tool. Use
 * `startServer()` to attach it to stdio, or connect it to any other transport
 * (e.g. an in-memory transport in tests).
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  server.registerTool(
    "scan_repository",
    {
      description:
        "Deterministically analyze a repository and return the canonical ScanResult (structure, TS/JS analysis, dependency graph, Git stats, findings, hotspots).",
      inputSchema: {
        rootPath: z.string().describe("Absolute path to the repository root."),
      },
    },
    async ({ rootPath }) => {
      try {
        // Single engine call; the result is a plain serializable object.
        const result = await scanRepository(rootPath);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (err) {
        // Structured MCP tool error; never fabricate a ScanResult.
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: { message: scanFailureMessage(err) } }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  return server;
}

/**
 * Start the server on stdio. Reads MCP messages from stdin and writes
 * protocol responses to stdout; nothing else touches stdout so the channel
 * stays clean.
 */
export async function startServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only auto-start when this module is the entry point (i.e. invoked directly
// as `node dist/mcp/server.js`), so `createMcpServer`/`startServer` stay
// importable and testable in isolation.
//
// The entry can reach us through a symlink, so the comparison resolves BOTH
// sides to their real path before comparing. Resolving also normalizes path
// separators, keeping this correct on Windows (`\`) and POSIX (`/`).
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
  startServer();
}

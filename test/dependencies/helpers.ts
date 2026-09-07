import { readFileSync } from "node:fs";
import { createScanner } from "../../src/scanner/scanner.js";
import { createTypeScriptAnalyzer } from "../../src/analyzers/typescript.js";
import { buildDependencyGraph } from "../../src/dependencies/graph.js";
import type { DependencyGraph } from "../../src/types/dependency.js";
import { makeFixtureRepo, trackCleanup, type FixtureRepo } from "../helpers/fs.js";

/**
 * Build a dependency graph from an in-memory fixture repo: scan it, analyze
 * every source file, and build the Phase 1D graph. Returns the graph plus a
 * cleanup hook (fixtures are created in temp dirs and auto-cleaned).
 */
export async function fixtureGraph(files: Record<string, string>): Promise<{
  graph: DependencyGraph;
  root: string;
}> {
  const fixture: FixtureRepo = await makeFixtureRepo(files);
  trackCleanup(fixture.cleanup);

  const scanner = createScanner();
  const discovery = await scanner.scan(fixture.root);
  const analyzer = createTypeScriptAnalyzer();
  const analyses = new Map<string, ReturnType<typeof analyzer.analyzeFile>>();

  for (const file of discovery.files) {
    if (!file.isSource) continue;
    analyses.set(
      file.absolutePath,
      analyzer.analyzeFile(file.absolutePath, readFileSync(file.absolutePath, "utf8")),
    );
  }

  const graph = buildDependencyGraph(discovery, analyses);
  return { graph, root: fixture.root };
}

/** Convenience: strip an absolute path to a repo-relative POSIX path. */
export function rel(root: string, abs: string): string {
  return abs.replace(/\\/g, "/").replace(root.replace(/\\/g, "/"), "").replace(/^\/+/, "");
}

/** Find an edge by source/target basenames. */
export function edge(
  graph: DependencyGraph,
  sourceBase: string,
  targetBase: string,
): (typeof graph.edges)[number] | undefined {
  return graph.edges.find((e) => {
    const s = e.source.split(/[\\/]/).pop();
    const t = e.target.split(/[\\/]/).pop();
    return s === sourceBase && t === targetBase;
  });
}

/**
 * Compare whether two graphs are logically equal by mapping absolute paths to
 * repo-relative POSIX paths (different fixture temp dirs must be equivalent).
 */
export function logicalEquivalent(a: DependencyGraph, b: DependencyGraph): boolean {
  const relGraph = (g: DependencyGraph): object => ({
    nodes: g.nodes.map((n) => ({ path: n.path })).sort((x, y) => (x.path < y.path ? -1 : 1)),
    edges: g.edges
      .map((e) => ({
        src: rel(g.rootPath, e.source),
        tgt: e.kind === "internal" ? rel(g.rootPath, e.target) : e.target,
        kind: e.kind,
        type: e.type,
        weight: e.weight,
        spec: e.specifier,
      }))
      .sort((x, y) => (x.src < y.src ? -1 : x.src > y.src ? 1 : x.tgt < y.tgt ? -1 : 1)),
    cycles: g.cycles
      .map((c) =>
        c.members
          .map((m) => rel(g.rootPath, m))
          .sort()
          .join(","),
      )
      .sort(),
    unresolved: g.unresolved
      .map((u) => ({ src: rel(g.rootPath, u.sourceFile), spec: u.specifier }))
      .sort((x, y) => (x.src < y.src ? -1 : 1)),
  });
  return JSON.stringify(relGraph(a)) === JSON.stringify(relGraph(b));
}

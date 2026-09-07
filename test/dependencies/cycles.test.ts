import { describe, expect, it } from "vitest";
import { afterAll } from "vitest";
import { runCleanups } from "../helpers/fs.js";
import { detectCycles } from "../../src/dependencies/cycles.js";
import { fixtureGraph, rel } from "./helpers.js";
import type { DependencyGraph } from "../../src/types/dependency.js";

afterAll(async () => {
  await runCleanups();
});

describe("cycle detection", () => {
  it("detects a simple 2-node cycle once", async () => {
    const { graph, root } = await fixtureGraph({
      "a.ts": 'import { b } from "./b";\nexport const a = b;\n',
      "b.ts": 'import { a } from "./a";\nexport const b = a;\n',
    });
    expect(graph.cycles.length).toBe(1);
    const members = graph.cycles[0]!.members.map((m) => rel(root, m)).sort();
    expect(members).toEqual(["a.ts", "b.ts"]);
  });

  it("detects a longer multi-node cycle", async () => {
    const { graph, root } = await fixtureGraph({
      "a.ts": 'import { b } from "./b";\nexport const a = b;\n',
      "b.ts": 'import { c } from "./c";\nexport const b = c;\n',
      "c.ts": 'import { a } from "./a";\nexport const c = a;\n',
    });
    expect(graph.cycles.length).toBe(1);
    const members = graph.cycles[0]!.members.map((m) => rel(root, m)).sort();
    expect(members).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("detects multiple independent cycles without duplication", async () => {
    const { graph, root } = await fixtureGraph({
      // cycle 1: a ↔ b
      "a.ts": 'import { b } from "./b";\nexport const a = b;\n',
      "b.ts": 'import { a } from "./a";\nexport const b = a;\n',
      // cycle 2: x ↔ y
      "x.ts": 'import { y } from "./y";\nexport const x = y;\n',
      "y.ts": 'import { x } from "./x";\nexport const y = x;\n',
    });
    expect(graph.cycles.length).toBe(2);
    const cycleSets = graph.cycles.map((c) => c.members.map((m) => rel(root, m)).sort());
    expect(cycleSets).toContainEqual(["a.ts", "b.ts"]);
    expect(cycleSets).toContainEqual(["x.ts", "y.ts"]);
  });

  it("detects a self-cycle", async () => {
    const { graph, root } = await fixtureGraph({
      "self.ts": 'import { self } from "./self";\nexport const self = 1;\n',
    });
    expect(graph.cycles.length).toBe(1);
    expect(rel(root, graph.cycles[0]!.members[0]!)).toBe("self.ts");
  });

  it("does not report a non-cyclic graph", async () => {
    const { graph } = await fixtureGraph({
      "a.ts": 'import { b } from "./b";\nexport const a = b;\n',
      "b.ts": "export const b = 1;\n",
    });
    expect(graph.cycles).toEqual([]);
  });

  it("detectCycles handles self + internal edges deterministically", () => {
    // Direct unit test on the pure function (base-name nodes).
    const cycles = detectCycles(new Set(["a", "b"]), [
      { source: "a", target: "a" }, // self-loop
      { source: "a", target: "b" },
      { source: "b", target: "a" },
    ]);
    // a self-loops (cycle [a]) AND a↔b is a 2-cycle (cycle [a,b]).
    const sorted = cycles.map((c) => [...c.members].sort().join(",")).sort();
    expect(sorted).toEqual(["a", "a,b"]);
  });

  it("reports deterministic cycle order", async () => {
    const files = {
      "z.ts": 'import { a } from "./a";\nexport const z = a;\n',
      "a.ts": 'import { b } from "./b";\nexport const a = b;\n',
      "b.ts": 'import { z } from "./z";\nexport const b = z;\n',
    };
    const g1 = await fixtureGraph(files);
    const g2 = await fixtureGraph(files);
    // Compare cycle member sets relative to each root (temp dirs differ).
    const relSets = (g: DependencyGraph): string[] =>
      g.cycles
        .map((c) =>
          c.members
            .map((m) => rel(g.rootPath, m))
            .sort()
            .join(","),
        )
        .sort();
    expect(relSets(g1.graph)).toEqual(relSets(g2.graph));
    expect(g1.graph.cycles.map((c) => c.members.length).sort()).toEqual([3]);
  });
});

describe("graph integration with scanner+analyzer", () => {
  it("combines cycles and edges from real fixture repos", async () => {
    const { graph, root } = await fixtureGraph({
      "entries/entry.ts": 'import { a } from "../core/a";\nexport const entry = a;\n',
      "core/a.ts": 'import { b } from "./b";\nexport const a = b;\n',
      "core/b.ts": 'import { a } from "./a";\nexport const b = a;\n',
    });
    expect(graph.edges.length).toBeGreaterThan(0);
    expect(graph.cycles.length).toBe(1);
    const cyclePaths = graph.cycles[0]!.members.map((m) => rel(root, m)).sort();
    expect(cyclePaths).toEqual(["core/a.ts", "core/b.ts"]);
  });

  it("produces stable output on equivalent input", async () => {
    const files = {
      "a.ts": 'import { b } from "./b";\nexport const a = b;\n',
      "b.ts": 'import { c } from "./c";\nexport const b = c;\n',
      "c.ts": 'import { a } from "./a";\nexport const c = a;\n',
    };
    const g1 = await fixtureGraph(files);
    const g2 = await fixtureGraph(files);
    // Different fixture temp dirs → compare logically (relative paths).
    const relGraph = (graph: DependencyGraph): string =>
      JSON.stringify({
        cycles: graph.cycles
          .map((c) =>
            c.members
              .map((m) => rel(graph.rootPath, m))
              .sort()
              .join(","),
          )
          .sort(),
        edges: graph.edges.map((e) => e.specifier).sort(),
      });
    expect(relGraph(g1.graph)).toBe(relGraph(g2.graph));
    expect(g1.graph.cycles.length).toBe(1);
  });
});

describe("resolver-only behavior", () => {
  it("a classic diamond graph produces no false cycles and two d-edges", async () => {
    const { graph } = await fixtureGraph({
      "main.ts": 'import { b } from "./b";\nimport { c } from "./c";\nexport const m = [b, c];\n',
      "b.ts": 'import { d } from "./d";\nexport const b = d;\n',
      "c.ts": 'import { d } from "./d";\nexport const c = d;\n',
      "d.ts": "export const d = 1;\n",
    });
    expect(graph.cycles).toEqual([]);
    expect(graph.edges.filter((e) => e.target.endsWith("d.ts")).length).toBe(2);
  });
});

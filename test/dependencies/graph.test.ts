import { describe, expect, it } from "vitest";
import { afterAll } from "vitest";
import { runCleanups } from "../helpers/fs.js";
import { fixtureGraph, rel, edge, logicalEquivalent } from "./helpers.js";
import type { DependencyEdge } from "../../src/types/dependency.js";

afterAll(async () => {
  await runCleanups();
});

/** Compact edge projection for readable assertions. */
function shortEdges(graph: { edges: readonly DependencyEdge[] }): Array<{
  s: string;
  t: string;
  kind: string;
  type: string;
  weight: number;
  spec: string;
}> {
  return graph.edges.map((e) => ({
    s: e.source.split(/[\\/]/).pop() ?? e.source,
    t: e.kind !== "internal" ? e.target : (e.target.split(/[\\/]/).pop() ?? e.target),
    kind: e.kind,
    type: e.type,
    weight: e.weight,
    spec: e.specifier,
  }));
}

describe("dependency resolution", () => {
  it("resolves a basic relative dependency and classifies it internal", async () => {
    const { graph, root } = await fixtureGraph({
      "src/a.ts": 'import { b } from "./b";\nexport function a() { return b; }\n',
      "src/b.ts": "export const b = 1;\n",
    });
    const e = edge(graph, "a.ts", "b.ts");
    expect(e?.kind).toBe("internal");
    expect(e?.type).toBe("static");
    expect(e?.specifier).toBe("./b");
    expect(rel(root, e!.target)).toBe("src/b.ts");
  });

  it("resolves parent-relative dependencies", async () => {
    const { graph } = await fixtureGraph({
      "src/a.ts": 'import { b } from "../shared/b";\nexport const a = b;\n',
      "shared/b.ts": "export const b = 1;\n",
    });
    const e = edge(graph, "a.ts", "b.ts");
    expect(e?.kind).toBe("internal");
    expect(e?.specifier).toBe("../shared/b");
  });

  it("resolves extensionless imports to .ts", async () => {
    const { graph } = await fixtureGraph({
      "a.ts": 'import { b } from "./foo";\nexport const a = b;\n',
      "foo.ts": "export const b = 1;\n",
    });
    const e = edge(graph, "a.ts", "foo.ts");
    expect(e?.kind).toBe("internal");
    expect(e?.specifier).toBe("./foo");
  });

  it("resolves .js, .jsx, and .tsx imports", async () => {
    const { graph } = await fixtureGraph({
      "a.ts": 'import a from "./c";\nimport b from "./d";\nimport x from "./e";\n',
      "c.js": "module.exports = {};\n",
      "d.jsx": "export default {};\n",
      "e.tsx": "export default {};\n",
    });
    const s = shortEdges(graph);
    expect(s).toContainEqual({
      s: "a.ts",
      t: "c.js",
      kind: "internal",
      type: "static",
      weight: 1,
      spec: "./c",
    });
    expect(s).toContainEqual({
      s: "a.ts",
      t: "d.jsx",
      kind: "internal",
      type: "static",
      weight: 1,
      spec: "./d",
    });
    expect(s).toContainEqual({
      s: "a.ts",
      t: "e.tsx",
      kind: "internal",
      type: "static",
      weight: 1,
      spec: "./e",
    });
  });

  it("resolves directory/index imports", async () => {
    const { graph } = await fixtureGraph({
      "a.ts": 'import { foo } from "./foo";\nexport const a = foo;\n',
      "foo/index.ts": "export const foo = 1;\n",
    });
    const e = edge(graph, "a.ts", "index.ts");
    expect(e?.kind).toBe("internal");
  });

  it("classifies installed packages as external", async () => {
    const { graph } = await fixtureGraph({
      "a.ts": 'import React from "react";\nexport const App = React;\n',
      "node_modules/react/index.d.ts": "export = {};\n",
    });
    const e = edge(graph, "a.ts", "react");
    expect(e?.kind).toBe("external");
    expect(e?.target).toBe("react");
  });

  it("classifies scoped packages as external", async () => {
    const { graph } = await fixtureGraph({
      "a.ts": 'import x from "@scope/pkg";\nexport const v = x;\n',
      "node_modules/@scope/pkg/index.d.ts": "export = {};\n",
    });
    const e = edge(graph, "a.ts", "pkg");
    expect(e?.kind).toBe("external");
  });

  it("classifies CommonJS require of a relative file as internal", async () => {
    const { graph } = await fixtureGraph({
      "a.js": 'const b = require("./foo");\nmodule.exports = b;\n',
      "foo.js": "module.exports = {};\n",
    });
    const e = edge(graph, "a.js", "foo.js");
    expect(e?.kind).toBe("internal");
    expect(e?.type).toBe("commonjs");
  });

  it("classifies CommonJS require of a package as external", async () => {
    const { graph } = await fixtureGraph({
      "a.js": 'const pkg = require("left-pad");\nmodule.exports = pkg;\n',
      "node_modules/left-pad/index.js": "module.exports = {};\n",
    });
    const e = edge(graph, "a.js", "left-pad");
    expect(e?.kind).toBe("external");
    expect(e?.type).toBe("commonjs");
  });

  it("participates dynamic imports in the graph", async () => {
    const { graph } = await fixtureGraph({
      "a.ts": 'export async function load() { return await import("./mod"); }\n',
      "mod.ts": "export const m = 1;\n",
    });
    const e = edge(graph, "a.ts", "mod.ts");
    expect(e?.kind).toBe("internal");
    expect(e?.type).toBe("dynamic");
  });

  it("participates type-only imports as internal type-only edges", async () => {
    const { graph } = await fixtureGraph({
      "a.ts": 'import type { T } from "./types";\nexport const a: T = 1;\n',
      "types.ts": "export type T = number;\n",
    });
    const e = edge(graph, "a.ts", "types.ts");
    expect(e?.kind).toBe("internal");
    expect(e?.type).toBe("type-only");
  });

  it("represents re-exports as static edges to their source", async () => {
    const { graph } = await fixtureGraph({
      "index.ts": 'export { foo } from "./foo";\n',
      "foo.ts": "export const foo = 1;\n",
    });
    const e = edge(graph, "index.ts", "foo.ts");
    expect(e?.kind).toBe("internal");
    expect(e?.type).toBe("static");
    expect(e?.specifier).toBe("./foo");
  });

  it("represents export-star as a side-effect edge to its source", async () => {
    const { graph } = await fixtureGraph({
      "index.ts": 'export * from "./all";\n',
      "all.ts": "export const a = 1;\n",
    });
    const e = edge(graph, "index.ts", "all.ts");
    expect(e?.kind).toBe("internal");
    // `export * from` re-exports every symbol unnamed → side-effect.
    expect(e?.type).toBe("side-effect");
  });

  it("represents export-star-as-namespace as a static edge", async () => {
    const { graph } = await fixtureGraph({
      "index.ts": 'export * as ns from "./ns";\n',
      "ns.ts": "export const a = 1;\n",
    });
    const e = edge(graph, "index.ts", "ns.ts");
    expect(e?.kind).toBe("internal");
    expect(e?.type).toBe("static");
  });

  it("resolves TypeScript path aliases to internal files", async () => {
    const { graph } = await fixtureGraph({
      "src/a.ts": 'import { s } from "@/shared";\nexport const a = s;\n',
      "src/shared.ts": "export const s = 1;\n",
      "tsconfig.json": JSON.stringify({
        compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } },
      }),
    });
    const e = edge(graph, "a.ts", "shared.ts");
    expect(e?.kind).toBe("internal");
    expect(e?.specifier).toBe("@/shared");
  });

  it("keeps an unresolved relative import as unresolved", async () => {
    const { graph } = await fixtureGraph({
      "a.ts": 'import { x } from "./missing";\nexport const a = x;\n',
    });
    const e = edge(graph, "a.ts", "missing");
    expect(e?.kind).toBe("unresolved");
    expect(graph.unresolved).toContainEqual({
      sourceFile: expect.stringMatching(/a\.ts$/),
      specifier: "./missing",
      importType: "static",
    });
  });

  it("keeps an unresolved package reference as unresolved", async () => {
    const { graph } = await fixtureGraph({
      "a.ts": 'import x from "not-installed-pkg";\nexport const v = x;\n',
    });
    const e = edge(graph, "a.ts", "not-installed-pkg");
    expect(e?.kind).toBe("unresolved");
  });

  it("never lets an escaping path become an internal module", async () => {
    const { graph } = await fixtureGraph({
      "src/a.ts": 'import { up } from "../outside/up";\nexport const v = up;\n',
    });
    // Resolves outside the repo → external (or unresolved if not present).
    const e = edge(graph, "a.ts", "up");
    expect(["external", "unresolved"]).toContain(e?.kind);
  });

  it("collapses duplicate imports into a weighted edge", async () => {
    const { graph } = await fixtureGraph({
      "a.ts": 'import { x } from "./b";\nimport { y } from "./b";\nexport const v = [x, y];\n',
      "b.ts": "export const x = 1; export const y = 2;\n",
    });
    const e = edge(graph, "a.ts", "b.ts");
    expect(e?.weight).toBe(2);
  });

  it("produces deterministic, sorted edges and nodes", async () => {
    const files = {
      "b.ts": 'import { a } from "./a";\nexport const b = a;\n',
      "a.ts": "export const a = 1;\n",
      "c.ts": 'import { b } from "./b";\nexport const c = b;\n',
    };
    const g1 = await fixtureGraph(files);
    const g2 = await fixtureGraph(files);
    // Different fixture temp dirs → compare logically (relative paths).
    expect(logicalEquivalent(g1.graph, g2.graph)).toBe(true);
    // Nodes sorted by POSIX path.
    const paths = g1.graph.nodes.map((n) => n.path);
    expect(paths).toEqual([...paths].sort());
  });

  it("builds a mixed internal/external graph", async () => {
    const { graph } = await fixtureGraph({
      "app.ts":
        'import { local } from "./local";\nimport React from "react";\nexport const v = [local, React];\n',
      "local.ts": "export const local = 1;\n",
      "node_modules/react/index.d.ts": "export = {};\n",
    });
    expect(graph.edges.some((e) => e.kind === "internal")).toBe(true);
    expect(graph.edges.some((e) => e.kind === "external")).toBe(true);
  });

  it("handles nested repository structure", async () => {
    const { graph } = await fixtureGraph({
      "src/deep/nested/a.ts": 'import { z } from "../../shared/z";\nexport const v = z;\n',
      "src/shared/z.ts": "export const z = 1;\n",
    });
    const e = edge(graph, "a.ts", "z.ts");
    expect(e?.kind).toBe("internal");
    expect(e?.specifier).toBe("../../shared/z");
  });
});

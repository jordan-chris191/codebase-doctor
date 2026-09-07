import { describe, expect, it } from "vitest";
import { analyze } from "./helpers.js";

describe("language variants", () => {
  it("analyzes TypeScript", () => {
    const r = analyze("a.ts", "export function f(n: number): number { return n; }\n");
    expect(r.functions).toEqual(["f"]);
    expect(r.exports.map((e) => [e.name, e.kind])).toEqual([["f", "function"]]);
  });

  it("analyzes TSX and routes JSX + TS types", () => {
    const r = analyze(
      "c.tsx",
      'import { Button } from "./ui";\n' + "export const App = () => <Button>hi</Button>;\n",
    );
    expect(r.references).toContainEqual({
      source: "./ui",
      kind: "internal",
      imports: ["Button"],
      type: "static",
    });
    expect(r.exports.map((e) => [e.name, e.kind])).toEqual([["App", "constant"]]);
    expect(r.functions).toEqual([]);
  });

  it("analyzes plain JavaScript", () => {
    const r = analyze("a.js", "module.exports = { a: 1 };\nexport const b = 2;\n");
    // `module.exports` is an assignment, not a module reference.
    expect(r.references).toEqual([]);
    expect(r.exports.map((e) => [e.name, e.kind])).toEqual([["b", "constant"]]);
  });

  it("accepts CommonJS require in JavaScript", () => {
    const r = analyze("a.js", 'const fs = require("node:fs");\n');
    expect(r.references).toEqual([
      { source: "node:fs", kind: "internal", imports: [], type: "commonjs" },
    ]);
  });

  it("analyzes JSX and treats JSX elements as syntax, not refs", () => {
    const r = analyze("c.jsx", "export default function () { return <div>ok</div>; }\n");
    expect(r.exports).toHaveLength(1);
    expect(r.exports[0]?.name).toBe("(anonymous)");
    expect(r.exports[0]?.kind).toBe("function");
    expect(r.references).toEqual([]);
  });
});

describe("edge cases", () => {
  it("analyzes empty source", () => {
    const r = analyze("a.ts", "");
    expect(r).toMatchObject({
      filePath: "a.ts",
      exports: [],
      references: [],
      complexity: 1,
      functions: [],
      classes: [],
    });
    expect(typeof r.summary).toBe("string");
  });

  it("analyzes comments-only source", () => {
    const r = analyze("a.ts", "// hi\nthere\n");
    expect(r.exports).toEqual([]);
    expect(r.references).toEqual([]);
    expect(r.complexity).toBe(1);
  });

  it("throws FileParseError on syntax errors", () => {
    expect(() => analyze("a.ts", "const = ;\n")).toThrow(/Failed to parse a\.ts/);
  });

  it("throws on unsupported extensions before parsing", () => {
    expect(() => analyze("a.py", "def f(): pass\n")).toThrow(/Unsupported language/);
  });

  it("handles duplicate imports deterministically (dedup in names)", () => {
    const { references } = analyze(
      "a.ts",
      'import { a } from "./m";\nimport { a, b } from "./m";\n',
    );
    // Two import statements each yield a reference; names are per-statement.
    expect(references.map((r) => r.source)).toEqual(["./m", "./m"]);
    expect(references[0]?.imports).toEqual(["a"]);
    expect(references[1]?.imports).toEqual(["a", "b"]);
  });

  it("handles unusual but valid syntax without errors", () => {
    const { complexity, exports } = analyze(
      "a.ts",
      "const arrow = () => {};\nlet x = 1;\nvoid x;\n",
    );
    expect(complexity).toBeGreaterThanOrEqual(1);
    expect(exports).toEqual([]);
  });

  it("is fully deterministic on repeated analysis", () => {
    const content = "export function f() { if (a) { return 1; } return 2; }\n";
    const a1 = analyze("a.ts", content);
    const a2 = analyze("a.ts", content);
    expect(a1).toEqual(a2);
  });
});

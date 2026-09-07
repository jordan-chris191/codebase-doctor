import { describe, expect, it } from "vitest";
import { analyze } from "./helpers.js";

describe("import/reference extraction", () => {
  it("extracts default imports as static", () => {
    const { references } = analyze("a.ts", 'import foo from "./foo";\n');
    expect(references).toEqual([
      {
        source: "./foo",
        kind: "internal",
        imports: ["foo"],
        type: "static",
      },
    ]);
  });

  it("extracts named imports, including aliases, as static", () => {
    const { references } = analyze("a.ts", "import { bar, baz as qux } from './bar';\n");
    expect(references[0]?.imports).toEqual(["bar", "qux"]);
    expect(references[0]?.type).toBe("static");
  });

  it("extracts namespace imports as static", () => {
    const { references } = analyze("a.ts", 'import * as utils from "./utils";\n');
    expect(references).toEqual([
      { source: "./utils", kind: "internal", imports: [], type: "static" },
    ]);
  });

  it("extracts type-only imports", () => {
    const { references } = analyze("a.ts", 'import type { User } from "./types";\n');
    expect(references).toEqual([
      { source: "./types", kind: "internal", imports: ["User"], type: "type-only" },
    ]);
  });

  it("extracts side-effect imports", () => {
    const { references } = analyze("a.ts", 'import "./setup";\n');
    expect(references).toEqual([
      { source: "./setup", kind: "internal", imports: [], type: "side-effect" },
    ]);
  });

  it("extracts dynamic imports", () => {
    const { references } = analyze("a.ts", 'const d = await import("./dynamic");\n');
    expect(references).toEqual([
      { source: "./dynamic", kind: "internal", imports: [], type: "dynamic" },
    ]);
  });

  it("extracts CommonJS require() calls", () => {
    const { references } = analyze("a.js", 'const cjs = require("./common");\n');
    expect(references).toEqual([
      { source: "./common", kind: "internal", imports: [], type: "commonjs" },
    ]);
  });

  it("does not classify arbitrary function calls as CommonJS imports", () => {
    // `foo.require("./x")` is a member call, not Node's `require`.
    const { references } = analyze(
      "a.js",
      'const a = foo.require("./x");\nconst b = require(x);\nconst c = require();\n',
    );
    expect(references).toEqual([]);
  });

  it("extracts multiple distinct imports in order", () => {
    const { references } = analyze(
      "a.ts",
      'import a from "./a";\nimport { b } from "./b";\nimport "./c";\nconst d = import("./d");\nconst e = require("./e");\n',
    );
    expect(references.map((r) => [r.source, r.type])).toEqual([
      ["./a", "static"],
      ["./b", "static"],
      ["./c", "side-effect"],
      ["./d", "dynamic"],
      ["./e", "commonjs"],
    ]);
  });

  it("captures re-export sources as module references (side-effect)", () => {
    const { references } = analyze(
      "a.ts",
      'export { x } from "./m";\nexport type { Y } from "./t";\n',
    );
    expect(references).toEqual([
      { source: "./m", kind: "internal", imports: [], type: "side-effect" },
      { source: "./t", kind: "internal", imports: [], type: "type-only" },
    ]);
  });

  it("captures dynamic imports inside function bodies", () => {
    const { references } = analyze(
      "a.ts",
      'async function f() { const m = await import("./mod"); return m; }\n',
    );
    expect(references).toEqual([
      { source: "./mod", kind: "internal", imports: [], type: "dynamic" },
    ]);
  });

  it("captures import type edges", () => {
    const { references } = analyze("a.ts", 'interface Props { x: import("./types").X; }\n');
    expect(references).toEqual([
      { source: "./types", kind: "internal", imports: [], type: "dynamic" },
    ]);
  });
});

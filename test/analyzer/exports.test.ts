import { describe, expect, it } from "vitest";
import { analyze } from "./helpers.js";

/** Keys of `ModuleExport` that carry meaning for tests. */
type ExportRow = [
  name: string,
  kind: string,
  isDefault: boolean,
  isReExport: boolean,
  source: string | null,
];

/** Project comparison into a compact tuple for readable assertions. */
function expose(
  exports: {
    name: string;
    kind: string;
    isDefault: boolean;
    isReExport: boolean;
    source: string | null;
  }[],
): ExportRow[] {
  return exports.map((e) => [e.name, e.kind, e.isDefault, e.isReExport, e.source]);
}

describe("export extraction", () => {
  it("extracts exported functions", () => {
    const { exports } = analyze("a.ts", "export function foo() {}\n");
    expect(expose(exports)).toEqual([["foo", "function", false, false, null]]);
  });

  it("extracts exported classes", () => {
    const { exports } = analyze("a.ts", "export class Foo {}\n");
    expect(expose(exports)).toEqual([["Foo", "class", false, false, null]]);
  });

  it("extracts exported constants", () => {
    const { exports } = analyze("a.ts", "export const value = 1;\n");
    expect(expose(exports)).toEqual([["value", "constant", false, false, null]]);
  });

  it("extracts multiple constants from one declaration", () => {
    const { exports } = analyze("a.ts", "export const a = 1, b = 2;\n");
    expect(expose(exports)).toEqual([
      ["a", "constant", false, false, null],
      ["b", "constant", false, false, null],
    ]);
  });

  it("extracts exported type aliases", () => {
    const { exports } = analyze("a.ts", "export type User = { id: number };\n");
    expect(expose(exports)).toEqual([["User", "type", false, false, null]]);
  });

  it("extracts exported interfaces", () => {
    const { exports } = analyze("a.ts", "export interface I { a: 1 }\n");
    expect(expose(exports)).toEqual([["I", "interface", false, false, null]]);
  });

  it("extracts exported enums", () => {
    const { exports } = analyze("a.ts", "export enum Status { A, B }\n");
    expect(expose(exports)).toEqual([["Status", "enum", false, false, null]]);
  });

  it("extracts local named re-exports", () => {
    const { exports } = analyze("a.ts", "const foo = 1;\nexport { foo };\n");
    expect(expose(exports)).toEqual([["foo", "constant", false, false, null]]);
  });

  it("extracts aliased named re-exports", () => {
    const { exports } = analyze("a.ts", "const foo = 1;\nexport { foo as bar };\n");
    expect(expose(exports)).toEqual([["bar", "constant", false, false, null]]);
  });

  it("extracts type re-exports with their source", () => {
    const { exports } = analyze("a.ts", 'export type { User } from "./types";\n');
    expect(expose(exports)).toEqual([["User", "type", false, true, "./types"]]);
  });

  it("extracts re-exports from a module with their source", () => {
    const { exports } = analyze("a.ts", 'export { z } from "./z";\n');
    expect(expose(exports)).toEqual([["z", "constant", false, false, "./z"]]);
  });

  it("extracts namespace re-exports", () => {
    const { exports } = analyze("a.ts", 'export * as ns from "./mod";\n');
    expect(expose(exports)).toEqual([["ns", "namespace", false, false, "./mod"]]);
  });

  it("does not emit a name for `export * from` (reference only)", () => {
    const { exports } = analyze("a.ts", 'export * from "./mod";\n');
    expect(exports).toEqual([]);
  });

  it("extracts default function exports", () => {
    const { exports } = analyze("a.ts", "export default function fn() {}\n");
    expect(expose(exports)).toEqual([["fn", "function", true, false, null]]);
  });

  it("extracts anonymous default function exports with a placeholder", () => {
    const { exports } = analyze("a.ts", "export default function () {}\n");
    expect(expose(exports)).toEqual([["(anonymous)", "function", true, false, null]]);
  });

  it("extracts anonymous default class exports", () => {
    const { exports } = analyze("a.ts", "export default class { m() {} }\n");
    expect(expose(exports)).toEqual([["(anonymous)", "class", true, false, null]]);
  });

  it("extracts default identifier exports with the identifier name", () => {
    const { exports } = analyze("a.ts", "const x = 1; export default x;\n");
    expect(expose(exports)).toEqual([["x", "constant", true, false, null]]);
  });

  it("extracts default arrow-function exports as functions", () => {
    const { exports } = analyze("a.ts", "export default () => 42;\n");
    expect(expose(exports)).toEqual([["(anonymous)", "function", true, false, null]]);
  });

  it("combines default + named exports and only marks the default one", () => {
    const { exports } = analyze(
      "a.ts",
      "const fn = 1;\nexport default fn;\nexport function other() {}\n",
    );
    const def = exports.find((e) => e.isDefault);
    expect(def?.name).toBe("fn");
    expect(def?.kind).toBe("constant");
    expect(exports.filter((e) => !e.isDefault).map((e) => e.name)).toEqual(["other"]);
  });
});

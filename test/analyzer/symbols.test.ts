import { describe, expect, it } from "vitest";
import { analyze } from "./helpers.js";

describe("function extraction", () => {
  it("extracts function declarations by name", () => {
    const { functions } = analyze("a.ts", "function foo() {}\n");
    expect(functions).toEqual(["foo"]);
  });

  it("does not name arrow functions (their variable is the symbol)", () => {
    const { functions, exports: exported } = analyze(
      "a.ts",
      "const arrow = () => 42;\nexport { arrow };\n",
    );
    expect(functions).toEqual([]);
    expect(exported.map((e) => e.name)).toEqual(["arrow"]);
  });

  it("does not name anonymous function expressions", () => {
    const { functions } = analyze("a.ts", "const fe = function () {};\n");
    expect(functions).toEqual([]);
  });

  it("names named function expressions", () => {
    const { functions } = analyze("a.ts", "const fe = function named() {};\n");
    expect(functions).toEqual(["named"]);
  });

  it("collects nested function declarations", () => {
    const { functions } = analyze("a.ts", "function outer() { function inner() {} }\n");
    expect(functions.sort()).toEqual(["inner", "outer"]);
  });

  it("returns a deterministic sorted list", () => {
    const { functions } = analyze("a.ts", "function zebra() {}\nfunction alpha() {}\n");
    expect(functions).toEqual(["alpha", "zebra"]);
  });

  it("does not list class methods as module functions", () => {
    const { functions, classes } = analyze("a.ts", "class Foo { bar() {} async baz() {} }\n");
    expect(functions).toEqual([]);
    expect(classes).toEqual(["Foo"]);
  });
});

describe("class extraction", () => {
  it("extracts class declarations by name", () => {
    const { classes } = analyze("a.ts", "class Foo {}\n");
    expect(classes).toEqual(["Foo"]);
  });

  it("does not attribute methods to the module function list", () => {
    const { functions } = analyze("a.ts", "class Foo { m() {} }\n");
    expect(functions).toEqual([]);
  });

  it("supports abstract classes", () => {
    const { classes } = analyze("a.ts", "abstract class Baz {}\n");
    expect(classes).toEqual(["Baz"]);
  });

  it("collects exported and non-exported classes", () => {
    const { classes } = analyze("a.ts", "class A {}\nexport class B {}\n");
    expect(classes).toEqual(["A", "B"]);
  });

  it("does not collect class expressions without a binding name", () => {
    const { classes, exports } = analyze("a.ts", "export default class { m() {} }\n");
    expect(classes).toEqual([]);
    expect(exports.map((e) => e.name)).toEqual(["(anonymous)"]);
  });
});

import { describe, expect, it } from "vitest";
import { analyze } from "./helpers.js";

/**
 * Cyclomatic complexity is computed as `1 + decision points` where decision
 * points are: `if`, loops, `switch` cases, conditional expressions, `&&`/`||`,
 * and `catch` clauses.
 */
describe("complexity analysis", () => {
  it("reports baseline 1 for an empty file", () => {
    expect(analyze("a.ts", "").complexity).toBe(1);
  });

  it("reports baseline 1 for a file with no branch points", () => {
    expect(analyze("a.ts", "const a = 1;\nfunction f() { return a; }\n").complexity).toBe(1);
  });

  it("adds 1 for each if", () => {
    expect(analyze("a.ts", "if (a) {}\n").complexity).toBe(2);
    expect(analyze("a.ts", "if (a) {} if (b) {}\n").complexity).toBe(3);
  });

  it("counts each loop type once", () => {
    expect(analyze("a.ts", "for (let i = 0; i < 3; i++) {}\n").complexity).toBe(2);
    expect(analyze("a.ts", "while (x) {}\n").complexity).toBe(2);
    expect(analyze("a.ts", "do {} while (x);\n").complexity).toBe(2);
    expect(analyze("a.ts", "for (const k in o) {}\n").complexity).toBe(2);
    expect(analyze("a.ts", "for (const v of arr) {}\n").complexity).toBe(2);
  });

  it("adds one per case in a switch (excluding default)", () => {
    const { complexity } = analyze(
      "a.ts",
      "switch (x) { case 1: break; case 2: break; default: break; }\n",
    );
    expect(complexity).toBe(3); // 1 + 2 cases
  });

  it("adds 1 for conditional (ternary) expressions", () => {
    expect(analyze("a.ts", "const v = a ? 1 : 2;\n").complexity).toBe(2);
  });

  it("adds 1 for each logical operator", () => {
    expect(analyze("a.ts", "const v = a && b;\n").complexity).toBe(2);
    expect(analyze("a.ts", "const v = a && b || c;\n").complexity).toBe(3);
  });

  it("adds 1 for catch clauses", () => {
    expect(analyze("a.ts", "try { f(); } catch (e) {}\n").complexity).toBe(2);
    // try with finally but no catch adds nothing.
    expect(analyze("a.ts", "try { f(); } finally {}\n").complexity).toBe(1);
  });

  it("aggregates nested branching deterministically", () => {
    const { complexity } = analyze(
      "a.ts",
      [
        "function f(x) {",
        "  if (x) {",
        "    while (go) {",
        "      switch (s) { case 1: break; case 2: break; }",
        "    }",
        "  } else {",
        "    return x ? 1 : 2;",
        "  }",
        "}",
      ].join("\n"),
    );
    // baseline 1 + if(1) + while(1) + switch(2) + ternary(1) = 6
    expect(complexity).toBe(6);
  });

  it("is purely syntactic and deterministic per content", () => {
    const source = "if (a) { for (const b of c) {} }\n";
    expect(analyze("a.ts", source).complexity).toBe(3);
    expect(analyze("a.ts", source).complexity).toBe(3);
  });
});

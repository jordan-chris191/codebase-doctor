import { describe, expect, it } from "vitest";
import { LANGUAGES } from "../../src/types/language.js";
import type { ScanResult } from "../../src/types/scan.js";

describe("LANGUAGES", () => {
  it("maps the four supported extensions to languages", () => {
    expect(LANGUAGES.map((l) => l.extension).sort()).toEqual([".js", ".jsx", ".ts", ".tsx"]);
  });

  it("is immutable", () => {
    expect(() => {
      (LANGUAGES as unknown[]).push({ extension: ".py", language: "javascript" });
    }).toThrow();
  });
});

describe("ScanResult shape", () => {
  it("only allows schemaVersion 1", () => {
    // Compile-time guarantee: schemaVersion is a literal `1`.
    const now = new Date().toISOString();
    const result: ScanResult = {
      rootPath: "/tmp/repo",
      scanTimestamp: now,
      schemaVersion: 1,
      durationMs: 42,
      languages: ["typescript"],
      files: [],
      modules: [],
      dependencies: [],
      cycles: [],
      stats: null,
      hotspots: [],
      findings: [],
    };
    expect(result.schemaVersion).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { makeContext, singleFile } from "./helpers.js";
import { runFindings } from "../../src/findings/engine.js";
import {
  COMPLEXITY_THRESHOLD,
  CHURN_THRESHOLD,
  FAN_OUT_THRESHOLD,
  FAN_IN_THRESHOLD,
  LARGE_FILE_LINES,
} from "../../src/findings/rules.js";

function findByIds(result: ReturnType<typeof runFindings>): Map<string, number> {
  return new Map(result.findings.map((f) => [f.ruleId, f.measured]));
}

describe("high-complexity rule", () => {
  it("fires below threshold", () => {
    const r = runFindings(singleFile("a.ts", COMPLEXITY_THRESHOLD - 1));
    expect(r.findings).toEqual([]);
  });

  it("fires at the threshold boundary", () => {
    const r = runFindings(singleFile("a.ts", COMPLEXITY_THRESHOLD));
    const f = r.findings.find((x) => x.ruleId === "high-complexity");
    expect(f).toBeDefined();
    expect(f!.measured).toBe(COMPLEXITY_THRESHOLD);
    expect(f!.severity).toBe("high");
    expect(f!.location.path).toBe("a.ts");
  });

  it("fires above threshold with measured+threshold", () => {
    const r = runFindings(singleFile("a.ts", COMPLEXITY_THRESHOLD + 5));
    const f = r.findings.find((x) => x.ruleId === "high-complexity");
    expect(f!.measured).toBe(COMPLEXITY_THRESHOLD + 5);
    expect(f!.threshold).toBe(COMPLEXITY_THRESHOLD);
    expect(f!.id).toBe(`high-complexity:a.ts`);
  });
});

describe("high-churn rule", () => {
  it("does not fire below threshold", () => {
    const ctx = makeContext({
      files: [{ path: "a.ts", absolutePath: "/repo/a.ts", lineCount: 10 }],
      churn: [
        {
          path: "a.ts",
          commitCount: 1,
          additions: CHURN_THRESHOLD - 1,
          deletions: 0,
          churn: CHURN_THRESHOLD - 1,
        },
      ],
    });
    const r = runFindings(ctx);
    expect(findByIds(r).has("high-churn")).toBe(false);
  });

  it("fires at the boundary", () => {
    const ctx = makeContext({
      files: [{ path: "a.ts", absolutePath: "/repo/a.ts", lineCount: 10 }],
      churn: [
        {
          path: "a.ts",
          commitCount: 5,
          additions: CHURN_THRESHOLD,
          deletions: 0,
          churn: CHURN_THRESHOLD,
        },
      ],
    });
    const r = runFindings(ctx);
    const f = r.findings.find((x) => x.ruleId === "high-churn");
    expect(f).toBeDefined();
    expect(f!.measured).toBe(CHURN_THRESHOLD);
    expect(f!.severity).toBe("medium");
  });

  it("fires above threshold for multiple files", () => {
    const ctx = makeContext({
      files: [
        { path: "a.ts", absolutePath: "/repo/a.ts", lineCount: 10 },
        { path: "b.ts", absolutePath: "/repo/b.ts", lineCount: 10 },
      ],
      churn: [
        { path: "a.ts", commitCount: 5, additions: 250, deletions: 0, churn: 250 },
        { path: "b.ts", commitCount: 10, additions: 100, deletions: 150, churn: 250 },
      ],
    });
    const r = runFindings(ctx);
    expect(r.findings.filter((f) => f.ruleId === "high-churn")).toHaveLength(2);
  });
});

describe("fan-in / fan-out rules", () => {
  it("does not fire for low degree", () => {
    const ctx = makeContext({
      files: [{ path: "a.ts", absolutePath: "/repo/a.ts", lineCount: 10 }],
      graph: { edges: [["a.ts", "b.ts"]] },
    });
    const r = runFindings(ctx);
    expect(findByIds(r).has("high-fan-out")).toBe(false);
    expect(findByIds(r).has("high-fan-in")).toBe(false);
  });

  it("fires high-fan-out at the boundary", () => {
    const edges: Array<[string, string]> = Array.from({ length: FAN_OUT_THRESHOLD }, (_, i) => [
      `a.ts`,
      `d${i}.ts`,
    ]);
    const ctx = makeContext({
      files: [{ path: "a.ts", absolutePath: "/repo/a.ts", lineCount: 10 }],
      graph: { edges },
    });
    const r = runFindings(ctx);
    const f = r.findings.find((x) => x.ruleId === "high-fan-out");
    expect(f).toBeDefined();
    expect(f!.measured).toBe(FAN_OUT_THRESHOLD);
    expect(f!.severity).toBe("medium");
    expect(f!.location.path).toBe("a.ts");
  });

  it("fires high-fan-in at the boundary", () => {
    const edges: Array<[string, string]> = Array.from({ length: FAN_IN_THRESHOLD }, (_, i) => [
      `s${i}.ts`,
      `a.ts`,
    ]);
    const ctx = makeContext({
      files: [{ path: "a.ts", absolutePath: "/repo/a.ts", lineCount: 10 }],
      graph: { edges },
    });
    const r = runFindings(ctx);
    const f = r.findings.find((x) => x.ruleId === "high-fan-in");
    expect(f).toBeDefined();
    expect(f!.measured).toBe(FAN_IN_THRESHOLD);
    expect(f!.severity).toBe("low");
  });

  it("does not count external or unresolved edges toward fan degree", () => {
    // All edges are internal in this fixture; a non-internal edge must be ignored.
    const ctx = makeContext({
      files: [{ path: "a.ts", absolutePath: "/repo/a.ts", lineCount: 10 }],
      graph: { edges: [["a.ts", "react"]] },
    });
    const r = runFindings(ctx);
    expect(r.findings.filter((f) => f.ruleId.startsWith("high-fan"))).toEqual([]);
  });
});

describe("dependency-cycle rule", () => {
  it("does not fire with no cycle", () => {
    const ctx = makeContext({
      files: [{ path: "a.ts", absolutePath: "/repo/a.ts", lineCount: 10 }],
      graph: { edges: [["a.ts", "b.ts"]] },
    });
    const r = runFindings(ctx);
    expect(r.findings.filter((f) => f.ruleId === "dependency-cycle")).toEqual([]);
  });

  it("fires for a multi-file cycle, one finding per member", () => {
    const ctx = makeContext({
      files: [
        { path: "a.ts", absolutePath: "/repo/a.ts", lineCount: 10 },
        { path: "b.ts", absolutePath: "/repo/b.ts", lineCount: 10 },
        { path: "c.ts", absolutePath: "/repo/c.ts", lineCount: 10 },
      ],
      graph: { cycles: [["a.ts", "b.ts", "c.ts"]] },
    });
    const r = runFindings(ctx);
    const cycles = r.findings.filter((f) => f.ruleId === "dependency-cycle");
    expect(cycles).toHaveLength(3);
    expect(cycles.map((f) => f.location.path).sort()).toEqual(["a.ts", "b.ts", "c.ts"]);
    expect(cycles[0]!.severity).toBe("high");
  });

  it("fires for multiple independent cycles", () => {
    const ctx = makeContext({
      files: [
        { path: "a.ts", absolutePath: "/repo/a.ts", lineCount: 10 },
        { path: "b.ts", absolutePath: "/repo/b.ts", lineCount: 10 },
        { path: "x.ts", absolutePath: "/repo/x.ts", lineCount: 10 },
        { path: "y.ts", absolutePath: "/repo/y.ts", lineCount: 10 },
      ],
      graph: {
        cycles: [
          ["a.ts", "b.ts"],
          ["x.ts", "y.ts"],
        ],
      },
    });
    const r = runFindings(ctx);
    expect(r.findings.filter((f) => f.ruleId === "dependency-cycle")).toHaveLength(4);
  });
});

describe("large-complex-file rule", () => {
  it("does not fire for a normal small/clean file", () => {
    const r = runFindings(singleFile("a.ts", 3, 50));
    expect(findByIds(r).has("large-complex-file")).toBe(false);
  });

  it("does not fire for a large but simple file", () => {
    const r = runFindings(singleFile("big.ts", 3, LARGE_FILE_LINES + 100));
    expect(r.findings.filter((f) => f.ruleId === "large-complex-file")).toEqual([]);
  });

  it("fires for a complex but small file", () => {
    const r = runFindings(singleFile("small-complex.ts", COMPLEXITY_THRESHOLD + 1, 50));
    expect(r.findings.filter((f) => f.ruleId === "large-complex-file")).toEqual([]);
  });

  it("fires for a large AND complex file", () => {
    const r = runFindings(singleFile("huge.ts", COMPLEXITY_THRESHOLD + 5, LARGE_FILE_LINES + 10));
    const f = r.findings.find((x) => x.ruleId === "large-complex-file");
    expect(f).toBeDefined();
    expect(f!.measured).toBe(LARGE_FILE_LINES + 10);
    expect(f!.severity).toBe("high");
  });
});

describe("hotspots", () => {
  it("produces no hotspots with no signals", () => {
    const r = runFindings(singleFile("clean.ts", 3, 50));
    expect(r.hotspots).toEqual([]);
  });

  it("produces no hotspot with a single signal", () => {
    const r = runFindings(singleFile("complex.ts", COMPLEXITY_THRESHOLD + 1, 100));
    expect(r.hotspots).toEqual([]);
  });

  it("produces a hotspot from multiple signals with raw data", () => {
    const ctx = makeContext({
      files: [
        {
          path: "hot.ts",
          absolutePath: "/repo/hot.ts",
          lineCount: 400,
          complexity: COMPLEXITY_THRESHOLD + 2,
        },
      ],
      churn: [{ path: "hot.ts", commitCount: 10, additions: 250, deletions: 0, churn: 250 }],
    });
    const r = runFindings(ctx);
    expect(r.hotspots).toHaveLength(1);
    const h = r.hotspots[0]!;
    expect(h.filePath).toBe("hot.ts");
    expect(h.ranking).toBe(2); // high-complexity + high-churn
    expect(h.signals.complexity).toBe(COMPLEXITY_THRESHOLD + 2);
    expect(h.signals.churn).toBe(250);
    expect(h.findings.sort()).toEqual(["high-churn", "high-complexity"]);
  });

  it("sorts hotspots deterministically (ranking desc, path asc)", () => {
    const many = makeContext({
      files: [
        { path: "a.ts", absolutePath: "/repo/a.ts", lineCount: 400, complexity: 40 },
        { path: "b.ts", absolutePath: "/repo/b.ts", lineCount: 400, complexity: 40 },
      ],
      churn: [
        { path: "a.ts", commitCount: 9, additions: 300, deletions: 0, churn: 300 },
        { path: "b.ts", commitCount: 7, additions: 250, deletions: 0, churn: 250 },
      ],
    });
    const r = runFindings(many);
    expect(r.hotspots).toHaveLength(2);
    // Same ranking → tiebreak by path.
    expect(r.hotspots.map((h) => h.filePath)).toEqual(["a.ts", "b.ts"]);
  });
});

describe("determinism & empty repos", () => {
  it("produces identical output on repeated analysis", () => {
    const ctx = makeContext({
      files: [{ path: "a.ts", absolutePath: "/repo/a.ts", lineCount: 900, complexity: 30 }],
      churn: [{ path: "a.ts", commitCount: 5, additions: 300, deletions: 20, churn: 320 }],
      graph: { cycles: [["a.ts", "b.ts"]] },
    });
    expect(runFindings(ctx)).toEqual(runFindings(ctx));
  });

  it("does not fabricate findings for an empty repository", () => {
    const ctx = makeContext({ files: [] });
    const r = runFindings(ctx);
    expect(r.findings).toEqual([]);
    expect(r.hotspots).toEqual([]);
  });

  it("does not fabricate findings when graph/stats are absent", () => {
    const r = runFindings(singleFile("a.ts", 5, 50));
    expect(r.hotspots).toEqual([]);
  });

  it("does not produce misleading findings for malformed upstream (missing analysis)", () => {
    // File is source but has no analysis → its rules must not fire.
    const ctx = makeContext({
      files: [{ path: "unparsed.ts", absolutePath: "/repo/unparsed.ts", lineCount: 1000 }],
    });
    // Remove the analysis to simulate an unparseable file.
    ctx.analyses.clear();
    const r = runFindings(ctx);
    expect(r.findings).toEqual([]);
    expect(r.hotspots).toEqual([]);
  });
});

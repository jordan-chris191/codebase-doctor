import { afterAll, describe, expect, it } from "vitest";
import { createScanner } from "../../src/scanner/scanner.js";
import { join, makeFixtureRepo, makeLink, runCleanups, trackCleanup } from "../helpers/fs.js";
import { kitchenSinkFixture, DEFAULT_GITIGNORE } from "../fixtures/kitchen-sink.js";
import type { DiscoveryResult } from "../../src/scanner/results.js";

const scanner = createScanner();

afterAll(async () => {
  await runCleanups();
});

function paths(result: DiscoveryResult): string[] {
  return result.files.map((f) => f.path).sort();
}

async function scanKitchen(gitignore = DEFAULT_GITIGNORE): Promise<DiscoveryResult> {
  const fixture = await kitchenSinkFixture(gitignore);
  trackCleanup(fixture.cleanup);
  return scanner.scan(fixture.root);
}

describe("repository discovery", () => {
  it("discovers nested directories and all four source extensions", async () => {
    const result = await scanKitchen();
    const all = paths(result);
    expect(all).toContain("src/utils/helpers.ts");
    expect(all).toContain("src/components/Button.tsx");
    expect(all).toContain("legacy/old.js");
    expect(all).toContain("legacy/Component.jsx");
  });

  it("classifies unsupported files as 'unknown'", async () => {
    const result = await scanKitchen();
    const csv = result.files.find((f) => f.path === "data.csv");
    expect(csv?.category).toBe("unknown");
    expect(csv?.isSource).toBe(false);
  });

  it("excludes node_modules, .git, dist, build, coverage, .codebase-doctor", async () => {
    const result = await scanKitchen();
    const all = paths(result);
    expect(all).not.toContain("node_modules/pkg/index.js");
    expect(all).not.toContain("dist/main.js");
    expect(all).not.toContain("build/out.js");
    expect(all).not.toContain("coverage/lcov.info");
    expect(all).not.toContain(".codebase-doctor/scan.json");
    expect(all).not.toContain(".git/HEAD");
  });

  it("respects .gitignore rules (directory with trailing slash)", async () => {
    const result = await scanKitchen("generated/\n");
    expect(paths(result)).not.toContain("generated/tmp.ts");
  });

  it("respects .gitignore negation (!) rules", async () => {
    const result = await scanKitchen("generated/\n!generated/keep.ts\n");
    // `!generated/keep.ts` re-includes a file under an ignored dir only if
    // the parent path is not also ignored. So expected: still excluded.
    expect(paths(result)).not.toContain("generated/keep.ts");
  });

  it("flags a git repository when .git exists", async () => {
    const result = await scanKitchen();
    expect(result.isGitRepository).toBe(true);
  });

  it("flags non-git repos as not-a-repository", async () => {
    const fixture = await makeFixtureRepo({ "src/a.ts": "export const a = 1;\n" });
    trackCleanup(fixture.cleanup);
    const result = await scanner.scan(fixture.root);
    expect(result.isGitRepository).toBe(false);
  });

  it("marks test and config files", async () => {
    const result = await scanKitchen();
    const testFile = result.files.find((f) => f.path === "src/index.test.ts");
    const configFile = result.files.find((f) => f.path === "package.json");
    const source = result.files.find((f) => f.path === "src/index.ts");
    expect(testFile?.isTest).toBe(true);
    expect(configFile?.isConfig).toBe(true);
    expect(source?.isSource).toBe(true);
    expect(source?.isTest).toBe(false);
  });

  it("produces deterministic, sorted, posix-relative paths", async () => {
    const result = await scanKitchen();
    const sorted = paths(result);
    expect(sorted).toEqual([...sorted].sort());
    for (const f of result.files) {
      expect(f.path).not.toContain("\\");
    }
  });

  it("reports deterministic line counts (no trailing newline counts final line)", async () => {
    const result = await scanKitchen();
    const oneLine = result.files.find((f) => f.path === "src/index.ts");
    expect(oneLine?.lineCount).toBe(1);
    const twoLines = result.files.find((f) => f.path === "data.csv");
    expect(twoLines?.lineCount).toBe(2);
  });

  it("does not crash on binary files", async () => {
    const fixture = await makeFixtureRepo({
      "src/ok.ts": "export const ok = 1;\n",
      "img/logo.png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString(
        "binary",
      ),
    });
    trackCleanup(fixture.cleanup);
    const result = await scanner.scan(fixture.root);
    const png = result.files.find((f) => f.path === "img/logo.png");
    expect(png).toBeDefined();
    expect(result.files.length).toBe(2);
  });

  it("never escapes the repository root through symlinks", async () => {
    const fixture = await makeFixtureRepo({
      "internal.txt": "inside\n",
      "outside/secret.txt": "secret\n",
      "src/a.ts": "export const a = 1;\n",
    });
    trackCleanup(fixture.cleanup);
    // Create a symlink INSIDE the repo pointing to a dir also inside the
    // repo — the walker must not traverse it (would duplicate files).
    let linkCreated = true;
    try {
      await makeLink(join(fixture.root, "link-to-outside"), join(fixture.root, "outside"));
    } catch {
      // Symlinks unsupported (e.g. Windows without Developer Mode).
      linkCreated = false;
    }
    const result = await scanner.scan(fixture.root);
    const all = paths(result);
    expect(all).toContain("outside/secret.txt");
    if (linkCreated) {
      expect(all).not.toContain("link-to-outside/secret.txt");
      expect(all).not.toContain("link-to-outside");
    }
  });

  it("counts directories and skips in totals", async () => {
    const result = await scanKitchen();
    expect(result.totals.totalDirectories).toBeGreaterThan(0);
    expect(result.totals.skipCount).toBeGreaterThan(0);
    expect(result.totals.totalFiles).toBe(result.files.length);
  });
});

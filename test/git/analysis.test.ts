import { afterAll, describe, expect, it } from "vitest";
import { runCleanups } from "../helpers/fs.js";
import { analyzeGitRepository } from "../../src/git/analysis.js";
import { NotAGitRepositoryError } from "../../src/git/errors.js";
import { trackedGitRepo } from "./helpers.js";

afterAll(async () => {
  await runCleanups();
});

describe("Git analysis", () => {
  it("analyzes a normal multi-commit repository", async () => {
    const repo = await trackedGitRepo([
      {
        message: "init",
        steps: [{ type: "write", file: "a.ts", content: "export const a = 1;\n" }],
      },
      {
        message: "add b",
        steps: [{ type: "write", file: "b.ts", content: "export const b = 2;\n" }],
      },
      {
        message: "edit a",
        steps: [{ type: "write", file: "a.ts", content: "export const a = 3;\n" }],
      },
    ]);
    const stats = await analyzeGitRepository(repo.root);
    expect(stats.totalCommits).toBe(3);
    expect(stats.totalContributors).toBe(1);
    expect(stats.firstCommitDate).not.toBeNull();
    expect(stats.lastCommitDate).not.toBeNull();
    expect(stats.recentActivity).toHaveLength(3);
    expect(stats.recentActivity[0]!.subject).toBe("edit a");
    expect(stats.recentActivity[0]!.hash).toMatch(/^[0-9a-f]{40}$/);
  });

  it("handles a single-commit repository", async () => {
    const repo = await trackedGitRepo([
      {
        message: "only",
        steps: [{ type: "write", file: "x.ts", content: "export const x = 1;\n" }],
      },
    ]);
    const stats = await analyzeGitRepository(repo.root);
    expect(stats.totalCommits).toBe(1);
    expect(stats.recentActivity).toHaveLength(1);
    expect(stats.firstCommitDate).toBe(stats.lastCommitDate);
  });

  it("handles an empty Git repository (no commits)", async () => {
    const repo = await trackedGitRepo([]);
    const stats = await analyzeGitRepository(repo.root);
    expect(stats.totalCommits).toBe(0);
    expect(stats.totalContributors).toBe(0);
    expect(stats.firstCommitDate).toBeNull();
    expect(stats.lastCommitDate).toBeNull();
    expect(stats.filesByChurn).toEqual([]);
    expect(stats.fileChurn).toEqual([]);
    expect(stats.contributors).toEqual([]);
    expect(stats.recentActivity).toEqual([]);
  });

  it("detects a non-Git directory as NotAGitRepositoryError", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = await mkdtemp(join(tmpdir(), "cbd-nongit-"));
    try {
      await expect(analyzeGitRepository(dir)).rejects.toBeInstanceOf(NotAGitRepositoryError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("counts multiple contributors with deterministic ordering", async () => {
    const repo = await trackedGitRepo([
      {
        message: "alice 1",
        author: { name: "Alice", email: "alice@x" },
        steps: [{ type: "write", file: "a.ts", content: "// a\n" }],
      },
      {
        message: "bob 1",
        author: { name: "Bob", email: "bob@x" },
        steps: [{ type: "write", file: "b.ts", content: "// b\n" }],
      },
      {
        message: "alice 2",
        author: { name: "Alice", email: "alice@x" },
        steps: [{ type: "write", file: "a.ts", content: "// a2\n" }],
      },
    ]);
    const stats = await analyzeGitRepository(repo.root);
    expect(stats.totalContributors).toBe(2);
    expect(stats.contributors[0]).toMatchObject({
      name: "Alice",
      email: "alice@x",
      commitCount: 2,
    });
    expect(stats.contributors[1]).toMatchObject({ name: "Bob", email: "bob@x", commitCount: 1 });
  });

  it("tracks file additions, modifications, and deletions", async () => {
    const repo = await trackedGitRepo([
      { message: "add a", steps: [{ type: "write", file: "a.ts", content: "1\n" }] },
      { message: "add b", steps: [{ type: "write", file: "b.ts", content: "2\n" }] },
      { message: "modify a", steps: [{ type: "write", file: "a.ts", content: "1\n2\n" }] },
      { message: "delete b", steps: [{ type: "remove", file: "b.ts" }] },
    ]);
    const stats = await analyzeGitRepository(repo.root);
    const a = stats.fileChurn.find((f) => f.path.endsWith("a.ts"));
    // Deleted file b.ts retains its historical churn: add (1/0) + remove (0/1).
    const b = stats.fileChurn.find((f) => f.path.endsWith("b.ts"));
    expect(a).toBeDefined();
    expect(a!.commitCount).toBe(2); // add + modify
    expect(a!.additions).toBeGreaterThan(0);
    expect(a!.deletions).toBe(0);
    expect(b).toBeDefined();
    expect(b!.commitCount).toBe(2); // add + delete
    expect(b!.deletions).toBeGreaterThan(0);
    expect(stats.totalCommits).toBe(4);
  });

  it("counts multiple files changed in one commit", async () => {
    const repo = await trackedGitRepo([
      {
        message: "batch",
        steps: [
          { type: "write", file: "p.ts", content: "// p\n" },
          { type: "write", file: "q.ts", content: "// q\n" },
          { type: "write", file: "r.ts", content: "// r\n" },
        ],
      },
    ]);
    const stats = await analyzeGitRepository(repo.root);
    expect(stats.fileChurn).toHaveLength(3);
    expect(stats.totalCommits).toBe(1);
  });

  it("attributes a rename to the post-rename path (documented policy)", async () => {
    // Rename via git mv in a commit; the analyzer attributes churn to the new path.
    const repo = await trackedGitRepo([
      { message: "create old", steps: [{ type: "write", file: "old.ts", content: "// old\n" }] },
      {
        message: "rename to new",
        steps: [{ type: "git", args: ["mv", "old.ts", "new.ts"] }],
      },
    ]);
    const stats = await analyzeGitRepository(repo.root);
    const oldEntry = stats.fileChurn.find((f) => f.path.endsWith("old.ts"));
    const newEntry = stats.fileChurn.find((f) => f.path.endsWith("new.ts"));
    // Rename policy: the post-rename path (new.ts) receives the rename churn.
    // The pre-rename path keeps only its OWN prior non-rename edits (creation).
    expect(newEntry).toBeDefined();
    expect(newEntry!.commitCount).toBe(1);
    expect(oldEntry).toBeDefined();
    expect(oldEntry!.commitCount).toBe(1); // the earlier create-old commit
  });

  it("orders recent activity newest-first and honors the limit", async () => {
    const repo = await trackedGitRepo([
      { message: "c1", steps: [{ type: "write", file: "a.ts", content: "1\n" }] },
      { message: "c2", steps: [{ type: "write", file: "b.ts", content: "2\n" }] },
      { message: "c3", steps: [{ type: "write", file: "c.ts", content: "3\n" }] },
    ]);
    const stats = await analyzeGitRepository(repo.root, { recentLimit: 2 });
    expect(stats.recentActivity).toHaveLength(2);
    expect(stats.recentActivity[0]!.subject).toBe("c3");
    expect(stats.recentActivity[1]!.subject).toBe("c2");
  });

  it("produces deterministic output on repeated analysis", async () => {
    const repo = await trackedGitRepo([
      { message: "x", steps: [{ type: "write", file: "a.ts", content: "a\n" }] },
      { message: "y", steps: [{ type: "write", file: "b.ts", content: "b\nb\n" }] },
      { message: "z", steps: [{ type: "write", file: "a.ts", content: "a\na\n" }] },
    ]);
    const s1 = await analyzeGitRepository(repo.root);
    const s2 = await analyzeGitRepository(repo.root);
    expect(s1).toEqual(s2);
  });

  it("normalizes POSIX paths even when git reports Windows-style", async () => {
    const repo = await trackedGitRepo([
      { message: "m", steps: [{ type: "write", file: "dir/file.ts", content: "// f\n" }] },
    ]);
    const stats = await analyzeGitRepository(repo.root);
    const entry = stats.fileChurn[0]!;
    expect(entry.path).toContain("/");
    expect(entry.path).not.toContain("\\");
  });

  it("records binary-file churn (commitCount only)", async () => {
    const repo = await trackedGitRepo([
      {
        message: "binary",
        steps: [{ type: "writeBinary", file: "img.bin", bytes: [0x00, 0x01, 0x02] }],
      },
    ]);
    const stats = await analyzeGitRepository(repo.root);
    const bin = stats.fileChurn.find((f) => f.path.endsWith("img.bin"));
    expect(bin).toBeDefined();
    expect(bin!.commitCount).toBe(1);
    expect(bin!.additions).toBe(0);
    expect(bin!.deletions).toBe(0);
    expect(bin!.churn).toBe(0);
  });

  it("counts merge commits in totals but not churn contributors (documented policy)", async () => {
    // Build a real divergent merge via raw git steps inside the fixture:
    //   c1 (base.ts)            -- master
    //   c2 (master-only.ts)     -- master
    //   branch feat at c1 + c3 (feat-only.ts)
    //   merge feat into master  -> merge commit (c4)
    const repo = await trackedGitRepo([
      { message: "c1 base", steps: [{ type: "write", file: "base.ts", content: "// base\n" }] },
      {
        message: "c2 master-only",
        steps: [{ type: "write", file: "master.ts", content: "// m\n" }],
      },
    ]);
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);
    await run("git", ["checkout", "-b", "feat", "HEAD~1"], { cwd: repo.root }); // feat from c1
    const { writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const featFile = join(repo.root, "feat.ts");
    await run("mkdir", ["-p", join(repo.root)]);
    await writeFile(featFile, "// feat\n", "utf8");
    await run("git", ["add", "feat.ts"], { cwd: repo.root });
    await run(
      "git",
      [
        "-c",
        "user.name=Test User",
        "-c",
        "user.email=test@example.com",
        "commit",
        "--date",
        new Date(Date.UTC(2020, 0, 4)).toISOString(),
        "-m",
        "c3 feat",
      ],
      { cwd: repo.root },
    );
    // c4 merge back into master
    await run("git", ["checkout", "master"], { cwd: repo.root });
    await run(
      "git",
      [
        "-c",
        "user.name=Test User",
        "-c",
        "user.email=test@example.com",
        "merge",
        "--no-ff",
        "feat",
        "-m",
        "c4 merge",
      ],
      { cwd: repo.root },
    );

    const stats = await analyzeGitRepository(repo.root);
    // c1 + c2 + c3 + merge(c4) = 4 total commits; churn counts non-merge only.
    expect(stats.totalCommits).toBe(4);
    // feat.ts has 1 (its only authored change); base.ts has 1; master.ts has 1.
    expect(stats.fileChurn.every((f) => f.commitCount <= 1)).toBe(true);
    expect(stats.totalContributors).toBe(1);
  });
});

import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { promisify } from "node:util";
import { trackCleanup } from "../helpers/fs.js";

const execFileAsync = promisify(execFile);

/** A disposable Git repository fixture with a cleanup hook. */
export interface GitFixtureRepo {
  root: string;
  cleanup(): Promise<void>;
}

const DAY = 86_400_000;

/** One step inside a fixture commit. */
export type GitStep =
  | { type: "write"; file: string; content: string }
  | { type: "writeBinary"; file: string; bytes: number[] }
  | { type: "remove"; file: string }
  /** Run a raw git subcommand inside the fixture (e.g. merge). */
  | { type: "git"; args: string[] };

export interface GitCommitSpec {
  message: string;
  author?: { name: string; email: string };
  date?: number;
  steps: GitStep[];
}

/** Run git in the fixture; returns stdout (trimmed). Throws on failure. */
async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: root });
  return stdout.trim();
}

/**
 * Build a throwaway Git repository. Commits are applied in order. Each step:
 * - `write` / `writeBinary`: create/overwrite a file (parent dirs created).
 * - `remove`: `git rm --quiet` the file.
 * - `git`: run a raw git subcommand (e.g. `["merge", "--no-ff", ...]`).
 *
 * Local identity is configured at init; per-commit `author` overrides it.
 * Dates default to a deterministic 2020-01-01-based sequence (no wall-clock).
 */
export async function makeGitRepo(commits: GitCommitSpec[]): Promise<GitFixtureRepo> {
  const root = await mkdtemp(join(tmpdir(), "cbd-git-"));
  await git(root, ["init", "-q"]);
  await git(root, ["config", "user.name", "Test User"]);
  await git(root, ["config", "user.email", "test@example.com"]);

  for (let i = 0; i < commits.length; i++) {
    const c = commits[i]!;
    const date = c.date ?? Date.UTC(2020, 0, 1) + i * DAY;
    const name = c.author?.name ?? "Test User";
    const email = c.author?.email ?? "test@example.com";

    for (const step of c.steps) {
      if (step.type === "write") {
        const abs = join(root, step.file);
        await execFileAsync("mkdir", ["-p", dirname(abs)]);
        await writeFile(abs, step.content, "utf8");
      } else if (step.type === "writeBinary") {
        const abs = join(root, step.file);
        await execFileAsync("mkdir", ["-p", dirname(abs)]);
        await writeFile(abs, Buffer.from(step.bytes));
      } else if (step.type === "remove") {
        await git(root, ["rm", "--quiet", step.file]);
      } else {
        await git(root, step.args);
      }
    }

    // Stage any file changes made in this commit.
    const staged = await git(root, ["status", "--porcelain"]);
    if (staged !== "") {
      await git(root, ["add", "-A"]);
    }
    // `git -c user.name=... -c user.email=... commit --date <iso> -m <msg>`
    await git(root, [
      "-c",
      `user.name=${name}`,
      "-c",
      `user.email=${email}`,
      "commit",
      "--date",
      new Date(date).toISOString(),
      "-m",
      c.message,
    ]);
  }

  return {
    root,
    cleanup: async (): Promise<void> => {
      await rm(root, { recursive: true, force: true });
    },
  };
}

/** Convenience: build a repo, register cleanup, and return it. */
export async function trackedGitRepo(commits: GitCommitSpec[]): Promise<GitFixtureRepo> {
  const repo = await makeGitRepo(commits);
  trackCleanup(repo.cleanup);
  return repo;
}

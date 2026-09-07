import { resolve, normalize } from "node:path";
import type { GitContributor, GitFileChurn, GitRecentCommit, RepoStats } from "../types/stats.js";
import { toPosixPath } from "../utils/path.js";
import { runGit } from "./git.js";
import { NotAGitRepositoryError, GitCommandError } from "./errors.js";

/**
 * Deterministic Git analysis for Phase 1E.
 *
 * Collects repository-level Git facts from a small number of batch `git`
 * commands. Everything is derived directly from `git` output (never AI/heuristics).
 *
 * Policies:
 * - `totalCommits` includes all commits (merges included).
 * - `contributors`, `fileChurn`, `recentActivity` are computed from non-merge
 *   commits (`--no-merges`). A merge is not an authored file edit.
 * - Renames: git `--numstat` reports `0 0 old => new`; churn is attributed to
 *   the post-rename (`new`) path; the pre-rename name gets no separate row.
 * - Recent activity is bounded by `recentLimit` (default 10), newest-first.
 */

/** Options for Git analysis. */
export interface GitAnalysisOptions {
  /** Number of recent commits to retain. Default 10. */
  readonly recentLimit?: number;
  /** Revision to analyze. Default `HEAD`. */
  readonly revision?: string;
}

/** One parsed `--format` commit record. */
interface CommitRecord {
  hash: string;
  author: string;
  email: string;
  date: string;
  subject: string;
}

/** Field separator for the machine-readable `--format`. `\x1f` (US, unit
 * separator) never appears in commit fields and, unlike NUL (0x00), cannot
 * corrupt text-file detection. Records are newline-delimited. */
const FS = "";

/**
 * Parse `git log --format='%H%x1f%an%x1f%ae%x1f%aI%x1f%s'` output into records.
 * Git writes one commit per line; within a line the `\x1f` separator splits
 * hash / author / email / date / subject exactly.
 */
function parseCommitLog(stdout: string): CommitRecord[] {
  const records: CommitRecord[] = [];
  for (const line of stdout.split("\n")) {
    if (line === "") continue;
    const [hash, author, email, date, subject] = line.split(FS);
    if (hash === undefined || hash === "") continue;
    records.push({
      hash,
      author: author ?? "",
      email: email ?? "",
      date: date ?? "",
      subject: subject ?? "",
    });
  }
  return records;
}

/** Analyze a known-good (non-empty) repository. */
async function analyzeImpl(rootPath: string, options: GitAnalysisOptions): Promise<RepoStats> {
  const revision = options.revision ?? "HEAD";
  const recentLimit = options.recentLimit ?? 10;

  // Commit-level facts (batch 1). %x1f is a unit separator; git emits one
  // record per line.
  const commitStdout = await runGit(rootPath, [
    "log",
    `--format=%H%x1f%an%x1f%ae%x1f%aI%x1f%s`,
    "--no-merges",
    revision,
  ]);
  const commits = parseCommitLog(commitStdout);

  // Total commits (all commits, including merges).
  const totalStdout = (await runGit(rootPath, ["rev-list", "--count", revision])).trim();
  const totalCommits = Number.parseInt(totalStdout, 10);

  // File churn (batch 2): --numstat over non-merge commits.
  const numstatStdout = await runGit(rootPath, [
    "log",
    "--numstat",
    "--format=",
    "--no-merges",
    revision,
  ]);
  const fileChurn = parseFileChurn(numstatStdout);

  const contributors = buildContributors(commits);
  const firstCommitDate = commits.length > 0 ? commits[commits.length - 1]!.date : null;
  const lastCommitDate = commits.length > 0 ? commits[0]!.date : null;
  const recentActivity = commits.slice(0, recentLimit).map(commitRecordToRecent);

  const filesByChurn = fileChurn
    .map((f) => ({ path: f.path, commits: f.commitCount }))
    .sort((a, b) => b.commits - a.commits || cmp(a.path, b.path));

  return {
    totalCommits,
    totalContributors: contributors.length,
    firstCommitDate,
    lastCommitDate,
    filesByChurn,
    contributors,
    fileChurn,
    recentActivity,
  };
}

/** Group commits by author identity (name+email); sort commitCount desc, then name, then email. */
function buildContributors(commits: readonly CommitRecord[]): GitContributor[] {
  const byIdentity = new Map<string, GitContributor>();
  for (const c of commits) {
    const key = `${c.author}${c.email}`;
    const existing = byIdentity.get(key);
    if (existing !== undefined) {
      byIdentity.set(key, { ...existing, commitCount: existing.commitCount + 1 });
    } else {
      byIdentity.set(key, { name: c.author, email: c.email, commitCount: 1 });
    }
  }
  return [...byIdentity.values()].sort(
    (a, b) => b.commitCount - a.commitCount || cmp(a.name, b.name) || cmp(a.email, b.email),
  );
}

/** Commit record → public recent-activity entry. */
function commitRecordToRecent(c: CommitRecord): GitRecentCommit {
  return {
    hash: c.hash,
    author: c.author,
    email: c.email,
    date: c.date,
    subject: c.subject,
  };
}

/** Parse `git log --numstat --format=` into per-file churn. */
function parseFileChurn(stdout: string): GitFileChurn[] {
  const churnByPath = new Map<
    string,
    { additions: number; deletions: number; commitCount: number }
  >();

  for (const line of stdout.split("\n")) {
    if (line === "") continue;
    // Columns: "<add>\t<del>\t<path>".
    const tab1 = line.indexOf("\t");
    if (tab1 === -1) continue;
    const add = line.slice(0, tab1);
    const rest = line.slice(tab1 + 1);
    const tab2 = rest.indexOf("\t");
    if (tab2 === -1) continue;
    const del = rest.slice(0, tab2);
    const rawPath = rest.slice(tab2 + 1);

    // Rename row: "0 0\t<old> => <new>". Attribute to the NEW path.
    const renameMarker = " => ";
    const renameAt = rawPath.indexOf(renameMarker);
    if (renameAt !== -1) {
      bump(churnByPath, rawPath.slice(renameAt + renameMarker.length), 0, 0);
      continue;
    }

    // Binary row: add/del are "-" → a commit touched it, numeric churn 0.
    if (add === "-" || del === "-") {
      bump(churnByPath, rawPath, 0, 0);
      continue;
    }

    const addNum = Number.parseInt(add, 10);
    const delNum = Number.parseInt(del, 10);
    if (!Number.isNaN(addNum) && !Number.isNaN(delNum)) {
      bump(churnByPath, rawPath, addNum, delNum);
    }
  }

  return [...churnByPath.entries()]
    .map(([rawPath, v]) => ({
      path: toPosixPath(rawPath),
      commitCount: v.commitCount,
      additions: v.additions,
      deletions: v.deletions,
      churn: v.additions + v.deletions,
    }))
    .sort((a, b) => b.churn - a.churn || b.commitCount - a.commitCount || cmp(a.path, b.path));
}

/** Increment churn accumulation for a path. */
function bump(
  map: Map<string, { additions: number; deletions: number; commitCount: number }>,
  path: string,
  additions: number,
  deletions: number,
): void {
  const existing = map.get(path);
  if (existing === undefined) {
    map.set(path, { additions, deletions, commitCount: 1 });
  } else {
    existing.additions += additions;
    existing.deletions += deletions;
    existing.commitCount += 1;
  }
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Determine whether `rootPath` is a Git working tree; throw if not. */
async function assertGitWorkTree(rootPath: string): Promise<void> {
  let isWorkTree: string;
  try {
    isWorkTree = (await runGit(rootPath, ["rev-parse", "--is-inside-work-tree"])).trim();
  } catch (err) {
    if (isGitNotARepoError(err)) {
      throw new NotAGitRepositoryError(rootPath);
    }
    throw err;
  }
  if (isWorkTree !== "true") {
    throw new NotAGitRepositoryError(rootPath);
  }
}

/** Detect "not a git repository" regardless of which git command surfaced it. */
function isGitNotARepoError(err: unknown): boolean {
  if (err instanceof GitCommandError) {
    return /not a git repository/i.test(err.stderr);
  }
  return false;
}

/**
 * Analyze the Git history of the repository rooted at `rootPath`.
 * Returns the deterministic `RepoStats`; an empty repository yields an
 * all-null/empty shape (never an error).
 */
export async function analyzeGitRepository(
  rootPath: string,
  options: GitAnalysisOptions = {},
): Promise<RepoStats> {
  const canonical = resolve(normalize(rootPath));

  // 1. Must be a Git work tree.
  await assertGitWorkTree(canonical);

  // 2. Empty repository detection: `rev-parse --verify --quiet HEAD` exits
  // non-zero when HEAD has no commit. Treat that as "no history", not an error.
  let hasHead = true;
  try {
    await runGit(canonical, ["rev-parse", "--verify", "--quiet", options.revision ?? "HEAD"]);
  } catch {
    hasHead = false;
  }

  if (!hasHead) {
    return emptyStats(canonical);
  }

  return analyzeImpl(canonical, options);
}

/** Deterministic empty-repository representation. */
function emptyStats(_rootPath: string): RepoStats {
  return {
    totalCommits: 0,
    totalContributors: 0,
    firstCommitDate: null,
    lastCommitDate: null,
    filesByChurn: [],
    contributors: [],
    fileChurn: [],
    recentActivity: [],
  };
}

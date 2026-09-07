/**
 * A hotspot is a file that combines high change frequency (churn) with
 * high complexity — the files where changes are most likely to introduce
 * bugs.
 */
export interface Hotspot {
  /** Path relative to the repository root. */
  readonly filePath: string;
  /** How often the file changes, normalized. */
  readonly churnScore: number;
  /** Cyclomatic complexity, normalized. */
  readonly complexityScore: number;
  /** Combined risk metric. Higher is riskier. */
  readonly combinedRisk: number;
  /** Number of commits touching this file. */
  readonly changeCount: number;
}

/** A repository contributor as recorded by Git. */
export interface GitContributor {
  /** Author name as recorded in commits (not normalized/cleaned). */
  readonly name: string;
  /** Author email as recorded in commits. */
  readonly email: string;
  /** Number of commits authored (non-merge commits only, per merge policy). */
  readonly commitCount: number;
}

/** Historical churn for a single file tracked in Git. */
export interface GitFileChurn {
  /** Repository-relative POSIX path. */
  readonly path: string;
  /** Number of (non-merge) commits that changed this file. */
  readonly commitCount: number;
  /** Total added lines across those commits (0 for binary changes). */
  readonly additions: number;
  /** Total deleted lines across those commits (0 for binary changes). */
  readonly deletions: number;
  /** `additions + deletions` — a simple deterministic churn measure. */
  readonly churn: number;
}

/** A recent commit, deterministically ordered newest-first. */
export interface GitRecentCommit {
  /** Full commit hash. */
  readonly hash: string;
  /** Author name. */
  readonly author: string;
  /** Author email. */
  readonly email: string;
  /** Commit date in ISO 8601 (`%aI`). */
  readonly date: string;
  /** Commit subject line. */
  readonly subject: string;
}

/**
 * Aggregate repository statistics derived from the Git history.
 *
 * Policies (documented):
 * - `totalCommits` counts ALL commits, including merges.
 * - `contributors` counts non-merge commits per author identity (name+email).
 * - `fileChurn` is aggregated from non-merge commits (`--no-merges`);
 *   a merge is not a new file edit.
 * - `filesByChurn` is a backward-compatible projection of `fileChurn`,
 *   sorted by commit count descending (then path), most-changed first.
 */
export interface RepoStats {
  /** Total commits in the repository (including merges). */
  readonly totalCommits: number;
  /** Total contributors (unique author name+email pairs). */
  readonly totalContributors: number;
  /** Date of the earliest commit (ISO 8601). */
  readonly firstCommitDate: string | null;
  /** Date of the most recent commit (ISO 8601). */
  readonly lastCommitDate: string | null;
  /** Files by commit count, most frequently changed first. */
  readonly filesByChurn: Array<{
    readonly path: string;
    readonly commits: number;
  }>;
  /** Contributors and their commit counts, sorted deterministically. */
  readonly contributors: readonly GitContributor[];
  /** Per-file churn, sorted by churn descending then path. */
  readonly fileChurn: readonly GitFileChurn[];
  /** Recent commits, newest-first, bounded by the configured limit. */
  readonly recentActivity: readonly GitRecentCommit[];
}

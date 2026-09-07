/**
 * Signals that contribute to a hotspot, with the raw measured values. No
 * opaque normalized scores are used — each signal is the actual value from
 * the upstream analysis, so a reader can see exactly why the file is flagged.
 */
export interface HotspotSignals {
  /** Cyclomatic complexity of the file (Phase 1C). */
  readonly complexity: number;
  /** Total churn (additions+deletions) for the file (Phase 1E). */
  readonly churn: number;
  /** Number of distinct internal modules this file depends on (Phase 1D). */
  readonly fanOut: number;
  /** Number of distinct internal modules that depend on this file (Phase 1D). */
  readonly fanIn: number;
  /** True when the file participates in a dependency cycle (Phase 1D). */
  readonly inCycle: boolean;
}

/**
 * A hotspot is a file that combines multiple objective risk signals. It is
 * NOT an opaque composite score: `signals` exposes the raw measured values,
 * `findings` lists the contributing rule IDs, and `ranking` is simply the
 * count of distinct contributing signals — so the reader can understand
 * exactly why the file is highlighted.
 */
export interface Hotspot {
  /** Repository-relative POSIX path. */
  readonly filePath: string;
  /** Raw measured signals that feed this hotspot. */
  readonly signals: HotspotSignals;
  /** Rule IDs of the findings that contributed. */
  readonly findings: readonly string[];
  /** Number of distinct contributing signals (deterministic rank). */
  readonly ranking: number;
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

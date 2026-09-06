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

/**
 * Aggregate repository statistics derived from the Git history.
 */
export interface RepoStats {
  /** Total commits in the repository. */
  readonly totalCommits: number;
  /** Total contributors (unique author names). */
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
}

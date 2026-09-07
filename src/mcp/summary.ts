import type { FindingSeverity, FindingCategory } from "../types/finding.js";
import type { Language } from "../types/language.js";
import type { ImportType } from "../types/module.js";
import type { Hotspot } from "../types/stats.js";

/**
 * Compact, agent-oriented projection of a `ScanResult`, produced by the MCP
 * presentation layer for `scan_repository`.
 *
 * This is a deliberate REDUCTION of the canonical `ScanResult` (which remains
 * the single source of truth and is unchanged). It preserves repository-level
 * signals an AI coding agent needs for initial reconnaissance — aggregate
 * counts, language breakdown, dependency totals, cycles, hotspots, notable
 * findings, and the highest-risk files — while omitting the per-item detail
 * (every dependency edge, every exported symbol, every file's metadata, the
 * full Git history) that makes the raw `ScanResult` too large for an MCP
 * tool response.
 *
 * Everything here is derived deterministically from the `ScanResult` itself;
 * nothing is AI-generated and no repository fact is invented or removed from
 * the model.
 */
export interface ScanSummary {
  /** Reserved for forward-compat with the canonical `ScanResult`. */
  readonly schemaVersion: 1;
  /** Absolute path to the repository root. */
  readonly rootPath: string;
  /** Timestamp when the scan completed (ISO 8601). */
  readonly scanTimestamp: string;
  /** Total scan duration in milliseconds. */
  readonly durationMs: number;

  /** Repository/file/module aggregate counts. */
  readonly counts: {
    /** Total files in the repository. */
    readonly files: number;
    /** Source files that produced a `Module` (`.ts/.tsx/.js/.jsx`). */
    readonly modules: number;
    /** Distinct file kinds, by `FileKind`. */
    readonly byKind: {
      readonly source: number;
      readonly test: number;
      readonly config: number;
      readonly documentation: number;
      readonly fixture: number;
      readonly typeDefinition: number;
      readonly unknown: number;
    };
    /** Dependency edges (internal + external + unresolved). */
    readonly dependencies: number;
    /** Distinct dependency cycles. */
    readonly cycles: number;
    /** Findings produced by the rules engine. */
    readonly findings: number;
    /** Hotspot files (ranked ≥2 risk signals). */
    readonly hotspots: number;
  };

  /** Languages present, with how many source files use each. */
  readonly languages: Array<{ readonly language: Language; readonly fileCount: number }>;

  /** Dependency totals by resolution classification. */
  readonly dependencies: {
    /** Total internal dependency edges. */
    readonly internal: number;
    /** Total external dependency edges. */
    readonly external: number;
    /** Total unresolved dependency edges. */
    readonly unresolved: number;
    /** References that could not be resolved (retained, never dropped). */
    readonly unresolvedRefs: ReadonlyArray<{
      /** Repository-relative POSIX path of the importing module. */
      readonly sourceFile: string;
      /** The original module specifier that could not be resolved. */
      readonly specifier: string;
      /** How the reference was made. */
      readonly importType: ImportType;
    }>;
  };

  /** Circular dependency groups. `members` are repo-relative POSIX paths. */
  readonly cycles: ReadonlyArray<{
    /** Number of modules in the cycle. */
    readonly size: number;
    /** Repo-relative POSIX paths of participating modules. */
    readonly members: readonly string[];
  }>;

  /** Hotspot files, most risky first (unchanged compact shape). */
  readonly hotspots: readonly Hotspot[];

  /** Notable findings, high-severity first (compact form). */
  readonly findings: ReadonlyArray<{
    readonly ruleId: string;
    readonly severity: FindingSeverity;
    readonly category: FindingCategory;
    /** Repo-relative POSIX path the finding points at. */
    readonly location: string;
    readonly title: string;
    readonly measured: number;
    readonly threshold: number;
  }>;

  /** Highest-risk files by the core deterministic signals. */
  readonly files: {
    /** Highest cyclomatic-complexity files. */
    readonly highComplexity: ReadonlyArray<{ readonly path: string; readonly complexity: number }>;
    /** Highest churn (add+del) files. */
    readonly highChurn: ReadonlyArray<{ readonly path: string; readonly churn: number }>;
    /** Files with the most distinct internal dependents. */
    readonly highFanIn: ReadonlyArray<{ readonly path: string; readonly fanIn: number }>;
    /** Files with the most distinct internal dependencies. */
    readonly highFanOut: ReadonlyArray<{ readonly path: string; readonly fanOut: number }>;
  };

  /** Repository-level Git summary, or null when the root is not a Git repo. */
  readonly git: {
    readonly totalCommits: number;
    readonly totalContributors: number;
    readonly firstCommitDate: string | null;
    readonly lastCommitDate: string | null;
    /** Most-changed files, by churn. */
    readonly topChurnFiles: ReadonlyArray<{ readonly path: string; readonly churn: number }>;
    /** Recent commits, newest-first, bounded by the scan's recent limit. */
    readonly recentActivity: ReadonlyArray<{
      readonly hash: string;
      readonly author: string;
      readonly date: string;
      readonly subject: string;
    }>;
  } | null;
}

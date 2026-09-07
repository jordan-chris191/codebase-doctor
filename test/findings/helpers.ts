import type { FindingsContext } from "../../src/findings/types.js";
import type { ScannedFileMetadata } from "../../src/scanner/results.js";
import type { FileAnalysis } from "../../src/analyzers/interfaces.js";
import type {
  DependencyGraph,
  DependencyNode,
  DependencyEdge,
  DependencyCycle,
} from "../../src/types/dependency.js";
import type {
  RepoStats,
  GitFileChurn,
  GitContributor,
  GitRecentCommit,
} from "../../src/types/stats.js";

/**
 * Build a minimal `FindingsContext` in memory (no filesystem, no git) from
 * fixture data, so rules can be unit-tested deterministically.
 */

interface FixtureFile {
  path: string;
  absolutePath: string;
  lineCount: number;
  isSource?: boolean;
  complexity?: number;
}

interface FixtureGraph {
  edges?: Array<[string, string]>; // [source, target] internal edges by rel path
  cycles?: Array<Array<string>>; // cycles by rel path
}

export function makeContext(opts: {
  files: FixtureFile[];
  graph?: FixtureGraph;
  churn?: GitFileChurn[];
}): FindingsContext {
  const files: ScannedFileMetadata[] = opts.files.map((f) => ({
    path: f.path,
    absolutePath: f.absolutePath,
    isSource: f.isSource ?? true,
    isTest: false,
    isConfig: false,
    sizeBytes: f.lineCount,
    lineCount: f.lineCount,
    category: "source",
  }));

  const analyses = new Map<string, FileAnalysis>();
  for (const f of opts.files) {
    analyses.set(f.absolutePath, {
      filePath: f.absolutePath,
      exports: [],
      references: [],
      complexity: f.complexity ?? 1,
      functions: [],
      classes: [],
      summary: null,
    });
  }

  const graph = opts.graph === undefined ? null : makeGraph(opts.graph);

  const stats: RepoStats | null =
    opts.churn !== undefined
      ? {
          totalCommits: opts.churn.length,
          totalContributors: 0,
          firstCommitDate: null,
          lastCommitDate: null,
          filesByChurn: [],
          contributors: emptyContributors(),
          fileChurn: opts.churn,
          recentActivity: emptyRecent(),
        }
      : null;

  return {
    discovery: {
      rootPath: "/repo",
      isGitRepository: false,
      durationMs: 0,
      files,
      totals: {
        totalFiles: files.length,
        totalDirectories: 0,
        totalBytes: 0,
        sourceFiles: files.length,
        testFiles: 0,
        configFiles: 0,
        skipCount: 0,
      },
      unreadable: [],
    },
    analyses,
    graph,
    stats,
  };
}

function makeGraph(fg: FixtureGraph): DependencyGraph {
  const nodePaths = new Set<string>([...(fg.edges?.flat() ?? []), ...(fg.cycles?.flat() ?? [])]);
  const nodes: DependencyNode[] = [...nodePaths].map((p) => {
    const abs = `/repo/${p}`;
    return { path: p, absolutePath: abs };
  });
  const edges: DependencyEdge[] = (fg.edges ?? []).map(([s, t]) => ({
    source: `/repo/${s}`,
    target: `/repo/${t}`,
    kind: "internal" as const,
    type: "static",
    weight: 1,
    specifier: "./x",
  }));
  const cycles: DependencyCycle[] = (fg.cycles ?? []).map((c) => ({
    members: c.map((p) => `/repo/${p}`),
  }));
  return { rootPath: "/repo", nodes, edges, cycles, unresolved: [] };
}

function emptyContributors(): GitContributor[] {
  return [];
}
function emptyRecent(): GitRecentCommit[] {
  return [];
}

/** Convenience: make a single-file context. */
export function singleFile(path: string, complexity: number, lineCount = 100): FindingsContext {
  return makeContext({ files: [{ path, absolutePath: `/repo/${path}`, lineCount, complexity }] });
}

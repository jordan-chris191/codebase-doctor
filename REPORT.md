# Codebase Doctor — Technical Development Report

## 1. Project Overview

Codebase Doctor is an open-source developer tool that gives AI coding
agents (such as Claude Code) structured architectural intelligence about a
repository through MCP. Rather than forcing an agent to rediscover
architecture by reading many files, Codebase Doctor deterministically
analyzes a repository once and exposes structured facts — structure,
dependencies, module relationships, boundaries, entry points, hotspots,
findings, Git history, and configuration.

The project is explicitly scoped:

- **Not** a generic file-search MCP server
- **Not** a RAG wrapper
- **Not** an AI code generator
- Core value is deterministic repository analysis and structured codebase
  intelligence
- LLM reasoning is added only where it adds meaningful value, and never as
  the source of truth for repository facts

## 2. Project Goals

1. Provide a deterministic, reproducible repository-intelligence core.
2. Expose structured architecture, dependency, and risk information.
3. Make MCP a first-class interface (later phase).
4. Support evolving language coverage behind a plugin/analyzer model.
5. Keep AI as an optional enhancement layer on top of deterministic data.
6. Stay minimal: no database, no web UI, no over-engineering.

## 3. Current Architecture

The architecture is a layered pipeline. Each layer is separated so it can be
developed and tested independently, and so the MCP server (future) is a thin
consumer rather than an integration seam.

```
CLI (commander) ──► Scanner (discovery) ──► Deterministic metadata
                                  │
                                  └──► Analyzer (parsing, Phase 1C) ──► FileAnalysis
                                            │
                                            └──► Dependency graph (Phase 1D) ──► DependencyGraph
                                                    │
                                                    └──► Findings / Hotspots /
                                                         MCP (future)
```

Layers:

- **Domain model** (`src/types`) — pure, readonly, dictionary-shaped types.
  No classes, no behavior, no hidden logic. The single vocabulary shared by
  every layer.
- **Scanner** (`src/scanner`) — repository/file-tree discovery. Produces
  deterministic `ScannedFileMetadata` per file. Independent from the CLI.
- **Analyzers** (`src/analyzers`) — the `LanguageAnalyzer` contract and the
  concrete TypeScript analyzer (Phase 1C), producing `FileAnalysis`.
- **Dependencies** (`src/dependencies`) — repository-aware module resolution
  (`ts.resolveModuleName`), deterministic `DependencyGraph` construction, and
  cycle detection (Phase 1D). Consumes `FileAnalysis`; never re-parses source.
- **Utils** (`src/utils`) — shared path normalization, gitignore handling,
  file classification, always-excluded directories.
- **CLI** (`src/cli.ts`) — command surface; currently exposes a working
  `scan` command with a human-readable summary.

Design invariants:

- Paths in public results are POSIX-style relative paths (`/` separators),
  independent of the host OS.
- File contents are never loaded into memory during discovery; only
  metadata is read (streaming line counting).
- Symlinks are never followed, preventing escape from the repository root.
- All results are deterministic: same repo in → same output.

## 4. Technology Stack

- **Runtime:** Node.js >= 20
- **Language:** TypeScript (strict), ESM (`module: NodeNext`)
- **Compiler config:** `strict`, `isolatedDeclarations`, `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, `noImplicitReturns`, `verbatimModuleSyntax`
- **Testing:** Vitest (globals), v8 coverage thresholds at 80% (configured)
- **Lint:** ESLint 9 flat config + `typescript-eslint`
- **Format:** Prettier
- **Runtime deps:** `commander` (CLI), `ignore` (gitignore semantics)
- **Dev deps:** `typescript`, `vitest`, `eslint`, `@eslint/js`,
  `typescript-eslint`, `prettier`, `@types/node`, `ts-node`

## 5. Project Structure

```
src/
├── analyzers/          # Language-analyzer contract + errors
│   ├── errors.ts       #   AnalyzerError, FileParseError
│   ├── index.ts        #   barrel
│   └── interfaces.ts   #   LanguageAnalyzer, FileAnalysis
├── cli.ts              # CLI (commander), main-module guard
├── index.ts            # public barrel export
├── scanner/            # Repository discovery
│   ├── errors.ts       #   ScanError, PathNotFoundError, PathIsFileError, UnreadableFile
│   ├── index.ts        #   barrel
│   ├── results.ts      #   DiscoveryResult, ScannedFileMetadata, ScanTotals
│   └── scanner.ts      #   RepositoryScanner, createScanner
├── types/              # Domain model (pure types)
│   ├── dependency.ts
│   ├── file.ts
│   ├── finding.ts
│   ├── language.ts
│   ├── module.ts
│   ├── scan.ts
│   └── stats.ts
└── utils/
    ├── always-excluded.ts
    ├── file.ts
    ├── gitignore.ts
    └── path.ts

test/
├── fixtures/kitchen-sink.ts   # canonical fixture builder
├── helpers/fs.ts              # fixture repo + cleanup helpers
├── scanner/                   # discovery + path + error tests
└── unit/                      # types + cli tests
```

## 6. Implemented Features

**Phase 1A — Foundation (complete):**

- Strict TypeScript project scaffold, ESM/NodeNext, `isolatedDeclarations`
- Vitest, ESLint 9 flat config, Prettier
- Full domain model (see §9)
- `LanguageAnalyzer` interface + `FileAnalysis`
- CLI scaffolding with `scan`/`--help`/`--version` and a Windows-safe
  main-module guard

**Phase 1B — Repository Discovery (complete):**

- `createScanner({ extraIgnoreRules? })` returning a `Scanner` with
  `scan(path) → DiscoveryResult`
- Canonical path resolution with structured validation errors
  (`PathNotFoundError`, `PathIsFileError`)
- Git-repository detection (presence of `.git`, dir or worktree file) via
  `isGitRepository` — no history analysis
- Recursive iterative DFS file-tree walk (`opendir`)
- Per-directory `.gitignore` handling via the `ignore` package
- Always-excluded directories: `.git`, `node_modules`, `dist`, `build`,
  `coverage`, `.codebase-doctor` (applied even if `.gitignore` un-ignores)
- Symlink safety: symlinked files and directories are skipped, never followed
- Deterministic `ScannedFileMetadata`: path (POSIX-relative), absolutePath,
  isSource, isTest, isConfig, sizeBytes, lineCount, category
- Streaming line counting (64KB chunks, no content loaded into memory;
  handles no-trailing-newline and empty files)
- Binary-file safety
- Unreadable-file collection reported in the result (scan continues)
- CLI `scan` command: real discovery + human-readable summary, structured
  error output to stderr with exit code 1 on scan errors

**Phase 1C — TypeScript/JavaScript Analysis (complete):**

- Canonical analyzer using the **TypeScript Compiler API** directly
  (`src/analyzers/typescript.ts`); `typescript` moved to runtime dependencies
- `TypeScriptAnalyzer implements LanguageAnalyzer` + `createTypeScriptAnalyzer()`;
  `canHandle` reuses `languageForPath()`; extension → `ScriptKind` via
  `script-kind.ts` for TS/TSX/JS/JSX
- Imports/references (`imports.ts`): static, type-only, side-effect, dynamic
  (`import()` and `import type` edges), recognized CommonJS `require()`, and
  `export … from "…"` sources — specifiers captured exactly, never resolved
  (resolution belongs to Phase 1D)
- Exports (`exports.ts`): functions, classes, constants, types, interfaces,
  enums, namespaces, named aliased re-exports (`export { a as b }`),
  `export type { … } from`, `export * as ns`, `export * from` (reference only),
  and default exports (named and anonymous with an `(anonymous)` placeholder)
- Functions/classes (`symbols.ts`): declared functions incl. nested scopes and
  named function expressions; class declarations; arrows/anonymous skipped;
  class methods excluded from the function list (they still count toward
  complexity)
- Deterministic cyclomatic complexity (`complexity.ts`): `1 + decision points`
  over `if`, loops, `switch` cases, ternary, `&&`/`||`, `catch`
- `FileAnalysis` assembled from a single AST parse; deterministic `summary`
  derived from the same data (`summary.ts`)
- Syntax errors → existing `FileParseError` (per-file; a scan never crashes
  on one bad file); unsupported extensions rejected before parsing
- 65 analyzer tests (`test/analyzer/`); 97 tests total

**Phase 1D — Dependency Graph (complete):**

- **Module resolution** (`src/dependencies/resolver.ts`) — repository-aware
  `ts.resolveModuleName` honoring `tsconfig.json` (`baseUrl`, `paths`,
  `moduleResolution`, `module`); defaults to ESM/NodeNext. Resolves relative,
  extensionless, parent-relative, TSX/JS/JSX, directory/index, and `paths`
  aliases. Never re-parses source; consumes `ModuleReference`/`ModuleExport.source`.
- **Classification** — `internal` (inside repo root), `external`
  (`isExternalLibraryImport`/`node_modules`/outside root), `unresolved`
  (retained, never silently discarded).
- **Graph** (`src/dependencies/graph.ts`) — `buildDependencyGraph(discovery,
  analyses)` produces a deterministic `DependencyGraph`: sorted nodes, weighted
  collapsed edges, canonical cycles, sorted unresolved list. Edge carries
  `kind` (classification) + `type` (static/type-only/dynamic/commonjs/
  side-effect) + `weight` + original `specifier`.
- **Re-exports** — `export { x } from "./m"` / `export * as ns from "./m"`
  are **static** edges; pure `export * from "./m"` is a **side-effect** edge.
  No symbol-level resolution.
- **Cycle detection** (`src/dependencies/cycles.ts`) — Tarjan SCC + canonical
  per-SCC DFS enumeration; simple / longer / multiple / self cycles reported
  exactly once, deterministically.
- **Domain** (`src/types/dependency.ts`) — added `DependencyGraph`,
  `DependencyNode`, `UnresolvedDependency`, `DependencyClassification`;
  `DependencyEdge` gained `kind` and `specifier`; `DependencyType = ImportType`.
- **32 dependency tests** (`test/dependencies/`); 129 tests total.

**Phase 1E — Git Analysis (complete):**

- **Batch Git analysis** (`src/git/`): `analyzeGitRepository(rootPath, { recentLimit? })`
  → `RepoStats`, using the Git CLI via `child_process.execFile` (no shell,
  Windows-safe; no new dependencies).
- **Commit statistics** — `totalCommits` (all incl. merges), `firstCommitDate` /
  `lastCommitDate` (ISO-8601 `%aI`).
- **File churn** — `fileChurn[]` (`path`, `commitCount`, `additions`, `deletions`,
  `churn`), aggregated from one `git log --numstat` batch (no per-file `git`).
- **Contributors** — `contributors[]` (`name`, `email`, `commitCount`), grouped by
  identity, sorted deterministically.
- **Recent activity** — `recentActivity[]` (`hash`, `author`, `email`, `date`,
  `subject`), newest-first, bounded by `recentLimit` (default **10**).
- **Policies**: merges count in `totalCommits` but not file churn/contributors;
  renames attributed to the post-rename path; binary files counted as churn with
  zero numeric add/del; POSIX path normalization; empty repos return an
  all-null/empty shape (not an error); non-Git dirs throw `NotAGitRepositoryError`.
- **Errors** — `GitAnalysisError` hierarchy: `NotAGitRepositoryError`,
  `GitUnavailableError`, `GitCommandError`, `GitOutputError`.
- **CLI** — new `codebase-doctor git [path] [--recent N]` command.
- **Domain** — `RepoStats` extended (additive) with `contributors`, `fileChurn`,
  `recentActivity`; new `GitContributor`/`GitFileChurn`/`GitRecentCommit` types.
- **13 Git tests** (`test/git/`); 142 tests total.

## 7. Development Phases

1. **Phase 1A — Foundation** — COMPLETE
2. **Phase 1B — Repository Discovery** — COMPLETE
3. **Phase 1C — TypeScript/JavaScript Analysis** — COMPLETE
4. **Phase 1D — Dependency Graph** — COMPLETE
5. **Phase 1E — Git Analysis** — COMPLETE
6. **Findings / Hotspots** — NEXT, NOT STARTED
7. **CLI polish** — PLANNED
8. **MCP Server** — PLANNED (first-class interface)
9. **Claude Code Integration** — PLANNED
10. **AI Reasoning Layer** — PLANNED (optional, after deterministic core)
11. **Change Validation** — PLANNED
12. **Optional Dashboard** — PLANNED (out of near-term scope)

## 8. Current Phase

**Phase 1E (Git Analysis)** is COMPLETE and verified. The next phase,
**Findings / Hotspots**, has not started.

## 9. Domain Model

Defined in `src/types`. All are pure, readonly, dictionary-shaped types.

- **`Language`** (`language.ts`) — `typescript | typescript-jsx |
  javascript | javascript-jsx`. Exports `LANGUAGES`, a deep-frozen constant
  lookup table of extension → language.
- **`FileInfo` / `FileKind`** (`file.ts`) — descriptive per-file metadata
  (path, language, size, line counts, isTest, isConfig, kind).
- **`Module`, `ModuleExport`, `ModuleReference`, `ExportKind`** (`module.ts`)
  — a module's exported symbols and its reference relationships. `ExportKind`
  includes `namespace` for `export namespace`/`export import X =`; `ModuleExport`
  carries an optional `source` (present iff `isReExport`) so the dependency
  layer can build export edges without a second parse. `ModuleReference` uses
  `ImportType` (`static | type-only | dynamic | commonjs | side-effect`).
- **`DependencyGraph`, `DependencyNode`, `DependencyEdge`, `DependencyCycle`,
  `DependencyClassification`, `UnresolvedDependency`** (`dependency.ts`) —
  the repository-level dependency graph (Phase 1D). An edge carries `kind`
  (internal/external/unresolved), `type` (`ImportType`), `weight`, and the
  original `specifier`. `DependencyClassification` distinguishes internal /
  external / unresolved. Unresolved references are retained in a list, never
  discarded.
- **`Finding`, `FindingCategory`, `FindingLocation`** (`finding.ts`) —
  issue/observation model for the later findings phase. Types exist; no
  finding rules are implemented yet.
- **`Hotspot`, `RepoStats`, `GitContributor`, `GitFileChurn`, `GitRecentCommit`**
  (`stats.ts`) — risk and git aggregate types. `RepoStats` is produced by the
  Phase 1E Git analyzer (`contributors`, `fileChurn`, `recentActivity`,
  `filesByChurn`, dates, totals). `Hotspot` remains forward-declared (produced
  in the Findings/Hotspots phase).
- **`ScanResult`** (`scan.ts`) — the intended top-level scan artifact.
  `schemaVersion: 1`. Partially realized: `DiscoveryResult` is the current
  concrete scan output.

The `ScanResult` type is broader than what discovery produces today;
threading the full `ScanResult` through (merging analyzer + git output) is
future work.

## 10. Technical Decisions

- **`ignore` package for gitignore semantics** (Phase 1B). Chosen over
  hand-rolling: the gitignore spec (negation `!`, `**`, directory-only
  trailing-slash patterns) is subtle and easy to get wrong. `ignore@7` is
  mature, zero-dependency, actively maintained (used by npm, eslint,
  prettier). It also exposed a key nuance (see §11).
- **Streaming line counting.** Discovery reads files in 64KB chunks and
  counts `\n` bytes rather than loading contents, so arbitrarily large
  files never exhaust memory. `readFile` (which loads whole files) is not
  used during discovery.
- **Directory-scoped gitignore handles.** Each directory gets its own
  `GitIgnoreHandle`, matching git's rule that a `.gitignore` applies only
  to its own subtree. Handles are lazily loaded and cached per directory.
- **Iterative walk over recursion.** Avoids deep-recursion stack overflow on
  deeply nested trees.
- **Pure readonly domain types.** No classes/methods in the model keeps the
  data serializable and aggregation logic centralized in the layers.
- **Forward-declared types.** Dependency/finding/hotspot types exist in the
  domain model before their producers, so consumers and the future MCP
  contract are stable while analyzers are built incrementally.
- **TypeScript Compiler API as the single analysis engine (Phase 1C).**
  Chosen over `ts-morph` (a wrapper layer with no added capability for the
  per-file extraction needed, and an extra dependency) and
  `dependency-cruiser` (a whole-program tool with its own schema; its
  cycle detection belongs to Phase 1D, not per-file parsing). The compiler
  API is already present (moving from dev to runtime deps), is the canonical
  AST for all four languages, and drives both Phase 1C and Phase 1D from one
  AST — honoring the single-source-of-truth constraint. `typescript` was
  moved from `devDependencies` to `dependencies` because the analyzer imports
  it at runtime and the CLI ships via `bin`.
- **Deterministic McCabe complexity.** `1 + decision points` over `if`,
  loops, `switch` cases (excl. `default`), ternary, `&&`/`||`, and `catch`.
  Purely syntactic; no type-checking; same input always yields the same value.
- **`parseDiagnostics` via typed read.** `SourceFile.parseDiagnostics` is a
  stable internal API (not on the public type surface) that reports token-level
  syntax errors without building a `Program`; read through a const-asserted
  interface.
- **Repository-aware `ts.resolveModuleName` for the graph (Phase 1D).** The
  same TypeScript Compiler API that parses files also resolves specifiers —
  no second parser, no `dependency-cruiser`, no hand-rolled resolution. The
  resolver honors `tsconfig.json` (`baseUrl`, `paths`, `moduleResolution`,
  `module`), defaults to ESM/NodeNext when absent, and classifies results by
  whether they live inside the repo root (`internal`), in `node_modules` /
  outside (`external`), or fail to resolve (`unresolved`).
- **Edge kind ⇄ type separation (Phase 1D).** A `DependencyEdge` carries both
  `kind` (resolution classification: internal/external/unresolved) and `type`
  (how it was referenced: static/type-only/dynamic/commonjs/side-effect), so
  classification and semantics stay orthogonal.
- **Re-export typing.** `export { x } from "./m"` and `export * as ns` are
  **static** edges; pure `export * from "./m"` is a **side-effect** edge
  (it re-exports everything with no named binding).
- **Tarjan SCC + canonical enumeration for cycles (Phase 1D).** SCC
  decomposition finds non-trivial groups; per-SCC DFS from the canonical
  lowest node enumerates each elementary cycle exactly once. Self-loops are
  reported independently, so a self-importing module is also caught.
- **Batch Git CLI via `child_process.execFile` (Phase 1E).** Git facts come
  from a small number of machine-readable batch commands (`git log --format`,
  `git log --numstat --format=`, `git rev-list --count`) — never one process
  per file, no shell, Windows-safe, and a deterministic separator (`\x1f`, not
  NUL) that cannot corrupt text-file detection.
- **Merge/rename/binary policies (Phase 1E).** Merges count toward
  `totalCommits` but not file churn/contributors (`--no-merges` for those);
  renames are attributed to the post-rename path; binary changes count as a
  churn event with zero numeric add/del. All deterministic and documented.

## 11. Problems Encountered and Solutions

- **`allowJs` + `isolatedDeclarations` conflict (TS5053).** The initial
  tsconfig enabled `allowJs`/`checkJs` (this is a pure-TS project) which
  conflicts with `isolatedDeclarations`. Removed JS support flags; the
  project is TypeScript-only.
- **`LANGUAGES` immutability.** `ReadonlyArray` is compile-time only; a test
  caught the runtime gap. The table is now deeply frozen via `Object.freeze`.
- **CLI silent failure on Windows.** The original main-module guard used
  forward-slash `.endsWith(...)`, which never matches backslash-separated
  `argv[1]` on Windows, so the CLI silently did nothing. Fixed with a
  realpath-resolved comparison that is also symlink-safe for the npm `bin`
  shim.
- **Gitignore trailing-slash semantics.** The `ignore` package matches
  `generated/` against `generated/tmp.ts` (a file) but NOT against the bare
  directory name `generated`. Git's actual semantics: a trailing-slash
  pattern matches the directory path only when written with the trailing
  slash. The scanner therefore tests directories with `rel + "/"`. This was
  caught by the test suite and fixed before it could ship.
- **Symlink creation on Windows (test-only).** Creating symlinks requires
  Developer Mode or elevation; the symlink test conditionally skips when
  the platform refuses. The scanner's not-following-symlinks behavior is
  the real protection and is always exercised.
- **`getSyntacticDiagnostics` is not public `SourceFile` API.** The compiler
  surface changed across versions: `SourceFile.parseDiagnostics` is populated
  at parse time (token-level syntax errors) but is not on the public type
  surface, and `getSyntacticDiagnostics` requires a full `Program`. Detecting
  syntax errors via `parseDiagnostics` through a const-asserted interface is
  far cheaper than building a `Program` and avoids `transpileModule`'s
  double parse.
- **Dynamic import is an `ImportKeyword` call, not an `Identifier`.** `import("./m")`
  parses as a `CallExpression` whose callee is an `ImportKeyword` node, not an
  `Identifier` with text `"import"`. Detecting it via `ImportKeyword` caught
  dynamic imports that an identifier check would silently miss.
- **`ExportSpecifier.name` is the exported name.** For `export { local as remote }`,
  `name` is `remote` and `propertyName` is `local`. Initial logic used the
  names backwards; tests caught it.
- **Re-export double-emission (Phase 1D).** `export { x } from "./m"` appears
  in Phase 1C BOTH as a `side-effect` reference AND as an export with `source`.
  The graph builder now upgrades the reference edge to `static`/`type-only`
  (for named/namespace re-exports) while a pure `export * from` stays
  `side-effect` — so one `export` produces one correctly-typed edge, not two.
- **Self-loops inside multi-node SCCs (Phase 1D).** Tarjan's SCC adjacency
  omits self-edges, so a self-loop inside a larger SCC was lost. Self-loops are
  now collected independently from the raw edges before SCC decomposition.

## 12. Testing and Verification

- **142 tests** across 13 files:
  - `test/unit/types.test.ts` (3) — LANGUAGES immutability, ScanResult schema
  - `test/unit/cli.test.ts` (2) — command registration, version
  - `test/scanner/paths.test.ts` (11) — path normalization, test/config detection
  - `test/scanner/errors.test.ts` (3) — path error types + messages
  - `test/scanner/discovery.test.ts` (13) — full discovery behavior
  - `test/analyzer/imports.test.ts` (12) — static, type-only, side-effect,
    dynamic, `require()`, arbitrary-call rejection, re-export sources, nested
    dynamic, `import type` edges
  - `test/analyzer/exports.test.ts` (18) — all `ExportKind`s, aliased
    re-exports, `export type`/`export * as`, `export *`, anonymous/named
    defaults
  - `test/analyzer/symbols.test.ts` (11) — functions (decl, nested, named
    expressions, arrows skipped, methods excluded), classes (decl, abstract,
    exported/plain, expressions)
  - `test/analyzer/complexity.test.ts` (10) — baseline, `if`, loops, `switch`
    cases, ternary, logical, `catch`, nested aggregation, determinism
  - `test/analyzer/languages.test.ts` (12) — TS/TSX/JS/JSX + edge cases
    (empty, comments-only, syntax errors, unsupported, duplicate imports,
    unusual-but-valid syntax, determinism)
  - `test/dependencies/graph.test.ts` (21) — basic/parent/extensionless
    resolution, TSX/JS/JSX, index/dir, external + scoped, require (internal +
    external), dynamic, type-only, re-exports, export-star/namespace,
    path aliases, unresolved (relative + package), boundary safety, duplicate
    collapse, ordering, mixed internal/external, nested
  - `test/dependencies/cycles.test.ts` (7) — simple/multi/independent/self
    cycles, deterministic order, stable equivalent input, diamond (no false
    cycles)
  - `test/git/analysis.test.ts` (13) — multi-commit, single-commit, empty
    repo, non-Git dir, multiple contributors, add/modify/delete, multi-file
    commit, rename policy, recent limit/order, determinism, POSIX path
    normalization, binary churn, merge policy
- **Fixture repos** built at runtime in a temp dir via
  `test/helpers/fs.ts` + `test/fixtures/kitchen-sink.ts`; cleaned up
  automatically. Analyzer tests analyze content in memory (no fixtures);
  dependency tests build fixture repos and scan+analyze them; Git tests build
  real temp Git repositories with local identity and fixed commit dates
  (never the user's global Git config or wall-clock).
- **Coverage** thresholds configured at 80% but not yet run/verified
  (`@vitest/coverage-v8` not installed).
- **Verification pipeline** (all PASS as of 2026-09-07):
  build, typecheck, test (142), lint, format:check, and CLI smoke tests
  (`scan`: `70 files, 18 dirs`; `git`: 4 commits, 1 contributor, populated
  churn/dates/recent).

## 13. Dependencies

**Runtime:**

- `commander` (^13) — CLI argument parsing
- `ignore` (^7) — gitignore semantics
- `typescript` (^5.7) — the canonical Phase 1C/1D analysis engine (moved from
  dev to runtime: the analyzer imports it and the CLI ships via `bin`)

**Dev:**

- `vitest` (^3), `eslint` (^9), `@eslint/js` (^9),
  `typescript-eslint` (^8), `prettier` (^3), `@types/node` (^22),
  `ts-node` (^10.9)

No additional analyzer/parser dependency was added; the single engine is the
TypeScript Compiler API (see §10).

## 14. Known Limitations

- **Module resolution is not a full npm/bundler resolver.** It resolves
  specifiers via the TypeScript compiler with the repo's tsconfig; workspace
  references, monorepo symlinking heuristics, and package-exports/`browser`
  field maps are not implemented.
- **Per-file syntax analysis only.** Phase 1C parses one file at a time; it
  does not type-check a project or do cross-file semantic resolution.
- **`DependencyEdge.source/target` and cycle `members` are absolute paths.**
  Public presentation (CLI/MCP) will map them to repo-relative POSIX paths;
  the domain retains absolute paths as the stable module IDs.
- **Exported kind for some forms is conservative.** `export default <local-identifier>`
  reports `constant` (the kind of the underlying symbol is not knowable from
  that statement alone); anonymous defaults use an `(anonymous)` placeholder.
- **`ScanResult` vs `DiscoveryResult`/`DependencyGraph`.** The full `ScanResult`
  type is forward-declared but not yet produced; `get_architecture`-style
  aggregation is future work.
- **Coverage unverified.** 80% thresholds configured but not validated
  (`@vitest/coverage-v8` not installed).
- **Git analysis is commit-count/churn/contributors/recent-focused, not a
  forensic history engine.** It does not reconstruct branch topology, blame
  per line, author date-vs-committer date, or submodule/ref state.
- **Rename tracking is path-level.** Churn is attributed to the post-rename
  path; git's `-M` similarity scoring is not used, so a heavily-edited rename
  may appear as delete+add rather than a single rename.
- **JS/TS only.** Python/other language analyzers are explicitly out of the
  near-term MVP.
- **Config detection heuristic.** `isConfigFile` matches a curated basename
  set + dot-rc patterns; not exhaustive for every ecosystem.

## 15. Future Development

- **Findings / Hotspots:** deterministic rules over the computed model
  (structure + complexity + Git churn) to surface risk and debt.
- **CLI polish:** richer scan/report output.
- **MCP Server:** first-class interface exposing scan/architecture/dependency/
  git/finding tools.
- **AI Reasoning Layer** (optional): explanation and prioritization on top
  of the deterministic data — never as the source of truth.
- **Change Validation** — impact assessment for proposed changes.

## 16. Current Status Summary

- Phases 1A, 1B, 1C, 1D and 1E are **complete and verified**.
- 142 tests pass (129 previous + 13 new Git tests);
  build/typecheck/lint/format/CLI smoke all pass.
- The repository is a Git repository on branch `master`, pushed to
  `origin` (`https://github.com/jordan-chris191/codebase-doctor.git`).
- **Next task:** Findings / Hotspots (not started).
- **Blockers:** none.

# Codebase Doctor — Development Progress

## Current Phase

**CLI polish**

Status: **COMPLETE** (verified)

---

## Current Status

- Phases 1A (Foundation), 1B (Repository Discovery), 1C (TypeScript/JavaScript
  Analysis), 1D (Dependency Graph), 1E (Git Analysis), Findings / Hotspots and
  CLI polish are **COMPLETE** and verified.
- The repository is a Git repository on branch `master`, pushed to
  `origin` (`https://github.com/jordan-chris191/codebase-doctor.git`).
- No work is blocked.
- The next phase (MCP Server) has **not** started.

---

## Completed Phases

### Phase 1A — Foundation

**Status: COMPLETE**

- TypeScript project foundation (strict, ESM, `NodeNext`)
- CLI foundation (commander)
- Domain types (`src/types`)
- Analyzer interfaces + error handling (`src/analyzers`)
- Vitest + ESLint + Prettier configuration
- Build/typecheck/test/lint/format pipeline

**Verification: PASS** — build, typecheck, test, lint, format:check.

### Phase 1B — Repository Discovery

**Status: COMPLETE**

Implemented:

- `createScanner()` — resolves a path to a canonical directory, validates it
  (throws `PathNotFoundError` / `PathIsFileError` for bad input)
- Git detection (presence of `.git`) without history analysis
- Recursive file-tree discovery (`src/scanner`)
- `.gitignore` semantics via the `ignore` package, scoped per-directory
- Always-excluded dirs: `.git`, `node_modules`, `dist`, `build`, `coverage`,
  `.codebase-doctor`
- Never-follow-symlinks safety (symlinked files and dirs skipped)
- POSIX-relative paths in results regardless of host OS
- Deterministic `ScannedFileMetadata`: path, size, line count, isSource,
  isTest, isConfig, category
- Streaming line counting (never loads file contents into memory)
- Binary-file safety
- Unreadable-file reporting (scan continues, reported at end)
- CLI `scan` command wired to real discovery + human-readable summary
- Fixture repository + 27 scanner/unit tests (32 total including types/CLI)

**Verification:**

- `npm run build` — PASS
- `npm run typecheck` — PASS
- `npm run test` — PASS (32 tests)
- `npm run lint` — PASS
- `npm run format:check` — PASS
- CLI smoke test (scan `D:\Projects\CodeBaseDoctor`) — PASS
  (`41 files, 12 dirs, 36ms`)

### Phase 1C — TypeScript/JavaScript Analysis

**Status: COMPLETE**

Implemented:

- Canonical analyzer using the **TypeScript Compiler API** directly
  (`src/analyzers/typescript.ts`); `typescript` moved to runtime dependencies.
- `TypeScriptAnalyzer implements LanguageAnalyzer`; `createTypeScriptAnalyzer()`
  factory; `canHandle` reuses `languageForPath()`.
- TS/TSX/JS/JSX via per-extension `ScriptKind` (`src/analyzers/script-kind.ts`).
- Import/reference extraction (`src/analyzers/imports.ts`): static, type-only,
  side-effect, dynamic (`import()`), `import type` edges, recognized CommonJS
  `require()`, and `export … from "…"` references — specifiers captured
  exactly, never resolved (resolution is Phase 1D).
- Export extraction (`src/analyzers/exports.ts`) into `ModuleExport`: functions,
  classes, constants, types, interfaces, enums, namespaces, named/aliased
  re-exports (`export { a as b }`), `export type { … } from`, `export * as ns`,
  `export * from` (reference only), and default exports (named, anonymous).
- Function/class name extraction (`src/analyzers/symbols.ts`): declared
  functions + nested scopes, named function expressions; class declarations;
  arrows/anonymous skipped; class methods excluded (recorded for complexity).
- Deterministic cyclomatic complexity (`src/analyzers/complexity.ts`):
  `1 + decision points` over `if`, loops, `switch` cases, ternary,
  `&&`/`||`, `catch`.
- `FileAnalysis` assembly parses once and derives all fields from one AST;
  deterministic `summary` derived from the same data
  (`src/analyzers/summary.ts`).
- Syntax errors → existing `FileParseError` (per-file, never crashes a scan);
  unsupported extensions rejected before parsing; runtime internal API
  (`parseDiagnostics`) read via a typed read.
- 65 focused analyzer tests (`test/analyzer/`) covering imports, exports,
  functions, classes, complexity, all four languages, and edge cases.

Domain model additions (`src/types/module.ts`), both additive:
`ExportKind` gained `"namespace"`; `ModuleExport` gained optional `source`
(present iff `isReExport`) so Phase 1D can build export edges without a second
parse.

**Verification:**

- `npm run build` — PASS
- `npm run typecheck` — PASS
- `npm run test` — PASS (97 tests: 32 existing + 65 new)
- `npm run lint` — PASS
- `npm run format:check` — PASS
- CLI smoke test (scan `D:\Projects\CodeBaseDoctor`) — PASS
  (`57 files, 15 dirs, (documentation: 6, config: 7, unknown: 1, source: 43)`)
- Analyzer self-analysis (analyzed `imports.ts`, `exports.ts` directly) — PASS

**Coverage (not verified):** `@vitest/coverage-v8` is not installed, so the
80% thresholds were never run. This is a pre-existing gap from Phase 1A, not
introduced by 1C; no coverage percentage is claimed.

### Phase 1D — Dependency Graph

**Status: COMPLETE**

Implemented:

- **Module resolution** (`src/dependencies/resolver.ts`): repository-aware
  `ts.resolveModuleName` — honors `tsconfig.json` (`baseUrl`, `paths`,
  moduleResolution, module) when present; defaults to ESM/NodeNext
  otherwise. Resolves relative/extensionless/parent-relative, TSX/JS/JSX,
  directory/index, and `paths` aliases.
- **Classification** — every reference resolves to `internal` (inside repo
  root), `external` (`isExternalLibraryImport`/`node_modules`/outside root),
  or `unresolved` (kept, never silently discarded).
- **Graph** (`src/dependencies/graph.ts`): `buildDependencyGraph(discovery,
  analyses)` consumes scanner output + Phase 1C `FileAnalysis` (references +
  re-export `source`) and produces a deterministic `DependencyGraph` with
  nodes, edges, cycles, and unresolved. Edge = `kind` (classification) +
  `type` (static/type-only/dynamic/commonjs/side-effect) + `weight`.
- **Re-exports** — `export {x} from "./m"` / `export * as ns` = **static**
  edges; pure `export * from` = **side-effect** edge. No symbol-level
  resolution.
- **Cycle detection** (`src/dependencies/cycles.ts`): Tarjan SCC + canonical
  per-SCC enumeration; simple/longer/multiple/self cycles reported once,
  deterministically.
- **Domain** (`src/types/dependency.ts`): `DependencyGraph`, `DependencyNode`,
  `UnresolvedDependency`, `DependencyClassification`; `DependencyEdge` gained
  `kind`, `specifier`; `DependencyType = ImportType`.
- 32 new dependency tests (`test/dependencies/`); 129 tests total.

**Verification:**

- `npm run build` — PASS
- `npm run typecheck` — PASS
- `npm run test` — PASS (129 tests: 97 existing + 32 new)
- `npm run lint` — PASS
- `npm run format:check` — PASS
- CLI smoke test (scan `D:\Projects\CodeBaseDoctor`) — PASS
  (`64 files, 17 dirs`)
- Deterministic graph output verified across equivalent fixture repos.

**Coverage (not verified):** `@vitest/coverage-v8` not installed (pre-existing);
no coverage percentage claimed.

Phase 1D acceptance criteria (all met):

- [x] Repository-aware module resolution (relative, extensionless, parent,
  index/dir, `paths` aliases)
- [x] Internal / external / unresolved classification
- [x] Re-exports (`export {x} from`, `export * from`, `export * as ns`)
- [x] CommonJS `require()` follows internal/external classification
- [x] Dynamic and type-only imports participate in the graph
- [x] Deterministic, sorted graph output (no traversal-order dependence)
- [x] Duplicate edges collapsed into weighted edges
- [x] Cycle detection (simple / longer / multiple / self) — canonical + unique
- [x] Unresolved references retained (not silently discarded)
- [x] Repository-boundary safety (no escaping path becomes internal)
- [x] tsconfig honored (`baseUrl`, `paths`, module resolution)
- [x] No second parser; TS Compiler API is the single source of truth
- [x] Analyzer/CLI/MCP decoupled (pure `buildDependencyGraph`)
- [x] Focused dependency tests exist (32 added; 129 total)
- [x] Existing Phase 1A–1C tests continue to pass
- [x] Typecheck / lint / build / format:check pass
- [x] Phase 1E NOT implemented in 1D; no Git/hotspot/findings/UI scope creep

### Phase 1E — Git Analysis

**Status: COMPLETE**

Implemented:

- **Batch Git analysis** (`src/git/`): `analyzeGitRepository(rootPath, { recentLimit? })`
  → `RepoStats`, using Git CLI via `child_process.execFile` (no shell, Windows-safe),
  no new dependencies.
- **Commit statistics** — `totalCommits` (all), `firstCommitDate`/`lastCommitDate`
  (ISO-8601 `%aI`).
- **File churn** — `fileChurn[]` (`path`, `commitCount`, `additions`, `deletions`,
  `churn`), aggregated from one `git log --numstat` batch (no per-file git).
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
- 13 new Git tests (`test/git/`); 142 tests total.

**Verification:**

- `npm run build` — PASS
- `npm run typecheck` — PASS
- `npm run test` — PASS (142 tests: 129 existing + 13 new)
- `npm run lint` — PASS
- `npm run format:check` — PASS
- CLI smoke (`git` + `scan`) — PASS

**Coverage (not verified):** `@vitest/coverage-v8` not installed (pre-existing);
no coverage percentage claimed.

### Findings / Hotspots

**Status: COMPLETE**

Implemented:

- **Deterministic rule engine** (`src/findings/`): `rules.ts`, `engine.ts`,
  `hotspots.ts`, `types.ts`, `index.ts`. Consumes Phase 1A–1E outputs only
  (never re-parses, re-scans, or re-resolves).
- **Rules** (explicit thresholds, each finding carries measured/threshold):
  - `high-complexity` — complexity ≥ 15 (severity high)
  - `high-churn` — churn (add+del) ≥ 200 (medium)
  - `high-fan-out` — distinct internal deps ≥ 20 (medium)
  - `high-fan-in` — distinct internal dependents ≥ 10 (low)
  - `dependency-cycle` — member of a cycle (high)
  - `large-complex-file` — lines ≥ 800 AND complexity ≥ 15 (high)
- **Finding model** extended (`src/types/finding.ts`): `ruleId`, `measured`,
  `threshold`, `evidence` added; categories added (`churn`, `fan-in`,
  `fan-out`).
- **Hotspot** (`src/types/stats.ts`): replaced opaque normalized scores with
  explicit `signals` (complexity, churn, fanIn, fanOut, inCycle), `findings`
  (contributing ruleIds), `ranking` (count of ≥2 priority signals). No opaque
  composite score.
- **CLI** — new `codebase-doctor findings [path] [--recent N]` command.
- Deterministic ordering (severity/ruleId/path/measured; hotspots ranking/path).
- 25 findings tests (`test/findings/`); 167 tests total.

**Verification:**

- `npm run build` — PASS
- `npm run typecheck` — PASS
- `npm run test` — PASS (167 tests: 142 existing + 25 new)
- `npm run lint` — PASS
- `npm run format:check` — PASS
- CLI smoke (`findings`, `scan`, `git`) — PASS
- Determinism: `findings` output identical across two runs — PASS

**Coverage (not verified):** `@vitest/coverage-v8` not installed (pre-existing);
no coverage percentage claimed.

### CLI polish

**Status: COMPLETE**

Implemented:

- **Analysis engine** (`src/engine.ts`): `scanRepository(rootPath)` runs the full
  deterministic pipeline ONCE (discovery → TS/JS analysis → dependency graph →
  Git → findings/hotspots) and aggregates everything into a canonical
  `ScanResult`. Single source of truth for the CLI and future MCP/AI; no
  re-scan/re-parse/re-git.
- **Persistent `ScanResult`** — the existing canonical type is now PRODUCED:
  `languages`, `files` (FileInfo, POSIX paths, `codeLineCount`≈`lineCount`),
  `modules`, `dependencies`, `cycles`, `stats` (null for non-Git), `findings`,
  `hotspots`. Git analysis is best-effort (non-Git → `stats: null`).
- **`--json` mode** — `codebase-doctor scan --json` and
  `codebase-doctor findings --json` emit stable JSON on **stdout only**;
  diagnostics go to stderr. Errors in JSON mode emit a structured
  `{"error":{...}}` document. `scan --json` produces deterministic
  repository-derived data; `scanTimestamp` and `durationMs` are intentionally
  time-varying fields, so determinism tests normalize these fields before
  comparison.
- **Human-readable report** — `codebase-doctor scan` prints concise sections:
  Repository, Files, Code analysis, Dependencies, Git, Findings, Hotspots.
- **Command architecture** — presentation separated from analysis; engine is
  the orchestrator, CLI formats the resulting `ScanResult`.
- 8 new CLI/engine tests (`test/cli/`); 175 tests total.

**Verification:**

- `npm run build` — PASS
- `npm run typecheck` — PASS
- `npm run test` — PASS (175 tests: 167 existing + 8 new)
- `npm run lint` — PASS
- `npm run format:check` — PASS
- CLI smoke (`scan`, `scan --json`, `git`, `findings`) — PASS
- JSON parsed via Node; deterministic repository-derived data across two runs
  (after normalizing `scanTimestamp`/`durationMs`) — PASS

**Coverage (not verified):** `@vitest/coverage-v8` not installed (pre-existing);
no coverage percentage claimed.

---

Phase 1C acceptance criteria (all met):

- [x] TypeScript Compiler API used as the canonical parser
- [x] TS/TSX/JS/JSX supported
- [x] Imports extracted (static)
- [x] Type-only imports distinguished
- [x] Side-effect imports distinguished
- [x] Dynamic imports distinguished
- [x] CommonJS `require()` recognized appropriately
- [x] Exports extracted (all `ExportKind`s)
- [x] Functions extracted
- [x] Classes extracted
- [x] Deterministic complexity calculated
- [x] `FileAnalysis` correctly populated
- [x] Analyzer errors handled per the existing contract
- [x] Analyzer integrated without coupling to CLI/MCP
- [x] Phase 1D dependency graph NOT implemented
- [x] Focused analyzer tests exist (65 added)
- [x] Existing tests continue to pass
- [x] Typecheck passes
- [x] Lint passes
- [x] Build passes
- [x] Format check passes
- [x] Documentation accurately reflects the implementation

---

## Verification Status

| Check | Status |
|---|---|
| `npm run build` | PASS |
| `npm run typecheck` | PASS |
| `npm run test` | PASS (97 tests) |
| `npm run lint` | PASS |
| `npm run format:check` | PASS |
| CLI `scan` smoke test | PASS |

Coverage thresholds (80%) are configured but have **not** been run/verified
(`@vitest/coverage-v8` is not installed — pre-existing since Phase 1A).

---

## Acceptance Criteria

Phase 1B acceptance criteria (all met):

- [x] Repository discovery implemented
- [x] `.gitignore` semantics implemented correctly
- [x] Excluded directories handled
- [x] File metadata generated
- [x] Paths normalized to POSIX `/`
- [x] Symlink escape handling
- [x] Fixture tests added
- [x] Real repository smoke test passes
- [x] Build passes
- [x] Typecheck passes
- [x] Tests pass
- [x] Lint passes
- [x] Format check passes

---

## Verification Status

| Check | Status |
|---|---|
| `npm run build` | PASS |
| `npm run typecheck` | PASS |
| `npm run test` | PASS (32 tests) |
| `npm run lint` | PASS |
| `npm run format:check` | PASS |
| CLI `scan` smoke test | PASS |

Coverage thresholds (80%) are configured but have **not** been run/verified.

---

## Blockers

None.

---

## Next Task

### MCP Server (NOT STARTED)

A Model Context Protocol server exposing the deterministic engine
(`scanRepository` → `ScanResult`) as MCP tools. The engine's clean
CLI/MCP/AI boundary from CLI polish makes MCP a thin consumer.

Planned objectives:

- MCP tool(s): `scan` / `analyze_repository` returning the canonical
  `ScanResult`
- Deterministic, structured output (no AI, no re-parsing)
- No change to the engine; MCP is a thin consumer

Do NOT start the MCP Server phase until explicitly instructed.

---

## Future Phases

1. Phase 1A — Foundation — **COMPLETE**
2. Phase 1B — Repository Discovery — **COMPLETE**
3. Phase 1C — TypeScript/JavaScript Analysis — **COMPLETE**
4. Phase 1D — Dependency Graph — **COMPLETE**
5. Phase 1E — Git Analysis — **COMPLETE**
6. Findings / Hotspots — **COMPLETE**
7. CLI polish — **COMPLETE**
8. MCP Server — **NEXT, not started**
9. Claude Code Integration
10. AI Reasoning Layer (optional, after deterministic core)
11. Change Validation
12. Optional Dashboard (explicitly out of near-term scope)

---

## Session Log

## 2026-09-07

- Completed the CLI polish phase.
- Analysis engine (`src/engine.ts`): `scanRepository` runs the full pipeline
  once and produces the canonical `ScanResult` (single source of truth).
- CLI `scan` now reports the engine output; `--json` on `scan`/`findings`
  emits stable JSON on stdout (diagnostics to stderr; structured JSON errors).
- Added 8 CLI/engine tests (175 total passing); build/typecheck/lint/format PASS.
- Coverage still unverified (`@vitest/coverage-v8` not installed — pre-existing).

Next action:
Begin the MCP Server phase when instructed. Read this file and REPORT.md first.

## 2026-09-07 (earlier)

- Completed the Findings / Hotspots phase.
- Deterministic rule engine (`src/findings/`): `high-complexity` (≥15),
  `high-churn` (≥200), `high-fan-out` (≥20), `high-fan-in` (≥10),
  `dependency-cycle`, `large-complex-file` (≥800 lines AND complexity ≥15).
- Finding model extended (`ruleId`, `measured`, `threshold`, `evidence` /
  `churn`/`fan-in`/`fan-out` categories); `Hotspot` now exposes explicit
  `signals` + `findings` + `ranking` (no opaque score).
- CLI added `codebase-doctor findings [--recent N]`; output verified
  deterministic (two runs identical).
- Added 25 findings tests (167 total passing); build/typecheck/lint/format PASS.
- Coverage still unverified (`@vitest/coverage-v8` not installed — pre-existing).

Next action:
Begin CLI polish when instructed. Read this file and REPORT.md first.

## 2026-09-07 (earlier)

- Completed Phase 1E (Git Analysis).
- Batch Git analysis (`src/git/`): `analyzeGitRepository` → `RepoStats`;
  commit count, first/last dates, contributors, file churn, recent activity.
- Policies: merges in totals but not churn; renames to post-rename path;
  binary churn counted with zero numerics; empty repo = all-null shape.
- Errors: `NotAGitRepositoryError`, `GitUnavailableError`, `GitCommandError`,
  `GitOutputError`. CLI added `codebase-doctor git [--recent N]`.
- Added 13 Git tests (142 total passing); build/typecheck/lint/format PASS.
- Coverage still unverified (`@vitest/coverage-v8` not installed — pre-existing).

Next action:
Begin the Findings/Hotspots phase when instructed. Read this file and REPORT.md
first.

## 2026-09-07 (earlier)

- Completed Phase 1D (Dependency Graph).
- Repository-aware `ts.resolveModuleName`; internal/external/unresolved
  classification; deterministic edges, cycles (Tarjan SCC), unresolved list.
- Domain evolved (`DependencyGraph`, `DependencyNode`, `UnresolvedDependency`,
  `DependencyClassification`, `DependencyEdge.kind/specifier`).
- Added 32 dependency tests (129 total passing); build/typecheck/lint/format PASS.
- Coverage still unverified (`@vitest/coverage-v8` not installed — pre-existing).

Next action:
Begin Phase 1E (Git Analysis) when instructed. Read this file and REPORT.md
first.

## 2026-09-07 (earlier)

- Completed Phase 1C (TypeScript/JavaScript Analysis).
- Chose the TypeScript Compiler API as the canonical AST/analysis engine.
- Added 65 analyzer tests (97 total passing); build/typecheck/lint/format PASS.
- Coverage still unverified (`@vitest/coverage-v8` not installed).

Next action:
Begin Phase 1D (Dependency Graph) when instructed. Read this file and
REPORT.md first.

## 2026-09-06

- Completed Phase 1A (Foundation).
- Completed Phase 1B (Repository Discovery).
- Synchronized CLAUDE.md / PROGRESS.md / REPORT.md.

Next action:
Begin Phase 1C when instructed. Read this file and REPORT.md first.

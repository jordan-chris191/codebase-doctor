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
                                  └──► Analyzer (parsing, Phase 1C+) ──► Domain model
                                        (future)                 │
                                                                 └──► MCP (future)
```

Layers:

- **Domain model** (`src/types`) — pure, readonly, dictionary-shaped types.
  No classes, no behavior, no hidden logic. The single vocabulary shared by
  every layer.
- **Scanner** (`src/scanner`) — repository/file-tree discovery. Produces
  deterministic `ScannedFileMetadata` per file. Independent from the CLI.
- **Analyzers** (`src/analyzers`) — define the `LanguageAnalyzer` contract
  and `FileAnalysis` for language parsing. Only interfaces exist so far;
  the concrete TypeScript analyzer is Phase 1C.
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

## 7. Development Phases

1. **Phase 1A — Foundation** — COMPLETE
2. **Phase 1B — Repository Discovery** — COMPLETE
3. **Phase 1C — TypeScript/JavaScript Analysis** — NEXT, NOT STARTED
4. **Phase 1D — Dependency Graph** — PLANNED
5. **Phase 1E — Git Analysis** — PLANNED
6. **Findings / Hotspots** — PLANNED
7. **CLI polish** — PLANNED
8. **MCP Server** — PLANNED (first-class interface)
9. **Claude Code Integration** — PLANNED
10. **AI Reasoning Layer** — PLANNED (optional, after deterministic core)
11. **Change Validation** — PLANNED
12. **Optional Dashboard** — PLANNED (out of near-term scope)

## 8. Current Phase

**Phase 1B (Repository Discovery)** is COMPLETE and verified. The next
phase, **Phase 1C (TypeScript/JavaScript Analysis)**, has not started.

## 9. Domain Model

Defined in `src/types`. All are pure, readonly, dictionary-shaped types.

- **`Language`** (`language.ts`) — `typescript | typescript-jsx |
  javascript | javascript-jsx`. Exports `LANGUAGES`, a deep-frozen constant
  lookup table of extension → language.
- **`FileInfo` / `FileKind`** (`file.ts`) — descriptive per-file metadata
  (path, language, size, line counts, isTest, isConfig, kind).
- **`Module`, `ModuleExport`, `ModuleReference`, `ExportKind`** (`module.ts`)
  — a module's exported symbols and its reference relationships.
- **`DependencyEdge`, `DependencyCycle`** (`dependency.ts`) — dependency
  graph edges and cycle groups. **Not yet produced** by any analyzer; types
  are forward-declared for Phases 1C/1D.
- **`Finding`, `FindingCategory`, `FindingLocation`** (`finding.ts`) —
  issue/observation model for the later findings phase. Types exist; no
  finding rules are implemented yet.
- **`Hotspot`, `RepoStats`** (`stats.ts`) — risk and git aggregate types.
  Not yet produced; forward-declared.
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
- **Pending decision (do not pre-empt):** choose ONE dependency-analysis
  engine for Phase 1D (ts-morph vs. dependency-cruiser) to honor the
  single-source-of-truth constraint. Not yet decided.

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

## 12. Testing and Verification

- **32 tests** across 5 files:
  - `test/unit/types.test.ts` (3) — LANGUAGES immutability, ScanResult schema
  - `test/unit/cli.test.ts` (2) — command registration, version
  - `test/scanner/paths.test.ts` (11) — path normalization, test/config detection
  - `test/scanner/errors.test.ts` (3) — path error types + messages
  - `test/scanner/discovery.test.ts` (13) — full discovery behavior
- **Fixture repos** built at runtime in a temp dir via
  `test/helpers/fs.ts` + `test/fixtures/kitchen-sink.ts`; cleaned up
  automatically.
- **Coverage** thresholds configured at 80% but not yet run/verified.
- **Verification pipeline** (all PASS as of 2026-09-06):
  build, typecheck, test (32), lint, format:check, and a CLI smoke test
  against the project itself: `41 files, 12 dirs, (config: 7, unknown: 1,
  documentation: 3, source: 30), took ~33ms`, `isGitRepository: false`.

## 13. Dependencies

**Runtime:**

- `commander` (^13) — CLI argument parsing
- `ignore` (^7) — gitignore semantics

**Dev:**

- `typescript` (^5.7), `vitest` (^3), `eslint` (^9), `@eslint/js` (^9),
  `typescript-eslint` (^8), `prettier` (^3), `@types/node` (^22),
  `ts-node` (^10.9)

No analyzer/parser dependency has been added yet; the choice is deferred to
Phase 1C (see §10).

## 14. Known Limitations

- **Discovery only.** Git history, dependency graph, findings, complexity,
  and test-coverage enrichment are not yet implemented (later phases).
- **Single-project.** Monorepo workspace awareness is out of scope for now.
- **`ScanResult` vs `DiscoveryResult`.** The full `ScanResult` type is
  forward-declared but not yet produced; `get_architecture`-style
  aggregation is future work.
- **Coverage unverified.** 80% thresholds configured but not validated.
- **Not a Git repository.** The project itself has no `.git`; the scanner
  correctly reports `isGitRepository: false`.
- **JS/TS only.** Python/other language analyzers are explicitly out of the
  near-term MVP.
- **Config detection heuristic.** `isConfigFile` matches a curated basename
  set + dot-rc patterns; not exhaustive for every ecosystem.

## 15. Future Development

- **Phase 1C:** TypeScript/JavaScript analysis — choose parser (ts-morph vs.
  TS compiler API vs. dependency-cruiser) decisively; extract imports,
  exports, functions/classes, cyclomatic complexity; produce `FileAnalysis`;
  enrich scanned files.
- **Phase 1D:** Dependency graph and circular-dependency detection with a
  single chosen engine.
- **Phase 1E:** Git analysis (commit count, churn, last modification,
  contributors, recent activity) — efficient batch `git` operations.
- **Findings / Hotspots:** deterministic rules over the computed model.
- **CLI polish:** richer scan reports.
- **MCP Server:** first-class interface exposing scan/architecture/dependency
  /hotspot/finding tools.
- **AI Reasoning Layer** (optional): explanation and prioritization on top
  of the deterministic data — never as the source of truth.
- **Change Validation** — impact assessment for proposed changes.

## 16. Current Status Summary

- Phases 1A and 1B are **complete and verified**.
- 32 tests pass; build/typecheck/lint/format/CLI smoke all pass.
- The repository is not a Git repository (`isGitRepository: false`).
- **Next task:** Phase 1C, TypeScript/JavaScript Analysis (not started).
- **Blockers:** none.

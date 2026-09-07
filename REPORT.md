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

## 7. Development Phases

1. **Phase 1A — Foundation** — COMPLETE
2. **Phase 1B — Repository Discovery** — COMPLETE
3. **Phase 1C — TypeScript/JavaScript Analysis** — COMPLETE
4. **Phase 1D — Dependency Graph** — NEXT, NOT STARTED
5. **Phase 1E — Git Analysis** — PLANNED
6. **Findings / Hotspots** — PLANNED
7. **CLI polish** — PLANNED
8. **MCP Server** — PLANNED (first-class interface)
9. **Claude Code Integration** — PLANNED
10. **AI Reasoning Layer** — PLANNED (optional, after deterministic core)
11. **Change Validation** — PLANNED
12. **Optional Dashboard** — PLANNED (out of near-term scope)

## 8. Current Phase

**Phase 1C (TypeScript/JavaScript Analysis)** is COMPLETE and verified. The
next phase, **Phase 1D (Dependency Graph)**, has not started.

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
  carries an optional `source` (present iff `isReExport`) so Phase 1D can build
  export edges without a second parse. `ModuleReference` uses `ImportType`
  (`static | type-only | dynamic | commonjs | side-effect`) and a `kind`
  (`internal` currently; `external` reserved for resolution in Phase 1D).
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

## 12. Testing and Verification

- **97 tests** across 10 files:
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
- **Fixture repos** built at runtime in a temp dir via
  `test/helpers/fs.ts` + `test/fixtures/kitchen-sink.ts`; cleaned up
  automatically. Analyzer tests analyze content in memory (no fixtures).
- **Coverage** thresholds configured at 80% but not yet run/verified
  (`@vitest/coverage-v8` not installed).
- **Verification pipeline** (all PASS as of 2026-09-07):
  build, typecheck, test (97), lint, format:check, and a CLI smoke test
  against the project itself: `57 files, 15 dirs, (documentation: 6,
  config: 7, unknown: 1, source: 43), took ~39ms`, `isGitRepository: true`.

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

- **Dependency resolution / graph not yet built.** The analyzer captures
  module references and export edges per file; resolving specifiers to files
  and constructing `DependencyEdge`/`DependencyCycle` graphs is Phase 1D.
- **Per-file syntax analysis only.** Phase 1C parses one file at a time; it
  does not type-check a project or do cross-file resolution.
- **`ModuleReference.kind` is currently always `internal`.** `external`
  (package) classification is reserved for Phase 1D resolution.
- **Exported kind for some forms is conservative.** `export default <local-identifier>`
  reports `constant` (the kind of the underlying symbol is not knowable from
  that statement alone); anonymous defaults use an `(anonymous)` placeholder.
- **Single-project.** Monorepo workspace awareness is out of scope for now.
- **`ScanResult` vs `DiscoveryResult`.** The full `ScanResult` type is
  forward-declared but not yet produced; `get_architecture`-style
  aggregation is future work.
- **Coverage unverified.** 80% thresholds configured but not validated
  (`@vitest/coverage-v8` not installed).
- **Git history not yet analyzed.** The scanner detects whether `.git` is
  present (`isGitRepository`) but does not analyze commit history; that is
  Phase 1E. The project itself is a Git repository on GitHub.
- **JS/TS only.** Python/other language analyzers are explicitly out of the
  near-term MVP.
- **Config detection heuristic.** `isConfigFile` matches a curated basename
  set + dot-rc patterns; not exhaustive for every ecosystem.
- **Single-project.** Monorepo workspace awareness is out of scope for now.
- **`ScanResult` vs `DiscoveryResult`.** The full `ScanResult` type is
  forward-declared but not yet produced; `get_architecture`-style
  aggregation is future work.
- **Coverage unverified.** 80% thresholds configured but not validated.
- **Git history not yet analyzed.** The scanner detects whether `.git` is
  present (`isGitRepository`) but does not analyze commit history; that is
  Phase 1E. The project itself is a Git repository on GitHub.
- **JS/TS only.** Python/other language analyzers are explicitly out of the
  near-term MVP.
- **Config detection heuristic.** `isConfigFile` matches a curated basename
  set + dot-rc patterns; not exhaustive for every ecosystem.

## 15. Future Development

- **Phase 1D:** Dependency graph over the Phase 1C `FileAnalysis` — resolve
  `ModuleReference.source`/`ModuleExport.source` to files, classify internal
  vs. external, build `DependencyEdge`s and detect `DependencyCycle`s, using
  the TS Compiler API as the single engine.
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

- Phases 1A, 1B and 1C are **complete and verified**.
- 97 tests pass (32 previous + 65 new analyzer tests);
  build/typecheck/lint/format/CLI smoke all pass.
- The repository is a Git repository on branch `master`, pushed to
  `origin` (`https://github.com/jordan-chris191/codebase-doctor.git`).
- **Next task:** Phase 1D, Dependency Graph (not started).
- **Blockers:** none.

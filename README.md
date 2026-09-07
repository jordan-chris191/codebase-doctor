# Codebase Doctor

Structured, deterministic repository intelligence for AI coding agents, exposed through MCP.

## Overview

**Codebase Doctor** is a repository-intelligence engine that analyzes a codebase and produces a structured, deterministic model of its architecture — file tree, dependencies, module relationships, hotspots, findings, Git history, and configuration. This model is designed to be consumed by AI coding agents (such as Claude Code) through the Model Context Protocol (MCP).

When an AI agent works in an unfamiliar repository, it typically has to rediscover the architecture by reading many files — expensive, repetitive, and inconsistent between sessions. Codebase Doctor treats repository understanding as an artifact that can be computed once, shared, and queried, rather than something every agent session must reconstruct from scratch.

The project follows a **deterministic-first** philosophy: repository facts (structure, dependencies, cycles, complexity, churn) are computed by reproducible, testable code — never by an LLM. AI reasoning is a potential future layer that can explain or prioritize the deterministic output, but it is never the source of truth. This is not a generic file-search tool, not a RAG wrapper, and not an AI code generator.

> **Status: early development.** Codebase Doctor is under active construction. The current implementation covers repository discovery, per-file TypeScript/JavaScript analysis, a repository-level dependency graph, Git history analysis, deterministic findings/hotspots, a canonical aggregated `ScanResult` with JSON output, and an MCP server foundation exposing the engine as a tool (`scan_repository`) over stdio for AI coding agents. Additional MCP tools and AI reasoning are planned but not yet built.

## Current Status

The project is developed in phases. The current implementation provides **repository discovery** (Phase 1B), **TypeScript/JavaScript analysis** (Phase 1C), a **dependency graph** (Phase 1D), **Git analysis** (Phase 1E), **findings/hotspots**, a polished **CLI** with a canonical `ScanResult` on a strict TypeScript foundation (Phase 1A), and an **MCP server foundation** exposing `scan_repository` over stdio (Phase 1H).

| Phase | Status |
|---|---|
| Phase 1A — Foundation | ✅ Complete |
| Phase 1B — Repository Discovery | ✅ Complete |
| Phase 1C — TypeScript/JavaScript Analysis | ✅ Complete |
| Phase 1D — Dependency Graph | ✅ Complete |
| Phase 1E — Git Analysis | ✅ Complete |
| Findings / Hotspots | ✅ Complete |
| CLI polish | ✅ Complete |
| MCP Server (foundation + `scan_repository`) | ✅ Complete |

Later phases (Expand MCP Tool Set, AI Reasoning Layer, Change Validation) are planned but not yet started. See [Development Roadmap](#development-roadmap) below.

## Architecture

The current pipeline computes repository structure in discrete layers. The scanner, the TypeScript/JavaScript analyzer, the dependency graph, Git analysis, findings/hotspots, a canonical `ScanResult` engine, and an MCP server are implemented today; additional MCP tools and AI reasoning are planned.

```
Repository
    ↓
Repository Discovery (IMPLEMENTED)
    ↓
Language Analyzer: TS/TSX/JS/JSX (IMPLEMENTED — per-file FileAnalysis)
    ↓
Dependency Graph (IMPLEMENTED — resolution, edges, cycles)
    ↓
Git Analysis (IMPLEMENTED — commits, churn, contributors, recent)
    ↓
Findings / Hotspots (IMPLEMENTED — deterministic rules)
    ↓
ScanResult (IMPLEMENTED — canonical aggregated result; JSON output)
    ↓
MCP Server (IMPLEMENTED — scan_repository tool over stdio)
    ↓
AI Coding Agents
```

**Current (implemented):**

- **Scanner** (`src/scanner`) — walks a repository tree and produces deterministic, per-file metadata: relative POSIX path, size, line count, language, test/config classification. Gitignore-aware, symlink-safe, memory-efficient.
- **TypeScript/JavaScript analyzer** (`src/analyzers`) — parses TS/TSX/JS/JSX with the TypeScript Compiler API and produces a deterministic `FileAnalysis` per file: module references (imports — static, type-only, side-effect, dynamic, CommonJS `require()`), exports (functions, classes, constants, types, interfaces, enums, namespaces; named/aliased/type re-exports; default exports), function and class names, and cyclomatic complexity. Syntax errors surface as structured `FileParseError` rather than crashing a scan.
- **Dependency graph** (`src/dependencies`) — repository-aware module resolution via the TypeScript Compiler API (honoring `tsconfig.json` `baseUrl`/`paths`), classification into internal/external/unresolved, a deterministic `DependencyGraph` of weighted edges, and cycle detection (Tarjan SCC). Re-exports and CommonJS/dynamic/type-only imports participate.
- **Git analysis** (`src/git`) — deterministic repository-level Git facts via the Git CLI: commit count, first/last commit dates, contributors, per-file churn, and bounded recent activity. Batch commands (`--format`, `--numstat`), no per-file `git` processes, POSIX-normalized paths. Documented policies for merges, renames, and binary files.
- **Findings / Hotspots** (`src/findings`) — a deterministic rules engine over the Phase 1A–1E outputs: explicit thresholds for high complexity, high churn, high fan-in/out, dependency cycles, and large+complex files. Each finding carries the rule ID, severity, measured value, threshold, and evidence; hotspots expose raw signals (complexity, churn, fan-in/out, cycle) plus contributing findings, with no opaque composite score. Never AI.
- **Engine + ScanResult** (`src/engine.ts`) — `scanRepository(rootPath)` runs the full deterministic pipeline once and aggregates everything into the canonical `ScanResult` (languages, files, modules, dependencies, cycles, Git stats, findings, hotspots). Single source of truth for the CLI and MCP. No re-scan/re-parse/re-Git.
- **MCP Server** (`src/mcp/`) — an MCP server foundation using `@modelcontextprotocol/sdk` over stdio, exposing one tool: `scan_repository`. Calls the canonical engine and returns a compact, agent-oriented `ScanSummary` (projected from the full `ScanResult`, which stays deterministic and is the single source of truth) so the response fits within MCP tool-result size limits even on large repositories. A thin adapter — no engine, scanner, AST, dependency, Git, or findings logic is duplicated. Runs as `node dist/mcp/server.js`.
- **CLI** (`src/cli.ts`) — `scan` (human report or `--json`), `git`, `findings` (`--json`). JSON goes to stdout only; diagnostics to stderr; deterministic output.

**Foundation present (types only):**

- **Domain model** (`src/types`) — the shared vocabulary for the intended architecture (modules, dependencies, scan results, findings, hotspots). These types are defined and consumed by every layer.

**Planned (not yet built):**

- **Expanded MCP tool set** — additional tools exposing finer-grained queries over the canonical `ScanResult`.
- **AI reasoning layer** — optional explanations built on top of the deterministic data.

## Features

Currently implemented:

- **Repository discovery** — recursively discovers files under a given directory via an iterative, stack-based walk (no recursion-depth limits).
- **Git repository detection** — detects the presence of a `.git` directory (or worktree file) and reports it; does not analyze history.
- **`.gitignore`-aware discovery** — respects `.gitignore` semantics using the mature [`ignore`](https://www.npmjs.com/package/ignore) package, applied per-directory so rules are subtree-scoped exactly as in git. Trailing-slash directory patterns are handled correctly.
- **Directory exclusions** — always excludes `.git`, `node_modules`, `dist`, `build`, `coverage`, and `.codebase-doctor`, regardless of the repository's own `.gitignore`.
- **Symlink safety** — never follows symlinked files or directories, so discovery cannot escape the repository root.
- **POSIX path normalization** — every public path is slash-separated (`/`) regardless of host OS (Windows/POSIX).
- **File metadata** — deterministic per-file record: path, absolute path (internal), size in bytes, line count, source/test/config classification, and a file category.
- **Line counting** — streams files in fixed buffers, so arbitrarily large files are counted without loading contents into memory. Correctly handles no-trailing-newline and empty files.
- **Binary-file safety** — binary files are scanned as metadata and never crash the walk.
- **Error handling** — bad input paths raise structured errors (`PathNotFoundError`, `PathIsFileError`); unreadable files are reported in the result while the scan continues.
- **Deterministic scanning** — results are sorted and reproducible: the same repository produces the same output.
- **TypeScript/JavaScript analysis** — parses TS/TSX/JS/JSX with the TypeScript Compiler API (a single, canonical AST engine) and produces a deterministic `FileAnalysis` per source file.
- **Import/reference extraction** — module references with import type: static, type-only, side-effect, dynamic (`import()`), recognized CommonJS `require()`, and `export … from` sources. Specifiers are captured exactly; resolution is a later phase.
- **Export extraction** — functions, classes, constants, types, interfaces, enums, namespaces; local, aliased, type-only, and namespace re-exports; and default exports (named and anonymous).
- **Function & class extraction** — declared function names (including nested scopes and named expressions) and class names; arrows/anonymous omitted; class methods excluded from the function list.
- **Cyclomatic complexity** — deterministic McCabe metric (`1 + decision points` across `if`, loops, `switch` cases, ternaries, `&&`/`||`, `catch`).
- **Module resolution** — repository-aware resolution via the TypeScript Compiler API: relative, extensionless, parent-relative, TSX/JS/JSX, directory/index, and `tsconfig` `paths` aliases.
- **Internal/external/unresolved classification** — each dependency is classified where it actually resolves; unresolved references are retained, never silently dropped.
- **Dependency graph** — deterministic `DependencyGraph` of nodes and weighted, typed edges (`static`/`type-only`/`dynamic`/`commonjs`/`side-effect`), with stable ordering.
- **Re-export handling** — `export {x} from`, `export * from`, and `export * as ns` become the correct module-level edges.
- **Cycle detection** — deterministic (Tarjan SCC) detection of simple, longer, multiple, and self-cycles, each reported once.
- **Git analysis** — deterministic, batch Git facts: commit count, first/last commit dates (ISO-8601), contributors by identity, per-file churn (commitCount/additions/deletions/churn), and bounded recent activity.
- **Git policies** — merges count in totals but not churn/contributors; renames attributed to the post-rename path; binary changes counted as churn with zero numeric add/del; empty Git repos return an all-null shape (not an error).
- **Deterministic findings** — explicit rules with documented thresholds (`high-complexity` ≥15, `high-churn` ≥200, `high-fan-out` ≥20, `high-fan-in` ≥10, `dependency-cycle`, `large-complex-file`). Each finding exposes rule ID, severity, measured value, threshold, and evidence.
- **Expliable hotspots** — a file flagged by ≥2 priority rules is a hotspot that exposes raw `signals` (complexity, churn, fan-in/out, cycle) and contributing findings; no opaque composite score, no AI.
- **CLI integration** — `codebase-doctor scan [path]` runs the full pipeline and prints a concise human-readable report; `codebase-doctor git [path] [--recent N]` runs Git analysis; `codebase-doctor findings [path] [--recent N]` runs findings + hotspots.
- **`--json` output** — `codebase-doctor scan --json` and `codebase-doctor findings --json` emit stable, deterministic JSON (the canonical `ScanResult`) on stdout; diagnostics go to stderr; JSON-mode errors are machine-readable.
- **MCP server** — `node dist/mcp/server.js` starts an MCP server on stdio, exposing `scan_repository` (takes `{ rootPath: string }`, returns a compact `ScanSummary` — counts, languages, dependency totals, cycles, hotspots, notable findings, highest-risk files, and a bounded Git summary — projected from the canonical `ScanResult`). Thin adapter over the engine; no duplicated logic. Uses `@modelcontextprotocol/sdk` with stdio transport.

## Technology Stack

From `package.json` and project configuration:

- **Language:** TypeScript (strict), ESM (`module: NodeNext`)
- **Runtime:** Node.js ≥ 20
- **Compiler config:** `strict`, `isolatedDeclarations`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`
- **Runtime dependencies:** [`commander`](https://www.npmjs.com/package/commander) (CLI), [`ignore`](https://www.npmjs.com/package/ignore) (gitignore semantics), `typescript` (analysis engine), `@modelcontextprotocol/sdk` (MCP server)
- **Dev tooling:** Vitest (tests), ESLint 9 flat config + `typescript-eslint` (linting), Prettier (formatting)

## Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/jordan-chris191/codebase-doctor.git
cd codebase-doctor
npm install
```

**Prerequisites:** Node.js ≥ 20 and a package manager that reads `package-lock.json` (npm).

## Usage

Build the project first (`npm run build`), then run commands from `dist/`:

```bash
# Scan the current directory
node dist/cli.js scan

# Scan a specific path
node dist/cli.js scan /path/to/repository

# Emit the canonical ScanResult as JSON
node dist/cli.js scan /path/to/repository --json

# Run Git analysis on the current repository
node dist/cli.js git

# Run Git analysis with a custom recent-commit bound
node dist/cli.js git /path/to/repository --recent 20

# Run deterministic findings and hotspot analysis
node dist/cli.js findings

# Findings with a custom recent-commit bound
node dist/cli.js findings /path/to/repository --recent 20

# Help and version
node dist/cli.js --help
node dist/cli.js --version
```

### MCP server

Start the MCP server on stdio (exposes the `scan_repository` tool, which takes
`{ rootPath: string }` and returns a compact `ScanSummary` — repository counts,
language breakdown, dependency totals, cycles, hotspots, notable findings,
highest-risk files, and a bounded Git summary — projected from the full
canonical `ScanResult`):

```bash
node dist/mcp/server.js
```

Example output from scanning this repository with `scan`:

```
Scanned D:\Projects\CodeBaseDoctor
  isGitRepository: true
  41 files, 12 dirs, (config: 7, unknown: 1, documentation: 4, source: 29)
  took 34ms
```

On scan errors (e.g. a nonexistent path), the CLI prints a message to stderr and exits with code 1.

## Development

All commands are defined in `package.json`:

```bash
npm install        # install dependencies
npm run build      # compile TypeScript to dist/
npm run dev        # watch mode (tsc --watch)
npm run typecheck  # type-check without emitting (tsc --noEmit)
npm run test       # run the Vitest test suite
npm run test:watch # run tests in watch mode
npm run lint       # ESLint on src/ and test/
npm run lint:fix   # auto-fix lint issues
npm run format     # Prettier write
npm run format:check # verify formatting
```

## Project Structure

```
src/
├── analyzers/     # Language-analyzer contract + errors (interface only, Phase 1C)
├── mcp/           # MCP server adapter — scan_repository tool + stdio transport
├── scanner/       # Repository discovery (implemented)
├── types/         # Domain model — shared vocabulary for the architecture
├── utils/         # Path normalization, gitignore handling, file classification
├── index.ts       # Public package entry point
└── cli.ts         # CLI (commander)

test/
├── fixtures/      # Fixture repository builder for scanner tests
├── helpers/       # Test helpers (fixture creation, cleanup)
├── mcp/           # MCP server tests (in-memory transport)
├── scanner/       # Scanner, path, and error tests
└── unit/          # Types and CLI tests
```

## Testing

Testing uses [Vitest](https://vitest.dev/) with fixture repositories built at runtime in temporary directories.

Currently tested:

- **Scanner** (`test/scanner/discovery.test.ts`) — nested-directory discovery, source-extension detection, exclusion of `node_modules`/`.git`/`dist`/`build`/`coverage`/`.codebase-doctor`, `.gitignore` semantics (trailing-slash and negation patterns), git-repository detection, test/config classification, deterministic POSIX paths, line counts, binary-file handling, and symlink-safety.
- **Analyzer imports** (`test/analyzer/imports.test.ts`) — static/type-only/side-effect/dynamic/`require()` extraction, arbitrary-call rejection, re-export sources, nested dynamic imports, `import type` edges.
- **Analyzer exports** (`test/analyzer/exports.test.ts`) — all `ExportKind`s, aliased re-exports, `export type`/`export * as`/`export *`, anonymous/named defaults.
- **Analyzer functions & classes** (`test/analyzer/symbols.test.ts`) — declared/nested/named-expression functions, arrow/anonymous handling, method exclusion, class declarations/abstract/expressions.
- **Analyzer complexity** (`test/analyzer/complexity.test.ts`) — baseline, `if`, loops, `switch` cases, ternary, logical ops, `catch`, nested aggregation, determinism.
- **Analyzer languages & edge cases** (`test/analyzer/languages.test.ts`) — TS/TSX/JS/JSX, empty/comments-only source, syntax errors, unsupported extensions, duplicate imports, unusual-but-valid syntax, determinism.
- **Dependency graph** (`test/dependencies/graph.test.ts`) — relative/parent/extensionless resolution, TSX/JS/JSX, index/dir, external + scoped packages, `require()`, dynamic + type-only imports, re-exports, export-star, path aliases, unresolved (relative + package), boundary safety, duplicate collapse, deterministic ordering, mixed internal/external, nested structure.
- **Cycle detection** (`test/dependencies/cycles.test.ts`) — simple, longer, multiple, and self-cycles; deterministic order; stable equivalent input; diamond graphs produce no false cycles.
- **Git analysis** (`test/git/analysis.test.ts`) — multi-commit, single-commit, empty repo, non-Git dir, multiple contributors, add/modify/delete, multi-file commit, rename policy, recent-activity limit/order, determinism, POSIX path normalization, binary churn, merge policy. Fixtures use real temp Git repositories with local identity and fixed commit dates (never the user's global Git config or wall-clock).
- **Findings** (`test/findings/rules.test.ts`) — complexity/churn/fan-in/fan-out below/boundary/above thresholds, cycles (none/self/multi/multiple), large+complex files, hotspots (no/one/multiple signals, deterministic aggregation), determinism (repeated analysis identical), empty repos (no fabricated findings), and malformed upstream (missing analysis → no misleading findings).
- **MCP server** (`test/mcp/server.test.ts`) — real MCP round-trip via `InMemoryTransport` + `Client`: compact `ScanSummary` for a valid `rootPath`, structured tool errors for nonexistent path and file-not-directory, counts consistent with `scanRepository()` directly, compact field shapes, engine-failure never throws from `callTool`, a materially smaller response than the full `ScanResult`, preserved architectural signals, a bounded Git summary, and projection determinism.
- **Engine & CLI** (`test/cli/engine.test.ts`) — `scanRepository` aggregates the canonical `ScanResult`; per-run determinism; non-Git → `stats:null`; `--json` parses as valid JSON, is deterministic, keeps stdout clean (no headings/ANSI; stderr empty), emits structured JSON errors, and preserves existing `scan`/`git`/`findings` commands.
- **Paths & detection** (`test/scanner/paths.test.ts`) — POSIX path normalization, relative-path computation, test/config file detection.
- **Error handling** (`test/scanner/errors.test.ts`) — structured errors for missing/file paths.
- **Types & CLI** (`test/unit/`) — domain-model shape and CLI command registration.

**Latest verified result:** 185 tests passing across 16 files (`npm run test`).

> Coverage thresholds are configured in `vitest.config.ts`, but coverage has not yet been run (the coverage provider is not installed) and no coverage percentage is claimed.

## Development Roadmap

Planned phases:

- **Phase 1C — TypeScript/JavaScript Analysis** — ✅ Complete. Parses TS/TSX/JS/JSX via the TypeScript Compiler API to extract imports, exports, functions, classes, and cyclomatic complexity.
- **Phase 1D — Dependency Graph** — ✅ Complete. Repository-aware module resolution, internal/external/unresolved classification, a deterministic `DependencyGraph` of weighted edges, and cycle detection, all on the same TypeScript compiler AST used in Phase 1C.
- **Phase 1E — Git Analysis** — ✅ Complete. Deterministic Git history facts (commit count, first/last dates, contributors, per-file churn, recent activity) via batch Git CLI commands, with documented merge/rename/binary policies.
- **Findings / Hotspots** — ✅ Complete. A deterministic rules engine over structure + complexity + Git churn, with explicit thresholds and explainable, signal-exposing hotspots.
- **CLI polish** — ✅ Complete. A canonical `ScanResult` engine (`scanRepository`), a human-readable `scan` report, and stable `--json` output for `scan`/`findings`.
- **MCP Server (foundation + `scan_repository`)** — ✅ Complete. An MCP server over stdio exposing the canonical engine as a `scan_repository` tool (thin adapter, no duplicated logic); the tool now returns a compact `ScanSummary` projected from the full `ScanResult` so responses stay within MCP size limits on large repos.
- **Expand MCP Tool Set** — next planned phase: additional tools exposing finer-grained queries over the canonical `ScanResult`.

Further planned work: an AI reasoning layer (optional explanations on top of the deterministic core), change validation (impact assessment for proposed edits), and an optional dashboard — all explicitly out of the near-term scope.

## Design Principles

The project is guided by documented principles (see `CLAUDE.md` and `REPORT.md`):

- **Deterministic analysis first.** Repository facts are computed by reproducible, testable code — never by an LLM.
- **Single source of truth.** One engine per analysis concern; no competing dependency-resolution implementations.
- **Separation of scanning and analysis.** Discovery, parsing, the domain model, and interfaces are distinct layers with clear boundaries.
- **Minimal dependencies.** No dependency without a concrete reason; prefer the platform standard library and reuse mature packages for hard problems.
- **Testable, simple components.** Small composable modules and simple data structures over unnecessary abstraction.
- **Incremental development.** Work proceeds phase-by-phase; a phase is complete only when its acceptance criteria are verified.
- **MCP is an interface, not the engine.** The deterministic core is built first; MCP will consume it.
- **AI does not replace facts.** Where AI is added, it explains or prioritizes deterministic output — it never produces repository facts.

## Contributing

Codebase Doctor is developed phase-by-phase, and contributions should follow that structure:

- Work should fit within the project's phase plan — do not jump ahead to planned features.
- Meaningful changes should be accompanied by tests (the repo uses Vitest).
- The documentation/state files (`CLAUDE.md`, `PROGRESS.md`, `REPORT.md`) should stay synchronized with the actual state of the repository.
- Architectural changes should be deliberate and documented — this project values a carefully-chosen, minimal design over velocity.

There is no formal contribution or review process established yet; please open an issue or discussion before making large changes.

## License

The project's `package.json` declares an MIT license, but **no LICENSE file or other license text is present in the repository yet**. Until a license file is added, please treat the intended license as MIT.

## Repository

[GitHub — jordan-chris191/codebase-doctor](https://github.com/jordan-chris191/codebase-doctor)
# Codebase Doctor

Structured, deterministic repository intelligence for AI coding agents, exposed through MCP.

## Overview

**Codebase Doctor** is a repository-intelligence engine that analyzes a codebase and produces a structured, deterministic model of its architecture — file tree, dependencies, module relationships, hotspots, findings, Git history, and configuration. This model is designed to be consumed by AI coding agents (such as Claude Code) through the Model Context Protocol (MCP).

When an AI agent works in an unfamiliar repository, it typically has to rediscover the architecture by reading many files — expensive, repetitive, and inconsistent between sessions. Codebase Doctor treats repository understanding as an artifact that can be computed once, shared, and queried, rather than something every agent session must reconstruct from scratch.

The project follows a **deterministic-first** philosophy: repository facts (structure, dependencies, cycles, complexity, churn) are computed by reproducible, testable code — never by an LLM. AI reasoning is a potential future layer that can explain or prioritize the deterministic output, but it is never the source of truth. This is not a generic file-search tool, not a RAG wrapper, and not an AI code generator.

> **Status: early development.** Codebase Doctor is under active construction. The current implementation covers repository discovery only; analysis, dependency graphs, and MCP are planned but not yet built.

## Current Status

The project is developed in phases. The current implementation provides **repository discovery** (Phase 1B) on a strict TypeScript foundation (Phase 1A).

| Phase | Status |
|---|---|
| Phase 1A — Foundation | ✅ Complete |
| Phase 1B — Repository Discovery | ✅ Complete |
| Phase 1C — TypeScript/JavaScript Analysis | ⬜ Not Started |
| Phase 1D — Dependency Graph | ⬜ Not Started |
| Phase 1E — Git Analysis | ⬜ Not Started |

Later phases (Findings/Hotspots, MCP Server, AI Reasoning Layer, Change Validation) are planned but not yet started. See [Development Roadmap](#development-roadmap) below.

## Architecture

The current pipeline computes repository structure in discrete layers. The scanner is the only layer implemented today; everything downstream is planned.

```
Repository
    ↓
Repository Discovery (CURRENT — implemented)
    ↓
Canonical Analysis Model (FOUNDATION — domain types exist; full model planned)
    ↓
Analysis Layers: parser, dependency graph, git history (PLANNED)
    ↓
MCP Server (PLANNED — not yet built)
    ↓
AI Coding Agents
```

**Current (implemented):**

- **Scanner** (`src/scanner`) — walks a repository tree and produces deterministic, per-file metadata: relative POSIX path, size, line count, language, test/config classification. Gitignore-aware, symlink-safe, memory-efficient.

**Foundation present (types only):**

- **Domain model** (`src/types`) — the shared vocabulary for the intended architecture (modules, dependencies, findings, hotspots, scan results). These types are defined and consumed by the scanner; the analysis layers that fully populate them are planned.

**Planned (not yet built):**

- **Analyzers** (`src/analyzers` defines the interface only) — language parsing to extract imports, exports, functions, classes, and complexity.
- **Dependency graph** and circular-dependency detection.
- **Git history** analysis (churn, contributors, recent activity).
- **MCP server** — the first-class interface for exposing this intelligence to coding agents.
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
- **CLI integration** — a `codebase-doctor scan [path]` command runs discovery and prints a human-readable summary.

## Technology Stack

From `package.json` and project configuration:

- **Language:** TypeScript (strict), ESM (`module: NodeNext`)
- **Runtime:** Node.js ≥ 20
- **Compiler config:** `strict`, `isolatedDeclarations`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`
- **Runtime dependencies:** [`commander`](https://www.npmjs.com/package/commander) (CLI), [`ignore`](https://www.npmjs.com/package/ignore) (gitignore semantics)
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

Currently, the CLI supports a single command. Build the project first (`npm run build`), then run the `scan` command from `dist/`:

```bash
# Scan the current directory
node dist/cli.js scan

# Scan a specific path
node dist/cli.js scan /path/to/repository

# Help and version
node dist/cli.js --help
node dist/cli.js --version
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
├── scanner/       # Repository discovery (implemented)
├── types/         # Domain model — shared vocabulary for the architecture
├── utils/         # Path normalization, gitignore handling, file classification
├── index.ts       # Public package entry point
└── cli.ts         # CLI (commander)

test/
├── fixtures/      # Fixture repository builder for scanner tests
├── helpers/       # Test helpers (fixture creation, cleanup)
├── scanner/       # Scanner, path, and error tests
└── unit/          # Types and CLI tests
```

## Testing

Testing uses [Vitest](https://vitest.dev/) with fixture repositories built at runtime in temporary directories.

Currently tested:

- **Scanner** (`test/scanner/discovery.test.ts`) — nested-directory discovery, source-extension detection, exclusion of `node_modules`/`.git`/`dist`/`build`/`coverage`/`.codebase-doctor`, `.gitignore` semantics (trailing-slash and negation patterns), git-repository detection, test/config classification, deterministic POSIX paths, line counts, binary-file handling, and symlink-safety.
- **Paths & detection** (`test/scanner/paths.test.ts`) — POSIX path normalization, relative-path computation, test/config file detection.
- **Error handling** (`test/scanner/errors.test.ts`) — structured errors for missing/file paths.
- **Types & CLI** (`test/unit/`) — domain-model shape and CLI command registration.

**Latest verified result:** 32 tests passing across 5 files (`npm run test`).

> Coverage thresholds are configured in `vitest.config.ts`, but coverage has not yet been run and no coverage percentage is claimed.

## Development Roadmap

Planned phases (under active development — none of these features exist yet):

- **Phase 1C — TypeScript/JavaScript Analysis** — parse TS/TSX/JS/JSX to extract imports, exports, functions, classes, and cyclomatic complexity.
- **Phase 1D — Dependency Graph** — module relationships and circular-dependency detection, built on a single chosen analysis engine.
- **Phase 1E — Git Analysis** — commit counts, file churn, contributors, and recent activity.
- **Findings / Hotspots** — deterministic rules over the computed model to surface risk and debt.
- **MCP Server** — the first-class interface through which AI coding agents query the intelligence.

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
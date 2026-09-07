# Codebase Doctor

## Project Purpose

Codebase Doctor is a deterministic repository-intelligence engine that
exposes structured architectural knowledge about a repository — structure,
dependencies, module relationships, entry points, hotspots, findings, Git
history, and configuration — to AI coding agents (such as Claude Code)
through MCP.

It is NOT a generic file-search MCP, NOT a RAG wrapper, and NOT an AI code
generator. The core value is deterministic repository analysis and
structured codebase intelligence. LLM reasoning is added only where it
provides meaningful value, and never as the source of truth for repository
facts.

## Core Architecture Principles

Guardrails Claude must preserve when modifying the project:

- **Determinism first.** Repository facts (structure, dependencies, cycles,
  complexity, churn) must be computed by deterministic, reproducible code —
  never by an LLM.
- **AI is an optional layer.** Where AI is used, it operates on top of the
  deterministic data (explaining findings, summarizing, prioritizing). It
  must never produce or override repository facts.
- **Separation of concerns.** Keep scanners (file-tree discovery),
  analyzers (language parsing), domain models (types), and interfaces
  (MCP/CLI) as separate layers. Avoid coupling them.
- **Single source of truth for dependency analysis.** Do not maintain
  multiple competing dependency-resolution implementations. Evaluate and
  choose one engine (e.g. ts-morph vs. dependency-cruiser) before Phase 1D.
- **Minimal dependencies.** Do not add a dependency without a concrete
  reason. Prefer the platform standard library where it suffices. Reuse
  mature packages for hard problems (e.g. `ignore` for gitignore semantics).
- **Prefer simple, testable components.** Small composable modules, simple
  data structures, no unnecessary abstractions.
- **MCP is a first-class interface, not an afterthought.** Design the core
  engine so the MCP server is a thin consumer, not an integration seam.
- **Do not implement future-phase functionality prematurely.** Only build
  what the current phase requires.
- **Scope discipline.** No database, no web UI, no multi-language parser
  (Python/tree-sitter), no AI functionality, no Git-history analysis in the
  near-term MVP.

## Development Rules

Rules Claude must follow when modifying the project:

- **Work incrementally, in phase order.** Do not skip phases.
- **Read PROGRESS.md before beginning work.** It holds the authoritative
  current state.
- **Inspect the actual repository before making assumptions.** The code is
  the source of truth, not memory of prior sessions.
- **Do not mark work complete without verification.** A phase is COMPLETE
  only when its acceptance criteria pass.
- **Run the verification pipeline after changes:** `npm run build`,
  `npm run typecheck`, `npm run test`, `npm run lint`, `npm run
  format:check`. Also test against a small fixture repository and inspect
  generated output.
- **Update project state when completing meaningful work.** Tagged
  milestones go in REPORT.md; near-term state goes in PROGRESS.md.
- **If the existing architecture is found incorrect, revise it** rather than
  preserving a bad design for compatibility.

## Phase Workflow

Before starting work:

1. Read CLAUDE.md.
2. Read PROGRESS.md.
3. Read relevant sections of REPORT.md when deeper historical context is
   needed.
4. Inspect the current implementation.
5. Determine the current phase and unfinished tasks.
6. Continue from the existing state.

After completing meaningful work:

1. Update PROGRESS.md (current phase, completed work, verification, next task).
2. Update REPORT.md when the work is a significant milestone, architectural
   decision, or completed phase.
3. Verify the implementation (run the pipeline).
4. Clearly record the next task in PROGRESS.md.

## Current Project Context

Stable project facts useful to future Claude sessions:

- **Runtime:** TypeScript (strict), ESM, Node.js >= 20, `module: NodeNext`.
- **Compiler:** strict TS with `isolatedDeclarations`, `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`.
- **Testing:** Vitest (167 tests passing). Coverage thresholds configured at
  80% but not yet verified (coverage provider not installed).
- **Lint/format:** ESLint 9 (flat config) + Prettier.
- **Runtime deps:** `commander` (CLI), `ignore` (gitignore semantics),
  `typescript` (canonical analysis engine — Phase 1C/1D), `git` CLI
  (Phase 1E, invoked via `child_process.execFile`, no library).
- **Source layout:** `src/types` (domain model), `src/scanner` (discovery),
  `src/analyzers` (TypeScript/JavaScript analyzer), `src/dependencies`
  (dependency graph + cycle detection), `src/git` (Git analysis),
  `src/findings` (deterministic rules + hotspots), `src/utils`, `src/cli.ts`.
- **The repository is a Git repository**, on branch `master`, with
  `origin` at `https://github.com/jordan-chris191/codebase-doctor.git`.
- Phases 1A (Foundation), 1B (Repository Discovery), 1C (TypeScript/JavaScript
  Analysis), 1D (Dependency Graph), 1E (Git Analysis), and Findings / Hotspots
  are COMPLETE. The next phase is CLI polish — not yet started.

For a detailed technical record of what has been built, decided, and
verified, see REPORT.md.

# Start Session

Resume work on Codebase Doctor from the actual current repository state.

## Required reading

Read, in this order:

1. `CLAUDE.md`
2. `PROGRESS.md`
3. `REPORT.md`
4. `README.md`

Treat the actual repository and Git state as the ultimate source of truth if any documentation is stale.

## Repository verification

Before doing any implementation:

1. Run `git status`.
2. Identify the current branch and latest commit.
3. Inspect the repository structure.
4. Verify that the current documentation matches the implemented code.
5. Determine the exact current development phase.
6. Identify completed, partially completed, and unstarted work.
7. Identify the exact next task and any prerequisites.

## Current expected state

The expected baseline is:

* Phase 1A — Foundation: COMPLETE
* Phase 1B — Repository Discovery: COMPLETE
* Phase 1C — TypeScript/JavaScript Analysis: NEXT / NOT STARTED
* Latest checkpoint should contain the completed Phase 1A + 1B work and synchronized project documentation.
* The repository should be a Git repository with a clean working tree.

Do not blindly trust this section. Verify it against the actual repository.

## Phase 1C rule

If Phase 1C is still the current phase, do NOT immediately install dependencies or start implementing the analyzer.

First inspect the existing:

* analyzer interfaces
* domain types
* module model
* dependency model
* scanner output
* architecture rules in `CLAUDE.md`

Then determine the best AST/parser strategy for TypeScript and JavaScript analysis.

Evaluate the relevant approaches, including:

* TypeScript Compiler API
* `ts-morph`
* `dependency-cruiser`

The goal is to establish a clear canonical source of truth for:

* imports
* exports
* functions
* classes
* module relationships
* file-level analysis

Do not select or install a dependency without first checking how the decision fits the existing architecture and the project's single-source-of-truth principle.

## Before coding

Give me this session status report:

* Current branch:
* Latest commit:
* Git status:
* Current phase:
* Phase status:
* Completed phases:
* Implemented capabilities:
* Remaining work:
* Current blockers:
* Verification status:
* Exact next task:

If Phase 1C is current, also include:

### Phase 1C Analysis Plan

* Existing interfaces/models reviewed:
* Parser/AST options to evaluate:
* Decision criteria:
* Recommended next action:

Then STOP and wait for my instructions.

Do NOT:

* start coding
* modify files
* install dependencies
* create a commit
* push to GitHub
* begin the next phase
* make architectural changes

until I explicitly instruct you to proceed.

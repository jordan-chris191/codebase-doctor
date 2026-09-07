# End Session

Prepare Codebase Doctor for a clean, accurate handoff to the next development session.

The purpose of this command is to document the actual state of the repository, not to continue development.

## Required behavior

Before making any documentation changes:

1. Inspect the actual repository state.
2. Run `git status`.
3. Review the relevant source files changed during this session.
4. Review tests and verification results.
5. Determine what was actually completed during this session.
6. Compare the actual repository state against:

   * `CLAUDE.md`
   * `PROGRESS.md`
   * `REPORT.md`
   * `README.md`

The repository itself is the source of truth.

Never invent completed work, architectural decisions, test results, blockers, or future capabilities.

## Classify the current state

For each relevant item, use one of:

* IMPLEMENTED
* PARTIALLY IMPLEMENTED
* PLANNED
* NOT STARTED
* BLOCKED
* UNVERIFIED

Clearly distinguish implemented functionality from planned functionality.

## Documentation responsibilities

### CLAUDE.md

Keep this as the permanent project instruction document.

Update it only when a durable project rule, architectural principle, development constraint, or workflow rule has genuinely changed.

Do NOT turn `CLAUDE.md` into a session diary.

### PROGRESS.md

Update this to reflect the current operational state of the project.

It should clearly identify:

* current phase
* phase status
* completed work
* remaining work
* current blockers
* verification status
* exact next task
* relevant Git state

Keep it concise and actionable for the next session.

### REPORT.md

Update this with detailed technical history from the current session when appropriate.

Record:

* what was implemented
* important technical decisions
* architectural changes
* problems encountered
* solutions
* tests and verification
* important implementation details
* relevant lessons learned

Preserve useful historical records.

Do not rewrite historical entries simply because the repository has changed since they were recorded. If an old verification result was accurate at the time, preserve it as historical evidence.

### README.md

Update only if the user-facing project description, implemented features, installation instructions, usage, architecture overview, or current project status has actually changed.

Do not add speculative features.

## Git rules

Run:

```bash
git status
git diff --stat
git diff
```

Do not commit automatically.

Do not push automatically.

Do not create or modify branches.

Do not reset, rebase, stash, or discard user changes.

Do not modify source code merely to make documentation easier.

If there are unrelated user changes, preserve them and do not overwrite them.

## Verification

If code was changed during the session, run the appropriate project verification commands.

At minimum, when applicable:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run format:check
```

Do not claim a verification command passed unless it was actually run.

If a command was not run, mark it as UNVERIFIED.

If a test fails, document the failure rather than attempting unrelated fixes.

## Phase discipline

Do NOT:

* start the next phase
* implement the next task
* add speculative features
* install new dependencies
* refactor unrelated code
* make architectural changes unrelated to work completed this session

The purpose of `/end-session` is to close the current session cleanly.

## Final consistency check

After updating documentation:

1. Re-read the relevant sections of `CLAUDE.md`.
2. Re-read `PROGRESS.md`.
3. Re-read the relevant sections of `REPORT.md`.
4. Check `README.md` if it was changed.
5. Confirm they agree with the actual repository state.
6. Confirm no documentation claims functionality that does not exist.
7. Confirm planned work is not described as implemented.
8. Confirm historical records remain historically accurate.

Then run:

```bash
git status
```

Do not commit or push.

## Final handoff report

Provide a concise shutdown report containing:

### Session Summary

* Current phase:
* Phase status:
* Work completed this session:
* Work intentionally not completed:
* Important decisions:
* Files changed:
* Dependencies changed:
* Tests:
* Typecheck:
* Lint:
* Build:
* Format check:
* Blockers:
* Exact next task:

### Documentation

* `CLAUDE.md`: updated / unchanged
* `PROGRESS.md`: updated / unchanged
* `REPORT.md`: updated / unchanged
* `README.md`: updated / unchanged

Briefly state what was synchronized.

### Git

* Current branch:
* Current commit:
* Working tree:
* Uncommitted changes:
* Remote status:
* Commit created: NO
* Push performed: NO

If the working tree is not clean, explicitly list the remaining changes.

Finally, state:

> Session closed. No new work was started.

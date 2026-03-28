# Refactor: Rename todos to work, todo/ to ninthwave/ branches and worktrees (H-RN-1)

**Priority:** High
**Source:** Scope reduction plan 2026-03-28
**Depends on:** H-CL-3, H-RV-1
**Domain:** rename

Rename the "todo" terminology throughout the codebase to eliminate name pollution in unrelated usage. Three mechanical renames:

1. Directory: `.ninthwave/todos/` -> `.ninthwave/work/` (~96 occurrences across 34 files). Update parser, init, orchestrate, preflight, status, docs, and all tests.

2. Branch prefix: `todo/` -> `ninthwave/` (~148 occurrences across 22 .ts files). Update launch.ts, clean.ts, orchestrator.ts, orchestrate.ts, pr-monitor.ts, heartbeat.ts, reconcile.ts, mark-done.ts, git.ts, and all tests. The branch `todo/${id}` becomes `ninthwave/${id}`.

3. Worktree directory prefix: `.worktrees/todo-${id}` -> `.worktrees/ninthwave-${id}`. Update launch.ts, clean.ts, orchestrator.ts, and tests.

Add migration in init: detect existing `.ninthwave/todos/` directory and move contents to `.ninthwave/work/`. Log the migration. Keep `.gitkeep` in the new directory.

Update docs: CLAUDE.md, README.md, CONTRIBUTING.md, ARCHITECTURE.md, VISION.md, core/docs/todos-format.md -- replace `.ninthwave/todos/` with `.ninthwave/work/` and `todo/` branch references with `ninthwave/`.

Use find-and-replace across the codebase. Test after each rename step (directory, then branch prefix, then worktree prefix) to catch breakage incrementally.

**Test plan:**
- Run `bun test test/` after each rename step -- all tests must pass
- Verify `grep -r "\.ninthwave/todos" .` returns zero hits (except CHANGELOG + migration code in init.ts)
- Verify `grep -r '"todo/' .` returns zero hits in .ts files (except CHANGELOG)
- Verify `grep -r "todo-\${" .` returns zero worktree prefix hits (except CHANGELOG)
- Edge case: init migration -- create a `.ninthwave/todos/` directory with a test file, run init, verify it moves to `.ninthwave/work/`

Acceptance: Zero references to `.ninthwave/todos/` (except CHANGELOG and migration). Zero `todo/` branch prefix references (except CHANGELOG). Zero `todo-` worktree prefix references (except CHANGELOG). Init migrates existing todos/ to work/. All tests pass.

Key files: `core/parser.ts`, `core/commands/init.ts`, `core/commands/launch.ts`, `core/commands/clean.ts`, `core/commands/orchestrate.ts`, `core/orchestrator.ts`, `core/commands/pr-monitor.ts`, `core/commands/heartbeat.ts`, `core/commands/reconcile.ts`, `core/commands/status.ts`, `core/commands/mark-done.ts`, `core/git.ts`, `core/preflight.ts`

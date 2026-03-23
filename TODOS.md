# TODOS

<!-- Format guide: see $(cat .ninthwave/dir)/core/docs/todos-format.md -->

## CLI Migration (TypeScript migration completion, 2026-03-23)




### Test: Add tests for start, clean, watch, and ci commands (M-MIG-5)

**Priority:** Medium
**Source:** Migration plan 2026-03-23
**Depends on:** H-MIG-1

Add unit tests for commands that currently lack test coverage. Use `vi.mock` to mock external dependencies (`git.ts`, `gh.ts`, `cmux.ts`, `partitions.ts`). Test `detectAiTool()` environment variable detection paths. Test argument validation for `cmdStart`, `cmdClean`, `cmdCleanSingle`, `cmdCloseWorkspace`. Test `cmdWatchReady` status classification (merged/ready/pending/failing/no-pr). Test `cmdCiFailures` with failures and without. Test `cmdCloseWorkspaces`/`cmdCloseWorkspace` with mocked cmux. For async commands (`cmdAutopilotWatch`, `cmdPrWatch`), test initial state and transition detection.

Acceptance: `bun test` passes with new test files included. Each command has at least argument validation + one happy-path test.

Key files: `test/start.test.ts`, `test/clean.test.ts`, `test/watch.test.ts`, `test/ci.test.ts`, `core/commands/start.ts`, `core/commands/clean.ts`, `core/commands/watch.ts`, `core/commands/ci.ts`

---

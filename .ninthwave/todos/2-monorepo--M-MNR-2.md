# Feat: Workspace-scoped test commands in worker prompts (M-MNR-2)

**Priority:** Medium
**Source:** Phase E vision — monorepo support, part 2 of 3.
**Depends on:** H-MNR-1
**Domain:** monorepo

## Context

With H-MNR-1 storing workspace package configs in `.ninthwave/config.json`, workers need to receive the correct workspace-scoped test command for the package they're modifying. A worker touching `packages/api/` should run `pnpm test --filter api`, not the repo-wide `bun test`.

The worker prompt is built in `core/commands/start.ts` (`buildWorkerPrompt()`). This item wires the workspace config into prompt construction so each worker gets the right test command based on the TODO's affected files.

## Requirements

1. In `buildWorkerPrompt()` (or the `AgentInstructions` type), add a `testCmd` override field that is passed directly to the worker.
2. Add `inferPackageForItem(item: TodoItem, workspaceConfig: WorkspaceConfig): PackageConfig | null`:
   - For each path in `item.filePaths`, find the workspace package whose `path` is the longest matching prefix
   - If all affected files map to one package, return that package
   - If files span multiple packages, return null (fall back to root test command)
3. In `cmdStart()` (worker launch path), after loading project config:
   - Read `workspace` from `.ninthwave/config.json` (if present)
   - Call `inferPackageForItem()` to determine the relevant package
   - Pass the package's `testCmd` to `buildWorkerPrompt()` as the test command
4. When no workspace config is present, or when `inferPackageForItem` returns null, use the existing root `testCmd` from config — no behavior change.
5. Include the resolved test command in the worker's `[ORCHESTRATOR] Start implementing` message so the worker sees it directly.

Acceptance: When a TODO's affected files are all within `packages/api/`, the worker receives `pnpm test --filter api` as its test command. When files span multiple packages, the worker receives the root test command. Single-repo projects are unaffected.

**Test plan:**
- Unit test: `inferPackageForItem` returns correct package when all files are in one package
- Unit test: `inferPackageForItem` returns null when files span multiple packages
- Unit test: `inferPackageForItem` returns null when workspace config is absent
- Unit test: `buildWorkerPrompt` includes overridden testCmd in output
- Unit test: worker start message includes resolved test command
- Edge case: item with no `filePaths` — fall back to root test command
- Edge case: nested package paths (packages/a vs packages/ab) — longest prefix wins

Key files: `core/commands/start.ts`, `core/types.ts`, `test/start.test.ts`

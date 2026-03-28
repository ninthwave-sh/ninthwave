# Refactor: Rename start.ts to launch.ts (H-CR-2)

**Priority:** High
**Source:** CLI command redesign plan (2026-03-28)
**Depends on:** None
**Domain:** cli-redesign

Rename `core/commands/start.ts` to `core/commands/launch.ts` to reflect that the `start` command is being replaced by `nw <ID>`. Update all import paths in `core/commands/orchestrate.ts` (imports `launchSingleItem`, `launchReviewWorker`, `launchRepairWorker`, `detectAiTool`, `cleanStaleBranchForReuse`), `core/cli.ts` (imports `cmdStart`), and test files. Rename `test/start.test.ts` to `test/launch.test.ts`. The file's exports and behavior are unchanged -- this is a pure rename.

**Test plan:**
- Verify `bun test test/` passes after rename (no broken imports)
- Verify `ninthwave start H-CR-1` still works (command dispatch unchanged)
- Check all orchestrate.ts imports resolve to launch.ts

Acceptance: `core/commands/start.ts` no longer exists. `core/commands/launch.ts` has identical content. `test/start.test.ts` renamed to `test/launch.test.ts`. All imports updated. All tests pass. No behavior changes.

Key files: `core/commands/start.ts`, `core/commands/orchestrate.ts`, `core/cli.ts`, `test/start.test.ts`

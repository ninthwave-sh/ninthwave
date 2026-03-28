# Refactor: Rename watch.ts to pr-monitor.ts (H-CR-1)

**Priority:** High
**Source:** CLI command redesign plan (2026-03-28)
**Depends on:** None
**Domain:** cli-redesign

Rename `core/commands/watch.ts` to `core/commands/pr-monitor.ts` to resolve the file name collision with the new `nw watch` command. Update all import paths in `core/commands/orchestrate.ts` (imports `checkPrStatus`, `scanExternalPRs`), `core/cli.ts` (imports `cmdWatchReady`, `cmdAutopilotWatch`, `cmdPrWatch`, `cmdPrActivity`), and any test files that reference the old path. The file's exports and behavior are unchanged -- this is a pure rename.

**Test plan:**
- Verify `bun test test/` passes after rename (no broken imports)
- Verify `ninthwave watch-ready`, `ninthwave autopilot-watch`, `ninthwave pr-watch`, `ninthwave pr-activity` still work
- Check `test/watch.test.ts` imports updated to `pr-monitor.ts`

Acceptance: `core/commands/watch.ts` no longer exists. `core/commands/pr-monitor.ts` has identical content. All imports updated. All tests pass. No behavior changes.

Key files: `core/commands/watch.ts`, `core/commands/orchestrate.ts`, `core/cli.ts`, `test/watch.test.ts`

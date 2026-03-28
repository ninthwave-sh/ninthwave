# Refactor: Make status always live, add --once flag (M-CR-10)

**Priority:** Medium
**Source:** CLI command redesign plan (2026-03-28)
**Depends on:** H-CR-3
**Domain:** cli-redesign

Change `nw status` to use live refresh as the default behavior (currently requires `--watch`). Add `--once` flag for scripts that want a single static snapshot. Accept `--watch` silently for backwards compat (no error, no effect since live is now default). Update the command registry entry for status with the new flags and help text.

**Test plan:**
- Test `nw status` invokes live refresh mode (cmdStatusWatch)
- Test `nw status --once` invokes single snapshot mode (cmdStatus)
- Test `nw status --watch` accepted silently (compat, same as default)
- Verify existing status tests still pass

Acceptance: `nw status` shows live refreshing view by default. `nw status --once` shows static snapshot. `--watch` accepted without error. All tests pass.

Key files: `core/commands/status.ts`, `core/cli.ts`, `core/help.ts`

# Feat: Interactive no-args with checkbox TODO picker (H-CR-8)

**Priority:** High
**Source:** CLI command redesign plan (2026-03-28)
**Depends on:** H-CR-3
**Domain:** cli-redesign

Extend `core/commands/onboard.ts` to handle all no-args states, not just the "not initialized" case. When `nw` is run with no arguments in a TTY: (1) If no `.ninthwave/` dir, run the init flow ("Set up ninthwave? [Y/n]"). (2) If `.ninthwave/` exists but no TODO files, show guidance message. (3) If TODO files exist and no daemon is running, show a checkbox picker (reuse `promptItems()` from `core/interactive.ts`) letting the user select items, then offer "Run selected" (launches via `cmdRunItems`) or "Watch all" (launches `cmdWatch`). (4) If daemon is running (check via `isDaemonRunning()` from `core/daemon.ts`), drop into live status view. Non-TTY fallback: print grouped help text.

**Test plan:**
- Test state detection: no git, no .ninthwave, no TODOs, has TODOs, daemon running
- Test checkbox picker renders TODO list and accepts selection
- Test non-TTY fallback: outputs help text instead of interactive UI
- Test daemon-running detection routes to status view
- Mock all I/O via dependency injection (existing OnboardDeps pattern)

Acceptance: `nw` (no args, TTY) adapts to project state with correct behavior for all 5 states. Non-TTY prints help. Checkbox picker works for TODO selection. All tests pass.

Key files: `core/commands/onboard.ts`, `core/interactive.ts`, `core/cli.ts`, `core/daemon.ts`, `test/onboard.test.ts`

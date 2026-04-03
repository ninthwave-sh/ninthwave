# Feat: Expose scheduled-task controls in startup and runtime UI (H-DIR-5)

**Priority:** High
**Source:** Approved DIR plan `.opencode/plans/1775207732828-stellar-harbor.md`
**Depends on:** H-DIR-4
**Domain:** schedule-controls
**Lineage:** b6e8514b-1d5c-42bf-843f-51fb037d8d71

Add a `Scheduled tasks` control to the start-orchestration screen and runtime controls so operators can turn schedule execution on or off using the new per-project local preference. The startup screen should default to off on first run, remember the last local choice for that project, and keep runtime rendering and keyboard behavior in sync. Keep this item focused on the shared settings model, startup flow, and runtime control UI rather than schedule execution internals.

**Test plan:**
- Extend `test/tui-widgets.test.ts` and `test/interactive.test.ts` to cover startup rendering, default-off behavior, and persisted re-entry for the new setting.
- Extend runtime control tests around `core/tui-keyboard.ts`, `core/status-render.ts`, or `core/watch-engine-runner.ts` to verify toggling updates the pending and active state correctly.
- Verify existing startup settings and runtime control tests still pass so merge, review, and collaboration controls are not regressed.

Acceptance: the startup and runtime UIs expose a `Scheduled tasks` control backed by the new local preference, first-run startup defaults to off, the last project-local choice is restored on later runs, and the relevant TUI/control tests pass.

Key files: `core/tui-settings.ts`, `core/tui-widgets.ts`, `core/interactive.ts`, `core/tui-keyboard.ts`, `core/status-render.ts`, `core/watch-engine-runner.ts`

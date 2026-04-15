# Refactor: Simplify startup settings and persistence (H-SUX-2)

**Priority:** High
**Source:** Approved startup simplification plan 2026-04-15
**Depends on:** H-SUX-1
**Domain:** startup-ux
**Lineage:** 827e847c-1353-4f84-ad9a-8d32b7e43fae

Remove merge strategy and session limit from the startup settings screen so startup only asks about reviews and collaboration. Default startup to manual merge, review on, and session limit 1 in both the TUI path and the readline fallback. Fix startup persistence so unchanged defaults are not silently written back just because the startup flow returned them.

**Test plan:**
- Update `test/tui-widgets.test.ts` to verify the startup settings screen now shows only `Reviews` and `Collaboration`
- Add startup-flow assertions in `test/interactive.test.ts` and `test/onboard.test.ts` for manual merge, review on, and session limit 1 defaults
- Verify `buildStartupPersistenceUpdates()` only writes settings the user actually changed from resolved defaults and no longer always persists `session_limit`

Acceptance: Starting orchestration no longer prompts for merge strategy or session limit. Both interactive paths return manual merge, review on, and session limit 1 unless the user changes review or collaboration, and startup persistence no longer cements untouched defaults.

Key files: `core/tui-widgets.ts`, `core/interactive.ts`, `core/commands/onboard.ts`, `core/commands/orchestrate.ts`, `test/tui-widgets.test.ts`, `test/interactive.test.ts`, `test/onboard.test.ts`, `test/orchestrate.test.ts`

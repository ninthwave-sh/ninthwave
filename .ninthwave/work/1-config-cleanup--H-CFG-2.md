# Refactor: Switch startup flows to user-scoped tool memory (H-CFG-2)

**Priority:** High
**Source:** Config cleanup decomposition 2026-04-01
**Depends on:** H-CFG-1
**Domain:** config-cleanup

Update onboarding, no-args startup, and orchestrate interactive startup so saved AI tool selections come from user config instead of project config. Keep project config responsible only for stable repo settings such as `review_external`, and preserve the existing startup behavior outside of the saved-tool source.

**Test plan:**
- Update `test/onboard.test.ts` to verify onboarding persists selected tools through the user-config seam instead of project config
- Add or adjust tests for `cmdNoArgs()` so `savedToolIds` come from user config while review defaults still come from `loadConfig(projectRoot)`
- Add or adjust orchestrate coverage so interactive startup uses `persistedUserCfg.ai_tools` for saved tool IDs and skip-tool-step behavior
- Run `bun test test/onboard.test.ts test/orchestrate.test.ts`

Acceptance: onboarding and interactive startup flows no longer rely on `projectConfig.ai_tools`. Saved tool preselection and persistence come from user config, while project config continues to control only stable repo-level settings.

Key files: `core/commands/onboard.ts`, `core/commands/orchestrate.ts`, `test/onboard.test.ts`, `test/orchestrate.test.ts`

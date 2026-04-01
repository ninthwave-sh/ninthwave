# Refactor: Remove ai_tools from project config schema and repo fixture (M-CFG-3)

**Priority:** Medium
**Source:** Config cleanup decomposition 2026-04-01
**Depends on:** H-CFG-2
**Domain:** config-cleanup

Clean up the project-config surface now that remembered AI tools are fully user-scoped. Remove `ai_tools` from `ProjectConfig` and `loadConfig()`, delete the checked-in `ai_tools` entry from `.ninthwave/config.json`, and update config-focused tests so project config covers only stable repo settings.

**Test plan:**
- Update `test/config.test.ts` to remove project-config read/write coverage for `ai_tools` while keeping user-config `ai_tools` coverage intact
- Add or tighten `test/init.test.ts` assertions so generated `.ninthwave/config.json` omits `ai_tools`
- Verify `.ninthwave/config.json` in the repo contains only stable project settings after the cleanup
- Run `bun test test/config.test.ts test/init.test.ts`

Acceptance: `ProjectConfig` no longer exposes `ai_tools`, `loadConfig()` returns only stable project settings, the checked-in `.ninthwave/config.json` no longer contains `ai_tools`, and config-related tests reflect the narrowed schema.

Key files: `core/config.ts`, `test/config.test.ts`, `test/init.test.ts`, `.ninthwave/config.json`

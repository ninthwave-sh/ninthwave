# Refactor: Move AI tool persistence to global user config (H-CFG-1)

**Priority:** High
**Source:** Config cleanup decomposition 2026-04-01
**Depends on:** None
**Domain:** config-cleanup

Update AI tool selection so remembered `ai_tools` live only in `~/.ninthwave/config.json`. `core/tool-select.ts` should stop reading or writing project config for tool memory, and should keep the existing fallback of choosing the first installed tool when no global user preference exists.

**Test plan:**
- Update `test/tool-select.test.ts` so `selectAiTool` and `selectAiTools` assert `saveUserConfig` is used for `--tool`, single-tool auto-select, and interactive confirmation
- Cover the non-interactive path with and without `loadUserConfig().ai_tools`, including fallback to the first installed tool when no preference exists
- Verify unknown tool warnings still fire for user-config values and explicit overrides
- Run `bun test test/tool-select.test.ts`

Acceptance: `core/tool-select.ts` no longer reads remembered AI tools from project config or writes them back to `.ninthwave/config.json`. Remembered tool choices come only from global user config, and non-interactive selection still picks the first installed tool when no global preference exists.

Key files: `core/tool-select.ts`, `test/tool-select.test.ts`, `core/config.ts`

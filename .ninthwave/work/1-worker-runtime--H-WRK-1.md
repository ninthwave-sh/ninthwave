# Feat: Add built-in AI tool override schema and resolver (H-WRK-1)

**Priority:** High
**Source:** Approved plan 1776189941462-playful-river
**Depends on:** None
**Domain:** worker-runtime
**Lineage:** 2a1b3e2d-89d2-4907-aa8a-b9e28420e7de

Ninthwave already supports user-level settings in `~/.ninthwave/config.json`, but built-in AI tool launch behavior is still hardcoded in `core/ai-tools.ts`. Add a first-class `ai_tool_overrides` shape to `UserConfig` and a pure resolver for built-in tool `command`, `args`, and `env`, including shared plus mode-specific `launch` and `headless` merges. Keep built-in detection metadata, agent-file behavior, and tool selection unchanged in this item.

**Test plan:**
- Extend `test/config.test.ts` to cover valid and malformed `ai_tool_overrides` entries, safe ignore behavior, and save/load round-trips
- Extend `test/ai-tools.test.ts` to verify base plus mode-specific merge behavior for `command`, `args`, and `env`
- Verify resolver output does not mutate `AI_TOOL_PROFILES` fields used for detection or seeded agent files

Acceptance: `loadUserConfig()` and `saveUserConfig()` support a typed `ai_tool_overrides` object for built-in tools. A pure resolver returns the effective launch override for a built-in tool with deterministic base plus mode-specific merging. Built-in detection, target dirs, suffixes, and agent-file lookup remain unchanged.

Key files: `core/config.ts`, `core/ai-tools.ts`, `test/config.test.ts`, `test/ai-tools.test.ts`

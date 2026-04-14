# Feat: Apply user tool overrides to worker launches (H-WRK-2)

**Priority:** High
**Source:** Approved plan 1776189941462-playful-river
**Depends on:** H-WRK-1
**Domain:** worker-runtime
**Lineage:** 872d8d9e-d852-4d76-b5c5-7918ef78f690

Once the built-in override schema exists, wire it into the real worker launch path so implementer, reviewer, rebaser, and forward-fixer sessions honor user-configured `command`, `args`, and `env` in both interactive and headless modes. Keep explicit caller-provided launch overrides as the highest-precedence path so tests and targeted callers still work as they do today.

**Test plan:**
- Extend `test/launch.test.ts` to verify `launchAiSession()` applies config-backed overrides in both launch and headless modes
- Verify explicit `launchOverride` input still wins over user config when both are present
- Verify missing or malformed config falls back to built-in launch behavior without changing existing worker types

Acceptance: `launchAiSession()` automatically uses effective built-in tool overrides from `~/.ninthwave/config.json` for both interactive and headless workers. Explicit launch overrides still take precedence. Implementer, reviewer, rebaser, and forward-fixer launches continue to flow through the same launch funnel with unchanged behavior when no override is configured.

Key files: `core/commands/launch.ts`, `test/launch.test.ts`, `core/ai-tools.ts`

# Refactor: Extract branding constants and fix footer domain (H-PC-1)

**Priority:** High
**Source:** Plan review 2026-03-29
**Depends on:** None
**Domain:** pr-comments

Extract shared branding constants and fix the footer domain from ninthwave.dev to ninthwave.sh. The "Powered by" footer appears in 3 source locations and should be a single constant. The orchestrator ARCHITECTURE.md link should also be a constant.

Add two exported constants to core/gh.ts:
- NINTHWAVE_FOOTER: `*Powered by [Ninthwave](https://ninthwave.sh)*`
- ORCHESTRATOR_LINK: `https://github.com/ninthwave-sh/ninthwave/blob/main/ARCHITECTURE.md#orchestrator-state-machine`

Replace all inline occurrences of the footer string in source files with the constant. Update all test files that assert on the old ninthwave.dev domain to use ninthwave.sh.

**Test plan:**
- Update assertions in test/orchestrator.test.ts (lines ~6347, ~6369) from ninthwave.dev to ninthwave.sh
- Update assertions in test/upsert-orchestrator-comment.test.ts (lines ~42, ~55, ~82, ~165) from ninthwave.dev to ninthwave.sh
- Update assertion in test/status-render.test.ts (line ~2400) from ninthwave.dev to ninthwave.sh
- Verify bun test test/ passes with no regressions

Acceptance: NINTHWAVE_FOOTER and ORCHESTRATOR_LINK constants exported from core/gh.ts. All source references to ninthwave.dev replaced with ninthwave.sh. All inline footer strings replaced with the constant. All tests pass.

Key files: `core/gh.ts:494`, `core/gh.ts:514`, `core/orchestrator.ts:2441`, `core/status-render.ts:2027`, `test/orchestrator.test.ts`, `test/upsert-orchestrator-comment.test.ts`, `test/status-render.test.ts`

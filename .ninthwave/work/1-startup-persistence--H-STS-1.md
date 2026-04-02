# Refactor: Extract durable startup persistence mapping (H-STS-1)

**Priority:** High
**Source:** /Users/roblambell/code/ninthwave/.opencode/plans/1775156954966-hidden-star.md
**Depends on:** None
**Domain:** startup-persistence
**Lineage:** da7aafaa-31e6-4358-9b01-cbd97ed3d9e5

Add a small pure helper in `core/interactive.ts` that turns a confirmed `InteractiveResult` into the reusable `UserConfig` updates that should be saved when the startup screen is confirmed. The helper should include only durable defaults: `backend_mode`, `merge_strategy`, `review_mode`, `wip_limit`, `collaboration_mode`, and `ai_tools`, while preserving existing saved tools when the tool step was skipped. Join-session codes stay transient and must never appear in the persisted payload.

**Test plan:**
- Add focused unit tests in `test/interactive.test.ts` for local, share, and join collaboration mapping from `connectionAction`
- Verify multi-tool and single-tool selections produce the expected `ai_tools` payload
- Verify skipped tool selection leaves `ai_tools` undefined so existing config is preserved
- Verify the helper output never contains a join code or other transient session data

Acceptance: `core/interactive.ts` exports a pure helper that maps confirmed startup selections into durable config updates only. Helper tests cover collaboration mode mapping, `ai_tools` persistence behavior, and the no-join-code rule.

Key files: `core/interactive.ts`, `test/interactive.test.ts`

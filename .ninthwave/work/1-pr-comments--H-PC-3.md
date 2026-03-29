# Feat: Add Orchestrator link to PR comments (H-PC-3)

**Priority:** High
**Source:** Plan review 2026-03-29
**Depends on:** H-PC-1
**Domain:** pr-comments

Add a clickable link on the [Orchestrator] label in PR comments, pointing to the orchestrator state machine diagram in ARCHITECTURE.md on the ninthwave repo. This is hardcoded to ninthwave's own repo since the architecture doc lives there permanently.

Changes:
1. In core/gh.ts upsertOrchestratorComment (~line 507), change `**[Orchestrator]** Status for ${itemId}` to use ORCHESTRATOR_LINK: `**[Orchestrator](${ORCHESTRATOR_LINK})** Status for ${itemId}`.
2. In core/orchestrator.ts auto-merge fallback (~line 1806), update `**[Orchestrator]**` to `**[Orchestrator](${ORCHESTRATOR_LINK})**`.
3. In core/orchestrator.ts CI failure fallback (~line 2002), same change.
4. Update the test assertion in test/upsert-orchestrator-comment.test.ts (~line 38) to expect the linked format.

**Test plan:**
- Update assertion in test/upsert-orchestrator-comment.test.ts that checks for `**[Orchestrator]** Status for` to expect the linked format
- Verify the ORCHESTRATOR_LINK URL appears in the comment body
- Run bun test test/ to confirm no regressions

Acceptance: All [Orchestrator] labels in PR comments include a clickable link to ARCHITECTURE.md#orchestrator-state-machine. The link uses the ORCHESTRATOR_LINK constant from H-PC-1. Tests pass.

Key files: `core/gh.ts:507`, `core/orchestrator.ts:1806`, `core/orchestrator.ts:2002`, `test/upsert-orchestrator-comment.test.ts`

# Fix: Respawn worker for PR comments on parked items (H-CF-1)

**Priority:** High
**Source:** Dogfooding 2026-04-10 -- user left comment on parked PR #395 (doughsense), orchestrator silently ignored it
**Depends on:** None
**Domain:** orchestrator
**Lineage:** 117cd66b-50c3-4008-a853-ebb766e5968c

When a work item is parked in `review-pending` (worker closed to free resources), human PR comments are silently dropped. `processComments()` guards on `!item.workspaceRef` (line 1477) and returns early for parked items. Meanwhile `handleReviewPending()` only respawns workers for formal `CHANGES_REQUESTED` reviews, not regular PR comments. Fix this by detecting human comments on parked items in `handleReviewPending()` and respawning a worker to address the feedback, using the same pattern as `respawnCiFixWorker`.

Implementation:

1. Add `needsFeedbackResponse?: boolean` and `pendingFeedbackMessage?: string` transient fields to `OrchestratorItem` in `core/orchestrator-types.ts` (NOT persisted to daemon state -- same pattern as `needsCiFix`).

2. Add `respawnForFeedback(item, message)` private method to `core/orchestrator.ts` -- sets the new flags, clears `notAliveCount`/`lastAliveAt`, transitions to "ready", returns `[{ type: "retry" }]`.

3. In `handleReviewPending()` (after the existing `CHANGES_REQUESTED` block at line 1067-1070), add: if `item.sessionParked && snap?.newComments?.length`, filter out bot comments (same regex as `processComments`), build a feedback message from human comments, update `item.lastCommentCheck`, and call `respawnForFeedback()`. This runs before `processComments()` (called at line 679 after the state handler), so the comments are consumed here and won't hit the `!workspaceRef` guard.

4. In `executeLaunch()` (`core/orchestrator-actions.ts`), after extracting `forceWorker` from `needsCiFix` (line 267-268), also extract `hasFeedback`/`feedbackMessage` from the new fields and clear them. Update `forceWorker` to `item.needsCiFix === true || hasFeedback`. After the existing CI fix inbox delivery block (line 310-318), add feedback inbox delivery: `if (hasFeedback && feedbackMessage) deliverToImplementerInbox(orch, item, "launch", "[ORCHESTRATOR] Review Feedback:\n\n" + feedbackMessage, ctx, deps)`.

**Test plan:**
- Add test: "parked review-pending item with human comments triggers respawn" -- item in `review-pending`, `sessionParked=true`, no `workspaceRef`, new comments in snapshot. Assert: actions include `retry`, state transitions to `ready` then `launching`, `needsFeedbackResponse=true`, `pendingFeedbackMessage` contains comment text, `lastCommentCheck` updated
- Add test: "parked item ignores bot comments" -- only agent-prefixed comments (`**[Orchestrator]**` etc). Assert: no respawn, no retry action
- Add test: "executeLaunch with needsFeedbackResponse delivers feedback to inbox" -- item with `needsFeedbackResponse=true` and `pendingFeedbackMessage` set. Assert: `writeInbox` called with message containing the feedback text, `needsFeedbackResponse` cleared after launch
- Existing test "does not process comments for items without a workspaceRef" (line 3248) should still pass -- it uses `ci-pending` state (not `review-pending` with `sessionParked`), so behavior is unchanged

Acceptance: When a parked `review-pending` item receives a human PR comment, the orchestrator transitions to `ready`, spawns a new worker, and delivers the comment text to the worker's inbox. Bot comments do not trigger respawn. `bun run test` passes.

Key files: `core/orchestrator.ts:1044`, `core/orchestrator.ts:862`, `core/orchestrator-types.ts:110`, `core/orchestrator-actions.ts:267`, `test/orchestrator-unit.test.ts:3248`

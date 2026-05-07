# Fix: Gate auto-merge while implementer is processing review feedback (H-ORCH-14)

**Priority:** High
**Source:** Friction log from downstream dogfooding (C-EIP-1, 2026-04-13)
**Depends on:** None
**Domain:** orchestrator
**Lineage:** 624c9edf-9d50-418a-a524-9f463b19874a

When a human reviewer requests changes (CHANGES_REQUESTED), the orchestrator respawns the implementer to address feedback. While the worker is actively editing in its worktree, if the review decision later flips to APPROVED and CI passes in the same poll cycle, `handleReviewPending` calls `evaluateMerge` without checking whether `item.workspaceRef` is still set. The PR auto-merges mid-edit, the worktree is torn down, and partial work lands on main. Recovery requires a separate fix-on-main commit.

Add a guard before evaluating auto-merge in `handleReviewPending` (around `core/orchestrator.ts:1480`): if `item.workspaceRef` is set, hold the item in `review-pending` instead of merging. The merge becomes eligible again once the worker completes (workspaceRef clears on push), dies, or sends a feedback-done signal. This complements the existing `continuePendingFeedbackHandoff` `needsFeedbackResponse` check, which only covers the pre-launch window.

**Test plan:**
- Unit test: item in `review-pending` with `workspaceRef` set, reviewer verdict APPROVED, CI passing, merge strategy auto -- expect item stays in `review-pending` and no merge call.
- Unit test: same item after `workspaceRef` clears -- expect merge proceeds on next poll.
- Edge case: bypass merge strategy must still respect the workspace guard (or document a deliberate exception).
- Regression: CHANGES_REQUESTED workers continue to launch and address feedback as today.

Acceptance: `evaluateMerge` is not called from `handleReviewPending` while `item.workspaceRef` is set. Test covers the APPROVED-while-editing race and confirms the merge fires after workspaceRef clears. No regression in normal review-then-merge flow.

Key files: `core/orchestrator.ts:1480`, `core/orchestrator.ts:1962` (`continuePendingFeedbackHandoff`)

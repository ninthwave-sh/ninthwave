# Feat: Parked-worker stall detector for review-pending and feedback-wait (H-ORCH-17)

**Priority:** High
**Source:** Friction logs from downstream dogfooding (H-CMA-3, 2026-04-15; H-MCX-175 orchestrator half, 2026-05-06)
**Depends on:** None
**Domain:** orchestrator
**Lineage:** 7ebe81fa-c849-4931-9d31-e497d02e2325

Two related stall modes go undetected today and require human intervention:

1. **Drain-wait stall after feedback (H-CMA-3):** the orchestrator delivers a feedback batch, the agent enters `nw inbox --wait`, but it stalls without re-entering the drain-wait loop. The orchestrator tracks `inboxWaitingSince` but does not consume it; no timeout fires and the worker sits idle until a human nudges it.
2. **Stale review-pending after confused-deputy (H-MCX-175):** a respawned reviewer mistakes itself for an implementer and creates a duplicate PR (e.g., #974) instead of posting a review. The orchestrator does not verify a review comment was actually posted, so it never respawns the reviewer. The original PR sat for ~9 hours pending review.

Add a single stall-detection backstop with two trigger conditions, fired from the watch tick. For an item parked in `review-pending` (or `implementing` with `needsFeedbackResponse`), if more than `inboxWaitExpireMs` (default 5 min) has passed since `inboxWaitingSince` or the most recent commit and no new verdict has appeared, query the PR comment history for a review comment marked with the ninthwave reviewer signature. If no review exists, treat the reviewer as dead and respawn it (analogous to the existing dead-worker recovery path); if the worker is implementing and not making progress, send a re-prompt heartbeat or relaunch. Log one line per detection so operators see why the recovery fired.

**Test plan:**
- Unit: stall fires after `inboxWaitExpireMs` with no new commit and no verdict, and resets when a new commit lands.
- Unit: when no reviewer comment is found, the recovery path respawns the reviewer; when one is found, the stall is cleared without respawn.
- Unit: drain-wait variant -- agent in feedback wait without progress triggers re-prompt or relaunch.
- Integration: simulate the H-MCX-175 confused-deputy scenario (reviewer creates a PR instead of posting a review) and confirm the orchestrator detects and recovers within the stall window.
- Regression: timely review verdicts are not affected; new commits restart the timer.

Acceptance: Watch tick detects parked-worker stalls in `review-pending` and feedback-waiting `implementing` states using `inboxWaitingSince` plus PR comment verification. Recovery action is appropriate to the stall type (reviewer respawn vs implementer re-prompt). Default `inboxWaitExpireMs` is configurable. Tests cover both trigger paths. No regression in normal review or feedback delivery.

Key files: `core/orchestrator.ts` (`handleReviewPending`, `handleImplementing`), `core/snapshot.ts` (parked-state field), `core/gh.ts` (PR comment query helper)

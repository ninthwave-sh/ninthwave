# Feat: Flush one aggregated feedback batch to the implementer (H-RFC-2)

**Priority:** High
**Source:** Manual decompose request from review-comment orchestration discussion
**Depends on:** H-RFC-1
**Domain:** review-feedback-loop
**Lineage:** 571cbce2-68c3-4ffd-83d8-2b6cfe44d922

When the debounce window expires, Ninthwave should act once, not once per comment. Deliver one aggregated feedback message to a live implementer via inbox when possible, or schedule one relaunch with one combined feedback payload when the implementer is parked or dead. Reuse the existing feedback recovery path so a single batch becomes the worker's next actionable task instead of creating a parallel comment-specific state machine.

**Test plan:**
- Extend `test/orchestrator-unit.test.ts` to cover one-shot batch flush for live workers, parked sessions, and dead workers
- Verify multiple comments become one combined `pendingFeedbackMessage` and do not produce duplicate inbox writes or duplicate relaunchs
- Cover the interaction with existing `needsFeedbackResponse` and `pendingFeedbackMessage` fields so post-flush recovery remains compatible with the current worker launch path

Acceptance: after the debounce deadline, Ninthwave sends at most one aggregated feedback message for the batch. If the implementer is live, the feedback is delivered via inbox once; if the implementer is parked or dead, one relaunch is scheduled with the combined batch message. Repeated polls do not re-deliver the same batch.

Key files: `core/orchestrator.ts`, `core/orchestrator-actions.ts`, `test/orchestrator-unit.test.ts`

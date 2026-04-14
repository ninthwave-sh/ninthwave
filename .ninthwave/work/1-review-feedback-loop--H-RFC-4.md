# Fix: Make comment acknowledgment mean Ninthwave acted (H-RFC-4)

**Priority:** High
**Source:** Manual decompose request from review-comment orchestration discussion
**Depends on:** H-RFC-3
**Domain:** review-feedback-loop
**Lineage:** 26ef1f8a-be1a-4502-aece-a322b2919595

The current `eyes` reaction means Ninthwave observed a human comment, even when no feedback was delivered and no relaunch was scheduled. Tighten that contract so `eyes` is only added after the aggregated feedback batch has actually been delivered to the implementer or after Ninthwave has committed to a relaunch path. The emoji should never be a no-op.

**Test plan:**
- Update `test/orchestrator-unit.test.ts` reaction expectations so comments only receive `react-to-comment` after successful batch delivery or relaunch scheduling
- Add failure-path coverage showing no `eyes` reaction when delivery did not happen and no relaunch was scheduled
- Verify parked and dead worker cases still get the reaction once the orchestrator has taken a real action on the batch

Acceptance: `eyes` is no longer emitted at comment-detection time. Trusted human comments receive `eyes` only after Ninthwave delivered the aggregated feedback batch or scheduled the relaunch that will address it. Delivery failures and ignored comments do not produce a reaction.

Key files: `core/orchestrator.ts`, `core/orchestrator-actions.ts`, `test/orchestrator-unit.test.ts`

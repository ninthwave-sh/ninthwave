# Feat: Add explicit no-code feedback completion signaling (H-RFC-3)

**Priority:** High
**Source:** Manual decompose request from review-comment orchestration discussion
**Depends on:** H-RFC-2
**Domain:** review-feedback-loop
**Lineage:** c61288f3-5338-45e4-83e2-4b224c3242c1

Sometimes the implementer addresses feedback by replying on the PR instead of pushing code. Add a machine-readable worker-to-orchestrator signal for "feedback addressed without code changes" so the orchestrator can resume the loop without requiring a new commit. Update the implementer instructions to use that path when feedback is resolved by explanation or comment only.

**Test plan:**
- Add command or unit tests for the new completion signal path and its persisted state, including repeated or stale signals
- Extend `test/orchestrator-unit.test.ts` so a no-code completion signal clears pending human feedback and resumes the review/merge loop without a new commit
- Update worker-flow coverage such as `test/inbox.test.ts` or a new focused command test to verify the implementer can emit the explicit completion signal after replying on GitHub

Acceptance: Ninthwave has an explicit worker signal for "feedback addressed without code changes". When the implementer uses it, the orchestrator clears the pending human-feedback batch and resumes the normal loop without waiting for a new commit. The implementer prompt documents when and how to use the signal.

Key files: `core/commands/`, `core/daemon.ts`, `core/orchestrator.ts`, `agents/implementer.md`, `test/orchestrator-unit.test.ts`, `test/inbox.test.ts`

# Feat: Batch human PR comments and pause merge progression (H-RFC-1)

**Priority:** High
**Source:** Manual decompose request from review-comment orchestration discussion
**Depends on:** None
**Domain:** review-feedback-loop
**Lineage:** b8ff0ac7-e6e7-487e-bce0-72b64d87239c

Today each trusted human PR comment is handled immediately, and merge progression can continue while fresh human feedback is still arriving. Change the orchestrator so every trusted human PR comment opens a pending feedback batch with an approximately 60-second debounce window, and pause merge progression while that batch is unresolved. This applies in every merge mode, including auto and bypass, so armed auto-merge must be held back until the feedback loop finishes.

**Test plan:**
- Extend `test/orchestrator-unit.test.ts` to cover multi-comment batching, pending-feedback deadlines, and paused merge progression while human feedback is unresolved
- Extend `test/orchestrator.test.ts` so auto-merge paths stop progressing when new trusted human comments arrive after review passes
- Add restart-safe coverage in `test/orchestrate.test.ts` or `test/daemon-integration.test.ts` for persisted pending feedback state and deadline recovery

Acceptance: trusted human PR comments no longer trigger immediate per-comment relay. Instead, the orchestrator records one pending feedback batch with a deadline, persists it safely across daemon restart, and blocks merge progression or armed auto-merge until that batch is resolved. Existing bot-comment filters and `lastCommentCheck` dedupe still prevent duplicate processing.

Key files: `core/orchestrator.ts`, `core/orchestrator-types.ts`, `core/daemon.ts`, `core/reconstruct.ts`, `test/orchestrator-unit.test.ts`, `test/orchestrator.test.ts`, `test/orchestrate.test.ts`, `test/daemon-integration.test.ts`

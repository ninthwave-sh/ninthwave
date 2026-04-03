# Refactor: Extract shared broker core from `MockBroker` (H-SHB-1)

**Priority:** High
**Source:** Spec `.opencode/plans/1775207598126-tidy-cactus.md`
**Depends on:** None
**Domain:** broker-core
**Lineage:** 59c1ba33-7606-4ca9-8536-810b3baaf602

Pull the crew state machine and protocol message handling out of `core/mock-broker.ts` into shared broker core modules so the test harness and the shipped runtime use the same scheduling, heartbeat, reconnect, and release behavior. Keep `MockBroker` as a thin in-memory wrapper with the current test conveniences, but stop letting it be the only implementation of broker semantics.

**Test plan:**
- Update `test/mock-broker.test.ts` so the existing behavior-contract cases still pass when `MockBroker` delegates to `core/broker-state.ts` and `core/broker-store.ts`.
- Cover author-affinity, dependency gating, schedule-claim dedupe, reconnect resume, and grace-period release paths through the extracted core rather than broker-local helpers.
- Verify `MockBroker` inspection helpers and startup or shutdown behavior still work for existing tests.

Acceptance: Shared broker state and persistence interfaces exist under `core/broker-state.ts` and `core/broker-store.ts`. `core/mock-broker.ts` delegates scheduling and message semantics to that shared core without changing current contract-test behavior, and the targeted plus full test suites pass.

Key files: `core/mock-broker.ts`, `core/broker-state.ts`, `core/broker-store.ts`, `test/mock-broker.test.ts`

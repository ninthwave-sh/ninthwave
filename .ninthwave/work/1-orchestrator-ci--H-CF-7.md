# Feat: CI lifecycle observability events (H-CF-7)

**Priority:** High
**Source:** Dogfooding -- no structured log trail explaining why each CI retry happened
**Depends on:** H-CF-5
**Domain:** orchestrator-ci

**Lineage:** c12ca38a-e494-4dcc-bb91-84c5eec1ad4c

When items hit "exceeded max CI retries", there is no structured log trail explaining why each retry happened. `ciFailCount` increments silently, the circuit breaker fires silently, and respawn triggers are not logged with their reason. Add structured events via the existing `onEvent` callback (`this.config.onEvent?.()`) at four key decision points:

1. **CI failure detected** -- after each `ciFailCount++` (4 sites: lines ~964, ~1007, ~1086, ~1164 in orchestrator.ts): emit `"ci-failure"` with `ciFailCount` and `failureReason`
2. **Circuit breaker fired** -- at the `ciFailCount > maxCiRetries` check: emit `"ci-retry-limit"` with counts and whether the worker was parked
3. **Worker respawn** -- in `respawnCiFixWorker()`: emit `"worker-respawn"` with trigger reason and `ciFailCount`
4. **ciFixAck timeout** -- when `isCiFixAckTimedOut` fires: emit `"ci-fix-ack-timeout"` with `ciFailCount`

Follow the existing pattern at `core/orchestrator.ts:1607` where `onEvent` is used for `"review-round"`.

**Test plan:**
- Add tests verifying each event type is emitted at the correct moment using a spy on `onEvent`
- Test CI failure event includes correct ciFailCount and reason
- Test circuit breaker event includes parked flag
- Follow existing test patterns for onEvent (search for "review-round" in tests)

Acceptance: `onEvent` is called with structured event data at all four decision points. Events include the item ID, event name, and relevant metadata (ciFailCount, failureReason, parked flag, trigger). The events are visible in `nw logs` via the existing event-to-log pipeline. All tests pass.

Key files: `core/orchestrator.ts:863`, `core/orchestrator.ts:882`, `core/orchestrator.ts:936`, `core/orchestrator.ts:964`

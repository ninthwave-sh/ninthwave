# Fix: Increase ciFixAck timeout from 2 minutes to 30 minutes (H-CF-6)

**Priority:** High
**Source:** Dogfooding -- workers respawned before they can diagnose CI failures
**Depends on:** None
**Domain:** orchestrator-ci

**Lineage:** 0102345a-46bf-4bbd-ba13-42021fc2486c

`TIMEOUTS.ciFixAck` at `core/orchestrator-types.ts:704` is set to 2 minutes. After the orchestrator notifies a worker about a CI failure, the worker must heartbeat within this window or get respawned. Two minutes is far too tight -- the worker needs to read CI logs, diagnose root cause, understand the codebase context, plan a fix, and begin implementing before producing its first heartbeat. Increase to 30 minutes. Update the inline comment to explain the rationale. Also update the deprecated alias `CI_FIX_ACK_TIMEOUT_MS` which mirrors this value.

**Test plan:**
- Search for tests that hardcode the 2-minute ciFixAck value and update them to 30 minutes
- Verify `isCiFixAckTimedOut` guard tests still pass with the new threshold
- Run full test suite to catch any timeout-sensitive tests

Acceptance: `TIMEOUTS.ciFixAck` is `30 * 60 * 1000` (30 minutes). The deprecated alias `CI_FIX_ACK_TIMEOUT_MS` reflects the same value. Comment explains workers need substantial diagnostic time. All tests pass.

Key files: `core/orchestrator-types.ts:704`, `core/orchestrator-types.ts:731`

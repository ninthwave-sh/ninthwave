# Fix: Add granular failure states to orchestrator (M-ORC-8)

**Priority:** Medium
**Source:** Dogfooding friction (2026-03-25): ci-failed-state-clarity, repo-bootstrap (status clarity)
**Depends on:** -
**Domain:** orchestrator

The orchestrator maps multiple distinct failure modes to the same "ci-failed" or "stuck" state, making it impossible for users to diagnose issues from status output alone. Worker launch failures (repo not found, startup crash), actual CI check failures, and PR creation failures all appear as "CI Failed" in the status display.

Add more granular failure tracking:
1. Add a `failureReason` field to `OrchestratorItem` that captures why an item failed (e.g., "launch-failed: repo not found", "ci-failed: test timeout", "worker-crashed: startup error").
2. Update `stuckOrRetry()` and the CI check handler to populate this field with a descriptive reason.
3. Update `cmdStatus` output to display the failure reason alongside the state when available.
4. Update the dashboard endpoint to include failure reasons in the JSON response.

Do NOT add new states to `OrchestratorItemState` — keep the state machine simple. Instead, use the `failureReason` metadata field to provide granularity within existing states.

**Test plan:**
- When a worker launch fails, `failureReason` is set to a descriptive string starting with "launch-failed:"
- When CI fails, `failureReason` is set starting with "ci-failed:"
- `ninthwave status` output shows the failure reason for stuck/ci-failed items
- Dashboard JSON response includes failureReason field
- Items that haven't failed have no failureReason (undefined/null)
- Existing orchestrator tests pass without modification

Acceptance: Failure reason is captured and displayed in status output. Users can distinguish launch failures from CI failures from worker crashes without digging through logs. Existing state machine and tests are not broken.

Key files: `core/orchestrator.ts`, `core/commands/status.ts`, `core/session-server.ts`, `test/orchestrator.test.ts`

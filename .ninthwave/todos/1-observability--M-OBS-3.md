# Feat: Emit structured transition events from orchestrator (M-OBS-3)

**Priority:** Medium
**Source:** Vision exploration L-VIS-15 — observability iteration
**Depends on:** None
**Domain:** observability

The `Orchestrator.transition()` method (line ~558 in `core/orchestrator.ts`) updates item state but does not emit any event. The structured log (`deps.log()`) in the command layer captures high-level actions (launch, merge, notify) but not individual state transitions. Adding transition events makes the log a complete audit trail of every state change, which is essential for `nw logs` and `nw history` to show the full picture.

**Implementation:**

1. Add an optional `onTransition` callback to the `Orchestrator` constructor options:
   ```typescript
   onTransition?: (itemId: string, from: string, to: string, timestamp: string, latencyMs: number) => void;
   ```
2. In `transition()`, after updating the item state, call `this.onTransition?.(item.id, prevState, state, detectedTime, item.detectionLatencyMs)`.
3. In `orchestrateLoop()` (command layer), wire the callback to emit a structured log entry:
   ```json
   {"ts":"...","level":"info","event":"transition","item":"H-CR-1","from":"ci-pending","to":"ci-passed","latencyMs":1234}
   ```
4. The callback is optional so existing tests that construct `Orchestrator` without it continue to work unchanged.

**Test plan:**
- Test that `onTransition` is called for every state change with correct arguments
- Test that no-op transitions (same state) do NOT trigger the callback (matches existing guard: `if (item.state === state) return`)
- Test that omitting `onTransition` does not break construction or polling
- Test integration: mock `deps.log` in orchestrateLoop, verify transition events appear in log output
- Verify `bun test test/` passes (no regressions)

Acceptance: Every state transition in the orchestrator emits a structured log entry with item ID, from-state, to-state, timestamp, and detection latency. The callback is optional. All existing tests pass unchanged. New tests cover the callback behavior.

Key files: `core/orchestrator.ts`, `core/commands/orchestrate.ts`, `test/orchestrator-unit.test.ts`

# Fix: Park alive workers at CI retry circuit breaker (H-CF-5)

**Priority:** High
**Source:** Dogfooding friction log (C-AVI-1) -- workers killed mid-fix with uncommitted changes
**Depends on:** None
**Domain:** orchestrator-ci

**Lineage:** 871057ab-a142-4336-9158-2b1ddf051d8b

When `ciFailCount > maxCiRetries`, the orchestrator transitions to "stuck" and emits `workspace-close`, killing the worker immediately. If the worker is still alive and actively working on a fix, this loses in-flight work. Instead, when the circuit breaker fires and the worker is still alive (`snap?.workerAlive`), set `item.sessionParked = true` and return no actions (no `workspace-close`). The worker continues running and the user can manually steer it to completion or use `nw retry`. When the worker is dead, emit `workspace-close` as before. Note: `sessionParked` must be set AFTER `transition()` since `transition()` clears it.

**Test plan:**
- Update existing test at `test/orchestrator-unit.test.ts:1519` ("marks stuck when ciFailCount exceeds maxCiRetries"): add `workerAlive: false` to snapshot, verify `workspace-close` is still emitted
- Add new test: same setup but `workerAlive: true` in snapshot -- expect `state === "stuck"`, `sessionParked === true`, NO `workspace-close` action emitted
- Update `test/daemon-integration.test.ts:658` and `test/orchestrator.test.ts:661` similarly (split into alive/dead variants)
- Verify `test/scenario/ci-failure-recovery.test.ts` still passes (uses `workerAlive: undefined` which should fall through to workspace-close)

Acceptance: When `ciFailCount > maxCiRetries` and `workerAlive` is true, item transitions to "stuck" with `sessionParked = true` and no `workspace-close` action. When `workerAlive` is false or undefined, behavior is unchanged (`workspace-close` emitted). All existing tests pass.

Key files: `core/orchestrator.ts:882-886`, `test/orchestrator-unit.test.ts:1519`, `test/orchestrator.test.ts:661`, `test/daemon-integration.test.ts:658`

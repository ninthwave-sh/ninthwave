# Test: Orchestrator state machine unit tests (M-TST-6)

**Priority:** Medium
**Source:** Vision L-VIS-12 — pipeline reliability (test gap)
**Depends on:** (none)
**Domain:** testing

## Context

The orchestrator's core logic — `reconstructState()`, `buildSnapshot()`, `evaluateMerge()`, and key state transition handlers in `handleImplementing()`, `handleCiPending()`, `handleCiPassed()` — is currently only tested via the high-level `daemon-integration.test.ts`. These integration tests exercise the full daemon lifecycle but don't isolate individual state machine functions.

Adding focused unit tests for these functions would catch regressions faster, make the test suite more targeted, and document the expected behavior of each function.

## Requirements

1. Create `test/orchestrator-unit.test.ts` with focused tests for:
   - `reconstructState()`: recovery from various partial states (worktree exists but no PR, PR exists but no worktree, workspace ref recovery)
   - `buildSnapshot()`: correct snapshot construction from `gh` output (PR state, CI status, mergeable flag, review decision)
   - `evaluateMerge()`: merge decision logic (CI passed + approved = merge, CI passed + no review = wait, conflicting = rebase, etc.)
   - `handleImplementing()`: transition to `ci-pending` when PR detected, transition to `merged` when PR auto-merges between polls
   - `handleCiPending()`: transition to `ci-passed` or `ci-failed` based on snapshot
   - `handleCiPassed()`: merge attempt, conflict detection, review gating
2. Use dependency injection (pass collaborators as function arguments) rather than `vi.mock` to isolate tests.
3. Mock only the `gh` CLI output and multiplexer interactions — test the actual state machine logic.
4. Each test should verify both the state transition AND the emitted actions (e.g., `{ type: "merge" }`, `{ type: "rebase" }`).

Acceptance: `test/orchestrator-unit.test.ts` exists with ≥20 focused unit tests covering the core state machine functions. All tests pass. No `vi.mock` usage — all isolation via dependency injection.

**Test plan:**
- `bun test test/orchestrator-unit.test.ts` passes
- Tests cover: normal flow (queued → merged), CI failure recovery, auto-merge race (PR merges between polls), conflict detection, review gating, state reconstruction from crash
- No `vi.mock` in the test file (verified by lint-tests.test.ts or manual grep)
- Existing tests still pass: `bun test test/`

Key files: `test/orchestrator-unit.test.ts` (new), `core/orchestrator.ts`

# Test: Add integration test coverage for daemon lifecycle (M-TST-5)

**Priority:** Medium
**Source:** Dogfooding friction (2026-03-25): integration-testing-ux-review
**Depends on:** -
**Domain:** testing

The daemon lacks integration tests, which allowed regressions like the remote branch delete warning (M-ORC-7) to slip through. Unit tests cover individual functions but do not exercise the full daemon lifecycle: startup, worker launch, state transitions, merge flow, cleanup, and shutdown.

Add integration tests for the daemon lifecycle:
1. **Startup/shutdown:** Daemon starts, loads TODO files, and shuts down cleanly on SIGTERM.
2. **Single-item flow:** One TODO goes through queued -> ready -> launching -> implementing -> pr-open -> ci-pending -> ci-passed -> merging -> merged -> done.
3. **Stuck item flow:** Worker crash triggers stuck state and retry logic.
4. **Stacking flow:** Dependent items wait for their dependencies to merge before launching.
5. **Cleanup flow:** After merge, worktree and branches are cleaned up (including remote branch delete when already gone).

Use dependency injection to mock external deps (GitHub API, git operations, cmux). Tests should run fast (no real subprocesses or network calls). Each test exercises multiple state transitions in sequence to verify the full flow.

**Test plan:**
- Startup loads TODO files and transitions them to ready/queued based on deps
- Single-item lifecycle completes all state transitions in order
- Worker crash triggers stuckOrRetry with correct retry counting
- Stacking: dependent item stays queued until dependency merges
- Cleanup after merge does not warn when remote branch is already deleted
- All tests pass with `bun test test/` and do not interfere with existing tests

Acceptance: Integration tests cover the 5 lifecycle scenarios. All tests pass. No flaky behavior. Tests use dependency injection (no vi.mock leakage).

Key files: `test/daemon-integration.test.ts`, `core/orchestrator.ts`, `core/daemon.ts`

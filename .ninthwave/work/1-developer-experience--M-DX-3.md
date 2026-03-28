# Feat: Auto-commit analytics files at orchestration shutdown (M-DX-3)

**Priority:** Medium
**Source:** Dogfood friction #13 — analytics JSON files never committed; friction #19 — friction log never committed
**Depends on:** None
**Domain:** developer-experience

When the orchestrator daemon shuts down (clean exit, SIGINT, or SIGTERM), check for new or modified files in `.ninthwave/analytics/` and commit them to the current branch. This preserves orchestration run data in git history for post-hoc analysis, addressing a long-standing friction item.

## Implementation

In `core/commands/orchestrate.ts`, add a `commitAnalytics()` function called from the shutdown/cleanup path (the `finally` block in `watchLoop` or the signal handler):

1. Run `git status --porcelain .ninthwave/analytics/` to detect changes
2. If changes exist:
   - `git add .ninthwave/analytics/`
   - `git commit -m "chore: update orchestration analytics"`
3. Do NOT push — the commit stays local. The user or next daemon run will push as needed.

The commit is best-effort — if git operations fail (e.g., index locked, unclean state), log a warning and continue shutdown. Never block graceful exit.

**Scope note:** This item covers `.ninthwave/analytics/` only. Friction log auto-commit (`.ninthwave/friction/`) follows the same pattern but is handled by the `/work` skill's friction review phase, not the daemon shutdown.

**Test plan:**
- Test: `commitAnalytics()` with modified analytics files → creates a commit with correct message
- Test: `commitAnalytics()` with no changes → no commit, no error
- Test: `commitAnalytics()` when git index is locked → logs warning, returns cleanly
- Test: verify `commitAnalytics()` is called during daemon shutdown (mock the git operations)
- Test: commit only touches `.ninthwave/analytics/` (doesn't accidentally stage other files)

Acceptance: When the daemon shuts down after at least one poll cycle, any new or modified `.ninthwave/analytics/` files are committed. The commit message is `chore: update orchestration analytics`. Git failures during commit are non-fatal (warning logged, shutdown continues). `bun test test/` passes.

Key files: `core/commands/orchestrate.ts`, `test/orchestrate.test.ts`

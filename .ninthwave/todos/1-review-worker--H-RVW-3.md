# Feat: Parameterize launchAiSession and add launchReviewWorker function (H-RVW-3)

**Priority:** High
**Source:** Review worker plan (2026-03-25)
**Depends on:** H-RVW-1
**Domain:** review-worker

Extend the worker launch infrastructure in `core/commands/start.ts` to support review workers alongside implementation workers.

Two changes:

1. **Parameterize `launchAiSession`**: Currently hardcodes `--agent todo-worker` when launching Claude Code sessions. Add an optional `agentName` parameter (default: `"todo-worker"`) so callers can specify `"review-worker"` or any future agent type. This is a minimal change — add the parameter, use it in the claude command construction.

2. **Add `launchReviewWorker` function**: New exported function that launches a review worker session for a specific PR. Behavior varies by `autoFixMode`:
   - `off`: No worktree needed. The review worker only reads the diff via `gh pr diff` and posts comments via `gh pr review`. Run in a temp directory or the main checkout (read-only). Lighter and faster.
   - `direct` / `pr`: Create a worktree named `review-{id}` from the existing `todo/{id}` branch (fetch + checkout). The review worker needs the worktree to push fix commits.

   System prompt construction:
   ```
   YOUR_REVIEW_PR: {prNumber}
   YOUR_REVIEW_ITEM_ID: {itemId}
   PROJECT_ROOT: {repoRoot}
   REPO_ROOT: {repoRoot}
   AUTO_FIX_MODE: {off|direct|pr}
   [BASE_BRANCH: {branch} (if stacked)]
   ```

   No partition allocation (review workers don't need isolated ports/DBs).
   Launch with `--agent review-worker`.
   Return `{ worktreePath: string | null, workspaceRef: string }` — `worktreePath` is null in `off` mode.

Cross-repo support: use `resolvedRepoRoot` (the target repo where the PR lives) for both worktree creation and `gh` commands, same pattern as `launchSingleItem`.

**Test plan:**
- Unit test: `launchAiSession` passes `agentName` through to the claude command (verify `--agent review-worker` appears in constructed command)
- Unit test: `launchReviewWorker` with `off` mode does not create a worktree
- Unit test: `launchReviewWorker` with `direct` mode creates worktree from `todo/{id}` branch
- Unit test: system prompt contains correct `YOUR_REVIEW_PR`, `AUTO_FIX_MODE` values
- Verify existing `launchSingleItem` behavior unchanged (agentName defaults to `todo-worker`)

Acceptance: `launchAiSession` accepts an `agentName` parameter. `launchReviewWorker` correctly handles all three auto-fix modes. Existing worker launch behavior is unchanged. Review worker sessions launch with `--agent review-worker` and the correct system prompt.

Key files: `core/commands/start.ts`, `test/start.test.ts`

# Fix: Auto-save uncommitted work before session respawn (H-WR-3)

**Priority:** High
**Source:** Dogfooding friction -- worker killed mid-implementation, all uncommitted changes lost
**Depends on:** H-WR-2
**Domain:** worktree-reliability
**Lineage:** 0cbf0d7a-4959-4f67-b418-b514fe06f3a7

When the orchestrator kills and respawns a worker session, `executeRetry()` closes the workspace without checking for uncommitted changes. If the worker was mid-edit, all unsaved work is lost. The new session inherits only committed state and has no hint of the in-flight approach, wasting tokens re-deriving the plan. Before closing the workspace in `executeRetry()`, check `git status --porcelain` in the worktree. If the working tree is dirty, auto-commit all changes with `wip: ninthwave auto-save before respawn` and push so the work is preserved for the next session.

**Test plan:**
- Unit test: `executeRetry` runs `git status --porcelain` in worktree before closing workspace
- Unit test: dirty worktree triggers auto-commit with `wip: ninthwave auto-save before respawn` message
- Unit test: auto-commit is pushed to the remote branch
- Unit test: clean worktree skips auto-save (no empty commits)
- Unit test: git command failure during auto-save does not block the retry (best-effort)
- Verify existing retry/respawn tests still pass

Acceptance: `executeRetry()` checks for uncommitted changes before closing the workspace. Dirty worktrees get an automatic WIP commit with a descriptive message, pushed to the remote branch. Clean worktrees skip auto-save. Git failures during auto-save are logged but do not prevent the retry from proceeding. All existing tests pass.

Key files: `core/orchestrator-actions.ts`

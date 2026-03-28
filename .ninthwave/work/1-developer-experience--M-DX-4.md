# Fix: Pre-launch validation for uncommitted work item files (M-DX-4)

**Priority:** Medium
**Source:** Dogfood friction — workers launched before work item files committed to main (2026-03-27)
**Depends on:** None
**Domain:** developer-experience

When `nw watch` or `nw <ID>` launches workers, validate that all work item files referenced by the launch are committed and pushed to the remote. Workers run in worktrees created from the remote branch — if work item files exist only locally, workers can't read their own specs.

## Implementation

Add a `validateWorkItemsCommitted()` function in `core/commands/launch.ts`:

1. For each work item ID being launched, check if its file in `.ninthwave/work/` has uncommitted changes: `git status --porcelain .ninthwave/work/*--{ID}.md`
2. If any files are uncommitted (new or modified), check if they exist on `origin/main` (or the base branch): `git show origin/main:.ninthwave/work/{filename} 2>/dev/null`
3. If files are local-only or modified:
   - Log a warning: `"Work item files not pushed to remote — workers in worktrees won't see them"`
   - Offer to auto-commit and push: `git add .ninthwave/work/ && git commit -m "chore: add work item files" && git push`
   - In non-interactive mode (daemon), auto-commit and push without prompting

Call this function from:
- `watchLoop()` in `orchestrate.ts` — before the first poll cycle
- `cmdRunItems()` in `launch.ts` — before launching workers

**Test plan:**
- Test: all work item files committed and pushed → no warning, launch proceeds
- Test: work item file exists locally but not on remote → warning logged, auto-commit in daemon mode
- Test: work item file modified but not committed → warning logged
- Test: `.ninthwave/work/` is clean but other files are dirty → no false positives
- Test: git operations fail gracefully (e.g., no remote configured) → warning only, don't block launch

Acceptance: `nw watch` and `nw <ID>` check that referenced work item files are committed before launching workers. Uncommitted files trigger a warning. In daemon mode, files are auto-committed and pushed. Git failures are non-fatal. `bun test test/` passes.

Key files: `core/commands/launch.ts`, `core/commands/orchestrate.ts`, `test/launch.test.ts`

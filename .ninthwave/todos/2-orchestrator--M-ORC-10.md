# Fix: Remote branch delete warning still appearing despite M-ORC-7 fix (M-ORC-10)

**Priority:** Medium
**Source:** Dogfooding friction (2026-03-25): remote-branch-delete-warning
**Depends on:** -
**Domain:** orchestrator

M-ORC-7 added a fix to `deleteRemoteBranch()` in `core/git.ts` to treat "remote ref does not exist" as success instead of throwing. However, the warning is still appearing in output: `"Warning: Failed to delete remote branch todo/H-RVW-4: git push failed (exit 1): error: unable to delete 'todo/H-RVW-4': remote ref does not exist"`.

This error message format indicates `deleteRemoteBranch` is still throwing (the `"git push failed (exit 1):"` prefix comes from the throw in that function). The `stderr.includes("remote ref does not exist")` check should match this text, so the issue is likely:
1. The stderr output from `git push origin --delete` may have changed format in newer git versions (different line breaks, extra text, or encoding).
2. Or there is a race where the branch is deleted between the git-push and the stderr capture.

Debug and fix:
1. Add a test that captures the exact stderr output from `git push origin --delete <nonexistent-branch>` on the current git version.
2. Update the string match in `deleteRemoteBranch` to be more robust (e.g., regex, case-insensitive, or match multiple known formats).
3. Also verify that `clean.ts` callers at lines 196-198 and 296-298 are not catching and re-warning redundantly.

**Test plan:**
- `deleteRemoteBranch` returns silently (no throw) when the branch does not exist on remote
- The exact stderr format from the current git version is captured in a test assertion
- `ninthwave clean` does not emit "Failed to delete remote branch" warnings for already-deleted branches
- Existing git.test.ts tests for deleteRemoteBranch still pass
- Test with both "remote ref does not exist" and "unable to delete" error text variants

Acceptance: No warning output when cleaning up a branch that was already deleted by GitHub auto-delete. The fix handles multiple git stderr format variants. Existing tests pass.

Key files: `core/git.ts`, `core/commands/clean.ts`, `test/git.test.ts`

# Fix: Commit and push TODO changes before launching orchestrator (H-IDP-2)

**Priority:** High
**Source:** User friction report -- workers in worktrees don't see uncommitted TODO file changes
**Depends on:** None
**Domain:** work-skill

The /work skill (Phase 2) launches `ninthwave orchestrate` without first committing and pushing any new or modified TODO files from Phase 1 (selection, reconciliation, or ad-hoc edits). Workers spawn in worktrees cloned from the remote, so uncommitted TODO changes are invisible to them. Add a git commit+push step between Phase 1 and Phase 2 in `skills/work/SKILL.md`. Follow the same pattern already used in Phase 3 Step 5 (commit friction artifacts): stage `.ninthwave/todos/`, commit only if there are staged changes, and push to the current branch.

**Test plan:**
- Manual review -- this is a skill markdown change only

Acceptance: `skills/work/SKILL.md` includes a step between Phase 1 and Phase 2 that stages `.ninthwave/todos/`, commits if there are changes, and pushes. The step is clearly documented with a rationale comment explaining why (worktree visibility).

Key files: `skills/work/SKILL.md`

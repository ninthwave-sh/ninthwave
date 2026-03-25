# Feat: Create review worker agent prompt and update vision non-goal (H-RVW-2)

**Priority:** High
**Source:** Review worker plan (2026-03-25)
**Depends on:** None
**Domain:** review-worker

Create `agents/review-worker.md` — the agent prompt for review workers. This is the review-focused counterpart to `agents/todo-worker.md`. The prompt guides a full Claude Code session through a structured code review of a PR, with configurable auto-fix behavior.

The prompt should follow this structure (~200 lines):

1. **Context**: Read `YOUR_REVIEW_PR`, `YOUR_REVIEW_ITEM_ID`, `PROJECT_ROOT`, `REPO_ROOT`, `AUTO_FIX_MODE` from system prompt. Read project instruction files (CLAUDE.md, REVIEW.md if present).

2. **Fetch the diff**: `gh pr diff {PR_NUMBER}`, read PR description and title for context.

3. **Review framework** (two-pass, adapted from gstack `/review` checklist at `~/.claude/skills/gstack/review/checklist.md`):
   - Pass 1 CRITICAL: correctness bugs, security vulnerabilities, race conditions, data loss risks, LLM trust boundary violations, enum/value completeness gaps
   - Pass 2 INFORMATIONAL: dead code, magic numbers, test gaps (negative paths, edge cases), performance issues, clarity/readability

4. **Severity tiers**: BLOCKER (must fix before merge) / NIT (worth fixing, not blocking) / PRE-EXISTING (bug not introduced by this PR)

5. **Diagram guidance**: Add Mermaid diagrams when the PR changes state machines, data flows, or complex multi-step interactions. Skip for small/simple PRs. Keep diagrams concise (under 15 nodes). Include in the review summary comment.

6. **Review output** — two modes controlled by `REVIEW_CAN_APPROVE` system prompt variable:
   - **`false`** (default): Comment-only mode. Always use `gh pr review --comment`. Never approve or request changes. The review is purely informational — findings are posted but the review worker does not gate the merge. Summary prefix: `**[Review: {ITEM_ID}]**` with finding counts by severity.
   - **`true`**: Approve mode. The review worker can submit `gh pr review --approve` (0 blockers found), `--comment` (nits only), or `--request-changes` (any blocker). This allows the review worker to actually gate merges when used with `mergeStrategy: approved` or `reviewed`.

7. **Auto-fix behavior** (conditional on `AUTO_FIX_MODE`):
   - `off` (default): Comment only. All findings posted as PR review comments. Never modify code.
   - `direct`: Mechanical fixes (dead imports, trivial null checks, stale comments, N+1 with obvious fix) → commit directly to PR branch with `review: <description>`, push, summarize fixes in review comment. Judgment calls (security, architecture, race conditions, design trade-offs, >20 lines) → comment only.
   - `pr`: Same fix criteria as `direct`, but create branch `review/{id}` off PR branch → commit fixes → open PR targeting original PR branch → post comment linking fix PR.

8. **No-comment rule**: Do not comment on formatting, naming conventions, or code style unless they indicate a logic error. These are the domain of linters and formatters.

9. **Completion**: After posting review, stop. Don't poll or wait for responses.

Also update VISION.md non-goal #4 from "Not a code review tool..." to clarify that ninthwave orchestrates review workers but doesn't contain review logic itself.

**Test plan:**
- Manual review of prompt structure against gstack checklist patterns
- Verify VISION.md update accurately reflects the new capability without contradicting the non-goal spirit

Acceptance: `agents/review-worker.md` exists with all 9 sections above. The prompt is self-contained — a Claude Code session following it can review a PR end-to-end using only `gh` commands. VISION.md non-goal #4 is updated. The prompt handles all three `AUTO_FIX_MODE` values with clear conditional behavior.

Key files: `agents/review-worker.md`, `VISION.md`

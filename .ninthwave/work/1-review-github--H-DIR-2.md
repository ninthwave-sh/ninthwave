# Feat: Add GitHub helpers for review maintenance PRs (H-DIR-2)

**Priority:** High
**Source:** Approved DIR plan `.opencode/plans/1775207732828-stellar-harbor.md`
**Depends on:** None
**Domain:** review-github
**Lineage:** 4fa5030f-3ba1-4984-8e33-b40df45fc718

Extend the GH helper layer so the review workflow can deterministically create or update one long-lived PR per review domain and attach file-specific reasoning to deleted inbox files. The new helpers should cover review PR discovery and body updates plus deleted-file review comments with stable markers so reruns update existing content instead of spraying duplicates. Keep the implementation in `core/gh.ts` and its tests so later review-inbox logic can call a narrow, reusable API.

**Test plan:**
- Add `test/gh.test.ts` coverage for finding or updating a long-lived review PR by head branch and for replacing body content without duplicating comments.
- Add focused tests for creating and updating deleted-file review comments, including missing existing comment and duplicate-marker rerun cases.
- Verify existing GH helper tests still pass so orchestrator comment behavior is not regressed.

Acceptance: `core/gh.ts` exposes reusable helpers for review PR lookup/update and deleted-file review comments, rerunning the same helper path is idempotent, and the GH helper test suite covers both happy-path and duplicate-safe behavior.

Key files: `core/gh.ts`, `test/gh.test.ts`

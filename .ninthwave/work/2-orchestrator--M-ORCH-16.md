# Fix: Detect merged dependencies before sending rebase nudges (M-ORCH-16)

**Priority:** Medium
**Source:** Friction logs from downstream dogfooding (M-MCX-44, 2026-04-27; H-MCX-87, 2026-04-30) and ninthwave (H-WRK-2, 2026-04-14)
**Depends on:** None
**Domain:** orchestrator
**Lineage:** 07cf65a7-3ee9-4946-bddb-9f03d6451f9a

When a stacked dependency merges into main and CI later flaps on the child PR, the orchestrator emits a "Resume: dependency X CI is back to pending. Please rebase onto ninthwave/X" message without checking whether X has merged. The implementer Phase 11 rebase handler follows the literal instruction and rebases onto the (now-stale) dependency branch, which is behind main and may carry stray review-feedback commits. The result is redundant chain commits in the child PR's history, occasionally a child branch behind main, and required human intervention. Phase 3 already has a merged-dep escape hatch (rebase onto main, drop --base) but Phase 11 does not.

Two halves, one work item:
1. Orchestrator: before sending the resume rebase nudge (around `core/orchestrator.ts:734-745`), check `item.dependencies` for any dep already in a merged or done state. If the dep is merged, send a "rebase onto main" instruction instead, or suppress the nudge entirely so the standard behind-main detection takes over.
2. Implementer Phase 11 rebase handler (`agents/implementer.md:487-505`): repeat Phase 3's merged-check before rebasing onto `$BASE_BRANCH`. If the base branch was squash-merged, rebase onto main and clear `--base` for any subsequent PR updates.

**Test plan:**
- Unit: orchestrator does not send "rebase onto X" when X is in `done`/`merged`; sends "rebase onto main" or suppresses.
- Integration: child PR with a merged stacked dep receives the right rebase instruction and lands with a clean diff against main.
- Phase 11 doc test: walk-through covers the "BASE_BRANCH already merged" path explicitly.
- Regression: non-merged deps continue to receive the standard rebase nudge.

Acceptance: Orchestrator checks dep state before issuing the resume rebase nudge. Phase 11 of `agents/implementer.md` includes a merged-check matching Phase 3's pattern. Child PR after a stacked dep merges has a clean diff against main with no redundant chain commits. Tests cover both halves.

Key files: `core/orchestrator.ts:734`, `core/orchestrator-actions.ts:735`, `agents/implementer.md:487`

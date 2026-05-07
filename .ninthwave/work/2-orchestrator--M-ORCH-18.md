# Fix: Dead-reviewer detection runs before CI-status check in handleReviewing (M-ORCH-18)

**Priority:** Medium
**Source:** Friction log from downstream dogfooding (H-MCX-157, 2026-05-04)
**Depends on:** None
**Domain:** orchestrator
**Lineage:** 0b076bc4-7e3d-4044-bb96-3e18b0bb1103

The orchestrator misclassifies "Ninthwave / Review" worker-died status as a code-level CI failure and dispatches CI Fix Request messages to the implementer. The implementer cannot fix it -- the failure description is "Review worker died without verdict -- will retry" and is an infrastructure issue, not a code defect. Real CI (Test Web, Test E2E, CI Gate) all pass. The implementer wakes repeatedly to investigate, finds nothing, and posts a blocker comment.

`IGNORED_CHECK_NAMES` in `core/gh.ts:736` and `filterRelevantChecks` in `core/commands/pr-monitor.ts:234` already exclude "Ninthwave / Review" from CI aggregation, but `handleReviewing` in `core/orchestrator.ts:1678` evaluates `snap?.ciStatus === "fail"` before the dead-reviewer recovery block at `1718`. There is a code path where the CI-failure branch fires first. Reorder so dead-reviewer detection runs first: if the reviewer worker is dead, respawn it as an infrastructure recovery and skip CI-failure routing entirely.

**Test plan:**
- Unit: reviewer worker dies, `Ninthwave / Review` reports failure, real CI passes -- expect reviewer respawn, no CI Fix Request.
- Unit: reviewer alive, real CI fails -- expect CI Fix Request as today.
- Unit: reviewer dies AND real CI fails -- expect reviewer respawn first; CI failure handled in the next cycle when reviewer reports.
- Regression: existing `IGNORED_CHECK_NAMES` path continues to filter from aggregation.

Acceptance: `handleReviewing` checks dead-reviewer state before evaluating `ciStatus`. Reviewer-died status no longer routes to the implementer's CI Fix Request handler. Tests cover the three states above.

Key files: `core/orchestrator.ts:1650-1740` (`handleReviewing`), `core/gh.ts:736` (`IGNORED_CHECK_NAMES`)

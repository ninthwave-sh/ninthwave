# Docs: Worker test verification should prefer test:unit and use longest shell timeout (M-WRK-5)

**Priority:** Medium
**Source:** Friction logs ninthwave H-WRK-1 (2026-04-14), H-RFC-2 (2026-04-14)
**Depends on:** None
**Domain:** worker-reliability
**Lineage:** 2e82a516-89ad-4b9e-9ce8-42abd0a97cde

Workers running full-suite verification with `bun run test` repeatedly hit the 120s shell-level timeout, requiring a rerun with a longer timeout before the PR can be finalized. Two friction logs report the same symptom from different items. The implementer prompt instructs the agent to "Run the tests and verify they pass" without specifying which command or timeout, so the agent defaults to the full suite at the harness's default shell timeout. CLAUDE.md already documents the trade-off (`bun run test:unit` for fast feedback; `bun run test` for full coverage with a 300s global process timeout) but the implementer prompt does not surface this guidance.

Update `agents/implementer.md` Phase 5 (or wherever the test step lives) to: prefer `bun run test:unit` for in-worker verification, fall back to `bun run test` only when the work item demands full-suite coverage, and in all cases use the longest practical shell-tool timeout (the same pattern already documented for `nw inbox --wait`). The right outcome is to stop spending implementer iterations on timeout reruns; CI runs the full suite as the authoritative gate.

**Test plan:**
- Manual review: `agents/implementer.md` Phase 5 explicitly references `bun run test:unit` as the preferred verification command and instructs to use the longest available shell timeout.
- No regression in projects that have only `bun run test` (the guidance is conditional on `test:unit` existing).
- Spot-check: ninthwave's own next worker-launched PR completes verification without a 120s timeout rerun.

Acceptance: Phase 5 of `agents/implementer.md` includes explicit guidance on test command selection and shell timeout. The guidance is portable (does not assume bun) -- it instructs the agent to use the project's fastest test command for verification when one is available, and to use the longest practical shell-tool timeout. CI workflows are unchanged.

Key files: `agents/implementer.md` (Phase 5), `CLAUDE.md` (existing test safety section -- cross-reference)

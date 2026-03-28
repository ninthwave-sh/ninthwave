# Feat: Add ID pattern detection and topo-sort launching (H-CR-5)

**Priority:** High
**Source:** CLI command redesign plan (2026-03-28)
**Depends on:** H-CR-3
**Domain:** cli-redesign

Add `nw <ID> [ID2...]` as the primary way to launch TODO items. In `cli.ts`, detect TODO IDs by regex pattern (`/^[A-Z]+-[A-Z0-9]+-\d+[a-z]*$/`) before command dispatch. If all args match the ID pattern, route to a new `cmdRunItems()` in `core/commands/launch.ts`. This function: (1) validates all IDs exist in the TODO list, (2) checks that dependencies are either completed or in the passed ID set -- if not, die with helpful message, (3) calls `computeBatches()` from `batch-order.ts` to get topological layers, (4) launches items layer by layer using existing `launchSingleItem()`, (5) logs the computed layers before launching. If an unknown command matches the ID pattern case-insensitively, show "Did you mean H-RR-1? TODO IDs are uppercase." Die immediately if any launch in a layer fails.

**Test plan:**
- Test ID pattern regex: matches H-RR-1, M-SF-1, L-VIS-15; rejects watch, init, lowercase h-rr-1
- Test topo-sort: dependency diamond A->B, A->C, B->D, C->D produces layers [A,C], [B], [D]
- Test circular dep detection: A depends on B, B depends on A -> die with cycle
- Test missing dep: B depends on A (not passed, not done) -> helpful refusal message
- Test single ID (no deps): degenerates to current launch behavior
- Test lowercase ID hint: `nw h-rr-1` -> "Did you mean H-RR-1?"

Acceptance: `nw H-CR-1` launches that item. `nw H-CR-1 H-CR-2` launches both in parallel (same batch). `nw A B` where B depends on A launches A first, then B. Circular deps and missing deps produce helpful error messages. All tests pass.

Key files: `core/cli.ts`, `core/commands/launch.ts`, `core/help.ts`, `core/commands/batch-order.ts`, `test/launch.test.ts`

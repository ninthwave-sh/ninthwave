# Feat: Add `nw history <ID>` command for item state timeline (H-OBS-2)

**Priority:** High
**Source:** Vision exploration L-VIS-15 — observability iteration
**Depends on:** None
**Domain:** observability

The daemon persists state archives to `~/.ninthwave/projects/{slug}/state-archive/{timestamp}.json` and the current state to `orchestrator.state.json`. These files record every item's state at each snapshot, but there's no way to reconstruct the timeline for a specific item. Add `nw history <ID>` to show how an item moved through the pipeline.

**Implementation:**

Create `core/commands/history.ts` with `cmdHistory(id: string)`. The command:
1. Resolves the project slug from the current directory
2. Reads all state archive files (sorted chronologically) + current state
3. For the specified item ID, extracts `(timestamp, state)` pairs from each archive
4. Deduplicates consecutive identical states (only show transitions)
5. Displays a timeline:
   ```
   H-CR-1 — Rename watch.ts to pr-monitor.ts

   ready        03-28 10:15:03   (2m 14s)
   launching    03-28 10:17:17   (8s)
   implementing 03-28 10:17:25   (12m 3s)
   ci-pending   03-28 10:29:28   (1m 45s)
   ci-passed    03-28 10:31:13   (22s)
   merging      03-28 10:31:35   (3s)
   merged       03-28 10:31:38
   ```
6. Shows total wall-clock time from first seen to final state
7. If the ID is not found in any archive, print "No history found for <ID>. Run `nw list` to see available items."

Register in `core/cli.ts`. Add to Diagnostics group if available.

**Test plan:**
- Test timeline construction from multiple archive files
- Test deduplication of consecutive identical states
- Test duration calculation between transitions
- Test missing item ID: helpful error message
- Test single-archive case (item appears in only one snapshot)
- Test item across full lifecycle: ready → launching → implementing → ci-pending → ci-passed → merged

Acceptance: `nw history H-CR-1` shows a chronological timeline of state transitions with durations. Consecutive duplicate states are collapsed. Unknown IDs produce helpful guidance. All tests pass.

Key files: `core/commands/history.ts` (new), `core/cli.ts`, `core/daemon.ts`, `test/history.test.ts` (new)

# Fix: Daemon reconciles work-item file edits and deletions, not just additions (H-ORCH-15)

**Priority:** High
**Source:** Friction log from downstream dogfooding (H-IUS-8, 2026-04-14)
**Depends on:** None
**Domain:** orchestrator
**Lineage:** 43b3c759-d6f3-4737-af0b-aaf4c5c90c0b

The daemon's `scanForNewWatchItems` is add-only: once an item is parsed and added to the in-memory orchestrator, its `dependencies` array is frozen for the life of the session. Edits, renames, and deletions of work-item files are invisible to the running daemon. When a work-item file is renamed mid-session (a normal recovery action for ID-collision fixes or dependency rewiring), the original ID becomes a "zombie" entry that wedges the dep graph -- only a daemon restart clears it, which kills in-flight workers. Commit `10df3ffa` (read items from origin/main) improved sourcing at startup but did not add per-tick reconciliation.

Extend the watch-mode rescan path to reconcile, not just add. On each tick (or every N ticks gated by mtime / origin-main HEAD), diff the freshly-listed item set against `orch.getAllItems()`: add new items as today, remove deleted items unless they are in a terminal state, and update existing items whose dependencies or other parsed fields changed. Add `removeItem` to `core/orchestrator.ts`. Log one line per reconciled change so operators can see what the daemon noticed.

**Test plan:**
- Unit: rescan detects an addition, a deletion, and a dependency edit in a single tick and applies all three.
- Unit: deletions targeting items in a terminal state (`merged`, `done`) are preserved for history.
- Integration: rename a queued item mid-session (`H-IUS-7` -> `H-IUS-11`), confirm the zombie is dropped and the dependent item promotes.
- Edge case: dangling dependency IDs continue to be treated as satisfied (existing `dependencySatisfied` behaviour).

Acceptance: Watch-mode tick reconciles additions, deletions, and edits against origin/main work-item set. Zombie entries no longer wedge the queue when a file is renamed or deleted. New tests cover all three reconcile paths. No regression in startup load or in `nw history` output.

Key files: `core/orchestrate-event-loop.ts:805` (`scanForNewWatchItems`), `core/orchestrator.ts:217` (add `removeItem`), `core/startup-items.ts:178` (`refreshRunnableStartupItems` -- reuse where possible)

# Fix: Status pane not reused when daemon restarts in cmux (H-STP-1)

**Priority:** High
**Source:** Dogfood friction — new status pane opens every daemon restart, cluttering cmux
**Depends on:**
**Domain:** orchestrator

## Context

When the orchestrator daemon starts, it always opens a new cmux status pane instead of reusing the existing one. After multiple restarts (common during development/debugging), the user ends up with many orphaned status panes. H-STA-2 was supposed to fix this but the behavior persists.

## Requirements

1. On startup, check if a status pane already exists (by name `nw-status` or by reading the state file's `statusPaneRef`)
2. If an existing status pane is found and responsive (cmux read-screen succeeds), reuse it instead of creating a new one
3. If the existing pane is stale/unresponsive, close it first, then create a new one
4. Add a test verifying reuse behavior

Acceptance: Restarting the orchestrator daemon reuses the existing status pane. No duplicate panes accumulate. Test proves the reuse path.

**Test plan:** Unit test: mock cmux with existing status pane, verify `launchStatusPane()` reuses it. Unit test: mock cmux with stale pane (read-screen fails), verify it closes old and creates new. Edge case: state file references a pane that was manually closed by user.

Key files: `core/commands/orchestrate.ts`, `core/mux.ts`

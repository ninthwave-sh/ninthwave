# Fix: Status command shows stale state from previous orchestrator run (H-SST-1)

**Priority:** High
**Source:** Dogfood friction — status toggles between current and 9h-old orchestrator state
**Depends on:**
**Domain:** orchestrator

## Context

`ninthwave status` alternates between showing the current daemon's items and items from a previous run (9+ hours old). This happens because the orchestrator.state.json file contains items from the old run that were never cleaned up. The status command reads whatever is in the state file and displays it, so stale items from previous runs appear alongside current ones.

The state file should only contain items for the currently running daemon. When a new daemon starts with a different set of items, the old state should be replaced entirely — not merged.

## Requirements

1. When the orchestrator daemon starts, write a fresh state file containing only the items for this run — do not preserve items from previous runs
2. If a previous daemon's state exists, archive it (move to `.ninthwave/analytics/` or `.ninthwave/state-archive/`) before overwriting
3. `ninthwave status` should only show items from the most recent daemon run
4. If no daemon is running, status should show the last run's final state (not a mix of multiple runs)
5. Add a test verifying state file is fresh on new daemon start

Acceptance: Starting a new orchestrator run replaces the state file. `ninthwave status` never shows items from a previous run mixed with current run. Old state is archived, not lost.

**Test plan:** Unit test: write a state file with old items, start a new daemon with different items, verify state file only contains new items. Unit test: verify archived state is readable. Edge case: daemon crashes before writing state — next status command should handle gracefully.

Key files: `core/commands/orchestrate.ts`, `core/commands/status.ts`, `core/orchestrator.ts`

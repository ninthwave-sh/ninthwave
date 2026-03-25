# Feat: Add `ninthwave retry` command for stuck items (H-ORC-8)

**Priority:** High
**Source:** Dogfooding friction (2026-03-25): daemon-persistence-and-retry
**Depends on:** -
**Domain:** orchestrator

When a worker fails and an item goes to "stuck", the only option is to manually re-run the entire orchestrator. There is no way to retry a specific item. This blocks entire dependency chains with no lightweight recovery path.

Add a `ninthwave retry <ID> [ID2...]` command that:
1. Reads the daemon state file and finds the specified item(s).
2. Validates the item is in a terminal/stuck state (stuck or done — refuse to retry items that are actively being processed).
3. Resets the item state to "queued" and clears its retry count.
4. Cleans up the item's worktree and branch if they exist (reuse `cleanItem` logic from clean.ts).
5. Writes the updated state back to the state file.
6. If the daemon is running (detected via PID file or socket), sends a notification to trigger re-processing.
7. If the daemon is not running, prints a message suggesting the user start the orchestrator.

**Test plan:**
- `ninthwave retry H-PRX-4` resets a stuck item to queued
- `ninthwave retry H-PRX-4 H-PRX-5` resets multiple items
- Retrying an item that is currently "implementing" or "ci-pending" is rejected with an error
- Retrying a non-existent ID produces a clear error message
- Item's retry count is reset to 0
- Previous worktree and branch are cleaned up before reset
- State file is updated atomically (no corruption on concurrent access)

Acceptance: `ninthwave retry <ID>` resets stuck items to queued. Worktree cleanup happens. Active items cannot be retried. Clear error messages for invalid inputs.

Key files: `core/commands/retry.ts`, `core/cli.ts`, `core/daemon.ts`, `core/orchestrator.ts`

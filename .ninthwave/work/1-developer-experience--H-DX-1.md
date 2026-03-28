# Feat: Add Copilot trusted_folders setup to `nw init` (H-DX-1)

**Priority:** High
**Source:** Dogfood friction — Copilot folder trust prompt blocked every worker launch (2026-03-26)
**Depends on:** None
**Domain:** developer-experience

When `nw init` detects Copilot CLI as an available AI tool, automatically add the project root to `~/.copilot/config.json#trusted_folders`. This prevents the interactive "Confirm folder trust" prompt that blocks every worker launch in worktrees — Copilot does parent-path prefix matching, so trusting the project root covers all `.worktrees/` paths.

## Implementation

In `core/commands/init.ts`, after AI tool detection (where `tools.push("copilot")` on line ~195):

1. Read `~/.copilot/config.json` if it exists (create if not)
2. Parse JSON, ensure `trusted_folders` array exists
3. Check if `projectRoot` or any parent path is already in the array
4. If not present, append `projectRoot` and write back
5. Log: `info("Added project root to Copilot trusted_folders")`

The write is idempotent and non-destructive — it only adds to the array, never removes.

**ETHOS consideration:** This writes to `~/.copilot/config.json`, which is outside the project directory. This is a narrow exception to Ethos principle #1 ("never modify user config outside the project directory") because: (a) it only adds to an array, never removes or modifies existing entries, (b) it's required for Copilot to work non-interactively with worktrees, (c) the user is explicitly running `nw init` which is an opt-in setup command. Add a log message making the write visible, and skip silently if the file can't be written (permissions, etc.).

**Test plan:**
- Test: when `~/.copilot/config.json` doesn't exist, creates it with `{ "trusted_folders": [projectRoot] }`
- Test: when config exists without `trusted_folders`, adds the key with `[projectRoot]`
- Test: when `trusted_folders` already contains the project root, no-op (idempotent)
- Test: when a parent path is already trusted (e.g., `~`), skips add (parent covers children)
- Test: when config exists with other `trusted_folders` entries, preserves them
- Test: when file is unwritable, logs warning and continues (non-fatal)

Acceptance: `nw init` on a project with Copilot CLI available adds the project root to `~/.copilot/config.json#trusted_folders`. Existing entries are preserved. The operation is idempotent. File write failures are non-fatal. `bun test test/` passes.

Key files: `core/commands/init.ts`, `test/init.test.ts`

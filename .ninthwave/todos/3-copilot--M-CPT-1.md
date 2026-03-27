# Fix: Auto-trust Copilot CLI project folders during setup (M-CPT-1)

**Priority:** Medium
**Source:** Vision L-VIS-12 — friction log (2026-03-26 Copilot folder trust prompt)
**Depends on:** (none)
**Domain:** copilot

## Context

When ninthwave launches Copilot CLI workers in git worktrees, each worktree path triggers an interactive "Confirm folder trust" prompt that blocks the session until manually dismissed. This completely breaks parallel automation.

Root cause: Copilot CLI requires the working directory to be listed in `~/.copilot/config.json`'s `trusted_folders` array before it will proceed non-interactively. Copilot does parent-path prefix matching — trusting the project root covers all worktrees under it.

Friction entry from 2026-03-26: "ninthwave setup (or ninthwave init) should auto-add the project root to ~/.copilot/config.json#trusted_folders when copilot is the detected AI tool."

## Requirements

1. In `cmdSetup()` (or a helper called by setup), after detecting the AI tool:
   - If the detected tool is `copilot`, read `~/.copilot/config.json` (create if missing)
   - Check if the project root (or a parent) is already in `trusted_folders`
   - If not present, add the project root to `trusted_folders` and write the file
2. The write must be non-destructive: preserve all existing keys and values in `config.json`.
3. Handle edge cases: file doesn't exist, file is empty, `trusted_folders` key is missing, project root already trusted via parent path.
4. Log a message when adding trust: `Added {projectRoot} to Copilot CLI trusted folders`.
5. Also wire into `cmdInit()` when Copilot is detected during interactive onboarding.

Acceptance: After running `ninthwave setup` in a project using Copilot CLI, `~/.copilot/config.json` contains the project root in `trusted_folders`. Workers launched in worktrees under that root do not trigger the trust prompt.

**Test plan:**
- Unit test: setup adds project root to empty config file
- Unit test: setup adds project root when `trusted_folders` array exists but doesn't contain root
- Unit test: setup skips when project root is already trusted
- Unit test: setup skips when a parent path is already trusted (prefix matching)
- Unit test: setup preserves existing config keys when writing
- Unit test: non-copilot tools skip this step entirely
- Edge case: `~/.copilot/config.json` doesn't exist — creates it
- Edge case: `~/.copilot/config.json` is malformed JSON — logs warning, skips

Key files: `core/commands/setup.ts`, `core/commands/init.ts`

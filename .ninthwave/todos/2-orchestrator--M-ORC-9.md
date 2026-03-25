# Feat: Add `--watch` persistent mode to daemon (M-ORC-9)

**Priority:** Medium
**Source:** Dogfooding friction (2026-03-25): daemon-persistence-and-retry
**Depends on:** -
**Domain:** orchestrator

The daemon exits when all items reach a terminal state. There is no mode where it keeps running and watches for new TODO files dropped into `.ninthwave/todos/`. This means the user must manually re-launch the orchestrator after adding new items or after manually retrying a stuck item.

Add a `--watch` flag to `ninthwave orchestrate` that enables persistent mode:
1. After all items reach terminal state, instead of exiting, the daemon enters a polling loop.
2. Every N seconds (configurable via `--watch-interval`, default 30s), re-scan `.ninthwave/todos/` for new TODO files.
3. New items are loaded into the state machine and processed normally.
4. The daemon exits on SIGINT/SIGTERM or when `ninthwave stop` is called.
5. Log a clear message when entering watch mode: "All items complete. Watching for new TODOs..."

**Test plan:**
- With `--watch`, daemon does not exit when all items are terminal
- New TODO files added during watch mode are detected and processed
- `--watch-interval 5` polls every 5 seconds
- SIGINT/SIGTERM cleanly exits watch mode
- Without `--watch`, daemon exits normally (existing behavior preserved)
- Watch mode respects WIP limits for newly discovered items

Acceptance: Daemon stays running with `--watch`. New TODO files are detected and processed. Clean shutdown on signal. Default behavior (no `--watch`) is unchanged.

Key files: `core/daemon.ts`, `core/commands/orchestrate.ts`, `core/orchestrator.ts`

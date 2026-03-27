# Changelog

## 0.2.0 — 2026-03-27

Scope reduction: narrowed focus to the core orchestration pipeline.

### Removed
- **External task backends** — GitHub Issues, ClickUp, Sentry, PagerDuty adapters, `TaskBackend` interface, `StatusSync`, and `backend-registry` module. Work items now come exclusively from `.ninthwave/todos/` files
- **Sandboxing** — nono process-level sandbox wrapper (`core/sandbox.ts`), policy proxy launcher (`core/proxy-launcher.ts`), `--no-sandbox` flag, and all sandbox configuration keys
- **Remote dashboard** — orchestrator dashboard server (`core/session-server.ts`), `SessionUrlProvider` interface, `--remote` flag, and dashboard lifecycle wiring
- **Webhook notifications** — Slack/Discord notification system
- **Legacy migration commands** — `migrate-todos` and `generate-todos` CLI commands (TODOS.md format is no longer supported)
- **`--backend` flag** from `list` command

### Changed
- Simplified `nw doctor` — removed sandbox and cloudflared checks
- Cleaned up config keys — removed sandbox, proxy, webhook, and backend-related settings
- Updated Homebrew formula for 0.2.0

### Why
These features were working but added surface area beyond the narrowest wedge. By focusing on decomposition → parallel sessions → CI → merge, ninthwave ships a tighter, more reliable core. Removed features may return as separate packages or plugins once the core pipeline is battle-tested at scale.

## 0.1.0 — 2026-03-23

Initial release as **ninthwave**.

### Added
- Batch TODO orchestrator (`core/batch-todos.sh`) — parse, order, start, merge, finalize
- `/work` skill — 5-phase interactive workflow (select, launch, autopilot, monitor, finalize)
- `/decompose` skill — break feature specs into PR-sized work items with dependency mapping
- `/ninthwave-upgrade` skill — self-update for both global and vendored installs
- `/todo-preview` skill — port-isolated dev server for live testing
- `todo-worker` agent — autonomous implementation agent for Claude Code, OpenCode, and Copilot CLI
- Remote installer (`remote-install.sh`) — one-liner global or per-project setup
- `setup` script — creates `.ninthwave/` project config, skill symlinks, and agent copies
- Unit test suite — 112 tests covering parser, batch-order, mark-done, and version-bump

### Fixed
- `_prompt_files` unbound variable on script exit (local array referenced by global EXIT trap)
- Unbound variable in `cmd_batch_order` when remaining array empties
- `cmd_mark_done` not cleaning section headers with intervening blank lines
- Soft skill dependencies — graceful fallback when optional skills are unavailable

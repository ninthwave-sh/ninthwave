# Refactor: Rename orchestrate command to watch (H-CR-6)

**Priority:** High
**Source:** CLI command redesign plan (2026-03-28)
**Depends on:** H-CR-3
**Domain:** cli-redesign

Rename the `orchestrate` CLI command to `watch` in the command registry. In `core/commands/orchestrate.ts`, export `cmdWatch` as an alias for the existing `cmdOrchestrate` function. Update the registry in `core/help.ts` so `watch` dispatches to `cmdWatch`. Change `--daemon` to imply continuous TODO scanning (current `--watch` behavior) -- when `--daemon` is set and `--no-watch` is not set, enable watch mode automatically. Add `--no-watch` flag for explicit opt-out. Accept `--watch` silently for backwards compat (no error, no effect since it's now default for daemon). Update `ninthwave stop` to reference "watch daemon" in its output messages.

**Test plan:**
- Test `nw watch` dispatches to orchestrate logic
- Test `nw watch --daemon` enables continuous scanning (watch mode on)
- Test `nw watch --daemon --no-watch` disables continuous scanning
- Test `nw watch --watch` accepted silently (compat)
- Test `nw orchestrate` is no longer a valid command
- Verify existing orchestrate.test.ts tests pass with updated command name

Acceptance: `nw watch` runs the full pipeline (TUI, daemon, JSON modes). `--daemon` implies continuous scanning. `--no-watch` opts out. `nw orchestrate` returns "Unknown command." All tests pass.

Key files: `core/commands/orchestrate.ts`, `core/cli.ts`, `core/help.ts`, `test/orchestrate.test.ts`

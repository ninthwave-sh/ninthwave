# Feat: Add `nw logs` command for viewing orchestration logs (H-OBS-1)

**Priority:** High
**Source:** Vision exploration L-VIS-15 — observability iteration
**Depends on:** None
**Domain:** observability

The orchestrator emits structured JSONL logs to `~/.ninthwave/projects/{slug}/orchestrator.log` via `structuredLog()`, but there's no CLI command to view them. Users must manually find and parse log files. Add `nw logs` to surface orchestration events through the CLI.

**Implementation:**

Create `core/commands/logs.ts` with `cmdLogs()`. The command:
1. Resolves the project slug from the current directory (reuse `getProjectSlug()` from `core/daemon.ts`)
2. Reads `~/.ninthwave/projects/{slug}/orchestrator.log` (JSONL format)
3. Pretty-prints log entries with colorized level, timestamp, event type, and contextual fields
4. Supports flags:
   - `--follow` / `-f` — tail the log file, printing new entries as they appear (poll-based, ~500ms)
   - `--item <ID>` — filter entries to those containing the specified item ID
   - `--level <warn|error>` — filter by minimum severity level
   - `--lines <N>` / `-n <N>` — show last N entries (default: 50)
5. If no log file exists, print a helpful message ("No orchestration logs found. Run `nw watch` to generate logs.")

Register the command in `core/cli.ts`. Add to the Diagnostics group in the command registry if H-CR-3 has landed, otherwise just add to the COMMANDS array.

**Test plan:**
- Test log parsing: valid JSONL, malformed lines (skip gracefully), empty file
- Test `--item` filter: only entries matching the ID are shown
- Test `--level` filter: `warn` shows warn+error, `error` shows only error
- Test `--lines` flag: truncates to last N entries
- Test missing log file: prints helpful message, exits 0
- Test pretty-print formatting: colorized output matches expected format

Acceptance: `nw logs` displays the last 50 log entries in a human-readable format. `--follow` tails new entries. `--item`, `--level`, and `--lines` flags filter correctly. Missing log file produces helpful guidance. All tests pass.

Key files: `core/commands/logs.ts` (new), `core/cli.ts`, `core/daemon.ts`, `test/logs.test.ts` (new)

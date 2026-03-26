# Feat: `ninthwave run [run-id]` drill-down analytics command (M-ANA-2)

**Priority:** Medium
**Source:** Phase E vision — analytics and pipeline visibility. `ninthwave analytics` shows cross-run trends; this adds single-run drill-down for diagnosing bottlenecks and failures.
**Depends on:**
**Domain:** analytics

## Context

`ninthwave analytics` shows trends across all orchestration runs (avg throughput, CI retry rate, cost/run). What's missing is drill-down into a single run: which items were slowest, which had CI retries, what was the critical path, and what did each item cost.

This is the difference between "your CI retry rate was 23% this week" vs "item H-FOO-2 retried CI 4 times before merging — that's your bottleneck."

## Requirements

1. Add `cmdRun(args: string[])` to `core/commands/run.ts` (new file).
2. CLI: `ninthwave run [run-id]` — if no `run-id`, show the most recent run.
3. Load run analytics from `~/.ninthwave/projects/<hash>/analytics/` (the relocated path from H-PUB-1).
4. Display a per-item breakdown table showing for each item:
   - Item ID and title (truncated to 40 chars)
   - Total wall-clock time (HH:MM:SS format)
   - Number of CI retries
   - Number of rebase events
   - Final state (merged / stuck / failed)
   - Cost in USD (if available from worker telemetry; otherwise `—`)
5. Display a run summary header with:
   - Run ID (timestamp), start time, total wall-clock time
   - Total items: N merged, N failed, N stuck
   - Total cost (sum across items)
   - Slowest item (name + time) and most-retried item (name + count)
6. Sort items by wall-clock time descending (slowest first) to surface bottlenecks immediately.
7. Wire into `core/cli.ts` command dispatcher under `run`.
8. Alias: `ninthwave run` with no args shows the latest run (same as `ninthwave run latest`).

Acceptance: `ninthwave run` prints a per-item table and run summary for the most recent analytics JSON. `ninthwave run <run-id>` selects a specific run by timestamp prefix (first 8 chars is enough). Piped output (`| cat`) works without ANSI codes breaking the table. No analytics files → friendly "No analytics found" message.

**Test plan:**
- Unit test: `formatRunTable()` produces correct columns for a fixture analytics JSON
- Unit test: slowest item correctly identified and highlighted
- Unit test: most-retried item correctly identified
- Unit test: run-id prefix matching (8-char prefix selects correct run from list)
- Unit test: "No analytics found" when analytics dir is empty or missing
- Unit test: items with no cost data show `—` in cost column
- Unit test: total cost sums correctly, skips null costs
- Unit test: ANSI-stripped output is valid plain-text table (for pipe mode)
- Edge case: single-item run renders correctly
- Edge case: run with all stuck items shows correct final states

Key files: `core/commands/run.ts` (new), `core/cli.ts`, `core/analytics.ts`, `test/run.test.ts` (new)

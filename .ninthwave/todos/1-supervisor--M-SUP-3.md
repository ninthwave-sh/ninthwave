# Fix: Supervisor falsely detects "stalled on permission prompt" (M-SUP-3)

**Priority:** Medium
**Source:** Dogfood friction — supervisor sends "you stalled on a permission prompt" when worker is actively reading/searching
**Depends on:**
**Domain:** supervisor

## Context

The supervisor periodically reads worker screen output and sends hints when it detects anomalies. It currently flags workers as "stalled on a permission prompt" when the worker is actively reading files and searching code — normal Claude Code behavior that involves sequential tool calls with pauses between them.

This false positive is disruptive because it sends a message to the worker that interrupts its flow, and it clutters the orchestrator logs with incorrect alerts.

## Requirements

1. Improve the supervisor's stall detection heuristic:
   - Don't flag "permission prompt stall" unless the screen output shows an actual permission prompt (e.g., "Allow", "Deny", "Yes/No" patterns)
   - Require a minimum idle duration before flagging (e.g., 2+ minutes of no new tool calls, not just one check interval)
   - Look for positive signals of activity (recent Read/Grep/Glob tool output) before concluding the worker is stalled
2. Add the improved heuristic to the supervisor prompt or detection logic
3. Test with sample screen outputs showing normal activity vs actual permission stalls

Acceptance: Supervisor does not flag workers that are actively reading/searching as stalled. Workers that are genuinely stuck on a permission prompt are still detected (after appropriate delay). Test proves both cases.

**Test plan:** Unit test with sample screen showing active file reads → supervisor should NOT flag. Unit test with sample screen showing actual permission prompt for 2+ minutes → supervisor SHOULD flag. Edge case: worker pausing between large file reads (normal) vs genuinely hung.

Key files: `core/supervisor.ts`

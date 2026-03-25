# "CI Failed" state needs more granularity

**Observed:** H-PRX-4 shows as "CI Failed" but it likely failed during worker initialization/startup — not during CI checks on the PR. The state label doesn't distinguish between these failure modes.

**Impact:** User can't tell if the worker crashed on startup, failed to create a PR, or if actual CI checks failed. Different failure modes need different remediation.

**Suggestion:** Add more granular failure states or a failure reason field:
- `Worker Failed` — worker process crashed or timed out before creating a PR
- `CI Failed` — PR was created but CI checks failed
- `PR Failed` — worker completed but PR creation failed
Include the failure reason in status output (e.g., "CI Failed: test timeout" or "Worker Failed: startup crash").

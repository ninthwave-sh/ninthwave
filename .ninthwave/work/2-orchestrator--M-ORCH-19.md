# Fix: Resilient gh pr create under GraphQL rate-limit pressure (M-ORCH-19)

**Priority:** Medium
**Source:** Friction log ninthwave H-IS-1 (2026-04-16)
**Depends on:** None
**Domain:** orchestrator
**Lineage:** d0b34d15-e3e4-4dec-af1c-7b87cecbfb76

`gh pr create` hit GitHub's GraphQL rate limit repeatedly during PR creation, requiring a fallback to the GitHub connector after the prescribed retries. Recent commits improved rate-limit pressure on the read path (`dc8cdc23` batch GitHub API calls; `18c82bfb` bypass rate-limit queue when bulk PR cache resolves locally; `8727aae8` normalize statusCheckRollup fields in bulk PR cache) but the create path was not part of that work and still bursts directly through the GraphQL API.

Extend the rate-limit-aware queue or the existing batching scheduler to cover `gh pr create` (and any other write-path GitHub calls that inherit the same risk). At minimum: detect GraphQL rate-limit errors, back off with the same window/budget logic the read path uses, and surface a single recoverable retry signal to the worker rather than letting the worker burn its prescribed retries on a known-recoverable error class. If the queue cannot be reused as-is, factor the rate-limit detection out so both paths share it.

**Test plan:**
- Unit: simulate GraphQL rate-limit response on `gh pr create`, expect the rate-limit-aware backoff to fire (not the worker's generic retry).
- Unit: non-rate-limit failures continue to surface to the worker as today.
- Integration: high-PR-burst scenario (e.g., 8 stacked items launching simultaneously) does not exhaust GraphQL budget on the create path.
- Regression: existing read-path optimisations (`dc8cdc23`, `18c82bfb`) unaffected.

Acceptance: `gh pr create` failures classified as GraphQL rate-limit are handled by the shared rate-limit pathway, not by the worker's retry loop. Test covers the rate-limit -> backoff -> success cycle. Worker retries are no longer consumed on recoverable rate-limit errors.

Key files: `core/gh.ts`, `core/pr-monitor.ts`, `agents/implementer.md` (Phase 9 -- cross-check that the worker no longer needs the manual fallback path)

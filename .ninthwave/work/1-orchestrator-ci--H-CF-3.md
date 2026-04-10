# Fix: Exclude review check from CI status aggregation (H-CF-3)

**Priority:** High
**Source:** Dogfooding -- review FAILURE consuming CI retry budget, killing workers after 5 review rounds
**Depends on:** None
**Domain:** orchestrator-ci

**Lineage:** 1dea099f-50cd-4b6f-a4fa-1ca5443bad86

`processChecks()` in `core/commands/pr-monitor.ts` aggregates ALL non-skipped checks including the "Ninthwave / Review" commit status. When the AI review has blocking findings (state=FAILURE), it causes `ciStatus = "fail"`, which increments `ciFailCount` and eventually kills the worker after `maxCiRetries`. The constant `IGNORED_CHECK_NAMES` already exists at `core/gh.ts:587` but is only used in the post-merge `checkCommitCI()` path. Export it and apply the same filter in `processChecks()`.

**Test plan:**
- Add test in `test/contract/gh-pr-checks.test.ts`: `processChecks` with all checks SUCCESS except "Ninthwave / Review" FAILURE returns ciStatus "pass"
- Add test: "Ninthwave / Review" FAILURE as only non-skipped check returns same result as empty checks (no CI configured)
- Verify existing processChecks tests still pass with the added filter

Acceptance: `processChecks()` filters out checks whose name is in `IGNORED_CHECK_NAMES`. A PR where all real CI checks pass but "Ninthwave / Review" is FAILURE reports `ciStatus = "pass"`. Review rounds no longer increment `ciFailCount`. All existing tests pass.

Key files: `core/gh.ts:587`, `core/commands/pr-monitor.ts:242`, `test/contract/gh-pr-checks.test.ts`

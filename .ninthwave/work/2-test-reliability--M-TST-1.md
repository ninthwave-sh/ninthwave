# Test: Stabilize watch-secondary-workers and watch-runtime-controls system tests (M-TST-1)

**Priority:** Medium
**Source:** Friction log ninthwave H-BS-1 (2026-04-16)
**Depends on:** None
**Domain:** test-reliability
**Lineage:** 5bb381c7-13e1-4493-a767-532f2677f634

Full-suite verification was blocked by two unrelated watch-system test races in `test/system/watch-secondary-workers.test.ts` and `test/system/watch-runtime-controls.test.ts`, requiring additional debugging and harness timing fixes before CI could go green. Both files still exist and the friction was filed 2026-04-16; no commit since then specifically targets these races. Workers hitting these flakes pay the cost in retries and rerun cycles, and unrelated PRs surface "fix the watch test" as collateral scope.

Investigate the actual race(s) in both test files, fix the underlying timing assumption (rather than adding broader sleeps), and add narrow regression tests for whichever invariant the race violated. The fix should be deterministic -- if the test is genuinely non-deterministic in the harness, document why and gate it behind an opt-in flag rather than letting it flake in the default suite.

**Test plan:**
- Run each test in a tight loop locally (e.g., `for i in {1..20}; do bun test test/system/watch-secondary-workers.test.ts || break; done`) and confirm it passes consistently before the fix.
- Add the missing barrier or wait condition that the race violated.
- After the fix, repeat the loop -- expect 100/100 passes.
- CI: full system suite passes without retries on a clean main run.

Acceptance: `test/system/watch-secondary-workers.test.ts` and `test/system/watch-runtime-controls.test.ts` pass deterministically in tight local loops and on CI without `gh run rerun --failed`. The fix targets a specific timing assumption with a code or harness change, not a longer sleep. Regression coverage is in place.

Key files: `test/system/watch-secondary-workers.test.ts`, `test/system/watch-runtime-controls.test.ts`, `core/orchestrate-event-loop.ts` (likely tick-timing source)

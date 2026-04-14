# Fix: Recover stopped headless workers (H-WRK-4)

**Priority:** High
**Source:** Approved plan 1776189941462-playful-river
**Depends on:** H-WRK-3
**Domain:** worker-runtime
**Lineage:** 7f007aca-07e6-4aaf-84b5-0fbbdd397a5c

Even with a stronger prompt contract, some headless workers will still stop. Add a small persisted headless worker phase signal such as `starting`, `implementing`, and `waiting`, surface it through snapshot building, and teach the orchestrator to relaunch workers that stopped after making progress or reaching wait mode. Reuse the existing retry and relaunch flow so CI-fix, feedback, inbox, and rebase handling keep working the way they do today, and preserve retry caps so real crash loops still end in `stuck`.

**Test plan:**
- Extend `test/headless.test.ts` to cover phase metadata read and write behavior and cleanup around stopped workers
- Extend `test/orchestrator-unit.test.ts` to distinguish recoverable wait-exit relaunches from real crash or no-progress failures
- Extend `test/system/watch-recovery.test.ts` with a headless worker that reaches wait mode, stops, and is relaunched automatically while fatal or repeated stop cases still cap out safely

Acceptance: headless workers persist a small phase signal that snapshot and orchestrator logic can consume. When a headless worker stops after making progress or reaching wait mode, Ninthwave relaunches it through the existing retry path if the item still needs work and retry budget remains. Workers that never make progress or exceed retry caps still transition to `stuck` with the existing safety behavior.

Key files: `core/headless.ts`, `core/snapshot.ts`, `core/orchestrator.ts`, `core/orchestrator-types.ts`, `core/commands/launch.ts`, `test/headless.test.ts`, `test/orchestrator-unit.test.ts`, `test/system/watch-recovery.test.ts`

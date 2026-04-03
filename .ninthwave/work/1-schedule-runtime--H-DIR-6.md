# Feat: Ship broker-safe weekday review schedules (H-DIR-6)

**Priority:** High
**Source:** Approved DIR plan `.opencode/plans/1775207732828-stellar-harbor.md`
**Depends on:** H-DIR-3, H-DIR-4, H-DIR-5
**Domain:** schedule-runtime
**Lineage:** 75b71caf-b5f3-4a28-ab18-4d34cecc8f9e

Replace the example schedule scaffolding with real weekday `friction--review` and `decisions--review` schedules, wire them to the first-party review-inbox command, and make scheduled execution broker-safe in crew mode. Launch must happen only after a successful broker claim, and disconnected broker cases should skip instead of silently falling back to solo execution. This item should also make `nw init` and schedule docs reflect the new shipped review schedules and enabled project capability.

**Test plan:**
- Extend `test/init.test.ts`, `test/schedule-files.test.ts`, and `test/schedule-command.test.ts` to verify the shipped review schedule files, parser compatibility, and init scaffolding.
- Extend `test/schedule-runner.test.ts` and `test/orchestrate.test.ts` to cover claim-before-launch, strict skip on disconnected broker, and a two-orchestrator no-duplicate schedule-fire scenario.
- Verify the schedule docs/examples and the new schedule files use parser-supported syntax and still pass the full schedule-related test suite.

Acceptance: `nw init` seeds the two weekday review schedules and enabled schedule capability, due review schedules launch `review-inbox` only after a successful broker claim, disconnected broker cases skip safely, and schedule/init/orchestrate tests cover the new runtime behavior.

Key files: `core/commands/init.ts`, `.ninthwave/schedules/friction--review.md`, `.ninthwave/schedules/decisions--review.md`, `core/schedule-processing.ts`, `core/schedule-runner.ts`, `core/commands/orchestrate.ts`, `core/docs/schedule-format.md`

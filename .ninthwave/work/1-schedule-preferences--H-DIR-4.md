# Refactor: Add per-project user schedule preference plumbing (H-DIR-4)

**Priority:** High
**Source:** Approved DIR plan `.opencode/plans/1775207732828-stellar-harbor.md`
**Depends on:** None
**Domain:** schedule-preferences
**Lineage:** 98afe9e2-3b1c-4851-8478-4fb57ec0d0a6

Introduce a user-scoped, project-specific runtime preference for scheduled task execution so schedules can be shipped as enabled project capability while still defaulting off for each operator on first run. Wire that preference through config loading and `orchestrate`'s effective schedule gate, but do not add UI controls yet. This item should establish the storage model and runtime behavior that later startup and runtime controls will toggle.

**Test plan:**
- Extend `test/config.test.ts` to cover reading and writing the new user preference keyed per project without disturbing existing user config fields.
- Extend `test/orchestrate.test.ts` to verify effective schedule execution is off by default, stays off when the local preference is false, and turns on only when both project capability and local preference are enabled.
- Exercise migration or missing-config cases so first-run behavior stays default-off without breaking existing projects.

Acceptance: schedule execution in `orchestrate` respects both the checked-in project capability flag and a new per-project local user preference, first-run behavior is off by default, and config/orchestrate tests cover the new gating rules.

Key files: `core/config.ts`, `core/commands/orchestrate.ts`, `test/config.test.ts`, `test/orchestrate.test.ts`

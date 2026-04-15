# Refactor: Remove external-review activation paths (H-SUX-3)

**Priority:** High
**Source:** Approved startup simplification plan 2026-04-15
**Depends on:** H-SUX-2
**Domain:** review-runtime
**Lineage:** ccd12635-59ab-4cad-89e6-096732c9d04a

Remove the remaining command, event-loop, and config hooks that activate external PR review. Internal work-item review should continue to run normally, but startup, CLI args, project config, and init should no longer turn on review of unrelated PRs. Treat `--review-external` as deprecated compatibility surface during the transition instead of a behavior switch.

**Test plan:**
- Update `test/orchestrate.test.ts` so startup/runtime configuration never produces `all-prs` behavior or `--review-external` child args
- Update `test/init.test.ts` and config coverage so new project config generation stops writing `review_external`
- Verify the orchestrate loop skips external review processing while regular work-item review still launches and gates merge as before

Acceptance: Interactive startup, watch args, orchestrate runtime setup, and init/config generation no longer activate external PR review. Internal item review still works, and deprecated compatibility paths do not re-enable the removed behavior.

Key files: `core/commands/orchestrate.ts`, `core/orchestrate-event-loop.ts`, `core/commands/watch-args.ts`, `core/commands/init.ts`, `core/config.ts`, `test/orchestrate.test.ts`, `test/init.test.ts`, `test/external-review.test.ts`

# Fix: "AI reviews off" still launches review workers (H-SR-1)

**Priority:** High
**Source:** Manual bug report 2026-03-29
**Depends on:** None
**Domain:** orchestrator

When a user selects "AI reviews: off" in the interactive TUI, review workers still launch when items reach ci-passed. The reviewMode toggle only controls external PR reviews (reviewExternalEnabled), but work item reviews are always wired unconditionally. Three root causes: (1) reviewMode from the initial interactive result is never captured, (2) reviewMode "off" only sets loopConfig.reviewExternal=false not the work item review gate, (3) launchReview is always unconditionally wired and evaluateMerge always gates on !item.reviewCompleted.

Fix: add skipReview boolean to OrchestratorConfig that bypasses the review gate in evaluateMerge(). Wire it from the interactive flow's review mode selection, the --no-review CLI flag, and reviewWipLimit===0.

**Test plan:**
- Add orchestrator state machine tests: skipReview=true causes ci-passed to skip reviewing state and chain to merge evaluation (auto strategy) or review-pending (manual strategy)
- Add test: skipReview=true drains items already in "reviewing" state -- sets reviewCompleted=true, transitions to ci-passed, emits clean-review action, chains to evaluateMerge
- Add test: setSkipReview(true) at runtime works for in-flight items
- Add parseWatchArgs tests: --no-review sets skipReview=true, --review sets skipReview=false, default is false
- Run full test suite: `bun test test/`

Acceptance: Selecting "AI reviews: off" in interactive mode causes items to skip the reviewing state entirely (ci-passed chains straight to merge evaluation). `--no-review` CLI flag has the same effect. Items already in "reviewing" state when skipReview is toggled on are drained on next tick. All existing tests pass.

Key files: `core/orchestrator.ts`, `core/commands/watch-args.ts`, `core/commands/orchestrate.ts`, `test/orchestrator.test.ts`, `test/orchestrate.test.ts`

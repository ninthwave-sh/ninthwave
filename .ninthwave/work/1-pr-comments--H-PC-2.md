# Feat: Add hubRepoNwo plumbing to ExecutionContext and launch (H-PC-2)

**Priority:** High
**Source:** Plan review 2026-03-29
**Depends on:** None
**Domain:** pr-comments

Add a hubRepoNwo field to ExecutionContext so the orchestrator and launch functions can construct absolute GitHub URLs for agent links in PR comments. The NWO (name-with-owner, e.g. "org/repo") is computed once at daemon startup via getRepoOwner(projectRoot) and passed through to all consumers.

Changes:
1. Add `hubRepoNwo?: string` to the ExecutionContext interface in core/orchestrator.ts.
2. In core/commands/orchestrate.ts where ExecutionContext is constructed, call getRepoOwner(projectRoot) wrapped in try/catch with fallback to empty string and warn() log.
3. Add hubRepoNwo as a parameter to launchWorker(), launchReviewWorker(), launchRepairWorker(), and launchVerifierWorker() (if it exists) in core/commands/launch.ts.
4. In each launch function, add `HUB_REPO_NWO: ${hubRepoNwo}` to the systemPrompt string in .nw-prompt.
5. Pass ctx.hubRepoNwo from the orchestrator's executeLaunch to the launch functions instead of calling getRepoOwner() per-launch.

**Test plan:**
- Add hubRepoNwo to defaultCtx in test/orchestrator.test.ts (e.g. "test-owner/test-repo")
- Verify existing orchestrator tests pass with the new field
- Verify launch function signature changes don't break existing launch tests (if any)

Acceptance: ExecutionContext has hubRepoNwo field. Daemon startup populates it via getRepoOwner(). All 3-4 launch functions accept hubRepoNwo as a parameter and include HUB_REPO_NWO in .nw-prompt. getRepoOwner() failure falls back to empty string with warn() log. All tests pass.

Key files: `core/orchestrator.ts:243-248`, `core/commands/orchestrate.ts`, `core/commands/launch.ts:642`, `core/commands/launch.ts:760`, `core/commands/launch.ts:818`

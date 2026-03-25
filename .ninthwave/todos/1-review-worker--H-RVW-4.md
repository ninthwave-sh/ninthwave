# Feat: Wire review worker into CLI, setup, and daemon state persistence (H-RVW-4)

**Priority:** High
**Source:** Review worker plan (2026-03-25)
**Depends on:** H-RVW-1, H-RVW-3
**Domain:** review-worker

Connect the review worker state machine (H-RVW-1) and launch function (H-RVW-3) to the CLI, setup command, and daemon persistence layer. This is the integration glue that makes review workers operational.

**`core/commands/orchestrate.ts`** — CLI flags and action wiring:
- Add `--review` flag → sets `reviewEnabled: true` in orchestrator config
- Add `--review-wip-limit N` option → sets `reviewWipLimit` (default: 2)
- Add `--review-auto-fix off|direct|pr` option → sets `reviewAutoFix` (default: `"off"`)
- Add `--review-can-approve` flag → sets `reviewCanApprove: true` (default: false, comment-only)
- Wire `launchReviewWorker` (from start.ts) into the action execution deps so `executeLaunchReview` can call it
- Wire `executeCleanReview` to close the review workspace and clean the review worktree
- Update `buildSnapshot`: for items in `reviewing` state, check review worker health (via cmux workspace alive check on `reviewWorkspaceRef`) and re-read `reviewDecision` from GitHub

**`core/commands/setup.ts`** — Deploy review-worker agent:
- Add `review-worker.md` to the agent targets list alongside `todo-worker.md`
- Symlink/copy to `.claude/agents/`, `.opencode/agents/`, `.github/agents/` (following existing pattern)

**`core/daemon.ts`** — State persistence:
- Add `reviewWorkspaceRef` and `reviewCompleted` to `DaemonStateItem` interface
- Serialize/deserialize these fields in `writeStateFile` / `readStateFile`
- Restore `reviewWorkspaceRef` and `reviewCompleted` during `reconstructState` on daemon restart

**`core/config.ts`** — Config keys:
- Add `review_enabled`, `review_wip_limit`, `review_auto_fix`, `review_can_approve` to `KNOWN_CONFIG_KEYS`

**Test plan:**
- Verify `--review` flag sets `reviewEnabled: true` in orchestrator config
- Verify `--review-auto-fix direct` sets `reviewAutoFix: "direct"`
- Verify daemon state round-trips `reviewWorkspaceRef` and `reviewCompleted` through write/read cycle
- Verify `ninthwave setup` creates review-worker.md symlinks in target agent directories
- Verify backward compatibility: orchestrate without `--review` flag behaves identically to before

Acceptance: `ninthwave orchestrate --review --review-auto-fix off` launches the daemon with review workers enabled. Setup deploys `review-worker.md` to all agent directories. Daemon state persists review fields across restarts. All existing orchestrate tests pass unchanged.

Key files: `core/commands/orchestrate.ts`, `core/commands/setup.ts`, `core/daemon.ts`, `core/config.ts`

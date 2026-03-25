# Feat: Add reviewing state, review config, and review state transitions to orchestrator (H-RVW-1)

**Priority:** High
**Source:** Review worker plan (2026-03-25)
**Depends on:** None
**Domain:** review-worker

Add the `reviewing` state and review worker support to the orchestrator state machine. This is the foundation for spawning separate review agents after CI passes. The orchestrator gains a new state (`reviewing`), a new merge strategy (`reviewed`), new action types (`launch-review`, `clean-review`), and config fields for review behavior (`reviewEnabled`, `reviewWipLimit`, `reviewAutoFix`).

Key changes to the state machine:
- `evaluateMerge` gates on `reviewEnabled && !item.reviewCompleted` before proceeding to merge — when true, emits `launch-review` action and transitions to `reviewing` (respecting `reviewWipSlots`)
- New `handleReviewing(item, snap)` method: APPROVED → set `reviewCompleted=true`, transition back to `ci-passed` (so normal `evaluateMerge` handles merge); CHANGES_REQUESTED → transition to `review-pending` + emit `notify-review`; PR merged externally → `merged` + `clean` + `clean-review`; worker death → graceful fallthrough to normal merge behavior
- `reviewCompleted` resets to `false` when item transitions back to `ci-pending` or `ci-failed` (enables fresh review after fixes)
- Review workers tracked via separate `reviewWipCount` / `reviewWipSlots` — do NOT count toward main `wipLimit`
- CI regression during `reviewing` state → transition to `ci-failed`, emit `clean-review`

Types to add:
- `"reviewing"` to `OrchestratorItemState`
- `"reviewed"` to `MergeStrategy`
- `"launch-review" | "clean-review"` to `ActionType`
- `reviewWorkspaceRef?: string` and `reviewCompleted?: boolean` on `OrchestratorItem`
- `reviewEnabled: boolean` (default false), `reviewWipLimit: number` (default 2), `reviewAutoFix: "off" | "direct" | "pr"` (default `"off"`), `reviewCanApprove: boolean` (default false) on `OrchestratorConfig`

Action execution stubs: `executeLaunchReview` and `executeCleanReview` can call injected deps (actual launch logic lives in H-RVW-3). For now, wire them to deps that the orchestrate command will provide.

**Test plan:**
- Unit tests in `test/orchestrator.test.ts` for all review state transitions:
  - `ci-passed` + `reviewEnabled=true` emits `launch-review`, transitions to `reviewing`
  - `ci-passed` + `reviewEnabled=false` uses existing merge logic (backward compat)
  - `reviewing` + APPROVED → sets `reviewCompleted`, back to `ci-passed`, then merges
  - `reviewing` + CHANGES_REQUESTED → `review-pending` + `notify-review`
  - `reviewing` + PR merged externally → `merged` + `clean` + `clean-review`
  - `reviewing` respects `reviewWipLimit` (no launch when slots full)
  - `reviewing` does NOT count toward normal WIP limit
  - Review worker death → graceful fallthrough
  - `reviewCompleted` resets on `ci-failed`/`ci-pending` cycle
  - CI regression during `reviewing` → `ci-failed` + `clean-review`

Acceptance: All existing orchestrator tests pass unchanged (`reviewEnabled` defaults to false). New tests cover every review state transition. The `reviewed` merge strategy works end-to-end in unit tests (ci-passed → reviewing → ci-passed → merging). Review WIP tracking is independent from main WIP.

Key files: `core/orchestrator.ts`, `test/orchestrator.test.ts`

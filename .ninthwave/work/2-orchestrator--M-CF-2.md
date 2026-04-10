# Feat: Emoji reaction acknowledgment for PR comments (M-CF-2)

**Priority:** Medium
**Source:** Dogfooding 2026-04-10 -- user gets zero feedback that the orchestrator saw their PR comment
**Depends on:** None
**Domain:** orchestrator
**Lineage:** 5b954391-7d7e-4b7a-9ea9-ae7ef00e3308

When the orchestrator detects a human PR comment, it should add a reaction emoji (eyes) to acknowledge receipt. Currently there is no reaction mechanism -- the user has no way to know the system received their feedback until a worker eventually responds. Add a `react-to-comment` action that fires for every human comment detected by `processComments()`.

Implementation:

1. Extend `PrComment` in `core/gh.ts` (line 774) with `id: number` and `commentType: "issue" | "review"`. Update the jq query in both `fetchTrustedPrComments` (line 800) and `fetchTrustedPrCommentsAsync` (line 851+) to extract `.id` and tag each comment with its source endpoint type.

2. Add `addCommentReaction(repoRoot, commentId, commentType, reaction)` function to `core/gh.ts`. For issue comments: `POST repos/{owner}/{repo}/issues/comments/{id}/reactions`. For review comments: `POST repos/{owner}/{repo}/pulls/comments/{id}/reactions`. Use `gh api` with `--method POST` and `-f content=eyes`. Best-effort -- catch and ignore errors.

3. Add `"react-to-comment"` to the `ActionType` union in `core/orchestrator-types.ts`. Add `commentId?: number`, `commentType?: "issue" | "review"` fields to the `Action` interface.

4. Add `executeReactToComment()` function in `core/orchestrator-actions.ts`. Calls `deps.gh.addCommentReaction(...)`. Wire into the action dispatcher switch in `core/orchestrator.ts` (`executeAction` method).

5. Wire `addCommentReaction` into `GhDeps` interface (`core/orchestrator-types.ts`) and the production deps object in `core/commands/orchestrate.ts`.

6. In `processComments()` (`core/orchestrator.ts:1469`), emit a `react-to-comment` action for each human comment (after filtering out bot comments). This runs for ALL comment-relay states, not just parked items.

7. Update `ItemSnapshot.newComments` type in `core/orchestrator-types.ts` to include `id` and `commentType` fields.

**Test plan:**
- Add test: "processComments emits react-to-comment for each human comment" -- item in `ci-pending` with `workspaceRef`, two human comments in snapshot. Assert: two `react-to-comment` actions with correct `commentId` and `commentType`
- Add test: "bot comments do not get reactions" -- agent-prefixed comment. Assert: no `react-to-comment` action
- Add test: "react-to-comment action executes addCommentReaction" -- mock `deps.gh.addCommentReaction`, execute action. Assert: mock called with correct args
- Update all existing `newComments` test data in `orchestrator-unit.test.ts` to include `id` and `commentType` fields (backward compat)

Acceptance: When a human leaves a comment on a PR tracked by the orchestrator, a eyes emoji reaction appears on the comment within one poll cycle. Bot/agent comments do not receive reactions. Reaction failures are silently ignored (best-effort). `bun run test` passes.

Key files: `core/gh.ts:774`, `core/orchestrator.ts:1469`, `core/orchestrator-types.ts:334`, `core/orchestrator-actions.ts`, `core/commands/orchestrate.ts`

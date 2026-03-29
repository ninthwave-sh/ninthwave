# Feat: Agent label consistency and comment filter consolidation (H-PC-5)

**Priority:** High
**Source:** Plan review 2026-03-29
**Depends on:** H-PC-2
**Domain:** pr-comments

Rename the implementer's [Worker: ID] prefix to [Implementer] with an absolute link, add consistent labels to verifier and repairer agents, and consolidate the comment filter into a single regex that handles all 5 agent types.

Changes:
1. Update agents/implementer.md:
   - Add HUB_REPO_NWO to the list of context variables read from .nw-prompt (section 1)
   - Change line ~372 prefix from `**[Worker: YOUR_TODO_ID]**` to `**[Implementer](https://github.com/${HUB_REPO_NWO}/blob/main/agents/implementer.md)**`
   - Update line ~392 PR Comment Conventions template to match
   - Update line ~395 "Other agents" line to list all 5 labels
   - Update line ~397 to mention [Orchestrator] link format
2. Update agents/verifier.md: add a PR Comment Conventions section with `**[Verifier](https://github.com/${HUB_REPO_NWO}/blob/main/agents/verifier.md)**` prefix. Add HUB_REPO_NWO to context variables.
3. Update agents/repairer.md (~line 78): add the prefix `**[Repairer](https://github.com/${HUB_REPO_NWO}/blob/main/agents/repairer.md)**` to the PR comment instruction. Add HUB_REPO_NWO to context variables.
4. Consolidate comment filter in core/orchestrator.ts (~lines 1430-1433):
   - Replace the separate startsWith("**[Orchestrator]**") and /\*\*\[Worker:/ checks with one regex: `/\*\*\[(Orchestrator|Implementer|Reviewer|Verifier|Repairer)\]/`
   - Keep the HTML marker check: `comment.body.includes("<!-- ninthwave-orchestrator-status -->")`
5. Add an explicit test in test/orchestrator.test.ts that verifies processComments skips comments with all 5 agent prefixes.

**Test plan:**
- Add test case: create a comment with `**[Implementer](url)**` prefix, verify processComments does not relay it to the worker
- Add test case: create comments with `**[Reviewer](url)**`, `**[Verifier](url)**`, `**[Repairer](url)**` prefixes, verify all are skipped
- Verify the orchestrator status marker check still works alongside the new regex
- Run bun test test/ to confirm no regressions

Acceptance: Implementer agent uses [Implementer] label with absolute HUB_REPO_NWO-based link. Verifier and repairer agents have consistent label conventions. Comment filter uses a single regex matching all 5 agent types. Explicit test verifies all 5 prefixes are filtered. All tests pass.

Key files: `agents/implementer.md:372-397`, `agents/verifier.md`, `agents/repairer.md:78`, `core/orchestrator.ts:1430-1433`, `test/orchestrator.test.ts`

# Feat: Reviewer scorecard table and absolute link (H-PC-4)

**Priority:** High
**Source:** Plan review 2026-03-29
**Depends on:** H-PC-1, H-PC-2
**Domain:** pr-comments

Revamp the reviewer PR comment to show a quality scorecard table instead of the redundant "Reviewed PR #X" message. Add 7 score fields to ReviewVerdict, update the reviewer agent prompt with scoring guidance, and rebuild the executePostReview comment body.

Changes:
1. Extend ReviewVerdict interface in core/daemon.ts with 7 required fields: architectureScore (1-10), codeQualityScore (1-10), performanceScore (1-10), testCoverageScore (1-10), unresolvedDecisions (count), criticalGaps (count), confidence (1-10).
2. Update agents/reviewer.md: add a "Scoring Dimensions" section before the Verdict File section explaining each score. Update the verdict JSON example to include all new fields. Note that the orchestrator constructs the [Reviewer] label, not the agent.
3. Update executePostReview in core/orchestrator.ts (~lines 2429-2442):
   - Build reviewer URL from ctx.hubRepoNwo: `https://github.com/${ctx.hubRepoNwo}/blob/main/agents/reviewer.md`
   - Change first line from `**[Reviewer](agents/reviewer.md)** Reviewed PR #${prNum}` to `**[Reviewer](${reviewerUrl})** Verdict: ${verdictLabel}`
   - Replace the stats line with a markdown scorecard table showing all 7 metrics
   - Use NINTHWAVE_FOOTER constant for the footer
4. Update test/orchestrator.test.ts (~lines 6329-6372): add all 7 score fields to verdict objects, update defaultCtx with hubRepoNwo, update assertions to check for scorecard table content and absence of "Reviewed PR #".

Ship atomically -- no backward compat for old verdict format. The reviewer agent prompt and orchestrator code deploy together when merged to main (seedAgentFiles reads from origin/main).

**Test plan:**
- Update verdict objects in test/orchestrator.test.ts with all 7 new fields (e.g. architectureScore: 8, codeQualityScore: 9, performanceScore: 7, testCoverageScore: 8, unresolvedDecisions: 0, criticalGaps: 1, confidence: 8)
- Assert comment body contains "Verdict: Approved" (not "Reviewed PR #50")
- Assert comment body contains scorecard table rows (e.g. "Architecture | 8/10")
- Assert comment body contains "Confidence" row
- Assert comment body contains ninthwave.sh (not ninthwave.dev)
- Assert comment body contains absolute reviewer link with test-owner/test-repo NWO

Acceptance: ReviewVerdict has 7 new required fields. Reviewer agent prompt includes scoring guidance and updated JSON example. executePostReview renders a scorecard table with all metrics. PR comment shows "Verdict: Approved/Changes Requested" instead of "Reviewed PR #X". Reviewer link is absolute using hubRepoNwo. All tests pass.

Key files: `core/daemon.ts:356-362`, `core/orchestrator.ts:2413-2452`, `agents/reviewer.md:180-208`, `test/orchestrator.test.ts:6329-6372`

# Fix: Suppress emoji reactions on ninthwave-generated comments (H-CF-4)

**Priority:** High
**Source:** Dogfooding -- emoji reaction appearing on auto-generated stack chain comments
**Depends on:** None
**Domain:** orchestrator-ci

**Lineage:** 7c64f451-fcbe-4805-83c0-9aae4ed5b17f

`processComments()` in `core/orchestrator.ts` filters out agent comments and orchestrator status markers but does NOT filter out stack comments (`<!-- ninthwave-stack-comment -->`) or deleted-file review comments (`<!-- ninthwave-deleted-file-review:`). When these auto-generated comments appear as new comments, they get an "eyes" emoji reaction as if they were human comments. Replace the specific `<!-- ninthwave-orchestrator-status -->` check with a generic `<!-- ninthwave-` prefix filter that catches all current and future ninthwave HTML comment markers.

**Test plan:**
- Add test in `test/orchestrator-unit.test.ts` (near existing processComments tests at line 3114): comment containing `<!-- ninthwave-stack-comment -->` does NOT generate `react-to-comment` action
- Add test: comment containing `<!-- ninthwave-deleted-file-review:abc -->` does NOT generate `react-to-comment` action
- Verify existing comment relay tests still pass

Acceptance: Comments containing `<!-- ninthwave-` anywhere in the body are skipped by `processComments()`. No `react-to-comment` action is emitted for stack comments or deleted-file review comments. Existing agent-comment and status-marker filtering still works.

Key files: `core/orchestrator.ts:1500`, `test/orchestrator-unit.test.ts:3114`

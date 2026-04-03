# Feat: Add review-inbox command for friction and decisions (H-DIR-3)

**Priority:** High
**Source:** Approved DIR plan `.opencode/plans/1775207732828-stellar-harbor.md`
**Depends on:** H-DIR-1, H-DIR-2
**Domain:** review-inbox
**Lineage:** 2b848fd1-18a8-4c02-92da-d254a8b7596b

Add a first-party review-inbox workflow that scans outstanding friction or decision entries, synthesizes recommendations and hard questions, embeds copy-pasteable work-item prompts inside `<details>` blocks, deletes the reviewed inbox files, and maintains one long-lived PR per domain. The command should close the domain PR when the inbox is empty and keep the PR explicitly manual-review only. Keep the implementation as core command and helper modules rather than prompt-only shell scripting.

**Test plan:**
- Add command and engine tests covering friction and decisions input files, rendered recommendation blocks, and deletion of reviewed inbox files.
- Verify existing open PR reuse, PR close-on-empty behavior, and manual-review-only PR messaging using mocked GH helpers.
- Cover edge cases where `.gitkeep` is the only file present or only one domain has outstanding entries.

Acceptance: `review-inbox` can process either domain, render the required PR body structure with `<details>` prompts, reuse or close the correct domain PR, delete the reviewed source files, and pass its new command-level test coverage.

Key files: `core/commands/review-inbox.ts`, `core/review-inbox.ts`, `core/review-inbox-render.ts`, `core/help.ts`, `test/review-inbox.test.ts`

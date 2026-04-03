# Feat: Scaffold decisions inbox and retire processed flow (H-DIR-1)

**Priority:** High
**Source:** Approved DIR plan `.opencode/plans/1775207732828-stellar-harbor.md`
**Depends on:** None
**Domain:** review-logging
**Lineage:** b769c130-398a-4cce-b5b9-ad30a1737604

Add `.ninthwave/decisions/` as a first-class inbox beside `.ninthwave/friction/` and update the canonical implementer prompt so workers log architectural decisions there when they make material choices not specified by the work item. Keep the friction flow intact, but hard-cut any tracked docs or prompt guidance that still treats `process` or `processed` as the supported review lane. This item should only cover scaffolding, prompt contract, and documentation of the new delete-on-review workflow.

**Test plan:**
- Extend `test/init.test.ts` to verify `nw init` creates `.ninthwave/decisions/.gitkeep` and allows `decisions/` in `.ninthwave/.gitignore`.
- Add or update prompt seeding coverage so the canonical implementer instructions include the new `.ninthwave/decisions/{timestamp}--{WORK_ITEM_ID}.md` contract.
- Manually review tracked docs/prompts touched by the change to confirm they no longer advertise a `process` or `processed` destination for reviewed items.

Acceptance: `nw init` scaffolds `.ninthwave/decisions/`, tracked docs describe decisions as a first-class inbox, the implementer prompt tells workers when and how to write decision entries, and no tracked guidance still describes `process` or `processed` as the supported review workflow.

Key files: `core/commands/init.ts`, `agents/implementer.md`, `docs/onboarding.md`, `test/init.test.ts`

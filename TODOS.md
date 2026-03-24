# TODOS

<!-- Format guide: see $(cat .ninthwave/dir)/core/docs/todos-format.md -->

## State Reconciliation (friction log, 2026-03-24)



### Feat: Wire reconcile into /work skill phases (M-REC-2)

**Priority:** Medium
**Source:** Friction log #17
**Depends on:** H-REC-1

Update the /work SKILL.md to call `ninthwave reconcile` (or `.ninthwave/work reconcile`) at two points: (1) at the start of Phase 1 before running `list --ready`, and (2) in Phase 3 after each orchestrator exit before checking for remaining items. The skill instructions should mandate: "Never trust `list --ready` without reconciling first." Also update the orchestrator to call reconcile after each merge action so TODOS.md stays in sync during a run, not just at exit.

Acceptance: The /work SKILL.md includes reconcile calls in Phase 1 and Phase 3. The orchestrator calls reconcile after merge actions. Manual testing confirms that `list --ready` reflects actual GitHub state after reconcile runs.

Key files: `skills/work/SKILL.md`, `core/commands/orchestrate.ts`

---

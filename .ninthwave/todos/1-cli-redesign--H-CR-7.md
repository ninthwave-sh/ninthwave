# Docs: Update skill and doc references for CLI redesign (H-CR-7)

**Priority:** High
**Source:** CLI command redesign plan (2026-03-28)
**Depends on:** H-CR-5, H-CR-6
**Domain:** cli-redesign

Update all references to renamed commands across documentation and skills. In `skills/work/SKILL.md`: change `ninthwave orchestrate --items ID1,ID2 --merge-strategy asap --wip-limit 4` to `ninthwave watch --items ID1,ID2 --merge-strategy asap --wip-limit 4`, and update references to `ninthwave start` to use `nw <ID>` pattern. In `CLAUDE.md`: update command examples and the architecture description. In `ARCHITECTURE.md`: update the data flow diagram that references `ninthwave start` and `ninthwave orchestrate`. Also update any references in `skills/decompose/SKILL.md` if present.

**Test plan:**
- Manual review of all updated files
- Grep for stale references: `grep -r "ninthwave start\|ninthwave orchestrate\|ninthwave setup" skills/ CLAUDE.md ARCHITECTURE.md`
- Verify no stale command names remain in documentation

Acceptance: No references to `ninthwave start`, `ninthwave orchestrate`, or `ninthwave setup` remain in skills/, CLAUDE.md, or ARCHITECTURE.md. All references use the new names (`nw <ID>`, `nw watch`, `nw init`).

Key files: `skills/work/SKILL.md`, `skills/decompose/SKILL.md`, `CLAUDE.md`, `ARCHITECTURE.md`

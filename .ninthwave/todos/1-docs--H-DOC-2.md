# Feat: Update VISION.md for grind cycles 6-8 and entropy reduction philosophy (H-DOC-2)

**Priority:** High
**Source:** Self-improvement loop + founder direction
**Depends on:**
**Domain:** docs

## Context

VISION.md is the source of truth for ninthwave's direction and the self-improvement loop's reference document. It's stale — it doesn't reflect grind cycles 7-8 (friction-driven orchestrator improvements, review workers, multiplexer fixes, ID collision protection) or the completion status of Phase B and C-bis. Additionally, the vision should articulate the core philosophy of reducing entropy and simplifying systems while maintaining outcomes.

**Casing note:** The file is `VISION.md` (uppercase). Fix all internal references that say `vision.md` to use `VISION.md`.

## Requirements

1. Add a core philosophy section (or integrate into existing principles) on **reducing entropy while maintaining outcomes**:
   - Systems should get simpler over time, not more complex and fragile
   - Every new feature or fix should leave the system no more complex than before
   - Prefer removing code over adding code; prefer convention over configuration
   - Complexity is debt — the goal is fewer moving parts achieving the same results
   - This applies to ninthwave itself and to the codebases it operates on
2. Add a "Shipped in grind cycle 7-8" section under "What Exists Today" listing: review worker integration (H-RVW-1 through M-RVW-5), friction-driven orchestrator improvements, multiplexer fixes (H-MFV-1, H-MZJ-1), ID collision protection (H-MID-1), and strait CI fixes
3. Mark Phase B (Sandboxed Workers) policy-driven tier as complete
4. Mark Phase C-bis (Worker Health Monitoring) as complete — all items shipped (H-HLT-1, M-HLT-2, M-ORC-7, M-CLN-1)
5. Update Phase D (LLM Supervisor) remaining items — note that supervisor-generated friction auto-decomposition is next
6. Update the "Self-developing" paragraph with current grind cycle count (8+) and total friction items surfaced
7. Fix all references to `vision.md` → `VISION.md` within the document itself
8. Keep the document's voice and structure consistent with existing content

Acceptance: VISION.md accurately reflects the current shipped state. The entropy reduction philosophy is articulated as a core principle. Phases B and C-bis are marked complete. Grind cycle 7-8 features are documented. All internal references use correct `VISION.md` casing.

**Test plan:** Cross-reference the shipped TODO IDs in VISION.md against the merged PR list on GitHub. Verify no phase is marked complete that still has unshipped items. Verify the grind cycle count matches reality. Grep for lowercase `vision.md` references in the file — should be zero.

Key files: `VISION.md`

# Docs: Update startup and merge strategy docs after flow cleanup (M-MSU-3)

**Priority:** Medium
**Source:** Manual request 2026-04-01 -- startup flow and merge strategy documentation cleanup
**Depends on:** H-MSU-1, H-MSU-2
**Domain:** startup-flow-docs

Update the product-facing and internal docs so they describe the simplified startup model and the corrected merge-strategy semantics. The docs should show startup settings as the single pre-status decision surface, remove references to the arming countdown, and explain merge strategies in the same CI-first language used by the product surfaces.

**Test plan:**
- Manually review updated docs for consistency between startup flow, collaboration behavior, and merge-strategy wording
- Grep for stale `arming window` or countdown references in the touched docs and remove or rewrite them
- Verify the revised merge-strategy descriptions match the shipped labels and help overlay wording

Acceptance: The main startup spec and user docs no longer describe a separate arming countdown. Merge-strategy documentation consistently explains that CI must pass in all modes and that the difference is what happens after CI passes. Docs match the shipped startup flow and terminology.

Key files: `docs/local-first-runtime-controls-spec.md`, `README.md`, `docs/faq.md`

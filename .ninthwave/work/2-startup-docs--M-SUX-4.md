# Docs: Refresh startup and runtime-control docs (M-SUX-4)

**Priority:** Medium
**Source:** Approved startup simplification plan 2026-04-15
**Depends on:** H-SUX-3
**Domain:** startup-docs
**Lineage:** b6d8635d-bdbd-4b93-8f9e-4882538843b6

Update the operator-facing docs to match the shipped startup model. Document that startup begins in manual merge mode, reviews are a simple on-off choice defaulting to on, external PR review is no longer part of startup/runtime behavior, and the default session limit is 1 unless changed at runtime.

**Test plan:**
- Manually review the updated docs for consistency with the shipped command names and control labels
- Verify examples and prose in onboarding and runtime-control docs no longer mention the old three-state review model or computed startup session defaults

Acceptance: The onboarding and runtime-control docs describe the new startup prompts and defaults accurately, with no stale references to `mine`, `all`, `all-prs`, or auto-computed startup session limits.

Key files: `docs/onboarding.md`, `docs/faq.md`, `docs/local-first-runtime-controls-spec.md`

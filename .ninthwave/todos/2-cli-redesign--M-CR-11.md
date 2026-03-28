# Docs: Update README with new CLI command examples (M-CR-11)

**Priority:** Medium
**Source:** CLI command redesign plan (2026-03-28)
**Depends on:** H-CR-8, H-CR-9
**Domain:** cli-redesign

Update README.md to reflect the new CLI mental model. Replace references to `ninthwave start`, `ninthwave orchestrate`, and `ninthwave setup` with the new commands (`nw <ID>`, `nw watch`, `nw init`). Show the new command overview: `nw` for interactive guide, `nw H-RR-1` to run items, `nw watch` for the full pipeline, `nw status` for live view. Update any quickstart or getting-started examples.

**Test plan:**
- Manual review

Acceptance: README.md uses only the new command names. No references to `start`, `orchestrate`, or `setup` as CLI commands. Examples show the new mental model.

Key files: `README.md`

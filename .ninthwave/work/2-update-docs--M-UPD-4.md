# Docs: Document the update flow and supported install paths (M-UPD-4)

**Priority:** Medium
**Source:** Update-process decomposition from Codex screenshots on 2026-04-11
**Depends on:** H-UPD-3
**Domain:** update-docs
**Lineage:** 4058870b-7b25-4fa6-a2ab-4f06aa65f85e

Document the new update behavior once the runtime, command, and startup prompt are in place. Cover the supported install paths, the new `nw update` command, the restart expectation after a successful update, and the meaning of the persisted dismissed-version state. Keep the docs aligned with the actual v1 scope rather than promising support for arbitrary custom install methods.

**Test plan:**
- Verify help output includes `nw update` and matches the final command name and description.
- Manually review README and FAQ text for consistency with the shipped behavior and supported install sources.
- Confirm docs do not claim hot reload or support for unknown/custom install mechanisms.

Acceptance: README/FAQ/help text explain how to update ninthwave, what install paths are supported in v1, and what the startup prompt does for skip vs skip-until-next-version.

Key files: `README.md`, `docs/faq.md`, `core/help.ts`

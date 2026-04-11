# Feat: Add install-aware update runtime state (H-UPD-1)

**Priority:** High
**Source:** Update-process decomposition from Codex screenshots on 2026-04-11
**Depends on:** None
**Domain:** update-runtime
**Lineage:** 5560b371-e9bc-4ba8-9c4c-a568f537c46f

Extend the existing passive update-check path so ninthwave can resolve how the current binary was installed and whether a specific offered version has already been dismissed. Support the install methods already present in this repo: Homebrew and the `install.sh` direct install flow. Persist a skipped target version in user config so the startup prompt can hide a dismissed release until a newer one appears.

**Test plan:**
- Add unit tests for install-source detection across Homebrew-managed paths, direct installs under `~/.ninthwave`, and unknown installs.
- Add config tests for reading and writing the persisted skipped-version field without clobbering unrelated user config.
- Verify prompt-suppression logic hides only the dismissed version and re-enables itself when a newer release is available.
- Verify the existing passive update footer behavior remains unchanged when no prompt flow is using the new state.

Acceptance: The update subsystem can resolve `homebrew`, `direct`, or `unknown` install sources, expose the correct command metadata for supported sources, and correctly decide whether a startup prompt should be suppressed for a previously skipped release.

Key files: `core/update-check.ts`, `core/config.ts`, `test/update-check.test.ts`, `test/config.test.ts`

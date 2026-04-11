# Feat: Add the interactive startup update prompt (H-UPD-3)

**Priority:** High
**Source:** Update-process decomposition from Codex screenshots on 2026-04-11
**Depends on:** H-UPD-2
**Domain:** startup-update-ux
**Lineage:** a0b7b47c-830f-4c01-91b0-0e2892992aa9

Add a Codex-style startup prompt when ninthwave is running in an interactive TTY and a newer release is available. The prompt should show the current and latest versions, the release-notes URL, and the three actions from the screenshots: update now, skip, and skip until next version. Reuse the shared updater command path from the CLI work so the startup path does not invent a second execution flow.

**Test plan:**
- Add `cmdNoArgs` coverage that checks the update prompt path runs before mux startup and before the normal interactive picker.
- Verify `Skip` continues into normal startup without persisting any new user config.
- Verify `Skip until next version` persists the dismissed version and suppresses the prompt until a newer version is offered.
- Verify `Update now` runs the shared updater flow and exits startup instead of falling through into the current session.

Acceptance: Interactive `nw` startup shows the update prompt only when an update is available and not dismissed. The three actions behave as specified, and non-interactive/headless paths keep the existing passive behavior.

Key files: `core/commands/onboard.ts`, `core/update-check.ts`, `test/onboard.test.ts`

# Feat: Add a manual `nw update` command (H-UPD-2)

**Priority:** High
**Source:** Update-process decomposition from Codex screenshots on 2026-04-11
**Depends on:** H-UPD-1
**Domain:** update-cli
**Lineage:** bfa61616-c4f7-4a27-b7aa-12000267bada

Add an explicit `nw update` command that runs the resolved install-specific update command and streams output directly to the terminal. The command should reuse the shared install detection and updater execution logic, handle success and failure cleanly, and print manual instructions when ninthwave cannot determine how the current install was managed. This command becomes the reusable execution path that the startup prompt can call later.

**Test plan:**
- Add command-registry and CLI dispatch tests that prove `update` is registered and can run without a project root.
- Add unit tests for the updater runner covering Homebrew, direct-install, and unknown-install paths.
- Verify successful runs print restart guidance and failed runs return a non-zero exit code.
- Verify unknown-install paths print concrete manual update instructions instead of trying to mutate anything.

Acceptance: `nw update` exists in help output, runs the shared updater for supported install sources, reports failures with a non-zero exit code, and prints manual guidance for unsupported or unknown install sources.

Key files: `core/help.ts`, `core/cli.ts`, `core/commands/update.ts`, `test/cli.test.ts`

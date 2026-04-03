# Feat: Add foreground `nw broker` command for self-hosted crews (H-SHB-5)

**Priority:** High
**Source:** Spec `.opencode/plans/1775207598126-tidy-cactus.md`
**Depends on:** H-SHB-4
**Domain:** broker-command
**Lineage:** 8ef4e423-fba1-4a81-948c-bcf816b83b91

Add a first-class foreground broker command that starts the self-hosted runtime, prints the effective HTTP and WebSocket URLs, and optionally saves the broker socket URL into project config through the existing `crew_url` setting. Keep v1 intentionally narrow: parse `--host`, `--port`, `--data-dir`, `--event-log`, and `--save-crew-url`, register the command in help, and avoid inventing daemon-management subcommands.

**Test plan:**
- Add `test/broker-command.test.ts` covering command registration, help output, flag parsing, startup delegation, printed connection info, and `--save-crew-url` config writes.
- Extend `test/config.test.ts` or command-level config coverage to confirm `crew_url` remains the only persisted project setting touched by the command.
- Verify `test/cli.test.ts` or related CLI dispatch coverage still passes with the new command added to `core/help.ts`.

Acceptance: `nw broker` starts the self-hosted runtime in the foreground, accepts the documented flags, prints usable connection URLs, optionally persists `crew_url` when requested, and the targeted command plus full test suites pass.

Key files: `core/commands/broker.ts`, `core/help.ts`, `core/config.ts`, `test/broker-command.test.ts`, `test/config.test.ts`

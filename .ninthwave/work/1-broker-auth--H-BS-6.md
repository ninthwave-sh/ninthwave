# Feat: nw crew subcommand (H-BS-6)

**Priority:** High
**Source:** Broker Secret & Crew Connection UX Redesign plan
**Depends on:** H-BS-5
**Domain:** broker-auth
**Lineage:** 3e535824-d619-41ac-83d1-9f6af4c18428
**Requires manual review:** true

Create a new `core/commands/crew.ts` command file with four subcommands:

- `nw crew` (no subcommand / `status`): Show current crew status -- whether a broker_secret
  exists, whether crew_url is configured, the resolved broker URL (default or custom).
  Output example: "Crew: configured (secret present, broker: wss://ninthwave.sh)"
  or "Crew: not configured (no broker secret -- run nw crew create or nw init)".

- `nw crew create`: Generate a new broker_secret via `generateProjectIdentity()`, write to
  `config.local.json`, display the secret with sharing instructions. If a secret already
  exists, warn and ask for confirmation before overwriting.

- `nw crew join <secret>`: Validate the provided secret with `parseBrokerSecret()`, write to
  `config.local.json`. If a secret already exists, warn and ask for confirmation.

- `nw crew disconnect`: Remove `broker_secret` from `config.local.json`. Confirm before
  removing.

Register the command in `core/cli.ts` dispatch and add a help entry in `core/help.ts`.
Follow the one-file-per-command pattern (e.g., `cmdCrew(args)`).

**Test plan:**
- Test `crew status` with secret present: verify output includes "configured"
- Test `crew status` without secret: verify output includes "not configured"
- Test `crew create`: verify secret written to config.local.json, displayed on stdout
- Test `crew create` with existing secret: verify overwrite warning
- Test `crew join <valid>`: verify secret written and validated
- Test `crew join <invalid>`: verify rejection error
- Test `crew disconnect`: verify broker_secret removed from config.local.json

Acceptance: `nw crew` shows status. `nw crew create` generates and displays a secret. `nw crew join <secret>` validates and saves. `nw crew disconnect` removes the secret. All subcommands registered in CLI dispatch and help text. Tests pass.

Key files: `core/commands/crew.ts` (new), `core/cli.ts`, `core/help.ts`, `test/crew.test.ts` (new)

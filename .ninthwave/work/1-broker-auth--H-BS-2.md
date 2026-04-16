# Feat: Broker secret prompt in nw init (H-BS-2)

**Priority:** High
**Source:** Broker Secret & Crew Connection UX Redesign plan
**Depends on:** H-BS-1
**Domain:** broker-auth
**Lineage:** 71b32479-e5c2-43a0-8be0-3bd1a37ad6d2

Add an interactive broker secret prompt to `nw init` with three options:
"Broker secret: generate (default), enter, skip". On "generate" (default -- just press
Enter): call `generateProjectIdentity()`, write secret to `config.local.json`, and display
it with sharing instructions ("Share this with teammates via password manager or secure
chat"). On "enter": prompt for the secret value, validate with `parseBrokerSecret()`, write
to `config.local.json`. On "skip": no secret generated, local-only setup.

Remove the current auto-generation of `broker_secret` inside `initProject()` (lines 824-827).
The prompt replaces it. When `--yes` is passed, default to "generate" (same as pressing
Enter at the prompt) so non-interactive init still provisions a secret by default.

**Test plan:**
- Test "generate" path: verify secret written to config.local.json, not to config.json; verify sharing instructions printed to stdout
- Test "enter" path: inject a valid secret via prompt mock, verify it is written to config.local.json and validated
- Test "enter" with invalid secret: verify rejection message and re-prompt
- Test "skip" path: verify no config.local.json created (or no broker_secret field)
- Test --yes flag: verify secret is auto-generated without prompting

Acceptance: Interactive `nw init` (TTY, no --yes) shows the broker secret prompt. Each of the three paths (generate/enter/skip) works correctly. `--yes` defaults to generate. The old silent auto-generation in `initProject()` is removed. All existing init tests pass.

Key files: `core/commands/init.ts:790-865`, `core/commands/init.ts:874-917`, `core/config.ts`, `test/init.test.ts`

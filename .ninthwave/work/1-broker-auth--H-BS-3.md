# Feat: Init --broker-secret and --skip-broker flags (H-BS-3)

**Priority:** High
**Source:** Broker Secret & Crew Connection UX Redesign plan
**Depends on:** H-BS-2
**Domain:** broker-auth
**Lineage:** 5d1b92e7-3a9a-4997-82f5-b87e1adca21d

Add two new flags to `nw init`:

- `--broker-secret <value>`: Validates the provided secret with `parseBrokerSecret()` and
  writes it to `.ninthwave/config.local.json`. Enables scripted team onboarding:
  `nw init --yes --broker-secret "$SECRET"`. Works with or without `--yes`.

- `--skip-broker`: Suppresses broker secret generation entirely. Useful for
  `nw init --yes --skip-broker` when you want a guaranteed local-only setup (e.g., CI
  environments that should never connect to a broker).

Update `cmdInit()` flag parsing and the help entry in `core/help.ts` to document both flags.
If both `--broker-secret` and `--skip-broker` are provided, error with a clear message.

**Test plan:**
- Test `--broker-secret <valid>`: verify secret written to config.local.json
- Test `--broker-secret <invalid>`: verify exit with validation error message
- Test `--skip-broker`: verify no secret generated even with --yes
- Test `--broker-secret` + `--skip-broker` together: verify mutual exclusion error
- Test `--broker-secret` without --yes: verify it still works (skips the interactive prompt)

Acceptance: Both flags parse correctly in `cmdInit()`. `--broker-secret` validates and writes the secret. `--skip-broker` suppresses generation. Mutual exclusion is enforced. Help text in `core/help.ts` documents both flags. Tests pass.

Key files: `core/commands/init.ts:874-917`, `core/help.ts:102-116`, `test/init.test.ts`

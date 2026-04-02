# Feat: Wire crew URL precedence into orchestration (H-CRW-2)

**Priority:** High
**Source:** Approved plan `1775111435127-crisp-falcon.md`
**Depends on:** H-CRW-1
**Domain:** collaboration
**Lineage:** 1ad588b0-a086-459e-8c71-eb964a3eff52

Update orchestration startup so the effective broker URL follows one precedence chain: CLI `--crew-url`, then project config `crew_url`, then the hosted default. The config-backed value should be applied before startup join/share resolution so interactive startup, broker creation, and derived HTTP session creation all inherit the same URL when the CLI flag is absent.

**Test plan:**
- Add orchestration tests that prove CLI `--crew-url` wins over project config.
- Add orchestration tests that prove project config fills `crewUrl` when the CLI flag is absent and the hosted default is still used when neither source is set.
- Verify startup collaboration resolution and broker-facing code paths continue to preserve an existing `crewUrl` rather than resetting it.

Acceptance: Orchestration uses CLI `--crew-url` first, falls back to project config `crew_url` when present, and otherwise keeps `wss://ninthwave.sh`. Startup join/share and broker session creation all resolve through the same precedence chain.

Key files: `core/commands/orchestrate.ts`, `test/orchestrate.test.ts`, `core/commands/watch-args.ts`

# Feat: Auto-connect when broker secret present (H-BS-4)

**Priority:** High
**Source:** Broker Secret & Crew Connection UX Redesign plan
**Depends on:** H-BS-3
**Domain:** broker-auth
**Lineage:** d94df84e-0c2d-4b40-9af5-166881524462

Change the orchestrator's default connection behavior: when `broker_secret` is present in
the merged project config, default `connectMode` to `true`. When no secret exists, default
to `false`. This replaces the current "local-first: never auto-connect" policy (comment at
`orchestrate.ts:1871`) with "auto-connect when crew is configured."

Add a `--local` flag to `core/commands/watch-args.ts` that explicitly sets
`connectMode = false`, allowing users with a secret to opt out of broker connection for a
single session. The existing `--connect` flag remains as an explicit opt-in (useful when
the auto-connect default changes or for CI scripts).

In `cmdOrchestrate()`, after loading merged config via `loadMergedProjectConfig()`, check
for `broker_secret` presence to set the default. The `--connect` and `--local` flags
override this default.

**Test plan:**
- Test auto-connect: merged config with broker_secret -> connectMode defaults to true
- Test no-secret: merged config without broker_secret -> connectMode defaults to false
- Test --local override: broker_secret present but --local flag -> connectMode is false
- Test --connect override: no broker_secret but --connect flag -> connectMode is true (existing behavior preserved)
- Test --local + --connect conflict: decide precedence (last flag wins, or error)
- Update `test/orchestrate.test.ts` for new default behavior

Acceptance: Orchestrator auto-connects when broker_secret present. `--local` flag works as override. `--connect` flag still works. Comment at `orchestrate.ts:1871` updated. watch-args.ts parses `--local`. Tests pass.

Key files: `core/commands/orchestrate.ts:1366-1400`, `core/commands/orchestrate.ts:1870-1900`, `core/commands/watch-args.ts:25-60`, `core/commands/watch-args.ts:170-195`, `core/help.ts`

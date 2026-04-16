# Feat: Dynamic connectionAction in startup flows (H-BS-5)

**Priority:** High
**Source:** Broker Secret & Crew Connection UX Redesign plan
**Depends on:** H-BS-4
**Domain:** broker-auth
**Lineage:** baca5c6a-6927-4ac9-b8d0-007dd0143919

Replace the hardcoded `connectionAction: null` in both the readline flow
(`core/interactive.ts:610`) and the TUI flow (`core/tui-widgets.ts:1178`) with a value
derived from the project config. When `broker_secret` is present in the merged config,
set `connectionAction: { type: "connect" }`. When absent, keep it `null`.

This requires threading the project config (or just the "has secret" boolean) into
`runInteractiveFlow()` and `runSelectionScreen()`. Add a new optional field to the
deps/options interfaces (e.g., `hasBrokerSecret?: boolean`) so the interactive flows
can derive the correct default without importing config directly. The caller in
`cmdOrchestrate()` already has the merged config and can pass this flag.

The TUI settings menu already has a collaboration mode toggle -- this change only affects
the default state when the flow starts.

**Test plan:**
- Test readline flow: with hasBrokerSecret=true, returned connectionAction is { type: "connect" }
- Test readline flow: with hasBrokerSecret=false, returned connectionAction is null
- Test TUI flow: same two cases via SelectionScreenResult
- Verify existing interactive tests still pass (they should have hasBrokerSecret undefined -> null)

Acceptance: Both readline and TUI flows return a config-derived `connectionAction`. No hardcoded `null` remains at `interactive.ts:610` or `tui-widgets.ts:1178`. The orchestrator receives the correct connection intent from the interactive startup. Tests pass.

Key files: `core/interactive.ts:37-50`, `core/interactive.ts:600-615`, `core/tui-widgets.ts:250-270`, `core/tui-widgets.ts:1170-1185`, `core/commands/orchestrate.ts:1550-1555`

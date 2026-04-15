# Refactor: Collapse review modes to on-off (H-SUX-1)

**Priority:** High
**Source:** Approved startup simplification plan 2026-04-15
**Depends on:** None
**Domain:** runtime-review
**Lineage:** ec26e6dc-767d-4d8c-9608-0b4b593291cb

Collapse the startup, runtime, and persisted review mode vocabularies down to `on` and `off`. Keep reader compatibility for legacy persisted values so existing users with `mine` or `all` in `~/.ninthwave/config.json` still land on review enabled after the refactor. Update the runtime controls and labels so the live TUI no longer exposes the old three-state model.

**Test plan:**
- Add config coverage showing `review_mode: "mine"` and `review_mode: "all"` both load as enabled, while new saves persist only `on` or `off`
- Update runtime-control tests for `core/tui-keyboard.ts` and `core/watch-engine-runner.ts` so review cycling only toggles `on <-> off`
- Verify rendered labels in startup/runtime surfaces no longer mention `mine`, `all`, `ninthwave-prs`, or `all-prs`

Acceptance: Review settings across `core/tui-settings.ts`, config parsing, runtime control handlers, and TUI rendering use `on` and `off` only. Legacy user config values still enable reviews on read, and new persistence writes only the new vocabulary.

Key files: `core/tui-settings.ts`, `core/config.ts`, `core/watch-engine-runner.ts`, `core/tui-keyboard.ts`, `core/status-render.ts`, `core/orchestrate-tui-render.ts`, `test/config.test.ts`, `test/system/watch-runtime-controls.test.ts`

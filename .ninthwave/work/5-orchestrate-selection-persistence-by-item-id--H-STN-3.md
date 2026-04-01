# Preserve TUI selection across refreshes by item id (H-STN-3)

**Priority:** High
**Source:** Decomposed from TUI status navigation fix plan 2026-04-01
**Depends on:** H-STN-2
**Domain:** status-tui-navigation

Finish the TUI selection fix in `core/commands/orchestrate.ts` by storing and normalizing `selectedItemId` instead of `selectedIndex`. Seed initial selection from the first visible selectable item, preserve the same selected item across refresh-time reordering when it still exists, and fall back to the nearest remaining visible item when the selected item disappears. Remove raw-index helpers and wiring that resolve selection through `items[selectedIndex]`, and thread visible-order metadata into render-time selection and status clamping.

**Test plan:**
- Replace raw-index helper expectations in `test/orchestrate.test.ts` with visible-order/item-id-based expectations
- Add coverage proving selection stays on the same item after refresh-time reordering when that item still exists
- Add coverage proving a disappearing selected item falls to the nearest remaining visible item
- Add coverage proving selection clears cleanly when the status list becomes empty
- Run `bun test test/tui-keyboard.test.ts test/status-render.test.ts test/orchestrate.test.ts --smol --bail`

Acceptance: The orchestrator and TUI state persist selection by item id, not raw index. Refreshes no longer cause selection drift when rows reorder, disappearing items fall to the nearest visible remaining row, and empty lists clear selection without stale highlight state.

Key files: `core/commands/orchestrate.ts`, `core/tui-keyboard.ts`, `core/status-render.ts`, `test/orchestrate.test.ts`, `test/tui-keyboard.test.ts`, `test/status-render.test.ts`

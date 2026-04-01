# Switch status keyboard navigation to visible item ids (H-STN-2)

**Priority:** High
**Source:** Decomposed from TUI status navigation fix plan 2026-04-01
**Depends on:** H-STN-1
**Domain:** status-tui-navigation

Replace raw-index navigation in `core/tui-keyboard.ts` with visible-order navigation backed by the new status layout metadata. Update status-mode movement so `Up`/`Down` and `j`/`k` move through visible selectable item ids with wrap-around, and change status scrolling to keep the selected item's rendered line span in view even when dependency/blocker detail rows add extra lines. Preserve existing `j/k` behavior for logs mode and the detail overlay.

**Test plan:**
- Add `test/tui-keyboard.test.ts` coverage proving `Up`/`Down` wrap at the top and bottom of the visible selectable order
- Add coverage proving `j/k` use the same status-mode movement rules as the arrow keys
- Add coverage proving logs mode and detail-overlay scrolling retain current behavior
- Add coverage proving status scroll follows rendered line spans when blocker-detail lines are present between selectable items

Acceptance: Status-mode keyboard navigation is driven by visible selectable item ids rather than raw array indices. Wrap-around behavior matches the rendered order on screen, rendered-line scrolling stays aligned with the highlighted item, and non-status modes keep their current controls.

Key files: `core/tui-keyboard.ts`, `core/status-render.ts`, `test/tui-keyboard.test.ts`

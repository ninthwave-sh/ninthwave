# Extract visible status-order metadata for TUI rendering (H-STN-1)

**Priority:** High
**Source:** Decomposed from TUI status navigation fix plan 2026-04-01
**Depends on:** None
**Domain:** status-tui-navigation

Make visible-order metadata the single source of truth for the rendered status list. Refactor `core/status-render.ts` so the ordering and grouping logic currently embedded in `buildStatusLayout()` is extracted into a shared pure helper that returns selectable item ids in exact render order, rendered line spans for each selectable item, and any queue metadata the renderer still needs. Keep this item focused on layout metadata and rendering integration only; do not change keyboard state shape or orchestrator refresh behavior here.

**Test plan:**
- Add `test/status-render.test.ts` coverage proving visible selectable order matches the actual rendered order across active, done, and queued sections
- Add coverage proving dependency-mode blocker detail rows expand the parent item's rendered line span without becoming separately selectable
- Add coverage proving queue headers, separators, and schedule worker rows are excluded from selectable-order metadata
- Add coverage proving selected-row highlighting is driven by `selectedItemId` passed through the renderer instead of a raw item index

Acceptance: `core/status-render.ts` exposes shared visible-order/layout metadata that matches what the user sees on screen. Rendering and highlight behavior use `selectedItemId`, and non-item rows remain non-selectable while parent items retain accurate rendered line spans.

Key files: `core/status-render.ts`, `test/status-render.test.ts`

# Fix: Refine TUI footer shortcut styling and merge toggle copy (M-TFT-1)

**Priority:** Medium
**Source:** Approved TUI footer UX plan at `.opencode/plans/1775137453551-happy-rocket.md`
**Depends on:** None
**Domain:** tui-footer-ux
**Lineage:** d79b076c-0a81-4bc2-b4bd-f9229be3a10a

Update the live TUI strategy footer and paused overlay hint so they use the approved compact wording and visual hierarchy. Attach `(shift+tab to toggle)` directly to the merge strategy badge, render actionable key tokens brighter than their dimmed labels, and keep the change scoped to `core/status-render.ts` plus its renderer tests. Leave keyboard behavior unchanged; this is a presentation-only UX refinement.

**Test plan:**
- Update `test/status-render.test.ts` to assert the new footer and paused-overlay text after `stripAnsi`, including `p pause`, `q quit`, `c controls`, `? help`, and `(shift+tab to toggle)`.
- Verify the width-sensitive footer case still fits within 80 columns and that GitHub warning/update notice paths still wrap or split correctly when the footer is narrow.
- Run the existing keyboard-related tests to confirm no regressions in shortcut behavior while the copy and styling change.

Acceptance: The strategy footer renders the merge badge followed immediately by `(shift+tab to toggle)`, single-key shortcuts render with brighter key tokens and dimmer labels, the paused overlay uses the same visual language without bullet separators, and the updated status-render tests pass without requiring keyboard logic changes.

Key files: `core/status-render.ts`, `test/status-render.test.ts`, `core/output.ts`

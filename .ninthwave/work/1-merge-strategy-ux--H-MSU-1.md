# Fix: Clarify merge strategy visuals and copy (H-MSU-1)

**Priority:** High
**Source:** Manual request 2026-04-01 -- merge strategy UX cleanup
**Depends on:** None
**Domain:** merge-strategy-ux

Give `Auto` a real positive visual treatment instead of the current dim badge, and tighten the surrounding merge-strategy copy so it matches the actual runtime contract. Keep the short labels `Auto`, `Manual`, and `Bypass`, but rewrite help and startup descriptions so every strategy is framed around `CI must pass`, with the post-CI behavior being the thing that changes. Make the bypass description explicit that it admin-merges after CI and skips human approval requirements rather than implying AI review is always part of the gate.

**Test plan:**
- Update `test/status-render.test.ts` to assert the `auto` indicator is no longer dim-only and that the help overlay text describes CI-first behavior for auto, manual, and bypass
- Add or adjust coverage around startup merge descriptions sourced from `core/tui-settings.ts` so the selection screen surfaces the revised copy without renaming the short labels
- Verify bypass-hidden rendering still works when bypass is disabled and that the visible labels remain `Auto`, `Manual`, and `Bypass`

Acceptance: `Auto` renders with a distinct green success treatment anywhere `strategyIndicator()` is used. Merge-strategy help and startup descriptions no longer claim AI review is always required. The short labels stay intact while the explanatory copy clearly distinguishes auto-merge, human merge, and admin merge after CI passes.

Key files: `core/status-render.ts`, `core/tui-settings.ts`, `test/status-render.test.ts`, `test/tui-widgets.test.ts`

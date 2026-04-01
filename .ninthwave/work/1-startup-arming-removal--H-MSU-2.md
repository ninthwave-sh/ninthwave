# Fix: Remove the duplicate startup arming flow (H-MSU-2)

**Priority:** High
**Source:** Manual request 2026-04-01 -- startup flow simplification
**Depends on:** H-COL-4, M-COL-5
**Domain:** startup-arming-removal

Remove the separate post-confirmation arming window now that startup already has a settings screen for collaboration, reviews, merge strategy, and WIP. After the user confirms startup settings, the watch flow should enter the live status page directly and apply the chosen collaboration intent without showing a second `Join` or `Share` countdown surface. Keep explicit CLI `join` and `share` behavior intact, and make sure future-only and collaboration startup paths still gate claims correctly for the chosen mode.

**Test plan:**
- Replace the arming-window-specific coverage in `test/orchestrate.test.ts` with startup-flow assertions proving plain startup no longer waits through a countdown banner before entering normal watch behavior
- Verify the collaboration choice returned from the startup settings flow maps directly into orchestrator setup, including local, share, and join cases, without a second prompt in `core/commands/orchestrate.ts`
- Cover edge cases for future-only startup, cancelled join-code entry, and broker connection failures so arming removal does not regress startup safety or collaboration setup

Acceptance: Plain startup has one decision surface before the status page. The arming banner, countdown ticker, and associated startup-only branch are removed. Selected collaboration intent is applied directly from startup settings, while explicit CLI join/share flows and claim-gating rules still behave correctly.

Key files: `core/commands/orchestrate.ts`, `core/tui-widgets.ts`, `test/orchestrate.test.ts`, `test/tui-widgets.test.ts`

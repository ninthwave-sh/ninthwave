# Fix: Early mux availability check in all launch paths (H-MX-1)

**Priority:** High
**Source:** CEO + Eng review of cmux strategy 2026-03-28
**Depends on:** —
**Domain:** cmux-integration

Bug fix: `nw <ID>` and `nw start` skip the mux availability check that `nw watch` already has. They create worktrees first, then fail when trying to launch a cmux session. Wasted work and confusing error.

## Problem

`cmdOrchestrate()` in `orchestrate.ts:2135-2137` checks `mux.isAvailable()` early and dies with `diagnoseUnavailable()`. But `cmdRunItems()` and `cmdStart()` in `launch.ts` call `getMux()` without checking availability, proceed to worktree creation, and only fail inside `launchAiSession()` with the unhelpful "Failed to launch {ID}. Aborting remaining items."

## Fix

Add early availability check in `cmdRunItems()` and `cmdStart()` before any worktree or partition work:

```typescript
const mux = getMux();
if (!mux.isAvailable()) {
  die(mux.diagnoseUnavailable());
}
```

This matches the existing pattern in `cmdOrchestrate()`.

**Test plan:**
- Test cmdRunItems bails early when mux unavailable (no worktree creation)
- Test cmdStart bails early when mux unavailable
- Test error message matches diagnoseUnavailable() output

Acceptance: Running `nw <ID>` without cmux produces a clear error immediately, before any git operations. Same error message as `nw watch` without cmux.

Key files: `core/commands/launch.ts:901-1015,1177`, `core/mux.ts:130-138`

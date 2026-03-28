# Feat: Auto-launch cmux when running nw outside a session (H-MX-2)

**Priority:** High
**Source:** CEO + Eng review of cmux strategy 2026-03-28
**Depends on:** H-MX-1
**Domain:** cmux-integration

When a user runs `nw watch`, `nw <ID>`, or `nw` (interactive picker) outside of cmux, auto-launch cmux with the original command inside it. This eliminates the "install cmux, launch cmux, then run nw" friction. One command to value.

## Detection flow

```
nw <command>
  │
  ├── CMUX_WORKSPACE_ID set? → proceed normally (inside cmux)
  │
  ├── NINTHWAVE_AUTO_LAUNCHED=1? → die (recursive launch guard)
  │
  ├── cmux binary available + TTY? → exec: NINTHWAVE_AUTO_LAUNCHED=1 cmux -- nw <original args>
  │
  ├── cmux binary available + non-TTY? → die("cmux required for parallel sessions")
  │
  └── cmux not available? → die("Install cmux: brew install --cask manaflow-ai/cmux/cmux")
```

## Implementation

Add `ensureMuxOrAutoLaunch(args: string[])` in `core/mux.ts`. Commands that need a multiplexer call this instead of the bare `getMux()`.

Key design choices:
- Use `exec` (process replacement) so the user's terminal becomes cmux. No orphan processes.
- Set `NINTHWAVE_AUTO_LAUNCHED=1` env var to prevent recursive auto-launch if cmux doesn't set `CMUX_WORKSPACE_ID` immediately.
- Only auto-launch for TTY sessions. Non-TTY (pipes, CI, scripts) gets a clear error.
- Commands that don't need cmux (`nw version`, `nw doctor`, `nw list`, `nw deps`) are unaffected.

## Which commands auto-launch

| Command | Auto-launch? | Why |
|---------|-------------|-----|
| `nw watch` | Yes | Primary orchestration command |
| `nw <ID>` | Yes | Launch individual items |
| `nw start <ID>` | Yes | Same as above |
| `nw` (no args, interactive) | Yes | Picker leads to launch |
| `nw version` | No | No mux needed |
| `nw doctor` | No | Checks mux availability, shouldn't auto-launch |
| `nw list` | No | Read-only |
| `nw init` | No | Setup, no mux needed |
| `nw status` | No | Read-only (but --watch mode could auto-launch) |

## Exec implementation

```typescript
import { execSync } from "child_process";
// or with Bun:
const proc = Bun.spawnSync(["cmux", "--", "nw", ...originalArgs], {
  env: { ...process.env, NINTHWAVE_AUTO_LAUNCHED: "1" },
  stdio: "inherit",
});
process.exit(proc.exitCode ?? 0);
```

Note: `Bun.spawnSync` with `stdio: "inherit"` passes through terminal control. The user sees cmux launch with nw inside it.

**Test plan:**
- Test auto-launch triggers when: cmux available, no CMUX_WORKSPACE_ID, TTY
- Test auto-launch skipped when: CMUX_WORKSPACE_ID set (inside cmux)
- Test auto-launch skipped when: NINTHWAVE_AUTO_LAUNCHED=1 (recursive guard)
- Test auto-launch skipped when: non-TTY (pipe, CI)
- Test auto-launch skipped when: cmux not available (install prompt shown)
- Test that commands not needing mux (version, list, doctor) never auto-launch

Acceptance: User types `nw watch` in a bare terminal. cmux launches automatically with ninthwave inside it. User never manually launches cmux. Recursive launch is prevented. Non-TTY sessions get a clear error.

Key files: `core/mux.ts`, `core/commands/launch.ts`, `core/commands/orchestrate.ts`, `core/cli.ts`

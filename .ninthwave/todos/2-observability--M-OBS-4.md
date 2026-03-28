# Feat: Rotate orchestration log files at daemon startup (M-OBS-4)

**Priority:** Medium
**Source:** Vision exploration L-VIS-15 — observability iteration
**Depends on:** H-OBS-1
**Domain:** observability

The orchestrator appends to `~/.ninthwave/projects/{slug}/orchestrator.log` indefinitely. Over many sessions, the file grows without bound. Add log rotation at daemon startup: if the log exceeds 5MB, rename it to `orchestrator.log.1` (shifting existing rotations: `.1` → `.2`, `.2` → `.3`) and start a fresh file. Keep at most 3 rotated files (`.1`, `.2`, `.3`). This keeps total log storage under ~20MB while preserving recent history.

**Implementation:**

1. Create `rotateLogs(logPath: string, maxBytes: number, maxFiles: number)` in `core/daemon.ts` (or a new `core/log-rotate.ts` utility).
2. Check file size via `Bun.file(logPath).size`. If below `maxBytes`, return early.
3. Shift existing rotations: delete `.{maxFiles}`, rename `.{n}` → `.{n+1}` for n = maxFiles-1 down to 1, rename base → `.1`.
4. Call `rotateLogs()` at the start of `orchestrateLoop()` before any log entries are written, only when running in daemon mode.
5. The `nw logs` command (H-OBS-1) should also search rotated files when `--lines` requests more entries than the current file contains.

**Test plan:**
- Test rotation trigger: file > 5MB rotates, file < 5MB does not
- Test shift: existing `.1` becomes `.2`, old `.3` is deleted
- Test max files: only 3 rotated files kept
- Test fresh start: no existing log file, no rotation needed
- Test non-daemon mode: no rotation (only daemon mode rotates)
- Verify `bun test test/` passes

Acceptance: Orchestrator log files are rotated at daemon startup when they exceed 5MB. At most 3 rotated files are kept. No rotation occurs outside daemon mode. All tests pass.

Key files: `core/daemon.ts`, `core/commands/orchestrate.ts`, `test/daemon.test.ts`

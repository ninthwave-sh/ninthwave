# Feat: Pre-flight environment validation in orchestrate (H-PFV-1)

**Priority:** High
**Source:** Vision L-VIS-12 — pipeline reliability
**Depends on:** (none)
**Domain:** reliability

## Context

When `ninthwave orchestrate` is invoked, it parses CLI flags, applies config, and forks a daemon — but does not validate that the environment can support orchestration. If `gh` is unauthenticated, the AI tool is missing, or the multiplexer is down, the daemon forks and fails silently (or workers fail on launch with cryptic errors).

The `doctor.ts` command already implements comprehensive checks (gh auth, AI tool, multiplexer, git config). The orchestrate command should reuse these checks as a pre-flight gate before forking the daemon.

## Requirements

1. Extract the critical checks from `doctor.ts` into a shared `preflight()` function in a new module `core/preflight.ts`:
   - `gh` CLI installed and authenticated (required)
   - At least one AI tool available: claude, opencode, or copilot (required)
   - Multiplexer running: cmux, tmux, or zellij session detected (required)
   - Git user.name and user.email configured (required)
2. `preflight()` returns a result object with pass/fail per check and human-readable error messages.
3. In `cmdOrchestrate()`, call `preflight()` before `forkDaemon()`. If any required check fails, print the errors and exit non-zero — do not fork.
4. Add `--skip-preflight` flag to bypass validation (for CI/testing scenarios).
5. `doctor.ts` should import from `core/preflight.ts` to avoid duplication.

Acceptance: Running `ninthwave orchestrate` with `gh` unauthenticated prints a clear error and exits without forking. Running with `--skip-preflight` bypasses all checks. `ninthwave doctor` still works and shares the same check logic.

**Test plan:**
- Unit test: `preflight()` returns failure when `gh` is not authenticated (mock `Bun.spawnSync`)
- Unit test: `preflight()` returns failure when no AI tool is found
- Unit test: `preflight()` returns failure when no multiplexer is detected
- Unit test: `preflight()` returns success when all checks pass
- Unit test: `--skip-preflight` flag skips all checks
- Unit test: `doctor.ts` reuses preflight checks (no duplication)
- Edge case: partial failures (gh works but no AI tool) — all failures reported, not just first

Key files: `core/preflight.ts` (new), `core/commands/orchestrate.ts`, `core/commands/doctor.ts`

# Refactor: Create command registry in help.ts (H-CR-3)

**Priority:** High
**Source:** CLI command redesign plan (2026-03-28)
**Depends on:** H-CR-1, H-CR-2
**Domain:** cli-redesign

Create `core/help.ts` as the single source of truth for all CLI commands. Define a `CommandRegistry` data structure where each entry has: name, handler function, group (workflow/diagnostic/advanced), needsRoot boolean, description, flags array, and examples array. Migrate the `COMMANDS` array and 27-case switch statement from `cli.ts` into this registry. Refactor `cli.ts` to dispatch via registry lookup instead of switch. The `printHelp()` function moves to `help.ts`. All commands continue to work identically -- this is a structural refactor only.

**Test plan:**
- Add `test/cli.test.ts` with tests for registry lookup, unknown command handling, and help output
- Verify `bun test test/` passes (no behavior changes)
- Verify `ninthwave --help` output is identical to before
- Verify every command still dispatches correctly

Acceptance: `core/help.ts` exists with `COMMAND_REGISTRY`. `cli.ts` switch statement replaced with registry dispatch. All 27+ commands work. Help output unchanged. All tests pass.

Key files: `core/help.ts` (new), `core/cli.ts`

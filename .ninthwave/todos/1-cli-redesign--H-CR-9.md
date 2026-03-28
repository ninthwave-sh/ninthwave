# Feat: Grouped and per-command rich help (H-CR-9)

**Priority:** High
**Source:** CLI command redesign plan (2026-03-28)
**Depends on:** H-CR-3
**Domain:** cli-redesign

Add grouped help output and per-command rich help pages to the command registry in `core/help.ts`. `nw --help` shows commands grouped into Workflow (watch, status, init, stop), Diagnostics (doctor, list, deps, analytics), with a note to run `nw --help-all` for the full list. `nw --help-all` shows all commands including Advanced (clean, mark-done, reconcile, etc.). Each command gets a rich help page via `nw <command> --help` with: description, usage line, flags with descriptions, and 2-4 examples. The command categorization table: Workflow = (no args), watch, status, init, stop; Diagnostics = doctor, list, deps, conflicts, batch-order, analytics; Advanced = everything else (17 commands).

**Test plan:**
- Test `nw --help` output shows grouped format with Workflow and Diagnostics sections
- Test `nw --help-all` output includes Advanced section
- Test `nw watch --help` shows flags, description, and examples
- Test every command has a group assignment (no uncategorized commands)
- Snapshot test for help output format

Acceptance: `nw --help` shows grouped output. `nw --help-all` shows all commands. `nw <cmd> --help` shows rich help for every command. All tests pass.

Key files: `core/help.ts`, `core/cli.ts`, `test/cli.test.ts`

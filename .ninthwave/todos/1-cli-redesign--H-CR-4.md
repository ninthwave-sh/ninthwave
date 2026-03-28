# Refactor: Merge init and setup into unified init command (H-CR-4)

**Priority:** High
**Source:** CLI command redesign plan (2026-03-28)
**Depends on:** H-CR-3
**Domain:** cli-redesign

Merge `cmdSetup` functionality into `cmdInit` to create a single `nw init` command. Absorb from setup.ts: `interactiveAgentSelection()` (checkbox prompt for agent install), `checkPrerequisites()` (change from die to warn), `createNwSymlink()`, and `--global` mode. The merged flow: auto-detect -> show summary -> prompt for agent selection (if TTY, skip if --yes or non-TTY) -> scaffold -> print next steps. Remove `setup` from CLI dispatch in `cli.ts` and from the command registry. Keep shared utilities (`createSkillSymlinks`, `isSelfHosting`, `SYMLINK_GITIGNORE_DIRS`) in setup.ts as a utility module, or move them into init.ts.

**Test plan:**
- Migrate relevant tests from `test/setup.test.ts` into `test/init.test.ts`
- Test merged flow: auto-detect + scaffold + agent selection in one command
- Test `--global` mode still works
- Test prerequisite checks warn instead of die
- Test non-TTY mode: skip prompts, install all agents
- Test `nw setup` is no longer a valid command (clean break)

Acceptance: `nw init` does everything `nw setup` did plus auto-detection. `nw setup` returns "Unknown command." Prerequisite failures warn but don't abort. `--global` mode works. All tests pass.

Key files: `core/commands/init.ts`, `core/commands/setup.ts`, `core/cli.ts`, `test/init.test.ts`, `test/setup.test.ts`

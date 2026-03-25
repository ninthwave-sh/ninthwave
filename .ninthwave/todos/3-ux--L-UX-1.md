# Feat: Add interactive CLI flow for orchestrate command (L-UX-1)

**Priority:** Low
**Source:** Dogfooding friction (2026-03-25): interactive-cli-flow
**Depends on:** -
**Domain:** ux

The /work skill has a great interactive selection flow (batch scope, merge strategy, WIP limit, supervisor toggle) but it requires an LLM agent session. The CLI (`ninthwave orchestrate`) only accepts raw flags, so users who want the guided experience must use an AI tool. Users who use the CLI directly miss the interactive selection and have to know all the flags.

Add an interactive mode to the CLI:
1. When `ninthwave orchestrate` is run with no `--items` flag and stdin is a TTY, enter interactive mode.
2. Prompt the user to select items from the available TODOs (multi-select with checkboxes).
3. Prompt for merge strategy (asap/approved/reviewed) with descriptions.
4. Prompt for WIP limit (default 3, range 1-10).
5. Prompt for supervisor toggle (yes/no).
6. After selections, display a summary and confirm before starting.
7. When `--items` is provided or stdin is not a TTY, skip interactive mode (existing behavior preserved).

Use Bun's built-in readline or a lightweight terminal prompt library. Avoid heavy dependencies.

**Test plan:**
- Interactive mode triggers when no `--items` and stdin is TTY
- Non-interactive mode when `--items` is provided (existing behavior)
- Non-interactive mode when stdin is not a TTY (piped input)
- Item selection shows available TODOs with IDs and titles
- Merge strategy prompt shows all options with descriptions
- WIP limit prompt validates range (rejects 0, negative, >10)
- Summary displays all selections before confirmation
- Ctrl-C during prompts exits cleanly

Acceptance: `ninthwave orchestrate` without flags enters interactive mode on TTY. All prompts work. Existing flag-based usage is unaffected. Clean exit on interrupt.

Key files: `core/commands/orchestrate.ts`, `core/cli.ts`

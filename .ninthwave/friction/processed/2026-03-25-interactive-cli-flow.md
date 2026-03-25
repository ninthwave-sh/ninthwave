# Build interactive question flow into the CLI tool directly

**Observed:** The /work skill has a great interactive selection flow (batch scope, merge strategy, WIP limit, supervisor toggle) but it requires an LLM agent session to use. The CLI tool (`ninthwave orchestrate`) only accepts raw flags.

**Impact:** Users who want the guided experience must use an AI tool. Users who use the CLI directly miss the interactive selection and have to know all the flags.

**Suggestion:** Add an interactive mode to the CLI:
- `ninthwave orchestrate --interactive` or just `ninthwave orchestrate` with no args
- Prompts the user through the same flow: select items, choose merge strategy, set WIP limit
- Uses terminal prompts (inquirer-style) for the selection UX
- The LLM skill can still use `--items` with JSON output for programmatic use
- Best of both worlds: great CLI UX for humans, structured API for AI agents

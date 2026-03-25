# Fix: Accept both comma-separated and space-separated IDs in CLI commands (M-CLI-2)

**Priority:** Medium
**Source:** Dogfooding friction (2026-03-25): cli-arg-formats
**Depends on:** -
**Domain:** cli

`ninthwave batch-order` silently treated comma-separated IDs as a single unknown item (zero results). `ninthwave conflicts` rejected comma-separated IDs with a usage error. Both work fine with space-separated args. The `--items` flag on `orchestrate` already uses commas, so the inconsistency is confusing — especially for AI agents that naturally pass comma-separated lists.

Add a shared utility function (e.g., `splitIds(args: string[]): string[]`) that normalizes ID arguments by splitting on both commas and spaces, trimming whitespace, and filtering empty strings. Apply it to all commands that accept multiple item IDs: `batch-order`, `conflicts`, `deps`, and any others that take `<ID>...` arguments.

**Test plan:**
- `batch-order H-PRX-4,H-PRX-5,H-PRX-6` produces the same result as `batch-order H-PRX-4 H-PRX-5 H-PRX-6`
- `conflicts H-PRX-4,H-PRX-5` produces the same result as `conflicts H-PRX-4 H-PRX-5`
- Mixed format `batch-order H-PRX-4,H-PRX-5 H-PRX-6` works correctly
- Empty strings from trailing commas are filtered out (e.g., `H-PRX-4,` does not produce an empty ID)
- Existing tests for these commands pass without modification

Acceptance: All multi-ID CLI commands accept both comma-separated and space-separated arguments. A shared utility handles the normalization. No regressions in existing functionality.

Key files: `core/commands/batch-order.ts`, `core/commands/conflicts.ts`, `core/commands/deps.ts`, `core/todo-utils.ts`, `core/cli.ts`

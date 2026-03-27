# Fix: Support alphabetic suffixes in TODO ID parsing (H-IDP-1)

**Priority:** High
**Source:** User friction report -- batch-order and conflicts commands reject IDs like H-CP-7a/H-CP-7b
**Depends on:** None
**Domain:** cli-parsing

All ID regex patterns end with `[0-9]+`, which truncates alphabetic suffixes like `a` and `b` from IDs such as H-CP-7a. This causes "not found" errors in batch-order/conflicts commands and can create false circular dependencies when two suffixed IDs collapse to the same base. Fix the three canonical regex constants in `core/types.ts` to include an optional `[a-z]*` suffix, then replace the ~6 hardcoded duplicate regexes across command files with imports from `types.ts` to prevent future drift. Also update `core/docs/todos-format.md` which documents the (currently broken) pattern.

Specific locations with hardcoded regexes to deduplicate:
- `core/todo-files.ts` line 58 (title extraction)
- `core/commands/reconcile.ts` line 133 (filename parsing)
- `core/commands/orchestrate.ts` line 688 (filename parsing)
- `core/commands/status.ts` line 91 (dependency parsing)
- `core/todo-utils.ts` lines 268-269 (title normalization)

**Test plan:**
- Add unit tests for `ID_PATTERN`, `ID_PATTERN_GLOBAL`, and `ID_IN_PARENS` matching suffixed IDs (H-CP-7a, H-CP-7b) and plain IDs (H-CP-7)
- Test `parseTodoFile` with a fixture file using a suffixed ID -- verify ID, title, and dependencies parse correctly
- Test filename pattern extraction for files like `1-domain--H-CP-7a.md`
- Edge cases: multi-letter suffix (H-CP-7ab), no suffix (H-CP-7), dependency list mixing suffixed and plain IDs

Acceptance: `ninthwave batch-order` and `ninthwave conflicts` correctly recognize suffixed IDs (e.g., H-CP-7a, H-CP-7b) without "not found" warnings. All hardcoded ID regexes replaced with imports from `types.ts`. `bun test test/` passes. `todos-format.md` documents the updated pattern.

Key files: `core/types.ts:81-83`, `core/todo-files.ts:58`, `core/commands/reconcile.ts:133`, `core/commands/orchestrate.ts:688`, `core/commands/status.ts:91`, `core/todo-utils.ts:268-269`, `core/docs/todos-format.md`

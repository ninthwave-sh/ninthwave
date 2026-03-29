# Feat: Add __ALL__ sentinel with linked toggle and default all checked (H-WJ-2)

**Priority:** High
**Source:** Plan: Streamline nw watch Interactive Journey
**Depends on:** None
**Domain:** cli-ux

The checkbox item selection in `runCheckboxList` starts with all items unchecked and has no concept of "all including future items." Add an `__ALL__` sentinel item at the top of the checkbox list, checked by default, with linked toggle behavior: toggling `__ALL__` toggles all others to match, unchecking any item auto-unchecks `__ALL__`, and re-checking the last unchecked item re-checks `__ALL__`. The existing `"a"` key should interact correctly with `__ALL__`.

Changes required:
1. `runCheckboxList()` -- add `linkAllId?: string` option. When set, implement linked toggle logic between the sentinel and other items.
2. `CheckboxListResult` -- add `allSelected: boolean` (true when `__ALL__` is checked at confirmation).
3. `toCheckboxItems()` -- change `checked: false` to `checked: true` so all items start selected.
4. `runSelectionScreen()` -- prepend the `__ALL__` sentinel item (id: `__ALL__`, label: `All -- includes future items`, checked: true), pass `linkAllId: "__ALL__"` to `runCheckboxList`, set `allSelected` on result. Filter `__ALL__` out of returned `itemIds`.
5. `SelectionScreenResult` -- add `allSelected: boolean`.
6. `InteractiveResult` in `core/interactive.ts` -- add `allSelected: boolean`, `reviewMode: "all" | "mine" | "off"`, `crewAction: CrewAction | null` (the latter two with temporary defaults until H-WJ-3 populates them). Import `CrewAction` from `core/commands/crew.ts`.
7. Update `runTuiSelectionFlow()` in `core/interactive.ts` to map the expanded `SelectionScreenResult` to the expanded `InteractiveResult`.
8. Title the selection screen `Ninthwave` with dot separator: `"Ninthwave \u00b7 Select work items (N available)"`. (Note: the `\u00b7` middot renders fine in terminal output even though work item file content must be ASCII.)

**Test plan:**
- Add tests in `test/tui-widgets.test.ts` for linked toggle: toggle `__ALL__` off unchecks all, toggle `__ALL__` on checks all, uncheck one item unchecks `__ALL__`, re-check last item re-checks `__ALL__`, `"a"` key interacts with `__ALL__` correctly
- Update existing `runSelectionScreen` tests for the new `allSelected` field and the `__ALL__` sentinel in the item list (key sequences need an extra item at index 0)
- Verify `__ALL__` id is filtered from `itemIds` in the result
- Edge case: single work item + `__ALL__` (2 items total)

Acceptance: All items start checked with `__ALL__` at top. Linked toggle works in both directions. `allSelected` is true when `__ALL__` checked at confirmation. `__ALL__` id excluded from `itemIds`. All widget tests pass.

Key files: `core/tui-widgets.ts`, `core/interactive.ts`, `test/tui-widgets.test.ts`

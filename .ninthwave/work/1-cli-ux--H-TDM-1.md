# Refactor: Clean up detail modal description rendering (H-TDM-1)

**Priority:** High
**Source:** Approved plan 1775151223050-lucky-mountain.md
**Depends on:** None
**Domain:** cli-ux
**Lineage:** 9562c662-6e1d-44a7-87fa-67af0ed99f2f

Update the TUI detail modal so it stops rendering the duplicated summary block and shows the work-item description with its original paragraph structure preserved. Keep the description plain text, omit only the duplicated markdown title line plus the blank line immediately before `Priority:`, and reuse the existing height-aware viewport and keyboard scrolling behavior. Keep the change localized to the current renderer path unless a test proves the raw description body is not being passed through consistently.

**Test plan:**
- Update `test/status-render.test.ts` to verify `formatItemDetail(...)` no longer renders `Summary:` when `descriptionSnippet` is present.
- Add detail-overlay coverage for omitting the first markdown line, dropping only the blank line before `Priority:`, and preserving other blank lines in `descriptionBody`.
- Verify wrapped description lines still respect modal width and long content still shows the existing scroll indicators and footer hint.
- Adjust `test/orchestrate.test.ts` only if any assertions currently depend on the old detail modal copy.

Acceptance: The detail modal no longer shows a summary block. Description content preserves source blank lines except for the removed title line and the single blank line before `Priority:`. Long descriptions remain fully viewable via the existing responsive viewport and Up/Down scrolling. Relevant tests pass.

Key files: `core/status-render.ts`, `test/status-render.test.ts`, `test/orchestrate.test.ts`

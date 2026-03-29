# Feat: Add review, crew, text input steps and updated confirmation to selection screen (H-WJ-3)

**Priority:** High
**Source:** Plan: Streamline nw watch Interactive Journey
**Depends on:** H-WJ-1, H-WJ-2
**Domain:** cli-ux

Add three new steps to `runSelectionScreen()` after the WIP limit picker, plus update the confirmation screen to show all settings.

**Step 4 -- AI Reviews:** A `runSingleSelect` with three options:
- "All PRs" -- review work item PRs and external contributor PRs (maps to reviewMode: "all")
- "My PRs" -- review only ninthwave work item PRs (maps to reviewMode: "mine")
- "Off" -- no AI reviews (maps to reviewMode: "off")
Default based on `opts.defaultReviewMode` parameter. Title: `"Ninthwave \u00b7 AI reviews"`.

**Step 5 -- Crew Mode:** A `runSingleSelect` with three options:
- "Solo" -- run on this machine only (default)
- "Join crew" -- enter a code to collaborate
- "Create crew" -- start a new crew session
When "Join crew" is selected, show a text input for the crew code. Title: `"Ninthwave \u00b7 Collaboration"`.
Skip this step when `opts.showCrewStep === false` (for run-more re-entry). When skipped, set `crewAction: null`.

**New runTextInput widget:** A minimal raw-mode text input that captures printable characters, handles backspace, validates on Enter with a provided `validate` function, and returns the typed value or cancels on Esc. Title: `"Ninthwave \u00b7 Join crew"`. Show format hint: `"Format: XXX-XXX (e.g. xK2-9fB)"`. Validate with the crew code pattern from H-WJ-1.

**Updated confirmation:** Show all settings including:
- Items: "All (dynamic -- new items auto-included)" when allSelected, or individual item list
- Merge strategy, WIP limit
- AI reviews: All PRs / My PRs / Off
- Crew: Solo / Joining crew XXX-XXX / Creating new crew
Title: `"Ninthwave \u00b7 Start orchestration?"`.

Add `opts` parameter to `runSelectionScreen()`: `{ defaultReviewMode?: "all" | "mine" | "off"; showCrewStep?: boolean }`.
Add `reviewMode` and `crewAction` to `SelectionScreenResult`.
Import `CrewAction` from `core/commands/crew.ts`.

**Test plan:**
- Add tests for `runTextInput`: valid input accepted, invalid rejected with re-prompt, backspace works, Esc cancels, empty Enter shows error
- Add tests for AI review step: default selection based on opts, all three options produce correct reviewMode
- Add tests for crew step: solo returns null crewAction, join triggers text input and returns join action, create returns create action
- Add tests for `showCrewStep: false` skipping the crew step
- Update existing `runSelectionScreen` tests: key sequences need two additional steps (Enter for review default, Enter for crew default) before confirmation
- Test updated confirmation screen shows review and crew fields

Acceptance: Six-step TUI flow works end-to-end (items, merge, WIP, review, crew, confirm). Text input validates crew codes against `[A-Za-z0-9]{3}-[A-Za-z0-9]{3}`. Crew step skippable via opts. Confirmation screen shows all settings. All widget tests pass.

Key files: `core/tui-widgets.ts`, `test/tui-widgets.test.ts`

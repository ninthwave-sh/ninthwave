# Refactor: Simplify cmdNoArgs, add readline prompts, handle run-more, cleanup (H-WJ-4)

**Priority:** High
**Source:** Plan: Streamline nw watch Interactive Journey
**Depends on:** H-WJ-3
**Domain:** cli-ux

Wire the expanded interactive flow into the CLI entry points and clean up dead code.

**1. Simplify cmdNoArgs (`core/commands/onboard.ts`):**
- Remove the `promptMode` call and the orchestrate/launch branching (lines ~497-531).
- Replace with a single path: always call `runInteractiveFlow()`, always call `cmdWatch()`.
- When `result.allSelected`, add `--watch` to watchArgs (enables dynamic re-scanning of new items).
- Map `result.reviewMode`: "all" adds `--review-external`, "mine" adds nothing (default behavior), "off" adds `--review-wip-limit 0`.
- When `result.crewAction` is set, add `--crew <code>` or `--crew-create`.
- Remove `promptMode`, `promptItems`, `promptMergeStrategy`, `promptWipLimit`, `runSelected` from the `NoArgsDeps` interface.
- Remove the `displayItemsSummary` call before the interactive flow (the TUI selection screen shows items with full detail).
- Load project config via `loadConfig(projectRoot)` to determine review default. Pass to `runInteractiveFlow` via deps.

**2. Add readline prompt functions (`core/interactive.ts`):**
- `promptReviewMode(defaultMode, prompt)` -- "AI reviews [all/mine/off]:" with config-based default. Returns `"all" | "mine" | "off"`.
- `promptCrewMode(prompt)` -- "Crew [solo/join/create]:" with solo as default. If "join", prompt for crew code and validate. Returns `CrewAction | null`.
- Update `runReadlineFlow()` to call these after WIP limit and populate the expanded `InteractiveResult`.
- In `promptItems()`: when user types "all" or selects every item, set `allSelected: true` in the return path.
- Update `confirmSummary()` to display reviewMode and crewAction.
- Add `showCrewStep` option to `InteractiveDeps`, pass through to both TUI and readline flows.

**3. Handle run-more re-entry (`core/commands/orchestrate.ts`):**
- When `run-more` re-enters `runInteractiveFlow`, pass `showCrewStep: false` (crew is session-scoped).
- Read `reviewMode` from the re-entry result and update the loop config accordingly.

**4. Clean up dead code:**
- Remove `Mode` type and `promptMode()` export from `core/interactive.ts`.
- Remove `promptMode` import from `core/commands/onboard.ts`.

**Test plan:**
- Update `test/onboard.test.ts`: remove "launch subset" test paths, remove `promptMode` from deps, add tests verifying `--watch` is passed when `allSelected: true`, `--review-external` when reviewMode is "all", `--review-wip-limit 0` when reviewMode is "off", `--crew`/`--crew-create` for crew actions
- Update `test/interactive.test.ts`: remove `promptMode` tests, update `runInteractiveFlow` tests for new result shape, add tests for `promptReviewMode` and `promptCrewMode`, test `confirmSummary` with new fields
- Verify run-more path passes `showCrewStep: false`

Acceptance: `nw` (no args) goes directly to TUI selection without mode prompt. `--watch` passed when all selected. Review and crew args correctly wired. Legacy readline flow works with new prompts. Run-more skips crew step. All removed code is truly unused. `bun test test/` passes.

Key files: `core/commands/onboard.ts`, `core/interactive.ts`, `core/commands/orchestrate.ts`, `test/onboard.test.ts`, `test/interactive.test.ts`

---
name: work
description: |
  Batch-process work items through parallel AI coding sessions.
  Interactively select items, then delegate execution to `ninthwave orchestrate`.
  Use when asked to "process work items", "batch work", "run work", or "start work".
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - AskUserQuestion
user_invocable: true
---

## Interactive Questions (CRITICAL)

This skill is highly interactive. You MUST use your interactive question tool to ask the user questions -- do NOT simply print a question as text and wait for a response.

**Tool names by platform:** `AskUserQuestion` (Claude Code), `question` (OpenCode), `request_user_input` (Codex), `ask_user` (Copilot CLI, Gemini CLI). Use whichever is available in your environment.

**Every question must follow this structure:**

1. **Re-ground:** State the project, the current branch, and what phase you're in. Assume the user hasn't looked at this window in 20 minutes.
2. **Explain simply:** Describe the situation in plain English. Say what it does, not what it's called.
3. **Recommend:** State which option you'd pick and why. Include a one-line reason.
4. **Options:** Lettered options: A), B), C). When an option involves effort, indicate the scale.

---

## Instructions

This skill orchestrates batch processing of engineering TODOs in two phases: interactive selection, then delegating to the `ninthwave orchestrate` daemon which handles launching workers, polling CI, merging PRs, and cleanup automatically.

> **CLI shortcut:** You can skip the interactive selection and run the orchestrator directly from any terminal:
> ```
> ninthwave orchestrate --items ID1,ID2 --merge-strategy asap --wip-limit 4
> ```
> Run `ninthwave orchestrate --help` for all options. No AI tool session required.

---

### Phase 1: SELECT

**Goal:** Help the user choose which TODO items to work on and how.

1. Run `.ninthwave/work list --ready` to get all available items.
2. Parse the output and present a summary table to the user showing: ID, priority, domain, title, and estimated complexity. Items with a `Repo:` field will indicate which target repo they belong to.

3. AskUserQuestion -- "How do you want to select items?"
   - Detect if any feature-code IDs exist (IDs with alphabetic characters like `BF5`, `UO`, `ST`).
   - Options:
     - A) By feature code -- select all items for a specific feature (only if feature IDs detected)
     - B) By priority level -- filter by critical/high/medium/low
     - C) By domain -- filter by domain area
     - D) All ready (N items total) -- process everything available

   **If user picks A (feature code):**
   - List the distinct feature codes found.
   - AskUserQuestion to pick a feature code.
   - Run `.ninthwave/work list --feature <code>`.

   **If user picks B (priority):**
   - AskUserQuestion -- "Which priority level?"
   - Filter items by chosen priority.

   **If user picks C (domain):**
   - AskUserQuestion -- "Which domain?"
   - Filter items by chosen domain.

4. **Dependency analysis:** Run `.ninthwave/work batch-order <selected-IDs>` to check for dependency chains.

   - **If all items are in Batch 1** (no dependencies): proceed to conflict check.
   - **If items span multiple batches**: present the batch plan. The orchestrator handles dependency ordering automatically — all selected items can be passed together.

5. Run `.ninthwave/work conflicts <batch-IDs>` to check for file overlaps.

6. Present the conflict analysis. If conflicts, suggest splitting into sub-batches or lowering the WIP limit.

7. AskUserQuestion -- "Start this batch?"
   - Options:
     - A) Start these N items -- launch the orchestrator now
     - B) Remove conflicting items -- run only non-overlapping subset
     - C) Pick manually -- let me choose specific items by ID
     - D) Cancel -- go back to selection

8. **Merge strategy:**

   AskUserQuestion -- "How should PRs be merged?"
   - A) Auto-merge once approved -- merge after approval + CI passes
   - B) Auto-merge ASAP -- merge as soon as CI passes, skip approval wait
   - C) Ask me before merging -- confirm each merge individually

   Store MERGE_STRATEGY as: `approved` | `asap` | `ask`

9. **WIP limit** (only when total items >= 4):

   AskUserQuestion -- "What WIP limit? (default: 4)"
   - A) Default (4) -- up to 4 workers in parallel
   - B) Custom -- let me specify a number

   Store WIP_LIMIT (default 4).

---

### Phase 2: ORCHESTRATE

**Goal:** Launch the `ninthwave orchestrate` daemon and monitor its output.

1. Build the orchestrate command from the user's selections:

   ```bash
   ninthwave orchestrate \
     --items <comma-separated-IDs> \
     --merge-strategy <MERGE_STRATEGY> \
     --wip-limit <WIP_LIMIT>
   ```

2. Run the command. The orchestrator handles the full lifecycle automatically:
   - **Queued** items wait for dependencies to clear
   - **Ready** items get launched as worker sessions (up to the WIP limit)
   - **Implementing** workers are monitored for completion
   - **CI-pending/CI-passed** PRs are tracked through CI
   - **Merging** PRs are squash-merged, worktrees cleaned, and items marked done
   - Adaptive polling adjusts check frequency based on current state
   - Crash recovery reconstructs state from disk and GitHub on restart

3. The orchestrator emits structured JSON log lines. Monitor the output for:
   - `transition` events — items moving between states
   - `action_execute` / `action_result` — launches, merges, cleanups
   - `orchestrate_complete` — all items reached terminal state

4. **When the orchestrator exits**, summarize results:
   - How many items completed successfully (done)
   - How many items got stuck (stuck) and why
   - Any errors or warnings from the log output

5. If items remain stuck, AskUserQuestion:
   - A) Retry stuck items -- re-run orchestrate with just those IDs
   - B) Investigate -- look at the stuck PRs/branches manually
   - C) Done -- accept the results as-is

---

## Orchestrator-Worker Communication

**Operational messages:** Use `cmux send` to push text into worker sessions.

```bash
cmux send --workspace <workspace-ref> "message"
cmux send-key --workspace <workspace-ref> enter
```

**PR comments (audit trail):** Prefix with `**[Orchestrator]**`.

Workers prefix with `**[Worker: TODO-ID]**`.

## Important Rules

- **Script dependency:** `.ninthwave/work` must exist and be executable
- **Branch safety:** All implementation on `todo/*` branches, never directly on main
- **No silent failures:** Report errors and ask how to proceed
- **External merges:** Detect and handle gracefully
- **Orchestrator handles lifecycle:** Do not manually merge PRs, clean worktrees, or mark items done — the orchestrator does this automatically

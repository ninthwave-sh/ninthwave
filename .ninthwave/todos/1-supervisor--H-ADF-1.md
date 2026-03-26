# Feat: Auto-decompose supervisor friction into TODO files (H-ADF-1)

**Priority:** High
**Source:** VISION.md — "next priority" in section D (LLM Supervisor)
**Depends on:**
**Domain:** supervisor

## Context

The supervisor already generates structured friction observations and process improvements during orchestration ticks (`writeFrictionLog` in `core/supervisor.ts`). These are written to `.ninthwave/friction/` as markdown files. Currently, a human must review these entries during the `/work` delivery loop and manually run `/decompose` to create actionable TODOs. This breaks the autonomous improvement loop.

Close the loop: when the supervisor detects actionable friction, automatically generate TODO files in `.ninthwave/todos/`. The supervisor LLM already has context about the codebase and pipeline — extend its prompt to output structured TODO definitions alongside friction observations.

## Requirements

1. Add a new field `todoDecompositions` to `SupervisorObservation` — an array of structured TODO definitions (id prefix, priority, title, domain, description, acceptance criteria, key files).
2. Extend `buildSupervisorPrompt` to include instructions for the LLM to output `todoDecompositions` when friction is actionable. Include the standard TODO format as a reference. Only decompose when friction is concrete and fixable — not for vague observations.
3. Add a `writeTodoFiles` function that takes the structured TODO definitions and writes them to `.ninthwave/todos/` following the standard naming convention (`{priority_number}-{domain}--{ID}.md`). Generate unique IDs using a `SUP-` prefix (supervisor-generated).
4. Call `writeTodoFiles` from the `supervisorTick` return path, after `writeFrictionLog`.
5. Mark friction entries as "decomposed" when corresponding TODOs are created (add a `decomposed: true` flag or annotation to the friction file).
6. Log a structured event when TODOs are auto-created.
7. Add a `--no-auto-decompose` flag to disable this behavior (opt-out, not opt-in — auto-decompose is on by default when supervisor is active).

Acceptance: Supervisor friction observations that are actionable are automatically decomposed into TODO files in `.ninthwave/todos/`. New TODOs follow the standard format with `SUP-` prefixed IDs. A structured log event records each auto-created TODO. The `--no-auto-decompose` flag disables the behavior. Existing friction-only observations (non-actionable) continue to be written without TODO generation.

**Test plan:**
- Unit test: `parseSupervisorResponse` correctly parses the new `todoDecompositions` field
- Unit test: `writeTodoFiles` creates correctly formatted TODO files with proper naming convention
- Unit test: `writeTodoFiles` generates unique IDs that don't collide with existing TODOs
- Unit test: supervisor tick with actionable friction creates both friction file and TODO file
- Unit test: supervisor tick with non-actionable friction creates friction file only (no TODO)
- Unit test: `--no-auto-decompose` flag prevents TODO creation
- Edge case: malformed LLM response for todoDecompositions is handled gracefully (empty array fallback)

Key files: `core/supervisor.ts`, `core/commands/orchestrate.ts`, `core/types.ts`

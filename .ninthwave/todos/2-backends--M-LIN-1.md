# Feat: Linear task backend adapter (M-LIN-1)

**Priority:** Medium
**Source:** VISION.md — section E (Expand the Surface Area)
**Depends on:**
**Domain:** backends

## Context

ninthwave has four external task backend adapters: GitHub Issues, ClickUp, Sentry, and PagerDuty. Linear is the most common project management tool among the target audience (small engineering teams using AI coding tools) and is the most requested remaining adapter.

Implement a Linear adapter following the same `TaskBackend` + `StatusSync` interfaces used by the other adapters. Linear uses a GraphQL API with API key authentication.

## Requirements

1. Create `core/backends/linear.ts` implementing `TaskBackend` (list, read, markDone) and `StatusSync` (addStatusLabel, removeStatusLabel).
2. Use Linear's GraphQL API via `fetch` (no SDK dependency). API key from `LINEAR_API_KEY` environment variable or `.ninthwave/config` `linear_api_key` field.
3. Map Linear issues to `TodoItem` shape: issue identifier → ID (with `LIN-` prefix), priority labels → Priority, team name → domain, project → feature grouping.
4. `list()`: Query issues assigned to the authenticated user (or a configured team) with a configurable filter (e.g., `status: { name: { in: ["Todo", "In Progress"] } }`). Support filtering by Linear project or label via config.
5. `read(id)`: Fetch a single issue by its Linear identifier.
6. `markDone(id)`: Transition the issue to a "Done" state in Linear.
7. `addStatusLabel` / `removeStatusLabel`: Add/remove labels on the Linear issue for orchestrator status sync (e.g., `ninthwave:in-progress`, `ninthwave:pr-open`).
8. Register the backend in `core/backends/registry.ts` so `ninthwave list --backend linear` and `ninthwave init` discover it.
9. Add Linear detection to `ninthwave init` — check for `LINEAR_API_KEY` env var and offer to enable the Linear backend.

Acceptance: `ninthwave list --backend linear` lists Linear issues as work items. `ninthwave init` detects Linear API key and offers to configure the backend. The adapter implements `TaskBackend` and `StatusSync` interfaces. Issues are mapped to `TodoItem` shape with `LIN-` prefixed IDs.

**Test plan:**
- Unit test: `issueToTodoItem` maps Linear GraphQL response to `TodoItem` correctly (priority, domain, dependencies)
- Unit test: `list()` constructs correct GraphQL query with filters
- Unit test: `markDone()` sends correct mutation
- Unit test: `addStatusLabel` / `removeStatusLabel` are idempotent
- Unit test: graceful handling of auth failures (missing/invalid API key)
- Unit test: backend registration in registry makes it discoverable
- Edge case: Linear issues with no priority label default to "medium"
- Edge case: Linear issues with no team default to "uncategorized" domain

Key files: `core/backends/linear.ts` (new), `core/backends/registry.ts`, `core/commands/init.ts`, `core/commands/list.ts`

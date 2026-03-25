# Feat: Bootstrap support for cross-repo TODOs targeting non-existent repos (H-ORC-9)

**Priority:** High
**Source:** Dogfooding friction (2026-03-25): repo-bootstrap
**Depends on:** M-ORC-8
**Domain:** orchestrator

When a TODO has `Repo: X` and repo X does not exist locally, the orchestrator fails with "Repo not found" and the item goes to stuck. This blocks the entire dependency chain. The chicken-and-egg problem: the TODO's job may be to create or scaffold the repo, but the worker cannot launch because the repo directory must exist first.

Add bootstrap support:
1. When launching a worker for a cross-repo TODO and the target repo directory does not exist, check if a GitHub remote exists for it (via `gh repo view`).
2. If the remote exists: clone it locally to the expected sibling directory before launching the worker.
3. If neither local nor remote exists: create the directory, run `git init`, create initial commit, and create the GitHub repo (via `gh repo create`). Then launch the worker in the hub repo's worktree with the target repo available.
4. Add a `bootstrap: true` field to TODO format that signals the orchestrator should run bootstrap logic before worker launch.
5. Display "bootstrapping" in status output during the bootstrap phase.

The worker still runs in the target repo's worktree after bootstrap. The orchestrator only handles the initial repo creation — the worker handles scaffolding (README, CI config, etc.).

**Test plan:**
- TODO with `Repo: new-repo` and `bootstrap: true`: orchestrator creates the repo before launching worker
- TODO with `Repo: existing-repo`: no bootstrap needed, existing behavior preserved
- Remote exists but no local clone: orchestrator clones the repo
- Neither remote nor local exists: orchestrator creates both
- Bootstrap failure (network error, auth failure): item goes to stuck with descriptive failure reason
- `bootstrap: true` without `Repo:` field: ignored (hub-local items don't need bootstrap)
- Items depending on a bootstrap item wait until bootstrap + worker complete

Acceptance: Cross-repo TODOs targeting non-existent repos are bootstrapped automatically when `bootstrap: true` is set. Clone-from-remote and create-new-repo paths both work. Failures are surfaced with descriptive reasons. Existing cross-repo behavior unchanged for existing repos.

Key files: `core/orchestrator.ts`, `core/cross-repo.ts`, `core/parser.ts`, `core/types.ts`

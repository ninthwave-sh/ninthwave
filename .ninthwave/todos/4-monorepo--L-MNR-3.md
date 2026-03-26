# Feat: Cross-package dependency ordering in decompose and status (L-MNR-3)

**Priority:** Low
**Source:** Phase E vision — monorepo support, part 3 of 3. Polish item after H-MNR-1 and M-MNR-2 ship.
**Depends on:** M-MNR-2
**Domain:** monorepo

## Context

With workspace detection (H-MNR-1) and workspace-scoped test commands (M-MNR-2) shipped, the final monorepo gap is dependency ordering. In a monorepo, if item A modifies `packages/api/` and item B modifies `packages/web/` and `packages/web/` depends on `packages/api/`, then B should wait for A. Without this, items touching dependent packages can create type errors when run in parallel.

This item adds:
1. Package dependency graph inference from `package.json` `dependencies`/`devDependencies`
2. Automatic dependency injection when `/decompose` creates items spanning dependent packages
3. Visual package affinity indicator in `ninthwave status` output

## Requirements

1. Add `inferPackageDeps(workspaceConfig: WorkspaceConfig): Map<string, string[]>`:
   - For each package in the workspace, read its `package.json`
   - For each `dependencies`/`devDependencies` entry, check if it matches another workspace package name
   - Return a map of `packagePath → [dependentPackagePaths]`
2. In the `/decompose` skill (`skills/decompose/SKILL.md`), add a step: when workspace config is present, after generating TODO items, check if any pair of items (A, B) has A's packages depending on B's packages. If so, add A to B's `Depends on:` line.
   - This is a documentation step (update the SKILL.md prompt instruction), not TypeScript code.
3. In `core/commands/status.ts`, when workspace config is present, add a package affinity badge next to each item ID: `[api]`, `[web]`, etc. — inferred by `inferPackageForItem()` from M-MNR-2. When an item spans multiple packages, show `[multi]`.
4. Add `inferPackageDeps` to `core/types.ts` as a utility export so it's reusable.

Acceptance: Running `ninthwave status` in a monorepo with workspace config shows `[package-name]` badges next to item IDs. When a TODO item's files span a dependent package relationship, `/decompose` instructions prompt the LLM to add a dependency. `inferPackageDeps` unit tests pass. Single-repo projects show no badges.

**Test plan:**
- Unit test: `inferPackageDeps` returns correct dependency map for a fixture workspace
- Unit test: package with no internal deps returns empty dependency list
- Unit test: circular package deps (A→B→A) handled without infinite loop
- Unit test: status output includes `[package]` badge when workspace config is present
- Unit test: item spanning multiple packages shows `[multi]`
- Unit test: single-repo (no workspace config) shows no badges
- Edge case: workspace package with no `package.json` — skip silently
- Edge case: dependency version range includes workspace package name — correctly detected

Key files: `core/commands/status.ts`, `core/types.ts`, `skills/decompose/SKILL.md`, `test/status.test.ts`

# Feat: Monorepo workspace detection in `ninthwave init` (H-MNR-1)

**Priority:** High
**Source:** Phase E vision — expand surface area. Monorepo workspace support is the top remaining gap for real-world enterprise codebases.
**Depends on:**
**Domain:** monorepo

## Context

Most production codebases are monorepos managed by pnpm, yarn, turborepo, or npm workspaces. `ninthwave init` currently asks for a single project-wide test command. In a monorepo, the right test command depends on which package is being modified — running the full suite for every item is slow and doesn't catch package-specific issues.

This item adds workspace detection to `ninthwave init`: it detects the workspace tool, enumerates packages, and stores the workspace configuration in `.ninthwave/config.json` so workers can receive the right test command for their package.

## Requirements

1. Add workspace detection to `cmdInit()` (or its `detectProjectConfig()` helper):
   - **pnpm:** detect `pnpm-workspace.yaml`, read `packages` globs, enumerate matching directories
   - **yarn:** detect `package.json` with `workspaces` field, enumerate packages
   - **turborepo:** detect `turbo.json` or `turbo` field in `package.json`, use package enumeration from yarn/pnpm
   - **npm workspaces:** detect `package.json` with `workspaces` field (same as yarn)
2. For each detected workspace package, read its `package.json` and extract available test scripts (`test`, `test:unit`, `test:ci`). Prefer `test:ci` > `test` > first match.
3. Add `workspace` section to `.ninthwave/config.json`:
   ```json
   {
     "workspace": {
       "tool": "pnpm",
       "root": ".",
       "packages": [
         { "name": "api", "path": "packages/api", "testCmd": "pnpm test --filter api" },
         { "name": "web", "path": "packages/web", "testCmd": "pnpm test --filter web" }
       ]
     }
   }
   ```
4. During interactive onboarding (`cmdOnboard()`), when a workspace is detected, show the detected packages and ask the user to confirm or edit the test command template.
5. When no workspace is detected, skip silently — existing single-repo behavior is unchanged.
6. The workspace config is optional in all downstream consumers: if absent, fall back to `testCmd` from the top-level config.

Acceptance: Running `ninthwave init` in a pnpm monorepo detects workspace packages and writes a `workspace` section to `.ninthwave/config.json`. Running `ninthwave init` in a single-package repo behaves identically to today. The config section is emitted correctly for yarn workspaces and turborepo too.

**Test plan:**
- Unit test: `detectWorkspace()` returns null for single-package repo
- Unit test: `detectWorkspace()` detects pnpm-workspace.yaml, enumerates packages
- Unit test: `detectWorkspace()` detects yarn workspaces in package.json
- Unit test: `detectWorkspace()` detects turborepo via turbo.json
- Unit test: package test command preference order (test:ci > test > first script)
- Unit test: config serialization round-trips correctly
- Edge case: nested monorepo (workspace packages that are themselves workspaces) — detect only first level
- Edge case: workspace globs with no matches — emit warning, continue

Key files: `core/commands/init.ts`, `core/commands/onboard.ts`, `core/types.ts`, `test/init.test.ts`

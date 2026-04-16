# Refactor: Extract ensureProjectId() from identity generator (H-BS-1)

**Priority:** High
**Source:** Broker Secret & Crew Connection UX Redesign plan
**Depends on:** None
**Domain:** broker-auth
**Lineage:** 21798356-67a2-4c43-8a35-639ed7ca2706

Add a narrower `ensureProjectId(projectRoot)` function to `core/config.ts` that only
backfills `project_id` into `.ninthwave/config.json` without touching `broker_secret`.
Update `ensureProjectIdentity()` in `core/cli.ts` to call this new function instead of
`loadOrGenerateProjectIdentity()`. This stops the CLI from silently auto-generating a
unique broker secret on every command, which causes divergent secrets across team members.

`loadOrGenerateProjectIdentity()` remains unchanged for callers that explicitly want both
fields (e.g., init when the user opts in to crew mode).

**Test plan:**
- Add unit test for `ensureProjectId()`: given a config.json with no project_id, it generates one; given an existing project_id, it no-ops
- Add unit test proving `ensureProjectId()` never writes broker_secret to config.local.json
- Update `test/config-local-secret.test.ts` generation test (lines 110-134): the "generation scenario" test may need adjusting since the CLI entrypoint no longer auto-generates secrets
- Verify existing `loadOrGenerateProjectIdentity()` tests still pass unchanged

Acceptance: `ensureProjectId()` is exported from `core/config.ts`. All 3 `ensureProjectIdentity()` callsites in `cli.ts` (lines 47, 85, 107) use the narrower function. Running any `nw` command on a project with no `config.local.json` does NOT create one. Running `nw` on a project with no `project_id` generates one in `config.json`. All existing tests pass.

Key files: `core/config.ts:113-167`, `core/cli.ts:22-29`, `test/config-local-secret.test.ts`

# Feat: Support custom GitHub identity for daemon and workers (L-ORC-3)

**Priority:** Low
**Source:** Dogfooding friction (2026-03-25): github-identity-override
**Depends on:** -
**Domain:** orchestrator

No way to specify a different GitHub identity for the daemon or workers. Currently uses whatever `gh` auth is configured globally. In team environments or CI, the orchestrator should act as a bot account (GitHub App) while workers may use different credentials. Also useful for orgs that require fine-grained PATs.

Add GitHub identity configuration:
1. Add `NINTHWAVE_GITHUB_TOKEN` env var support. When set, pass it as `GH_TOKEN` to all `gh` CLI invocations (daemon and workers).
2. Add `github_token` config key in `.ninthwave/config.toml` as an alternative to the env var.
3. Env var takes precedence over config file.
4. Workers inherit the token via environment when launched.
5. `ninthwave doctor` should verify the configured identity has required scopes (repo, read:org).

GitHub App authentication (private key + installation ID) is out of scope for this TODO — it can be a follow-up.

**Test plan:**
- With `NINTHWAVE_GITHUB_TOKEN` set, `gh` commands use the custom token
- Config file `github_token` is used when env var is not set
- Env var takes precedence over config file
- Workers receive the token in their environment
- `ninthwave doctor` validates token scopes
- Without any custom token, existing `gh auth` behavior is preserved (no regression)

Acceptance: Custom GitHub token can be configured via env var or config file. Workers inherit the identity. Doctor validates scopes. Default behavior unchanged when no custom token is set.

Key files: `core/config.ts`, `core/commands/start.ts`, `core/commands/doctor.ts`, `core/gh.ts`

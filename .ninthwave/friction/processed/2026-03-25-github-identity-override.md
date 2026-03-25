# Support custom GitHub identity (PAT or GitHub App) for daemon/workers

**Observed:** No way to specify a different GitHub identity for the daemon or workers. Currently uses whatever `gh` auth is configured globally.

**Impact:** In team environments or CI, you may want the orchestrator to act as a bot account (GitHub App) while workers use different credentials. Also useful for orgs that require fine-grained PATs.

**Suggestion:** Add configuration for GitHub identity override:
- `--github-token <PAT>` flag or `NINTHWAVE_GITHUB_TOKEN` env var
- `--github-app-key <path>` for GitHub App private key authentication
- Option to set different identities for daemon vs workers
- Support in `.ninthwave/config.toml` for persistent configuration

# TODOS

<!-- Format guide: core/docs/todos-format.md -->

## Engineering Review (eng review, 2026-03-23)

### Test: Unit tests for parser and key functions (H-ER-1)

**Priority:** High
**Source:** Eng review 2026-03-23
**Depends on:** None

Add unit tests for the TODOS.md parser and key batch-todos.sh functions using bats-core or plain bash assertions with fixture files. The parser is the foundation everything else depends on and currently has zero test coverage. Cover: parse_todos with various TODOS.md fixtures (valid, malformed, empty), batch-order topological sort (including circular dependency detection), mark-done item removal (single, multiple, empty section cleanup), and version-bump LOC threshold logic.

Acceptance: Tests exist in a `test/` directory. Parser correctly handles well-formed input, malformed input (missing ID, missing priority), and empty files. Batch-order detects circular dependencies. Mark-done removes items and cleans empty sections. All tests pass via a single command (e.g., `bats test/`).

Key files: `core/batch-todos.sh`, `test/`

---

## Identity Pivot (CEO review, 2026-03-23)

### Refactor: Rename project to ninthwave (H-IP-1)

**Priority:** High
**Source:** CEO review 2026-03-23
**Depends on:** None

Rename the project from "workflow-kit" to "ninthwave" across all surfaces. This is a one-way door — the name establishes the project's identity in a crowded competitive space (ComposioHQ, dmux, Superset, Conductor, etc.). Owned domains: ninthwave.dev, ninthwave.io.

Rename surface: GitHub repo name (set up redirect from old name), `.workflow-kit/` config directory to `.ninthwave/`, all references in `core/batch-todos.sh` (config path at line 48), `install.sh` (paths and output text), `remote-install.sh` (repo URL), all SKILL.md files (script path references), `CONTRIBUTING.md`, and `README.md`. Worker agent files (`.claude/agents/`, `.opencode/agents/`, `.github/agents/`) reference skill names not the project name, so minimal changes there.

Acceptance: GitHub repo is renamed with redirect active. `.workflow-kit/` is `.ninthwave/` everywhere. `install.sh` and `remote-install.sh` reference the new repo name. All SKILL.md files reference correct paths. `batch-todos.sh` loads config from `.ninthwave/config`. No broken references remain (grep for "workflow-kit" returns zero hits outside of git history).

Key files: `install.sh`, `remote-install.sh`, `core/batch-todos.sh`, `skills/work/SKILL.md`, `skills/decompose/SKILL.md`, `CONTRIBUTING.md`, `README.md`

---

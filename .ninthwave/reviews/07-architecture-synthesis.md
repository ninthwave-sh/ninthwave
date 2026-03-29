# Review 7: Architecture Synthesis & Simplification Roadmap

## Executive Summary

The ninthwave codebase totals **27,210 LOC** of production TypeScript across 48 modules, with **60,126 LOC** of tests across 82 test files (2.2:1 test ratio). Reviews 1-6 examined every production module and surfaced **73 findings** across types, state machine, worker management, git/GitHub integration, daemon infrastructure, and test quality.

**Overall assessment: The core orchestration pipeline is well-designed and sound.** The pure/impure split between `Orchestrator` (state machine) and `orchestrate.ts` (event loop) faithfully implements the "deterministic core, advisory AI" ethos. Dependency injection is pervasive. The state machine is exhaustively tested for 11 of 19 states. The architecture supports the thesis -- decomposition into human-reviewable units plus parallel execution -- and delivers it.

**The primary problem is scope creep, not design flaws.** Two features with zero production users (crew mode: 1,346 LOC, scheduling: 1,251 LOC) account for 9.5% of production code. The TUI has grown beyond minimum viable (1,100 LOC with detail panels, help overlays, and merge strategy cycling). The monolith `orchestrate.ts` (3,890 LOC) has accumulated 7 orthogonal concerns. Together, these represent **~3,900 LOC of removable or simplifiable code** -- a 14% reduction with zero user impact.

**The secondary concern is correctness gaps in edge cases.** Non-atomic state file writes (crash corruption risk), GitHub API errors silently returning empty results (stall during outages), stale `lastCommitTime` on worker retry (premature timeout), and `handleMerging` ignoring manually-closed PRs (infinite hang). These are design-level issues, not bugs in normal operation, but each creates a failure mode that's hard to diagnose.

**Key themes across all 6 reviews:**

1. **Dead features:** Crew mode and scheduling are complete, tested, and unused. Strip them.
2. **Error handling inconsistency:** `git.ts` throws, `gh.ts` returns empty, `mux.ts` returns booleans, `daemon.ts` catches and swallows. A coherent strategy is missing.
3. **State serialization gaps:** 3 critical fields (`workspaceRef`, `partition`, `resolvedRepoRoot`) are not persisted, meaning daemon crashes lose worker management capability.
4. **File size accumulation:** Two files (`orchestrate.ts`: 3,890 LOC, `orchestrator.ts`: 2,674 LOC) account for 24% of all production code. Both have natural decomposition boundaries.
5. **Test infrastructure debt:** 5 test files use `vi.mock` against the project's own convention, creating cross-file leak risk.

## Architecture Assessment

### 1. Abstraction Quality

**Orchestrator (pure) vs execution layer (side-effectful): Clean boundary.**

The `Orchestrator` class (`core/orchestrator.ts`, 2,674 LOC) is a pure state machine: `processTransitions()` takes a `PollSnapshot` and returns `Action[]`. No network calls, no file I/O, no shell spawns. All side effects live in the execution layer (`orchestrate.ts`), which calls `executeAction()` with injected `OrchestratorDeps`. This is the codebase's strongest architectural decision.

One leak: `setState()` (public method) bypasses `transition()`'s flag management -- it directly sets `item.state` without resetting `rebaseRequested`, `reviewCompleted`, `ciFailureNotified`, or emitting telemetry. This is used for state hydration on restart but could be misused for runtime transitions. Renaming it to `hydrateState()` would close the semantic gap. (Review 2, Finding 14)

**Multiplexer interface vs cmux implementation: Justified but over-engineered.**

The `Multiplexer` interface (10 methods) has exactly one implementation: `CmuxAdapter`, a 1:1 passthrough to `cmux.ts`. The interface provides testability (mock implementations) and future extensibility (ETHOS.md principle #6). The adapter pattern is standard but the detection chain (`detectMuxType()`, `ensureMuxOrAutoLaunch()`) adds 100+ LOC for a single-variant discriminated union. Simplifying detection (hardcode cmux) would save ~40 LOC without breaking the interface contract. (Review 3, Finding 9)

**OrchestratorDeps injection seam: Clean and well-used.**

The `OrchestratorDeps` interface injects all external operations (git, GitHub, mux, filesystem). This enables the entire state machine test suite to run without real side effects. 25+ dep functions are individually mockable. The only gap is that some modules called from the execution layer (`launch.ts`, `clean.ts`) take `Multiplexer` directly rather than going through `OrchestratorDeps`, creating a second injection seam. (Review 3, Theme B)

### 2. Dependency Injection Consistency

DI is the codebase's primary testability strategy, used in:

| Module | DI Pattern | Interface |
|--------|-----------|-----------|
| `orchestrator.ts` | Constructor injection | `OrchestratorDeps` (25+ functions) |
| `daemon.ts` | Parameter injection | `DaemonIO` (read/write/rename/etc.) |
| `reconcile.ts` | Parameter injection | `ReconcileDeps` (20+ functions) |
| `pr-monitor.ts` | Direct function calls | **No DI** -- calls `gh.*` directly |
| `launch.ts` | Partial injection | `Multiplexer` param, but calls `git.*` directly |
| `clean.ts` | Partial injection | `Multiplexer` param, but calls `git.*` directly |
| `send-message.ts` | Partial injection | `Runner` param for shell, but `mux` from import |
| `worker-health.ts` | Parameter injection | `Multiplexer` param |
| `shell.ts` | No injection needed | Leaf module, wraps `Bun.spawn` |

**Inconsistency:** `pr-monitor.ts` (675 LOC) calls `gh.prList()`, `gh.prView()`, `gh.prChecks()` directly with no injection seam. This forces test files to use `vi.mock("../core/gh.ts")`, which leaks across test files (Review 6, Finding 1). Similarly, `launch.ts` and `clean.ts` call `git.ts` functions directly, requiring `vi.mock("../core/git.ts")`.

**Proposed consistent pattern:** Every module that calls external operations should accept an optional deps parameter with sensible defaults:

```typescript
interface GitDeps { branchExists: typeof branchExists; deleteBranch: typeof deleteBranch; ... }
const defaultGitDeps: GitDeps = { branchExists, deleteBranch, ... };
export function cleanSingleWorktree(id, ..., deps: GitDeps = defaultGitDeps) { ... }
```

This matches the existing `OrchestratorDeps` pattern and eliminates all `vi.mock` usage. Estimated effort: ~155 LOC of interface additions across 4 modules. (Review 6, Finding 1)

### 3. Error Handling Philosophy

The codebase mixes four error handling strategies with no documented policy:

| Strategy | Where Used | Risk |
|----------|-----------|------|
| **Throw** | `git.ts` (all functions), `gh.ts` (`apiGet`, `getRepoOwner`) | Callers must know to catch. Unhandled throw crashes the daemon poll loop. |
| **Return empty/false/null** | `gh.ts` (`prList`, `prView`, `prChecks`), `mux.ts` (`sendMessage`, `closeWorkspace`) | Callers can't distinguish "no data" from "API failed." Stall during outages. |
| **Silent swallow** | Many `catch { /* non-fatal */ }` blocks in `orchestrate.ts`, `clean.ts` | Errors disappear silently. Hard to diagnose intermittent failures. |
| **Structured result** | Not used in production code (proposed in Review 4) | Would make error paths explicit at every call site. |

**The most dangerous pattern:** `gh.ts` returning `[]` on API failure (Review 4, Finding 1). During a GitHub outage, every CI-pending item gets `ciStatus: "unknown"`, the orchestrator holds all items in `ci-pending` indefinitely, and there's no log entry indicating an API failure occurred. The system silently stalls.

**Recommended strategy:** Adopt result types for the GitHub layer:

```typescript
type GhResult<T> = { ok: true; data: T } | { ok: false; error: string };
```

This surfaces the "API failed" case to callers, enabling the orchestrator to detect outages and hold state rather than misinterpreting empty results. The git layer (throw on failure) is fine -- git operations are local and fast-failing is appropriate. The mux layer (boolean returns) is fine -- the caller only needs success/failure. (Review 4, Finding 1; Review 4, Finding 8)

### 4. Security Surface

**Shell injection: Not a risk.** All shell commands use `Bun.spawnSync` / `Bun.spawn` with argument arrays (not `shell: true`). The `run()` function in `shell.ts` passes arguments directly to the executable. User-controlled values in arguments are passed as literal strings, not interpreted by a shell. (Review 4, Finding 3)

**Path traversal: Medium risk in cross-repo.** The `alias` field from work item files is used in `path.join(parentDir, alias)` without validation. A malicious `Repo: ../../../etc` could resolve outside the project directory. `isGitRepo()` catches most cases (non-git directories), but `bootstrapRepo` could `mkdirSync` and `git init` in unexpected locations. Fix: validate alias against `/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/`. ~10 LOC. (Review 4, Finding 3)

**GitHub token handling: Adequate.** `resolveGithubToken()` in `gh.ts` reads from `GITHUB_TOKEN` env var or project config. The token is passed to `gh` CLI via `GH_TOKEN` env var, never logged or serialized. The `applyGithubToken()` function sets the env var for child processes. No credential leaks found.

**Workspace message delivery: Low risk.** Messages are sent via cmux paste-buffer or keystroke injection. The content is work item instructions and CI feedback -- no secrets. The paste-buffer approach doesn't go through a shell, so no injection risk.

### 5. Performance Characteristics

**Poll loop cost:** The daemon polls every 2-10 seconds (adaptive). Each cycle:

1. `buildSnapshotAsync`: N GitHub API calls (1 `prList` + 1 `prView` + 1 `prChecks` per item). At 5 items, that's 15 sequential `gh` CLI calls × 1-3 seconds each = **5-45 seconds per cycle**. This is the bottleneck.
2. `isWorkerAlive`: N `cmux list-workspaces` calls (one per active item, redundant -- same output each time). At 5 items, **5 redundant shell spawns × ~100ms = 500ms wasted per cycle**. (Review 3, Finding 11)
3. `processTransitions`: Pure computation, microseconds.
4. `executeAction`: 0-N side-effectful operations. Merge is the slowest (7-20 seconds).

**Scaling limits:** At 5 concurrent items, poll cycles take 5-45 seconds. At 10 items, cycles could exceed 90 seconds, causing the adaptive interval to degrade. The serialized `gh` CLI calls are the constraint. **Fix: batch GitHub API calls via GraphQL** (1 query for all items). This would reduce poll latency from O(N × 1-3s) to O(1 × 2-3s). (Review 5, Finding 2)

**Memory:** Each worker session (Claude Code + Bun + terminal) consumes ~2-3 GB. The `calculateMemoryWipLimit()` function auto-limits WIP based on free memory. However, `nw start` uses `os.freemem()` which underreports on macOS (excludes reclaimable inactive pages), while the daemon uses the correct `getAvailableMemory()` with `vm_stat` parsing. Users see inconsistent WIP limits between `nw start` and `nw watch`. (Review 3, Finding 7)

## Simplification Roadmap

### Tier 1: Strip (Dead Code Removal)

Code that should be removed entirely -- dead features, unused exports, and speculative infrastructure with zero users.

| # | Item | Files | Production LOC | Test LOC | Risk | Dependencies |
|---|------|-------|---------------|----------|------|--------------|
| S1 | **Strip crew mode** | `core/crew.ts`, `core/mock-broker.ts`, `core/commands/crew.ts`, +162 LOC in `orchestrate.ts`, +30 LOC in `status-render.ts` | 1,559 | ~2,425 | **Low** -- zero users, feature behind `--crew` flag | Scheduling depends on crew for deduplication (S2 must follow) |
| S2 | **Strip scheduling** | `core/schedule-eval.ts`, `core/schedule-files.ts`, `core/schedule-runner.ts`, `core/schedule-state.ts`, `core/schedule-history.ts`, `core/commands/schedule.ts`, +290 LOC in `orchestrate.ts` | 1,631 | ~2,218 | **Low** -- zero users, `schedule_enabled` defaults off | Crew-coupled deduplication goes with S1 |
| S3 | **Strip `WorkerCostData`** | `core/types.ts` (lines ~103-110) | 8 | 0 | **None** -- defined but never imported | None |
| S4 | **Strip `CODE_EXTENSIONS_FOR_LINE`** | `core/types.ts` (lines ~176-177) | 2 | 0 | **None** -- exported but never used | None |
| S5 | **Strip `PRStatus`** | `core/types.ts` (lines ~52-58) | 7 | 0 | **None** -- defined but never imported | None |
| S6 | **Strip `MODEL_PRICING` + `estimateCost`** | `core/types.ts` (lines ~124-156) | 33 | ~30 | **Low** -- only used in `analytics.test.ts` | `analytics.test.ts` must be updated |
| S7 | **Deprecate `cmdAutopilotWatch`** | `core/commands/pr-monitor.ts` (lines ~311-390) | 80 | ~40 | **Low** -- replaced by daemon's `orchestrateLoop` | CLI dispatch in `help.ts` |
| | **Tier 1 Totals** | | **~3,320** | **~4,713** | | |

**Tier 1 evidence:** Crew mode has zero production users (the `--crew` flag is undocumented, no production crew server exists, the fallback URL `wss://ninthwave.sh` is not deployed). Scheduling has zero production users (no `.ninthwave/schedules/` directory exists anywhere, `schedule_enabled` defaults off, and the use case overlaps with GitHub Actions cron). Dead type exports were confirmed by grep across the entire codebase. (Review 5 Theme A; Review 1 Findings 3, 4, 5, 8)

### Tier 2: Simplify (Reduce Complexity)

Over-engineered areas where the same outcome can be achieved with less code.

| # | Item | Current LOC | Target LOC | Approach | Effort |
|---|------|------------|-----------|----------|--------|
| R1 | **Decompose `orchestrate.ts`** | 3,890 | ~2,200 | Extract: snapshot building (400), state reconstruction (300), arg parsing (250), TUI keyboard (150), external reviews (100), forkDaemon (30) into separate files | Medium -- 6 extractions, ~100 LOC import overhead |
| R2 | **Decompose `orchestrator.ts`** | 2,674 | ~1,350 | Extract: types + constants (375) to `orchestrator-types.ts`, execute methods (950) to `orchestrator-actions.ts` | Medium -- 2 extractions, clear boundaries |
| R3 | **Simplify TUI** | ~1,100 | ~815 | Remove: detail panel (-180), log level filtering (-30), help overlay (-55), merge strategy cycling (-20) | Low -- feature removal, not refactoring |
| R4 | **Merge `work-item-utils.ts` into `work-item-files.ts`** | 637 (combined) | ~597 | Eliminate re-exports and duplicate imports; keep `parser.ts` as thin adapter | Low -- file merge |
| R5 | **Deduplicate `PRIORITY_RANK`/`PRIORITY_NUM`** | 16 (combined) | 8 | Import `PRIORITY_NUM` from `types.ts` in `orchestrator.ts` | Trivial |
| R6 | **Extract shared CI status logic from pr-monitor.ts** | 148 (sync+async) | ~88 | Generic `processChecks()` function, sync/async call separate gh functions then share logic | Low -- ~30 LOC refactor |
| R7 | **Merge `cmdWatchReady`/`getWatchReadyState`** | 74 (combined) | ~37 | Single function with optional console output parameter | Trivial |
| R8 | **Extract branch management from `launchSingleItem`** | 150 (inline) | 150 (extracted) | Move to `ensureWorktreeAndBranch()` helper. 0 net LOC but significant readability gain | Low |
| R9 | **Deduplicate clean methods** | ~90 (3 functions) | ~60 | Generic `cleanWorkerWorkspace()` for `cleanRepair`/`cleanReview`/`cleanVerifier` | Trivial |
| R10 | **Extract CLI commands from `launch.ts`** | 335 (in launch.ts) | 335 (in run-items.ts) | Move `cmdRunItems`, `cmdStart` to `core/commands/run-items.ts` | Low |
| R11 | **Simplify analytics** | 449 | ~419 | Merge `commitAnalyticsFiles`/`commitFrictionFiles` into single function | Trivial |
| | **Tier 2 Net LOC Reduction** | | | | **~372 LOC reduction + major cognitive overhead reduction** |

**Tier 2 rationale:** The largest files (`orchestrate.ts` at 3,890, `orchestrator.ts` at 2,674) have clear internal boundaries that align with separation of concerns. The TUI features flagged for removal were assessed by examining keyboard shortcut usage -- detail panels and log filtering add keyboard complexity without proportionate value for a tool that users check periodically rather than watching continuously. (Review 5 Finding 8; Review 2 Theme B; Review 5 Theme A)

### Tier 3: Bug/Safety Fixes

Issues from Reviews 1-6 that could cause data loss, corruption, stalls, or security vulnerabilities.

| # | Severity | Issue | Source | Fix | LOC |
|---|----------|-------|--------|-----|-----|
| B1 | **Critical** | `writeStateFile` is not atomic -- crash mid-write corrupts state file, daemon loses all tracked items on restart | R5-F1 | Write-then-rename: `writeFileSync(tmp)` then `renameSync(tmp, path)` | ~5 |
| B2 | **Critical** | `gh.ts` silently returns `[]` on API failure -- orchestrator misinterprets outage as "no data," all CI-pending items stall indefinitely | R4-F1 | Add `GhResult<T>` return types to `prList`, `prView`, `prChecks`; callers hold state on `{ ok: false }` | ~100 |
| B3 | **High** | `stuckOrRetry` doesn't reset `lastCommitTime` -- retried worker inherits stale timestamp, may timeout immediately | R2-F2 | Reset `item.lastCommitTime = undefined` in `stuckOrRetry()` | ~3 |
| B4 | **High** | `handleMerging` only handles `merged` state -- manually closed PRs leave items in `merging` forever | R2-F11 | Add `prState === "closed"` → `stuck` transition with reason | ~5 |
| B5 | **High** | Launch resource leak: worktree/partition/index created but not cleaned up when later steps fail | R3-F1 | Wrap steps 3-8 of `launchSingleItem` in try/catch with cleanup | ~15 |
| B6 | **High** | 3 critical fields not serialized in `DaemonStateItem` -- daemon crash loses worker management | R1-F1, R5-F4 | Add `workspaceRef`, `partition`, `resolvedRepoRoot` to serialization | ~20 |
| B7 | **High** | `executeMerge` transitions to `merged` after `getMergeCommitSha` (not after `prMerge`) -- mid-sequence failure leaves inconsistent state | R2-F6 | Move `transition(item, "merged")` immediately after `prMerge` succeeds | ~5 |
| B8 | **Medium** | Message delivery "silent success" on keystroke fallback -- unverifiable delivery assumed successful, worker never receives CI fix/review feedback | R3-F4 | `verifyDelivery` returns `false` for keystroke path when screen unreadable | ~15 |
| B9 | **Medium** | Partition allocation TOCTOU race -- concurrent `nw start` + daemon could share partition | R3-F2 | Use `O_CREAT | O_EXCL` for atomic file creation | ~10 |
| B10 | **Medium** | `daemonRebase` doesn't fetch branch before rebasing -- may rebase stale local state | R4-F4 | Add `fetch origin <branch>` before rebase | ~3 |
| B11 | **Medium** | Stacked branch base becomes unresolvable after dep merge + branch deletion | R4-F7 | Save dep commit SHA before `prMerge`; use SHA in `rebaseOnto` | ~10 |
| B12 | **Medium** | Cross-repo alias path traversal -- malformed `Repo:` field could create directories outside project | R4-F3 | Validate alias against `/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/` | ~10 |
| B13 | **Medium** | Multi-daemon PID race -- two `nw watch` instances can both pass the PID check and corrupt state | R5-F9 | Use `O_CREAT | O_EXCL` or `acquireLock` for PID file | ~10 |
| B14 | **Medium** | `DaemonState` deserialization has no validation -- corrupted state file passes silently, causes runtime errors later | R1-F9 | Add lightweight shape validation (items is array, each has id + state) | ~30 |
| B15 | **Medium** | `ProjectConfig` index signature defeats type safety | R1-F2 | Replace `[key: string]: string` with explicit typed fields | ~30 |
| B16 | **Medium** | `calculateMemoryWipLimit` in `nw start` uses `os.freemem()` (underreports on macOS) | R3-F7 | Share `getAvailableMemory()` between daemon and CLI | ~10 |
| B17 | **Medium** | Screen-parsing `ERROR_INDICATORS` match code content containing "Error:" -- false positive health detection | R3-F3 | Make error detection line-anchored (check line start, not substring) | ~10 |
| B18 | **Low** | `ARCHITECTURE.md` out of date: 3 states undocumented, WIP states and stackable states incorrect | R2-F1 | Update docs with all 19 states and correct sets | ~30 |
| B19 | **Low** | Unsafe `as Priority` cast before validation in `parseWorkItemFile` | R1-F6 | Use type guard function, cast only after validation | ~15 |
| B20 | **Low** | `extractBody` missing `**Bootstrap:**` in metadata prefixes | R1-F13 | Add to `METADATA_PREFIXES` array | ~1 |
| B21 | **Low** | `cleanSingleWorktree` doesn't close the cmux workspace -- orphaned terminal sessions | R3-F13 | Add optional `Multiplexer` param, close workspace if provided | ~10 |
| B22 | **Low** | Workspace listing not cached per poll cycle -- 5-10 redundant `cmux list-workspaces` per cycle | R3-F6, R3-F11 | Cache `listWorkspaces()` result in `buildPollSnapshot` | ~15 |
| B23 | **Low** | `prTitleMatchesWorkItem` fragile heuristic -- rephrased titles cause false negatives | R4-F5 | Add branch name check as primary discriminator, title as secondary | ~15 |
| B24 | **Low** | `setState()` bypasses `transition()` flag management | R2-F14 | Rename to `hydrateState()` | ~10 |
| B25 | **Low** | Lock `writePid` failure leaves empty directory | R4-F2 | Add `finally` block to clean up on throw | ~10 |

### Tier 4: Remaining Technical Debt

Maintenance items for the simplified codebase. Lower priority but worth tracking for future cleanup.

| # | Item | Source | Notes |
|---|------|--------|-------|
| D1 | **Collapse `pr-open` state into `ci-pending`** | R2-F4, R2 Theme B | `pr-open` is transient (exists for at most 1 cycle). Saves ~10 LOC, removes a state from the 19-state machine. Trade-off: loses "PR created" as distinct audit event. |
| D2 | **Add launching state timeout** | R2-F15 | Workers stuck in `launching` (cmux hangs, wrong workspace ref) stay there indefinitely. ~10 LOC. |
| D3 | **Standardize gh.ts error handling** | R4-F8 | Align all gh functions to result types (subsumes B2). ~60 LOC refactor. |
| D4 | **Batch GitHub API calls via GraphQL** | R5-F2 | Replace per-item REST calls with single GraphQL query. Reduces poll latency from 5-45s to ~2-3s at 5 items. ~50 LOC. |
| D5 | **Add crash recovery integration test** | R6-F3 | Serialize state with items in various states → clear → deserialize → verify. ~60 LOC. |
| D6 | **Add exhaustive transition tests for 6 missing states** | R6-F2 | `bootstrapping`, `repairing`, `repairing-main`, `verifying`, `verify-failed`, `merging` error path. ~200 LOC. |
| D7 | **Add `send-message.ts` test file** | R6-F4 | Direct tests for delivery, verification, and silent success bug. ~80 LOC. |
| D8 | **Migrate 5 vi.mock test files to DI** | R6-F1 | Add `GitDeps`, `GhDeps`, `PrMonitorDeps` interfaces. ~155 LOC of DI additions. |
| D9 | **Add `no-leaked-mock` lint rule** | R6-F6 | Prevents new vi.mock violations for modules with own test file. ~25 LOC. |
| D10 | **Add `no-describe-skip` lint rule** | R6-F6 | Prevents silently disabled tests. ~15 LOC. |
| D11 | **Extract `captureOutput` to shared test helper** | R6 Theme B | Remove ~80 LOC duplication across 6+ test files. |
| D12 | **Consider combined memory-aware WIP limit** | R2-F3 | Review workers consume same resources as implementation workers but have separate limit. Product decision. |
| D13 | **Cross-repo stripping decision** | R4 Theme A | 549 LOC of cross-repo support. Used in dogfooding but may not have external users. If stripped: -660 LOC. |
| D14 | **conflicts.ts assessment** | R4-F12 | 80 LOC of static conflict analysis. Advisory only, not integrated into daemon. Keep if used; strip if not. |
| D15 | **Runtime state migration removal** | R5-F11 | `migrateRuntimeState()` (68 LOC) is one-time migration code. Remove 6-12 months after migration. |
| D16 | **Priority merge queue aging** | R2-F5 | Lower-priority items can be starved by high-priority items cycling through ci-failed → ci-passed. ~20 LOC for aging counter. |

## Summary Metrics

### LOC Before Simplification

| Category | LOC |
|----------|-----|
| Production code (`core/`) | 27,210 |
| Test code (`test/`) | 60,126 |
| **Total codebase** | **87,336** |

### Top 10 Files by Size

| File | LOC | % of Production |
|------|-----|-----------------|
| `core/commands/orchestrate.ts` | 3,890 | 14.3% |
| `core/orchestrator.ts` | 2,674 | 9.8% |
| `core/status-render.ts` | 2,113 | 7.8% |
| `core/commands/launch.ts` | 1,271 | 4.7% |
| `core/commands/init.ts` | 942 | 3.5% |
| `core/daemon.ts` | 711 | 2.6% |
| `core/commands/pr-monitor.ts` | 675 | 2.5% |
| `core/help.ts` | 667 | 2.5% |
| `core/mock-broker.ts` | 625 | 2.3% |
| `core/gh.ts` | 614 | 2.3% |
| **Top 10 total** | **14,182** | **52.1%** |

### LOC Removable via Tier 1 (Strip)

| Item | Production LOC | Test LOC |
|------|---------------|----------|
| Crew mode (S1) | 1,559 | ~2,425 |
| Scheduling (S2) | 1,631 | ~2,218 |
| Dead type exports (S3-S6) | 50 | ~30 |
| cmdAutopilotWatch (S7) | 80 | ~40 |
| **Tier 1 total** | **~3,320** | **~4,713** |

### LOC Reducible via Tier 2 (Simplify)

| Item | LOC Saved |
|------|-----------|
| TUI simplification (R3) | ~285 |
| pr-monitor dedup (R6) | ~60 |
| work-item file merge (R4) | ~40 |
| Analytics dedup (R11) | ~30 |
| Clean method dedup (R9) | ~30 |
| cmdWatchReady merge (R7) | ~37 |
| Priority rank dedup (R5) | ~8 |
| **Tier 2 net reduction** | **~490** |

Note: Tier 2 also includes ~1,630 LOC of file reorganization (R1, R2, R8, R10) that reduces per-file cognitive load without changing net LOC.

### Net Target LOC After Simplification

| Metric | LOC |
|--------|-----|
| Current production LOC | 27,210 |
| Tier 1 strip (production) | -3,320 |
| Tier 2 simplify (production net) | -490 |
| Tier 3 fixes (net additions) | +370 |
| **Target production LOC** | **~23,770** |
| **Reduction** | **~3,440 LOC (12.6%)** |

| Metric | LOC |
|--------|-----|
| Current test LOC | 60,126 |
| Tier 1 strip (test) | -4,713 |
| **Target test LOC** | **~55,413** |
| **Reduction** | **~4,713 LOC (7.8%)** |

| Metric | LOC |
|--------|-----|
| **Current total codebase** | **87,336** |
| **Target total codebase** | **~79,183** |
| **Total reduction** | **~8,153 LOC (9.3%)** |

### Quality Improvements (Non-LOC)

Beyond LOC reduction, the simplification roadmap delivers:

- **`orchestrate.ts`**: 3,890 → ~2,200 LOC (max file size drops 43%)
- **`orchestrator.ts`**: 2,674 → ~1,350 LOC (max file size drops 49%)
- **State machine states**: 19 → 18 (if `pr-open` collapsed into `ci-pending`)
- **Zero `vi.mock` in test suite** (after D8 migration)
- **Atomic state persistence** (B1 eliminates crash corruption risk)
- **Explicit API error handling** (B2 eliminates silent stall during outages)
- **3 fewer production files** (crew.ts, mock-broker.ts removed; schedule files removed)

## Recommended Execution Sequence

Ordered for a follow-up `/decompose` session. Each item is a PR-sized work item (~200-400 LOC). Dependencies are explicit.

### Phase 1: Strip Dead Code (no dependencies, parallelizable)

1. **Strip crew mode** -- Remove `core/crew.ts`, `core/mock-broker.ts`, `core/commands/crew.ts`, crew integration from `orchestrate.ts` and `status-render.ts`, crew test files. ~1,559 production + ~2,425 test LOC. (S1)

2. **Strip scheduling** -- Remove 5 `schedule-*.ts` files, `core/commands/schedule.ts`, schedule integration from `orchestrate.ts`, `ScheduledTask` from `types.ts`, schedule test files. ~1,631 production + ~2,218 test LOC. Depends on S1 (crew-schedule coupling). (S2)

3. **Strip dead type exports** -- Remove `WorkerCostData`, `CODE_EXTENSIONS_FOR_LINE`, `PRStatus`, `MODEL_PRICING` + `estimateCost` from `core/types.ts`. Update `analytics.test.ts`. ~50 production + ~30 test LOC. (S3-S6)

4. **Deprecate `cmdAutopilotWatch`** -- Remove from `pr-monitor.ts` and CLI dispatch. ~80 production LOC. (S7)

### Phase 2: Critical Safety Fixes (no dependencies between items, parallelizable)

5. **Atomic state file writes** -- Implement write-then-rename in `daemon.ts` `writeStateFile`. ~5 LOC. (B1)

6. **GitHub API error result types** -- Add `GhResult<T>` to `gh.ts`, update callers in `pr-monitor.ts` and `orchestrate.ts` to hold state on API failure. ~100 LOC. (B2)

7. **Fix `stuckOrRetry` stale commit time** -- Reset `lastCommitTime` in `orchestrator.ts`. ~3 LOC. (B3)

8. **Handle closed PRs in `handleMerging`** -- Add `prState === "closed"` → `stuck` transition. ~5 LOC. (B4)

9. **Launch resource leak cleanup** -- Wrap `launchSingleItem` steps in try/catch with cleanup. ~15 LOC. (B5)

10. **Serialize critical fields for crash recovery** -- Add `workspaceRef`, `partition`, `resolvedRepoRoot` to `DaemonStateItem` and `serializeOrchestratorState`. ~20 LOC. (B6)

11. **Fix `executeMerge` transition ordering** -- Move `transition(item, "merged")` immediately after `prMerge` succeeds. ~5 LOC. (B7)

### Phase 3: Medium Safety Fixes (no dependencies, parallelizable)

12. **Fix message delivery silent success** -- Update `verifyDelivery` for keystroke fallback path. ~15 LOC. (B8)

13. **Atomic partition allocation** -- Use `O_CREAT | O_EXCL` in `partitions.ts`. ~10 LOC. (B9)

14. **Fix daemonRebase stale branch** -- Add branch fetch before rebase in `git.ts`. ~3 LOC. (B10)

15. **Save dep commit SHA for restack** -- Resolve SHA before `prMerge` in `executeMerge`. ~10 LOC. (B11)

16. **Validate cross-repo alias** -- Add regex validation in `cross-repo.ts`. ~10 LOC. (B12)

17. **Daemon PID file locking** -- Use atomic file creation for `isDaemonRunning`. ~10 LOC. (B13)

18. **DaemonState deserialization validation** -- Add shape check in `readStateFile`. ~30 LOC. (B14)

### Phase 4: Simplification (depends on Phase 1 stripping)

19. **Simplify TUI** -- Remove detail panel, log level filtering, help overlay, merge strategy cycling from `status-render.ts` and `orchestrate.ts`. ~285 LOC reduction. Depends on S1/S2 (crew/schedule TUI code removed first). (R3)

20. **Decompose `orchestrate.ts`** -- Extract snapshot building, state reconstruction, arg parsing, TUI keyboard, external reviews, forkDaemon. 0 net LOC but drops file from ~3,400 (post-strip) to ~2,200. Depends on S1/S2 (less code to move). (R1)

21. **Decompose `orchestrator.ts`** -- Extract types to `orchestrator-types.ts`, execute methods to `orchestrator-actions.ts`. 0 net LOC but drops file from 2,674 to ~1,350. (R2)

22. **Extract shared CI status logic** -- Deduplicate sync/async in `pr-monitor.ts`. -60 LOC. (R6)

23. **Merge `work-item-utils.ts` into `work-item-files.ts`** -- Reduce 3-file arrangement to 2. -40 LOC. (R4)

24. **Extract branch management** -- Move 150 LOC from `launchSingleItem` to helper. 0 net LOC. (R8)

25. **Extract CLI commands from `launch.ts`** -- Move `cmdRunItems`/`cmdStart` to `run-items.ts`. 0 net LOC. (R10)

26. **Minor dedup items** -- PRIORITY_RANK dedup (-8), analytics dedup (-30), clean method dedup (-30), cmdWatchReady merge (-37). (R5, R7, R9, R11)

### Phase 5: Low-Priority Fixes and Remaining Cleanup

27. **Update ARCHITECTURE.md** -- All 19 states, correct WIP and stackable state sets. (B18)

28. **Type safety fixes** -- Priority cast type guard (B19), ProjectConfig typed fields (B15), Bootstrap metadata prefix (B20). ~46 LOC.

29. **Remaining low-severity fixes** -- Workspace close in clean (B21), workspace listing cache (B22), title match strengthening (B23), hydrateState rename (B24), lock cleanup (B25). ~65 LOC.

30. **Share `getAvailableMemory`** -- Export from shared module, use in `launch.ts`. (B16)

31. **Line-anchored error detection** -- Fix screen-parsing false positives. (B17)

### Phase 6: Test Infrastructure (can run parallel with Phase 4-5)

32. **Add crash recovery integration test** -- Serialize → clear → deserialize → verify round-trip. ~60 LOC. (D5)

33. **Add missing state transition tests** -- 6 states in exhaustive section. ~200 LOC. (D6)

34. **Add `send-message.ts` test file** -- Direct delivery tests. ~80 LOC. (D7)

35. **Add `no-leaked-mock` lint rule** -- Prevent new vi.mock violations. ~25 LOC. (D9)

36. **Migrate vi.mock test files to DI** -- Add DI interfaces to `clean.ts`, `launch.ts`, `pr-monitor.ts`. ~155 LOC. (D8)

37. **Extract `captureOutput` helper** -- Deduplicate across 6+ test files. -80 LOC. (D11)

---

*This roadmap synthesizes findings from Reviews 1-6, each written after a full-file audit of the referenced modules. Every STRIP, SIMPLIFY, and QUESTIONABLE tag from the reviews is accounted for above. Items not included in the roadmap were tagged KEEP with rationale provided in the source review.*

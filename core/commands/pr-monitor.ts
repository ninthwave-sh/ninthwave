// Watch/polling commands: watch-ready, pr-watch, pr-activity, scanExternalPRs.

import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { die } from "../output.ts";
import {
  prList as defaultPrList,
  prView as defaultPrView,
  prChecks as defaultPrChecks,
  prListAsync as defaultPrListAsync,
  prViewAsync as defaultPrViewAsync,
  prChecksAsync as defaultPrChecksAsync,
  getRepoOwner as defaultGetRepoOwner,
  apiGet as defaultApiGet,
  isAvailable as defaultIsAvailable,
  ghInRepo,
  IGNORED_CHECK_NAMES,
  type GhFailureKind,
  type PrBulkCache,
  type BulkCheckRun,
} from "../gh.ts";
import { parseWorkItemReferenceBlock } from "../work-item-files.ts";
import { detectWorkflowPresence } from "../workflow-detect.ts";
import * as ghModule from "../gh.ts";
import type { WatchResult, Transition } from "../types.ts";

/** Injectable dependencies for PR monitoring commands, for testing. */
export interface PrMonitorDeps {
  prList: typeof defaultPrList;
  prView: typeof defaultPrView;
  prChecks: typeof defaultPrChecks;
  isAvailable: typeof defaultIsAvailable;
  getRepoOwner: typeof defaultGetRepoOwner;
  apiGet: typeof defaultApiGet;
}

/** Async variant of PrMonitorDeps for checkPrStatusAsync. */
export interface PrMonitorAsyncDeps {
  prListAsync: typeof defaultPrListAsync;
  prViewAsync: typeof defaultPrViewAsync;
  prChecksAsync: typeof defaultPrChecksAsync;
  isAvailable: typeof defaultIsAvailable;
}

export type PrPollFailureStage =
  | "availability"
  | "prList-open"
  | "prList-merged"
  | "prView"
  | "prChecks";

export interface PrPollFailure {
  kind: GhFailureKind;
  stage: PrPollFailureStage;
  error: string;
}

export interface PrStatusPollResult {
  statusLine: string;
  failure?: PrPollFailure;
}

// Defaults read from the module namespace so vi.spyOn in tests works.
const defaultPrMonitorDeps: PrMonitorDeps = {
  prList: (...args) => ghModule.prList(...args),
  prView: (...args) => ghModule.prView(...args),
  prChecks: (...args) => ghModule.prChecks(...args),
  isAvailable: () => ghModule.isAvailable(),
  getRepoOwner: (...args) => ghModule.getRepoOwner(...args),
  apiGet: (...args) => ghModule.apiGet(...args),
};

// Async defaults read from the module namespace so vi.spyOn in tests works.
const defaultPrMonitorAsyncDeps: PrMonitorAsyncDeps = {
  prListAsync: (...args) => ghModule.prListAsync(...args),
  prViewAsync: (...args) => ghModule.prViewAsync(...args),
  prChecksAsync: (...args) => ghModule.prChecksAsync(...args),
  isAvailable: () => ghModule.isAvailable(),
};

// ── External PR scanning ──────────────────────────────────────────────

/** Data returned by scanExternalPRs for each non-ninthwave PR. */
export interface ExternalPR {
  prNumber: number;
  headBranch: string;
  author: string;
  isDraft: boolean;
  headSha: string;
  authorAssociation: string;
  labels: string[];
}

/** Raw shape returned by the GitHub REST API for pull requests. */
interface GitHubPullRequest {
  number: number;
  head: { ref: string; sha: string };
  user: { login: string };
  draft: boolean;
  author_association: string;
  labels: Array<{ name: string }>;
}

/** Injectable dependencies for scanExternalPRs, for testing. */
export interface ScanExternalPRsDeps {
  ghRunner: (root: string, args: string[]) => { exitCode: number; stdout: string };
  isAvailable: () => boolean;
  getOwnerRepo: (repoRoot: string) => string;
}

const defaultScanDeps: ScanExternalPRsDeps = {
  ghRunner: ghInRepo,
  isAvailable: defaultIsAvailable,
  getOwnerRepo: defaultGetRepoOwner,
};

/**
 * Scan for open PRs not managed by ninthwave (non-`ninthwave/*` branches).
 * Uses the GitHub REST API to list open PRs with author_association.
 *
 * @param repoRoot - Path to the repository root
 * @param deps - Injectable dependencies for testing
 */
export function scanExternalPRs(
  repoRoot: string,
  deps: Partial<ScanExternalPRsDeps> = {},
): ExternalPR[] {
  const { ghRunner, isAvailable, getOwnerRepo } = { ...defaultScanDeps, ...deps };

  if (!isAvailable()) return [];

  let ownerRepo: string;
  try {
    ownerRepo = getOwnerRepo(repoRoot);
  } catch {
    return [];
  }

  const result = ghRunner(repoRoot, [
    "api",
    `repos/${ownerRepo}/pulls?state=open&per_page=100`,
  ]);

  if (result.exitCode !== 0 || !result.stdout) return [];

  try {
    const prs = JSON.parse(result.stdout) as GitHubPullRequest[];

    return prs
      .filter((pr) => !pr.head.ref.startsWith("ninthwave/"))
      .map((pr) => ({
        prNumber: pr.number,
        headBranch: pr.head.ref,
        author: pr.user.login,
        isDraft: pr.draft,
        headSha: pr.head.sha,
        authorAssociation: pr.author_association,
        labels: pr.labels.map((l) => l.name),
      }));
  } catch {
    return [];
  }
}

/** jq fragment: only count comments/reviews from trusted author associations. */
export const TRUSTED_ASSOC = '(.author_association == "OWNER" or .author_association == "MEMBER" or .author_association == "COLLABORATOR")';

/**
 * Check each worktree's PR status (merged/ready/pending/failing/no-pr).
 * Returns tab-separated lines: ID\tPR_NUMBER\tSTATUS...
 *
 * @param print - When true (default, CLI usage), writes results to console.
 *   Pass false to get the result string without side effects.
 */
export function cmdWatchReady(
  worktreeDir: string,
  projectRoot: string,
  print: boolean = true,
  deps: PrMonitorDeps = defaultPrMonitorDeps,
): string {
  if (!existsSync(worktreeDir)) {
    if (print) console.log("No active worktrees");
    return "";
  }

  const results: string[] = [];

  // Iterate worktrees
  try {
    for (const entry of readdirSync(worktreeDir)) {
      if (!entry.startsWith("ninthwave-")) continue;
      const wtDir = join(worktreeDir, entry);
      if (!existsSync(wtDir)) continue;
      const id = entry.slice(10);
      const line = checkPrStatus(id, projectRoot, deps);
      if (line) results.push(line);
    }
  } catch {
    // ignore
  }


  const output = results.join("\n");
  if (print && output) console.log(output);
  return output;
}

/**
 * CI check states that indicate a definitive failure.
 * GitHub returns these from check runs (FAILURE, CANCELLED, TIMED_OUT,
 * ACTION_REQUIRED, STARTUP_FAILURE) and commit status checks (ERROR).
 * Without this, only FAILURE was detected -- other failure states like ERROR
 * left ciStatus as "unknown", causing items to stay stuck in ci-pending.
 */
export const CI_FAILURE_STATES = new Set([
  "FAILURE",
  "ERROR",
  "CANCELLED",
  "TIMED_OUT",
  "STARTUP_FAILURE",
  "ACTION_REQUIRED",
]);

/** Grace period after PR creation before treating zero checks as "no CI configured". */
export const CI_GRACE_PERIOD_MS = 2 * 60 * 1000; // 2 minutes

/** Short grace period when no relevant workflows detected (for third-party status checks). */
export const NO_CI_GRACE_PERIOD_MS = 15 * 1000; // 15 seconds

function filterRelevantChecks(
  checks: { state: string; name: string; completedAt?: string }[],
): { state: string; name: string; completedAt?: string }[] {
  return checks.filter(
    (c) => c.state !== "SKIPPED" && !IGNORED_CHECK_NAMES.has(c.name),
  );
}

/**
 * Shared CI status processing. Determines ciStatus and event time from a set
 * of GitHub check runs/status checks. Used by both sync and async check paths
 * so bug fixes apply to both.
 *
 * prCreatedAt: ISO timestamp from the PR. When no non-skipped checks exist,
 * if the PR was opened within CI_GRACE_PERIOD_MS, returns "unknown" (wait for
 * CI to register). After the grace period, returns "pass" (no CI configured).
 */
export function processChecks(
  checks: { state: string; name: string; completedAt?: string }[],
  prCreatedAt?: string,
  now: Date = new Date(),
  gracePeriodMs: number = CI_GRACE_PERIOD_MS,
): { ciStatus: string; eventTime: string | undefined } {
  const relevantChecks = filterRelevantChecks(checks);
  let ciStatus: string;
  if (relevantChecks.length === 0) {
    // No checks registered. If the PR was recently opened, CI may not have started yet.
    const inGrace =
      prCreatedAt !== undefined &&
      prCreatedAt !== "" &&
      now.getTime() - new Date(prCreatedAt).getTime() < gracePeriodMs;
    ciStatus = inGrace ? "unknown" : "pass";
  } else {
    ciStatus = "unknown";
    if (relevantChecks.every((c) => c.state === "SUCCESS")) {
      ciStatus = "pass";
    } else if (relevantChecks.some((c) => CI_FAILURE_STATES.has(c.state))) {
      ciStatus = "fail";
    } else if (relevantChecks.some((c) => c.state === "PENDING")) {
      ciStatus = "pending";
    }
  }

  // For terminal CI states, derive event time from the latest check completedAt.
  let eventTime: string | undefined;
  if (ciStatus === "pass" || ciStatus === "fail") {
    const completedTimes = relevantChecks
      .map((c) => c.completedAt)
      .filter((t): t is string => !!t)
      .sort();
    if (completedTimes.length > 0) {
      eventTime = completedTimes[completedTimes.length - 1]!;
    }
  }

  return { ciStatus, eventTime };
}

/** Derive overall PR status from CI status and review/merge state. */
function derivePrStatus(ciStatus: string, isMergeable: string, reviewDecision: string): string {
  if (ciStatus === "fail") return "failing";
  if (ciStatus === "pass") {
    return isMergeable === "MERGEABLE" && reviewDecision === "APPROVED" ? "ready" : "ci-passed";
  }
  return "pending";
}

function formatOpenPrStatus(
  id: string,
  prNumber: number,
  isMergeable = "",
  eventTime = "",
): string {
  return `${id}\t${prNumber}\topen\t${isMergeable}\t${eventTime}`;
}

function pollFailure(stage: PrPollFailureStage, kind: GhFailureKind, error: string, statusLine = ""): PrStatusPollResult {
  return { statusLine, failure: { kind, stage, error } };
}

export function checkPrStatusDetailed(
  id: string,
  repoRoot: string,
  deps: PrMonitorDeps = defaultPrMonitorDeps,
  prCache?: PrBulkCache,
): PrStatusPollResult {
  const branch = `ninthwave/${id}`;

  if (!deps.isAvailable()) return pollFailure("availability", "missing-cli", "gh CLI unavailable");

  // Resolve open/merged PRs from cache or per-item API call
  let openPrs: Array<{ number: number; title: string; body?: string }>;
  let cachedPrView: { reviewDecision?: string; mergeable?: string; updatedAt?: string; createdAt?: string } | undefined;
  let cachedChecks: BulkCheckRun[] | undefined;

  if (prCache) {
    const cachedOpen = prCache.open.get(branch) ?? [];
    openPrs = cachedOpen.map(pr => ({ number: pr.number, title: pr.title, body: pr.body }));
    if (cachedOpen.length > 0) {
      const entry = cachedOpen[0]!;
      cachedPrView = {
        reviewDecision: entry.reviewDecision,
        mergeable: entry.mergeable,
        updatedAt: entry.updatedAt,
        createdAt: entry.createdAt,
      };
      cachedChecks = entry.statusCheckRollup;
    }
  } else {
    const openResult = deps.prList(repoRoot, branch, "open");
    if (!openResult.ok) return pollFailure("prList-open", openResult.kind, openResult.error);
    openPrs = openResult.data;
  }

  if (openPrs.length === 0) {
    // Check if merged
    let mergedPrs: Array<{ number: number; title: string; body?: string }>;
    if (prCache) {
      const cachedMerged = prCache.merged.get(branch) ?? [];
      mergedPrs = cachedMerged.map(pr => ({ number: pr.number, title: pr.title, body: pr.body }));
    } else {
      const mergedResult = deps.prList(repoRoot, branch, "merged");
      if (!mergedResult.ok) return pollFailure("prList-merged", mergedResult.kind, mergedResult.error);
      mergedPrs = mergedResult.data;
    }
    if (mergedPrs.length > 0) {
      const pr = mergedPrs[0]!;
      const prTitle = pr.title ?? "";
      const lineageToken = parseWorkItemReferenceBlock(pr.body ?? "")?.lineageToken ?? "";
      return { statusLine: `${id}\t${pr.number}\tmerged\t\t\t${prTitle}\t${lineageToken}` };
    }
    return { statusLine: `${id}\t\tno-pr` };
  }

  const prNumber = openPrs[0]!.number;

  // Use cached prView + statusCheckRollup from bulk fetch when available.
  let reviewDecision: string;
  let isMergeable: string;
  let prUpdatedAt: string;
  let prCreatedAt: string;
  let checksData: { state: string; name: string; completedAt?: string }[];
  let checksFailure: { kind: GhFailureKind; stage: PrPollFailureStage; error: string } | undefined;

  if (cachedPrView && cachedChecks) {
    reviewDecision = cachedPrView.reviewDecision ?? "";
    isMergeable = cachedPrView.mergeable ?? "";
    prUpdatedAt = cachedPrView.updatedAt ?? "";
    prCreatedAt = cachedPrView.createdAt ?? "";
    checksData = cachedChecks;
  } else if (cachedPrView) {
    reviewDecision = cachedPrView.reviewDecision ?? "";
    isMergeable = cachedPrView.mergeable ?? "";
    prUpdatedAt = cachedPrView.updatedAt ?? "";
    prCreatedAt = cachedPrView.createdAt ?? "";
    const checksResult = deps.prChecks(repoRoot, prNumber);
    checksData = checksResult.ok ? checksResult.data : [];
    if (!checksResult.ok) {
      checksFailure = { kind: checksResult.kind, stage: "prChecks", error: checksResult.error };
    }
  } else {
    const prViewResult = deps.prView(repoRoot, prNumber, ["reviewDecision", "mergeable", "updatedAt", "createdAt"]);
    if (!prViewResult.ok) return pollFailure("prView", prViewResult.kind, prViewResult.error, formatOpenPrStatus(id, prNumber));
    const prData = prViewResult.data;
    reviewDecision = (prData.reviewDecision as string) ?? "";
    isMergeable = (prData.mergeable as string) ?? "";
    prUpdatedAt = (prData.updatedAt as string) ?? "";
    prCreatedAt = (prData.createdAt as string) ?? "";
    const checksResult = deps.prChecks(repoRoot, prNumber);
    checksData = checksResult.ok ? checksResult.data : [];
    if (!checksResult.ok) {
      checksFailure = { kind: checksResult.kind, stage: "prChecks", error: checksResult.error };
    }
  }

  // When zero relevant checks, detect workflows to set appropriate grace period.
  let gracePeriodMs = CI_GRACE_PERIOD_MS;
  if (filterRelevantChecks(checksData).length === 0) {
    const { hasPrWorkflows } = detectWorkflowPresence(repoRoot);
    if (!hasPrWorkflows) gracePeriodMs = NO_CI_GRACE_PERIOD_MS;
  }

  const { ciStatus, eventTime: ciEventTime } = processChecks(checksData, prCreatedAt, new Date(), gracePeriodMs);
  const status = derivePrStatus(ciStatus, isMergeable, reviewDecision);
  const eventTime = ciEventTime ?? prUpdatedAt;

  // Fields: ID, PR number, status, mergeable, eventTime (5th field for detection latency)
  const result: PrStatusPollResult = {
    statusLine: `${id}\t${prNumber}\t${status}\t${isMergeable || "UNKNOWN"}\t${eventTime}`,
  };
  if (checksFailure) {
    result.failure = checksFailure;
  }
  return result;
}

export function checkPrStatus(id: string, repoRoot: string, deps: PrMonitorDeps = defaultPrMonitorDeps, prCache?: PrBulkCache): string {
  return checkPrStatusDetailed(id, repoRoot, deps, prCache).statusLine;
}

/**
 * Async variant of checkPrStatus. Uses async gh functions so each
 * network call yields to the event loop, keeping the TUI responsive.
 * Returns the same tab-separated string format as the sync version.
 */
export async function checkPrStatusAsync(id: string, repoRoot: string, deps: PrMonitorAsyncDeps = defaultPrMonitorAsyncDeps, prCache?: PrBulkCache): Promise<string> {
  return (await checkPrStatusDetailedAsync(id, repoRoot, deps, prCache)).statusLine;
}

export async function checkPrStatusDetailedAsync(
  id: string,
  repoRoot: string,
  deps: PrMonitorAsyncDeps = defaultPrMonitorAsyncDeps,
  prCache?: PrBulkCache,
): Promise<PrStatusPollResult> {
  const branch = `ninthwave/${id}`;

  if (!deps.isAvailable()) return pollFailure("availability", "missing-cli", "gh CLI unavailable");

  // Resolve open/merged PRs from cache or per-item API call
  let openPrs: Array<{ number: number; title: string; body?: string }>;
  let cachedPrView: { reviewDecision?: string; mergeable?: string; updatedAt?: string; createdAt?: string } | undefined;
  let cachedChecks: BulkCheckRun[] | undefined;

  if (prCache) {
    const cachedOpen = prCache.open.get(branch) ?? [];
    openPrs = cachedOpen.map(pr => ({ number: pr.number, title: pr.title, body: pr.body }));
    if (cachedOpen.length > 0) {
      const entry = cachedOpen[0]!;
      cachedPrView = {
        reviewDecision: entry.reviewDecision,
        mergeable: entry.mergeable,
        updatedAt: entry.updatedAt,
        createdAt: entry.createdAt,
      };
      cachedChecks = entry.statusCheckRollup;
    }
  } else {
    const openResult = await deps.prListAsync(repoRoot, branch, "open");
    if (!openResult.ok) return pollFailure("prList-open", openResult.kind, openResult.error);
    openPrs = openResult.data;
  }

  if (openPrs.length === 0) {
    let mergedPrs: Array<{ number: number; title: string; body?: string }>;
    if (prCache) {
      const cachedMerged = prCache.merged.get(branch) ?? [];
      mergedPrs = cachedMerged.map(pr => ({ number: pr.number, title: pr.title, body: pr.body }));
    } else {
      const mergedResult = await deps.prListAsync(repoRoot, branch, "merged");
      if (!mergedResult.ok) return pollFailure("prList-merged", mergedResult.kind, mergedResult.error);
      mergedPrs = mergedResult.data;
    }
    if (mergedPrs.length > 0) {
      const pr = mergedPrs[0]!;
      const prTitle = pr.title ?? "";
      const lineageToken = parseWorkItemReferenceBlock(pr.body ?? "")?.lineageToken ?? "";
      return { statusLine: `${id}\t${pr.number}\tmerged\t\t\t${prTitle}\t${lineageToken}` };
    }
    return { statusLine: `${id}\t\tno-pr` };
  }

  const prNumber = openPrs[0]!.number;

  // Use cached prView + statusCheckRollup from bulk fetch when available.
  // This eliminates per-item prView AND prChecks calls entirely.
  let reviewDecision: string;
  let isMergeable: string;
  let prUpdatedAt: string;
  let prCreatedAt: string;
  let checksData: { state: string; name: string; completedAt?: string }[];
  let checksFailure: { kind: string; stage: string; error: string } | undefined;

  if (cachedPrView && cachedChecks) {
    // Full cache hit: all data from bulk fetch, zero per-item API calls
    reviewDecision = cachedPrView.reviewDecision ?? "";
    isMergeable = cachedPrView.mergeable ?? "";
    prUpdatedAt = cachedPrView.updatedAt ?? "";
    prCreatedAt = cachedPrView.createdAt ?? "";
    checksData = cachedChecks;
  } else if (cachedPrView) {
    // Partial cache: prView from cache, prChecks per-item (statusCheckRollup missing)
    reviewDecision = cachedPrView.reviewDecision ?? "";
    isMergeable = cachedPrView.mergeable ?? "";
    prUpdatedAt = cachedPrView.updatedAt ?? "";
    prCreatedAt = cachedPrView.createdAt ?? "";
    const checksResult = await deps.prChecksAsync(repoRoot, prNumber);
    checksData = checksResult.ok ? checksResult.data : [];
    if (!checksResult.ok) {
      checksFailure = { kind: checksResult.kind, stage: "prChecks", error: checksResult.error };
    }
  } else {
    // No cache: prView and prChecks in parallel
    const [prViewResult, checksResult] = await Promise.all([
      deps.prViewAsync(repoRoot, prNumber, ["reviewDecision", "mergeable", "updatedAt", "createdAt"]),
      deps.prChecksAsync(repoRoot, prNumber),
    ]);
    if (!prViewResult.ok) return pollFailure("prView", prViewResult.kind, prViewResult.error, formatOpenPrStatus(id, prNumber));
    const prData = prViewResult.data;
    reviewDecision = (prData.reviewDecision as string) ?? "";
    isMergeable = (prData.mergeable as string) ?? "";
    prUpdatedAt = (prData.updatedAt as string) ?? "";
    prCreatedAt = (prData.createdAt as string) ?? "";
    checksData = checksResult.ok ? checksResult.data : [];
    if (!checksResult.ok) {
      checksFailure = { kind: checksResult.kind, stage: "prChecks", error: checksResult.error };
    }
  }

  let gracePeriodMs = CI_GRACE_PERIOD_MS;
  if (filterRelevantChecks(checksData).length === 0) {
    const { hasPrWorkflows } = detectWorkflowPresence(repoRoot);
    if (!hasPrWorkflows) gracePeriodMs = NO_CI_GRACE_PERIOD_MS;
  }

  const { ciStatus, eventTime: ciEventTime } = processChecks(checksData, prCreatedAt, new Date(), gracePeriodMs);
  const status = derivePrStatus(ciStatus, isMergeable, reviewDecision);
  const eventTime = ciEventTime ?? prUpdatedAt;

  const result: PrStatusPollResult = {
    statusLine: `${id}\t${prNumber}\t${status}\t${isMergeable || "UNKNOWN"}\t${eventTime}`,
  };
  if (checksFailure) {
    result.failure = { kind: checksFailure.kind as GhFailureKind, stage: checksFailure.stage as PrPollFailureStage, error: checksFailure.error };
  }
  return result;
}

export function findTransitions(currentState: string, prevState: string): string {
  let transitions = "";
  for (const line of currentState.split("\n")) {
    if (!line) continue;
    const [id, prNumber, status] = line.split("\t");
    if (!id) continue;

    let prevStatus = "no-pr";
    if (prevState) {
      for (const prevLine of prevState.split("\n")) {
        const parts = prevLine.split("\t");
        if (parts[0] === id) {
          prevStatus = parts[2] ?? "no-pr";
          break;
        }
      }
    }

    if (prevStatus !== status) {
      transitions += `${id}\t${prNumber ?? ""}\t${prevStatus}\t${status}\n`;
    }
  }
  return transitions;
}

export function findGoneItems(currentState: string, prevState: string): string {
  if (!prevState) return "";
  let transitions = "";
  const currentIds = new Set(
    currentState
      .split("\n")
      .filter(Boolean)
      .map((l) => l.split("\t")[0]),
  );

  for (const line of prevState.split("\n")) {
    if (!line) continue;
    const [id, prNumber, status] = line.split("\t");
    if (!id) continue;
    if (!currentIds.has(id)) {
      transitions += `${id}\t${prNumber ?? ""}\t${status ?? ""}\tgone\n`;
    }
  }
  return transitions;
}

/**
 * Poll until PR has new activity (reviews, comments).
 */
export async function cmdPrWatch(
  args: string[],
  projectRoot: string,
  deps: PrMonitorDeps = defaultPrMonitorDeps,
): Promise<void> {
  let prNumber = "";
  let interval = 120;
  let since = "";

  // Parse args
  let i = 0;
  while (i < args.length) {
    switch (args[i]) {
      case "--pr":
        prNumber = args[i + 1] ?? "";
        i += 2;
        break;
      case "--interval":
        interval = parseInt(args[i + 1] ?? "120", 10);
        i += 2;
        break;
      case "--since":
        since = args[i + 1] ?? "";
        i += 2;
        break;
      default:
        die(`Unknown option: ${args[i]}`);
    }
  }

  if (!prNumber) {
    die("Usage: ninthwave pr-watch --pr N [--interval N] [--since T]");
  }

  if (!since) {
    since = new Date().toISOString();
  }

  let elapsed = 0;
  while (elapsed < 3600) {
    await new Promise((r) => setTimeout(r, interval * 1000));
    elapsed += interval;

    let ownerRepo: string;
    try {
      ownerRepo = deps.getRepoOwner(projectRoot);
    } catch {
      continue;
    }

    // Check for new reviews (trusted authors only)
    let newReviews = 0;
    try {
      const result = deps.apiGet(
        projectRoot,
        `repos/${ownerRepo}/pulls/${prNumber}/reviews`,
        `[.[] | select(.submitted_at > "${since}" and ${TRUSTED_ASSOC})] | length`,
      );
      newReviews = parseInt(result, 10) || 0;
    } catch {
      // ignore
    }

    // Check for new comments (trusted authors only)
    let newComments = 0;
    try {
      const result = deps.apiGet(
        projectRoot,
        `repos/${ownerRepo}/issues/${prNumber}/comments`,
        `[.[] | select(.created_at > "${since}" and ${TRUSTED_ASSOC})] | length`,
      );
      newComments = parseInt(result, 10) || 0;
    } catch {
      // ignore
    }

    // Check for new review comments (trusted authors only)
    let newReviewComments = 0;
    try {
      const result = deps.apiGet(
        projectRoot,
        `repos/${ownerRepo}/pulls/${prNumber}/comments`,
        `[.[] | select(.created_at > "${since}" and ${TRUSTED_ASSOC})] | length`,
      );
      newReviewComments = parseInt(result, 10) || 0;
    } catch {
      // ignore
    }

    const total = newReviews + newComments + newReviewComments;
    if (total > 0) {
      console.log(`activity\t${prNumber}\t${total}`);
      return;
    }

    // Check if PR state changed
    try {
      const viewResult = deps.prView(projectRoot, parseInt(prNumber, 10), ["state"]);
      if (viewResult.ok) {
        const state = viewResult.data.state as string;
        if (state === "MERGED" || state === "CLOSED") {
          console.log(`state_change\t${prNumber}\t${state}`);
          return;
        }
      }
    } catch {
      // ignore
    }
  }

  console.log(`Timeout: no activity on PR #${prNumber} after 1 hour`);
  process.exit(1);
}

/**
 * Check for new comments/reviews on PRs since a given time.
 */
export function cmdPrActivity(
  args: string[],
  projectRoot: string,
  deps: PrMonitorDeps = defaultPrMonitorDeps,
): void {
  const prs: string[] = [];
  let since = "";

  // Parse args
  let i = 0;
  while (i < args.length) {
    if (args[i] === "--since") {
      since = args[i + 1] ?? "";
      i += 2;
    } else {
      prs.push(args[i]!);
      i++;
    }
  }

  if (prs.length < 1) {
    die("Usage: ninthwave pr-activity <PR1> [PR2]... [--since T]");
  }

  if (!since) {
    // Default to 1 hour ago
    since = new Date(Date.now() - 3600 * 1000).toISOString();
  }

  let ownerRepo: string;
  try {
    ownerRepo = deps.getRepoOwner(projectRoot);
  } catch {
    die("Could not determine repository");
  }

  for (const pr of prs) {
    let activityType = "none";

    // Check for review decisions (trusted authors only)
    try {
      const reviewState = deps.apiGet(
        projectRoot,
        `repos/${ownerRepo}/pulls/${pr}/reviews`,
        `[.[] | select(.submitted_at > "${since}" and ${TRUSTED_ASSOC})] | last | .state`,
      );
      if (reviewState === "CHANGES_REQUESTED") {
        activityType = "changes_requested";
      } else if (reviewState === "APPROVED") {
        activityType = "approved";
      }
    } catch {
      // ignore
    }

    // Check for new comments (trusted authors only)
    try {
      const result = deps.apiGet(
        projectRoot,
        `repos/${ownerRepo}/issues/${pr}/comments`,
        `[.[] | select(.created_at > "${since}" and ${TRUSTED_ASSOC})] | length`,
      );
      const count = parseInt(result, 10) || 0;
      if (count > 0 && activityType === "none") {
        activityType = "new_comments";
      }
    } catch {
      // ignore
    }

    // Check for new review comments (trusted authors only, inline)
    try {
      const result = deps.apiGet(
        projectRoot,
        `repos/${ownerRepo}/pulls/${pr}/comments`,
        `[.[] | select(.created_at > "${since}" and ${TRUSTED_ASSOC})] | length`,
      );
      const count = parseInt(result, 10) || 0;
      if (count > 0 && activityType === "none") {
        activityType = "new_comments";
      }
    } catch {
      // ignore
    }

    console.log(`${pr}\t${activityType}`);
  }
}

// Tests for core/orchestrator.ts — Orchestrator state machine and action execution.

import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";

// Mock external dependencies used by executeAction
vi.mock("../core/gh.ts", () => ({
  prMerge: vi.fn(() => true),
  prComment: vi.fn(() => true),
}));

vi.mock("../core/cmux.ts", () => ({
  sendMessage: vi.fn(() => true),
  closeWorkspace: vi.fn(() => true),
}));

vi.mock("../core/git.ts", () => ({
  fetchOrigin: vi.fn(),
  ffMerge: vi.fn(),
}));

vi.mock("../core/commands/start.ts", () => ({
  launchSingleItem: vi.fn(() => ({
    worktreePath: "/tmp/test/todo-test",
    workspaceRef: "workspace:1",
  })),
}));

vi.mock("../core/commands/clean.ts", () => ({
  cleanSingleWorktree: vi.fn(() => true),
}));

vi.mock("../core/commands/mark-done.ts", () => ({
  cmdMarkDone: vi.fn(),
}));

// Import mocked modules for assertions
import * as gh from "../core/gh.ts";
import * as cmuxMock from "../core/cmux.ts";
import * as gitMock from "../core/git.ts";
import { launchSingleItem } from "../core/commands/start.ts";
import { cleanSingleWorktree } from "../core/commands/clean.ts";
import { cmdMarkDone } from "../core/commands/mark-done.ts";

import {
  Orchestrator,
  DEFAULT_CONFIG,
  type OrchestratorItem,
  type PollSnapshot,
  type ItemSnapshot,
  type Action,
  type ExecutionContext,
  type ActionResult,
} from "../core/orchestrator.ts";
import type { TodoItem } from "../core/types.ts";

// ── Helpers ──────────────────────────────────────────────────────────

function makeTodo(id: string, deps: string[] = []): TodoItem {
  return {
    id,
    priority: "high",
    title: `TODO ${id}`,
    domain: "test",
    dependencies: deps,
    bundleWith: [],
    status: "open",
    lineNumber: 1,
    lineEndNumber: 5,
    repoAlias: "",
    rawText: `## ${id}\nTest todo`,
    filePaths: [],
  };
}

function emptySnapshot(readyIds: string[] = []): PollSnapshot {
  return { items: [], readyIds };
}

function snapshotWith(
  items: ItemSnapshot[],
  readyIds: string[] = [],
): PollSnapshot {
  return { items, readyIds };
}

const defaultCtx: ExecutionContext = {
  projectRoot: "/tmp/test-project",
  worktreeDir: "/tmp/test-project/.worktrees",
  todosFile: "/tmp/test-project/TODOS.md",
  aiTool: "claude",
};

// ── Tests ────────────────────────────────────────────────────────────

describe("Orchestrator", () => {
  let orch: Orchestrator;

  beforeEach(() => {
    orch = new Orchestrator();
    vi.clearAllMocks();
  });

  // ── 1. Item management ─────────────────────────────────────────

  it("adds items in queued state", () => {
    orch.addItem(makeTodo("H-1-1"));

    const item = orch.getItem("H-1-1");
    expect(item).toBeDefined();
    expect(item!.state).toBe("queued");
    expect(item!.ciFailCount).toBe(0);
  });

  it("lists all items", () => {
    orch.addItem(makeTodo("H-1-1"));
    orch.addItem(makeTodo("H-1-2"));
    orch.addItem(makeTodo("H-1-3"));

    expect(orch.getAllItems()).toHaveLength(3);
  });

  it("filters items by state", () => {
    orch.addItem(makeTodo("H-1-1"));
    orch.addItem(makeTodo("H-1-2"));
    orch.setState("H-1-1", "ready");

    expect(orch.getItemsByState("queued")).toHaveLength(1);
    expect(orch.getItemsByState("ready")).toHaveLength(1);
  });

  // ── 2. Queued → Ready when deps are met ────────────────────────

  it("promotes queued items to ready when deps are met", () => {
    orch.addItem(makeTodo("H-1-1"));
    orch.addItem(makeTodo("H-1-2", ["H-1-1"]));

    orch.processTransitions(emptySnapshot(["H-1-1"]));

    expect(orch.getItem("H-1-1")!.state).toBe("launching");
    expect(orch.getItem("H-1-2")!.state).toBe("queued");
  });

  it("does not promote items whose deps are not in readyIds", () => {
    orch.addItem(makeTodo("H-1-1", ["H-1-0"]));

    orch.processTransitions(emptySnapshot([]));

    expect(orch.getItem("H-1-1")!.state).toBe("queued");
  });

  // ── 3. Ready → Launching with WIP limit ────────────────────────

  it("launches ready items up to WIP limit", () => {
    orch = new Orchestrator({ wipLimit: 2 });

    orch.addItem(makeTodo("H-1-1"));
    orch.addItem(makeTodo("H-1-2"));
    orch.addItem(makeTodo("H-1-3"));

    const actions = orch.processTransitions(
      emptySnapshot(["H-1-1", "H-1-2", "H-1-3"]),
    );

    const launchActions = actions.filter((a) => a.type === "launch");
    expect(launchActions).toHaveLength(2);
    expect(orch.getItem("H-1-1")!.state).toBe("launching");
    expect(orch.getItem("H-1-2")!.state).toBe("launching");
    expect(orch.getItem("H-1-3")!.state).toBe("ready");
  });

  it("respects WIP limit across existing WIP items", () => {
    orch = new Orchestrator({ wipLimit: 2 });

    orch.addItem(makeTodo("H-1-1"));
    orch.addItem(makeTodo("H-1-2"));
    orch.setState("H-1-1", "implementing"); // already in WIP

    const actions = orch.processTransitions(
      snapshotWith(
        [{ id: "H-1-1", workerAlive: true }],
        ["H-1-2"],
      ),
    );

    const launchActions = actions.filter((a) => a.type === "launch");
    expect(launchActions).toHaveLength(1);
    expect(launchActions[0]!.itemId).toBe("H-1-2");
  });

  // ── 4. Launching → Implementing ───────────────────────────────

  it("transitions launching to implementing when worker is alive", () => {
    orch.addItem(makeTodo("H-1-1"));
    orch.setState("H-1-1", "launching");

    orch.processTransitions(
      snapshotWith([{ id: "H-1-1", workerAlive: true }]),
    );

    expect(orch.getItem("H-1-1")!.state).toBe("implementing");
  });

  // ── 5. Implementing → PR open ─────────────────────────────────

  it("transitions implementing to pr-open when PR appears", () => {
    orch.addItem(makeTodo("H-1-1"));
    orch.setState("H-1-1", "implementing");

    orch.processTransitions(
      snapshotWith([
        { id: "H-1-1", prNumber: 42, prState: "open", workerAlive: true },
      ]),
    );

    expect(orch.getItem("H-1-1")!.state).toBe("pr-open");
    expect(orch.getItem("H-1-1")!.prNumber).toBe(42);
  });

  it("marks implementing as stuck when worker dies without PR", () => {
    orch.addItem(makeTodo("H-1-1"));
    orch.setState("H-1-1", "implementing");

    orch.processTransitions(
      snapshotWith([{ id: "H-1-1", workerAlive: false }]),
    );

    expect(orch.getItem("H-1-1")!.state).toBe("stuck");
  });

  // ── 6. CI pass → merge action (asap strategy) ─────────────────

  it("CI pass triggers merge action with asap strategy", () => {
    orch = new Orchestrator({ mergeStrategy: "asap" });
    orch.addItem(makeTodo("H-1-1"));
    orch.setState("H-1-1", "pr-open");
    orch.getItem("H-1-1")!.prNumber = 42;

    const actions = orch.processTransitions(
      snapshotWith([{ id: "H-1-1", ciStatus: "pass", prState: "open" }]),
    );

    expect(orch.getItem("H-1-1")!.state).toBe("merging");
    const mergeActions = actions.filter((a) => a.type === "merge");
    expect(mergeActions).toHaveLength(1);
    expect(mergeActions[0]!.prNumber).toBe(42);
  });

  // ── 7. CI fail → notify-ci-failure action ──────────────────────

  it("CI fail triggers notify-ci-failure action", () => {
    orch.addItem(makeTodo("H-1-1"));
    orch.setState("H-1-1", "pr-open");
    orch.getItem("H-1-1")!.prNumber = 42;

    const actions = orch.processTransitions(
      snapshotWith([{ id: "H-1-1", ciStatus: "fail", prState: "open" }]),
    );

    expect(orch.getItem("H-1-1")!.state).toBe("ci-failed");
    const notifyActions = actions.filter((a) => a.type === "notify-ci-failure");
    expect(notifyActions).toHaveLength(1);
    expect(notifyActions[0]!.message).toContain("CI failed");
  });

  it("CI fail increments ciFailCount", () => {
    orch.addItem(makeTodo("H-1-1"));
    orch.setState("H-1-1", "pr-open");

    orch.processTransitions(
      snapshotWith([{ id: "H-1-1", ciStatus: "fail", prState: "open" }]),
    );

    expect(orch.getItem("H-1-1")!.ciFailCount).toBe(1);
  });

  // ── 8. CI fail recovery ────────────────────────────────────────

  it("ci-failed recovers when CI passes (chains to merge evaluation)", () => {
    // With "ask" strategy, we can observe ci-passed intermediate state
    orch = new Orchestrator({ mergeStrategy: "ask" });
    orch.addItem(makeTodo("H-1-1"));
    orch.setState("H-1-1", "ci-failed");
    orch.getItem("H-1-1")!.ciFailCount = 1;

    orch.processTransitions(
      snapshotWith([{ id: "H-1-1", ciStatus: "pass", prState: "open" }]),
    );

    // "ask" strategy moves to review-pending instead of merging
    expect(orch.getItem("H-1-1")!.state).toBe("review-pending");
  });

  it("ci-failed with asap strategy chains CI pass to merge", () => {
    orch = new Orchestrator({ mergeStrategy: "asap" });
    orch.addItem(makeTodo("H-1-1"));
    orch.setState("H-1-1", "ci-failed");
    orch.getItem("H-1-1")!.ciFailCount = 1;

    const actions = orch.processTransitions(
      snapshotWith([{ id: "H-1-1", ciStatus: "pass", prState: "open" }]),
    );

    expect(orch.getItem("H-1-1")!.state).toBe("merging");
    expect(actions.some((a) => a.type === "merge")).toBe(true);
  });

  it("marks stuck after exceeding max CI retries", () => {
    orch = new Orchestrator({ maxCiRetries: 1 });
    orch.addItem(makeTodo("H-1-1"));
    orch.setState("H-1-1", "ci-failed");
    orch.getItem("H-1-1")!.ciFailCount = 2; // exceeds maxCiRetries of 1

    orch.processTransitions(
      snapshotWith([{ id: "H-1-1", ciStatus: "fail", prState: "open" }]),
    );

    expect(orch.getItem("H-1-1")!.state).toBe("stuck");
  });

  // ── 9. PR merged → clean action ───────────────────────────────

  it("PR merged triggers clean action from ci-passed state", () => {
    orch.addItem(makeTodo("H-1-1"));
    orch.setState("H-1-1", "ci-passed");
    orch.getItem("H-1-1")!.prNumber = 42;

    const actions = orch.processTransitions(
      snapshotWith([{ id: "H-1-1", prState: "merged" }]),
    );

    expect(orch.getItem("H-1-1")!.state).toBe("merged");
    const cleanActions = actions.filter((a) => a.type === "clean");
    expect(cleanActions).toHaveLength(1);
    expect(cleanActions[0]!.itemId).toBe("H-1-1");
  });

  it("PR merged triggers clean action from merging state", () => {
    orch.addItem(makeTodo("H-1-1"));
    orch.setState("H-1-1", "merging");
    orch.getItem("H-1-1")!.prNumber = 42;

    const actions = orch.processTransitions(
      snapshotWith([{ id: "H-1-1", prState: "merged" }]),
    );

    expect(orch.getItem("H-1-1")!.state).toBe("merged");
    const cleanActions = actions.filter((a) => a.type === "clean");
    expect(cleanActions).toHaveLength(1);
  });

  // ── 10. Merged → Done ─────────────────────────────────────────

  it("merged transitions to done on next cycle", () => {
    orch.addItem(makeTodo("H-1-1"));
    orch.setState("H-1-1", "merged");

    orch.processTransitions(emptySnapshot());

    expect(orch.getItem("H-1-1")!.state).toBe("done");
  });

  // ── 11. Batch complete → launch next ───────────────────────────

  it("launches next batch when previous items complete", () => {
    orch = new Orchestrator({ wipLimit: 1 });

    orch.addItem(makeTodo("H-1-1"));
    orch.addItem(makeTodo("H-1-2"));
    orch.setState("H-1-1", "merged"); // will transition to done

    // H-1-2 is ready, H-1-1 frees WIP slot by going to done
    const actions = orch.processTransitions(
      emptySnapshot(["H-1-2"]),
    );

    expect(orch.getItem("H-1-1")!.state).toBe("done");
    expect(orch.getItem("H-1-2")!.state).toBe("launching");
    const launchActions = actions.filter((a) => a.type === "launch");
    expect(launchActions).toHaveLength(1);
    expect(launchActions[0]!.itemId).toBe("H-1-2");
  });

  // ── 12. Merge strategy: approved ───────────────────────────────

  it("approved strategy waits for review before merging", () => {
    orch = new Orchestrator({ mergeStrategy: "approved" });
    orch.addItem(makeTodo("H-1-1"));
    orch.setState("H-1-1", "pr-open");
    orch.getItem("H-1-1")!.prNumber = 42;

    const actions = orch.processTransitions(
      snapshotWith([
        { id: "H-1-1", ciStatus: "pass", prState: "open", reviewDecision: "" },
      ]),
    );

    // Should move to review-pending, not merging
    expect(orch.getItem("H-1-1")!.state).toBe("review-pending");
    const mergeActions = actions.filter((a) => a.type === "merge");
    expect(mergeActions).toHaveLength(0);
  });

  it("approved strategy merges after review approval", () => {
    orch = new Orchestrator({ mergeStrategy: "approved" });
    orch.addItem(makeTodo("H-1-1"));
    orch.setState("H-1-1", "review-pending");
    orch.getItem("H-1-1")!.prNumber = 42;

    const actions = orch.processTransitions(
      snapshotWith([
        {
          id: "H-1-1",
          ciStatus: "pass",
          prState: "open",
          reviewDecision: "APPROVED",
        },
      ]),
    );

    expect(orch.getItem("H-1-1")!.state).toBe("merging");
    const mergeActions = actions.filter((a) => a.type === "merge");
    expect(mergeActions).toHaveLength(1);
  });

  // ── 13. Merge strategy: ask ────────────────────────────────────

  it("ask strategy never auto-merges", () => {
    orch = new Orchestrator({ mergeStrategy: "ask" });
    orch.addItem(makeTodo("H-1-1"));
    orch.setState("H-1-1", "pr-open");
    orch.getItem("H-1-1")!.prNumber = 42;

    const actions = orch.processTransitions(
      snapshotWith([
        {
          id: "H-1-1",
          ciStatus: "pass",
          prState: "open",
          reviewDecision: "APPROVED",
        },
      ]),
    );

    // Should not produce merge action
    expect(orch.getItem("H-1-1")!.state).toBe("review-pending");
    const mergeActions = actions.filter((a) => a.type === "merge");
    expect(mergeActions).toHaveLength(0);
  });

  // ── 14. ci-pending transitions ─────────────────────────────────

  it("ci-pending chains CI pass through merge evaluation", () => {
    // With "ask" strategy, CI pass goes to review-pending (not merging)
    orch = new Orchestrator({ mergeStrategy: "ask" });
    orch.addItem(makeTodo("H-1-1"));
    orch.setState("H-1-1", "ci-pending");

    orch.processTransitions(
      snapshotWith([{ id: "H-1-1", ciStatus: "pass", prState: "open" }]),
    );

    expect(orch.getItem("H-1-1")!.state).toBe("review-pending");
  });

  it("ci-pending with asap strategy chains CI pass to merge", () => {
    orch = new Orchestrator({ mergeStrategy: "asap" });
    orch.addItem(makeTodo("H-1-1"));
    orch.setState("H-1-1", "ci-pending");

    const actions = orch.processTransitions(
      snapshotWith([{ id: "H-1-1", ciStatus: "pass", prState: "open" }]),
    );

    expect(orch.getItem("H-1-1")!.state).toBe("merging");
    expect(actions.some((a) => a.type === "merge")).toBe(true);
  });

  it("ci-pending transitions to ci-failed when CI fails", () => {
    orch.addItem(makeTodo("H-1-1"));
    orch.setState("H-1-1", "ci-pending");

    const actions = orch.processTransitions(
      snapshotWith([{ id: "H-1-1", ciStatus: "fail", prState: "open" }]),
    );

    expect(orch.getItem("H-1-1")!.state).toBe("ci-failed");
    expect(actions.some((a) => a.type === "notify-ci-failure")).toBe(true);
  });

  // ── 15. WIP count and slots ────────────────────────────────────

  it("wipCount reflects items in WIP states", () => {
    orch = new Orchestrator({ wipLimit: 5 });

    orch.addItem(makeTodo("H-1-1"));
    orch.addItem(makeTodo("H-1-2"));
    orch.addItem(makeTodo("H-1-3"));
    orch.addItem(makeTodo("H-1-4"));

    orch.setState("H-1-1", "implementing");
    orch.setState("H-1-2", "ci-pending");
    orch.setState("H-1-3", "done"); // not WIP
    orch.setState("H-1-4", "queued"); // not WIP

    expect(orch.wipCount).toBe(2);
    expect(orch.wipSlots).toBe(3);
  });

  // ── 16. Terminal states don't transition ───────────────────────

  it("done state does not transition", () => {
    orch.addItem(makeTodo("H-1-1"));
    orch.setState("H-1-1", "done");

    const actions = orch.processTransitions(
      snapshotWith([{ id: "H-1-1", ciStatus: "pass", prState: "merged" }]),
    );

    expect(orch.getItem("H-1-1")!.state).toBe("done");
    expect(actions).toHaveLength(0);
  });

  it("stuck state does not transition", () => {
    orch.addItem(makeTodo("H-1-1"));
    orch.setState("H-1-1", "stuck");

    const actions = orch.processTransitions(
      snapshotWith([{ id: "H-1-1", ciStatus: "pass", prState: "merged" }]),
    );

    expect(orch.getItem("H-1-1")!.state).toBe("stuck");
    expect(actions).toHaveLength(0);
  });

  // ── 17. Default config ─────────────────────────────────────────

  it("uses sensible defaults", () => {
    expect(DEFAULT_CONFIG.wipLimit).toBe(4);
    expect(DEFAULT_CONFIG.mergeStrategy).toBe("asap");
    expect(DEFAULT_CONFIG.maxCiRetries).toBe(2);
  });

  // ── 18. PR merged from ci-failed state ─────────────────────────

  it("handles external merge from ci-failed state", () => {
    orch.addItem(makeTodo("H-1-1"));
    orch.setState("H-1-1", "ci-failed");
    orch.getItem("H-1-1")!.ciFailCount = 1;

    const actions = orch.processTransitions(
      snapshotWith([{ id: "H-1-1", prState: "merged", ciStatus: "pass" }]),
    );

    expect(orch.getItem("H-1-1")!.state).toBe("merged");
    expect(actions.some((a) => a.type === "clean")).toBe(true);
  });

  // ── 19. ci-failed → ci-pending (worker pushed fix, CI restarting) ──

  it("ci-failed transitions to ci-pending when CI restarts", () => {
    orch.addItem(makeTodo("H-1-1"));
    orch.setState("H-1-1", "ci-failed");
    orch.getItem("H-1-1")!.ciFailCount = 1;

    orch.processTransitions(
      snapshotWith([{ id: "H-1-1", ciStatus: "pending", prState: "open" }]),
    );

    expect(orch.getItem("H-1-1")!.state).toBe("ci-pending");
  });

  // ── 20. pr-open → ci-pending ───────────────────────────────────

  it("pr-open transitions to ci-pending when CI starts", () => {
    orch.addItem(makeTodo("H-1-1"));
    orch.setState("H-1-1", "pr-open");

    orch.processTransitions(
      snapshotWith([{ id: "H-1-1", ciStatus: "pending", prState: "open" }]),
    );

    expect(orch.getItem("H-1-1")!.state).toBe("ci-pending");
  });

  // ── 21. Multiple items complete end-to-end ─────────────────────

  it("handles full lifecycle across multiple items", () => {
    orch = new Orchestrator({ wipLimit: 2, mergeStrategy: "asap" });

    orch.addItem(makeTodo("A-1-1"));
    orch.addItem(makeTodo("A-1-2"));
    orch.addItem(makeTodo("A-1-3", ["A-1-1"]));

    // Cycle 1: Launch first two
    orch.processTransitions(emptySnapshot(["A-1-1", "A-1-2"]));
    expect(orch.getItem("A-1-1")!.state).toBe("launching");
    expect(orch.getItem("A-1-2")!.state).toBe("launching");
    expect(orch.getItem("A-1-3")!.state).toBe("queued");

    // Cycle 2: Workers are alive
    orch.processTransitions(
      snapshotWith([
        { id: "A-1-1", workerAlive: true },
        { id: "A-1-2", workerAlive: true },
      ]),
    );
    expect(orch.getItem("A-1-1")!.state).toBe("implementing");
    expect(orch.getItem("A-1-2")!.state).toBe("implementing");

    // Cycle 3: PRs opened, CI passes on A-1-1
    orch.processTransitions(
      snapshotWith([
        { id: "A-1-1", prNumber: 10, prState: "open", workerAlive: true },
        { id: "A-1-2", prNumber: 11, prState: "open", workerAlive: true },
      ]),
    );
    expect(orch.getItem("A-1-1")!.state).toBe("pr-open");
    expect(orch.getItem("A-1-2")!.state).toBe("pr-open");

    // Cycle 4: CI passes on A-1-1, triggers merge (asap)
    const cycle4 = orch.processTransitions(
      snapshotWith([
        { id: "A-1-1", ciStatus: "pass", prState: "open" },
        { id: "A-1-2", ciStatus: "pending", prState: "open" },
      ]),
    );
    expect(orch.getItem("A-1-1")!.state).toBe("merging");
    expect(orch.getItem("A-1-2")!.state).toBe("ci-pending");
    expect(cycle4.some((a) => a.type === "merge" && a.itemId === "A-1-1")).toBe(
      true,
    );

    // Cycle 5: A-1-1 merged, A-1-2 CI passes, A-1-3 deps met
    // A-1-1 frees a WIP slot → A-1-3 is promoted and launched
    const cycle5 = orch.processTransitions(
      snapshotWith(
        [
          { id: "A-1-1", prState: "merged" },
          { id: "A-1-2", ciStatus: "pass", prState: "open" },
        ],
        ["A-1-3"], // A-1-3's dep is now done
      ),
    );
    expect(orch.getItem("A-1-1")!.state).toBe("merged");
    expect(orch.getItem("A-1-2")!.state).toBe("merging");
    expect(orch.getItem("A-1-3")!.state).toBe("launching");
    expect(cycle5.some((a) => a.type === "clean" && a.itemId === "A-1-1")).toBe(
      true,
    );
    expect(
      cycle5.some((a) => a.type === "launch" && a.itemId === "A-1-3"),
    ).toBe(true);

    // Cycle 6: A-1-1 goes to done, A-1-2 merged
    const cycle6 = orch.processTransitions(
      snapshotWith([
        { id: "A-1-2", prState: "merged" },
        { id: "A-1-3", workerAlive: true },
      ]),
    );
    expect(orch.getItem("A-1-1")!.state).toBe("done");
    expect(orch.getItem("A-1-2")!.state).toBe("merged");
    expect(orch.getItem("A-1-3")!.state).toBe("implementing");
  });

  // ── 22. executeAction ─────────────────────────────────────────

  describe("executeAction", () => {
    // ── launch ────────────────────────────────────────────────

    it("launch: calls launchSingleItem and stores workspaceRef", () => {
      orch.addItem(makeTodo("H-1-1"));
      orch.setState("H-1-1", "launching");

      const result = orch.executeAction(
        { type: "launch", itemId: "H-1-1" },
        defaultCtx,
      );

      expect(result.success).toBe(true);
      expect(launchSingleItem as Mock).toHaveBeenCalledWith(
        orch.getItem("H-1-1")!.todo,
        defaultCtx.todosFile,
        defaultCtx.worktreeDir,
        defaultCtx.projectRoot,
        defaultCtx.aiTool,
      );
      expect(orch.getItem("H-1-1")!.workspaceRef).toBe("workspace:1");
    });

    it("launch: marks stuck when launchSingleItem returns null", () => {
      (launchSingleItem as Mock).mockReturnValueOnce(null);
      orch.addItem(makeTodo("H-1-1"));
      orch.setState("H-1-1", "launching");

      const result = orch.executeAction(
        { type: "launch", itemId: "H-1-1" },
        defaultCtx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Launch failed");
      expect(orch.getItem("H-1-1")!.state).toBe("stuck");
    });

    it("launch: marks stuck when launchSingleItem throws", () => {
      (launchSingleItem as Mock).mockImplementationOnce(() => {
        throw new Error("cmux not running");
      });
      orch.addItem(makeTodo("H-1-1"));
      orch.setState("H-1-1", "launching");

      const result = orch.executeAction(
        { type: "launch", itemId: "H-1-1" },
        defaultCtx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("cmux not running");
      expect(orch.getItem("H-1-1")!.state).toBe("stuck");
    });

    // ── merge ─────────────────────────────────────────────────

    it("merge: calls prMerge, posts audit comment, pulls main, transitions to merged", () => {
      orch.addItem(makeTodo("H-1-1"));
      orch.setState("H-1-1", "merging");
      orch.getItem("H-1-1")!.prNumber = 42;

      const result = orch.executeAction(
        { type: "merge", itemId: "H-1-1", prNumber: 42 },
        defaultCtx,
      );

      expect(result.success).toBe(true);
      expect(gh.prMerge as Mock).toHaveBeenCalledWith(defaultCtx.projectRoot, 42);
      expect(gh.prComment as Mock).toHaveBeenCalledWith(
        defaultCtx.projectRoot,
        42,
        expect.stringContaining("[Orchestrator]"),
      );
      expect(gitMock.fetchOrigin as Mock).toHaveBeenCalledWith(defaultCtx.projectRoot, "main");
      expect(gitMock.ffMerge as Mock).toHaveBeenCalledWith(defaultCtx.projectRoot, "main");
      expect(orch.getItem("H-1-1")!.state).toBe("merged");
    });

    it("merge: reverts to ci-passed when prMerge fails", () => {
      (gh.prMerge as Mock).mockReturnValueOnce(false);
      orch.addItem(makeTodo("H-1-1"));
      orch.setState("H-1-1", "merging");
      orch.getItem("H-1-1")!.prNumber = 42;

      const result = orch.executeAction(
        { type: "merge", itemId: "H-1-1", prNumber: 42 },
        defaultCtx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Merge failed");
      expect(orch.getItem("H-1-1")!.state).toBe("ci-passed");
    });

    it("merge: fails gracefully when no PR number", () => {
      orch.addItem(makeTodo("H-1-1"));
      orch.setState("H-1-1", "merging");

      const result = orch.executeAction(
        { type: "merge", itemId: "H-1-1" },
        defaultCtx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("No PR number");
    });

    it("merge: sends rebase requests to dependent WIP items", () => {
      orch.addItem(makeTodo("H-1-1"));
      orch.addItem(makeTodo("H-1-2", ["H-1-1"]));
      orch.setState("H-1-1", "merging");
      orch.getItem("H-1-1")!.prNumber = 42;
      orch.setState("H-1-2", "implementing");
      orch.getItem("H-1-2")!.workspaceRef = "workspace:2";

      orch.executeAction(
        { type: "merge", itemId: "H-1-1", prNumber: 42 },
        defaultCtx,
      );

      expect(cmuxMock.sendMessage as Mock).toHaveBeenCalledWith(
        "workspace:2",
        expect.stringContaining("Dependency H-1-1 merged"),
      );
    });

    it("merge: does not send rebase to non-dependent items", () => {
      orch.addItem(makeTodo("H-1-1"));
      orch.addItem(makeTodo("H-1-2")); // no dependency on H-1-1
      orch.setState("H-1-1", "merging");
      orch.getItem("H-1-1")!.prNumber = 42;
      orch.setState("H-1-2", "implementing");
      orch.getItem("H-1-2")!.workspaceRef = "workspace:2";

      orch.executeAction(
        { type: "merge", itemId: "H-1-1", prNumber: 42 },
        defaultCtx,
      );

      expect(cmuxMock.sendMessage as Mock).not.toHaveBeenCalled();
    });

    it("merge: succeeds even when fetchOrigin/ffMerge throw", () => {
      (gitMock.fetchOrigin as Mock).mockImplementationOnce(() => {
        throw new Error("network error");
      });
      orch.addItem(makeTodo("H-1-1"));
      orch.setState("H-1-1", "merging");
      orch.getItem("H-1-1")!.prNumber = 42;

      const result = orch.executeAction(
        { type: "merge", itemId: "H-1-1", prNumber: 42 },
        defaultCtx,
      );

      expect(result.success).toBe(true);
      expect(orch.getItem("H-1-1")!.state).toBe("merged");
    });

    // ── notify-ci-failure ─────────────────────────────────────

    it("notify-ci-failure: sends message to worker and posts PR comment", () => {
      orch.addItem(makeTodo("H-1-1"));
      orch.setState("H-1-1", "ci-failed");
      orch.getItem("H-1-1")!.prNumber = 42;
      orch.getItem("H-1-1")!.workspaceRef = "workspace:1";

      const result = orch.executeAction(
        {
          type: "notify-ci-failure",
          itemId: "H-1-1",
          message: "CI failed on job build",
        },
        defaultCtx,
      );

      expect(result.success).toBe(true);
      expect(cmuxMock.sendMessage as Mock).toHaveBeenCalledWith(
        "workspace:1",
        "CI failed on job build",
      );
      expect(gh.prComment as Mock).toHaveBeenCalledWith(
        defaultCtx.projectRoot,
        42,
        expect.stringContaining("CI failure detected"),
      );
    });

    it("notify-ci-failure: uses default message when none provided", () => {
      orch.addItem(makeTodo("H-1-1"));
      orch.setState("H-1-1", "ci-failed");
      orch.getItem("H-1-1")!.workspaceRef = "workspace:1";

      orch.executeAction(
        { type: "notify-ci-failure", itemId: "H-1-1" },
        defaultCtx,
      );

      expect(cmuxMock.sendMessage as Mock).toHaveBeenCalledWith(
        "workspace:1",
        "CI failed — please investigate and fix.",
      );
    });

    it("notify-ci-failure: succeeds without workspace ref (no message sent)", () => {
      orch.addItem(makeTodo("H-1-1"));
      orch.setState("H-1-1", "ci-failed");
      orch.getItem("H-1-1")!.prNumber = 42;

      const result = orch.executeAction(
        { type: "notify-ci-failure", itemId: "H-1-1" },
        defaultCtx,
      );

      expect(result.success).toBe(true);
      expect(cmuxMock.sendMessage as Mock).not.toHaveBeenCalled();
      // PR comment still posted
      expect(gh.prComment as Mock).toHaveBeenCalled();
    });

    // ── notify-review ─────────────────────────────────────────

    it("notify-review: sends review message to worker", () => {
      orch.addItem(makeTodo("H-1-1"));
      orch.setState("H-1-1", "review-pending");
      orch.getItem("H-1-1")!.workspaceRef = "workspace:1";

      const result = orch.executeAction(
        {
          type: "notify-review",
          itemId: "H-1-1",
          message: "Please address review comments on PR #42.",
        },
        defaultCtx,
      );

      expect(result.success).toBe(true);
      expect(cmuxMock.sendMessage as Mock).toHaveBeenCalledWith(
        "workspace:1",
        "Please address review comments on PR #42.",
      );
    });

    it("notify-review: uses default message when none provided", () => {
      orch.addItem(makeTodo("H-1-1"));
      orch.setState("H-1-1", "review-pending");
      orch.getItem("H-1-1")!.workspaceRef = "workspace:1";

      orch.executeAction(
        { type: "notify-review", itemId: "H-1-1" },
        defaultCtx,
      );

      expect(cmuxMock.sendMessage as Mock).toHaveBeenCalledWith(
        "workspace:1",
        "Review feedback received — please address.",
      );
    });

    it("notify-review: succeeds without workspace ref", () => {
      orch.addItem(makeTodo("H-1-1"));
      orch.setState("H-1-1", "review-pending");

      const result = orch.executeAction(
        { type: "notify-review", itemId: "H-1-1" },
        defaultCtx,
      );

      expect(result.success).toBe(true);
      expect(cmuxMock.sendMessage as Mock).not.toHaveBeenCalled();
    });

    // ── clean ─────────────────────────────────────────────────

    it("clean: closes workspace and cleans worktree", () => {
      orch.addItem(makeTodo("H-1-1"));
      orch.setState("H-1-1", "merged");
      orch.getItem("H-1-1")!.workspaceRef = "workspace:1";

      const result = orch.executeAction(
        { type: "clean", itemId: "H-1-1" },
        defaultCtx,
      );

      expect(result.success).toBe(true);
      expect(cmuxMock.closeWorkspace as Mock).toHaveBeenCalledWith("workspace:1");
      expect(cleanSingleWorktree as Mock).toHaveBeenCalledWith(
        "H-1-1",
        defaultCtx.worktreeDir,
        defaultCtx.projectRoot,
      );
    });

    it("clean: skips workspace close when no ref", () => {
      orch.addItem(makeTodo("H-1-1"));
      orch.setState("H-1-1", "merged");

      const result = orch.executeAction(
        { type: "clean", itemId: "H-1-1" },
        defaultCtx,
      );

      expect(result.success).toBe(true);
      expect(cmuxMock.closeWorkspace as Mock).not.toHaveBeenCalled();
      expect(cleanSingleWorktree as Mock).toHaveBeenCalledWith(
        "H-1-1",
        defaultCtx.worktreeDir,
        defaultCtx.projectRoot,
      );
    });

    // ── mark-done ─────────────────────────────────────────────

    it("mark-done: calls cmdMarkDone and transitions to done", () => {
      orch.addItem(makeTodo("H-1-1"));
      orch.setState("H-1-1", "merged");

      const result = orch.executeAction(
        { type: "mark-done", itemId: "H-1-1" },
        defaultCtx,
      );

      expect(result.success).toBe(true);
      expect(cmdMarkDone as Mock).toHaveBeenCalledWith(
        ["H-1-1"],
        defaultCtx.todosFile,
      );
      expect(orch.getItem("H-1-1")!.state).toBe("done");
    });

    it("mark-done: handles cmdMarkDone failure gracefully", () => {
      (cmdMarkDone as Mock).mockImplementationOnce(() => {
        throw new Error("TODOS.md not found");
      });
      orch.addItem(makeTodo("H-1-1"));
      orch.setState("H-1-1", "merged");

      const result = orch.executeAction(
        { type: "mark-done", itemId: "H-1-1" },
        defaultCtx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("TODOS.md not found");
      // State should NOT change to done on failure
      expect(orch.getItem("H-1-1")!.state).toBe("merged");
    });

    // ── rebase ────────────────────────────────────────────────

    it("rebase: sends rebase message to worker", () => {
      orch.addItem(makeTodo("H-1-1"));
      orch.setState("H-1-1", "implementing");
      orch.getItem("H-1-1")!.workspaceRef = "workspace:1";

      const result = orch.executeAction(
        { type: "rebase", itemId: "H-1-1", message: "Rebase onto main now." },
        defaultCtx,
      );

      expect(result.success).toBe(true);
      expect(cmuxMock.sendMessage as Mock).toHaveBeenCalledWith(
        "workspace:1",
        "Rebase onto main now.",
      );
    });

    it("rebase: uses default message when none provided", () => {
      orch.addItem(makeTodo("H-1-1"));
      orch.setState("H-1-1", "implementing");
      orch.getItem("H-1-1")!.workspaceRef = "workspace:1";

      orch.executeAction(
        { type: "rebase", itemId: "H-1-1" },
        defaultCtx,
      );

      expect(cmuxMock.sendMessage as Mock).toHaveBeenCalledWith(
        "workspace:1",
        "Please rebase onto latest main.",
      );
    });

    it("rebase: fails when no workspace ref", () => {
      orch.addItem(makeTodo("H-1-1"));
      orch.setState("H-1-1", "implementing");

      const result = orch.executeAction(
        { type: "rebase", itemId: "H-1-1" },
        defaultCtx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("No workspace reference");
    });

    it("rebase: fails when sendMessage returns false", () => {
      (cmuxMock.sendMessage as Mock).mockReturnValueOnce(false);
      orch.addItem(makeTodo("H-1-1"));
      orch.setState("H-1-1", "implementing");
      orch.getItem("H-1-1")!.workspaceRef = "workspace:1";

      const result = orch.executeAction(
        { type: "rebase", itemId: "H-1-1" },
        defaultCtx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to send rebase message");
    });

    // ── common error handling ─────────────────────────────────

    it("returns error for unknown item ID", () => {
      const result = orch.executeAction(
        { type: "launch", itemId: "NONEXISTENT" },
        defaultCtx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("NONEXISTENT");
      expect(result.error).toContain("not found");
    });
  });
});

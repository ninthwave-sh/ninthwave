// Tests for checkPrStatusAsync and buildSnapshotAsync.
// Uses dependency injection and gh-module-level spies per project conventions.
// Avoids vi.spyOn(shell, "run") which leaks across files (gh.test.ts also spies on it).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkPrStatusAsync } from "../core/commands/pr-monitor.ts";
import { buildSnapshotAsync } from "../core/commands/orchestrate.ts";
import {
  Orchestrator,
  type PollSnapshot,
  type ItemSnapshot,
} from "../core/orchestrator.ts";
import type { WorkItem } from "../core/types.ts";
import type { Multiplexer } from "../core/mux.ts";
import * as gh from "../core/gh.ts";

// Spy on gh-module async functions (unique to this test file -- no other file spies on these)
const isAvailableSpy = vi.spyOn(gh, "isAvailable");
const prListAsyncSpy = vi.spyOn(gh, "prListAsync");
const prViewAsyncSpy = vi.spyOn(gh, "prViewAsync");
const prChecksAsyncSpy = vi.spyOn(gh, "prChecksAsync");

beforeEach(() => {
  isAvailableSpy.mockReset();
  prListAsyncSpy.mockReset();
  prViewAsyncSpy.mockReset();
  prChecksAsyncSpy.mockReset();
  // Default: gh is available
  isAvailableSpy.mockReturnValue(true);
});

afterEach(() => {
  isAvailableSpy.mockReset();
  prListAsyncSpy.mockReset();
  prViewAsyncSpy.mockReset();
  prChecksAsyncSpy.mockReset();
});

// ── checkPrStatusAsync ──────────────────────────────────────────────

describe("checkPrStatusAsync", () => {
  it("returns open PR with CI info", async () => {
    prListAsyncSpy.mockImplementation(async (_root: string, _branch: string, state: string) => {
      if (state === "open") return [{ number: 10, title: "Fix" }];
      return [];
    });
    prViewAsyncSpy.mockResolvedValue({
      reviewDecision: "",
      mergeable: "MERGEABLE",
      updatedAt: "2026-01-01T00:00:00Z",
    });
    prChecksAsyncSpy.mockResolvedValue([
      { state: "SUCCESS", name: "test", url: "https://ci/1", completedAt: "2026-01-01T01:00:00Z" },
    ]);

    const result = await checkPrStatusAsync("T-1-1", "/repo");

    expect(result).toContain("T-1-1");
    expect(result).toContain("10");
    expect(result).toContain("ci-passed");
  });

  it("returns merged PR", async () => {
    prListAsyncSpy.mockImplementation(async (_root: string, _branch: string, state: string) => {
      if (state === "open") return [];
      if (state === "merged") return [{ number: 5, title: "Done" }];
      return [];
    });

    const result = await checkPrStatusAsync("T-1-1", "/repo");

    expect(result).toContain("merged");
    expect(result).toContain("5");
    expect(result).toContain("Done");
  });

  it("returns no-pr when no PRs found", async () => {
    prListAsyncSpy.mockResolvedValue([]);

    const result = await checkPrStatusAsync("T-1-1", "/repo");

    expect(result).toContain("no-pr");
  });

  it("returns empty string when gh unavailable", async () => {
    isAvailableSpy.mockReturnValue(false);

    const result = await checkPrStatusAsync("T-1-1", "/repo");

    expect(result).toBe("");
  });
});

// ── buildSnapshotAsync ──────────────────────────────────────────────

function makeWorkItem(id: string, deps: string[] = []): WorkItem {
  return {
    id,
    priority: "high",
    title: `Item ${id}`,
    domain: "test",
    dependencies: deps,
    bundleWith: [],
    status: "open",
    filePath: "",
    repoAlias: "",
    rawText: `## ${id}\nTest item`,
    filePaths: [],
    testPlan: "",
    bootstrap: false,
  };
}

const fakeMux: Multiplexer = {
  type: "cmux" as const,
  isAvailable: () => false,
  diagnoseUnavailable: () => "not available",
  launchWorkspace: () => null,
  splitPane: () => null,
  sendMessage: () => true,
  readScreen: () => "",
  listWorkspaces: () => "",
  closeWorkspace: () => true,
};

describe("buildSnapshotAsync", () => {
  it("assembles snapshot from async checkPr results", async () => {
    const orch = new Orchestrator();
    orch.addItem(makeWorkItem("BA-1-1"));
    orch.getItem("BA-1-1")!.reviewCompleted = true;
    orch.setState("BA-1-1", "implementing");

    const asyncCheckPr = async (_id: string, _root: string) => {
      return "BA-1-1\t10\tci-passed\tMERGEABLE\t2026-01-01T00:00:00Z";
    };

    const snapshot = await buildSnapshotAsync(
      orch,
      "/project",
      "/project/.worktrees",
      fakeMux,
      () => null,
      asyncCheckPr,
    );

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]!.prNumber).toBe(10);
    expect(snapshot.items[0]!.ciStatus).toBe("pass");
    expect(snapshot.items[0]!.isMergeable).toBe(true);
  });

  it("skips terminal states", async () => {
    const orch = new Orchestrator();
    orch.addItem(makeWorkItem("BA-2-1"));
    orch.getItem("BA-2-1")!.reviewCompleted = true;
    orch.setState("BA-2-1", "done");

    const asyncCheckPr = vi.fn(async () => null);

    const snapshot = await buildSnapshotAsync(
      orch,
      "/project",
      "/project/.worktrees",
      fakeMux,
      () => null,
      asyncCheckPr,
    );

    expect(snapshot.items).toHaveLength(0);
    expect(asyncCheckPr).not.toHaveBeenCalled();
  });

  it("computes readyIds for queued items with met dependencies", async () => {
    const orch = new Orchestrator();
    orch.addItem(makeWorkItem("BA-3-1"));
    orch.addItem(makeWorkItem("BA-3-2", ["BA-3-1"]));
    orch.getItem("BA-3-1")!.reviewCompleted = true;
    orch.setState("BA-3-1", "done");

    const asyncCheckPr = vi.fn(async () => null);

    const snapshot = await buildSnapshotAsync(
      orch,
      "/project",
      "/project/.worktrees",
      fakeMux,
      () => null,
      asyncCheckPr,
    );

    expect(snapshot.readyIds).toContain("BA-3-2");
  });

  it("handles checkPr failure gracefully", async () => {
    const orch = new Orchestrator();
    orch.addItem(makeWorkItem("BA-4-1"));
    orch.getItem("BA-4-1")!.reviewCompleted = true;
    orch.setState("BA-4-1", "implementing");

    const asyncCheckPr = async (_id: string, _root: string) => null;

    const snapshot = await buildSnapshotAsync(
      orch,
      "/project",
      "/project/.worktrees",
      fakeMux,
      () => null,
      asyncCheckPr,
    );

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]!.id).toBe("BA-4-1");
    expect(snapshot.items[0]!.prNumber).toBeUndefined();
  });

  it("processes merged PR status", async () => {
    const orch = new Orchestrator();
    orch.addItem(makeWorkItem("BA-5-1"));
    orch.getItem("BA-5-1")!.reviewCompleted = true;
    orch.setState("BA-5-1", "merging");

    const asyncCheckPr = async () => "BA-5-1\t20\tmerged\t\t\tItem BA-5-1";

    const snapshot = await buildSnapshotAsync(
      orch,
      "/project",
      "/project/.worktrees",
      fakeMux,
      () => null,
      asyncCheckPr,
    );

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]!.prState).toBe("merged");
    expect(snapshot.items[0]!.prNumber).toBe(20);
  });
});

// Scenario test: watch mode loop discovers new work items after initial items complete.
// Exercises orchestrateLoop with config.watch=true and an injected scanWorkItems function.

import { describe, it, expect, vi } from "vitest";
import { Orchestrator } from "../../core/orchestrator.ts";
import { orchestrateLoop } from "../../core/commands/orchestrate.ts";
import { FakeGitHub } from "../fakes/fake-github.ts";
import { FakeMux } from "../fakes/fake-mux.ts";
import {
  makeWorkItem,
  defaultCtx,
  buildActionDeps,
  buildLoopDeps,
  completeItem,
} from "./helpers.ts";

function makeOrch(): Orchestrator {
  return new Orchestrator({
    maxInflight: 5,
    mergeStrategy: "auto",
    bypassEnabled: false,
    enableStacking: false,
    fixForward: false,
  });
}

describe("scenario: watch mode", () => {
  it("discovers new items during an active run before watch idle mode", async () => {
    const fakeGh = new FakeGitHub();
    const fakeMux = new FakeMux();
    const orch = new Orchestrator({
      maxInflight: 1,
      mergeStrategy: "auto",
      bypassEnabled: false,
      enableStacking: false,
      fixForward: false,
    });

    orch.addItem(makeWorkItem("W-1"));

    const actionDeps = buildActionDeps(fakeGh, fakeMux);
    const loopDeps = buildLoopDeps(fakeGh, fakeMux, actionDeps);

    let scanCallCount = 0;
    loopDeps.scanWorkItems = vi.fn(() => {
      scanCallCount++;
      if (scanCallCount === 1) return [makeWorkItem("W-1")];
      return [makeWorkItem("W-1"), makeWorkItem("W-2")];
    });

    loopDeps.sleep = async () => {
      for (const id of ["W-1", "W-2"]) {
        const orchItem = orch.getItem(id);
        if (orchItem?.state === "implementing" && !fakeGh.getPR(`ninthwave/${id}`)) {
          completeItem(id, fakeGh, orch);
        }
      }
    };

    await orchestrateLoop(orch, defaultCtx, loopDeps, {
      maxIterations: 40,
      watch: true,
      watchIntervalMs: 0,
    });

    expect(orch.getItem("W-1")?.state).toBe("done");
    expect(orch.getItem("W-2")?.state).toBe("done");

    const watchNewLogs = loopDeps.__logs.filter((l) => l.event === "watch_new_items");
    expect(watchNewLogs).toHaveLength(1);
    expect(watchNewLogs[0]?.newIds).toEqual(["W-2"]);

    const watchNewIndex = loopDeps.__logs.findIndex((l) => l.event === "watch_new_items");
    const watchWaitIndex = loopDeps.__logs.findIndex((l) => l.event === "watch_mode_waiting");
    expect(watchNewIndex).toBeGreaterThanOrEqual(0);
    expect(watchWaitIndex === -1 || watchNewIndex < watchWaitIndex).toBe(true);
  });

  it("starts the first newly discovered item when the queue begins empty", async () => {
    const fakeGh = new FakeGitHub();
    const fakeMux = new FakeMux();
    const orch = makeOrch();

    const actionDeps = buildActionDeps(fakeGh, fakeMux);
    const loopDeps = buildLoopDeps(fakeGh, fakeMux, actionDeps);

    const launchOrder: string[] = [];
    const origLaunch = actionDeps.workers.launchSingleItem;
    actionDeps.workers.launchSingleItem = vi.fn((item, wd, wtd, pr, ai, bb) => {
      launchOrder.push(item.id);
      return (origLaunch as Function)(item, wd, wtd, pr, ai, bb);
    });

    loopDeps.scanWorkItems = vi.fn(() => [makeWorkItem("W-0")]);
    loopDeps.sleep = async () => {
      const orchItem = orch.getItem("W-0");
      if (orchItem?.state === "implementing" && !fakeGh.getPR("ninthwave/W-0")) {
        completeItem("W-0", fakeGh, orch);
      }
    };

    await orchestrateLoop(orch, defaultCtx, loopDeps, {
      maxIterations: 60,
      watch: true,
    });

    expect(orch.getItem("W-0")?.state).toBe("done");
    expect(launchOrder).toEqual(["W-0"]);

    const watchWaitLog = loopDeps.__logs.find((l) => l.event === "watch_mode_waiting");
    expect(watchWaitLog).toBeDefined();

    const watchNewLog = loopDeps.__logs.find((l) => l.event === "watch_new_items");
    expect(watchNewLog?.newIds).toEqual(["W-0"]);
  });

  it("initial items complete, scanWorkItems returns new items, new items proceed to done", async () => {
    const fakeGh = new FakeGitHub();
    const fakeMux = new FakeMux();
    const orch = makeOrch();

    // Start with one initial item
    orch.addItem(makeWorkItem("W-1"));

    const actionDeps = buildActionDeps(fakeGh, fakeMux);
    const loopDeps = buildLoopDeps(fakeGh, fakeMux, actionDeps);

    // Track scanWorkItems calls
    let scanCallCount = 0;
    const scanWorkItems = vi.fn(() => {
      scanCallCount++;
      // On the first scan call, return a new work item
      if (scanCallCount === 1) {
        return [makeWorkItem("W-1"), makeWorkItem("W-2")];
      }
      // Subsequent scans: return all known items (W-1 and W-2)
      return [makeWorkItem("W-1"), makeWorkItem("W-2")];
    });
    loopDeps.scanWorkItems = scanWorkItems;

    // Auto-complete items as they reach implementing state
    loopDeps.sleep = async () => {
      for (const id of ["W-1", "W-2"]) {
        const orchItem = orch.getItem(id);
        if (orchItem?.state === "implementing" && !fakeGh.getPR(`ninthwave/${id}`)) {
          completeItem(id, fakeGh, orch);
        }
      }
    };

    await orchestrateLoop(orch, defaultCtx, loopDeps, {
      maxIterations: 80,
      watch: true,
    });

    // Both items should reach done
    expect(orch.getItem("W-1")!.state).toBe("done");
    expect(orch.getItem("W-2")!.state).toBe("done");

    // scanWorkItems must have been called
    expect(scanWorkItems).toHaveBeenCalled();

    // Verify watch_new_items log event with correct newIds
    const watchNewLog = loopDeps.__logs.find(
      (l) => l.event === "watch_new_items",
    );
    expect(watchNewLog).toBeDefined();
    expect(watchNewLog!.newIds).toEqual(["W-2"]);
    expect(watchNewLog!.count).toBe(1);
  });

  it("scanWorkItems returns empty repeatedly, loop continues polling until maxIterations", async () => {
    const fakeGh = new FakeGitHub();
    const fakeMux = new FakeMux();
    const orch = makeOrch();

    // Start with one item that will complete quickly
    orch.addItem(makeWorkItem("W-3"));

    const actionDeps = buildActionDeps(fakeGh, fakeMux);
    const loopDeps = buildLoopDeps(fakeGh, fakeMux, actionDeps);

    // scanWorkItems always returns the same item (no new items)
    const scanWorkItems = vi.fn(() => [makeWorkItem("W-3")]);
    loopDeps.scanWorkItems = scanWorkItems;

    // Auto-complete W-3
    loopDeps.sleep = async () => {
      const orchItem = orch.getItem("W-3");
      if (orchItem?.state === "implementing" && !fakeGh.getPR("ninthwave/W-3")) {
        completeItem("W-3", fakeGh, orch);
      }
    };

    await orchestrateLoop(orch, defaultCtx, loopDeps, {
      maxIterations: 30,
      watch: true,
    });

    // W-3 should be done
    expect(orch.getItem("W-3")!.state).toBe("done");

    // Verify watch mode entered waiting state
    const watchWaitLog = loopDeps.__logs.find(
      (l) => l.event === "watch_mode_waiting",
    );
    expect(watchWaitLog).toBeDefined();

    // scanWorkItems was called multiple times during polling (no new items ever found)
    expect(scanWorkItems.mock.calls.length).toBeGreaterThan(1);

    // No watch_new_items event (nothing was discovered)
    const watchNewLog = loopDeps.__logs.find(
      (l) => l.event === "watch_new_items",
    );
    expect(watchNewLog).toBeUndefined();
  });

  it("new items with deps on completed items launch immediately", async () => {
    const fakeGh = new FakeGitHub();
    const fakeMux = new FakeMux();
    const orch = makeOrch();

    // Start with one initial item
    orch.addItem(makeWorkItem("D-1"));

    const actionDeps = buildActionDeps(fakeGh, fakeMux);
    const loopDeps = buildLoopDeps(fakeGh, fakeMux, actionDeps);

    // Track launch order
    const launchOrder: string[] = [];
    const origLaunch = actionDeps.workers.launchSingleItem;
    actionDeps.workers.launchSingleItem = vi.fn((item, wd, wtd, pr, ai, bb) => {
      launchOrder.push(item.id);
      return (origLaunch as Function)(item, wd, wtd, pr, ai, bb);
    });

    // After initial items complete, return a new item that depends on D-1
    let scanCallCount = 0;
    const scanWorkItems = vi.fn(() => {
      scanCallCount++;
      if (scanCallCount === 1) {
        // Return D-1 (existing) + D-2 (new, depends on D-1)
        return [makeWorkItem("D-1"), makeWorkItem("D-2", ["D-1"])];
      }
      return [makeWorkItem("D-1"), makeWorkItem("D-2", ["D-1"])];
    });
    loopDeps.scanWorkItems = scanWorkItems;

    // Auto-complete items as they reach implementing state
    loopDeps.sleep = async () => {
      for (const id of ["D-1", "D-2"]) {
        const orchItem = orch.getItem(id);
        if (orchItem?.state === "implementing" && !fakeGh.getPR(`ninthwave/${id}`)) {
          completeItem(id, fakeGh, orch);
        }
      }
    };

    await orchestrateLoop(orch, defaultCtx, loopDeps, {
      maxIterations: 80,
      watch: true,
    });

    // Both items should reach done
    expect(orch.getItem("D-1")!.state).toBe("done");
    expect(orch.getItem("D-2")!.state).toBe("done");

    // D-1 launched first, D-2 launched after (dependency already satisfied)
    expect(launchOrder).toContain("D-1");
    expect(launchOrder).toContain("D-2");
    expect(launchOrder.indexOf("D-1")).toBeLessThan(launchOrder.indexOf("D-2"));

    // D-2 should have been added via the watch scan
    const watchNewLog = loopDeps.__logs.find(
      (l) => l.event === "watch_new_items",
    );
    expect(watchNewLog).toBeDefined();
    expect(watchNewLog!.newIds).toEqual(["D-2"]);
  });

  it("reconcile drops a queued item when its file disappears, freeing dependents", async () => {
    const fakeGh = new FakeGitHub();
    const fakeMux = new FakeMux();
    const orch = makeOrch();

    // Initial state: R-1 (queued, never starts) plus R-2 that depends on R-1.
    // R-2 cannot launch until R-1 either completes or is dropped.
    orch.addItem(makeWorkItem("R-1"));
    orch.addItem(makeWorkItem("R-2", ["R-1"]));

    const actionDeps = buildActionDeps(fakeGh, fakeMux);
    const loopDeps = buildLoopDeps(fakeGh, fakeMux, actionDeps);

    // After the first scan, R-1's file is gone (e.g., user renamed/deleted it).
    // R-2's dependency on R-1 should be dropped now that R-1 is no longer tracked.
    let scanCallCount = 0;
    loopDeps.scanWorkItems = vi.fn(() => {
      scanCallCount++;
      return [makeWorkItem("R-2", ["R-1"])];
    });

    loopDeps.sleep = async () => {
      const r2 = orch.getItem("R-2");
      if (r2?.state === "implementing" && !fakeGh.getPR("ninthwave/R-2")) {
        completeItem("R-2", fakeGh, orch);
      }
    };

    await orchestrateLoop(orch, defaultCtx, loopDeps, {
      maxIterations: 80,
      watch: true,
      watchIntervalMs: 0,
    });

    // R-1 was dropped (zombie cleanup); R-2 launched and ran to done.
    expect(orch.getItem("R-1")).toBeUndefined();
    expect(orch.getItem("R-2")?.state).toBe("done");

    const removedLog = loopDeps.__logs.find((l) => l.event === "watch_removed_items");
    expect(removedLog).toBeDefined();
    expect(removedLog!.removedIds).toEqual(["R-1"]);
    expect(scanCallCount).toBeGreaterThan(0);
  });

  it("reconcile preserves items already in terminal state when their file is gone", async () => {
    const fakeGh = new FakeGitHub();
    const fakeMux = new FakeMux();
    const orch = makeOrch();

    orch.addItem(makeWorkItem("T-1"));

    const actionDeps = buildActionDeps(fakeGh, fakeMux);
    const loopDeps = buildLoopDeps(fakeGh, fakeMux, actionDeps);

    // The work-item file disappears from origin/main only after T-1 reaches
    // a terminal state (the merge commit removed it). Reconcile must not
    // silently drop the entry from history once that happens.
    let t1FileGone = false;
    loopDeps.scanWorkItems = vi.fn(() => (t1FileGone ? [] : [makeWorkItem("T-1")]));

    loopDeps.sleep = async () => {
      const t1 = orch.getItem("T-1");
      if (t1?.state === "implementing" && !fakeGh.getPR("ninthwave/T-1")) {
        completeItem("T-1", fakeGh, orch);
      }
      if (t1?.state === "done") {
        t1FileGone = true;
      }
    };

    await orchestrateLoop(orch, defaultCtx, loopDeps, {
      maxIterations: 80,
      watch: true,
      watchIntervalMs: 0,
    });

    expect(orch.getItem("T-1")?.state).toBe("done");
    // No watch_removed_items log should be emitted for terminal-state items.
    const removedLog = loopDeps.__logs.find((l) => l.event === "watch_removed_items");
    expect(removedLog).toBeUndefined();
  });

  it("reconcile detects dependency edits and updates the tracked workItem in place", async () => {
    const fakeGh = new FakeGitHub();
    const fakeMux = new FakeMux();
    const orch = makeOrch();

    // E-1 starts depending on a non-existent E-0 (so it stays queued).
    // E-2 has no deps and is the eventual target whose deps will be edited.
    orch.addItem(makeWorkItem("E-1", ["E-0"]));

    const actionDeps = buildActionDeps(fakeGh, fakeMux);
    const loopDeps = buildLoopDeps(fakeGh, fakeMux, actionDeps);

    let scanCallCount = 0;
    loopDeps.scanWorkItems = vi.fn(() => {
      scanCallCount++;
      // After the first scan, the file has been edited to remove the dep on E-0.
      if (scanCallCount === 1) return [makeWorkItem("E-1", [])];
      return [makeWorkItem("E-1", [])];
    });

    loopDeps.sleep = async () => {
      const e1 = orch.getItem("E-1");
      if (e1?.state === "implementing" && !fakeGh.getPR("ninthwave/E-1")) {
        completeItem("E-1", fakeGh, orch);
      }
    };

    await orchestrateLoop(orch, defaultCtx, loopDeps, {
      maxIterations: 80,
      watch: true,
      watchIntervalMs: 0,
    });

    expect(orch.getItem("E-1")?.state).toBe("done");
    expect(orch.getItem("E-1")?.workItem.dependencies).toEqual([]);

    const editLog = loopDeps.__logs.find((l) => l.event === "watch_edited_item");
    expect(editLog).toBeDefined();
    expect(editLog!.itemId).toBe("E-1");
    expect(editLog!.changedFields).toContain("dependencies");
  });

  it("reconcile applies addition, deletion, and edit in a single tick", async () => {
    const fakeGh = new FakeGitHub();
    const fakeMux = new FakeMux();
    const orch = makeOrch();

    // Pre-seed three items. M-keep starts depending on a phantom dep so it
    // sits in queued long enough for the reconcile to land. The first scan
    // call edits M-keep's deps (clearing them), drops M-drop, and adds M-add.
    orch.addItem(makeWorkItem("M-keep", ["M-phantom"]));
    orch.addItem(makeWorkItem("M-drop"));

    const actionDeps = buildActionDeps(fakeGh, fakeMux);
    const loopDeps = buildLoopDeps(fakeGh, fakeMux, actionDeps);

    loopDeps.scanWorkItems = vi.fn(() => [
      makeWorkItem("M-keep", []),
      makeWorkItem("M-add"),
    ]);

    loopDeps.sleep = async () => {
      for (const id of ["M-keep", "M-add"]) {
        const item = orch.getItem(id);
        if (item?.state === "implementing" && !fakeGh.getPR(`ninthwave/${id}`)) {
          completeItem(id, fakeGh, orch);
        }
      }
    };

    await orchestrateLoop(orch, defaultCtx, loopDeps, {
      maxIterations: 120,
      watch: true,
      watchIntervalMs: 0,
    });

    expect(orch.getItem("M-keep")?.state).toBe("done");
    expect(orch.getItem("M-add")?.state).toBe("done");
    expect(orch.getItem("M-drop")).toBeUndefined();

    const newLog = loopDeps.__logs.find((l) => l.event === "watch_new_items");
    const removedLog = loopDeps.__logs.find((l) => l.event === "watch_removed_items");
    const editedLog = loopDeps.__logs.find((l) => l.event === "watch_edited_item");
    expect(newLog?.newIds).toEqual(["M-add"]);
    expect(removedLog?.removedIds).toEqual(["M-drop"]);
    expect(editedLog?.itemId).toBe("M-keep");
    expect(editedLog?.changedFields).toContain("dependencies");
  });
});

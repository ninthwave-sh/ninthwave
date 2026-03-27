// Tests for supervisor activation detection and session-based supervisor integration.
// Uses dependency injection (no vi.mock) per project conventions.

import { describe, it, expect, vi } from "vitest";
import {
  shouldActivateSupervisor,
} from "../core/supervisor.ts";
import {
  orchestrateLoop,
  sendSupervisorEvent,
  buildSupervisorHeartbeat,
  type LogEntry,
  type OrchestrateLoopDeps,
  type OrchestrateLoopConfig,
} from "../core/commands/orchestrate.ts";
import {
  Orchestrator,
  type PollSnapshot,
  type ExecutionContext,
  type OrchestratorDeps,
  type OrchestratorItem,
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
    filePath: "",
    repoAlias: "",
    rawText: `## ${id}\nTest todo`,
    filePaths: [],
  };
}

function makeItem(id: string, state: string, overrides?: Partial<OrchestratorItem>): OrchestratorItem {
  return {
    id,
    todo: makeTodo(id),
    state: state as OrchestratorItem["state"],
    lastTransition: new Date(Date.now() - 600_000).toISOString(), // 10 min ago
    ciFailCount: 0,
    ...overrides,
  };
}
function mockActionDeps(overrides?: Partial<OrchestratorDeps>): OrchestratorDeps {
  return {
    launchSingleItem: vi.fn(() => ({
      worktreePath: "/tmp/test/todo-test",
      workspaceRef: "workspace:1",
    })),
    cleanSingleWorktree: vi.fn(() => true),
    prMerge: vi.fn(() => true),
    prComment: vi.fn(() => true),
    sendMessage: vi.fn(() => true),
    closeWorkspace: vi.fn(() => true),
    fetchOrigin: vi.fn(),
    ffMerge: vi.fn(),
    ...overrides,
  };
}

const defaultCtx: ExecutionContext = {
  projectRoot: "/tmp/test-project",
  worktreeDir: "/tmp/test-project/.worktrees",
  todosDir: "/tmp/test-project/.ninthwave/todos",
  aiTool: "claude",
};

// ── shouldActivateSupervisor ─────────────────────────────────────────

describe("shouldActivateSupervisor", () => {
  it("returns true when flag is set", () => {
    expect(shouldActivateSupervisor(true, "/nonexistent")).toBe(true);
  });

  it("returns false when flag is not set and not in dogfooding mode", () => {
    expect(shouldActivateSupervisor(false, "/nonexistent")).toBe(false);
  });
});

// ── Supervisor session events in orchestrateLoop ────────────────────

describe("orchestrateLoop with supervisor session", () => {
  it("sends supervisor events on state transitions", async () => {
    const orch = new Orchestrator({ wipLimit: 2, mergeStrategy: "asap" });
    orch.addItem(makeTodo("T-1-1"));

    let cycle = 0;
    const logs: LogEntry[] = [];
    const sendMessage = vi.fn(() => true);

    const buildSnapshot = (): PollSnapshot => {
      cycle++;
      if (cycle === 1) return { items: [], readyIds: ["T-1-1"] };
      if (cycle === 2) return { items: [{ id: "T-1-1", workerAlive: true }], readyIds: [] };
      if (cycle === 3) return { items: [{ id: "T-1-1", prNumber: 1, prState: "open", ciStatus: "pass" }], readyIds: [] };
      return { items: [], readyIds: [] };
    };

    const actionDeps = mockActionDeps({ sendMessage });

    const deps: OrchestrateLoopDeps = {
      buildSnapshot,
      sleep: () => Promise.resolve(),
      log: (entry) => logs.push(entry),
      actionDeps,
    };

    const config: OrchestrateLoopConfig = {
      supervisorSessionRef: "workspace:supervisor",
      supervisorHeartbeatMs: 999_999, // disable heartbeat for this test
    };

    await orchestrateLoop(orch, defaultCtx, deps, { ...config, maxIterations: 200 });

    // Supervisor should have received item-launched and item-merged events
    const supervisorCalls = sendMessage.mock.calls.filter(
      (call: [string, string]) => call[0] === "workspace:supervisor",
    );
    expect(supervisorCalls.length).toBeGreaterThan(0);
    const messages = supervisorCalls.map((c: [string, string]) => c[1]);
    expect(messages.some((m: string) => m.includes('"type":"item-launched"'))).toBe(true);
    expect(messages.some((m: string) => m.includes('"type":"item-merged"'))).toBe(true);
  });

  it("does not send supervisor events when not configured", async () => {
    const orch = new Orchestrator({ wipLimit: 2, mergeStrategy: "asap" });
    orch.addItem(makeTodo("T-1-1"));

    let cycle = 0;
    const logs: LogEntry[] = [];
    const sendMessage = vi.fn(() => true);

    const buildSnapshot = (): PollSnapshot => {
      cycle++;
      if (cycle === 1) return { items: [], readyIds: ["T-1-1"] };
      if (cycle === 2) return { items: [{ id: "T-1-1", workerAlive: true }], readyIds: [] };
      if (cycle === 3) return { items: [{ id: "T-1-1", prNumber: 1, prState: "open", ciStatus: "pass" }], readyIds: [] };
      return { items: [], readyIds: [] };
    };

    const deps: OrchestrateLoopDeps = {
      buildSnapshot,
      sleep: () => Promise.resolve(),
      log: (entry) => logs.push(entry),
      actionDeps: mockActionDeps({ sendMessage }),
      // no supervisorSessionRef in config
    };

    await orchestrateLoop(orch, defaultCtx, deps, { maxIterations: 200 });

    // No [ORCHESTRATOR] messages should have been sent
    const supervisorCalls = sendMessage.mock.calls.filter(
      (call: [string, string]) => typeof call[1] === "string" && call[1].startsWith("[ORCHESTRATOR]"),
    );
    expect(supervisorCalls.length).toBe(0);
  });

  it("sends heartbeat at configured interval", async () => {
    const orch = new Orchestrator({ wipLimit: 2, mergeStrategy: "asap" });
    orch.addItem(makeTodo("T-1-1"));

    let cycle = 0;
    const logs: LogEntry[] = [];
    const sendMessage = vi.fn(() => true);
    const originalNow = Date.now;
    let fakeTime = Date.now();

    // Override Date.now to control heartbeat timing
    Date.now = () => fakeTime;

    const buildSnapshot = (): PollSnapshot => {
      cycle++;
      // Advance fake time past heartbeat interval (10ms)
      fakeTime += 20;
      if (cycle <= 3) {
        return { items: [{ id: "T-1-1", workerAlive: true }], readyIds: ["T-1-1"] };
      }
      return { items: [{ id: "T-1-1", prNumber: 1, prState: "open", ciStatus: "pass" }], readyIds: [] };
    };

    const deps: OrchestrateLoopDeps = {
      buildSnapshot,
      sleep: () => Promise.resolve(),
      log: (entry) => logs.push(entry),
      actionDeps: mockActionDeps({ sendMessage }),
    };

    const config: OrchestrateLoopConfig = {
      supervisorSessionRef: "workspace:supervisor",
      supervisorHeartbeatMs: 10, // Very short interval for testing
    };

    try {
      await orchestrateLoop(orch, defaultCtx, deps, { ...config, maxIterations: 200 });
    } finally {
      Date.now = originalNow; // lint-ignore: no-unreset-globals
    }

    // Should have heartbeat messages
    const supervisorCalls = sendMessage.mock.calls.filter(
      (call: [string, string]) => call[0] === "workspace:supervisor" && call[1].includes('"type":"heartbeat"'),
    );
    expect(supervisorCalls.length).toBeGreaterThan(0);
  });

  it("logs supervisorActive in orchestrate_start event", async () => {
    const orch = new Orchestrator({ wipLimit: 2, mergeStrategy: "asap" });
    orch.addItem(makeTodo("T-1-1"));

    const logs: LogEntry[] = [];
    let cycle = 0;

    const buildSnapshot = (): PollSnapshot => {
      cycle++;
      if (cycle === 1) return { items: [], readyIds: ["T-1-1"] };
      if (cycle === 2) return { items: [{ id: "T-1-1", workerAlive: true }], readyIds: [] };
      if (cycle === 3) return { items: [{ id: "T-1-1", prNumber: 1, prState: "open", ciStatus: "pass" }], readyIds: [] };
      return { items: [], readyIds: [] };
    };

    const deps: OrchestrateLoopDeps = {
      buildSnapshot,
      sleep: () => Promise.resolve(),
      log: (entry) => logs.push(entry),
      actionDeps: mockActionDeps(),
    };

    const config: OrchestrateLoopConfig = {
      supervisorSessionRef: "workspace:supervisor",
    };

    await orchestrateLoop(orch, defaultCtx, deps, { ...config, maxIterations: 200 });

    const startEvent = logs.find((l) => l.event === "orchestrate_start");
    expect(startEvent).toBeDefined();
    expect(startEvent!.supervisorActive).toBe(true);
  });

  it("sends ci-failed event with details", async () => {
    const orch = new Orchestrator({ wipLimit: 2, mergeStrategy: "asap" });
    orch.addItem(makeTodo("T-1-1"));

    let cycle = 0;
    const logs: LogEntry[] = [];
    const sendMessage = vi.fn(() => true);

    const buildSnapshot = (): PollSnapshot => {
      cycle++;
      if (cycle === 1) return { items: [], readyIds: ["T-1-1"] };
      if (cycle === 2) return { items: [{ id: "T-1-1", workerAlive: true }], readyIds: [] };
      // CI fails
      if (cycle === 3) return { items: [{ id: "T-1-1", prNumber: 1, prState: "open", ciStatus: "fail" }], readyIds: [] };
      // Then passes and merges
      if (cycle === 4) return { items: [{ id: "T-1-1", prNumber: 1, prState: "open", ciStatus: "pass" }], readyIds: [] };
      return { items: [], readyIds: [] };
    };

    const deps: OrchestrateLoopDeps = {
      buildSnapshot,
      sleep: () => Promise.resolve(),
      log: (entry) => logs.push(entry),
      actionDeps: mockActionDeps({ sendMessage }),
    };

    const config: OrchestrateLoopConfig = {
      supervisorSessionRef: "workspace:supervisor",
      supervisorHeartbeatMs: 999_999,
    };

    await orchestrateLoop(orch, defaultCtx, deps, { ...config, maxIterations: 200 });

    const supervisorCalls = sendMessage.mock.calls.filter(
      (call: [string, string]) => call[0] === "workspace:supervisor",
    );
    const messages = supervisorCalls.map((c: [string, string]) => c[1]);
    expect(messages.some((m: string) => m.includes('"type":"ci-failed"'))).toBe(true);
  });

  it("supervisor sendMessage failure does not block orchestrate loop", async () => {
    const orch = new Orchestrator({ wipLimit: 2, mergeStrategy: "asap" });
    orch.addItem(makeTodo("T-1-1"));

    let cycle = 0;
    const logs: LogEntry[] = [];
    const sendMessage = vi.fn(() => false); // Always fail

    const buildSnapshot = (): PollSnapshot => {
      cycle++;
      if (cycle === 1) return { items: [], readyIds: ["T-1-1"] };
      if (cycle === 2) return { items: [{ id: "T-1-1", workerAlive: true }], readyIds: [] };
      if (cycle === 3) return { items: [{ id: "T-1-1", prNumber: 1, prState: "open", ciStatus: "pass" }], readyIds: [] };
      return { items: [], readyIds: [] };
    };

    const deps: OrchestrateLoopDeps = {
      buildSnapshot,
      sleep: () => Promise.resolve(),
      log: (entry) => logs.push(entry),
      actionDeps: mockActionDeps({ sendMessage }),
    };

    const config: OrchestrateLoopConfig = {
      supervisorSessionRef: "workspace:supervisor",
      supervisorHeartbeatMs: 999_999,
    };

    // Should not throw — daemon continues despite supervisor send failures
    await orchestrateLoop(orch, defaultCtx, deps, { ...config, maxIterations: 200 });

    // Item should still complete
    expect(orch.getItem("T-1-1")!.state).toBe("done");

    // Warning should be logged
    expect(logs.some((l) => l.event === "supervisor_send_failed")).toBe(true);
  });
});

// ── sendSupervisorEvent ─────────────────────────────────────────────

describe("sendSupervisorEvent", () => {
  it("sends formatted JSON message to supervisor workspace", () => {
    const sendMessage = vi.fn(() => true);
    const logs: LogEntry[] = [];
    const log = (entry: LogEntry) => logs.push(entry);

    sendSupervisorEvent("workspace:sup", sendMessage, { type: "item-launched", itemId: "T-1" }, log);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]![0]).toBe("workspace:sup");
    const msg = sendMessage.mock.calls[0]![1] as string;
    expect(msg.startsWith("[ORCHESTRATOR]")).toBe(true);
    expect(msg).toContain('"type":"item-launched"');
    expect(msg).toContain('"itemId":"T-1"');
  });

  it("does nothing when supervisorRef is undefined", () => {
    const sendMessage = vi.fn(() => true);
    const logs: LogEntry[] = [];
    sendSupervisorEvent(undefined, sendMessage, { type: "heartbeat" }, (e) => logs.push(e));
    expect(sendMessage).not.toHaveBeenCalled();
    expect(logs.length).toBe(0);
  });

  it("logs warning when sendMessage returns false", () => {
    const sendMessage = vi.fn(() => false);
    const logs: LogEntry[] = [];
    sendSupervisorEvent("workspace:sup", sendMessage, { type: "ci-failed" }, (e) => logs.push(e));

    expect(logs.some((l) => l.event === "supervisor_send_failed")).toBe(true);
  });

  it("does not throw when sendMessage throws", () => {
    const sendMessage = vi.fn(() => { throw new Error("mux dead"); });
    const logs: LogEntry[] = [];
    expect(() => {
      sendSupervisorEvent("workspace:sup", sendMessage, { type: "heartbeat" }, (e) => logs.push(e));
    }).not.toThrow();
  });
});

// ── buildSupervisorHeartbeat ────────────────────────────────────────

describe("buildSupervisorHeartbeat", () => {
  it("includes all items with their states", () => {
    const items = [
      makeItem("T-1", "implementing"),
      makeItem("T-2", "ci-pending"),
    ];
    items[0]!.workspaceRef = "workspace:1";
    items[0]!.prNumber = 42;
    items[1]!.ciFailCount = 2;

    const heartbeat = buildSupervisorHeartbeat(items);

    expect(heartbeat.type).toBe("heartbeat");
    expect(heartbeat.timestamp).toBeDefined();
    const hbItems = heartbeat.items as Array<Record<string, unknown>>;
    expect(hbItems).toHaveLength(2);
    expect(hbItems[0]!.id).toBe("T-1");
    expect(hbItems[0]!.state).toBe("implementing");
    expect(hbItems[0]!.workspaceRef).toBe("workspace:1");
    expect(hbItems[0]!.prNumber).toBe(42);
    expect(hbItems[1]!.ciFailCount).toBe(2);
  });

  it("handles empty items array", () => {
    const heartbeat = buildSupervisorHeartbeat([]);
    expect(heartbeat.type).toBe("heartbeat");
    expect(heartbeat.items).toEqual([]);
  });
});

// ── Supervisor session launch helpers ───────────────────────────────

import {
  seedSupervisorAgent,
  buildSupervisorInitialMessage,
  type SupervisorContext,
} from "../core/commands/start.ts";
import { mkdirSync as fsMkdirSync, existsSync as fsExistsSync, readFileSync as fsReadFileSync, writeFileSync as fsWriteFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("seedSupervisorAgent", () => {
  it("copies supervisor.md to .claude/agents/ in projectRoot", () => {
    const dir = join(tmpdir(), `nw-test-seed-${Date.now()}`);
    const hubDir = join(dir, "hub");
    const projDir = join(dir, "proj");
    fsMkdirSync(join(hubDir, "agents"), { recursive: true });
    fsMkdirSync(projDir, { recursive: true });
    fsWriteFileSync(join(hubDir, "agents", "supervisor.md"), "# Supervisor Agent\ntest content");

    seedSupervisorAgent(projDir, hubDir);

    expect(fsExistsSync(join(projDir, ".claude", "agents", "supervisor.md"))).toBe(true);
    const content = fsReadFileSync(join(projDir, ".claude", "agents", "supervisor.md"), "utf-8");
    expect(content).toContain("test content");

    rmSync(dir, { recursive: true });
  });

  it("skips seeding if already present", () => {
    const dir = join(tmpdir(), `nw-test-seed-skip-${Date.now()}`);
    const hubDir = join(dir, "hub");
    const projDir = join(dir, "proj");
    fsMkdirSync(join(hubDir, "agents"), { recursive: true });
    fsMkdirSync(join(projDir, ".claude", "agents"), { recursive: true });
    fsWriteFileSync(join(hubDir, "agents", "supervisor.md"), "new content");
    fsWriteFileSync(join(projDir, ".claude", "agents", "supervisor.md"), "existing content");

    seedSupervisorAgent(projDir, hubDir);

    const content = fsReadFileSync(join(projDir, ".claude", "agents", "supervisor.md"), "utf-8");
    expect(content).toBe("existing content"); // not overwritten

    rmSync(dir, { recursive: true });
  });

  it("skips if source agent file does not exist", () => {
    const dir = join(tmpdir(), `nw-test-seed-nosrc-${Date.now()}`);
    const hubDir = join(dir, "hub");
    const projDir = join(dir, "proj");
    fsMkdirSync(hubDir, { recursive: true });
    fsMkdirSync(projDir, { recursive: true });

    seedSupervisorAgent(projDir, hubDir); // should not throw
    expect(fsExistsSync(join(projDir, ".claude", "agents", "supervisor.md"))).toBe(false);

    rmSync(dir, { recursive: true });
  });
});

describe("buildSupervisorInitialMessage", () => {
  it("includes all required context", () => {
    const ctx: SupervisorContext = {
      items: [
        { id: "T-1", state: "implementing", workspaceRef: "workspace:1", prNumber: 42, title: "Fix auth" },
        { id: "T-2", state: "queued", title: "Add tests" },
      ],
      mergeStrategy: "squash",
      wipLimit: 5,
      frictionDir: ".ninthwave/friction",
    };

    const msg = buildSupervisorInitialMessage(ctx);

    expect(msg).toContain("T-1");
    expect(msg).toContain("implementing");
    expect(msg).toContain("workspace:1");
    expect(msg).toContain("PR=#42");
    expect(msg).toContain("T-2");
    expect(msg).toContain("queued");
    expect(msg).toContain("squash");
    expect(msg).toContain("WIP limit: 5");
    expect(msg).toContain(".ninthwave/friction");
  });

  it("handles empty items", () => {
    const ctx: SupervisorContext = {
      items: [],
      mergeStrategy: "asap",
      wipLimit: 3,
    };

    const msg = buildSupervisorInitialMessage(ctx);
    expect(msg).toContain("(no items)");
    expect(msg).toContain("(no active workspaces)");
  });
});

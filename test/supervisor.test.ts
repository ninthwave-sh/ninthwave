// Tests for core/supervisor.ts — Supervisor tick, prompt construction,
// response parsing, action application, friction logging, and interval logic.
// Uses dependency injection (no vi.mock) per project conventions.

import { describe, it, expect, vi } from "vitest";
import {
  buildSupervisorPrompt,
  parseSupervisorResponse,
  supervisorTick,
  applySupervisorActions,
  writeFrictionLog,
  shouldActivateSupervisor,
  getEffectiveInterval,
  DEFAULT_SUPERVISOR_CONFIG,
  BACKOFF_THRESHOLD,
  DISABLE_THRESHOLD,
  MAX_BACKOFF_INTERVAL_MS,
  type SupervisorDeps,
  type SupervisorState,
  type SupervisorObservation,
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

function makeState(overrides?: Partial<SupervisorState>): SupervisorState {
  return {
    lastTickTime: new Date("2026-03-24T11:55:00Z"),
    logsSinceLastTick: [],
    consecutiveFailures: 0,
    disabled: false,
    ...overrides,
  };
}

function mockSupervisorDeps(overrides?: Partial<SupervisorDeps>): SupervisorDeps {
  return {
    callLLM: vi.fn(() => JSON.stringify({
      anomalies: [],
      interventions: [],
      frictionObservations: [],
      processImprovements: [],
    })),
    now: () => new Date("2026-03-24T12:00:00Z"),
    log: vi.fn(),
    writeFile: vi.fn(),
    mkdirSync: vi.fn(),
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

// ── buildSupervisorPrompt ────────────────────────────────────────────

describe("buildSupervisorPrompt", () => {
  it("includes item states and elapsed times", () => {
    const items = [
      makeItem("A-1-1", "implementing", { prNumber: 42 }),
      makeItem("A-1-2", "ci-pending"),
    ];

    const elapsed = new Map<string, number>();
    elapsed.set("A-1-1", 600_000); // 10 min
    elapsed.set("A-1-2", 120_000); // 2 min

    const prompt = buildSupervisorPrompt([], items, elapsed);

    expect(prompt).toContain("A-1-1: state=implementing, elapsed=10min");
    expect(prompt).toContain("PR=#42");
    expect(prompt).toContain("A-1-2: state=ci-pending, elapsed=2min");
  });

  it("includes recent log entries", () => {
    const logs: LogEntry[] = [
      { ts: "2026-03-24T12:00:00Z", level: "info", event: "transition", itemId: "A-1-1", from: "launching", to: "implementing" },
    ];

    const prompt = buildSupervisorPrompt(logs, [], new Map());

    expect(prompt).toContain("transition");
    expect(prompt).toContain("A-1-1");
  });

  it("shows placeholder when no logs", () => {
    const prompt = buildSupervisorPrompt([], [], new Map());

    expect(prompt).toContain("(no recent log entries)");
  });

  it("includes all four analysis categories in instructions", () => {
    const prompt = buildSupervisorPrompt([], [], new Map());

    expect(prompt).toContain("anomalies");
    expect(prompt).toContain("interventions");
    expect(prompt).toContain("frictionObservations");
    expect(prompt).toContain("processImprovements");
  });

  it("includes commit freshness for implementing items with recent commits", () => {
    const now = new Date("2026-03-24T12:10:00Z");
    const items = [
      makeItem("B-1-1", "implementing", {
        lastCommitTime: "2026-03-24T12:08:00Z", // 2 min ago
      }),
    ];

    const elapsed = new Map<string, number>();
    elapsed.set("B-1-1", 600_000); // 10 min in state

    const prompt = buildSupervisorPrompt([], items, elapsed, now);

    expect(prompt).toContain("B-1-1: state=implementing, elapsed=10min");
    expect(prompt).toContain("lastCommit=2min ago");
  });

  it("shows lastCommit=none for implementing items with no commits", () => {
    const now = new Date("2026-03-24T12:10:00Z");
    const items = [
      makeItem("B-2-1", "implementing", {
        lastCommitTime: null,
      }),
    ];

    const elapsed = new Map<string, number>();
    elapsed.set("B-2-1", 480_000); // 8 min

    const prompt = buildSupervisorPrompt([], items, elapsed, now);

    expect(prompt).toContain("B-2-1: state=implementing, elapsed=8min");
    expect(prompt).toContain("lastCommit=none");
  });

  it("includes commit freshness for launching items", () => {
    const now = new Date("2026-03-24T12:10:00Z");
    const items = [
      makeItem("B-3-1", "launching", {
        lastCommitTime: null, // just launched, no commits
      }),
    ];

    const elapsed = new Map<string, number>();
    elapsed.set("B-3-1", 60_000); // 1 min

    const prompt = buildSupervisorPrompt([], items, elapsed, now);

    expect(prompt).toContain("B-3-1: state=launching, elapsed=1min");
    expect(prompt).toContain("lastCommit=none");
  });

  it("does not include commit freshness for non-active states like ci-pending", () => {
    const now = new Date("2026-03-24T12:10:00Z");
    const items = [
      makeItem("B-4-1", "ci-pending"),
    ];

    const elapsed = new Map<string, number>();
    elapsed.set("B-4-1", 300_000);

    const prompt = buildSupervisorPrompt([], items, elapsed, now);

    expect(prompt).toContain("B-4-1: state=ci-pending, elapsed=5min");
    expect(prompt).not.toContain("lastCommit=");
  });

  it("supervisor prompt instructions reference commit freshness for anomaly detection", () => {
    const prompt = buildSupervisorPrompt([], [], new Map());

    expect(prompt).toContain("commit freshness");
    expect(prompt).toContain("lastCommit");
  });

  // ── Screen health tests (M-HLT-2) ──────────────────────────────────

  it("includes screenHealth in item lines when data is provided", () => {
    const items = [
      makeItem("H-1-1", "implementing"),
      makeItem("H-1-2", "implementing"),
    ];

    const elapsed = new Map<string, number>();
    elapsed.set("H-1-1", 300_000);
    elapsed.set("H-1-2", 600_000);

    const screenHealth = new Map<string, import("../core/worker-health.ts").ScreenHealthStatus>();
    screenHealth.set("H-1-1", "healthy");
    screenHealth.set("H-1-2", "stalled-empty");

    const prompt = buildSupervisorPrompt([], items, elapsed, new Date(), screenHealth);

    expect(prompt).toContain("H-1-1:");
    expect(prompt).toContain("screenHealth=healthy");
    expect(prompt).toContain("H-1-2:");
    expect(prompt).toContain("screenHealth=stalled-empty");
  });

  it("includes screen health distribution summary", () => {
    const items = [
      makeItem("H-2-1", "implementing"),
      makeItem("H-2-2", "implementing"),
      makeItem("H-2-3", "implementing"),
      makeItem("H-2-4", "implementing"),
    ];

    const elapsed = new Map<string, number>();
    for (const item of items) elapsed.set(item.id, 300_000);

    const screenHealth = new Map<string, import("../core/worker-health.ts").ScreenHealthStatus>();
    screenHealth.set("H-2-1", "healthy");
    screenHealth.set("H-2-2", "healthy");
    screenHealth.set("H-2-3", "healthy");
    screenHealth.set("H-2-4", "stalled-empty");

    const prompt = buildSupervisorPrompt([], items, elapsed, new Date(), screenHealth);

    expect(prompt).toContain("Screen Health Summary");
    expect(prompt).toContain("3 healthy");
    expect(prompt).toContain("1 stalled-empty");
  });

  it("works without screen health data (backward compat)", () => {
    const items = [makeItem("H-3-1", "implementing")];
    const elapsed = new Map<string, number>();
    elapsed.set("H-3-1", 300_000);

    // No screenHealthByItem passed
    const prompt = buildSupervisorPrompt([], items, elapsed);

    expect(prompt).toContain("H-3-1: state=implementing");
    // Item line should not have screenHealth (instructions text may mention it)
    const itemLine = prompt.split("\n").find((l: string) => l.includes("H-3-1:"));
    expect(itemLine).not.toContain("screenHealth=");
    expect(prompt).not.toContain("Screen Health Summary");
  });

  it("omits screenHealth for items not in the health map", () => {
    const items = [
      makeItem("H-4-1", "implementing"),
      makeItem("H-4-2", "ci-pending"),
    ];

    const elapsed = new Map<string, number>();
    elapsed.set("H-4-1", 300_000);
    elapsed.set("H-4-2", 120_000);

    // Only H-4-1 has screen health
    const screenHealth = new Map<string, import("../core/worker-health.ts").ScreenHealthStatus>();
    screenHealth.set("H-4-1", "stalled-permission");

    const prompt = buildSupervisorPrompt([], items, elapsed, new Date(), screenHealth);

    expect(prompt).toContain("screenHealth=stalled-permission");
    // H-4-2 line should not have screenHealth
    const h42Line = prompt.split("\n").find((l: string) => l.includes("H-4-2:"));
    expect(h42Line).toBeDefined();
    expect(h42Line).not.toContain("screenHealth=");
  });

  it("prompt instructions reference screenHealth for anomaly detection", () => {
    const prompt = buildSupervisorPrompt([], [], new Map());

    expect(prompt).toContain("screenHealth");
    expect(prompt).toContain("stalled-empty");
    expect(prompt).toContain("escalation");
  });

  it("omits distribution summary when screenHealth map is empty", () => {
    const items = [makeItem("H-5-1", "implementing")];
    const elapsed = new Map<string, number>();
    elapsed.set("H-5-1", 300_000);

    const emptyHealth = new Map<string, import("../core/worker-health.ts").ScreenHealthStatus>();
    const prompt = buildSupervisorPrompt([], items, elapsed, new Date(), emptyHealth);

    expect(prompt).not.toContain("Screen Health Summary");
  });
});

// ── parseSupervisorResponse ──────────────────────────────────────────

describe("parseSupervisorResponse", () => {
  it("parses valid JSON response", () => {
    const response = JSON.stringify({
      anomalies: ["Worker A-1-1 stuck in implementing for 15 minutes"],
      interventions: [{ type: "send-message", itemId: "A-1-1", message: "Are you stuck?" }],
      frictionObservations: ["CI takes 3 minutes on average"],
      processImprovements: ["Add TypeScript strict mode to CLAUDE.md"],
    });

    const result = parseSupervisorResponse(response);

    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0]).toContain("stuck");
    expect(result.interventions).toHaveLength(1);
    expect(result.interventions[0]!.type).toBe("send-message");
    expect(result.frictionObservations).toHaveLength(1);
    expect(result.processImprovements).toHaveLength(1);
  });

  it("handles markdown-fenced JSON", () => {
    const response = '```json\n{"anomalies": ["test"], "interventions": [], "frictionObservations": [], "processImprovements": []}\n```';

    const result = parseSupervisorResponse(response);

    expect(result.anomalies).toEqual(["test"]);
  });

  it("returns empty observation for malformed JSON", () => {
    const result = parseSupervisorResponse("this is not json at all");

    expect(result.anomalies).toEqual([]);
    expect(result.interventions).toEqual([]);
    expect(result.frictionObservations).toEqual([]);
    expect(result.processImprovements).toEqual([]);
  });

  it("handles partial fields gracefully", () => {
    const response = JSON.stringify({ anomalies: ["stuck"] });

    const result = parseSupervisorResponse(response);

    expect(result.anomalies).toEqual(["stuck"]);
    expect(result.interventions).toEqual([]);
    expect(result.frictionObservations).toEqual([]);
    expect(result.processImprovements).toEqual([]);
  });

  it("handles empty string response", () => {
    const result = parseSupervisorResponse("");

    expect(result.anomalies).toEqual([]);
  });
});

// ── supervisorTick ───────────────────────────────────────────────────

describe("supervisorTick", () => {
  it("calls LLM with constructed prompt and returns observation", () => {
    const callLLM = vi.fn(() => JSON.stringify({
      anomalies: ["Worker X stuck"],
      interventions: [],
      frictionObservations: ["slow CI"],
      processImprovements: [],
    }));

    const deps = mockSupervisorDeps({ callLLM });
    const state = makeState({
      logsSinceLastTick: [
        { ts: "2026-03-24T11:56:00Z", level: "info", event: "transition" },
      ],
    });

    const items = [makeItem("X-1-1", "implementing")];
    const result = supervisorTick(state, items, deps);

    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(result.anomalies).toEqual(["Worker X stuck"]);
    expect(result.frictionObservations).toEqual(["slow CI"]);
  });

  it("logs supervisor_tick event on success", () => {
    const log = vi.fn();
    const deps = mockSupervisorDeps({ log });
    const state = makeState();

    supervisorTick(state, [], deps);

    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      event: "supervisor_tick",
      status: "ok",
    }));
  });

  it("clears logsSinceLastTick after successful tick", () => {
    const deps = mockSupervisorDeps();
    const state = makeState({
      logsSinceLastTick: [
        { ts: "2026-03-24T11:56:00Z", level: "info", event: "test" },
      ],
    });

    supervisorTick(state, [], deps);

    expect(state.logsSinceLastTick).toHaveLength(0);
  });

  it("updates lastTickTime after successful tick", () => {
    const fixedNow = new Date("2026-03-24T12:00:00Z");
    const deps = mockSupervisorDeps({ now: () => fixedNow });
    const state = makeState();

    supervisorTick(state, [], deps);

    expect(state.lastTickTime).toBe(fixedNow);
  });

  it("returns empty observation and logs error when LLM call throws", () => {
    const callLLM = vi.fn(() => { throw new Error("rate limit exceeded"); });
    const log = vi.fn();
    const deps = mockSupervisorDeps({ callLLM, log });
    const state = makeState();

    const result = supervisorTick(state, [], deps);

    expect(result.anomalies).toEqual([]);
    expect(result.interventions).toEqual([]);
    // Should log the failure with error details
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      event: "supervisor_tick",
      status: "llm_call_failed",
      error: "rate limit exceeded",
      consecutiveFailures: 1,
    }));
  });

  it("includes error message in log when LLM call fails", () => {
    const callLLM = vi.fn(() => { throw new Error("API key invalid"); });
    const log = vi.fn();
    const deps = mockSupervisorDeps({ callLLM, log });
    const state = makeState();

    supervisorTick(state, [], deps);

    const failLog = (log as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: [LogEntry]) => c[0].event === "supervisor_tick" && c[0].status === "llm_call_failed",
    );
    expect(failLog).toBeDefined();
    expect(failLog![0].error).toBe("API key invalid");
  });

  it("increments consecutiveFailures on each LLM failure", () => {
    const callLLM = vi.fn(() => { throw new Error("timeout"); });
    const deps = mockSupervisorDeps({ callLLM });
    const state = makeState();

    supervisorTick(state, [], deps);
    expect(state.consecutiveFailures).toBe(1);

    supervisorTick(state, [], deps);
    expect(state.consecutiveFailures).toBe(2);

    supervisorTick(state, [], deps);
    expect(state.consecutiveFailures).toBe(3);
  });

  it("resets consecutiveFailures on successful call", () => {
    const deps = mockSupervisorDeps();
    const state = makeState({ consecutiveFailures: 5 });

    supervisorTick(state, [], deps);

    expect(state.consecutiveFailures).toBe(0);
  });

  it("disables supervisor after DISABLE_THRESHOLD consecutive failures", () => {
    const callLLM = vi.fn(() => { throw new Error("service unavailable"); });
    const log = vi.fn();
    const deps = mockSupervisorDeps({ callLLM, log });
    const state = makeState({ consecutiveFailures: DISABLE_THRESHOLD - 1 });

    supervisorTick(state, [], deps);

    expect(state.disabled).toBe(true);
    expect(state.consecutiveFailures).toBe(DISABLE_THRESHOLD);
    // Should log the disabling event
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      event: "supervisor_disabled",
      reason: `${DISABLE_THRESHOLD} consecutive LLM failures`,
    }));
  });

  it("does not disable supervisor before DISABLE_THRESHOLD", () => {
    const callLLM = vi.fn(() => { throw new Error("error"); });
    const deps = mockSupervisorDeps({ callLLM });
    const state = makeState({ consecutiveFailures: DISABLE_THRESHOLD - 2 });

    supervisorTick(state, [], deps);

    expect(state.disabled).toBe(false);
    expect(state.consecutiveFailures).toBe(DISABLE_THRESHOLD - 1);
  });

  it("computes elapsed time per item from lastTransition", () => {
    const fixedNow = new Date("2026-03-24T12:00:00Z");
    let capturedPrompt = "";
    const callLLM = vi.fn((prompt: string) => {
      capturedPrompt = prompt;
      return JSON.stringify({
        anomalies: [],
        interventions: [],
        frictionObservations: [],
        processImprovements: [],
      });
    });

    const deps = mockSupervisorDeps({ callLLM, now: () => fixedNow });
    const state = makeState();

    // Item with lastTransition 15 minutes ago
    const item = makeItem("T-1-1", "implementing", {
      lastTransition: new Date("2026-03-24T11:45:00Z").toISOString(),
    });

    supervisorTick(state, [item], deps);

    expect(capturedPrompt).toContain("elapsed=15min");
  });

  it("passes screen health data through to prompt", () => {
    let capturedPrompt = "";
    const callLLM = vi.fn((prompt: string) => {
      capturedPrompt = prompt;
      return JSON.stringify({
        anomalies: [],
        interventions: [],
        frictionObservations: [],
        processImprovements: [],
      });
    });

    const deps = mockSupervisorDeps({ callLLM });
    const state = makeState();
    const items = [makeItem("SH-1-1", "implementing")];

    const screenHealth = new Map<string, import("../core/worker-health.ts").ScreenHealthStatus>();
    screenHealth.set("SH-1-1", "stalled-error");

    supervisorTick(state, items, deps, screenHealth);

    expect(capturedPrompt).toContain("screenHealth=stalled-error");
  });

  it("works without screen health data (backward compat)", () => {
    let capturedPrompt = "";
    const callLLM = vi.fn((prompt: string) => {
      capturedPrompt = prompt;
      return JSON.stringify({
        anomalies: [],
        interventions: [],
        frictionObservations: [],
        processImprovements: [],
      });
    });

    const deps = mockSupervisorDeps({ callLLM });
    const state = makeState();
    const items = [makeItem("SH-2-1", "implementing")];

    // No screen health passed
    supervisorTick(state, items, deps);

    expect(capturedPrompt).toContain("SH-2-1: state=implementing");
    // Item line should not have screenHealth (instructions text may mention it)
    const itemLine = capturedPrompt.split("\n").find((l: string) => l.includes("SH-2-1:"));
    expect(itemLine).not.toContain("screenHealth=");
  });
});

// ── applySupervisorActions ───────────────────────────────────────────

describe("applySupervisorActions", () => {
  it("sends messages for send-message interventions", () => {
    const sendMessage = vi.fn(() => true);
    const log = vi.fn();

    const observation: SupervisorObservation = {
      anomalies: [],
      interventions: [
        { type: "send-message", itemId: "A-1-1", message: "Are you stuck?" },
      ],
      frictionObservations: [],
      processImprovements: [],
    };

    const items = [makeItem("A-1-1", "implementing", { workspaceRef: "workspace:1" })];

    const count = applySupervisorActions(observation, items, sendMessage, log);

    expect(sendMessage).toHaveBeenCalledWith("workspace:1", "Are you stuck?");
    expect(count).toBe(1);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      event: "supervisor_action",
      actionType: "send-message",
    }));
  });

  it("skips send-message when item has no workspaceRef", () => {
    const sendMessage = vi.fn(() => true);
    const log = vi.fn();

    const observation: SupervisorObservation = {
      anomalies: [],
      interventions: [
        { type: "send-message", itemId: "A-1-1", message: "test" },
      ],
      frictionObservations: [],
      processImprovements: [],
    };

    const items = [makeItem("A-1-1", "implementing")]; // no workspaceRef

    const count = applySupervisorActions(observation, items, sendMessage, log);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(count).toBe(0);
  });

  it("logs escalate actions", () => {
    const sendMessage = vi.fn(() => true);
    const log = vi.fn();

    const observation: SupervisorObservation = {
      anomalies: [],
      interventions: [
        { type: "escalate", reason: "Worker stuck for 30 minutes" },
      ],
      frictionObservations: [],
      processImprovements: [],
    };

    const count = applySupervisorActions(observation, [], sendMessage, log);

    expect(count).toBe(1);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      event: "supervisor_action",
      actionType: "escalate",
      reason: "Worker stuck for 30 minutes",
    }));
  });

  it("handles empty interventions", () => {
    const sendMessage = vi.fn(() => true);
    const log = vi.fn();

    const observation: SupervisorObservation = {
      anomalies: ["something noted"],
      interventions: [],
      frictionObservations: [],
      processImprovements: [],
    };

    const count = applySupervisorActions(observation, [], sendMessage, log);

    expect(count).toBe(0);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

// ── writeFrictionLog ─────────────────────────────────────────────────

describe("writeFrictionLog", () => {
  it("creates individual friction file in friction directory", () => {
    const writeFile = vi.fn();
    const mkdir = vi.fn();
    const fixedNow = new Date("2026-03-24T21:18:31Z");
    const observation: SupervisorObservation = {
      anomalies: [],
      interventions: [],
      frictionObservations: ["CI takes too long"],
      processImprovements: ["Add lint step to CLAUDE.md"],
    };

    writeFrictionLog(observation, "/tmp/friction", { writeFile, mkdirSync: mkdir, now: () => fixedNow });

    expect(mkdir).toHaveBeenCalledWith("/tmp/friction", { recursive: true });
    expect(writeFile).toHaveBeenCalledTimes(1);

    const [filePath, content] = writeFile.mock.calls[0]! as [string, string];
    // Filename follows {timestamp}--supervisor.md convention
    expect(filePath).toBe("/tmp/friction/2026-03-24T21-18-31Z--supervisor.md");
    // Content includes YAML front matter and entries
    expect(content).toContain("source: supervisor");
    expect(content).toContain("date: 2026-03-24T21:18:31Z");
    expect(content).toContain("---");
    expect(content).toContain("- [friction] CI takes too long");
    expect(content).toContain("- [improvement] Add lint step to CLAUDE.md");
  });

  it("produces NO files when observations and improvements are both empty", () => {
    const writeFile = vi.fn();
    const mkdir = vi.fn();
    const observation: SupervisorObservation = {
      anomalies: ["something"],
      interventions: [],
      frictionObservations: [],
      processImprovements: [],
    };

    writeFrictionLog(observation, "/tmp/friction", { writeFile, mkdirSync: mkdir });

    expect(writeFile).not.toHaveBeenCalled();
    expect(mkdir).not.toHaveBeenCalled();
  });

  it("uses supervisor as source in filename", () => {
    const writeFile = vi.fn();
    const mkdir = vi.fn();
    const fixedNow = new Date("2026-03-24T10:05:00Z");
    const observation: SupervisorObservation = {
      anomalies: [],
      interventions: [],
      frictionObservations: ["slow pipeline"],
      processImprovements: [],
    };

    writeFrictionLog(observation, "/tmp/friction", { writeFile, mkdirSync: mkdir, now: () => fixedNow });

    const [filePath] = writeFile.mock.calls[0]! as [string, string];
    expect(filePath).toContain("--supervisor.md");
  });
});

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

// ── getEffectiveInterval ─────────────────────────────────────────────

describe("getEffectiveInterval", () => {
  const base = 300_000; // 5 minutes

  it("returns base interval when failures below threshold", () => {
    expect(getEffectiveInterval(base, 0)).toBe(base);
    expect(getEffectiveInterval(base, 1)).toBe(base);
    expect(getEffectiveInterval(base, 2)).toBe(base);
  });

  it("doubles interval at BACKOFF_THRESHOLD failures", () => {
    expect(getEffectiveInterval(base, BACKOFF_THRESHOLD)).toBe(base * 2);
  });

  it("quadruples interval at BACKOFF_THRESHOLD + 1 failures", () => {
    expect(getEffectiveInterval(base, BACKOFF_THRESHOLD + 1)).toBe(base * 4);
  });

  it("caps at MAX_BACKOFF_INTERVAL_MS", () => {
    // With enough failures, interval should hit the cap
    expect(getEffectiveInterval(base, 20)).toBe(MAX_BACKOFF_INTERVAL_MS);
  });

  it("applies exponential growth between threshold and cap", () => {
    const at3 = getEffectiveInterval(base, 3);
    const at4 = getEffectiveInterval(base, 4);
    // Each step doubles (before hitting cap)
    expect(at4).toBe(at3 * 2);
    // at5 would be 2400000 but is capped at MAX_BACKOFF_INTERVAL_MS
    const at5 = getEffectiveInterval(base, 5);
    expect(at5).toBe(MAX_BACKOFF_INTERVAL_MS);
  });
});

// ── DEFAULT_SUPERVISOR_CONFIG ────────────────────────────────────────

describe("DEFAULT_SUPERVISOR_CONFIG", () => {
  it("has 5-minute default interval", () => {
    expect(DEFAULT_SUPERVISOR_CONFIG.intervalMs).toBe(300_000);
  });

  it("has 100 max log entries", () => {
    expect(DEFAULT_SUPERVISOR_CONFIG.maxLogEntries).toBe(100);
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

// Tests for core/analytics.ts — Structured metrics for orchestrator runs.

import { describe, it, expect, vi } from "vitest";
import {
  collectRunMetrics,
  writeRunMetrics,
  type RunMetrics,
  type MetricsWriterDeps,
} from "../core/analytics.ts";

// ── collectRunMetrics ────────────────────────────────────────────────

describe("collectRunMetrics", () => {
  it("collects accurate metrics from orchestrator items", () => {
    const startTime = "2026-03-24T10:00:00.000Z";
    const endTime = "2026-03-24T10:05:30.000Z";

    const items = [
      { id: "A-1-1", state: "done", ciFailCount: 0, prNumber: 10 },
      { id: "A-1-2", state: "done", ciFailCount: 1, prNumber: 11 },
      { id: "A-1-3", state: "stuck", ciFailCount: 3, prNumber: 12 },
    ];

    const metrics = collectRunMetrics({
      startTime,
      endTime,
      items,
      mergeStrategy: "asap",
      wipLimit: 4,
      aiTool: "claude",
    });

    expect(metrics.runStartedAt).toBe(startTime);
    expect(metrics.runCompletedAt).toBe(endTime);
    expect(metrics.durationMs).toBe(5.5 * 60 * 1000); // 5m30s
    expect(metrics.itemsAttempted).toBe(3);
    expect(metrics.itemsCompleted).toBe(2);
    expect(metrics.itemsFailed).toBe(1);
    expect(metrics.mergeStrategy).toBe("asap");
    expect(metrics.wipLimit).toBe(4);
  });

  it("tracks CI retry count per item", () => {
    const metrics = collectRunMetrics({
      startTime: "2026-03-24T10:00:00.000Z",
      endTime: "2026-03-24T10:01:00.000Z",
      items: [
        { id: "B-1-1", state: "done", ciFailCount: 0 },
        { id: "B-1-2", state: "done", ciFailCount: 2 },
        { id: "B-1-3", state: "stuck", ciFailCount: 5 },
      ],
      mergeStrategy: "approved",
      wipLimit: 3,
      aiTool: "opencode",
    });

    expect(metrics.items).toHaveLength(3);
    expect(metrics.items[0]).toMatchObject({ id: "B-1-1", ciRetryCount: 0, tool: "opencode" });
    expect(metrics.items[1]).toMatchObject({ id: "B-1-2", ciRetryCount: 2, tool: "opencode" });
    expect(metrics.items[2]).toMatchObject({ id: "B-1-3", ciRetryCount: 5, tool: "opencode" });
  });

  it("handles zero-item run gracefully", () => {
    const metrics = collectRunMetrics({
      startTime: "2026-03-24T10:00:00.000Z",
      endTime: "2026-03-24T10:00:01.000Z",
      items: [],
      mergeStrategy: "asap",
      wipLimit: 4,
      aiTool: "claude",
    });

    expect(metrics.itemsAttempted).toBe(0);
    expect(metrics.itemsCompleted).toBe(0);
    expect(metrics.itemsFailed).toBe(0);
    expect(metrics.items).toEqual([]);
    expect(metrics.durationMs).toBe(1000);
  });

  it("includes per-item PR numbers when present", () => {
    const metrics = collectRunMetrics({
      startTime: "2026-03-24T10:00:00.000Z",
      endTime: "2026-03-24T10:01:00.000Z",
      items: [
        { id: "C-1-1", state: "done", ciFailCount: 0, prNumber: 42 },
        { id: "C-1-2", state: "done", ciFailCount: 0 },
      ],
      mergeStrategy: "asap",
      wipLimit: 2,
      aiTool: "claude",
    });

    expect(metrics.items[0]!.prNumber).toBe(42);
    expect(metrics.items[1]!.prNumber).toBeNull();
  });

  it("defaults endTime to now if not provided", () => {
    const before = Date.now();
    const metrics = collectRunMetrics({
      startTime: "2026-03-24T10:00:00.000Z",
      items: [],
      mergeStrategy: "asap",
      wipLimit: 2,
      aiTool: "claude",
    });
    const after = Date.now();

    const endMs = new Date(metrics.runCompletedAt).getTime();
    expect(endMs).toBeGreaterThanOrEqual(before);
    expect(endMs).toBeLessThanOrEqual(after);
  });
});

// ── writeRunMetrics ──────────────────────────────────────────────────

describe("writeRunMetrics", () => {
  function makeMockDeps(): MetricsWriterDeps & {
    mkdirCalls: Array<{ path: string; opts: { recursive: boolean } }>;
    writeCalls: Array<{ path: string; data: string }>;
  } {
    const mkdirCalls: Array<{ path: string; opts: { recursive: boolean } }> = [];
    const writeCalls: Array<{ path: string; data: string }> = [];
    return {
      mkdir: (path, opts) => mkdirCalls.push({ path, opts }),
      writeFile: (path, data) => writeCalls.push({ path, data }),
      mkdirCalls,
      writeCalls,
    };
  }

  function makeMetrics(overrides?: Partial<RunMetrics>): RunMetrics {
    return {
      runStartedAt: "2026-03-24T10:00:00.000Z",
      runCompletedAt: "2026-03-24T10:05:00.000Z",
      durationMs: 300_000,
      itemsAttempted: 2,
      itemsCompleted: 2,
      itemsFailed: 0,
      mergeStrategy: "asap",
      wipLimit: 4,
      items: [
        { id: "T-1-1", state: "done", ciRetryCount: 0, tool: "claude", prNumber: 10 },
        { id: "T-1-2", state: "done", ciRetryCount: 1, tool: "claude", prNumber: 11 },
      ],
      ...overrides,
    };
  }

  it("writes metrics file on orchestrate_complete", () => {
    const deps = makeMockDeps();
    const metrics = makeMetrics();

    const filePath = writeRunMetrics("/project", metrics, deps);

    expect(deps.mkdirCalls).toHaveLength(1);
    expect(deps.mkdirCalls[0]!.path).toBe("/project/.ninthwave/analytics");
    expect(deps.mkdirCalls[0]!.opts).toEqual({ recursive: true });

    expect(deps.writeCalls).toHaveLength(1);
    expect(filePath).toContain("/project/.ninthwave/analytics/run-");
    expect(filePath).toEndWith(".json");
  });

  it("file contains wall-clock duration and item counts", () => {
    const deps = makeMockDeps();
    const metrics = makeMetrics({
      durationMs: 123_456,
      itemsAttempted: 5,
      itemsCompleted: 3,
      itemsFailed: 2,
    });

    writeRunMetrics("/project", metrics, deps);

    const written = JSON.parse(deps.writeCalls[0]!.data);
    expect(written.durationMs).toBe(123_456);
    expect(written.itemsAttempted).toBe(5);
    expect(written.itemsCompleted).toBe(3);
    expect(written.itemsFailed).toBe(2);
  });

  it("file contains CI retry count per item", () => {
    const deps = makeMockDeps();
    const metrics = makeMetrics({
      items: [
        { id: "X-1-1", state: "done", ciRetryCount: 0, tool: "claude", prNumber: null },
        { id: "X-1-2", state: "stuck", ciRetryCount: 3, tool: "claude", prNumber: 5 },
      ],
    });

    writeRunMetrics("/project", metrics, deps);

    const written = JSON.parse(deps.writeCalls[0]!.data);
    expect(written.items[0].ciRetryCount).toBe(0);
    expect(written.items[1].ciRetryCount).toBe(3);
  });

  it("creates analytics directory if it does not exist", () => {
    const deps = makeMockDeps();
    const metrics = makeMetrics();

    writeRunMetrics("/some/project", metrics, deps);

    expect(deps.mkdirCalls).toHaveLength(1);
    expect(deps.mkdirCalls[0]!.path).toBe("/some/project/.ninthwave/analytics");
    expect(deps.mkdirCalls[0]!.opts.recursive).toBe(true);
  });

  it("handles zero-item run gracefully", () => {
    const deps = makeMockDeps();
    const metrics = makeMetrics({
      itemsAttempted: 0,
      itemsCompleted: 0,
      itemsFailed: 0,
      items: [],
    });

    const filePath = writeRunMetrics("/project", metrics, deps);

    expect(filePath).toContain(".json");
    const written = JSON.parse(deps.writeCalls[0]!.data);
    expect(written.itemsAttempted).toBe(0);
    expect(written.itemsCompleted).toBe(0);
    expect(written.itemsFailed).toBe(0);
    expect(written.items).toEqual([]);
  });

  it("generates filesystem-safe filenames from timestamps", () => {
    const deps = makeMockDeps();
    const metrics = makeMetrics({
      runStartedAt: "2026-03-24T10:30:45.123Z",
    });

    const filePath = writeRunMetrics("/project", metrics, deps);

    // Colons and dots in ISO timestamps are replaced for filesystem safety
    expect(filePath).not.toContain(":");
    expect(filePath).toContain("run-2026-03-24T10-30-45-123Z.json");
  });

  it("writes valid JSON with all required fields", () => {
    const deps = makeMockDeps();
    const metrics = makeMetrics();

    writeRunMetrics("/project", metrics, deps);

    const written = JSON.parse(deps.writeCalls[0]!.data);
    expect(written).toHaveProperty("runStartedAt");
    expect(written).toHaveProperty("runCompletedAt");
    expect(written).toHaveProperty("durationMs");
    expect(written).toHaveProperty("itemsAttempted");
    expect(written).toHaveProperty("itemsCompleted");
    expect(written).toHaveProperty("itemsFailed");
    expect(written).toHaveProperty("mergeStrategy");
    expect(written).toHaveProperty("wipLimit");
    expect(written).toHaveProperty("items");

    // Per-item fields
    for (const item of written.items) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("state");
      expect(item).toHaveProperty("ciRetryCount");
      expect(item).toHaveProperty("tool");
    }
  });
});

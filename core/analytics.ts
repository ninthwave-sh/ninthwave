// Structured metrics for orchestrator runs.
// After each orchestration run, writes a JSON metrics file to .ninthwave/analytics/.
// One file per run, named by timestamp.

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

// ── Metrics schema ──────────────────────────────────────────────────

export interface ItemMetrics {
  id: string;
  state: string;
  ciRetryCount: number;
  /** AI tool used for this item (from execution context). */
  tool: string;
  prNumber?: number | null;
}

export interface RunMetrics {
  /** ISO 8601 timestamp of when the orchestration run started. */
  runStartedAt: string;
  /** ISO 8601 timestamp of when the orchestration run completed. */
  runCompletedAt: string;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** Total number of items in the run. */
  itemsAttempted: number;
  /** Items that reached "done" state. */
  itemsCompleted: number;
  /** Items that reached "stuck" state. */
  itemsFailed: number;
  /** Merge strategy used for the run. */
  mergeStrategy: string;
  /** WIP limit for the run. */
  wipLimit: number;
  /** Per-item breakdown. */
  items: ItemMetrics[];
}

// ── Metrics collection ──────────────────────────────────────────────

/**
 * Collect metrics from orchestrator state at the end of a run.
 *
 * @param startTime - ISO timestamp of when the run began
 * @param endTime - ISO timestamp of when the run ended (defaults to now)
 * @param items - Orchestrator items at end of run
 * @param mergeStrategy - Merge strategy used
 * @param wipLimit - WIP limit used
 * @param aiTool - AI tool detected for the run
 */
export function collectRunMetrics(opts: {
  startTime: string;
  endTime?: string;
  items: ReadonlyArray<{
    id: string;
    state: string;
    ciFailCount: number;
    prNumber?: number;
  }>;
  mergeStrategy: string;
  wipLimit: number;
  aiTool: string;
}): RunMetrics {
  const endTime = opts.endTime ?? new Date().toISOString();
  const startMs = new Date(opts.startTime).getTime();
  const endMs = new Date(endTime).getTime();

  return {
    runStartedAt: opts.startTime,
    runCompletedAt: endTime,
    durationMs: endMs - startMs,
    itemsAttempted: opts.items.length,
    itemsCompleted: opts.items.filter((i) => i.state === "done").length,
    itemsFailed: opts.items.filter((i) => i.state === "stuck").length,
    mergeStrategy: opts.mergeStrategy,
    wipLimit: opts.wipLimit,
    items: opts.items.map((i) => ({
      id: i.id,
      state: i.state,
      ciRetryCount: i.ciFailCount,
      tool: opts.aiTool,
      prNumber: i.prNumber ?? null,
    })),
  };
}

// ── File I/O ──────────────────────────────────────────────────────────

/** Dependencies for writing metrics (injectable for testing). */
export interface MetricsWriterDeps {
  mkdir: (path: string, opts: { recursive: boolean }) => void;
  writeFile: (path: string, data: string) => void;
}

const defaultWriterDeps: MetricsWriterDeps = {
  mkdir: mkdirSync,
  writeFile: writeFileSync,
};

/**
 * Write a RunMetrics object to .ninthwave/analytics/ as a JSON file.
 * File is named by the run start timestamp (ISO 8601, colons replaced for filesystem safety).
 *
 * @param projectRoot - Project root directory (where .ninthwave/ lives)
 * @param metrics - The metrics to write
 * @param deps - Injectable filesystem dependencies
 * @returns The full path to the written file
 */
export function writeRunMetrics(
  projectRoot: string,
  metrics: RunMetrics,
  deps: MetricsWriterDeps = defaultWriterDeps,
): string {
  const analyticsDir = join(projectRoot, ".ninthwave", "analytics");
  deps.mkdir(analyticsDir, { recursive: true });

  // Filename: replace colons and periods in ISO timestamp for filesystem safety
  const safeTimestamp = metrics.runStartedAt
    .replace(/:/g, "-")
    .replace(/\./g, "-");
  const filename = `run-${safeTimestamp}.json`;
  const filePath = join(analyticsDir, filename);

  deps.writeFile(filePath, JSON.stringify(metrics, null, 2) + "\n");

  return filePath;
}

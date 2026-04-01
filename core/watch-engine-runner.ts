import type {
  ExecutionContext,
  MergeStrategy,
  Orchestrator,
  OrchestratorItem,
  PollSnapshot,
} from "./orchestrator.ts";
import type { DaemonState, WorkerProgress } from "./daemon.ts";
import type { LogEntry } from "./types.ts";
import {
  mergeStrategyToPersisted,
  reviewModeToPersisted,
  type CollaborationMode,
  type ReviewMode,
} from "./tui-settings.ts";
import { saveUserConfig } from "./config.ts";
import type {
  InteractiveWatchTiming,
  OrchestrateLoopConfig,
  OrchestrateLoopDeps,
  OrchestrateLoopResult,
} from "./commands/orchestrate.ts";

export interface WatchEngineSnapshotEvent {
  state: DaemonState;
  pollSnapshot: PollSnapshot;
  pollIntervalMs?: number;
  interactiveTiming?: InteractiveWatchTiming;
  runtime: {
    mergeStrategy: MergeStrategy;
    wipLimit: number;
    reviewMode: ReviewMode;
    collaborationMode: CollaborationMode;
  };
}

export type WatchEngineControlCommand =
  | { type: "set-merge-strategy"; strategy: MergeStrategy; source?: string }
  | { type: "set-wip-limit"; limit: number; source?: string }
  | { type: "set-review-mode"; mode: ReviewMode; source?: string }
  | { type: "set-collaboration-mode"; mode: CollaborationMode; code?: string; source?: string };

export interface RuntimeControlHandlers {
  onStrategyChange?: (strategy: MergeStrategy) => void;
  onWipChange?: (delta: number) => void;
  onReviewChange?: (mode: ReviewMode) => void;
  onCollaborationChange?: (mode: CollaborationMode) => void;
  onCollaborationLocal?: () => { mode: "local" };
  onCollaborationShare?: () => { mode: "shared" };
  onCollaborationJoinSubmit?: (code: string) => { mode: "joined" };
}

export interface RuntimeControlHandlerDeps {
  sendControl: (command: WatchEngineControlCommand) => void;
  getWipLimit: () => number;
  saveUserConfigFn?: typeof saveUserConfig;
}

export function createRuntimeControlHandlers(
  deps: RuntimeControlHandlerDeps,
): RuntimeControlHandlers {
  const saveUserConfigFn = deps.saveUserConfigFn ?? saveUserConfig;

  return {
    onStrategyChange: (strategy) => {
      deps.sendControl({ type: "set-merge-strategy", strategy, source: "keyboard" });
      const persisted = mergeStrategyToPersisted(strategy);
      if (persisted) {
        try {
          saveUserConfigFn({ merge_strategy: persisted });
        } catch {
          // Best-effort persistence only.
        }
      }
    },
    onWipChange: (delta) => {
      const currentLimit = deps.getWipLimit();
      const newLimit = Math.max(1, currentLimit + delta);
      if (newLimit === currentLimit) return;
      deps.sendControl({ type: "set-wip-limit", limit: newLimit, source: "keyboard" });
      try {
        saveUserConfigFn({ wip_limit: newLimit });
      } catch {
        // Best-effort persistence only.
      }
    },
    onReviewChange: (mode) => {
      deps.sendControl({ type: "set-review-mode", mode, source: "keyboard" });
      try {
        saveUserConfigFn({ review_mode: reviewModeToPersisted(mode) });
      } catch {
        // Best-effort persistence only.
      }
    },
    onCollaborationChange: (mode) => {
      deps.sendControl({ type: "set-collaboration-mode", mode, source: "keyboard" });
    },
    onCollaborationLocal: () => {
      deps.sendControl({ type: "set-collaboration-mode", mode: "local", source: "keyboard" });
      return { mode: "local" };
    },
    onCollaborationShare: () => {
      deps.sendControl({ type: "set-collaboration-mode", mode: "shared", source: "keyboard" });
      return { mode: "shared" };
    },
    onCollaborationJoinSubmit: (code) => {
      deps.sendControl({ type: "set-collaboration-mode", mode: "joined", code, source: "keyboard" });
      return { mode: "joined" };
    },
  };
}

export interface WatchEngineRunner {
  run: (signal?: AbortSignal) => Promise<OrchestrateLoopResult>;
  sendControl: (command: WatchEngineControlCommand) => void;
  createRuntimeControlHandlers: (saveUserConfigFn?: typeof saveUserConfig) => RuntimeControlHandlers;
}

export interface WatchEngineRunnerDeps {
  orch: Orchestrator;
  ctx: ExecutionContext;
  loopDeps: Omit<OrchestrateLoopDeps, "log" | "onPollComplete">;
  loopConfig?: OrchestrateLoopConfig;
  runLoop: (
    orch: Orchestrator,
    ctx: ExecutionContext,
    deps: OrchestrateLoopDeps,
    config?: OrchestrateLoopConfig,
    signal?: AbortSignal,
  ) => Promise<OrchestrateLoopResult>;
  emitLog: (entry: LogEntry) => void;
  emitSnapshot: (event: WatchEngineSnapshotEvent) => void;
  buildState: (
    items: OrchestratorItem[],
    heartbeats: ReadonlyMap<string, WorkerProgress>,
    snapshot: PollSnapshot,
  ) => DaemonState;
  initialReviewMode: ReviewMode;
  initialCollaborationMode: CollaborationMode;
  getWipLimit: () => number;
  setWipLimit: (limit: number) => void;
}

function snapshotToHeartbeatMap(snapshot: PollSnapshot | undefined): Map<string, WorkerProgress> {
  const heartbeats = new Map<string, WorkerProgress>();
  if (!snapshot) return heartbeats;
  for (const item of snapshot.items) {
    if (item.lastHeartbeat) {
      heartbeats.set(item.id, item.lastHeartbeat);
    }
  }
  return heartbeats;
}

export function createWatchEngineRunner(
  deps: WatchEngineRunnerDeps,
): WatchEngineRunner {
  let reviewMode = deps.initialReviewMode;
  let collaborationMode = deps.initialCollaborationMode;

  const emitLog = (entry: LogEntry) => {
    deps.emitLog(entry);
  };

  const sendControl = (command: WatchEngineControlCommand) => {
    switch (command.type) {
      case "set-merge-strategy": {
        deps.orch.setMergeStrategy(command.strategy);
        return;
      }
      case "set-wip-limit": {
        const currentLimit = deps.getWipLimit();
        const newLimit = Math.max(1, command.limit);
        if (newLimit === currentLimit) return;
        deps.orch.setWipLimit(newLimit);
        deps.setWipLimit(newLimit);
        emitLog({
          ts: new Date().toISOString(),
          level: "info",
          event: "wip_limit_changed",
          oldLimit: currentLimit,
          newLimit,
          source: command.source ?? "runtime-control",
        });
        return;
      }
      case "set-review-mode": {
        reviewMode = command.mode;
        const skip = reviewMode === "off";
        deps.orch.setSkipReview(skip);
        emitLog({
          ts: new Date().toISOString(),
          level: "info",
          event: "review_mode_changed",
          mode: reviewMode,
          skipReview: skip,
          source: command.source ?? "runtime-control",
        });
        return;
      }
      case "set-collaboration-mode": {
        collaborationMode = command.mode;
        emitLog({
          ts: new Date().toISOString(),
          level: "info",
          event: "collaboration_mode_changed",
          mode: collaborationMode,
          ...(command.code ? { code: command.code } : {}),
          source: command.source ?? "runtime-control",
        });
        return;
      }
    }
  };

  return {
    run: (signal) => deps.runLoop(
      deps.orch,
      deps.ctx,
      {
        ...deps.loopDeps,
        log: emitLog,
        onPollComplete: (items, snapshot, pollIntervalMs, interactiveTiming) => {
          const heartbeats = snapshotToHeartbeatMap(snapshot);
          deps.emitSnapshot({
            state: deps.buildState(items, heartbeats, snapshot),
            pollSnapshot: snapshot,
            ...(pollIntervalMs !== undefined ? { pollIntervalMs } : {}),
            ...(interactiveTiming ? { interactiveTiming } : {}),
            runtime: {
              mergeStrategy: deps.orch.config.mergeStrategy,
              wipLimit: deps.getWipLimit(),
              reviewMode,
              collaborationMode,
            },
          });
        },
      },
      deps.loopConfig,
      signal,
    ),
    sendControl,
    createRuntimeControlHandlers: (saveUserConfigFn) => createRuntimeControlHandlers({
      sendControl,
      getWipLimit: deps.getWipLimit,
      ...(saveUserConfigFn ? { saveUserConfigFn } : {}),
    }),
  };
}

export function createDetachedDaemonEngineRunner(
  deps: WatchEngineRunnerDeps,
  createRunner: (deps: WatchEngineRunnerDeps) => WatchEngineRunner = createWatchEngineRunner,
): WatchEngineRunner {
  return createRunner(deps);
}

export function createInteractiveChildEngineRunner(
  deps: WatchEngineRunnerDeps,
  createRunner: (deps: WatchEngineRunnerDeps) => WatchEngineRunner = createWatchEngineRunner,
): WatchEngineRunner {
  return createRunner(deps);
}

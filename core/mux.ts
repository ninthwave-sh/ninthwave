// Multiplexer interface: abstracts terminal multiplexer operations.
// Decouples command modules from the concrete cmux implementation.

import * as cmux from "./cmux.ts";
import { die } from "./output.ts";
import { resolveCmuxBinary } from "./cmux-resolve.ts";
import type { RunResult } from "./types.ts";

/** Shell runner signature -- injectable for testing. */
export type ShellRunner = (
  cmd: string,
  args: string[],
) => RunResult;

/** Terminal multiplexer abstraction for workspace management. */
export interface Multiplexer {
  /** Identifier for this mux backend. */
  readonly type: MuxType;
  /** Check if the multiplexer backend is available (binary installed + session active). */
  isAvailable(): boolean;
  /** Return a human-readable message explaining why isAvailable() returned false. */
  diagnoseUnavailable(): string;
  /** Launch a new workspace. Returns a ref (e.g., "workspace:1") or null on failure. */
  launchWorkspace(cwd: string, command: string, todoId?: string): string | null;
  /** Split a pane in the current workspace. Returns a ref or null on failure. */
  splitPane(command: string): string | null;
  /** Send a message to a workspace. Returns true on success. */
  sendMessage(ref: string, message: string): boolean;
  /** Read screen content from a workspace. Returns raw text or "" on failure. */
  readScreen(ref: string, lines?: number): string;
  /** List all workspaces. Returns raw output string. */
  listWorkspaces(): string;
  /** Close a workspace. Returns true on success. */
  closeWorkspace(ref: string): boolean;
  /** Set status text, icon, and color for a workspace. Best-effort -- returns boolean success. */
  setStatus(ref: string, key: string, text: string, icon: string, color: string): boolean;
  /** Set progress value (0.0–1.0) and optional label for a workspace. Best-effort -- returns boolean success. */
  setProgress(ref: string, value: number, label?: string): boolean;
}

/** Adapter that delegates to the cmux CLI binary. */
export class CmuxAdapter implements Multiplexer {
  readonly type: MuxType = "cmux";

  isAvailable(): boolean {
    return cmux.isAvailable();
  }

  diagnoseUnavailable(): string {
    return "cmux is not available. Ensure cmux is installed and running.";
  }
  launchWorkspace(cwd: string, command: string, _todoId?: string): string | null {
    return cmux.launchWorkspace(cwd, command);
  }
  splitPane(command: string): string | null {
    return cmux.splitPane(command);
  }
  sendMessage(ref: string, message: string): boolean {
    return cmux.sendMessage(ref, message);
  }
  readScreen(ref: string, lines?: number): string {
    return cmux.readScreen(ref, lines);
  }
  listWorkspaces(): string {
    return cmux.listWorkspaces();
  }
  closeWorkspace(ref: string): boolean {
    return cmux.closeWorkspace(ref);
  }
  setStatus(ref: string, key: string, text: string, icon: string, color: string): boolean {
    return cmux.setStatus(ref, key, text, icon, color);
  }
  setProgress(ref: string, value: number, label?: string): boolean {
    return cmux.setProgress(ref, value, label);
  }
}

/** Supported multiplexer backends. */
export type MuxType = "cmux";

/** Injectable dependencies for multiplexer detection -- enables testing without vi.mock. */
export interface DetectMuxDeps {
  env: Record<string, string | undefined>;
  checkBinary: (name: string) => boolean;
}

const defaultDetectDeps: DetectMuxDeps = {
  env: process.env,
  checkBinary: (_name: string): boolean => resolveCmuxBinary() !== null,
};

/**
 * Auto-detect the best available multiplexer.
 *
 * Detection chain:
 * 1. CMUX_WORKSPACE_ID -- inside a cmux session
 * 2. cmux binary available
 * 3. Error -- no multiplexer found
 */
export function detectMuxType(deps: DetectMuxDeps = defaultDetectDeps): MuxType {
  const { env, checkBinary } = deps;

  // 1. Inside a cmux session
  if (env.CMUX_WORKSPACE_ID) return "cmux";

  // 2. cmux binary available
  if (checkBinary("cmux")) return "cmux";

  // 3. No multiplexer found
  throw new Error(
    "No multiplexer available. Install cmux: brew install --cask manaflow-ai/cmux/cmux",
  );
}

/**
 * Return the active multiplexer adapter based on auto-detection.
 *
 * When detection fails (no mux available), falls back to CmuxAdapter so that
 * callers using `getMux()` as a default parameter don't crash at import time.
 * The adapter's `isAvailable()` will return false, and the caller can handle
 * the error.
 */
export function getMux(deps?: DetectMuxDeps): Multiplexer {
  try {
    detectMuxType(deps);
    return new CmuxAdapter();
  } catch {
    // No mux available -- fall back to CmuxAdapter (isAvailable() will report false)
    return new CmuxAdapter();
  }
}

// ── Ensure we're inside a cmux session ───────────────────────────────

/** Injectable dependencies for cmux session detection. */
export interface AutoLaunchDeps {
  env: Record<string, string | undefined>;
  checkBinary: (name: string) => boolean;
}

/** Possible outcomes from auto-launch detection. */
export type AutoLaunchResult =
  | { action: "proceed" }
  | { action: "error"; message: string };

/**
 * Pure detection logic: determine whether to proceed or error.
 *
 * Detection chain:
 * 1. CMUX_WORKSPACE_ID set → proceed (already inside cmux)
 * 2. cmux installed → error (detected but not in a session)
 * 3. cmux not installed → error (install prompt)
 */
export function checkAutoLaunch(deps: AutoLaunchDeps): AutoLaunchResult {
  const { env, checkBinary } = deps;

  // 1. Already inside cmux -- proceed normally
  if (env.CMUX_WORKSPACE_ID) return { action: "proceed" };

  // 2. cmux installed but not in a session
  if (checkBinary("cmux")) {
    return {
      action: "error",
      message: "Not inside a cmux session. Open cmux and run nw there.",
    };
  }

  // 3. cmux not installed
  return {
    action: "error",
    message: "Install cmux: brew install --cask manaflow-ai/cmux/cmux",
  };
}

const defaultAutoLaunchDeps: AutoLaunchDeps = {
  env: process.env,
  checkBinary: (_name: string): boolean => resolveCmuxBinary() !== null,
};

/**
 * Ensure we're inside a cmux session, or die with a helpful message.
 *
 * For commands that need a multiplexer (watch, start, <ID>, no-args interactive),
 * call this before proceeding.
 */
export function ensureMuxOrAutoLaunch(
  _originalArgs: string[],
  deps: AutoLaunchDeps = defaultAutoLaunchDeps,
): void {
  const result = checkAutoLaunch(deps);
  if (result.action === "proceed") return;
  die(result.message);
}

/**
 * Poll a workspace until it shows stable, substantial content (agent is ready).
 *
 * Checks `readScreen` every `pollMs` milliseconds. Returns true once the screen
 * has >= 3 non-empty lines and the content is the same for two consecutive polls
 * (indicating the agent has finished loading and the UI is stable).
 *
 * @param sleep -- injectable for testing; defaults to Bun.sleepSync
 */
export function waitForReady(
  mux: Multiplexer,
  ref: string,
  sleep: (ms: number) => void = process.env.NODE_ENV === "test"
    ? () => {}
    : (ms) => Bun.sleepSync(ms),
  maxAttempts: number = 30,
  pollMs: number = 500,
): boolean {
  let lastScreen = "";

  for (let i = 0; i < maxAttempts; i++) {
    sleep(pollMs);
    const screen = mux.readScreen(ref, 10);
    const lines = screen.split("\n").filter((l) => l.trim().length > 0);

    // Stable, substantial content = ready
    if (lines.length >= 3 && screen === lastScreen) {
      return true;
    }
    lastScreen = screen;
  }

  return false;
}

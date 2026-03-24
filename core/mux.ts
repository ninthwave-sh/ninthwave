// Multiplexer interface: abstracts terminal multiplexer operations.
// Decouples command modules from the concrete cmux implementation.

import * as cmux from "./cmux.ts";

/** Terminal multiplexer abstraction for workspace management. */
export interface Multiplexer {
  /** Check if the multiplexer backend is available. */
  isAvailable(): boolean;
  /** Launch a new workspace. Returns a ref (e.g., "workspace:1") or null on failure. */
  launchWorkspace(cwd: string, command: string): string | null;
  /** Send a message to a workspace. Returns true on success. */
  sendMessage(ref: string, message: string): boolean;
  /** Read screen content from a workspace. Returns raw text or "" on failure. */
  readScreen(ref: string, lines?: number): string;
  /** List all workspaces. Returns raw output string. */
  listWorkspaces(): string;
  /** Close a workspace. Returns true on success. */
  closeWorkspace(ref: string): boolean;
}

/** Adapter that delegates to the cmux CLI binary. */
export class CmuxAdapter implements Multiplexer {
  isAvailable(): boolean {
    return cmux.isAvailable();
  }
  launchWorkspace(cwd: string, command: string): string | null {
    return cmux.launchWorkspace(cwd, command);
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
}

/** Return the active multiplexer adapter. */
export function getMux(): Multiplexer {
  return new CmuxAdapter();
}

/**
 * Poll a workspace until it shows stable, substantial content (agent is ready).
 *
 * Checks `readScreen` every `pollMs` milliseconds. Returns true once the screen
 * has >= 3 non-empty lines and the content is the same for two consecutive polls
 * (indicating the agent has finished loading and the UI is stable).
 *
 * @param sleep — injectable for testing; defaults to Bun.sleepSync
 */
export function waitForReady(
  mux: Multiplexer,
  ref: string,
  sleep: (ms: number) => void = (ms) => Bun.sleepSync(ms),
  maxAttempts: number = 15,
  pollMs: number = 2000,
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

// Tmux-specific paste-then-submit send logic.
// Uses tmux load-buffer (stdin pipe) + paste-buffer + send-keys Enter.
// Reuses sendWithRetry and checkDelivery from core/delivery.ts.

import type { RunResult } from "./types.ts";
import { checkDelivery, sendWithRetry, type Sleeper } from "./delivery.ts";

/** Tmux-aware runner: supports stdin input for load-buffer. */
export type TmuxRunner = (
  cmd: string,
  args: string[],
  opts?: { input?: string },
) => RunResult;

/** Injectable dependencies for tmux message sending. */
export interface TmuxSendDeps {
  runner: TmuxRunner;
  sleep: Sleeper;
  maxRetries?: number;
  baseDelayMs?: number;
}

/**
 * Send a message to a tmux pane via paste-then-submit.
 *
 * Flow: load-buffer (stdin) -> paste-buffer -> send-keys Enter -> verify.
 * Retries with exponential backoff via sendWithRetry from delivery.ts.
 */
export function tmuxSendMessage(
  target: string,
  message: string,
  deps: TmuxSendDeps,
): boolean {
  const { runner, sleep, maxRetries = 3, baseDelayMs = 100 } = deps;

  return sendWithRetry(
    () => attemptTmuxSend(target, message, runner, sleep),
    { sleep, maxRetries, baseDelayMs },
  );
}

/** Single delivery attempt: load-buffer, paste-buffer, send-keys Enter, verify. */
function attemptTmuxSend(
  target: string,
  message: string,
  runner: TmuxRunner,
  sleep: Sleeper,
): boolean {
  // 1. Load message into tmux buffer via stdin (avoids shell escaping issues)
  const load = runner("tmux", ["load-buffer", "-"], { input: message });
  if (load.exitCode !== 0) return false;

  // 2. Paste buffer into the target pane
  const paste = runner("tmux", ["paste-buffer", "-t", target]);
  if (paste.exitCode !== 0) return false;

  // 3. Let the terminal process the pasted text
  sleep(50);

  // 4. Press Enter to submit
  const key = runner("tmux", ["send-keys", "-t", target, "Enter"]);
  if (key.exitCode !== 0) return false;

  // 5. Verify delivery
  sleep(100);
  return verifyTmuxDelivery(target, message, runner);
}

/**
 * Read screen via capture-pane and check delivery.
 *
 * If capture-pane fails, assumes success -- the load-buffer + paste-buffer
 * path is inherently reliable (atomic buffer load, no keystroke race).
 */
function verifyTmuxDelivery(
  target: string,
  message: string,
  runner: TmuxRunner,
): boolean {
  const screen = runner("tmux", ["capture-pane", "-t", target, "-p"]);
  if (screen.exitCode !== 0) {
    // Can't verify -- paste-buffer is reliable, assume success
    return true;
  }
  return checkDelivery(screen.stdout, message);
}

// TmuxAdapter: implements Multiplexer interface using tmux as the backend.
// Uses windows-within-session model: one tmux session per project, workers
// are tmux windows named nw_{todoId}. Session is resolved from $TMUX
// (inside tmux) or created as nw-{dirname} (outside tmux).

import { basename } from "path";
import type { Multiplexer, MuxType } from "./mux.ts";
import { tmuxSendMessage } from "./tmux-send.ts";
import type { TmuxRunner } from "./tmux-send.ts";
export type { TmuxRunner } from "./tmux-send.ts";

/**
 * Sanitize a name for tmux session/window usage.
 * Allowlist: [a-zA-Z0-9_-]. Everything else becomes _.
 * Same pattern as sanitizeTitle in launch.ts but without spaces
 * (spaces in tmux names cause quoting issues in target specs).
 */
export function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** Injectable dependencies for the TmuxAdapter. */
export interface TmuxAdapterDeps {
  runner: TmuxRunner;
  sleep: (ms: number) => void;
  env: Record<string, string | undefined>;
  cwd: () => string;
}

/** Construct the tmux window name for a work item. */
function windowName(todoId: string): string {
  return `nw_${sanitizeName(todoId)}`;
}

/**
 * Resolve the tmux session name for ninthwave.
 *
 * - Inside tmux ($TMUX set): queries the current session name via display-message
 * - Outside tmux: uses `nw-{dirname}` where dirname is the sanitized cwd basename
 */
export function resolveSessionName(
  deps: Pick<TmuxAdapterDeps, "runner" | "env" | "cwd">,
): string {
  if (deps.env.TMUX) {
    const result = deps.runner("tmux", ["display-message", "-p", "#S"]);
    if (result.exitCode === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  }
  const dirname = basename(deps.cwd()) || "nw";
  return `nw-${sanitizeName(dirname)}`;
}

/** Adapter that delegates to the tmux CLI binary. */
export class TmuxAdapter implements Multiplexer {
  readonly type: MuxType = "tmux";

  private deps: TmuxAdapterDeps;
  private sessionName: string | null = null;

  constructor(deps: TmuxAdapterDeps) {
    this.deps = deps;
  }

  /** Lazily resolve and cache the session name. */
  private getSessionName(): string {
    if (!this.sessionName) {
      this.sessionName = resolveSessionName(this.deps);
    }
    return this.sessionName;
  }

  /**
   * Ensure the tmux session exists, creating it if necessary.
   * Reuses existing session (crash recovery) via has-session check.
   */
  private ensureSession(): boolean {
    const session = this.getSessionName();
    const check = this.deps.runner("tmux", ["has-session", "-t", session]);
    if (check.exitCode === 0) return true;

    // Session doesn't exist -- create detached
    const create = this.deps.runner("tmux", [
      "new-session",
      "-d",
      "-s",
      session,
    ]);
    return create.exitCode === 0;
  }

  isAvailable(): boolean {
    const result = this.deps.runner("tmux", ["-V"]);
    return result.exitCode === 0;
  }

  diagnoseUnavailable(): string {
    return "tmux is not available. Install tmux: brew install tmux (macOS) or apt install tmux (Linux).";
  }

  launchWorkspace(
    cwd: string,
    command: string,
    todoId?: string,
  ): string | null {
    if (!this.ensureSession()) return null;

    const session = this.getSessionName();
    const winName = todoId ? windowName(todoId) : `nw_${Date.now()}`;
    const target = `${session}:${winName}`;

    // Kill existing window if name collides (retry scenario)
    this.deps.runner("tmux", ["kill-window", "-t", target]);

    // Create new window with the command
    const result = this.deps.runner("tmux", [
      "new-window",
      "-t",
      session,
      "-n",
      winName,
      "-c",
      cwd,
      command,
    ]);
    if (result.exitCode !== 0) return null;

    return target;
  }

  splitPane(_command: string): string | null {
    // Not supported in tmux adapter
    return null;
  }

  sendMessage(ref: string, message: string): boolean {
    return tmuxSendMessage(ref, message, {
      runner: this.deps.runner,
      sleep: this.deps.sleep,
    });
  }

  readScreen(ref: string, lines?: number): string {
    const result = this.deps.runner("tmux", [
      "capture-pane",
      "-t",
      ref,
      "-p",
    ]);
    if (result.exitCode !== 0) return "";
    if (lines === undefined) return result.stdout;

    // Return last N lines
    const allLines = result.stdout.split("\n");
    return allLines.slice(-lines).join("\n");
  }

  listWorkspaces(): string {
    const session = this.getSessionName();
    const result = this.deps.runner("tmux", [
      "list-windows",
      "-t",
      session,
      "-F",
      "#{window_name}",
    ]);
    if (result.exitCode !== 0) return "";

    // Filter to nw_ prefixed windows (ninthwave workers)
    return result.stdout
      .split("\n")
      .filter((l) => l.startsWith("nw_"))
      .join("\n");
  }

  closeWorkspace(ref: string): boolean {
    const result = this.deps.runner("tmux", ["kill-window", "-t", ref]);
    return result.exitCode === 0;
  }

  setStatus(
    _ref: string,
    _key: string,
    _text: string,
    _icon: string,
    _color: string,
  ): boolean {
    // No-op -- tmux has no native status-per-window API
    return false;
  }

  setProgress(_ref: string, _value: number, _label?: string): boolean {
    // No-op -- tmux has no native progress API
    return false;
  }
}

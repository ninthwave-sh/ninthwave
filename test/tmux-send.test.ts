// Tests for tmux-send -- paste-then-submit flow, delivery verification, retry.
// Uses dependency injection (no vi.mock). Imports only from core/tmux-send.ts.

import { describe, it, expect, vi } from "vitest";
import { tmuxSendMessage, type TmuxSendDeps } from "../core/tmux-send.ts";
import type { RunResult } from "../core/types.ts";

// ── Helpers ──────────────────────────────────────────────────────────

function ok(stdout = ""): RunResult {
  return { stdout, stderr: "", exitCode: 0 };
}

function fail(stderr = "error"): RunResult {
  return { stdout: "", stderr, exitCode: 1 };
}

/**
 * Create deps with a dispatch runner that routes on tmux subcommand.
 * Handlers can be static RunResult or functions for dynamic behavior.
 */
function makeDeps(
  handlers: Record<
    string,
    RunResult | ((_cmd: string, _args: string[], _opts?: { input?: string }) => RunResult)
  >,
  overrides?: Partial<TmuxSendDeps>,
): TmuxSendDeps & {
  runner: ReturnType<typeof vi.fn>;
  sleep: ReturnType<typeof vi.fn>;
} {
  const runner = vi.fn(
    (
      _cmd: string,
      args: string[],
      opts?: { input?: string },
    ): RunResult => {
      const sub = args[0] ?? "";
      const handler = handlers[sub];
      if (!handler) return ok();
      return typeof handler === "function"
        ? handler(_cmd, args, opts)
        : handler;
    },
  );
  const sleep = vi.fn();
  return { runner, sleep, ...overrides };
}

// ── tmuxSendMessage: paste-then-submit flow ─────────────────────────

describe("tmuxSendMessage", () => {
  it("sends via load-buffer stdin, paste-buffer, send-keys, and verifies", () => {
    const deps = makeDeps({
      "load-buffer": ok(),
      "paste-buffer": ok(),
      "send-keys": ok(),
      "capture-pane": ok(""),
    });

    const result = tmuxSendMessage("session:window", "Hello worker", deps);
    expect(result).toBe(true);

    const calls = deps.runner.mock.calls;

    // 1. load-buffer with stdin input
    expect(calls[0][1]).toEqual(["load-buffer", "-"]);
    expect(calls[0][2]).toEqual({ input: "Hello worker" });

    // 2. paste-buffer into target
    expect(calls[1][1]).toEqual(["paste-buffer", "-t", "session:window"]);

    // 3. send-keys Enter
    expect(calls[2][1]).toEqual([
      "send-keys",
      "-t",
      "session:window",
      "Enter",
    ]);

    // 4. capture-pane for verification
    expect(calls[3][1]).toEqual([
      "capture-pane",
      "-t",
      "session:window",
      "-p",
    ]);
  });

  it("pipes message content via stdin input option for load-buffer", () => {
    const deps = makeDeps({
      "load-buffer": ok(),
      "paste-buffer": ok(),
      "send-keys": ok(),
      "capture-pane": ok(""),
    });

    tmuxSendMessage("session:window", "multi\nline\nmessage", deps);

    const loadCall = deps.runner.mock.calls[0];
    expect(loadCall[2]).toEqual({ input: "multi\nline\nmessage" });
  });

  it("waits between paste and Enter, and after Enter before verify", () => {
    const deps = makeDeps({
      "load-buffer": ok(),
      "paste-buffer": ok(),
      "send-keys": ok(),
      "capture-pane": ok(""),
    });

    tmuxSendMessage("session:window", "test", deps);

    // sleep(50) after paste, sleep(100) after send-keys before verify
    expect(deps.sleep).toHaveBeenCalledWith(50);
    expect(deps.sleep).toHaveBeenCalledWith(100);
  });

  it("returns true on first attempt when delivery succeeds", () => {
    const deps = makeDeps({
      "load-buffer": ok(),
      "paste-buffer": ok(),
      "send-keys": ok(),
      "capture-pane": ok("claude> "),
    });

    const result = tmuxSendMessage("session:window", "check status", deps);

    expect(result).toBe(true);
    // 4 tmux calls = one attempt
    expect(deps.runner).toHaveBeenCalledTimes(4);
  });

  // ── Failure paths ──────────────────────────────────────────────────

  it("returns false when load-buffer fails on every attempt", () => {
    const deps = makeDeps({
      "load-buffer": fail("buffer error"),
    });

    const result = tmuxSendMessage("session:window", "msg", deps);
    expect(result).toBe(false);
  });

  it("returns false when paste-buffer fails on every attempt", () => {
    const deps = makeDeps({
      "load-buffer": ok(),
      "paste-buffer": fail("pane not found"),
    });

    const result = tmuxSendMessage("session:window", "msg", deps);
    expect(result).toBe(false);
  });

  it("returns false when send-keys fails on every attempt", () => {
    const deps = makeDeps({
      "load-buffer": ok(),
      "paste-buffer": ok(),
      "send-keys": fail("key error"),
    });

    const result = tmuxSendMessage("session:window", "msg", deps);
    expect(result).toBe(false);
  });

  // ── Retry behavior ────────────────────────────────────────────────

  it("retries with exponential backoff when load-buffer fails", () => {
    let loadCalls = 0;
    const deps = makeDeps({
      "load-buffer": () => {
        loadCalls++;
        return loadCalls <= 2 ? fail() : ok();
      },
      "paste-buffer": ok(),
      "send-keys": ok(),
      "capture-pane": ok(""),
    });
    deps.maxRetries = 3;
    deps.baseDelayMs = 100;

    const result = tmuxSendMessage("session:window", "retry test", deps);

    expect(result).toBe(true);
    // Backoff sleeps before retry attempts
    expect(deps.sleep).toHaveBeenCalledWith(100); // attempt 2: 100 * 2^0
    expect(deps.sleep).toHaveBeenCalledWith(200); // attempt 3: 100 * 2^1
  });

  it("retries when capture-pane detects stuck message", () => {
    let captureCalls = 0;
    const deps = makeDeps({
      "load-buffer": ok(),
      "paste-buffer": ok(),
      "send-keys": ok(),
      "capture-pane": () => {
        captureCalls++;
        // First verify: message stuck in input; second: submitted
        return captureCalls === 1
          ? ok("prompt\nRebase onto main please")
          : ok("claude> ");
      },
    });
    deps.maxRetries = 3;
    deps.baseDelayMs = 50;

    const result = tmuxSendMessage(
      "session:window",
      "Rebase onto main please",
      deps,
    );

    expect(result).toBe(true);
    expect(captureCalls).toBe(2);
  });

  it("returns false after exhausting all retries", () => {
    const runner = vi.fn((): RunResult => fail("fatal"));
    const sleep = vi.fn();

    const result = tmuxSendMessage("session:window", "doomed", {
      runner,
      sleep,
      maxRetries: 2,
      baseDelayMs: 50,
    });

    expect(result).toBe(false);
    // 3 total attempts (initial + 2 retries), each calls load-buffer once
    expect(runner).toHaveBeenCalledTimes(3);
  });

  // ── Delivery verification ─────────────────────────────────────────

  it("assumes success when capture-pane fails (paste is reliable)", () => {
    const deps = makeDeps({
      "load-buffer": ok(),
      "paste-buffer": ok(),
      "send-keys": ok(),
      "capture-pane": fail("pane not found"),
    });

    const result = tmuxSendMessage("session:window", "msg", deps);
    expect(result).toBe(true);
  });

  it("detects stuck message on last screen line and retries", () => {
    let captureCalls = 0;
    const deps = makeDeps({
      "load-buffer": ok(),
      "paste-buffer": ok(),
      "send-keys": ok(),
      "capture-pane": () => {
        captureCalls++;
        // First: message stuck; second: submitted
        return captureCalls === 1
          ? ok("output\nhello world")
          : ok("thinking...");
      },
    });
    deps.maxRetries = 1;
    deps.baseDelayMs = 50;

    const result = tmuxSendMessage("session:window", "hello world", deps);

    expect(result).toBe(true);
    expect(captureCalls).toBe(2);
  });

  // ── Defaults ──────────────────────────────────────────────────────

  it("uses default retries (3) and delay (100ms) when not specified", () => {
    const runner = vi.fn((): RunResult => fail());
    const sleep = vi.fn();

    tmuxSendMessage("session:window", "msg", { runner, sleep });

    // 4 total attempts (initial + 3 retries)
    expect(runner).toHaveBeenCalledTimes(4);
    // Backoff delays: 100, 200, 400
    expect(sleep).toHaveBeenCalledWith(100);
    expect(sleep).toHaveBeenCalledWith(200);
    expect(sleep).toHaveBeenCalledWith(400);
  });

  it("handles empty message", () => {
    const deps = makeDeps({
      "load-buffer": ok(),
      "paste-buffer": ok(),
      "send-keys": ok(),
      "capture-pane": ok(""),
    });

    const result = tmuxSendMessage("session:window", "", deps);
    expect(result).toBe(true);
  });
});

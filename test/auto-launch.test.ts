// Tests for auto-launch logic: checkAutoLaunch and ensureMuxOrAutoLaunch.
// Uses dependency injection -- no vi.mock needed.

import { describe, it, expect, vi } from "vitest";
import {
  checkAutoLaunch,
  ensureMuxOrAutoLaunch,
  type AutoLaunchDeps,
} from "../core/mux.ts";

// ── Helper: build injectable AutoLaunchDeps ─────────────────────────

function makeDeps(overrides: Partial<AutoLaunchDeps> = {}): AutoLaunchDeps {
  return {
    env: {},
    checkBinary: () => false,
    ...overrides,
  };
}

// ── Helper: capture console.error + mock process.exit ───────────────

function withMockedExit(fn: () => void): { exitCode: number | null; stderr: string } {
  const errors: string[] = [];
  const origError = console.error;
  const origExit = process.exit;
  console.error = (...args: unknown[]) => errors.push(args.join(" "));
  process.exit = ((code?: number) => {
    throw new Error(`EXIT:${code ?? 0}`);
  }) as never;

  let exitCode: number | null = null;
  try {
    fn();
  } catch (e: unknown) {
    if (e instanceof Error && e.message.startsWith("EXIT:")) {
      exitCode = parseInt(e.message.slice(5), 10);
    } else {
      throw e;
    }
  } finally {
    console.error = origError;
    process.exit = origExit;
  }

  return { exitCode, stderr: errors.join("\n") };
}

// ── checkAutoLaunch (pure detection logic) ──────────────────────────

describe("checkAutoLaunch", () => {
  it("returns proceed when CMUX_WORKSPACE_ID is set", () => {
    const deps = makeDeps({
      env: { CMUX_WORKSPACE_ID: "workspace:1" },
      checkBinary: () => true,

    });
    expect(checkAutoLaunch(deps)).toEqual({ action: "proceed" });
  });

  it("returns error when cmux installed but not in a session", () => {
    const deps = makeDeps({
      env: {},
      checkBinary: (name) => name === "cmux",

    });
    const result = checkAutoLaunch(deps);
    expect(result.action).toBe("error");
    expect((result as { message: string }).message).toContain("Open cmux");
  });

  it("returns error with install prompt when cmux not available", () => {
    const deps = makeDeps({
      env: {},
      checkBinary: () => false,

    });
    const result = checkAutoLaunch(deps);
    expect(result.action).toBe("error");
    expect((result as { message: string }).message).toContain("Install cmux");
  });

  it("returns error with install prompt when cmux not available + non-TTY", () => {
    const deps = makeDeps({
      env: {},
      checkBinary: () => false,

    });
    const result = checkAutoLaunch(deps);
    expect(result.action).toBe("error");
    expect((result as { message: string }).message).toContain("Install cmux");
  });

  it("prioritizes CMUX_WORKSPACE_ID over missing binary", () => {
    const deps = makeDeps({
      env: { CMUX_WORKSPACE_ID: "workspace:1" },
      checkBinary: () => false,

    });
    expect(checkAutoLaunch(deps)).toEqual({ action: "proceed" });
  });

  it("does not check binary when CMUX_WORKSPACE_ID is set", () => {
    const checkBinary = vi.fn(() => false);
    const deps = makeDeps({
      env: { CMUX_WORKSPACE_ID: "workspace:1" },
      checkBinary,

    });
    checkAutoLaunch(deps);
    expect(checkBinary).not.toHaveBeenCalled();
  });
});

// ── ensureMuxOrAutoLaunch (side-effectful wrapper) ──────────────────

describe("ensureMuxOrAutoLaunch", () => {
  it("returns normally when inside cmux", () => {
    const deps = makeDeps({
      env: { CMUX_WORKSPACE_ID: "workspace:1" },
    });

    // Should not throw
    ensureMuxOrAutoLaunch(["watch"], deps);
  });

  it("dies with session message when cmux installed but not in session", () => {
    const deps = makeDeps({
      env: {},
      checkBinary: (name) => name === "cmux",

    });

    const { exitCode, stderr } = withMockedExit(() => {
      ensureMuxOrAutoLaunch(["watch"], deps);
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Open cmux");
  });

  it("dies with install prompt when cmux not available", () => {
    const deps = makeDeps({
      env: {},
      checkBinary: () => false,

    });

    const { exitCode, stderr } = withMockedExit(() => {
      ensureMuxOrAutoLaunch(["watch"], deps);
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Install cmux");
  });
});

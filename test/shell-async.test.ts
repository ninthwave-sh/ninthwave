// Tests for core/shell.ts -- runAsync() with timeout support.
// Uses real Bun.spawn (no mocking needed for shell integration tests).

import { describe, it, expect } from "vitest";
import { runAsync } from "../core/shell.ts";

describe("runAsync()", () => {
  // ── Basic execution ────────────────────────────────────────────────

  it("runs a command and captures stdout", async () => {
    const result = await runAsync("echo", ["hello"]);
    expect(result.stdout).toBe("hello");
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBeUndefined();
  });

  it("captures stderr and non-zero exit code", async () => {
    const result = await runAsync("ls", ["nonexistent-path-that-does-not-exist-12345"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).not.toBe("");
    expect(result.timedOut).toBeUndefined();
  });

  it("passes cwd option correctly", async () => {
    const result = await runAsync("pwd", [], { cwd: "/tmp" });
    expect(result.stdout).toMatch(/\/tmp$/);
    expect(result.exitCode).toBe(0);
  });

  it("pipes input via stdin", async () => {
    const result = await runAsync("cat", [], { input: "stdin data" });
    expect(result.stdout).toBe("stdin data");
    expect(result.exitCode).toBe(0);
  });

  // ── Timeout handling ───────────────────────────────────────────────

  it("kills process and returns timeout error when timeout exceeded", async () => {
    const result = await runAsync("sleep", ["10"], { timeout: 500 });
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("TIMEOUT");
    expect(result.stderr).toContain("500ms");
    expect(result.stderr).toContain("sleep");
  });

  it("does not time out when command completes within timeout", async () => {
    const result = await runAsync("echo", ["fast"], { timeout: 10_000 });
    expect(result.timedOut).toBeUndefined();
    expect(result.stdout).toBe("fast");
    expect(result.exitCode).toBe(0);
  });

  // ── Command-not-found / non-zero exit ──────────────────────────────

  it("handles failing commands gracefully", async () => {
    const result = await runAsync("false", []);
    expect(result.exitCode).not.toBe(0);
    expect(result.timedOut).toBeUndefined();
  });

  // ── Whitespace trimming ────────────────────────────────────────────

  it("trims leading and trailing whitespace from stdout", async () => {
    const result = await runAsync("printf", ["  hello  \\n"]);
    expect(result.stdout).toBe("hello");
    expect(result.exitCode).toBe(0);
  });

  it("trims stderr", async () => {
    const result = await runAsync("sh", ["-c", "printf '  oops  \\n' >&2; exit 1"]);
    expect(result.stderr).toBe("oops");
    expect(result.exitCode).toBe(1);
  });
});

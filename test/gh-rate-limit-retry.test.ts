// Tests for runGhWithRateLimitRetry in core/gh.ts.
//
// Covers the M-ORCH-19 contract: GraphQL rate-limit failures are absorbed
// by the shared backoff/retry pathway instead of bubbling up to callers
// (workers, review-inbox) that would otherwise burn their own retry budget.
//
// Uses dependency injection (sleepImpl, runAsyncImpl, queryRateLimitImpl,
// nowImpl) instead of vi.mock -- the gh module is imported by other tests
// and we don't want to leak module-level mocks.

import { describe, it, expect, vi } from "vitest";
import { runGhWithRateLimitRetry } from "../core/gh.ts";
import type { RunResult } from "../core/types.ts";

function ok(stdout: string): RunResult {
  return { stdout, stderr: "", exitCode: 0 };
}

function rateLimitFail(): RunResult {
  return {
    stdout: "",
    stderr: "GraphQL: API rate limit exceeded for installation. Please retry after a while.",
    exitCode: 1,
  };
}

function repoNotFound(): RunResult {
  return {
    stdout: "",
    stderr: "could not resolve to a repository with the name 'foo/bar'",
    exitCode: 1,
  };
}

describe("runGhWithRateLimitRetry", () => {
  it("returns success without retry when gh succeeds on the first try", async () => {
    const runner = vi.fn(async () => ok("https://github.com/x/y/pull/42"));
    const sleep = vi.fn(async () => {});

    const result = await runGhWithRateLimitRetry(["pr", "create"], {
      cwd: "/repo",
      runAsyncImpl: runner,
      sleepImpl: sleep,
      queryRateLimitImpl: async () => null,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("/pull/42");
    expect(runner).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries on a rate-limit failure and succeeds on the next attempt", async () => {
    const runner = vi.fn()
      .mockResolvedValueOnce(rateLimitFail())
      .mockResolvedValueOnce(ok("https://github.com/x/y/pull/7"));
    const sleep = vi.fn(async () => {});
    const onRetry = vi.fn();
    // Pretend the budget resets in 3 seconds from "now"
    const fakeNow = 1_000_000_000_000;
    const queryRate = vi.fn(async () => ({
      limit: 5000,
      remaining: 0,
      reset: Math.floor((fakeNow + 3_000) / 1000),
      used: 5000,
    }));

    const result = await runGhWithRateLimitRetry(["pr", "create"], {
      cwd: "/repo",
      runAsyncImpl: runner,
      sleepImpl: sleep,
      queryRateLimitImpl: queryRate,
      nowImpl: () => fakeNow,
      onRetry,
      minWaitMs: 100,
      maxWaitMs: 60_000,
    });

    expect(result.exitCode).toBe(0);
    expect(runner).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
    const retryCall = onRetry.mock.calls[0]![0] as { reason: string; waitMs: number };
    expect(retryCall.reason).toBe("rate-limit");
    // Reset is 3s ahead, helper adds a 1s buffer: expect ~4000ms
    expect(retryCall.waitMs).toBeGreaterThanOrEqual(3_500);
    expect(retryCall.waitMs).toBeLessThanOrEqual(4_500);
  });

  it("does not retry when the failure is not a rate-limit error", async () => {
    const runner = vi.fn().mockResolvedValueOnce(repoNotFound());
    const sleep = vi.fn(async () => {});

    const result = await runGhWithRateLimitRetry(["pr", "create"], {
      cwd: "/repo",
      runAsyncImpl: runner,
      sleepImpl: sleep,
      queryRateLimitImpl: async () => null,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("could not resolve to a repository");
    expect(runner).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("falls back to exponential backoff when the rate_limit endpoint is unavailable", async () => {
    const runner = vi.fn()
      .mockResolvedValueOnce(rateLimitFail())
      .mockResolvedValueOnce(ok("https://github.com/x/y/pull/9"));
    const sleep = vi.fn(async () => {});

    const result = await runGhWithRateLimitRetry(["pr", "create"], {
      cwd: "/repo",
      runAsyncImpl: runner,
      sleepImpl: sleep,
      queryRateLimitImpl: async () => null, // endpoint unavailable
      minWaitMs: 1_000,
      maxWaitMs: 60_000,
    });

    expect(result.exitCode).toBe(0);
    expect(sleep).toHaveBeenCalledTimes(1);
    // Default fallback at attempt 0: 30_000ms (between min 1_000 and max 60_000)
    const waitArg = sleep.mock.calls[0]![0] as number;
    expect(waitArg).toBeGreaterThanOrEqual(1_000);
    expect(waitArg).toBeLessThanOrEqual(60_000);
  });

  it("returns the last failure once retries are exhausted", async () => {
    const runner = vi.fn().mockResolvedValue(rateLimitFail());
    const sleep = vi.fn(async () => {});

    const result = await runGhWithRateLimitRetry(["pr", "create"], {
      cwd: "/repo",
      runAsyncImpl: runner,
      sleepImpl: sleep,
      queryRateLimitImpl: async () => null,
      maxRetries: 2,
      minWaitMs: 10,
      maxWaitMs: 100,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("rate limit");
    // 1 initial attempt + 2 retries = 3 calls
    expect(runner).toHaveBeenCalledTimes(3);
    // 2 sleeps (between attempts), no sleep after the final failure
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("forwards args verbatim to the gh runner", async () => {
    const runner = vi.fn(async () => ok(""));
    const sleep = vi.fn(async () => {});

    await runGhWithRateLimitRetry(
      ["pr", "create", "--title", "fix: x", "--body", "y", "--label", "domain:foo"],
      {
        cwd: "/repo",
        timeout: 60_000,
        runAsyncImpl: runner,
        sleepImpl: sleep,
        queryRateLimitImpl: async () => null,
      },
    );

    expect(runner).toHaveBeenCalledWith(
      "gh",
      ["pr", "create", "--title", "fix: x", "--body", "y", "--label", "domain:foo"],
      { cwd: "/repo", timeout: 60_000 },
    );
  });
});

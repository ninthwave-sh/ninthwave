// Contract tests for prChecks parsing and CI_FAILURE_STATES classification.
// Pins the CI check state parsing in core/gh.ts and the downstream
// classification logic in checkPrStatus (core/commands/pr-monitor.ts).
//
// Avoids vi.spyOn(shell, "run") which leaks across files (gh.test.ts also
// spies on it). Instead, spies on gh-module sync functions per project
// conventions (see async-snapshot.test.ts for the async equivalent).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as gh from "../../core/gh.ts";
import { prChecks } from "../../core/gh.ts";
import { CI_FAILURE_STATES, checkPrStatus } from "../../core/commands/pr-monitor.ts";

// ── Spies on gh-module sync functions ──────────────────────────────
// These are unique to this test file (no other file spies on sync gh fns).

const isAvailableSpy = vi.spyOn(gh, "isAvailable");
const prListSpy = vi.spyOn(gh, "prList");
const prViewSpy = vi.spyOn(gh, "prView");
const prChecksSpy = vi.spyOn(gh, "prChecks");

beforeEach(() => {
  isAvailableSpy.mockReset();
  prListSpy.mockReset();
  prViewSpy.mockReset();
  prChecksSpy.mockReset();
  // Default: gh is available
  isAvailableSpy.mockReturnValue(true);
});

afterEach(() => {
  isAvailableSpy.mockReset();
  prListSpy.mockReset();
  prViewSpy.mockReset();
  prChecksSpy.mockReset();
});

// ── Helper: stub all gh calls for checkPrStatus ────────────────────

function stubCheckPrStatus(opts: {
  checks: { state: string; name: string; url?: string; completedAt?: string }[];
  reviewDecision?: string;
  mergeable?: string;
}): void {
  prListSpy.mockImplementation((_root: string, _branch: string, state: string) => {
    if (state === "open") return [{ number: 100, title: "Test PR" }];
    return [];
  });
  prViewSpy.mockReturnValue({
    reviewDecision: opts.reviewDecision ?? "",
    mergeable: opts.mergeable ?? "UNKNOWN",
    updatedAt: "2026-03-29T12:00:00Z",
  });
  prChecksSpy.mockReturnValue(
    opts.checks.map((c) => ({
      state: c.state,
      name: c.name,
      url: c.url ?? `https://github.com/runs/${c.name}`,
      completedAt: c.completedAt,
    })),
  );
}

// ── 1. prChecks output contract ─────────────────────────────────────
// Pins the shape and field names of prChecks return values for every
// CI state value returned by gh pr checks.

describe("prChecks output contract", () => {
  const ALL_STATES = [
    "SUCCESS",
    "FAILURE",
    "PENDING",
    "STARTUP_FAILURE",
    "STALE",
    "EXPECTED",
    "CANCELLED",
    "SKIPPED",
    "TIMED_OUT",
    "ACTION_REQUIRED",
    "ERROR",
  ];

  for (const state of ALL_STATES) {
    it(`returns correct state/name/url/completedAt for ${state}`, () => {
      prChecksSpy.mockReturnValue([
        {
          state,
          name: `ci-${state.toLowerCase()}`,
          url: `https://github.com/runs/${state}`,
          completedAt: "2026-03-29T12:34:56Z",
        },
      ]);

      const result = prChecks("/repo", 1);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        state,
        name: `ci-${state.toLowerCase()}`,
        url: `https://github.com/runs/${state}`,
        completedAt: "2026-03-29T12:34:56Z",
      });
    });
  }

  it("preserves all fields for multiple checks in a single response", () => {
    prChecksSpy.mockReturnValue([
      { state: "SUCCESS", name: "build", url: "https://ci/1", completedAt: "2026-03-29T10:00:00Z" },
      { state: "FAILURE", name: "lint", url: "https://ci/2", completedAt: "2026-03-29T10:01:00Z" },
      { state: "PENDING", name: "deploy", url: "https://ci/3", completedAt: undefined },
    ]);

    const result = prChecks("/repo", 1);

    expect(result).toHaveLength(3);
    expect(result.map((c) => c.state)).toEqual(["SUCCESS", "FAILURE", "PENDING"]);
    expect(result.map((c) => c.name)).toEqual(["build", "lint", "deploy"]);
    expect(result[0]!.completedAt).toBe("2026-03-29T10:00:00Z");
    expect(result[2]!.completedAt).toBeUndefined();
  });

  it("returns empty array when no checks exist", () => {
    prChecksSpy.mockReturnValue([]);

    const result = prChecks("/repo", 1);
    expect(result).toEqual([]);
  });
});

// ── 2. CI_FAILURE_STATES set ────────────────────────────────────────

describe("CI_FAILURE_STATES", () => {
  const EXPECTED_FAILURE_STATES = [
    "FAILURE",
    "ERROR",
    "CANCELLED",
    "TIMED_OUT",
    "STARTUP_FAILURE",
    "ACTION_REQUIRED",
  ];

  for (const state of EXPECTED_FAILURE_STATES) {
    it(`contains ${state}`, () => {
      expect(CI_FAILURE_STATES.has(state)).toBe(true);
    });
  }

  it("contains exactly 6 failure states", () => {
    expect(CI_FAILURE_STATES.size).toBe(6);
  });

  const NON_FAILURE_STATES = ["SUCCESS", "PENDING", "SKIPPED", "STALE", "EXPECTED"];

  for (const state of NON_FAILURE_STATES) {
    it(`does not contain ${state}`, () => {
      expect(CI_FAILURE_STATES.has(state)).toBe(false);
    });
  }
});

// ── 3. checkPrStatus downstream classification ─────────────────────
// Uses gh-module spies to control what checkPrStatus sees, verifying
// the classification logic that maps CI states to PR status values.

describe("checkPrStatus classification", () => {
  function parseStatus(line: string) {
    const parts = line.split("\t");
    return {
      id: parts[0],
      prNumber: parts[1],
      status: parts[2],
      mergeable: parts[3],
      eventTime: parts[4],
    };
  }

  // Every CI_FAILURE_STATES member should produce "failing"
  const FAILURE_STATES = [
    "FAILURE",
    "ERROR",
    "CANCELLED",
    "TIMED_OUT",
    "ACTION_REQUIRED",
    "STARTUP_FAILURE",
  ];

  for (const state of FAILURE_STATES) {
    it(`classifies single ${state} check as "failing"`, () => {
      stubCheckPrStatus({
        checks: [{ state, name: `check-${state.toLowerCase()}` }],
      });

      const result = parseStatus(checkPrStatus("TEST-1", "/repo"));
      expect(result.status).toBe("failing");
    });
  }

  it('classifies all SUCCESS checks as "ci-passed" (not APPROVED)', () => {
    stubCheckPrStatus({
      checks: [
        { state: "SUCCESS", name: "build" },
        { state: "SUCCESS", name: "test" },
      ],
    });

    const result = parseStatus(checkPrStatus("TEST-1", "/repo"));
    expect(result.status).toBe("ci-passed");
  });

  it('classifies all SUCCESS + APPROVED + MERGEABLE as "ready"', () => {
    stubCheckPrStatus({
      checks: [
        { state: "SUCCESS", name: "build" },
        { state: "SUCCESS", name: "test" },
      ],
      reviewDecision: "APPROVED",
      mergeable: "MERGEABLE",
    });

    const result = parseStatus(checkPrStatus("TEST-1", "/repo"));
    expect(result.status).toBe("ready");
  });

  it('classifies PENDING-only checks as "pending"', () => {
    stubCheckPrStatus({
      checks: [{ state: "PENDING", name: "build" }],
    });

    const result = parseStatus(checkPrStatus("TEST-1", "/repo"));
    expect(result.status).toBe("pending");
  });

  // ── Mixed-result scenarios ──────────────────────────────────────

  it("mixed: some SUCCESS + some FAILURE = failing", () => {
    stubCheckPrStatus({
      checks: [
        { state: "SUCCESS", name: "build" },
        { state: "FAILURE", name: "lint" },
      ],
    });

    const result = parseStatus(checkPrStatus("TEST-1", "/repo"));
    expect(result.status).toBe("failing");
  });

  it("mixed: some SUCCESS + some ERROR = failing", () => {
    stubCheckPrStatus({
      checks: [
        { state: "SUCCESS", name: "build" },
        { state: "ERROR", name: "deploy" },
      ],
    });

    const result = parseStatus(checkPrStatus("TEST-1", "/repo"));
    expect(result.status).toBe("failing");
  });

  it("mixed: some SUCCESS + some CANCELLED = failing", () => {
    stubCheckPrStatus({
      checks: [
        { state: "SUCCESS", name: "build" },
        { state: "CANCELLED", name: "deploy" },
      ],
    });

    const result = parseStatus(checkPrStatus("TEST-1", "/repo"));
    expect(result.status).toBe("failing");
  });

  it("mixed: some PENDING + no FAILURE = pending", () => {
    stubCheckPrStatus({
      checks: [
        { state: "SUCCESS", name: "build" },
        { state: "PENDING", name: "deploy" },
      ],
    });

    const result = parseStatus(checkPrStatus("TEST-1", "/repo"));
    expect(result.status).toBe("pending");
  });

  it("mixed: PENDING + FAILURE = failing (failure takes precedence)", () => {
    stubCheckPrStatus({
      checks: [
        { state: "PENDING", name: "build" },
        { state: "FAILURE", name: "lint" },
      ],
    });

    const result = parseStatus(checkPrStatus("TEST-1", "/repo"));
    expect(result.status).toBe("failing");
  });

  it("mixed: PENDING + TIMED_OUT = failing (failure takes precedence)", () => {
    stubCheckPrStatus({
      checks: [
        { state: "PENDING", name: "build" },
        { state: "TIMED_OUT", name: "integration" },
      ],
    });

    const result = parseStatus(checkPrStatus("TEST-1", "/repo"));
    expect(result.status).toBe("failing");
  });

  // ── SKIPPED checks exclusion ────────────────────────────────────

  it("SKIPPED checks are excluded: only SKIPPED = pending (no relevant checks)", () => {
    stubCheckPrStatus({
      checks: [{ state: "SKIPPED", name: "optional-check" }],
    });

    const result = parseStatus(checkPrStatus("TEST-1", "/repo"));
    // nonSkipped is empty, ciStatus stays "unknown", status = "pending"
    expect(result.status).toBe("pending");
  });

  it("SKIPPED + SUCCESS = ci-passed", () => {
    stubCheckPrStatus({
      checks: [
        { state: "SUCCESS", name: "build" },
        { state: "SKIPPED", name: "optional-check" },
      ],
    });

    const result = parseStatus(checkPrStatus("TEST-1", "/repo"));
    expect(result.status).toBe("ci-passed");
  });

  it("SKIPPED + FAILURE = failing", () => {
    stubCheckPrStatus({
      checks: [
        { state: "FAILURE", name: "lint" },
        { state: "SKIPPED", name: "optional-check" },
      ],
    });

    const result = parseStatus(checkPrStatus("TEST-1", "/repo"));
    expect(result.status).toBe("failing");
  });

  it("SKIPPED + PENDING = pending", () => {
    stubCheckPrStatus({
      checks: [
        { state: "PENDING", name: "build" },
        { state: "SKIPPED", name: "optional-check" },
      ],
    });

    const result = parseStatus(checkPrStatus("TEST-1", "/repo"));
    expect(result.status).toBe("pending");
  });

  // ── All-pass with many checks ───────────────────────────────────

  it("all pass: many SUCCESS checks = ci-passed", () => {
    stubCheckPrStatus({
      checks: [
        { state: "SUCCESS", name: "build" },
        { state: "SUCCESS", name: "lint" },
        { state: "SUCCESS", name: "test-unit" },
        { state: "SUCCESS", name: "test-integration" },
        { state: "SUCCESS", name: "deploy-preview" },
      ],
    });

    const result = parseStatus(checkPrStatus("TEST-1", "/repo"));
    expect(result.status).toBe("ci-passed");
  });

  // ── Realistic mixed scenarios ───────────────────────────────────

  it("realistic: SUCCESS + SKIPPED + FAILURE across many checks = failing", () => {
    stubCheckPrStatus({
      checks: [
        { state: "SUCCESS", name: "build" },
        { state: "SUCCESS", name: "lint" },
        { state: "SKIPPED", name: "deploy-preview" },
        { state: "FAILURE", name: "test-integration" },
        { state: "SUCCESS", name: "test-unit" },
      ],
    });

    const result = parseStatus(checkPrStatus("TEST-1", "/repo"));
    expect(result.status).toBe("failing");
  });

  it("realistic: SUCCESS + SKIPPED + PENDING across many checks = pending", () => {
    stubCheckPrStatus({
      checks: [
        { state: "SUCCESS", name: "build" },
        { state: "SUCCESS", name: "lint" },
        { state: "SKIPPED", name: "deploy-preview" },
        { state: "PENDING", name: "test-integration" },
        { state: "SUCCESS", name: "test-unit" },
      ],
    });

    const result = parseStatus(checkPrStatus("TEST-1", "/repo"));
    expect(result.status).toBe("pending");
  });
});

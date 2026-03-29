// Contract tests for checkPrStatus -- pins the tab-separated format contract
// between the orchestrator's state machine and the gh CLI output.
//
// Each status path (no-pr, merged, pending, failing, ci-passed, ready) has
// fixture-driven assertions that verify exact field layout and content.
// When GitHub changes their gh CLI output format, these tests break first.
//
// Uses vi.spyOn on gh module functions (not vi.mock) per project conventions.
// Spies target the sync gh functions (prList, prView, prChecks, isAvailable),
// which are unique to this file -- no other test file spies on these.

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import * as gh from "../../core/gh.ts";
import { checkPrStatus } from "../../core/commands/pr-monitor.ts";

// ── Spies ──────────────────────────────────────────────────────────

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

afterAll(() => {
  isAvailableSpy.mockRestore();
  prListSpy.mockRestore();
  prViewSpy.mockRestore();
  prChecksSpy.mockRestore();
});

// ── Fixtures: realistic gh CLI JSON responses ──────────────────────
// These mirror the JSON shapes returned by `gh pr list`, `gh pr view`,
// and `gh pr checks` after parsing in core/gh.ts.

/** gh pr list --json number,title --state merged */
const MERGED_PR = [
  { number: 42, title: "fix: resolve race condition in worker health (H-RC-1)" },
];

/** gh pr list --json number,title --state open */
const OPEN_PR = [
  { number: 123, title: "feat: add retry logic for failed CI (H-CI-2)" },
];

/** gh pr view --json reviewDecision,mergeable,updatedAt -- pending review */
const VIEW_PENDING: Record<string, unknown> = {
  reviewDecision: "",
  mergeable: "UNKNOWN",
  updatedAt: "2026-03-29T10:30:00Z",
};

/** gh pr view -- approved and mergeable */
const VIEW_APPROVED_MERGEABLE: Record<string, unknown> = {
  reviewDecision: "APPROVED",
  mergeable: "MERGEABLE",
  updatedAt: "2026-03-29T11:00:00Z",
};

/** gh pr view -- review required, mergeable */
const VIEW_NOT_APPROVED: Record<string, unknown> = {
  reviewDecision: "REVIEW_REQUIRED",
  mergeable: "MERGEABLE",
  updatedAt: "2026-03-29T11:15:00Z",
};

/** gh pr view -- approved but has merge conflicts */
const VIEW_APPROVED_CONFLICTING: Record<string, unknown> = {
  reviewDecision: "APPROVED",
  mergeable: "CONFLICTING",
  updatedAt: "2026-03-29T11:20:00Z",
};

/** gh pr checks -- two checks still pending */
const CHECKS_PENDING = [
  { state: "PENDING", name: "CI / test", url: "https://github.com/runs/1" },
  { state: "PENDING", name: "CI / lint", url: "https://github.com/runs/2" },
];

/** gh pr checks -- one failure, one success */
const CHECKS_FAILING = [
  { state: "FAILURE", name: "CI / test", url: "https://github.com/runs/1", completedAt: "2026-03-29T10:45:00Z" },
  { state: "SUCCESS", name: "CI / lint", url: "https://github.com/runs/2", completedAt: "2026-03-29T10:44:00Z" },
];

/** gh pr checks -- all passing */
const CHECKS_PASSING = [
  { state: "SUCCESS", name: "CI / test", url: "https://github.com/runs/1", completedAt: "2026-03-29T10:50:00Z" },
  { state: "SUCCESS", name: "CI / lint", url: "https://github.com/runs/2", completedAt: "2026-03-29T10:51:00Z" },
];

/** gh pr checks -- all skipped (no real CI) */
const CHECKS_ALL_SKIPPED = [
  { state: "SKIPPED", name: "CI / deploy", url: "https://github.com/runs/3" },
];

/** gh pr checks -- one success, one skipped */
const CHECKS_WITH_SKIPPED = [
  { state: "SUCCESS", name: "CI / test", url: "https://github.com/runs/1", completedAt: "2026-03-29T10:50:00Z" },
  { state: "SKIPPED", name: "CI / deploy", url: "https://github.com/runs/3" },
];

// ── Helpers ────────────────────────────────────────────────────────

/** Split tab-separated output into named fields for readable assertions. */
function parseFields(output: string) {
  const f = output.split("\t");
  return {
    id: f[0],
    prNumber: f[1],
    status: f[2],
    mergeable: f[3],
    eventTime: f[4],
    prTitle: f[5],
    fieldCount: f.length,
  };
}

/** Configure spies for an open-PR scenario. */
function setupOpenPr(
  view: Record<string, unknown>,
  checks: { state: string; name: string; url: string; completedAt?: string }[],
) {
  prListSpy.mockImplementation(
    (_root: string, _branch: string, state: string) => {
      if (state === "open") return OPEN_PR;
      return [];
    },
  );
  prViewSpy.mockReturnValue(view);
  prChecksSpy.mockReturnValue(checks);
}

// ── Contract tests ─────────────────────────────────────────────────

describe("checkPrStatus format contract", () => {
  // ── no-pr ──────────────────────────────────────────────────────

  describe("no-pr: no open or merged PRs", () => {
    beforeEach(() => {
      prListSpy.mockReturnValue([]);
    });

    it("produces exactly 3 tab-separated fields", () => {
      const parsed = parseFields(checkPrStatus("C-1-1", "/repo"));

      expect(parsed.fieldCount).toBe(3);
      expect(parsed.id).toBe("C-1-1");
      expect(parsed.prNumber).toBe("");
      expect(parsed.status).toBe("no-pr");
    });

    it("exact format: ID\\t\\tno-pr", () => {
      expect(checkPrStatus("H-99", "/repo")).toBe("H-99\t\tno-pr");
    });
  });

  // ── merged ─────────────────────────────────────────────────────

  describe("merged: PR exists in merged state", () => {
    beforeEach(() => {
      prListSpy.mockImplementation(
        (_root: string, _branch: string, state: string) => {
          if (state === "open") return [];
          if (state === "merged") return MERGED_PR;
          return [];
        },
      );
    });

    it("produces exactly 6 tab-separated fields", () => {
      const parsed = parseFields(checkPrStatus("H-RC-1", "/repo"));

      expect(parsed.fieldCount).toBe(6);
      expect(parsed.id).toBe("H-RC-1");
      expect(parsed.prNumber).toBe("42");
      expect(parsed.status).toBe("merged");
      expect(parsed.mergeable).toBe("");
      expect(parsed.eventTime).toBe("");
    });

    it("includes PR title as 6th field for collision detection", () => {
      const parsed = parseFields(checkPrStatus("H-RC-1", "/repo"));
      expect(parsed.prTitle).toBe(MERGED_PR[0]!.title);
    });

    it("exact format: ID\\tNUMBER\\tmerged\\t\\t\\tTITLE", () => {
      expect(checkPrStatus("H-RC-1", "/repo")).toBe(
        "H-RC-1\t42\tmerged\t\t\tfix: resolve race condition in worker health (H-RC-1)",
      );
    });
  });

  // ── pending ────────────────────────────────────────────────────

  describe("pending: CI checks still running", () => {
    it("produces 5 tab-separated fields with pending status", () => {
      setupOpenPr(VIEW_PENDING, CHECKS_PENDING);

      const parsed = parseFields(checkPrStatus("H-CI-2", "/repo"));

      expect(parsed.fieldCount).toBe(5);
      expect(parsed.id).toBe("H-CI-2");
      expect(parsed.prNumber).toBe("123");
      expect(parsed.status).toBe("pending");
      expect(parsed.mergeable).toBe("UNKNOWN");
    });

    it("uses prUpdatedAt as eventTime for pending CI", () => {
      setupOpenPr(VIEW_PENDING, CHECKS_PENDING);

      const parsed = parseFields(checkPrStatus("T-1", "/repo"));
      expect(parsed.eventTime).toBe("2026-03-29T10:30:00Z");
    });
  });

  // ── failing ────────────────────────────────────────────────────

  describe("failing: CI check failed", () => {
    it("produces 5 tab-separated fields with failing status", () => {
      setupOpenPr(VIEW_PENDING, CHECKS_FAILING);

      const parsed = parseFields(checkPrStatus("H-CI-3", "/repo"));

      expect(parsed.fieldCount).toBe(5);
      expect(parsed.id).toBe("H-CI-3");
      expect(parsed.prNumber).toBe("123");
      expect(parsed.status).toBe("failing");
      expect(parsed.mergeable).toBe("UNKNOWN");
    });

    it("uses latest CI completedAt as eventTime", () => {
      setupOpenPr(VIEW_PENDING, CHECKS_FAILING);

      const parsed = parseFields(checkPrStatus("T-2", "/repo"));
      // FAILURE at 10:45, SUCCESS at 10:44 -- latest is 10:45
      expect(parsed.eventTime).toBe("2026-03-29T10:45:00Z");
    });

    it("picks latest completedAt across multiple completed checks", () => {
      setupOpenPr(VIEW_PENDING, [
        { state: "SUCCESS", name: "lint", url: "", completedAt: "2026-03-29T10:00:00Z" },
        { state: "FAILURE", name: "test", url: "", completedAt: "2026-03-29T10:05:00Z" },
        { state: "ERROR", name: "build", url: "", completedAt: "2026-03-29T10:03:00Z" },
      ]);

      const parsed = parseFields(checkPrStatus("T-2b", "/repo"));
      expect(parsed.eventTime).toBe("2026-03-29T10:05:00Z");
    });

    it("detects every CI_FAILURE_STATES value as failing", () => {
      const failStates = [
        "FAILURE",
        "ERROR",
        "CANCELLED",
        "TIMED_OUT",
        "STARTUP_FAILURE",
        "ACTION_REQUIRED",
      ];

      for (const state of failStates) {
        setupOpenPr(VIEW_PENDING, [
          { state, name: "CI", url: "", completedAt: "2026-03-29T10:00:00Z" },
        ]);
        const parsed = parseFields(checkPrStatus(`F-${state}`, "/repo"));
        expect(parsed.status).toBe("failing");
      }
    });
  });

  // ── ci-passed ──────────────────────────────────────────────────

  describe("ci-passed: CI green but not ready to merge", () => {
    it("returns ci-passed when CI passes but review not approved", () => {
      setupOpenPr(VIEW_NOT_APPROVED, CHECKS_PASSING);

      const parsed = parseFields(checkPrStatus("H-CI-4", "/repo"));

      expect(parsed.status).toBe("ci-passed");
      expect(parsed.mergeable).toBe("MERGEABLE");
    });

    it("returns ci-passed when CI passes but has merge conflicts", () => {
      setupOpenPr(VIEW_APPROVED_CONFLICTING, CHECKS_PASSING);

      const parsed = parseFields(checkPrStatus("T-3", "/repo"));

      expect(parsed.status).toBe("ci-passed");
      expect(parsed.mergeable).toBe("CONFLICTING");
    });

    it("uses latest CI completedAt as eventTime", () => {
      setupOpenPr(VIEW_NOT_APPROVED, CHECKS_PASSING);

      const parsed = parseFields(checkPrStatus("T-4", "/repo"));
      // Both completed: 10:50 and 10:51 -- latest is 10:51
      expect(parsed.eventTime).toBe("2026-03-29T10:51:00Z");
    });
  });

  // ── ready ──────────────────────────────────────────────────────

  describe("ready: CI passes + approved + mergeable", () => {
    it("produces 5 tab-separated fields with ready status", () => {
      setupOpenPr(VIEW_APPROVED_MERGEABLE, CHECKS_PASSING);

      const parsed = parseFields(checkPrStatus("H-CI-5", "/repo"));

      expect(parsed.fieldCount).toBe(5);
      expect(parsed.id).toBe("H-CI-5");
      expect(parsed.prNumber).toBe("123");
      expect(parsed.status).toBe("ready");
      expect(parsed.mergeable).toBe("MERGEABLE");
    });

    it("requires both APPROVED review and MERGEABLE status", () => {
      // APPROVED + UNKNOWN --> ci-passed (not ready)
      setupOpenPr(
        { reviewDecision: "APPROVED", mergeable: "UNKNOWN", updatedAt: "" },
        CHECKS_PASSING,
      );
      expect(parseFields(checkPrStatus("T-5a", "/repo")).status).toBe("ci-passed");

      // empty review + MERGEABLE --> ci-passed (not ready)
      setupOpenPr(
        { reviewDecision: "", mergeable: "MERGEABLE", updatedAt: "" },
        CHECKS_PASSING,
      );
      expect(parseFields(checkPrStatus("T-5b", "/repo")).status).toBe("ci-passed");
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────

  describe("edge cases", () => {
    it("returns empty string when gh CLI is not available", () => {
      isAvailableSpy.mockReturnValue(false);
      expect(checkPrStatus("T-6", "/repo")).toBe("");
    });

    it("empty checks array produces pending (unknown CI)", () => {
      setupOpenPr(VIEW_PENDING, []);

      const parsed = parseFields(checkPrStatus("T-7", "/repo"));
      expect(parsed.status).toBe("pending");
    });

    it("all-SKIPPED checks produce pending (unknown CI)", () => {
      setupOpenPr(VIEW_PENDING, CHECKS_ALL_SKIPPED);

      const parsed = parseFields(checkPrStatus("T-8", "/repo"));
      // SKIPPED checks are filtered out -- 0 non-skipped --> unknown --> pending
      expect(parsed.status).toBe("pending");
    });

    it("SKIPPED checks are excluded from CI evaluation", () => {
      setupOpenPr(VIEW_APPROVED_MERGEABLE, CHECKS_WITH_SKIPPED);

      const parsed = parseFields(checkPrStatus("T-9", "/repo"));
      // Only non-skipped check is SUCCESS --> CI pass --> ready
      expect(parsed.status).toBe("ready");
    });

    it("defaults mergeable to UNKNOWN when field is empty string", () => {
      setupOpenPr(
        { reviewDecision: "", mergeable: "", updatedAt: "" },
        CHECKS_PENDING,
      );

      const parsed = parseFields(checkPrStatus("T-10", "/repo"));
      expect(parsed.mergeable).toBe("UNKNOWN");
    });

    it("first field is always the ID argument passed in", () => {
      prListSpy.mockReturnValue([]);
      expect(parseFields(checkPrStatus("ANY-ID-99", "/repo")).id).toBe("ANY-ID-99");
    });
  });
});

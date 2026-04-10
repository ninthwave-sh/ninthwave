// Unit tests for orchestrator guard predicates.
// Each guard is a pure function -- no mocking or state setup needed.

import { describe, it, expect } from "vitest";
import {
  isCiFailTrustworthy,
  isHeartbeatActive,
  isEventFresherThan,
  shouldRenotifyCiFailure,
  isActivityTimedOut,
  isLaunchTimedOut,
  isCiFixAckTimedOut,
  isMergeCiGracePeriodExpired,
  isRebaseStale,
} from "../core/orchestrator-guards.ts";

const BASE = new Date("2026-01-15T12:00:00Z");

function offset(ms: number): Date {
  return new Date(BASE.getTime() + ms);
}

function iso(ms: number): string {
  return offset(ms).toISOString();
}

// ── isCiFailTrustworthy ────────────────────────────────────────────

describe("isCiFailTrustworthy", () => {
  const GRACE = 60_000; // 60s

  it("returns true when ciPendingSince is undefined (no grace context)", () => {
    expect(isCiFailTrustworthy(undefined, BASE, GRACE)).toBe(true);
  });

  it("returns false when within grace period", () => {
    // 30s into a 60s grace period
    expect(isCiFailTrustworthy(BASE.toISOString(), offset(30_000), GRACE)).toBe(false);
  });

  it("returns false at 1ms before threshold", () => {
    expect(isCiFailTrustworthy(BASE.toISOString(), offset(GRACE - 1), GRACE)).toBe(false);
  });

  it("returns true exactly at threshold", () => {
    expect(isCiFailTrustworthy(BASE.toISOString(), offset(GRACE), GRACE)).toBe(true);
  });

  it("returns true 1ms after threshold", () => {
    expect(isCiFailTrustworthy(BASE.toISOString(), offset(GRACE + 1), GRACE)).toBe(true);
  });

  it("returns true well past grace period", () => {
    expect(isCiFailTrustworthy(BASE.toISOString(), offset(GRACE * 10), GRACE)).toBe(true);
  });
});

// ── isHeartbeatActive ──────────────────────────────────────────────

describe("isHeartbeatActive", () => {
  const TIMEOUT = 5 * 60 * 1000; // 5 minutes

  it("returns false for null heartbeatTs", () => {
    expect(isHeartbeatActive(null, BASE, TIMEOUT)).toBe(false);
  });

  it("returns false for undefined heartbeatTs", () => {
    expect(isHeartbeatActive(undefined, BASE, TIMEOUT)).toBe(false);
  });

  it("returns true when heartbeat is fresh", () => {
    // 1 minute old
    expect(isHeartbeatActive(iso(-60_000), BASE, TIMEOUT)).toBe(true);
  });

  it("returns true at 1ms before timeout", () => {
    expect(isHeartbeatActive(iso(-(TIMEOUT - 1)), BASE, TIMEOUT)).toBe(true);
  });

  it("returns false exactly at timeout", () => {
    expect(isHeartbeatActive(iso(-TIMEOUT), BASE, TIMEOUT)).toBe(false);
  });

  it("returns false 1ms after timeout", () => {
    expect(isHeartbeatActive(iso(-(TIMEOUT + 1)), BASE, TIMEOUT)).toBe(false);
  });

  it("returns false for very old heartbeat", () => {
    expect(isHeartbeatActive(iso(-TIMEOUT * 10), BASE, TIMEOUT)).toBe(false);
  });
});

// ── isEventFresherThan ─────────────────────────────────────────────

describe("isEventFresherThan", () => {
  it("returns false for undefined eventTime", () => {
    expect(isEventFresherThan(undefined, BASE.toISOString())).toBe(false);
  });

  it("returns true when event is newer than baseline", () => {
    expect(isEventFresherThan(iso(1000), BASE.toISOString())).toBe(true);
  });

  it("returns false when event equals baseline", () => {
    expect(isEventFresherThan(BASE.toISOString(), BASE.toISOString())).toBe(false);
  });

  it("returns false when event is older than baseline", () => {
    expect(isEventFresherThan(iso(-1000), BASE.toISOString())).toBe(false);
  });

  it("returns false for invalid eventTime", () => {
    expect(isEventFresherThan("not-a-date", BASE.toISOString())).toBe(false);
  });

  it("returns false for invalid baseline", () => {
    expect(isEventFresherThan(BASE.toISOString(), "not-a-date")).toBe(false);
  });
});

// ── shouldRenotifyCiFailure ────────────────────────────────────────

describe("shouldRenotifyCiFailure", () => {
  it("returns true when lastCommitTime differs from ciFailureNotifiedAt", () => {
    expect(shouldRenotifyCiFailure(iso(1000), BASE.toISOString())).toBe(true);
  });

  it("returns false when timestamps are identical", () => {
    const ts = BASE.toISOString();
    expect(shouldRenotifyCiFailure(ts, ts)).toBe(false);
  });

  it("returns true when lastCommitTime is null and notifiedAt is a timestamp", () => {
    expect(shouldRenotifyCiFailure(null, BASE.toISOString())).toBe(true);
  });

  it("returns true when lastCommitTime is a timestamp and notifiedAt is null", () => {
    expect(shouldRenotifyCiFailure(BASE.toISOString(), null)).toBe(true);
  });

  it("returns false when both are null", () => {
    expect(shouldRenotifyCiFailure(null, null)).toBe(false);
  });

  it("returns false when both are undefined", () => {
    expect(shouldRenotifyCiFailure(undefined, undefined)).toBe(false);
  });

  it("returns true when one is undefined and other is null", () => {
    // undefined !== null in JS
    expect(shouldRenotifyCiFailure(undefined, null)).toBe(true);
  });
});

// ── isActivityTimedOut ─────────────────────────────────────────────

describe("isActivityTimedOut", () => {
  const TIMEOUT = 60 * 60 * 1000; // 60 min

  it("returns false when within timeout", () => {
    expect(isActivityTimedOut(BASE.toISOString(), offset(TIMEOUT - 1), TIMEOUT)).toBe(false);
  });

  it("returns false exactly at timeout", () => {
    expect(isActivityTimedOut(BASE.toISOString(), offset(TIMEOUT), TIMEOUT)).toBe(false);
  });

  it("returns true 1ms after timeout", () => {
    expect(isActivityTimedOut(BASE.toISOString(), offset(TIMEOUT + 1), TIMEOUT)).toBe(true);
  });

  it("returns true well past timeout", () => {
    expect(isActivityTimedOut(BASE.toISOString(), offset(TIMEOUT * 3), TIMEOUT)).toBe(true);
  });
});

// ── isLaunchTimedOut ───────────────────────────────────────────────

describe("isLaunchTimedOut", () => {
  const TIMEOUT = 30 * 60 * 1000; // 30 min

  it("returns false when within timeout", () => {
    expect(isLaunchTimedOut(BASE.toISOString(), offset(TIMEOUT - 1), TIMEOUT)).toBe(false);
  });

  it("returns false exactly at timeout", () => {
    expect(isLaunchTimedOut(BASE.toISOString(), offset(TIMEOUT), TIMEOUT)).toBe(false);
  });

  it("returns true 1ms after timeout", () => {
    expect(isLaunchTimedOut(BASE.toISOString(), offset(TIMEOUT + 1), TIMEOUT)).toBe(true);
  });

  it("returns true well past timeout", () => {
    expect(isLaunchTimedOut(BASE.toISOString(), offset(TIMEOUT * 2), TIMEOUT)).toBe(true);
  });
});

// ── isCiFixAckTimedOut ─────────────────────────────────────────────

describe("isCiFixAckTimedOut", () => {
  const TIMEOUT = 30 * 60 * 1000; // 30 min

  it("returns false when heartbeat is newer than notification", () => {
    // Heartbeat at +30s, notification at BASE
    expect(isCiFixAckTimedOut(BASE.toISOString(), iso(30_000), offset(TIMEOUT + 1), TIMEOUT)).toBe(false);
  });

  it("returns false when within ack timeout (no heartbeat since notify)", () => {
    // Notification at BASE, heartbeat at BASE-1s (before), now at BASE+60s (within 30min)
    expect(isCiFixAckTimedOut(BASE.toISOString(), iso(-1000), offset(60_000), TIMEOUT)).toBe(false);
  });

  it("returns true when ack timeout exceeded with no post-notify heartbeat", () => {
    expect(isCiFixAckTimedOut(BASE.toISOString(), iso(-1000), offset(TIMEOUT + 1), TIMEOUT)).toBe(true);
  });

  it("returns true exactly at timeout + 1ms", () => {
    expect(isCiFixAckTimedOut(BASE.toISOString(), null, offset(TIMEOUT + 1), TIMEOUT)).toBe(true);
  });

  it("returns false exactly at timeout boundary", () => {
    expect(isCiFixAckTimedOut(BASE.toISOString(), null, offset(TIMEOUT), TIMEOUT)).toBe(false);
  });

  it("returns false with null heartbeatTs within timeout", () => {
    // null heartbeat => hbMs = 0, which is <= notifyMs, so checks timeout
    expect(isCiFixAckTimedOut(BASE.toISOString(), null, offset(30_000), TIMEOUT)).toBe(false);
  });

  it("returns true with undefined heartbeatTs past timeout", () => {
    expect(isCiFixAckTimedOut(BASE.toISOString(), undefined, offset(TIMEOUT + 1), TIMEOUT)).toBe(true);
  });
});

// ── isMergeCiGracePeriodExpired ────────────────────────────────────

describe("isMergeCiGracePeriodExpired", () => {
  const GRACE = 60_000; // 60s

  it("returns false within grace period", () => {
    expect(isMergeCiGracePeriodExpired(BASE.toISOString(), offset(30_000), GRACE)).toBe(false);
  });

  it("returns false at 1ms before expiry", () => {
    expect(isMergeCiGracePeriodExpired(BASE.toISOString(), offset(GRACE - 1), GRACE)).toBe(false);
  });

  it("returns false exactly at threshold", () => {
    expect(isMergeCiGracePeriodExpired(BASE.toISOString(), offset(GRACE), GRACE)).toBe(false);
  });

  it("returns true 1ms after threshold", () => {
    expect(isMergeCiGracePeriodExpired(BASE.toISOString(), offset(GRACE + 1), GRACE)).toBe(true);
  });

  it("returns true well past grace period", () => {
    expect(isMergeCiGracePeriodExpired(BASE.toISOString(), offset(GRACE * 5), GRACE)).toBe(true);
  });

  it("works with shorter grace period (no-CI repos)", () => {
    const SHORT_GRACE = 15_000;
    expect(isMergeCiGracePeriodExpired(BASE.toISOString(), offset(SHORT_GRACE + 1), SHORT_GRACE)).toBe(true);
    expect(isMergeCiGracePeriodExpired(BASE.toISOString(), offset(SHORT_GRACE - 1), SHORT_GRACE)).toBe(false);
  });
});

// ── isRebaseStale ──────────────────────────────────────────────────

describe("isRebaseStale", () => {
  const STALE_MS = 15 * 60 * 1000; // 15 min

  it("returns true when lastRebaseNudgeAt is undefined (never nudged)", () => {
    expect(isRebaseStale(undefined, BASE, STALE_MS)).toBe(true);
  });

  it("returns false when nudge is recent", () => {
    expect(isRebaseStale(iso(-60_000), BASE, STALE_MS)).toBe(false);
  });

  it("returns false at 1ms before stale threshold", () => {
    expect(isRebaseStale(iso(-(STALE_MS - 1)), BASE, STALE_MS)).toBe(false);
  });

  it("returns true exactly at stale threshold", () => {
    expect(isRebaseStale(iso(-STALE_MS), BASE, STALE_MS)).toBe(true);
  });

  it("returns true 1ms after stale threshold", () => {
    expect(isRebaseStale(iso(-(STALE_MS + 1)), BASE, STALE_MS)).toBe(true);
  });

  it("returns true for invalid timestamp", () => {
    expect(isRebaseStale("not-a-date", BASE, STALE_MS)).toBe(true);
  });
});

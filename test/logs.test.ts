// Tests for core/commands/logs.ts -- orchestration log viewer.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import {
  parseLogLine,
  parseLogLines,
  filterByLevel,
  filterByItem,
  formatLogEntry,
  parseLogsArgs,
  readLogs,
  readEntriesWithRotated,
  followLog,
  type LogsIO,
  type LogsOptions,
} from "../core/commands/logs.ts";

// ── Helpers ─────────────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "nw-logs-test-"));
}

const tempDirs: string[] = [];

function trackTempDir(): string {
  const dir = makeTempDir();
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of tempDirs) {
    if (existsSync(d)) rmSync(d, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

/** Build a valid JSONL log line. */
function logLine(
  overrides: Partial<{ ts: string; level: string; event: string; [key: string]: unknown }> = {},
): string {
  return JSON.stringify({
    ts: "2026-03-28T10:00:00.000Z",
    level: "info",
    event: "test_event",
    ...overrides,
  });
}

// ── parseLogLine ────────────────────────────────────────────────────

describe("parseLogLine", () => {
  it("parses a valid JSONL log entry", () => {
    const line = logLine({ event: "daemon_started", pid: 1234 });
    const result = parseLogLine(line);
    expect(result).not.toBeNull();
    expect(result!.event).toBe("daemon_started");
    expect(result!.pid).toBe(1234);
  });

  it("returns null for empty string", () => {
    expect(parseLogLine("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(parseLogLine("   \n  ")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseLogLine("{not valid json")).toBeNull();
  });

  it("returns null for JSON missing required fields", () => {
    // Missing event
    expect(parseLogLine(JSON.stringify({ ts: "x", level: "info" }))).toBeNull();
    // Missing level
    expect(parseLogLine(JSON.stringify({ ts: "x", event: "y" }))).toBeNull();
    // Missing ts
    expect(parseLogLine(JSON.stringify({ level: "info", event: "y" }))).toBeNull();
  });

  it("handles lines with leading/trailing whitespace", () => {
    const line = `  ${logLine()}  `;
    const result = parseLogLine(line);
    expect(result).not.toBeNull();
  });
});

// ── parseLogLines ───────────────────────────────────────────────────

describe("parseLogLines", () => {
  it("parses multiple valid lines", () => {
    const content = [
      logLine({ event: "start" }),
      logLine({ event: "stop" }),
    ].join("\n");
    const result = parseLogLines(content);
    expect(result).toHaveLength(2);
    expect(result[0]!.event).toBe("start");
    expect(result[1]!.event).toBe("stop");
  });

  it("skips malformed lines gracefully", () => {
    const content = [
      logLine({ event: "good1" }),
      "this is not json",
      logLine({ event: "good2" }),
      "{incomplete",
    ].join("\n");
    const result = parseLogLines(content);
    expect(result).toHaveLength(2);
    expect(result[0]!.event).toBe("good1");
    expect(result[1]!.event).toBe("good2");
  });

  it("returns empty array for empty file", () => {
    expect(parseLogLines("")).toHaveLength(0);
  });

  it("returns empty array for only whitespace", () => {
    expect(parseLogLines("\n\n\n")).toHaveLength(0);
  });
});

// ── filterByLevel ───────────────────────────────────────────────────

describe("filterByLevel", () => {
  const entries = [
    { ts: "t", level: "debug" as const, event: "a" },
    { ts: "t", level: "info" as const, event: "b" },
    { ts: "t", level: "warn" as const, event: "c" },
    { ts: "t", level: "error" as const, event: "d" },
  ];

  it("filters to warn+error when level=warn", () => {
    const result = filterByLevel(entries, "warn");
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.level)).toEqual(["warn", "error"]);
  });

  it("filters to only error when level=error", () => {
    const result = filterByLevel(entries, "error");
    expect(result).toHaveLength(1);
    expect(result[0]!.level).toBe("error");
  });

  it("includes all entries for level=info", () => {
    const result = filterByLevel(entries, "info");
    expect(result).toHaveLength(3); // info, warn, error (not debug)
  });
});

// ── filterByItem ────────────────────────────────────────────────────

describe("filterByItem", () => {
  it("matches item ID in string fields", () => {
    const entries = [
      { ts: "t", level: "info" as const, event: "transition", itemId: "H-FOO-1" },
      { ts: "t", level: "info" as const, event: "transition", itemId: "H-BAR-2" },
    ];
    const result = filterByItem(entries, "H-FOO-1");
    expect(result).toHaveLength(1);
    expect(result[0]!.itemId).toBe("H-FOO-1");
  });

  it("matches item ID in array fields", () => {
    const entries = [
      { ts: "t", level: "info" as const, event: "orchestrate_start", items: ["H-FOO-1", "H-BAR-2"] },
      { ts: "t", level: "info" as const, event: "orchestrate_start", items: ["H-BAR-2", "H-BAZ-3"] },
    ];
    const result = filterByItem(entries, "H-FOO-1");
    expect(result).toHaveLength(1);
  });

  it("returns empty when no match", () => {
    const entries = [
      { ts: "t", level: "info" as const, event: "start" },
    ];
    expect(filterByItem(entries, "H-NONEXISTENT-1")).toHaveLength(0);
  });
});

// ── formatLogEntry ──────────────────────────────────────────────────

describe("formatLogEntry", () => {
  it("includes event name in output", () => {
    const entry = { ts: "2026-03-28T10:00:00.000Z", level: "info" as const, event: "daemon_started" };
    const result = formatLogEntry(entry);
    expect(result).toContain("daemon_started");
  });

  it("includes context fields", () => {
    const entry = {
      ts: "2026-03-28T10:00:00.000Z",
      level: "warn" as const,
      event: "ci_failed",
      itemId: "H-FOO-1",
      attempt: 3,
    };
    const result = formatLogEntry(entry);
    expect(result).toContain("ci_failed");
    expect(result).toContain("itemId");
    expect(result).toContain("H-FOO-1");
    expect(result).toContain("attempt");
    expect(result).toContain("3");
  });

  it("handles entry with no context fields", () => {
    const entry = { ts: "2026-03-28T10:00:00.000Z", level: "info" as const, event: "heartbeat" };
    const result = formatLogEntry(entry);
    expect(result).toContain("heartbeat");
    // Should not have trailing whitespace or dangling key=
    expect(result.trim()).toBe(result);
  });

  it("formats arrays in context", () => {
    const entry = {
      ts: "2026-03-28T10:00:00.000Z",
      level: "info" as const,
      event: "start",
      items: ["A", "B"],
    };
    const result = formatLogEntry(entry);
    expect(result).toContain("A,B");
  });
});

// ── parseLogsArgs ───────────────────────────────────────────────────

describe("parseLogsArgs", () => {
  it("returns defaults for empty args", () => {
    const opts = parseLogsArgs([]);
    expect(opts.follow).toBe(false);
    expect(opts.item).toBeNull();
    expect(opts.level).toBeNull();
    expect(opts.lines).toBe(50);
  });

  it("parses --follow", () => {
    expect(parseLogsArgs(["--follow"]).follow).toBe(true);
  });

  it("parses -f shorthand", () => {
    expect(parseLogsArgs(["-f"]).follow).toBe(true);
  });

  it("parses --item", () => {
    expect(parseLogsArgs(["--item", "H-FOO-1"]).item).toBe("H-FOO-1");
  });

  it("parses --level warn", () => {
    expect(parseLogsArgs(["--level", "warn"]).level).toBe("warn");
  });

  it("parses --level error", () => {
    expect(parseLogsArgs(["--level", "error"]).level).toBe("error");
  });

  it("ignores invalid --level values", () => {
    expect(parseLogsArgs(["--level", "debug"]).level).toBeNull();
    expect(parseLogsArgs(["--level", "info"]).level).toBeNull();
  });

  it("parses --lines", () => {
    expect(parseLogsArgs(["--lines", "100"]).lines).toBe(100);
  });

  it("parses -n shorthand", () => {
    expect(parseLogsArgs(["-n", "20"]).lines).toBe(20);
  });

  it("ignores invalid --lines values", () => {
    expect(parseLogsArgs(["--lines", "abc"]).lines).toBe(50);
    expect(parseLogsArgs(["--lines", "-5"]).lines).toBe(50);
    expect(parseLogsArgs(["--lines", "0"]).lines).toBe(50);
  });

  it("parses combined flags", () => {
    const opts = parseLogsArgs(["-f", "--item", "H-FOO-1", "--level", "warn", "-n", "10"]);
    expect(opts.follow).toBe(true);
    expect(opts.item).toBe("H-FOO-1");
    expect(opts.level).toBe("warn");
    expect(opts.lines).toBe(10);
  });
});

// ── readLogs ────────────────────────────────────────────────────────

describe("readLogs", () => {
  it("returns helpful message when log file is missing", () => {
    const io: LogsIO = {
      existsSync: () => false,
      readFileSync: () => "",
      statSync: () => ({ size: 0 }) as any,
    };
    const result = readLogs("/nonexistent/path.log", { follow: false, item: null, level: null, lines: 50 }, io);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("No orchestration logs found");
    expect(result[0]).toContain("nw` to generate logs");
  });

  it("displays log entries from file", () => {
    const dir = trackTempDir();
    const logPath = join(dir, "orchestrator.log");
    writeFileSync(logPath, [
      logLine({ event: "start" }),
      logLine({ event: "stop" }),
    ].join("\n"));

    const result = readLogs(logPath, { follow: false, item: null, level: null, lines: 50 });
    expect(result).toHaveLength(2);
    expect(result[0]).toContain("start");
    expect(result[1]).toContain("stop");
  });

  it("respects --lines flag (truncates to last N)", () => {
    const dir = trackTempDir();
    const logPath = join(dir, "orchestrator.log");
    const lines = Array.from({ length: 100 }, (_, i) =>
      logLine({ event: `event_${i}` }),
    ).join("\n");
    writeFileSync(logPath, lines);

    const result = readLogs(logPath, { follow: false, item: null, level: null, lines: 5 });
    expect(result).toHaveLength(5);
    expect(result[0]).toContain("event_95");
    expect(result[4]).toContain("event_99");
  });

  it("filters by --item", () => {
    const dir = trackTempDir();
    const logPath = join(dir, "orchestrator.log");
    writeFileSync(logPath, [
      logLine({ event: "transition", itemId: "H-FOO-1" }),
      logLine({ event: "transition", itemId: "H-BAR-2" }),
      logLine({ event: "transition", itemId: "H-FOO-1" }),
    ].join("\n"));

    const result = readLogs(logPath, { follow: false, item: "H-FOO-1", level: null, lines: 50 });
    expect(result).toHaveLength(2);
    expect(result[0]).toContain("H-FOO-1");
    expect(result[1]).toContain("H-FOO-1");
  });

  it("filters by --level", () => {
    const dir = trackTempDir();
    const logPath = join(dir, "orchestrator.log");
    writeFileSync(logPath, [
      logLine({ level: "info", event: "info_event" }),
      logLine({ level: "warn", event: "warn_event" }),
      logLine({ level: "error", event: "error_event" }),
    ].join("\n"));

    const warnResult = readLogs(logPath, { follow: false, item: null, level: "warn", lines: 50 });
    expect(warnResult).toHaveLength(2);
    expect(warnResult[0]).toContain("warn_event");
    expect(warnResult[1]).toContain("error_event");

    const errorResult = readLogs(logPath, { follow: false, item: null, level: "error", lines: 50 });
    expect(errorResult).toHaveLength(1);
    expect(errorResult[0]).toContain("error_event");
  });

  it("handles empty log file", () => {
    const dir = trackTempDir();
    const logPath = join(dir, "orchestrator.log");
    writeFileSync(logPath, "");

    const result = readLogs(logPath, { follow: false, item: null, level: null, lines: 50 });
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("No matching log entries");
  });

  it("skips malformed lines gracefully", () => {
    const dir = trackTempDir();
    const logPath = join(dir, "orchestrator.log");
    writeFileSync(logPath, [
      logLine({ event: "good" }),
      "corrupt line here",
      logLine({ event: "also_good" }),
    ].join("\n"));

    const result = readLogs(logPath, { follow: false, item: null, level: null, lines: 50 });
    expect(result).toHaveLength(2);
    expect(result[0]).toContain("good");
    expect(result[1]).toContain("also_good");
  });

  it("combines --item and --level filters", () => {
    const dir = trackTempDir();
    const logPath = join(dir, "orchestrator.log");
    writeFileSync(logPath, [
      logLine({ level: "info", event: "a", itemId: "H-FOO-1" }),
      logLine({ level: "warn", event: "b", itemId: "H-FOO-1" }),
      logLine({ level: "warn", event: "c", itemId: "H-BAR-2" }),
      logLine({ level: "error", event: "d", itemId: "H-FOO-1" }),
    ].join("\n"));

    const result = readLogs(logPath, { follow: false, item: "H-FOO-1", level: "warn", lines: 50 });
    expect(result).toHaveLength(2);
    expect(result[0]).toContain("b");
    expect(result[1]).toContain("d");
  });
});

// ── followLog ───────────────────────────────────────────────────────

describe("followLog", () => {
  it("prints existing entries on start", () => {
    const dir = trackTempDir();
    const logPath = join(dir, "orchestrator.log");
    writeFileSync(logPath, [
      logLine({ event: "existing1" }),
      logLine({ event: "existing2" }),
    ].join("\n") + "\n");

    const output: string[] = [];
    const cleanup = followLog(
      logPath,
      { follow: true, item: null, level: null, lines: 50 },
      { existsSync, readFileSync, statSync },
      (line) => output.push(line),
    );

    expect(output).toHaveLength(2);
    expect(output[0]).toContain("existing1");
    expect(output[1]).toContain("existing2");

    cleanup();
  });

  it("respects --lines in initial display", () => {
    const dir = trackTempDir();
    const logPath = join(dir, "orchestrator.log");
    const lines = Array.from({ length: 10 }, (_, i) =>
      logLine({ event: `event_${i}` }),
    ).join("\n") + "\n";
    writeFileSync(logPath, lines);

    const output: string[] = [];
    const cleanup = followLog(
      logPath,
      { follow: true, item: null, level: null, lines: 3 },
      { existsSync, readFileSync, statSync },
      (line) => output.push(line),
    );

    expect(output).toHaveLength(3);
    expect(output[0]).toContain("event_7");
    expect(output[2]).toContain("event_9");

    cleanup();
  });

  it("cleanup function stops the interval", () => {
    const dir = trackTempDir();
    const logPath = join(dir, "orchestrator.log");
    writeFileSync(logPath, logLine({ event: "test" }) + "\n");

    const output: string[] = [];
    const cleanup = followLog(
      logPath,
      { follow: true, item: null, level: null, lines: 50 },
      { existsSync, readFileSync, statSync },
      (line) => output.push(line),
    );

    // Should not throw
    cleanup();
  });

  it("handles missing log file gracefully", () => {
    const dir = trackTempDir();
    const logPath = join(dir, "nonexistent.log");

    const output: string[] = [];
    const cleanup = followLog(
      logPath,
      { follow: true, item: null, level: null, lines: 50 },
      { existsSync, readFileSync, statSync },
      (line) => output.push(line),
    );

    expect(output).toHaveLength(0);
    cleanup();
  });

  it("applies --item filter to initial entries", () => {
    const dir = trackTempDir();
    const logPath = join(dir, "orchestrator.log");
    writeFileSync(logPath, [
      logLine({ event: "a", itemId: "H-FOO-1" }),
      logLine({ event: "b", itemId: "H-BAR-2" }),
      logLine({ event: "c", itemId: "H-FOO-1" }),
    ].join("\n") + "\n");

    const output: string[] = [];
    const cleanup = followLog(
      logPath,
      { follow: true, item: "H-FOO-1", level: null, lines: 50 },
      { existsSync, readFileSync, statSync },
      (line) => output.push(line),
    );

    expect(output).toHaveLength(2);
    expect(output[0]).toContain("H-FOO-1");

    cleanup();
  });
});

// ── readEntriesWithRotated ─────────────────────────────────────────

describe("readEntriesWithRotated", () => {
  it("reads entries from current log only when no rotated files exist", () => {
    const dir = trackTempDir();
    const logPath = join(dir, "orchestrator.log");
    writeFileSync(logPath, [
      logLine({ event: "current_1" }),
      logLine({ event: "current_2" }),
    ].join("\n"));

    const entries = readEntriesWithRotated(logPath, { follow: false, item: null, level: null, lines: 50 });
    expect(entries).toHaveLength(2);
    expect(entries[0]!.event).toBe("current_1");
    expect(entries[1]!.event).toBe("current_2");
  });

  it("reads entries from rotated files in chronological order", () => {
    const dir = trackTempDir();
    const logPath = join(dir, "orchestrator.log");
    // .2 is oldest, .1 is next, current is newest
    writeFileSync(`${logPath}.2`, logLine({ event: "oldest" }) + "\n");
    writeFileSync(`${logPath}.1`, logLine({ event: "middle" }) + "\n");
    writeFileSync(logPath, logLine({ event: "newest" }) + "\n");

    const entries = readEntriesWithRotated(logPath, { follow: false, item: null, level: null, lines: 50 });
    expect(entries).toHaveLength(3);
    expect(entries[0]!.event).toBe("oldest");
    expect(entries[1]!.event).toBe("middle");
    expect(entries[2]!.event).toBe("newest");
  });

  it("returns entries from rotated files even when current log is missing", () => {
    const dir = trackTempDir();
    const logPath = join(dir, "orchestrator.log");
    // No current log file, but rotated files exist
    writeFileSync(`${logPath}.1`, logLine({ event: "from_rotation" }) + "\n");

    const entries = readEntriesWithRotated(logPath, { follow: false, item: null, level: null, lines: 50 });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.event).toBe("from_rotation");
  });

  it("returns empty array when no log files exist", () => {
    const dir = trackTempDir();
    const logPath = join(dir, "orchestrator.log");

    const entries = readEntriesWithRotated(logPath, { follow: false, item: null, level: null, lines: 50 });
    expect(entries).toHaveLength(0);
  });

  it("applies item filter across rotated files", () => {
    const dir = trackTempDir();
    const logPath = join(dir, "orchestrator.log");
    writeFileSync(`${logPath}.1`, logLine({ event: "old", itemId: "H-FOO-1" }) + "\n");
    writeFileSync(logPath, [
      logLine({ event: "new_match", itemId: "H-FOO-1" }),
      logLine({ event: "new_other", itemId: "H-BAR-2" }),
    ].join("\n"));

    const entries = readEntriesWithRotated(logPath, { follow: false, item: "H-FOO-1", level: null, lines: 50 });
    expect(entries).toHaveLength(2);
    expect(entries[0]!.event).toBe("old");
    expect(entries[1]!.event).toBe("new_match");
  });

  it("stops discovering rotated files at first gap", () => {
    const dir = trackTempDir();
    const logPath = join(dir, "orchestrator.log");
    writeFileSync(logPath, logLine({ event: "current" }) + "\n");
    writeFileSync(`${logPath}.1`, logLine({ event: "rot1" }) + "\n");
    // Skip .2, write .3 -- should not be found
    writeFileSync(`${logPath}.3`, logLine({ event: "rot3_orphan" }) + "\n");

    const entries = readEntriesWithRotated(logPath, { follow: false, item: null, level: null, lines: 50 });
    expect(entries).toHaveLength(2);
    expect(entries.map(e => e.event)).toEqual(["rot1", "current"]);
  });
});

// ── readLogs with rotated files ────────────────────────────────────

describe("readLogs with rotated files", () => {
  it("reads from rotated files when --lines exceeds current file entries", () => {
    const dir = trackTempDir();
    const logPath = join(dir, "orchestrator.log");
    // 2 entries in current, 3 in .1 -- requesting 5 should get all
    writeFileSync(`${logPath}.1`, [
      logLine({ event: "old_1" }),
      logLine({ event: "old_2" }),
      logLine({ event: "old_3" }),
    ].join("\n") + "\n");
    writeFileSync(logPath, [
      logLine({ event: "new_1" }),
      logLine({ event: "new_2" }),
    ].join("\n"));

    const result = readLogs(logPath, { follow: false, item: null, level: null, lines: 10 });
    expect(result).toHaveLength(5);
    expect(result[0]).toContain("old_1");
    expect(result[4]).toContain("new_2");
  });

  it("shows entries from rotated files when current log is deleted (post-rotation)", () => {
    const dir = trackTempDir();
    const logPath = join(dir, "orchestrator.log");
    // Only rotated file exists -- simulates right after rotation before new writes
    writeFileSync(`${logPath}.1`, [
      logLine({ event: "rotated_entry_1" }),
      logLine({ event: "rotated_entry_2" }),
    ].join("\n"));

    const result = readLogs(logPath, { follow: false, item: null, level: null, lines: 50 });
    expect(result).toHaveLength(2);
    expect(result[0]).toContain("rotated_entry_1");
    expect(result[1]).toContain("rotated_entry_2");
  });

  it("returns no-logs message when neither current nor rotated files exist", () => {
    const dir = trackTempDir();
    const logPath = join(dir, "orchestrator.log");

    const result = readLogs(logPath, { follow: false, item: null, level: null, lines: 50 });
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("No orchestration logs found");
  });
});

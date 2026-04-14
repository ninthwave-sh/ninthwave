// Tests for core/commands/feedback-done.ts and feedback-done signal I/O in core/daemon.ts.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  cmdFeedbackDone,
  type FeedbackDoneDeps,
} from "../core/commands/feedback-done.ts";
import {
  writeFeedbackDoneSignal,
  readFeedbackDoneSignal,
  clearFeedbackDoneSignal,
  signalDir,
  feedbackDoneSignalPath,
  userStateDir,
  type DaemonIO,
  type FeedbackDoneSignal,
} from "../core/daemon.ts";

// ── Helpers ──────────────────────────────────────────────────────────

function createMockIO(): DaemonIO & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    writeFileSync: vi.fn((path, content) => {
      files.set(String(path), String(content));
    }) as DaemonIO["writeFileSync"],
    readFileSync: vi.fn((path) => {
      const content = files.get(String(path));
      if (content === undefined) throw new Error(`ENOENT: ${String(path)}`);
      return content;
    }) as unknown as DaemonIO["readFileSync"],
    unlinkSync: vi.fn((path) => {
      files.delete(String(path));
    }) as DaemonIO["unlinkSync"],
    existsSync: vi.fn((path) => files.has(String(path))) as DaemonIO["existsSync"],
    mkdirSync: vi.fn() as DaemonIO["mkdirSync"],
    renameSync: vi.fn() as DaemonIO["renameSync"],
  };
}

function createDeps(
  io: DaemonIO & { files: Map<string, string> },
  branch: string | null = "ninthwave/H-FOO-1",
): FeedbackDoneDeps {
  return { io, getBranch: () => branch };
}

// ── Signal file I/O ──────────────────────────────────────────────────

describe("feedback-done signal I/O", () => {
  it("signalDir returns correct path", () => {
    const dir = signalDir("/project");
    expect(dir).toContain("signals");
    expect(dir).toContain(userStateDir("/project"));
  });

  it("feedbackDoneSignalPath returns correct path", () => {
    const path = feedbackDoneSignalPath("/project", "H-1-1");
    expect(path).toContain("feedback-done--H-1-1.json");
  });

  it("write and read round-trips correctly", () => {
    const io = createMockIO();
    // Pre-create the signal directory so existsSync returns true
    io.files.set(signalDir("/project"), "");

    writeFeedbackDoneSignal("/project", "H-1-1", io);

    const signal = readFeedbackDoneSignal("/project", "H-1-1", io);
    expect(signal).not.toBeNull();
    expect(signal!.id).toBe("H-1-1");
    expect(signal!.ts).toBeTruthy();
  });

  it("readFeedbackDoneSignal returns null when no file exists", () => {
    const io = createMockIO();
    const signal = readFeedbackDoneSignal("/project", "H-1-1", io);
    expect(signal).toBeNull();
  });

  it("readFeedbackDoneSignal returns null on invalid JSON", () => {
    const io = createMockIO();
    const path = feedbackDoneSignalPath("/project", "H-1-1");
    io.files.set(path, "not json");
    const signal = readFeedbackDoneSignal("/project", "H-1-1", io);
    expect(signal).toBeNull();
  });

  it("clearFeedbackDoneSignal deletes the signal file", () => {
    const io = createMockIO();
    io.files.set(signalDir("/project"), "");
    writeFeedbackDoneSignal("/project", "H-1-1", io);
    expect(readFeedbackDoneSignal("/project", "H-1-1", io)).not.toBeNull();

    clearFeedbackDoneSignal("/project", "H-1-1", io);
    expect(readFeedbackDoneSignal("/project", "H-1-1", io)).toBeNull();
  });

  it("clearFeedbackDoneSignal is a no-op when file doesn't exist", () => {
    const io = createMockIO();
    // Should not throw
    clearFeedbackDoneSignal("/project", "H-1-1", io);
    expect(io.unlinkSync).not.toHaveBeenCalled();
  });

  it("writeFeedbackDoneSignal creates directory if needed", () => {
    const io = createMockIO();
    writeFeedbackDoneSignal("/project", "H-1-1", io);
    expect(io.mkdirSync).toHaveBeenCalledWith(
      signalDir("/project"),
      { recursive: true },
    );
  });

  it("repeated writes overwrite without error", () => {
    const io = createMockIO();
    io.files.set(signalDir("/project"), "");

    writeFeedbackDoneSignal("/project", "H-1-1", io);
    const first = readFeedbackDoneSignal("/project", "H-1-1", io);

    writeFeedbackDoneSignal("/project", "H-1-1", io);
    const second = readFeedbackDoneSignal("/project", "H-1-1", io);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second!.id).toBe("H-1-1");
  });
});

// ── Command tests ────────────────────────────────────────────────────

describe("cmdFeedbackDone", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("writes signal file for the current branch", () => {
    const io = createMockIO();
    io.files.set(signalDir("/project"), "");
    const deps = createDeps(io, "ninthwave/H-FOO-1");

    const msg = cmdFeedbackDone([], "/project", deps);

    expect(msg).toContain("H-FOO-1");
    expect(readFeedbackDoneSignal("/project", "H-FOO-1", io)).not.toBeNull();
  });

  it("dies when not on a git branch", () => {
    const io = createMockIO();
    const deps = createDeps(io, null);

    const dieSpy = vi.spyOn(process, "stderr", "get").mockReturnValue({
      write: vi.fn(),
    } as unknown as NodeJS.WriteStream);

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    try {
      expect(() => cmdFeedbackDone([], "/project", deps)).toThrow();
    } finally {
      exitSpy.mockRestore();
      dieSpy.mockRestore();
    }
  });

  it("dies when on a non-item branch", () => {
    const io = createMockIO();
    const deps = createDeps(io, "main");

    const dieSpy = vi.spyOn(process, "stderr", "get").mockReturnValue({
      write: vi.fn(),
    } as unknown as NodeJS.WriteStream);

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    try {
      expect(() => cmdFeedbackDone([], "/project", deps)).toThrow();
    } finally {
      exitSpy.mockRestore();
      dieSpy.mockRestore();
    }
  });

  it("extracts complex item IDs from branch names", () => {
    const io = createMockIO();
    io.files.set(signalDir("/project"), "");
    const deps = createDeps(io, "ninthwave/H-RFC-3");

    const msg = cmdFeedbackDone([], "/project", deps);

    expect(msg).toContain("H-RFC-3");
    expect(readFeedbackDoneSignal("/project", "H-RFC-3", io)).not.toBeNull();
  });
});

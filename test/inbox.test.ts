import { describe, it, expect } from "vitest";
import {
  writeInbox,
  checkInbox,
  drainInbox,
  waitForInbox,
  cleanInbox,
  peekInbox,
  itemInboxDir,
  inboxWaitStatePath,
  cmdInbox,
  inspectInbox,
  readInboxHistory,
  readInboxWaitState,
  type InboxIO,
  type InboxDeps,
  type InboxWaitRuntime,
} from "../core/commands/inbox.ts";
import { stateFilePath } from "../core/daemon.ts";
import { dirname } from "path";
import { captureOutput } from "./helpers.ts";
// ── In-memory IO for fast unit tests ─────────────────────────────────

function makeMemIO() {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  const io: InboxIO = {
    existsSync: (p) => files.has(p) || dirs.has(p),
    mkdirSync: (p) => { dirs.add(p); },
    readdirSync: (p) => {
      const prefix = `${p}/`;
      return [...files.keys()]
        .filter((file) => file.startsWith(prefix) && !file.slice(prefix.length).includes("/"))
        .map((file) => file.slice(prefix.length));
    },
    readFileSync: (p) => {
      const content = files.get(p);
      if (content === undefined) throw new Error(`ENOENT: ${p}`);
      return content;
    },
    writeFileSync: (p, data) => { files.set(p, data); },
    appendFileSync: (p, data) => { files.set(p, `${files.get(p) ?? ""}${data}`); },
    unlinkSync: (p) => { files.delete(p); },
    renameSync: (old, nw) => {
      const content = files.get(old);
      if (content === undefined) throw new Error(`ENOENT: ${old}`);
      files.delete(old);
      files.set(nw, content);
    },
  };
  return { io, files, dirs };
}

function makeWaitRuntime() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const handlers = new Map<NodeJS.Signals, () => void>();
  let exitCode: number | null = null;

  const runtime: InboxWaitRuntime = {
    writeStdout: (text) => {
      stdout.push(text);
    },
    writeStderr: (text) => {
      stderr.push(text);
    },
    exit: (code) => {
      exitCode = code;
      throw new Error(`EXIT:${code}`);
    },
    onSignal: (signal, handler) => {
      handlers.set(signal, handler);
    },
    removeSignalListener: (signal, handler) => {
      if (handlers.get(signal) === handler) {
        handlers.delete(signal);
      }
    },
  };

  return { runtime, stdout, stderr, handlers, getExitCode: () => exitCode };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("inbox", () => {
  describe("writeInbox", () => {
    it("writes a message atomically", () => {
      const { io, files } = makeMemIO();
      writeInbox("/fake/project", "H-FOO-1", "Fix CI failure", io);
      const prefix = `${itemInboxDir("/fake/project", "H-FOO-1")}/`;
      const queued = [...files.entries()].filter(([path]) => path.startsWith(prefix));
      expect(queued).toHaveLength(1);
      expect(queued[0]![1]).toBe("Fix CI failure");
    });

    it("creates inbox directory if missing", () => {
      const { io, dirs } = makeMemIO();
      writeInbox("/fake/project", "H-FOO-2", "msg", io);
      expect(dirs.has(itemInboxDir("/fake/project", "H-FOO-2"))).toBe(true);
    });

    it("queues back-to-back messages instead of overwriting", () => {
      const { io, files } = makeMemIO();
      writeInbox("/fake/project", "H-FOO-1", "first", io);
      writeInbox("/fake/project", "H-FOO-1", "second", io);
      const prefix = `${itemInboxDir("/fake/project", "H-FOO-1")}/`;
      const queued = [...files.entries()]
        .filter(([path]) => path.startsWith(prefix))
        .sort(([a], [b]) => a.localeCompare(b));
      expect(queued.map(([, content]) => content)).toEqual(["first", "second"]);
    });
  });

  describe("checkInbox", () => {
    it("returns null when no message exists", () => {
      const { io } = makeMemIO();
      expect(checkInbox("/fake/project", "H-FOO-1", io)).toBeNull();
    });

    it("returns message and removes file", () => {
      const { io, files } = makeMemIO();
      writeInbox("/fake/project", "H-FOO-1", "hello", io);
      const msg = checkInbox("/fake/project", "H-FOO-1", io);
      expect(msg).toBe("hello");
      const prefix = `${itemInboxDir("/fake/project", "H-FOO-1")}/`;
      expect([...files.keys()].filter((path) => path.startsWith(prefix))).toHaveLength(0);
    });

    it("returns queued messages in order", () => {
      const { io } = makeMemIO();
      writeInbox("/fake/project", "H-FOO-1", "first", io);
      writeInbox("/fake/project", "H-FOO-1", "second", io);
      expect(checkInbox("/fake/project", "H-FOO-1", io)).toBe("first");
      expect(checkInbox("/fake/project", "H-FOO-1", io)).toBe("second");
      expect(checkInbox("/fake/project", "H-FOO-1", io)).toBeNull();
    });
  });

  describe("drainInbox", () => {
    it("returns an empty list when no messages exist", () => {
      const { io } = makeMemIO();
      expect(drainInbox("/fake/project", "H-FOO-1", io)).toEqual([]);
    });

    it("returns all queued messages in order and clears them", () => {
      const { io, files } = makeMemIO();
      writeInbox("/fake/project", "H-FOO-1", "first", io);
      writeInbox("/fake/project", "H-FOO-1", "second", io);
      writeInbox("/fake/project", "H-FOO-1", "third", io);

      expect(drainInbox("/fake/project", "H-FOO-1", io)).toEqual([
        "first",
        "second",
        "third",
      ]);
      const prefix = `${itemInboxDir("/fake/project", "H-FOO-1")}/`;
      expect([...files.keys()].filter((path) => path.startsWith(prefix))).toHaveLength(0);
    });

    it("records a durable drain history entry", () => {
      const { io } = makeMemIO();
      writeInbox("/fake/project", "H-FOO-1", "first", io);
      writeInbox("/fake/project", "H-FOO-1", "second", io);

      drainInbox("/fake/project", "H-FOO-1", io);

      const history = readInboxHistory("/fake/project", "H-FOO-1", 10, io);
      expect(history.some((entry) => entry.action === "drain" && entry.messageCount === 2)).toBe(true);
    });
  });

  describe("waitForInbox", () => {
    it("returns immediately when message exists", () => {
      const { io } = makeMemIO();
      writeInbox("/fake/project", "H-FOO-1", "urgent", io);
      let sleepCount = 0;
      const deps = {
        io,
        sleep: () => { sleepCount++; },
      };
      const msg = waitForInbox("/fake/project", "H-FOO-1", deps, 10);
      expect(msg).toBe("urgent");
      expect(sleepCount).toBe(0);
    });

    it("polls until message arrives", () => {
      const { io } = makeMemIO();
      let sleepCount = 0;
      const deps = {
        io,
        sleep: () => {
          sleepCount++;
          if (sleepCount === 3) {
            writeInbox("/fake/project", "H-FOO-1", "arrived", io);
          }
        },
      };
      const msg = waitForInbox("/fake/project", "H-FOO-1", deps, 10);
      expect(msg).toBe("arrived");
      expect(sleepCount).toBe(3);
    });
  });

  describe("cleanInbox", () => {
    it("removes inbox file if exists", () => {
      const { io, files } = makeMemIO();
      writeInbox("/fake/project", "H-FOO-1", "msg", io);
      writeInbox("/fake/project", "H-FOO-1", "msg-2", io);
      cleanInbox("/fake/project", "H-FOO-1", io);
      const prefix = `${itemInboxDir("/fake/project", "H-FOO-1")}/`;
      expect([...files.keys()].filter((path) => path.startsWith(prefix))).toHaveLength(0);
    });

    it("no-ops when file does not exist", () => {
      const { io } = makeMemIO();
      // Should not throw
      cleanInbox("/fake/project", "H-FOO-1", io);
    });

    it("records a durable clean history entry", () => {
      const { io } = makeMemIO();
      writeInbox("/fake/project", "H-FOO-1", "msg", io);

      cleanInbox("/fake/project", "H-FOO-1", io);

      const history = readInboxHistory("/fake/project", "H-FOO-1", 10, io);
      expect(history.some((entry) => entry.action === "clean" && entry.messageCount === 1)).toBe(true);
    });
  });

  describe("inspection helpers", () => {
    it("peeks queued messages without consuming them", () => {
      const { io } = makeMemIO();
      writeInbox("/fake/project", "H-FOO-1", "first queued message", io);
      writeInbox("/fake/project", "H-FOO-1", "second queued message", io);

      expect(peekInbox("/fake/project", "H-FOO-1", io)).toEqual([
        "first queued message",
        "second queued message",
      ]);
      expect(checkInbox("/fake/project", "H-FOO-1", io)).toBe("first queued message");
      expect(checkInbox("/fake/project", "H-FOO-1", io)).toBe("second queued message");
    });

    it("inspects pending count, queue location, wait metadata, and recent history", () => {
      const { io, files } = makeMemIO();
      writeInbox("/fake/project", "H-FOO-1", "message for status", io);
      const waitPath = inboxWaitStatePath("/fake/project", "H-FOO-1");
      files.set(waitPath, JSON.stringify({
        itemId: "H-FOO-1",
        startedAt: "2026-04-02T10:00:00.000Z",
        pid: 123,
        pollMs: 1000,
        namespaceProjectRoot: "/fake/project",
        queuePath: itemInboxDir("/fake/project", "H-FOO-1"),
      }));

      const inspection = inspectInbox("/fake/project", "H-FOO-1", io);
      expect(inspection.pendingCount).toBe(1);
      expect(inspection.queuePath).toBe(itemInboxDir("/fake/project", "H-FOO-1"));
      expect(inspection.pendingMessages[0]?.preview).toContain("message for status");
      expect(inspection.waitState?.pid).toBe(123);
      expect(inspection.recentHistory[0]?.action).toBe("write");
      expect(checkInbox("/fake/project", "H-FOO-1", io)).toBe("message for status");
    });

    it("records durable history across write, deliver, drain, clean, and interrupted wait paths", () => {
      const { io } = makeMemIO();
      writeInbox("/fake/project", "H-FOO-1", "first", io);
      checkInbox("/fake/project", "H-FOO-1", io);

      writeInbox("/fake/project", "H-FOO-1", "second", io);
      writeInbox("/fake/project", "H-FOO-1", "third", io);
      drainInbox("/fake/project", "H-FOO-1", io);

      writeInbox("/fake/project", "H-FOO-1", "fourth", io);
      cleanInbox("/fake/project", "H-FOO-1", io);

      const waitRuntime = makeWaitRuntime();
      let sleepCount = 0;
      const deps: InboxDeps = {
        io,
        sleep: () => {
          sleepCount++;
          if (sleepCount === 1) {
            waitRuntime.handlers.get("SIGINT")?.();
          }
        },
        getBranch: () => "ninthwave/H-FOO-1",
      };

      expect(() => cmdInbox(["--wait", "H-FOO-1"], "/fake/project", deps, waitRuntime.runtime)).toThrow("EXIT:1");

      const actions = readInboxHistory("/fake/project", "H-FOO-1", 20, io).map((entry) => entry.action);
      expect(actions).toContain("write");
      expect(actions).toContain("deliver");
      expect(actions).toContain("drain");
      expect(actions).toContain("clean");
      expect(actions).toContain("wait-interrupted");
    });
  });

  describe("cmdInbox", () => {
    it("writes a message via --write", () => {
      const { io, files } = makeMemIO();
      const deps: InboxDeps = {
        io,
        sleep: () => {},
        getBranch: () => "ninthwave/H-FOO-1",
      };
      const out = captureOutput(() => cmdInbox(["--write", "H-FOO-1", "-m", "Fix it"], "/fake/project", deps));
      const prefix = `${itemInboxDir("/fake/project", "H-FOO-1")}/`;
      const queued = [...files.entries()].filter(([path]) => path.startsWith(prefix));
      expect(queued.map(([, content]) => content)).toEqual(["Fix it"]);
      expect(out).toContain("wrote message");
    });

    it("checks for all pending messages via --check", () => {
      const { io } = makeMemIO();
      writeInbox("/fake/project", "H-FOO-1", "check-msg-1", io);
      writeInbox("/fake/project", "H-FOO-1", "check-msg-2", io);
      const chunks: string[] = [];
      const origWrite = process.stdout.write;
      process.stdout.write = ((chunk: string) => { chunks.push(chunk); return true; }) as typeof process.stdout.write;
      try {
        const deps: InboxDeps = {
          io,
          sleep: () => {},
          getBranch: () => "ninthwave/H-FOO-1",
        };
        cmdInbox(["--check", "H-FOO-1"], "/fake/project", deps);
      } finally {
        process.stdout.write = origWrite;
      }
      expect(chunks.join("")).toBe("check-msg-1\n\ncheck-msg-2");
    });

    it("reports non-destructive status output", () => {
      const { io } = makeMemIO();
      writeInbox("/fake/project", "H-FOO-1", "check status preview", io);
      const deps: InboxDeps = {
        io,
        sleep: () => {},
        getBranch: () => "ninthwave/H-FOO-1",
      };

      const chunks: string[] = [];
      const origWrite = process.stdout.write;
      process.stdout.write = ((chunk: string) => { chunks.push(chunk); return true; }) as typeof process.stdout.write;
      try {
        cmdInbox(["--status", "H-FOO-1"], "/fake/project", deps);
      } finally {
        process.stdout.write = origWrite;
      }
      const out = chunks.join("");

      expect(out).toContain("Pending: 1");
      expect(out).toContain(`Queue: ${itemInboxDir("/fake/project", "H-FOO-1")}`);
      expect(out).toContain("check status preview");
      expect(checkInbox("/fake/project", "H-FOO-1", io)).toBe("check status preview");
    });

    it("reports non-destructive queue previews via --peek", () => {
      const { io } = makeMemIO();
      writeInbox("/fake/project", "H-FOO-1", "peek-msg-1", io);
      writeInbox("/fake/project", "H-FOO-1", "peek-msg-2", io);
      const deps: InboxDeps = {
        io,
        sleep: () => {},
        getBranch: () => "ninthwave/H-FOO-1",
      };

      const chunks: string[] = [];
      const origWrite = process.stdout.write;
      process.stdout.write = ((chunk: string) => { chunks.push(chunk); return true; }) as typeof process.stdout.write;
      try {
        cmdInbox(["--peek", "H-FOO-1"], "/fake/project", deps);
      } finally {
        process.stdout.write = origWrite;
      }
      const out = chunks.join("");

      expect(out).toContain("Pending: 2");
      expect(out).toContain("peek-msg-1");
      expect(out).toContain("peek-msg-2");
      expect(drainInbox("/fake/project", "H-FOO-1", io)).toEqual(["peek-msg-1", "peek-msg-2"]);
    });

    it("auto-detects item ID from branch", () => {
      const { io, files } = makeMemIO();
      const deps: InboxDeps = {
        io,
        sleep: () => {},
        getBranch: () => "ninthwave/AUTO-DETECT-1",
      };
      captureOutput(() => cmdInbox(["--write", "-m", "auto msg"], "/fake/project", deps));
      const prefix = `${itemInboxDir("/fake/project", "AUTO-DETECT-1")}/`;
      const queued = [...files.entries()].filter(([path]) => path.startsWith(prefix));
      expect(queued.map(([, content]) => content)).toEqual(["auto msg"]);
    });

    it("dies when no item ID and not on ninthwave branch", () => {
      const { io } = makeMemIO();
      const deps: InboxDeps = {
        io,
        sleep: () => {},
        getBranch: () => "main",
      };
      const out = captureOutput(() => cmdInbox(["--check"], "/fake/project", deps));
      expect(out).toContain("Could not determine item ID");
    });

    it("dies with no subcommand", () => {
      const { io } = makeMemIO();
      const deps: InboxDeps = {
        io,
        sleep: () => {},
        getBranch: () => "ninthwave/H-FOO-1",
      };
      const out = captureOutput(() => cmdInbox([], "/fake/project", deps));
      expect(out).toContain("Usage");
    });

    it("emits rerun guidance and exits non-zero when wait is interrupted before delivery", () => {
      const { io } = makeMemIO();
      const waitRuntime = makeWaitRuntime();
      let sleepCount = 0;
      const deps: InboxDeps = {
        io,
        sleep: () => {
          sleepCount++;
          if (sleepCount === 2) {
            waitRuntime.handlers.get("SIGTERM")?.();
          }
        },
        getBranch: () => "ninthwave/H-FOO-1",
      };

      expect(() => cmdInbox(["--wait", "H-FOO-1"], "/fake/project", deps, waitRuntime.runtime)).toThrow("EXIT:1");
      expect(waitRuntime.getExitCode()).toBe(1);
      expect(waitRuntime.stdout).toEqual([]);
      expect(waitRuntime.stderr.join("")).toContain("rerun 'nw inbox --wait H-FOO-1' with a very long timeout");
      expect(waitRuntime.handlers.size).toBe(0);
      expect(readInboxWaitState("/fake/project", "H-FOO-1", io)).toBeNull();
      expect(readInboxHistory("/fake/project", "H-FOO-1", 10, io).some((entry) => entry.action === "wait-interrupted")).toBe(true);
    });

    it("writes explicit wait-state metadata while blocked", () => {
      const { io } = makeMemIO();
      const waitRuntime = makeWaitRuntime();
      let activeWaitPath: string | null = null;
      const deps: InboxDeps = {
        io,
        sleep: () => {
          activeWaitPath = inboxWaitStatePath("/fake/project", "H-FOO-1");
          const raw = activeWaitPath ? io.readFileSync(activeWaitPath, "utf-8") : null;
          expect(raw).toContain('"itemId": "H-FOO-1"');
          writeInbox("/fake/project", "H-FOO-1", "arrived after wait", io);
        },
        getBranch: () => "ninthwave/H-FOO-1",
      };

      cmdInbox(["--wait", "H-FOO-1"], "/fake/project", deps, waitRuntime.runtime);

      expect(waitRuntime.stdout.join("")).toBe("arrived after wait");
      expect(activeWaitPath).toBe(inboxWaitStatePath("/fake/project", "H-FOO-1"));
      expect(readInboxWaitState("/fake/project", "H-FOO-1", io)).toBeNull();
    });
  });

  // Regression tests for the namespace mismatch where the orchestrator writes
  // messages to the *worktree* namespace but the worker polls the *hub*
  // namespace (because `git rev-parse --git-common-dir` from inside a worktree
  // hands back the main repo path). The read path must resolve the active
  // worker namespace via the daemon state file so it reads from the same
  // directory the orchestrator writes to.
  describe("worker namespace resolution", () => {
    const hubRoot = "/fake/hub";
    const worktreeRoot = "/fake/hub/.ninthwave/.worktrees/ninthwave-H-FOO-1";
    const itemId = "H-FOO-1";

    function seedDaemonState(
      io: InboxIO,
      root: string,
      items: Array<{ id: string; state: string; worktreePath?: string }>,
    ): void {
      const filePath = stateFilePath(root);
      io.mkdirSync(dirname(filePath), { recursive: true });
      io.writeFileSync(filePath, JSON.stringify({ items }));
      for (const item of items) {
        if (item.worktreePath) {
          io.mkdirSync(item.worktreePath, { recursive: true });
        }
      }
    }

    it("checkInbox reads from the worktree namespace when daemon state points there", () => {
      const { io } = makeMemIO();
      seedDaemonState(io, hubRoot, [
        { id: itemId, state: "implementing", worktreePath: worktreeRoot },
      ]);
      // Orchestrator writes to the worktree namespace.
      writeInbox(worktreeRoot, itemId, "review feedback", io);

      // Worker reads from the hub (getProjectRoot returns the hub inside a worktree).
      expect(checkInbox(hubRoot, itemId, io)).toBe("review feedback");
      // The file was consumed from the worktree namespace, not recreated in the hub.
      expect(checkInbox(hubRoot, itemId, io)).toBeNull();
    });

    it("drainInbox returns all worktree-namespace messages when called via hub root", () => {
      const { io } = makeMemIO();
      seedDaemonState(io, hubRoot, [
        { id: itemId, state: "implementing", worktreePath: worktreeRoot },
      ]);
      writeInbox(worktreeRoot, itemId, "first", io);
      writeInbox(worktreeRoot, itemId, "second", io);
      writeInbox(worktreeRoot, itemId, "third", io);

      expect(drainInbox(hubRoot, itemId, io)).toEqual(["first", "second", "third"]);

      // The drain history entry is recorded in the resolved (worktree) namespace,
      // which is what `nw inbox --status` will read.
      const history = readInboxHistory(worktreeRoot, itemId, 10, io);
      expect(history.some((entry) => entry.action === "drain" && entry.messageCount === 3)).toBe(true);
    });

    it("waitForInbox picks up messages written to the resolved namespace", () => {
      const { io } = makeMemIO();
      seedDaemonState(io, hubRoot, [
        { id: itemId, state: "implementing", worktreePath: worktreeRoot },
      ]);
      let sleepCount = 0;
      const deps = {
        io,
        sleep: () => {
          sleepCount++;
          if (sleepCount === 2) {
            // Simulate the orchestrator delivering to the worktree namespace.
            writeInbox(worktreeRoot, itemId, "arrived via worktree", io);
          }
        },
      };

      const msg = waitForInbox(hubRoot, itemId, deps, 10);
      expect(msg).toBe("arrived via worktree");
      expect(sleepCount).toBe(2);
    });

    it("waitForInbox re-resolves namespace per poll so a mid-wait daemon-state update is picked up", () => {
      const { io } = makeMemIO();
      // Start with no worktreePath -- resolver falls back to hub.
      seedDaemonState(io, hubRoot, [
        { id: itemId, state: "launching" },
      ]);
      let sleepCount = 0;
      const deps = {
        io,
        sleep: () => {
          sleepCount++;
          if (sleepCount === 1) {
            // Orchestrator persists worktreePath + delivers message to worktree.
            seedDaemonState(io, hubRoot, [
              { id: itemId, state: "implementing", worktreePath: worktreeRoot },
            ]);
            writeInbox(worktreeRoot, itemId, "late-bind delivery", io);
          }
        },
      };

      const msg = waitForInbox(hubRoot, itemId, deps, 10);
      expect(msg).toBe("late-bind delivery");
    });

    it("runInboxWait writes its wait-state file next to the resolved queue", () => {
      const { io } = makeMemIO();
      seedDaemonState(io, hubRoot, [
        { id: itemId, state: "implementing", worktreePath: worktreeRoot },
      ]);
      const waitRuntime = makeWaitRuntime();
      const deps: InboxDeps = {
        io,
        sleep: () => {
          // While blocked, the wait-state file must live at the worktree namespace,
          // because that's where `nw inbox --status` (via inspectInbox) will look.
          const resolvedWaitPath = inboxWaitStatePath(worktreeRoot, itemId);
          expect(io.existsSync(resolvedWaitPath)).toBe(true);
          const raw = io.readFileSync(resolvedWaitPath, "utf-8");
          expect(raw).toContain(`"itemId": "${itemId}"`);
          expect(raw).toContain(worktreeRoot);
          // It must NOT be sitting at the hub path (that would be the old bug).
          expect(io.existsSync(inboxWaitStatePath(hubRoot, itemId))).toBe(false);
          writeInbox(worktreeRoot, itemId, "done waiting", io);
        },
        getBranch: () => `ninthwave/${itemId}`,
      };

      cmdInbox(["--wait", itemId], hubRoot, deps, waitRuntime.runtime);

      expect(waitRuntime.stdout.join("")).toBe("done waiting");
      // Cleanup removes the wait-state file at its original (resolved) location.
      expect(io.existsSync(inboxWaitStatePath(worktreeRoot, itemId))).toBe(false);
    });

    it("falls back to the passed-in projectRoot when daemon state is absent", () => {
      const { io } = makeMemIO();
      // No daemon state file -- resolver returns the hub path as-is.
      writeInbox(hubRoot, itemId, "hub-only message", io);

      expect(checkInbox(hubRoot, itemId, io)).toBe("hub-only message");
    });

    it("uses cwd as the fallback namespace when daemon state lacks worktreePath but cwd is the worktree", () => {
      const { io } = makeMemIO();
      // Daemon state exists but has no worktreePath -- simulates the launch
      // race where executeLaunch has spawned the worker but writeStateFile
      // hasn't run yet.
      seedDaemonState(io, hubRoot, [{ id: itemId, state: "launching" }]);
      // Mark the worktree dir as existing in the mem IO so the cwd fallback
      // passes its existsSync check.
      io.mkdirSync(worktreeRoot, { recursive: true });
      // Orchestrator has already delivered to the worktree namespace.
      writeInbox(worktreeRoot, itemId, "fast-path CI fix", io);

      // Pretend the worker process is running from its worktree.
      const origCwd = process.cwd;
      process.cwd = () => worktreeRoot;
      try {
        expect(checkInbox(hubRoot, itemId, io)).toBe("fast-path CI fix");
      } finally {
        process.cwd = origCwd;
      }
    });
  });

  describe("feedback-done signal integration", () => {
    it("worker can write and read feedback-done signal via DaemonIO", () => {
      // Test that the feedback-done signal round-trips through DaemonIO functions,
      // verifying the worker-side flow is compatible with the inbox/daemon layer.
      const daemon = require("../core/daemon.ts") as typeof import("../core/daemon.ts");

      const files = new Map<string, string>();
      const daemonIO: import("../core/daemon.ts").DaemonIO = {
        writeFileSync: (p: any, c: any) => { files.set(String(p), String(c)); },
        readFileSync: (p: any) => {
          const c = files.get(String(p));
          if (c === undefined) throw new Error(`ENOENT: ${String(p)}`);
          return c;
        },
        unlinkSync: (p: any) => { files.delete(String(p)); },
        existsSync: (p: any) => files.has(String(p)),
        mkdirSync: () => {},
        renameSync: (a: any, b: any) => {
          const c = files.get(String(a));
          if (c !== undefined) { files.set(String(b), c); files.delete(String(a)); }
        },
      } as import("../core/daemon.ts").DaemonIO;

      daemon.writeFeedbackDoneSignal("/project", "H-FOO-1", daemonIO);
      const signal = daemon.readFeedbackDoneSignal("/project", "H-FOO-1", daemonIO);
      expect(signal).not.toBeNull();
      expect(signal!.id).toBe("H-FOO-1");

      daemon.clearFeedbackDoneSignal("/project", "H-FOO-1", daemonIO);
      expect(daemon.readFeedbackDoneSignal("/project", "H-FOO-1", daemonIO)).toBeNull();
    });
  });
});

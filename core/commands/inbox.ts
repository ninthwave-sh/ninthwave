// inbox command: file-based message delivery between orchestrator and agents.
//
// Replaces cmux send-key for agent messaging. The orchestrator writes messages
// to an inbox file; agents run `nw inbox --wait` as a background process to
// receive them.
//
// Usage:
//   nw inbox --wait <item-id>              Block until a message arrives
//   nw inbox --check <item-id>             Non-blocking check for message
//   nw inbox --write <item-id> -m <text>   Write a message to the inbox

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync, renameSync } from "fs";
import { join } from "path";
import { die } from "../output.ts";
import { userStateDir } from "../daemon.ts";

// ── Types ────────────────────────────────────────────────────────────

export interface InboxIO {
  existsSync: (path: string) => boolean;
  mkdirSync: (path: string, opts?: { recursive?: boolean }) => void;
  readFileSync: (path: string, encoding: BufferEncoding) => string;
  writeFileSync: (path: string, data: string) => void;
  unlinkSync: (path: string) => void;
  renameSync: (oldPath: string, newPath: string) => void;
}

export interface InboxDeps {
  io: InboxIO;
  sleep: (ms: number) => void;
  getBranch: () => string | null;
}

const defaultDeps: InboxDeps = {
  io: { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, renameSync },
  sleep: (ms) => Bun.sleepSync(ms),
  getBranch: () => {
    try {
      const result = Bun.spawnSync(["git", "rev-parse", "--abbrev-ref", "HEAD"]);
      return result.exitCode === 0 ? result.stdout.toString().trim() : null;
    } catch {
      return null;
    }
  },
};

// ── Paths ────────────────────────────────────────────────────────────

/** Directory for inbox files: ~/.ninthwave/projects/{slug}/inbox/ */
export function inboxDir(projectRoot: string): string {
  return join(userStateDir(projectRoot), "inbox");
}

/** Path to a single inbox file: ~/.ninthwave/projects/{slug}/inbox/{id}.msg */
export function inboxFilePath(projectRoot: string, itemId: string): string {
  return join(inboxDir(projectRoot), `${itemId}.msg`);
}

// ── Core operations ──────────────────────────────────────────────────

/**
 * Write a message to the inbox atomically (temp file + rename).
 * Creates the inbox directory if it doesn't exist.
 */
export function writeInbox(
  projectRoot: string,
  itemId: string,
  message: string,
  io: InboxIO = defaultDeps.io,
): void {
  const dir = inboxDir(projectRoot);
  if (!io.existsSync(dir)) {
    io.mkdirSync(dir, { recursive: true });
  }
  const filePath = inboxFilePath(projectRoot, itemId);
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  io.writeFileSync(tmpPath, message);
  io.renameSync(tmpPath, filePath);
}

/**
 * Check for a message without blocking. Returns the message or null.
 * Removes the inbox file after reading.
 */
export function checkInbox(
  projectRoot: string,
  itemId: string,
  io: InboxIO = defaultDeps.io,
): string | null {
  const filePath = inboxFilePath(projectRoot, itemId);
  if (!io.existsSync(filePath)) return null;
  try {
    const content = io.readFileSync(filePath, "utf-8");
    io.unlinkSync(filePath);
    return content;
  } catch {
    return null;
  }
}

/**
 * Block until a message arrives. Polls every `pollMs` milliseconds.
 * Returns the message content. Removes the inbox file after reading.
 */
export function waitForInbox(
  projectRoot: string,
  itemId: string,
  deps: Pick<InboxDeps, "io" | "sleep"> = defaultDeps,
  pollMs: number = 1000,
): string {
  const filePath = inboxFilePath(projectRoot, itemId);
  while (true) {
    if (deps.io.existsSync(filePath)) {
      try {
        const content = deps.io.readFileSync(filePath, "utf-8");
        deps.io.unlinkSync(filePath);
        return content;
      } catch {
        // File may have been removed between exists check and read; retry.
      }
    }
    deps.sleep(pollMs);
  }
}

/**
 * Remove an inbox file if it exists. Used during worker cleanup.
 */
export function cleanInbox(
  projectRoot: string,
  itemId: string,
  io: InboxIO = defaultDeps.io,
): void {
  const filePath = inboxFilePath(projectRoot, itemId);
  if (io.existsSync(filePath)) {
    try {
      io.unlinkSync(filePath);
    } catch {
      // Best-effort cleanup
    }
  }
}

// ── Branch → item ID extraction ──────────────────────────────────────

function extractItemId(branch: string): string | null {
  const match = branch.match(/^ninthwave\/(.+)$/);
  return match ? match[1]! : null;
}

// ── CLI entry point ──────────────────────────────────────────────────

export function cmdInbox(
  args: string[],
  projectRoot: string,
  deps: InboxDeps = defaultDeps,
): void {
  const isWait = args.includes("--wait");
  const isCheck = args.includes("--check");
  const isWrite = args.includes("--write");

  if (!isWait && !isCheck && !isWrite) {
    die("Usage: nw inbox --wait <id> | --check <id> | --write <id> -m <text>");
    return;
  }

  // Determine item ID: positional arg after the flag, or auto-detect from branch
  let itemId: string | undefined;
  for (const flag of ["--wait", "--check", "--write"]) {
    const idx = args.indexOf(flag);
    if (idx !== -1 && idx + 1 < args.length && !args[idx + 1]!.startsWith("-")) {
      itemId = args[idx + 1]!;
      break;
    }
  }

  if (!itemId) {
    // Auto-detect from git branch
    const branch = deps.getBranch();
    if (branch) {
      itemId = extractItemId(branch) ?? undefined;
    }
    if (!itemId) {
      die("Could not determine item ID. Provide it as an argument or run from an item branch.");
      return;
    }
  }

  if (isWrite) {
    const msgIdx = args.indexOf("-m");
    const msgIdx2 = args.indexOf("--message");
    const mi = msgIdx !== -1 ? msgIdx : msgIdx2;
    if (mi === -1 || mi + 1 >= args.length) {
      die("Usage: nw inbox --write <id> -m <text>");
      return;
    }
    const message = args[mi + 1]!;
    writeInbox(projectRoot, itemId, message, deps.io);
    console.log(`Inbox: wrote message for ${itemId}`);
    return;
  }

  if (isCheck) {
    const message = checkInbox(projectRoot, itemId, deps.io);
    if (message) {
      process.stdout.write(message);
    }
    return;
  }

  if (isWait) {
    // Blocking wait -- used by agents as a background process
    const message = waitForInbox(projectRoot, itemId, deps);
    process.stdout.write(message);
    return;
  }
}

import { describe, it, expect } from "vitest";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { setupTempDir, cleanupTempRepos } from "./helpers.ts";
import { pickRotatedEnv, rotationStateFile } from "../core/rotation.ts";

function readCounters(home: string): Record<string, number> {
  const path = rotationStateFile(home);
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf-8")) as Record<string, number>;
}

describe("pickRotatedEnv", () => {
  it("returns an empty object when no rotation lists are provided", () => {
    const home = setupTempDir("rot-home-");
    try {
      const picked = pickRotatedEnv("claude", {}, home);
      expect(picked).toEqual({});
      expect(existsSync(rotationStateFile(home))).toBe(false);
    } finally {
      cleanupTempRepos();
    }
  });

  it("skips keys with empty value lists", () => {
    const home = setupTempDir("rot-home-");
    try {
      const picked = pickRotatedEnv("claude", { FOO: [] }, home);
      expect(picked).toEqual({});
      expect(existsSync(rotationStateFile(home))).toBe(false);
    } finally {
      cleanupTempRepos();
    }
  });

  it("cycles through values round-robin", () => {
    const home = setupTempDir("rot-home-");
    try {
      const rotation = { CLAUDE_CONFIG_DIR: ["/a", "/b", "/c"] };
      const seq = [
        pickRotatedEnv("claude", rotation, home),
        pickRotatedEnv("claude", rotation, home),
        pickRotatedEnv("claude", rotation, home),
        pickRotatedEnv("claude", rotation, home),
      ];
      expect(seq.map((p) => p.CLAUDE_CONFIG_DIR)).toEqual(["/a", "/b", "/c", "/a"]);
    } finally {
      cleanupTempRepos();
    }
  });

  it("persists the counter across invocations via the state file", () => {
    const home = setupTempDir("rot-home-");
    try {
      const rotation = { CLAUDE_CONFIG_DIR: ["/a", "/b"] };
      expect(pickRotatedEnv("claude", rotation, home).CLAUDE_CONFIG_DIR).toBe("/a");
      expect(pickRotatedEnv("claude", rotation, home).CLAUDE_CONFIG_DIR).toBe("/b");

      const counters = readCounters(home);
      expect(counters["claude:CLAUDE_CONFIG_DIR"]).toBe(2);

      expect(pickRotatedEnv("claude", rotation, home).CLAUDE_CONFIG_DIR).toBe("/a");
    } finally {
      cleanupTempRepos();
    }
  });

  it("keeps counters per tool + env key independently", () => {
    const home = setupTempDir("rot-home-");
    try {
      pickRotatedEnv("claude", { CLAUDE_CONFIG_DIR: ["/a", "/b"] }, home);
      pickRotatedEnv("claude", { CLAUDE_CONFIG_DIR: ["/a", "/b"] }, home);
      // Different tool id -> independent counter
      const picked = pickRotatedEnv("opencode", { CLAUDE_CONFIG_DIR: ["/a", "/b"] }, home);
      expect(picked.CLAUDE_CONFIG_DIR).toBe("/a");
    } finally {
      cleanupTempRepos();
    }
  });

  it("omits a key from the picked env when the rotation entry is null", () => {
    const home = setupTempDir("rot-home-");
    try {
      const rotation = { CLAUDE_CONFIG_DIR: [null, "/b"] };
      const first = pickRotatedEnv("claude", rotation, home);
      expect(first).toEqual({});
      expect(readCounters(home)["claude:CLAUDE_CONFIG_DIR"]).toBe(1);

      const second = pickRotatedEnv("claude", rotation, home);
      expect(second).toEqual({ CLAUDE_CONFIG_DIR: "/b" });
      expect(readCounters(home)["claude:CLAUDE_CONFIG_DIR"]).toBe(2);

      // Counter wraps modulo list length, so after 2 picks it's back to 1.
      const third = pickRotatedEnv("claude", rotation, home);
      expect(third).toEqual({});
      expect(readCounters(home)["claude:CLAUDE_CONFIG_DIR"]).toBe(1);
    } finally {
      cleanupTempRepos();
    }
  });

  it("treats an all-null rotation list as empty", () => {
    const home = setupTempDir("rot-home-");
    try {
      const picked = pickRotatedEnv("claude", { CLAUDE_CONFIG_DIR: [null, null] }, home);
      expect(picked).toEqual({});
      expect(existsSync(rotationStateFile(home))).toBe(false);
    } finally {
      cleanupTempRepos();
    }
  });

  it("recovers from a corrupt state file by starting at 0", () => {
    const home = setupTempDir("rot-home-");
    try {
      const path = rotationStateFile(home);
      mkdirSync(join(home, ".ninthwave", "state"), { recursive: true });
      writeFileSync(path, "{ not valid json");

      const picked = pickRotatedEnv("claude", { X: ["x0", "x1"] }, home);
      expect(picked.X).toBe("x0");

      // And subsequent picks advance normally
      expect(pickRotatedEnv("claude", { X: ["x0", "x1"] }, home).X).toBe("x1");
    } finally {
      cleanupTempRepos();
    }
  });
});

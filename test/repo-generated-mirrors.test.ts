import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import { join } from "path";
import { existsSync } from "fs";

describe("repo generated mirrors", () => {
  it("does not track generated tool mirror files that are repo-local artifacts", () => {
    const repoRoot = join(import.meta.dirname, "..");
    const result = spawnSync(
      "git",
      [
        "ls-files",
        ".claude/agents",
        ".claude/skills",
        ".codex/agents",
        ".opencode/agents",
        ".github/agents",
        ".github/copilot-instructions.md",
      ],
      { cwd: repoRoot, stdio: "pipe" },
    );

    expect(result.status).toBe(0);
    const presentTrackedFiles = result.stdout
      .toString()
      .trim()
      .split("\n")
      .filter(Boolean)
      .filter((filePath) => existsSync(join(repoRoot, filePath)));

    expect(presentTrackedFiles).toEqual([]);
  });
});

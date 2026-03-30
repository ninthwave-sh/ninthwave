// Tests for getNextTool -- round-robin AI tool assignment.

import { describe, it, expect } from "vitest";
import { getNextTool } from "../core/orchestrator.ts";
import type { ExecutionContext } from "../core/orchestrator.ts";

function makeCtx(tools: string[]): ExecutionContext {
  return {
    projectRoot: "/fake",
    worktreeDir: "/fake/.ninthwave/.worktrees",
    workDir: "/fake/.ninthwave/work",
    aiTool: tools[0]!,
    aiTools: tools,
    nextToolIndex: 0,
  };
}

describe("getNextTool", () => {
  it("returns the single tool when only one configured", () => {
    const ctx = makeCtx(["claude"]);
    expect(getNextTool(ctx)).toBe("claude");
    expect(getNextTool(ctx)).toBe("claude");
    expect(getNextTool(ctx)).toBe("claude");
  });

  it("round-robins between two tools", () => {
    const ctx = makeCtx(["claude", "opencode"]);
    expect(getNextTool(ctx)).toBe("claude");
    expect(getNextTool(ctx)).toBe("opencode");
    expect(getNextTool(ctx)).toBe("claude");
    expect(getNextTool(ctx)).toBe("opencode");
  });

  it("round-robins between three tools", () => {
    const ctx = makeCtx(["claude", "opencode", "copilot"]);
    expect(getNextTool(ctx)).toBe("claude");
    expect(getNextTool(ctx)).toBe("opencode");
    expect(getNextTool(ctx)).toBe("copilot");
    expect(getNextTool(ctx)).toBe("claude");
  });

  it("falls back to aiTool when aiTools is not set", () => {
    const ctx: ExecutionContext = {
      projectRoot: "/fake",
      worktreeDir: "/fake/.ninthwave/.worktrees",
      workDir: "/fake/.ninthwave/work",
      aiTool: "claude",
    };
    expect(getNextTool(ctx)).toBe("claude");
    expect(getNextTool(ctx)).toBe("claude");
  });

  it("increments nextToolIndex correctly", () => {
    const ctx = makeCtx(["claude", "opencode"]);
    expect(ctx.nextToolIndex).toBe(0);
    getNextTool(ctx);
    expect(ctx.nextToolIndex).toBe(1);
    getNextTool(ctx);
    expect(ctx.nextToolIndex).toBe(2);
    // Still returns correct tool via modulo
    expect(getNextTool(ctx)).toBe("claude");
    expect(ctx.nextToolIndex).toBe(3);
  });
});

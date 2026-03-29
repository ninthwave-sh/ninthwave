// Tests for selectAiTool -- explicit, user-driven AI tool selection.

import { describe, it, expect, vi, afterEach } from "vitest";
import { join } from "path";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { setupTempRepo, cleanupTempRepos } from "./helpers.ts";
import { selectAiTool, detectInstalledAITools } from "../core/tool-select.ts";
import type { SelectAiToolDeps } from "../core/tool-select.ts";

afterEach(() => {
  cleanupTempRepos();
});

function stubDeps(overrides: Partial<SelectAiToolDeps> = {}): SelectAiToolDeps {
  return {
    commandExists: overrides.commandExists ?? (() => false),
    prompt: overrides.prompt ?? (async () => ""),
    loadConfig: overrides.loadConfig ?? (() => ({})),
    saveConfig: overrides.saveConfig ?? (() => {}),
    loadUserConfig: overrides.loadUserConfig ?? (() => ({})),
  };
}

describe("selectAiTool", () => {
  it("returns --tool override directly", async () => {
    const save = vi.fn();
    const result = await selectAiTool(
      { toolOverride: "opencode", projectRoot: "/fake", isInteractive: true },
      stubDeps({ saveConfig: save }),
    );
    expect(result).toBe("opencode");
    expect(save).toHaveBeenCalledWith("/fake", { ai_tool: "opencode" });
  });

  it("accepts unknown tool override with warning", async () => {
    const save = vi.fn();
    const result = await selectAiTool(
      { toolOverride: "my-custom-ai", projectRoot: "/fake", isInteractive: true },
      stubDeps({ saveConfig: save }),
    );
    expect(result).toBe("my-custom-ai");
    expect(save).toHaveBeenCalledWith("/fake", { ai_tool: "my-custom-ai" });
  });

  it("auto-selects single installed tool", async () => {
    const save = vi.fn();
    const result = await selectAiTool(
      { projectRoot: "/fake", isInteractive: true },
      stubDeps({
        commandExists: (cmd) => cmd === "opencode",
        saveConfig: save,
      }),
    );
    expect(result).toBe("opencode");
    expect(save).toHaveBeenCalledWith("/fake", { ai_tool: "opencode" });
  });

  it("uses saved preference when non-interactive with multiple tools", async () => {
    const result = await selectAiTool(
      { projectRoot: "/fake", isInteractive: false },
      stubDeps({
        commandExists: (cmd) => cmd === "claude" || cmd === "opencode",
        loadConfig: () => ({ ai_tool: "opencode" }),
      }),
    );
    expect(result).toBe("opencode");
  });

  it("falls back to first installed when non-interactive with no saved preference", async () => {
    const result = await selectAiTool(
      { projectRoot: "/fake", isInteractive: false },
      stubDeps({
        commandExists: (cmd) => cmd === "claude" || cmd === "opencode",
        loadConfig: () => ({}),
      }),
    );
    expect(result).toBe("claude"); // first in profile order
  });

  it("falls back to first installed when saved preference is not installed", async () => {
    const result = await selectAiTool(
      { projectRoot: "/fake", isInteractive: false },
      stubDeps({
        commandExists: (cmd) => cmd === "claude" || cmd === "copilot",
        loadConfig: () => ({ ai_tool: "opencode" }), // opencode not installed
      }),
    );
    expect(result).toBe("claude");
  });

  it("prompts interactively with multiple tools and empty input selects default", async () => {
    const save = vi.fn();
    const result = await selectAiTool(
      { projectRoot: "/fake", isInteractive: true },
      stubDeps({
        commandExists: (cmd) => cmd === "claude" || cmd === "opencode",
        loadConfig: () => ({ ai_tool: "opencode" }),
        prompt: async () => "", // press Enter
        saveConfig: save,
      }),
    );
    // opencode is the saved preference, so default is opencode (index 1)
    expect(result).toBe("opencode");
    expect(save).toHaveBeenCalledWith("/fake", { ai_tool: "opencode" });
  });

  it("prompts interactively and numeric input selects that tool", async () => {
    const save = vi.fn();
    const result = await selectAiTool(
      { projectRoot: "/fake", isInteractive: true },
      stubDeps({
        commandExists: (cmd) => cmd === "claude" || cmd === "opencode",
        loadConfig: () => ({ ai_tool: "opencode" }),
        prompt: async () => "1", // select claude (index 0)
        saveConfig: save,
      }),
    );
    expect(result).toBe("claude");
    expect(save).toHaveBeenCalledWith("/fake", { ai_tool: "claude" });
  });

  it("pre-selects first tool when no saved preference", async () => {
    const save = vi.fn();
    const result = await selectAiTool(
      { projectRoot: "/fake", isInteractive: true },
      stubDeps({
        commandExists: (cmd) => cmd === "claude" || cmd === "opencode",
        loadConfig: () => ({}), // no saved preference
        prompt: async () => "", // press Enter
        saveConfig: save,
      }),
    );
    expect(result).toBe("claude"); // first in profile order
  });

  it("uses user config ai_tool when no --tool override", async () => {
    const save = vi.fn();
    const result = await selectAiTool(
      { projectRoot: "/fake", isInteractive: true },
      stubDeps({
        loadUserConfig: () => ({ ai_tool: "opencode" }),
        commandExists: (cmd) => cmd === "claude" || cmd === "opencode",
        saveConfig: save,
      }),
    );
    expect(result).toBe("opencode");
    expect(save).toHaveBeenCalledWith("/fake", { ai_tool: "opencode" });
  });

  it("--tool override takes precedence over user config", async () => {
    const save = vi.fn();
    const result = await selectAiTool(
      { toolOverride: "claude", projectRoot: "/fake", isInteractive: true },
      stubDeps({
        loadUserConfig: () => ({ ai_tool: "opencode" }),
        saveConfig: save,
      }),
    );
    expect(result).toBe("claude");
    expect(save).toHaveBeenCalledWith("/fake", { ai_tool: "claude" });
  });

  it("user config takes precedence over installed tool detection", async () => {
    const save = vi.fn();
    const result = await selectAiTool(
      { projectRoot: "/fake", isInteractive: false },
      stubDeps({
        loadUserConfig: () => ({ ai_tool: "copilot" }),
        commandExists: (cmd) => cmd === "claude" || cmd === "opencode",
        saveConfig: save,
      }),
    );
    // user config wins even though copilot is not in installed list detection
    expect(result).toBe("copilot");
  });

  it("warns for unknown tool in user config", async () => {
    const save = vi.fn();
    const result = await selectAiTool(
      { projectRoot: "/fake", isInteractive: true },
      stubDeps({
        loadUserConfig: () => ({ ai_tool: "my-custom-ai" }),
        saveConfig: save,
      }),
    );
    expect(result).toBe("my-custom-ai");
    expect(save).toHaveBeenCalledWith("/fake", { ai_tool: "my-custom-ai" });
  });

  it("skips user config when ai_tool is not set", async () => {
    const save = vi.fn();
    const result = await selectAiTool(
      { projectRoot: "/fake", isInteractive: true },
      stubDeps({
        loadUserConfig: () => ({}), // no ai_tool set
        commandExists: (cmd) => cmd === "claude",
        saveConfig: save,
      }),
    );
    // Falls through to installed tool detection
    expect(result).toBe("claude");
  });
});

describe("detectInstalledAITools", () => {
  it("returns empty when no tools installed", () => {
    const result = detectInstalledAITools(() => false);
    expect(result).toHaveLength(0);
  });

  it("returns matching tools in profile order", () => {
    const result = detectInstalledAITools((cmd) => cmd === "opencode" || cmd === "claude");
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe("claude");
    expect(result[1]!.id).toBe("opencode");
  });

  it("returns all tools when all installed", () => {
    const result = detectInstalledAITools(() => true);
    expect(result.length).toBeGreaterThanOrEqual(3);
  });
});

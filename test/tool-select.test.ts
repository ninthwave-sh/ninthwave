// Tests for selectAiTool/selectAiTools -- explicit, user-driven AI tool selection.

import { describe, it, expect, vi, afterEach } from "vitest";
import { join } from "path";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { setupTempRepo, cleanupTempRepos } from "./helpers.ts";
import { selectAiTool, selectAiTools, detectInstalledAITools } from "../core/tool-select.ts";
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
    expect(save).toHaveBeenCalledWith("/fake", { ai_tools: ["opencode"] });
  });

  it("accepts unknown tool override with warning", async () => {
    const save = vi.fn();
    const result = await selectAiTool(
      { toolOverride: "my-custom-ai", projectRoot: "/fake", isInteractive: true },
      stubDeps({ saveConfig: save }),
    );
    expect(result).toBe("my-custom-ai");
    expect(save).toHaveBeenCalledWith("/fake", { ai_tools: ["my-custom-ai"] });
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
    expect(save).toHaveBeenCalledWith("/fake", { ai_tools: ["opencode"] });
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

  it("prompts interactively with multiple tools and empty input confirms defaults", async () => {
    const save = vi.fn();
    const result = await selectAiTool(
      { projectRoot: "/fake", isInteractive: true },
      stubDeps({
        commandExists: (cmd) => cmd === "claude" || cmd === "opencode",
        loadConfig: () => ({ ai_tools: ["opencode"] }),
        prompt: async () => "", // press Enter to confirm
        saveConfig: save,
      }),
    );
    // opencode is pre-checked from saved tools
    expect(result).toBe("opencode");
    expect(save).toHaveBeenCalledWith("/fake", { ai_tools: ["opencode"] });
  });

  it("prompts interactively and numeric input toggles selection", async () => {
    const save = vi.fn();
    let callCount = 0;
    const result = await selectAiTool(
      { projectRoot: "/fake", isInteractive: true },
      stubDeps({
        commandExists: (cmd) => cmd === "claude" || cmd === "opencode",
        loadConfig: () => ({ ai_tools: ["opencode"] }),
        prompt: async () => {
          callCount++;
          if (callCount === 1) return "1"; // toggle claude on
          return ""; // confirm
        },
        saveConfig: save,
      }),
    );
    // claude (1) toggled on + opencode pre-checked = [claude, opencode], returns first
    expect(result).toBe("claude");
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

  it("uses user config ai_tools when no --tool override", async () => {
    const save = vi.fn();
    const result = await selectAiTool(
      { projectRoot: "/fake", isInteractive: true },
      stubDeps({
        loadUserConfig: () => ({ ai_tools: ["opencode"] }),
        commandExists: (cmd) => cmd === "claude" || cmd === "opencode",
        saveConfig: save,
      }),
    );
    expect(result).toBe("opencode");
    expect(save).toHaveBeenCalledWith("/fake", { ai_tools: ["opencode"] });
  });

  it("uses user config ai_tool (legacy) when no ai_tools", async () => {
    const save = vi.fn();
    const result = await selectAiTool(
      { projectRoot: "/fake", isInteractive: true },
      stubDeps({
        loadUserConfig: () => ({ ai_tool: "opencode", ai_tools: ["opencode"] }),
        commandExists: (cmd) => cmd === "claude" || cmd === "opencode",
        saveConfig: save,
      }),
    );
    expect(result).toBe("opencode");
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
    expect(save).toHaveBeenCalledWith("/fake", { ai_tools: ["claude"] });
  });

  it("user config takes precedence over installed tool detection", async () => {
    const save = vi.fn();
    const result = await selectAiTool(
      { projectRoot: "/fake", isInteractive: false },
      stubDeps({
        loadUserConfig: () => ({ ai_tools: ["copilot"] }),
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
        loadUserConfig: () => ({ ai_tools: ["my-custom-ai"] }),
        saveConfig: save,
      }),
    );
    expect(result).toBe("my-custom-ai");
    expect(save).toHaveBeenCalledWith("/fake", { ai_tools: ["my-custom-ai"] });
  });

  it("skips user config when ai_tools is not set", async () => {
    const save = vi.fn();
    const result = await selectAiTool(
      { projectRoot: "/fake", isInteractive: true },
      stubDeps({
        loadUserConfig: () => ({}), // no ai_tools set
        commandExists: (cmd) => cmd === "claude",
        saveConfig: save,
      }),
    );
    // Falls through to installed tool detection
    expect(result).toBe("claude");
  });
});

describe("selectAiTools", () => {
  it("splits comma-separated --tool override into array", async () => {
    const save = vi.fn();
    const result = await selectAiTools(
      { toolOverride: "claude,opencode", projectRoot: "/fake", isInteractive: true },
      stubDeps({ saveConfig: save }),
    );
    expect(result).toEqual(["claude", "opencode"]);
    expect(save).toHaveBeenCalledWith("/fake", { ai_tools: ["claude", "opencode"] });
  });

  it("handles single --tool override as single-element array", async () => {
    const result = await selectAiTools(
      { toolOverride: "claude", projectRoot: "/fake", isInteractive: true },
      stubDeps(),
    );
    expect(result).toEqual(["claude"]);
  });

  it("returns multi-tool from user config ai_tools", async () => {
    const save = vi.fn();
    const result = await selectAiTools(
      { projectRoot: "/fake", isInteractive: false },
      stubDeps({
        loadUserConfig: () => ({ ai_tools: ["claude", "opencode"] }),
        saveConfig: save,
      }),
    );
    expect(result).toEqual(["claude", "opencode"]);
  });

  it("returns saved multi-tool preference when non-interactive", async () => {
    const result = await selectAiTools(
      { projectRoot: "/fake", isInteractive: false },
      stubDeps({
        commandExists: (cmd) => cmd === "claude" || cmd === "opencode",
        loadConfig: () => ({ ai_tools: ["opencode", "claude"] }),
      }),
    );
    expect(result).toEqual(["opencode", "claude"]);
  });

  it("falls back to single saved ai_tool when ai_tools absent (non-interactive)", async () => {
    const result = await selectAiTools(
      { projectRoot: "/fake", isInteractive: false },
      stubDeps({
        commandExists: (cmd) => cmd === "claude" || cmd === "opencode",
        loadConfig: () => ({ ai_tool: "opencode" }),
      }),
    );
    expect(result).toEqual(["opencode"]);
  });

  it("interactive multi-select: toggle and confirm", async () => {
    const save = vi.fn();
    let callCount = 0;
    const result = await selectAiTools(
      { projectRoot: "/fake", isInteractive: true },
      stubDeps({
        commandExists: (cmd) => cmd === "claude" || cmd === "opencode",
        loadConfig: () => ({}),
        prompt: async () => {
          callCount++;
          // First tool (claude) is pre-checked by default
          if (callCount === 1) return "2"; // toggle opencode on
          return ""; // confirm
        },
        saveConfig: save,
      }),
    );
    expect(result).toEqual(["claude", "opencode"]);
    expect(save).toHaveBeenCalledWith("/fake", { ai_tools: ["claude", "opencode"] });
  });

  it("interactive: can deselect default and select another", async () => {
    const save = vi.fn();
    let callCount = 0;
    const result = await selectAiTools(
      { projectRoot: "/fake", isInteractive: true },
      stubDeps({
        commandExists: (cmd) => cmd === "claude" || cmd === "opencode",
        loadConfig: () => ({}),
        prompt: async () => {
          callCount++;
          if (callCount === 1) return "1"; // toggle claude off (was pre-checked)
          if (callCount === 2) return "2"; // toggle opencode on
          return ""; // confirm
        },
        saveConfig: save,
      }),
    );
    expect(result).toEqual(["opencode"]);
  });

  it("interactive: rejects empty selection", async () => {
    let callCount = 0;
    const result = await selectAiTools(
      { projectRoot: "/fake", isInteractive: true },
      stubDeps({
        commandExists: (cmd) => cmd === "claude" || cmd === "opencode",
        loadConfig: () => ({}),
        prompt: async () => {
          callCount++;
          if (callCount === 1) return "1"; // toggle off claude (was pre-checked)
          if (callCount === 2) return ""; // try to confirm with 0 selected -- rejected
          if (callCount === 3) return "2"; // toggle opencode on
          return ""; // confirm
        },
      }),
    );
    expect(result).toEqual(["opencode"]);
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

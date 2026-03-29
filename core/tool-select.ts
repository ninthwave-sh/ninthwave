// AI tool selection: explicit, user-driven tool choice with config persistence.
// Replaces the old auto-detection cascade (detectAiTool) with an intentional
// prompt-based flow that remembers the last used tool.

import { createInterface } from "readline";
import { AI_TOOL_PROFILES, isAiToolId } from "./ai-tools.ts";
import type { AiToolId, AiToolProfile } from "./ai-tools.ts";
import { loadConfig, saveConfig, loadUserConfig } from "./config.ts";
import type { UserConfig } from "./config.ts";
import { run } from "./shell.ts";
import { die, warn, info, BOLD, DIM, RESET } from "./output.ts";

// ── Types ────────────────────────────────────────────────────────────

export type CommandChecker = (cmd: string) => boolean;
export type PromptFn = (question: string) => Promise<string>;

export interface SelectAiToolOptions {
  /** Explicit tool override from --tool CLI arg. Bypasses prompt. */
  toolOverride?: string;
  /** Project root for config load/save. */
  projectRoot: string;
  /** Whether to prompt interactively (TTY, not daemon). */
  isInteractive: boolean;
}

export interface SelectAiToolDeps {
  commandExists?: CommandChecker;
  prompt?: PromptFn;
  loadConfig?: (root: string) => { ai_tool?: string };
  saveConfig?: (root: string, updates: { ai_tool?: string }) => void;
  loadUserConfig?: () => UserConfig;
}

// ── Default implementations ──────────────────────────────────────────

const defaultCommandExists: CommandChecker = (cmd: string): boolean => {
  return run("which", [cmd]).exitCode === 0;
};

const defaultPrompt: PromptFn = (question: string): Promise<string> => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
};

// ── Detection ────────────────────────────────────────────────────────

/**
 * Detect all installed AI coding tools.
 * Returns matching AiToolProfile entries in preference order (claude > opencode > copilot).
 */
export function detectInstalledAITools(
  commandExists: CommandChecker = defaultCommandExists,
): AiToolProfile[] {
  return AI_TOOL_PROFILES.filter((p) => commandExists(p.command));
}

// ── Selection ────────────────────────────────────────────────────────

/**
 * Select which AI tool to use for worker sessions.
 *
 * Priority chain:
 * 1. --tool CLI override: use directly, save, return
 * 2. User config (~/.ninthwave/config.json ai_tool): use if set, save, return
 * 3. Detect installed tools
 * 4. None found: error with install instructions
 * 5. Single tool: auto-select, save, return
 * 6. Multiple + non-interactive: use saved project preference or first installed
 * 7. Multiple + interactive: prompt with last-used pre-selected
 */
export async function selectAiTool(
  options: SelectAiToolOptions,
  deps: SelectAiToolDeps = {},
): Promise<string> {
  const commandExists = deps.commandExists ?? defaultCommandExists;
  const promptFn = deps.prompt ?? defaultPrompt;
  const doLoadConfig = deps.loadConfig ?? loadConfig;
  const doSaveConfig = deps.saveConfig ?? saveConfig;
  const doLoadUserConfig = deps.loadUserConfig ?? loadUserConfig;

  // 1. Explicit --tool override
  if (options.toolOverride) {
    if (!isAiToolId(options.toolOverride)) {
      warn(`Unknown AI tool: "${options.toolOverride}". Known tools: ${AI_TOOL_PROFILES.map(p => p.id).join(", ")}. Proceeding anyway.`);
    }
    doSaveConfig(options.projectRoot, { ai_tool: options.toolOverride });
    return options.toolOverride;
  }

  // 2. User-level config (~/.ninthwave/config.json)
  const userConfig = doLoadUserConfig();
  if (userConfig.ai_tool) {
    if (!isAiToolId(userConfig.ai_tool)) {
      warn(`Unknown AI tool in ~/.ninthwave/config.json: "${userConfig.ai_tool}". Known tools: ${AI_TOOL_PROFILES.map(p => p.id).join(", ")}. Proceeding anyway.`);
    }
    doSaveConfig(options.projectRoot, { ai_tool: userConfig.ai_tool });
    return userConfig.ai_tool;
  }

  // 3. Detect installed tools
  const installed = detectInstalledAITools(commandExists);

  // 4. None found
  if (installed.length === 0) {
    die(
      "No AI coding tool found. Install one:\n" +
      AI_TOOL_PROFILES.map(p => `  ${BOLD}${p.installCmd}${RESET} ${DIM}(${p.description})${RESET}`).join("\n"),
    );
  }

  // 5. Single tool --auto-select
  if (installed.length === 1) {
    const tool = installed[0]!;
    doSaveConfig(options.projectRoot, { ai_tool: tool.id });
    return tool.id;
  }

  // 6. Multiple tools, non-interactive --use saved preference or first installed
  const config = doLoadConfig(options.projectRoot);
  const savedTool = config.ai_tool;

  if (!options.isInteractive) {
    if (savedTool && installed.some(t => t.id === savedTool)) {
      return savedTool;
    }
    return installed[0]!.id;
  }

  // 7. Multiple tools, interactive --prompt with pre-selection
  const defaultIdx = savedTool
    ? installed.findIndex(t => t.id === savedTool)
    : -1;
  const effectiveDefault = defaultIdx >= 0 ? defaultIdx : 0;

  console.log(`${DIM}AI coding tool:${RESET}`);
  for (let i = 0; i < installed.length; i++) {
    const t = installed[i]!;
    console.log(`  ${BOLD}${i + 1}${RESET}. ${t.displayName} ${DIM}(${t.description})${RESET}`);
  }

  while (true) {
    const answer = await promptFn(`Choose [1-${installed.length}] (Enter for ${effectiveDefault + 1}): `);

    // Empty input = confirm default
    if (answer === "") {
      const tool = installed[effectiveDefault]!;
      doSaveConfig(options.projectRoot, { ai_tool: tool.id });
      info(`Using ${tool.displayName}`);
      return tool.id;
    }

    const idx = parseInt(answer, 10) - 1;
    if (idx >= 0 && idx < installed.length) {
      const tool = installed[idx]!;
      doSaveConfig(options.projectRoot, { ai_tool: tool.id });
      info(`Using ${tool.displayName}`);
      return tool.id;
    }

    console.log(`  Please enter a number between 1 and ${installed.length}.`);
  }
}

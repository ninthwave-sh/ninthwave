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
  loadConfig?: (root: string) => { ai_tool?: string; ai_tools?: string[] };
  saveConfig?: (root: string, updates: { ai_tool?: string; ai_tools?: string[] }) => void;
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
 * Select which AI tool(s) to use for worker sessions.
 *
 * Priority chain:
 * 1. --tool CLI override (comma-separated): save, return
 * 2. User config (~/.ninthwave/config.json ai_tools/ai_tool): save, return
 * 3. Detect installed tools
 * 4. None found: error with install instructions
 * 5. Single tool: auto-select, save, return
 * 6. Multiple + non-interactive: use saved project preference or first installed
 * 7. Multiple + interactive: multi-select prompt
 */
export async function selectAiTools(
  options: SelectAiToolOptions,
  deps: SelectAiToolDeps = {},
): Promise<string[]> {
  const commandExists = deps.commandExists ?? defaultCommandExists;
  const promptFn = deps.prompt ?? defaultPrompt;
  const doLoadConfig = deps.loadConfig ?? loadConfig;
  const doSaveConfig = deps.saveConfig ?? saveConfig;
  const doLoadUserConfig = deps.loadUserConfig ?? loadUserConfig;
  const knownIds = AI_TOOL_PROFILES.map(p => p.id).join(", ");

  // 1. Explicit --tool override (comma-separated)
  if (options.toolOverride) {
    const tools = options.toolOverride.split(",").map(s => s.trim()).filter(Boolean);
    for (const t of tools) {
      if (!isAiToolId(t)) {
        warn(`Unknown AI tool: "${t}". Known tools: ${knownIds}. Proceeding anyway.`);
      }
    }
    doSaveConfig(options.projectRoot, { ai_tools: tools });
    return tools;
  }

  // 2. User-level config (~/.ninthwave/config.json)
  const userConfig = doLoadUserConfig();
  if (userConfig.ai_tools && userConfig.ai_tools.length > 0) {
    for (const t of userConfig.ai_tools) {
      if (!isAiToolId(t)) {
        warn(`Unknown AI tool in ~/.ninthwave/config.json: "${t}". Known tools: ${knownIds}. Proceeding anyway.`);
      }
    }
    doSaveConfig(options.projectRoot, { ai_tools: userConfig.ai_tools });
    return userConfig.ai_tools;
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
    doSaveConfig(options.projectRoot, { ai_tools: [tool.id] });
    return [tool.id];
  }

  // 6. Multiple tools, non-interactive --use saved preference or first installed
  const config = doLoadConfig(options.projectRoot);
  const savedTools = config.ai_tools;

  if (!options.isInteractive) {
    if (savedTools && savedTools.length > 0 && savedTools.every(t => installed.some(i => i.id === t))) {
      return savedTools;
    }
    // Fall back to single saved tool or first installed
    const savedTool = config.ai_tool;
    if (savedTool && installed.some(t => t.id === savedTool)) {
      return [savedTool];
    }
    return [installed[0]!.id];
  }

  // 7. Multiple tools, interactive --multi-select with toggles
  const selected = new Set<number>();
  // Pre-check saved tools
  if (savedTools && savedTools.length > 0) {
    for (const st of savedTools) {
      const idx = installed.findIndex(t => t.id === st);
      if (idx >= 0) selected.add(idx);
    }
  }
  // If nothing pre-checked, check the first one
  if (selected.size === 0) selected.add(0);

  const renderList = () => {
    console.log(`${DIM}AI coding tool(s) -- toggle with number, Enter to confirm:${RESET}`);
    for (let i = 0; i < installed.length; i++) {
      const t = installed[i]!;
      const check = selected.has(i) ? `[x]` : `[ ]`;
      console.log(`  ${BOLD}${i + 1}${RESET}. ${check} ${t.displayName} ${DIM}(${t.description})${RESET}`);
    }
  };

  renderList();

  while (true) {
    const answer = await promptFn(`Toggle [1-${installed.length}] or Enter to confirm: `);

    if (answer === "") {
      if (selected.size === 0) {
        console.log(`  Select at least one tool.`);
        continue;
      }
      break;
    }

    const idx = parseInt(answer, 10) - 1;
    if (idx >= 0 && idx < installed.length) {
      if (selected.has(idx)) {
        selected.delete(idx);
      } else {
        selected.add(idx);
      }
      renderList();
    } else {
      console.log(`  Please enter a number between 1 and ${installed.length}.`);
    }
  }

  const result = [...selected].sort().map(i => installed[i]!.id);
  doSaveConfig(options.projectRoot, { ai_tools: result });
  const names = result.map(id => AI_TOOL_PROFILES.find(p => p.id === id)?.displayName ?? id);
  info(`Using ${names.join(", ")}${result.length > 1 ? " (round-robin)" : ""}`);
  return result;
}

/**
 * Select a single AI tool. Thin wrapper around selectAiTools for callers
 * that only need one tool (e.g., `nw start`, schedule runner).
 */
export async function selectAiTool(
  options: SelectAiToolOptions,
  deps: SelectAiToolDeps = {},
): Promise<string> {
  const tools = await selectAiTools(options, deps);
  return tools[0]!;
}

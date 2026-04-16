// Simple interactive terminal prompts for CLI commands.
//
// Provides checkbox multi-select and confirmation prompts using
// raw terminal mode for keystroke capture. Falls back to non-interactive
// defaults when stdin is not a TTY.

import { createInterface } from "readline";
import { BOLD, DIM, GREEN, RESET, YELLOW } from "./output.ts";

// ── Types ────────────────────────────────────────────────────────────

export interface CheckboxChoice {
  value: string;
  label: string;
  description?: string;
  checked: boolean;
}

/** Function signature for injectable checkbox prompt. */
export type CheckboxPromptFn = (
  message: string,
  choices: CheckboxChoice[],
) => Promise<string[]>;

/** Function signature for injectable confirm prompt. */
export type ConfirmPromptFn = (
  message: string,
  defaultValue?: boolean,
) => Promise<boolean>;

export type RestartRecoveryAction = "relaunch" | "hold";

/** Prompt signature for unresolved restart-recovery items. */
export type RestartRecoveryPromptFn = (
  itemId: string,
  worktreePath: string,
) => Promise<RestartRecoveryAction>;

// ── Checkbox prompt ──────────────────────────────────────────────────

/**
 * Display an interactive checkbox prompt.
 *
 * Arrow keys (or j/k) navigate, space toggles, 'a' toggles all, enter confirms.
 * Returns the values of selected (checked) items.
 */
export async function checkboxPrompt(
  message: string,
  choices: CheckboxChoice[],
): Promise<string[]> {
  const items = choices.map((c) => ({ ...c }));
  let cursor = 0;

  const renderLine = (i: number): string => {
    const item = items[i]!;
    const pointer = i === cursor ? `${GREEN}>${RESET}` : " ";
    const check = item.checked ? `${GREEN}[x]${RESET}` : "[ ]";
    const desc = item.description
      ? ` ${DIM}-- ${item.description}${RESET}`
      : "";
    return `  ${pointer} ${check} ${BOLD}${item.label}${RESET}${desc}`;
  };

  const hint = `${DIM}  (arrows navigate, space toggle, a toggle all, enter confirm)${RESET}`;

  // Initial render
  console.log(message);
  console.log(hint);
  for (let i = 0; i < items.length; i++) {
    console.log(renderLine(i));
  }

  const totalLines = items.length + 2; // message + hint + items

  const redraw = () => {
    // Move cursor up to start of block and clear each line
    process.stdout.write(`\x1b[${totalLines}A`);
    process.stdout.write(`\x1b[2K${message}\n`);
    process.stdout.write(`\x1b[2K${hint}\n`);
    for (let i = 0; i < items.length; i++) {
      process.stdout.write(`\x1b[2K${renderLine(i)}\n`);
    }
  };

  // Enable raw mode for keystroke capture
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdout.write("\x1b[?25l"); // Hide text cursor

  return new Promise<string[]>((resolve) => {
    const cleanup = () => {
      process.stdin.removeListener("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\x1b[?25h"); // Show text cursor
    };

    const onData = (data: Buffer) => {
      const key = data.toString();

      if (key === "\x1b[A" || key === "k") {
        // Up
        cursor = (cursor - 1 + items.length) % items.length;
        redraw();
      } else if (key === "\x1b[B" || key === "j") {
        // Down
        cursor = (cursor + 1) % items.length;
        redraw();
      } else if (key === " ") {
        // Toggle current
        items[cursor]!.checked = !items[cursor]!.checked;
        redraw();
      } else if (key === "a") {
        // Toggle all
        const allChecked = items.every((i) => i.checked);
        for (const item of items) item.checked = !allChecked;
        redraw();
      } else if (key === "\r" || key === "\n") {
        // Confirm
        cleanup();
        resolve(items.filter((i) => i.checked).map((i) => i.value));
      } else if (key === "\x03") {
        // Ctrl+C
        cleanup();
        process.exit(130);
      }
    };

    process.stdin.on("data", onData);
  });
}

// ── Confirm prompt ───────────────────────────────────────────────────

/**
 * Display a Y/n confirmation prompt.
 *
 * Returns true for yes (or empty input when defaultValue is true).
 */
export async function confirmPrompt(
  message: string,
  defaultValue: boolean = true,
): Promise<boolean> {
  const suffix = defaultValue ? "(Y/n)" : "(y/N)";

  return new Promise<boolean>((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(`${message} ${suffix} `, (answer: string) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === "") resolve(defaultValue);
      else resolve(trimmed === "y" || trimmed === "yes");
    });
  });
}

// ── Broker secret prompt ─────────────────────────────────────────────

/**
 * Outcome of the broker secret prompt in `nw init`.
 *
 * - `generate` -- init should create a new 32-byte base64 secret and write it
 *   to `.ninthwave/config.local.json`.
 * - `enter` -- the user pasted a pre-existing team secret; `value` is already
 *   validated and ready to save.
 * - `skip` -- no secret should be provisioned; the project stays local-only
 *   until the user opts in later.
 */
export type BrokerSecretAction =
  | { action: "generate" }
  | { action: "enter"; value: string }
  | { action: "skip" };

/** Injectable broker-secret prompt signature (used by tests). */
export type BrokerSecretPromptFn = (
  validate: (value: string) => boolean,
) => Promise<BrokerSecretAction>;

/**
 * Core state machine for the broker secret prompt. Accepts any async `ask`
 * function so tests can drive the three paths (generate / enter / skip)
 * without needing a real TTY or readline instance.
 *
 * The `enter` branch re-prompts on invalid input so a mistyped or partial
 * paste never lands in `.ninthwave/config.local.json`.
 */
export async function resolveBrokerSecretAction(
  ask: (question: string) => Promise<string>,
  validate: (value: string) => boolean,
): Promise<BrokerSecretAction> {
  // Outer loop: menu selection. Inner loop (inside the "enter" branch):
  // re-prompt the value on validation failure.
  while (true) {
    const raw = (await ask("Choice [G/e/s]: ")).trim().toLowerCase();
    if (raw === "" || raw === "g" || raw === "generate") {
      return { action: "generate" };
    }
    if (raw === "s" || raw === "skip") {
      return { action: "skip" };
    }
    if (raw === "e" || raw === "enter") {
      while (true) {
        const pasted = (await ask("Paste broker secret (32-byte base64): "))
          .trim();
        if (validate(pasted)) {
          return { action: "enter", value: pasted };
        }
        console.log(
          `${YELLOW}Invalid broker secret${RESET} ${DIM}-- expected 32 bytes base64-encoded. Try again.${RESET}`,
        );
      }
    }
    console.log(`${YELLOW}Please enter g, e, or s.${RESET}`);
  }
}

/**
 * Ask the user how the project's broker secret should be provisioned.
 * Thin readline wrapper around `resolveBrokerSecretAction` -- the state
 * machine is separated so it can be unit-tested without a real stdin.
 */
export async function brokerSecretPrompt(
  validate: (value: string) => boolean,
): Promise<BrokerSecretAction> {
  console.log(`${BOLD}Broker secret${RESET}`);
  console.log(
    `  ${DIM}Authenticates this project to teammates via the crew/broker.${RESET}`,
  );
  console.log(`  ${BOLD}g${RESET} ${DIM}-- generate a random 32-byte secret (default)${RESET}`);
  console.log(`  ${BOLD}e${RESET} ${DIM}-- enter an existing team secret${RESET}`);
  console.log(`  ${BOLD}s${RESET} ${DIM}-- skip (local-only setup)${RESET}`);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const ask = (question: string): Promise<string> =>
    new Promise((resolve) => rl.question(question, resolve));

  try {
    return await resolveBrokerSecretAction(ask, validate);
  } finally {
    rl.close();
  }
}

/**
 * Ask whether an unresolved restarted worker should be relaunched or held.
 */
export async function promptRestartRecoveryAction(
  itemId: string,
  worktreePath: string,
  prompt: ConfirmPromptFn = confirmPrompt,
): Promise<RestartRecoveryAction> {
  const shouldRelaunch = await prompt(
    `No live workspace was found for restarted item ${itemId} (${worktreePath}). Relaunch it now?`,
    true,
  );
  return shouldRelaunch ? "relaunch" : "hold";
}

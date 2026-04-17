// `nw crew` -- manage the project's crew connection (broker secret and URL).
//
// Subcommands:
//   nw crew              -- show crew status (alias: `nw crew status`)
//   nw crew create       -- generate a new broker_secret and write it to
//                           `.ninthwave/config.local.json`. Prompts before
//                           overwriting an existing secret.
//   nw crew join <s>     -- validate and save a pasted broker_secret.
//                           Prompts before overwriting an existing secret.
//   nw crew disconnect   -- remove `broker_secret` from config.local.json.
//                           Prompts for confirmation.
//
// All subcommands read config via `loadConfig`/`loadLocalConfig`, write via
// `saveLocalConfig`, and delegate interactive confirmation to an injectable
// `confirmPrompt` so tests can drive the overwrite/disconnect paths without
// a TTY.

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { BOLD, CYAN, DIM, GREEN, RED, RESET, YELLOW, die } from "../output.ts";
import {
  generateProjectIdentity as defaultGenerateProjectIdentity,
  loadConfig as defaultLoadConfig,
  loadLocalConfig as defaultLoadLocalConfig,
  parseBrokerSecret as defaultParseBrokerSecret,
  saveLocalConfig as defaultSaveLocalConfig,
  stripJsonComments,
  type ProjectConfig,
} from "../config.ts";
import { confirmPrompt as defaultConfirmPrompt } from "../prompt.ts";
import { DEFAULT_CREW_URL, resolveCrewSocketUrl } from "../orchestrate-crew.ts";

// ── Types ──────────────────────────────────────────────────────────

export interface CrewDeps {
  loadConfig?: (projectRoot: string) => ProjectConfig;
  loadLocalConfig?: (projectRoot: string) => Partial<ProjectConfig>;
  saveLocalConfig?: (projectRoot: string, updates: Partial<ProjectConfig>) => void;
  removeLocalBrokerSecret?: (projectRoot: string) => boolean;
  generateProjectIdentity?: () => { project_id: string; broker_secret: string };
  parseBrokerSecret?: (value: unknown) => string | undefined;
  confirmPrompt?: (message: string, defaultValue?: boolean) => Promise<boolean>;
  log?: (...args: unknown[]) => void;
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Remove `broker_secret` from `.ninthwave/config.local.json`, preserving any
 * other keys. Returns `true` when a `broker_secret` field was present and
 * removed, `false` when the file is missing, malformed, or lacked the field.
 *
 * Kept local to this module so `nw crew disconnect` can clear the secret
 * without teaching `saveLocalConfig` to honour explicit-undefined deletions
 * (which would complicate every other caller that merges partial updates).
 */
export function removeLocalBrokerSecret(projectRoot: string): boolean {
  const configPath = join(projectRoot, ".ninthwave", "config.local.json");
  if (!existsSync(configPath)) return false;

  let parsed: Record<string, unknown>;
  try {
    const raw = readFileSync(configPath, "utf-8");
    const data = JSON.parse(stripJsonComments(raw));
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return false;
    }
    parsed = data as Record<string, unknown>;
  } catch {
    return false;
  }

  if (!("broker_secret" in parsed)) return false;
  delete parsed.broker_secret;
  writeFileSync(configPath, JSON.stringify(parsed, null, 2) + "\n");
  return true;
}

function resolveEffectiveBrokerSecret(
  shared: ProjectConfig,
  local: Partial<ProjectConfig>,
): string | undefined {
  return local.broker_secret ?? shared.broker_secret;
}

function resolveEffectiveCrewUrl(
  shared: ProjectConfig,
  local: Partial<ProjectConfig>,
): string | undefined {
  return local.crew_url ?? shared.crew_url;
}

// ── Subcommand: status ─────────────────────────────────────────────

function cmdCrewStatus(projectRoot: string, deps: CrewDeps): void {
  const log = deps.log ?? console.log;
  const loadConfig = deps.loadConfig ?? defaultLoadConfig;
  const loadLocalConfig = deps.loadLocalConfig ?? defaultLoadLocalConfig;

  const shared = loadConfig(projectRoot);
  const local = loadLocalConfig(projectRoot);
  const secret = resolveEffectiveBrokerSecret(shared, local);
  const crewUrl = resolveEffectiveCrewUrl(shared, local);
  const resolvedUrl = resolveCrewSocketUrl(crewUrl);
  const urlIsDefault = crewUrl === undefined;

  if (secret === undefined) {
    log(
      `${BOLD}Crew:${RESET} ${YELLOW}not configured${RESET} ${DIM}(no broker secret -- run ${BOLD}nw crew create${RESET}${DIM} or ${BOLD}nw init${RESET}${DIM})${RESET}`,
    );
    return;
  }

  const urlLabel = urlIsDefault ? `${CYAN}${resolvedUrl}${RESET} ${DIM}(default)${RESET}` : `${CYAN}${resolvedUrl}${RESET}`;
  log(
    `${BOLD}Crew:${RESET} ${GREEN}configured${RESET} ${DIM}(secret present, broker:${RESET} ${urlLabel}${DIM})${RESET}`,
  );
}

// ── Subcommand: create ─────────────────────────────────────────────

async function cmdCrewCreate(projectRoot: string, deps: CrewDeps): Promise<void> {
  const log = deps.log ?? console.log;
  const loadConfig = deps.loadConfig ?? defaultLoadConfig;
  const loadLocalConfig = deps.loadLocalConfig ?? defaultLoadLocalConfig;
  const saveLocalConfig = deps.saveLocalConfig ?? defaultSaveLocalConfig;
  const generateProjectIdentity = deps.generateProjectIdentity ?? defaultGenerateProjectIdentity;
  const confirmPrompt = deps.confirmPrompt ?? defaultConfirmPrompt;

  const shared = loadConfig(projectRoot);
  const local = loadLocalConfig(projectRoot);
  const existing = resolveEffectiveBrokerSecret(shared, local);

  if (existing !== undefined) {
    log(
      `${YELLOW}A broker secret already exists for this project.${RESET} ${DIM}Replacing it will invalidate existing crew sessions.${RESET}`,
    );
    const ok = await confirmPrompt("Overwrite the existing broker secret?", false);
    if (!ok) {
      log(`${DIM}Aborted. Existing broker secret is unchanged.${RESET}`);
      return;
    }
  }

  const identity = generateProjectIdentity();
  saveLocalConfig(projectRoot, { broker_secret: identity.broker_secret });

  log();
  log(`${BOLD}Broker secret created.${RESET}`);
  log(`  ${DIM}Saved to .ninthwave/config.local.json (gitignored).${RESET}`);
  log();
  log(`${BOLD}Secret:${RESET} ${identity.broker_secret}`);
  log();
  log(`${DIM}Share this with teammates via password manager or secure chat.${RESET}`);
  log(`${DIM}Teammates can join with:${RESET} ${BOLD}nw crew join ${identity.broker_secret}${RESET}`);
}

// ── Subcommand: join ───────────────────────────────────────────────

async function cmdCrewJoin(args: string[], projectRoot: string, deps: CrewDeps): Promise<void> {
  const log = deps.log ?? console.log;
  const loadConfig = deps.loadConfig ?? defaultLoadConfig;
  const loadLocalConfig = deps.loadLocalConfig ?? defaultLoadLocalConfig;
  const saveLocalConfig = deps.saveLocalConfig ?? defaultSaveLocalConfig;
  const parseBrokerSecret = deps.parseBrokerSecret ?? defaultParseBrokerSecret;
  const confirmPrompt = deps.confirmPrompt ?? defaultConfirmPrompt;

  const value = args[0];
  if (value === undefined) {
    die("nw crew join requires a broker secret: nw crew join <secret>");
  }

  const validated = parseBrokerSecret(value);
  if (validated === undefined) {
    die(
      "Invalid broker secret: expected 32 bytes base64-encoded (44 chars ending in '=').",
    );
  }

  const shared = loadConfig(projectRoot);
  const local = loadLocalConfig(projectRoot);
  const existing = resolveEffectiveBrokerSecret(shared, local);

  if (existing !== undefined && existing !== validated) {
    log(
      `${YELLOW}A different broker secret is already configured.${RESET} ${DIM}Replacing it will leave the current crew.${RESET}`,
    );
    const ok = await confirmPrompt("Replace the existing broker secret?", false);
    if (!ok) {
      log(`${DIM}Aborted. Existing broker secret is unchanged.${RESET}`);
      return;
    }
  }

  saveLocalConfig(projectRoot, { broker_secret: validated });

  log();
  log(`${GREEN}Joined crew.${RESET}`);
  log(`  ${DIM}Broker secret saved to .ninthwave/config.local.json (gitignored).${RESET}`);
  log(`  ${DIM}Default broker:${RESET} ${CYAN}${DEFAULT_CREW_URL}${RESET}`);
}

// ── Subcommand: disconnect ─────────────────────────────────────────

async function cmdCrewDisconnect(projectRoot: string, deps: CrewDeps): Promise<void> {
  const log = deps.log ?? console.log;
  const loadConfig = deps.loadConfig ?? defaultLoadConfig;
  const loadLocalConfig = deps.loadLocalConfig ?? defaultLoadLocalConfig;
  const removeSecret = deps.removeLocalBrokerSecret ?? removeLocalBrokerSecret;
  const confirmPrompt = deps.confirmPrompt ?? defaultConfirmPrompt;

  const shared = loadConfig(projectRoot);
  const local = loadLocalConfig(projectRoot);
  const existing = resolveEffectiveBrokerSecret(shared, local);

  if (existing === undefined) {
    log(`${DIM}No broker secret is configured. Nothing to disconnect.${RESET}`);
    return;
  }

  log(
    `${YELLOW}Disconnecting will remove the broker secret from this project.${RESET} ${DIM}You will need to rejoin with ${BOLD}nw crew join${RESET}${DIM} or regenerate with ${BOLD}nw crew create${RESET}${DIM}.${RESET}`,
  );
  const ok = await confirmPrompt("Remove the broker secret?", false);
  if (!ok) {
    log(`${DIM}Aborted. Broker secret is unchanged.${RESET}`);
    return;
  }

  const removed = removeSecret(projectRoot);
  if (removed) {
    log(`${GREEN}Disconnected.${RESET} ${DIM}broker_secret removed from .ninthwave/config.local.json.${RESET}`);
  } else {
    // The effective secret lived in the shared config rather than the local
    // overlay (unusual but possible via manual edits). Surface that instead of
    // silently claiming success.
    log(
      `${RED}Could not remove broker_secret from .ninthwave/config.local.json.${RESET} ${DIM}It may be set in the shared config.json instead -- edit that file manually to disconnect.${RESET}`,
    );
  }
}

// ── Command handler ────────────────────────────────────────────────

export async function cmdCrew(
  args: string[],
  projectRoot: string,
  deps: CrewDeps = {},
): Promise<void> {
  const subcommand = args[0] ?? "status";
  const rest = args.slice(1);

  switch (subcommand) {
    case "status":
      cmdCrewStatus(projectRoot, deps);
      return;
    case "create":
      await cmdCrewCreate(projectRoot, deps);
      return;
    case "join":
      await cmdCrewJoin(rest, projectRoot, deps);
      return;
    case "disconnect":
      await cmdCrewDisconnect(projectRoot, deps);
      return;
    default:
      die(
        `Unknown crew subcommand: ${subcommand}. Expected one of: status, create, join, disconnect.`,
      );
  }
}

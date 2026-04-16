// Round-robin selection for env var values across ninthwave launches.
//
// Used by ai_tool_overrides.<tool>.env_rotation to spread launches across a
// pool of values (e.g. multiple CLAUDE_CONFIG_DIR profiles to dodge the 5h
// session limit). State is persisted globally in ~/.ninthwave/state/ and keyed
// by "<toolId>:<envKey>" so two projects sharing the same pool advance
// together -- which is what you want for spreading session-hour load.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

export interface RotationDeps {
  readFileSync: (path: string, encoding: BufferEncoding) => string;
  writeFileSync: (path: string, content: string) => void;
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
  existsSync: (path: string) => boolean;
}

export const defaultRotationDeps: RotationDeps = {
  readFileSync: (path, enc) => readFileSync(path, enc),
  writeFileSync,
  mkdirSync,
  existsSync,
};

/** Resolve the rotation state file path for a given home dir. */
export function rotationStateFile(home?: string): string {
  return join(home ?? homedir(), ".ninthwave", "state", "rotation.json");
}

type Counters = Record<string, number>;

function readCounters(path: string, deps: RotationDeps): Counters {
  if (!deps.existsSync(path)) return {};
  try {
    const raw = deps.readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const result: Counters = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        result[key] = Math.floor(value);
      }
    }
    return result;
  } catch {
    return {};
  }
}

function writeCounters(path: string, counters: Counters, deps: RotationDeps): void {
  deps.mkdirSync(dirname(path), { recursive: true });
  deps.writeFileSync(path, JSON.stringify(counters, null, 2) + "\n");
}

/**
 * Pick one value from each rotation list, round-robin, and advance the
 * persisted counter.
 *
 * A `null` entry in a list advances the counter but is omitted from the
 * returned picks, letting the caller fall back to the tool's default
 * (e.g. leave CLAUDE_CONFIG_DIR unset to use native/Keychain credentials).
 * Lists containing only `null` are treated as empty and skipped.
 *
 * @param toolId Tool id the rotation belongs to (used in the counter key).
 * @param rotation Map of envKey -> candidate values.
 * @param home Override the home dir (for tests). Defaults to os.homedir().
 * @param deps Injected fs ops (for tests).
 */
export function pickRotatedEnv(
  toolId: string,
  rotation: Record<string, Array<string | null>>,
  home?: string,
  deps: RotationDeps = defaultRotationDeps,
): Record<string, string> {
  const entries = Object.entries(rotation).filter(
    ([, values]) => values.length > 0 && values.some((v) => v !== null),
  );
  if (entries.length === 0) return {};

  const path = rotationStateFile(home);
  const counters = readCounters(path, deps);
  const picked: Record<string, string> = {};
  let mutated = false;

  for (const [envKey, values] of entries) {
    const counterKey = `${toolId}:${envKey}`;
    const index = (counters[counterKey] ?? 0) % values.length;
    const value = values[index];
    if (value !== null) picked[envKey] = value!;
    counters[counterKey] = index + 1;
    mutated = true;
  }

  if (mutated) {
    try {
      writeCounters(path, counters, deps);
    } catch {
      // Counter persistence is best-effort; if the state dir is unwritable
      // we still return a valid selection rather than crashing the launch.
    }
  }

  return picked;
}

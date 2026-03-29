// Resolve the cmux binary path, checking PATH then well-known macOS locations.

import { run as defaultRun } from "./shell.ts";
import { existsSync } from "fs";
import type { RunResult } from "./types.ts";

/** Well-known macOS cask install path for cmux. */
export const CMUX_MACOS_PATH =
  "/Applications/cmux.app/Contents/Resources/bin/cmux";

/**
 * Resolve the cmux binary path.
 *
 * 1. Bare "cmux" on PATH (cheapest -- just try running it)
 * 2. macOS cask location (/Applications/cmux.app/...)
 * 3. null -- not found
 */
export function resolveCmuxBinary(
  tryRun: (cmd: string, args: string[]) => RunResult = defaultRun,
): string | null {
  // 1. On PATH
  try {
    if (tryRun("cmux", ["version"]).exitCode === 0) return "cmux";
  } catch {
    // not on PATH
  }

  // 2. Well-known macOS path
  if (existsSync(CMUX_MACOS_PATH)) {
    try {
      if (tryRun(CMUX_MACOS_PATH, ["version"]).exitCode === 0)
        return CMUX_MACOS_PATH;
    } catch {
      // exists but won't run
    }
  }

  return null;
}

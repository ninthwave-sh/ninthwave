// Supervisor activation detection for the orchestrate event loop.
// The actual supervisor logic now lives in a separate Claude Code session
// launched via launchSupervisorSession() in core/commands/start.ts.

import { existsSync } from "fs";
import { join } from "path";

/**
 * Check if we're in dogfooding mode (ninthwave developing itself).
 * Detected by the presence of skills/work/SKILL.md in the project root.
 */
export function isDogfoodingMode(projectRoot: string): boolean {
  return existsSync(join(projectRoot, "skills", "work", "SKILL.md"));
}

/**
 * Determine whether the supervisor should be active based on flags and environment.
 */
export function shouldActivateSupervisor(
  supervisorFlag: boolean,
  projectRoot: string,
): boolean {
  // Explicit flag takes priority
  if (supervisorFlag) return true;
  // Auto-activate in dogfooding mode
  return isDogfoodingMode(projectRoot);
}

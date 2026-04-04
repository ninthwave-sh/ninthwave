/**
 * Detects GitHub Actions workflow presence by scanning .github/workflows/.
 * Used to determine appropriate CI grace periods: repos with no relevant
 * workflows get short grace (third-party status checks only), repos with
 * workflows get longer grace (check runs appear quickly even when queued).
 */

import { readdirSync, readFileSync } from "fs";
import { join } from "path";

export interface WorkflowPresence {
  hasPrWorkflows: boolean;
  hasPushWorkflows: boolean;
}

const cache = new Map<string, WorkflowPresence>();

/** Detect whether the repo has GitHub Actions workflows for PR and push triggers. Cached per repoRoot. */
export function detectWorkflowPresence(repoRoot: string): WorkflowPresence {
  const cached = cache.get(repoRoot);
  if (cached) return cached;
  const result = scanWorkflowFiles(repoRoot);
  cache.set(repoRoot, result);
  return result;
}

function scanWorkflowFiles(repoRoot: string): WorkflowPresence {
  const dir = join(repoRoot, ".github", "workflows");
  let hasPr = false;
  let hasPush = false;
  try {
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(".yml") && !entry.endsWith(".yaml")) continue;
      const content = readFileSync(join(dir, entry), "utf-8");
      // Only inspect the trigger section (before jobs:) to avoid false positives
      // from trigger keywords appearing in step names or scripts.
      const onSection = content.split(/^jobs:/m)[0] ?? content;
      if (/pull_request/.test(onSection)) hasPr = true;
      if (/\bpush\b/.test(onSection)) hasPush = true;
      if (hasPr && hasPush) break;
    }
  } catch {
    // .github/workflows doesn't exist or can't read → no workflows
  }
  return { hasPrWorkflows: hasPr, hasPushWorkflows: hasPush };
}

export function clearWorkflowPresenceCache(): void {
  cache.clear();
}

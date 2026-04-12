// Schedule-only types kept out of shared modules.

import type { Priority } from "./types.ts";

export interface ScheduledTask {
  id: string; // slug-style, e.g. "daily-test-run"
  title: string;
  schedule: string; // raw expression from the file, e.g. "every 2h"
  scheduleCron: string; // normalized 5-field cron, e.g. "0 */2 * * *"
  priority: Priority;
  domain: string;
  timeout: number; // ms, default 30 min (1_800_000)
  prompt: string; // body text (the task prompt)
  filePath: string;
  enabled: boolean;
}

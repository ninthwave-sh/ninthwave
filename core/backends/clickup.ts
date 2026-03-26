// ClickUp backend: reads tasks from a ClickUp list via the ClickUp API v2
// and maps them to TodoItem shape. Supports closing tasks and syncing status tags.

import type { TodoItem, Priority, TaskBackend, StatusSync } from "../types.ts";

/** Function signature for making HTTP requests (injectable for testing). */
export type HttpFetcher = (
  url: string,
  options: { method: string; headers: Record<string, string>; body?: string },
) => { ok: boolean; status: number; json: unknown };

/** Raw shape returned by ClickUp API v2 GET /task/{task_id} */
export interface ClickUpTask {
  id: string;
  name: string;
  description: string;
  status: { status: string };
  priority: { id: string; priority: string } | null;
  list: { name: string } | null;
  tags: Array<{ name: string }>;
  subtasks?: Array<{ id: string; name: string }>;
}

/** Raw shape returned by ClickUp API v2 GET /list/{list_id}/task */
export interface ClickUpTaskListResponse {
  tasks: ClickUpTask[];
}

/** Map ClickUp priority field (1-4) to a Priority. Falls back to "medium". */
export function mapClickUpPriority(
  priority: ClickUpTask["priority"],
): Priority {
  if (!priority) return "medium";
  switch (priority.id) {
    case "1":
      return "critical";
    case "2":
      return "high";
    case "3":
      return "medium";
    case "4":
      return "low";
    default:
      return "medium";
  }
}

/** Convert a ClickUp task to a TodoItem. */
export function taskToTodoItem(task: ClickUpTask): TodoItem {
  // Extract dependencies from subtasks that have ninthwave-style IDs in their name
  const dependencies: string[] = [];
  if (task.subtasks) {
    for (const sub of task.subtasks) {
      const match = sub.name.match(/\b([A-Z]-[A-Za-z0-9]+-[0-9]+)\b/);
      if (match) dependencies.push(match[1]);
    }
  }

  return {
    id: `CKU-${task.id}`,
    priority: mapClickUpPriority(task.priority),
    title: task.name ?? "",
    domain: task.list?.name ?? "uncategorized",
    dependencies,
    bundleWith: [],
    status: "open",
    filePath: "",
    repoAlias: "",
    rawText: task.description ?? "",
    filePaths: [],
    testPlan: "",
    bootstrap: false,
  };
}

/** Default ClickUp API base URL. */
const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";

/** Known status tags managed by the orchestrator. */
export const STATUS_TAGS = [
  "ninthwave:in-progress",
  "ninthwave:pr-open",
] as const;

/**
 * Synchronous HTTP fetch wrapper using Bun's native fetch.
 * ClickUp API v2 calls are fast enough that blocking is acceptable
 * in the CLI context. Returns a simplified response object.
 */
function syncFetch(
  url: string,
  options: { method: string; headers: Record<string, string>; body?: string },
): { ok: boolean; status: number; json: unknown } {
  // Use Bun.spawnSync to run a curl command for synchronous HTTP
  // This keeps the backend synchronous like GitHubIssuesBackend
  const args = [
    "-s",
    "-w",
    "\n%{http_code}",
    "-X",
    options.method,
    url,
  ];
  for (const [key, value] of Object.entries(options.headers)) {
    args.push("-H", `${key}: ${value}`);
  }
  if (options.body) {
    args.push("-d", options.body);
  }

  const result = Bun.spawnSync(["curl", ...args]);
  const output = result.stdout.toString().trim();
  const lines = output.split("\n");
  const statusCode = parseInt(lines[lines.length - 1], 10);
  const body = lines.slice(0, -1).join("\n");

  let json: unknown = null;
  try {
    json = JSON.parse(body);
  } catch {
    // Leave as null
  }

  return {
    ok: statusCode >= 200 && statusCode < 300,
    status: statusCode,
    json,
  };
}

export class ClickUpBackend implements TaskBackend, StatusSync {
  private apiBase: string;

  constructor(
    private listId: string,
    private apiToken: string,
    private fetcher: HttpFetcher = syncFetch,
    apiBase?: string,
  ) {
    this.apiBase = apiBase ?? CLICKUP_API_BASE;
  }

  /** Build standard headers for ClickUp API requests. */
  private headers(): Record<string, string> {
    return {
      Authorization: this.apiToken,
      "Content-Type": "application/json",
    };
  }

  /** List open tasks in the configured ClickUp list. */
  list(): TodoItem[] {
    const url = `${this.apiBase}/list/${this.listId}/task?archived=false&include_closed=false&subtasks=true`;
    const result = this.fetcher(url, {
      method: "GET",
      headers: this.headers(),
    });
    if (!result.ok || !result.json) return [];
    try {
      const data = result.json as ClickUpTaskListResponse;
      if (!Array.isArray(data.tasks)) return [];
      return data.tasks.map(taskToTodoItem);
    } catch {
      return [];
    }
  }

  /** Read a single task by ID (format: "CKU-<id>" or plain id string). */
  read(id: string): TodoItem | undefined {
    const taskId = id.replace(/^CKU-/, "");
    const url = `${this.apiBase}/task/${taskId}?include_subtasks=true`;
    const result = this.fetcher(url, {
      method: "GET",
      headers: this.headers(),
    });
    if (!result.ok || !result.json) return undefined;
    try {
      const task = result.json as ClickUpTask;
      return taskToTodoItem(task);
    } catch {
      return undefined;
    }
  }

  /** Close a task by setting its status to "closed". Idempotent. */
  markDone(id: string): boolean {
    const taskId = id.replace(/^CKU-/, "");
    const url = `${this.apiBase}/task/${taskId}`;
    const result = this.fetcher(url, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify({ status: "closed" }),
    });
    return result.ok;
  }

  /** Add a status tag to a task. Returns true on success. */
  addStatusLabel(id: string, label: string): boolean {
    const taskId = id.replace(/^CKU-/, "");
    // ClickUp tags are added via POST /task/{task_id}/tag/{tag_name}
    const tagName = label.replace(/:/g, "-"); // ClickUp tags can't contain colons
    const url = `${this.apiBase}/task/${taskId}/tag/${encodeURIComponent(tagName)}`;
    const result = this.fetcher(url, {
      method: "POST",
      headers: this.headers(),
    });
    return result.ok;
  }

  /**
   * Remove a status tag from a task.
   * Idempotent — returns true even if the tag doesn't exist on the task.
   */
  removeStatusLabel(id: string, label: string): boolean {
    const taskId = id.replace(/^CKU-/, "");
    const tagName = label.replace(/:/g, "-");
    const url = `${this.apiBase}/task/${taskId}/tag/${encodeURIComponent(tagName)}`;
    this.fetcher(url, {
      method: "DELETE",
      headers: this.headers(),
    });
    // Always return true — missing tag is not an error condition
    return true;
  }

  /** Remove all known status tags from a task. */
  removeAllStatusLabels(id: string): void {
    for (const tag of STATUS_TAGS) {
      this.removeStatusLabel(id, tag);
    }
  }
}

/**
 * Resolve ClickUp configuration from environment and config file.
 * Returns { apiToken, listId } or null if not configured.
 *
 * Resolution order:
 * - API token: CLICKUP_API_TOKEN env var (required)
 * - List ID: --clickup-list flag → CLICKUP_LIST_ID config key → null
 */
export function resolveClickUpConfig(
  flagListId: string | undefined,
  configGetter: (key: string) => string | undefined,
): { apiToken: string; listId: string } | null {
  const apiToken = process.env.CLICKUP_API_TOKEN;
  if (!apiToken) return null;

  const listId = flagListId ?? configGetter("CLICKUP_LIST_ID");
  if (!listId) return null;

  return { apiToken, listId };
}

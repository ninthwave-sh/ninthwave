// PagerDuty backend: reads incidents from PagerDuty via REST API v2
// and maps them to TodoItem shape. Supports resolving incidents and syncing status via notes.

import type { TodoItem, Priority, TaskBackend, StatusSync } from "../types.ts";
import type { HttpFetcher } from "./clickup.ts";

export type { HttpFetcher } from "./clickup.ts";

/** Raw shape returned by PagerDuty REST API v2 GET /incidents */
export interface PagerDutyIncident {
  id: string;
  incident_number: number;
  title: string;
  description: string | null;
  urgency: "high" | "low";
  status: "triggered" | "acknowledged" | "resolved";
  is_suppressed?: boolean;
  priority: { name: string } | null;
  service: { summary: string } | null;
  first_trigger_log_entry?: {
    channel?: {
      details?: string;
      body?: string;
      custom_details?: Record<string, unknown>;
    };
  };
  alerts?: Array<{
    body?: {
      details?: string;
      custom_details?: Record<string, unknown>;
    };
  }>;
}

/** Raw shape returned by PagerDuty REST API v2 GET /incidents (list) */
export interface PagerDutyIncidentListResponse {
  incidents: PagerDutyIncident[];
}

/** Raw shape returned by PagerDuty REST API v2 GET /incidents/{id} (single) */
export interface PagerDutyIncidentResponse {
  incident: PagerDutyIncident;
}

/**
 * Map PagerDuty urgency + priority to a ninthwave Priority.
 *
 * - urgency "high" + priority name containing "P1"/"SEV1" -> critical
 * - urgency "high" -> high
 * - urgency "low" -> medium
 * - suppressed incidents -> low
 */
export function mapPagerDutyPriority(incident: {
  urgency: string;
  is_suppressed?: boolean;
  priority: { name: string } | null;
}): Priority {
  if (incident.is_suppressed) return "low";

  if (incident.urgency === "high") {
    const priorityName = incident.priority?.name?.toUpperCase() ?? "";
    if (priorityName.includes("P1") || priorityName.includes("SEV1")) {
      return "critical";
    }
    return "high";
  }

  if (incident.urgency === "low") return "medium";

  // Fallback for unknown urgency values
  return "medium";
}

/** Extract file paths from a string (stack traces, alert details, etc.). */
function extractFilePaths(text: string): string[] {
  // Match common file path patterns in stack traces
  const pathPattern =
    /(?:\/[\w.-]+)+\.(?:ts|tsx|js|jsx|py|go|rs|rb|java|kt|swift|ex|exs)\b/g;
  const matches = text.match(pathPattern);
  if (!matches) return [];
  // Deduplicate
  return [...new Set(matches)];
}

/** Build rawText from incident description and first alert body. */
function buildRawText(incident: PagerDutyIncident): string {
  const parts: string[] = [];

  if (incident.description) {
    parts.push(incident.description);
  }

  // Use first alert body if available
  const firstAlert = incident.alerts?.[0];
  if (firstAlert?.body?.details) {
    parts.push(firstAlert.body.details);
  } else if (firstAlert?.body?.custom_details) {
    parts.push(JSON.stringify(firstAlert.body.custom_details, null, 2));
  }

  return parts.join("\n\n");
}

/** Extract file paths from alert custom_details. */
function extractFilePathsFromIncident(incident: PagerDutyIncident): string[] {
  const allText: string[] = [];

  if (incident.description) allText.push(incident.description);

  for (const alert of incident.alerts ?? []) {
    if (alert.body?.details) allText.push(alert.body.details);
    if (alert.body?.custom_details) {
      allText.push(JSON.stringify(alert.body.custom_details));
    }
  }

  return extractFilePaths(allText.join("\n"));
}

/** Convert a PagerDuty incident to a TodoItem. */
export function incidentToTodoItem(incident: PagerDutyIncident): TodoItem {
  return {
    id: `PGD-${incident.incident_number}`,
    priority: mapPagerDutyPriority(incident),
    title: incident.title ?? "",
    domain: incident.service?.summary ?? "uncategorized",
    dependencies: [],
    bundleWith: [],
    status: "open",
    filePath: "",
    repoAlias: "",
    rawText: buildRawText(incident),
    filePaths: extractFilePathsFromIncident(incident),
    testPlan: "",
    bootstrap: false,
  };
}

/** Default PagerDuty API base URL. */
const PAGERDUTY_API_BASE = "https://api.pagerduty.com";

/**
 * Synchronous HTTP fetch wrapper using Bun.spawnSync + curl.
 * Same pattern as the ClickUp adapter — blocking is acceptable in CLI context.
 */
function syncFetch(
  url: string,
  options: { method: string; headers: Record<string, string>; body?: string },
): { ok: boolean; status: number; json: unknown } {
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

export class PagerDutyBackend implements TaskBackend, StatusSync {
  private apiBase: string;

  constructor(
    private apiToken: string,
    private fromEmail: string,
    private fetcher: HttpFetcher = syncFetch,
    private serviceId?: string,
    apiBase?: string,
  ) {
    this.apiBase = apiBase ?? PAGERDUTY_API_BASE;
  }

  /** Build standard headers for PagerDuty API v2 requests. */
  private headers(includeFrom: boolean = false): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Token token=${this.apiToken}`,
      "Content-Type": "application/json",
    };
    if (includeFrom) {
      h["From"] = this.fromEmail;
    }
    return h;
  }

  /** List active (triggered + acknowledged) incidents. */
  list(): TodoItem[] {
    let url = `${this.apiBase}/incidents?statuses[]=triggered&statuses[]=acknowledged`;
    if (this.serviceId) {
      url += `&service_ids[]=${this.serviceId}`;
    }
    const result = this.fetcher(url, {
      method: "GET",
      headers: this.headers(),
    });
    if (!result.ok || !result.json) return [];
    try {
      const data = result.json as PagerDutyIncidentListResponse;
      if (!Array.isArray(data.incidents)) return [];
      return data.incidents.map(incidentToTodoItem);
    } catch {
      return [];
    }
  }

  /** Read a single incident by ID (format: "PGD-<number>" or plain id string). */
  read(id: string): TodoItem | undefined {
    const incidentId = id.replace(/^PGD-/, "");
    const url = `${this.apiBase}/incidents/${incidentId}`;
    const result = this.fetcher(url, {
      method: "GET",
      headers: this.headers(),
    });
    if (!result.ok || !result.json) return undefined;
    try {
      const data = result.json as PagerDutyIncidentResponse;
      if (!data.incident) return undefined;
      return incidentToTodoItem(data.incident);
    } catch {
      return undefined;
    }
  }

  /**
   * Resolve an incident via PUT /incidents.
   * PagerDuty requires the From header for write operations.
   */
  markDone(id: string): boolean {
    const incidentId = id.replace(/^PGD-/, "");
    const url = `${this.apiBase}/incidents`;
    const result = this.fetcher(url, {
      method: "PUT",
      headers: this.headers(true),
      body: JSON.stringify({
        incidents: [
          {
            id: incidentId,
            type: "incident_reference",
            status: "resolved",
          },
        ],
      }),
    });
    return result.ok;
  }

  /** Add a status label as an incident note. */
  addStatusLabel(id: string, label: string): boolean {
    const incidentId = id.replace(/^PGD-/, "");
    const url = `${this.apiBase}/incidents/${incidentId}/notes`;
    const result = this.fetcher(url, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({
        note: {
          content: label,
        },
      }),
    });
    return result.ok;
  }

  /**
   * Remove a status label from an incident.
   * No-op — PagerDuty notes are append-only. Returns true for idempotency.
   */
  removeStatusLabel(_id: string, _label: string): boolean {
    return true;
  }
}

/**
 * Resolve PagerDuty configuration from environment and config file.
 * Returns config object or null if required values are not configured.
 *
 * Resolution order:
 * - API token: PAGERDUTY_API_TOKEN env var (required)
 * - Service ID: PAGERDUTY_SERVICE_ID env var -> pagerduty_service_id config key -> undefined (optional)
 * - From email: PAGERDUTY_FROM_EMAIL env var -> pagerduty_from_email config key (required)
 */
export function resolvePagerDutyConfig(
  configGetter: (key: string) => string | undefined,
): { apiToken: string; serviceId: string | undefined; fromEmail: string } | null {
  const apiToken = process.env.PAGERDUTY_API_TOKEN;
  if (!apiToken) return null;

  const fromEmail =
    process.env.PAGERDUTY_FROM_EMAIL ?? configGetter("pagerduty_from_email");
  if (!fromEmail) return null;

  const serviceId =
    process.env.PAGERDUTY_SERVICE_ID ?? configGetter("pagerduty_service_id");

  return { apiToken, serviceId, fromEmail };
}

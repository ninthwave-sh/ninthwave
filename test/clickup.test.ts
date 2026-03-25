// Tests for core/backends/clickup.ts
// Uses dependency injection (not vi.mock/vi.spyOn) to avoid Bun runtime dependency.

import { describe, it, expect, afterEach } from "vitest";
import {
  mapClickUpPriority,
  taskToTodoItem,
  ClickUpBackend,
  resolveClickUpConfig,
  STATUS_TAGS,
} from "../core/backends/clickup.ts";
import type {
  ClickUpTask,
  ClickUpTaskListResponse,
  HttpFetcher,
} from "../core/backends/clickup.ts";

/** Create a mock HttpFetcher that returns a fixed result. */
function mockFetcher(result: {
  ok: boolean;
  status: number;
  json: unknown;
}): HttpFetcher {
  return (_url, _options) => result;
}

/** Create a mock HttpFetcher that captures calls and returns a fixed result. */
function spyFetcher(result: {
  ok: boolean;
  status: number;
  json: unknown;
}): {
  fetcher: HttpFetcher;
  calls: Array<{
    url: string;
    options: { method: string; headers: Record<string, string>; body?: string };
  }>;
} {
  const calls: Array<{
    url: string;
    options: { method: string; headers: Record<string, string>; body?: string };
  }> = [];
  const fetcher: HttpFetcher = (url, options) => {
    calls.push({ url, options });
    return result;
  };
  return { fetcher, calls };
}

/** Create a sample ClickUp task for testing. */
function sampleTask(overrides: Partial<ClickUpTask> = {}): ClickUpTask {
  return {
    id: "abc123",
    name: "Implement feature X",
    description: "Details about feature X",
    status: { status: "open" },
    priority: { id: "2", priority: "high" },
    list: { name: "Sprint 1" },
    tags: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// mapClickUpPriority
// ---------------------------------------------------------------------------
describe("mapClickUpPriority", () => {
  it("maps priority id 1 to critical", () => {
    expect(mapClickUpPriority({ id: "1", priority: "urgent" })).toBe(
      "critical",
    );
  });

  it("maps priority id 2 to high", () => {
    expect(mapClickUpPriority({ id: "2", priority: "high" })).toBe("high");
  });

  it("maps priority id 3 to medium", () => {
    expect(mapClickUpPriority({ id: "3", priority: "normal" })).toBe("medium");
  });

  it("maps priority id 4 to low", () => {
    expect(mapClickUpPriority({ id: "4", priority: "low" })).toBe("low");
  });

  it("defaults to medium for null priority", () => {
    expect(mapClickUpPriority(null)).toBe("medium");
  });

  it("defaults to medium for unknown priority id", () => {
    expect(mapClickUpPriority({ id: "99", priority: "unknown" })).toBe(
      "medium",
    );
  });
});

// ---------------------------------------------------------------------------
// taskToTodoItem
// ---------------------------------------------------------------------------
describe("taskToTodoItem", () => {
  it("converts a full ClickUp task to TodoItem shape", () => {
    const task = sampleTask();
    const item = taskToTodoItem(task);

    expect(item.id).toBe("CKU-abc123");
    expect(item.title).toBe("Implement feature X");
    expect(item.priority).toBe("high");
    expect(item.domain).toBe("Sprint 1");
    expect(item.rawText).toBe("Details about feature X");
    expect(item.dependencies).toEqual([]);
    expect(item.bundleWith).toEqual([]);
    expect(item.status).toBe("open");
    expect(item.filePath).toBe("");
    expect(item.repoAlias).toBe("");
  });

  it("handles task with no list (uncategorized domain)", () => {
    const task = sampleTask({ list: null });
    const item = taskToTodoItem(task);
    expect(item.domain).toBe("uncategorized");
  });

  it("handles task with null priority", () => {
    const task = sampleTask({ priority: null });
    const item = taskToTodoItem(task);
    expect(item.priority).toBe("medium");
  });

  it("handles task with empty description", () => {
    const task = sampleTask({ description: "" });
    const item = taskToTodoItem(task);
    expect(item.rawText).toBe("");
  });

  it("extracts dependencies from subtasks with ninthwave-style IDs", () => {
    const task = sampleTask({
      subtasks: [
        { id: "sub1", name: "Depends on H-BF5-1" },
        { id: "sub2", name: "Regular subtask" },
        { id: "sub3", name: "Also needs M-CKU-2 done" },
      ],
    });
    const item = taskToTodoItem(task);
    expect(item.dependencies).toEqual(["H-BF5-1", "M-CKU-2"]);
  });

  it("handles task with no subtasks", () => {
    const task = sampleTask({ subtasks: undefined });
    const item = taskToTodoItem(task);
    expect(item.dependencies).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ClickUpBackend.list
// ---------------------------------------------------------------------------
describe("ClickUpBackend.list", () => {
  it("returns TodoItems from ClickUp API response", () => {
    const tasks: ClickUpTask[] = [
      sampleTask({ id: "t1", name: "First task" }),
      sampleTask({
        id: "t2",
        name: "Second task",
        priority: { id: "4", priority: "low" },
        list: null,
      }),
    ];
    const response: ClickUpTaskListResponse = { tasks };

    const fetcher = mockFetcher({ ok: true, status: 200, json: response });
    const backend = new ClickUpBackend(
      "list123",
      "pk_token",
      fetcher,
      "https://api.test",
    );
    const items = backend.list();

    expect(items).toHaveLength(2);
    expect(items[0].id).toBe("CKU-t1");
    expect(items[0].title).toBe("First task");
    expect(items[0].priority).toBe("high");
    expect(items[1].id).toBe("CKU-t2");
    expect(items[1].priority).toBe("low");
    expect(items[1].domain).toBe("uncategorized");
  });

  it("passes correct URL with list ID and query params", () => {
    const { fetcher, calls } = spyFetcher({
      ok: true,
      status: 200,
      json: { tasks: [] },
    });

    const backend = new ClickUpBackend(
      "list456",
      "pk_token",
      fetcher,
      "https://api.test",
    );
    backend.list();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      "https://api.test/list/list456/task?archived=false&include_closed=false&subtasks=true",
    );
    expect(calls[0].options.method).toBe("GET");
    expect(calls[0].options.headers.Authorization).toBe("pk_token");
    expect(calls[0].options.headers["Content-Type"]).toBe("application/json");
  });

  it("returns empty array when API call fails", () => {
    const fetcher = mockFetcher({
      ok: false,
      status: 401,
      json: { err: "unauthorized" },
    });
    const backend = new ClickUpBackend(
      "list123",
      "bad_token",
      fetcher,
      "https://api.test",
    );
    const items = backend.list();
    expect(items).toEqual([]);
  });

  it("returns empty array when response has no tasks array", () => {
    const fetcher = mockFetcher({ ok: true, status: 200, json: {} });
    const backend = new ClickUpBackend(
      "list123",
      "pk_token",
      fetcher,
      "https://api.test",
    );
    const items = backend.list();
    expect(items).toEqual([]);
  });

  it("returns empty array when json is null", () => {
    const fetcher = mockFetcher({ ok: true, status: 200, json: null });
    const backend = new ClickUpBackend(
      "list123",
      "pk_token",
      fetcher,
      "https://api.test",
    );
    const items = backend.list();
    expect(items).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ClickUpBackend.read
// ---------------------------------------------------------------------------
describe("ClickUpBackend.read", () => {
  it("reads a single task by CKU-N format", () => {
    const task = sampleTask({ id: "task789" });
    const { fetcher, calls } = spyFetcher({
      ok: true,
      status: 200,
      json: task,
    });

    const backend = new ClickUpBackend(
      "list123",
      "pk_token",
      fetcher,
      "https://api.test",
    );
    const item = backend.read("CKU-task789");

    expect(item).toBeDefined();
    expect(item!.id).toBe("CKU-task789");
    expect(item!.title).toBe("Implement feature X");

    // Verify the CKU- prefix was stripped for the API call
    expect(calls[0].url).toBe(
      "https://api.test/task/task789?include_subtasks=true",
    );
  });

  it("reads a single task by plain id string", () => {
    const task = sampleTask({ id: "plain123" });
    const fetcher = mockFetcher({ ok: true, status: 200, json: task });

    const backend = new ClickUpBackend(
      "list123",
      "pk_token",
      fetcher,
      "https://api.test",
    );
    const item = backend.read("plain123");

    expect(item).toBeDefined();
    expect(item!.id).toBe("CKU-plain123");
  });

  it("returns undefined when task not found", () => {
    const fetcher = mockFetcher({
      ok: false,
      status: 404,
      json: { err: "not found" },
    });
    const backend = new ClickUpBackend(
      "list123",
      "pk_token",
      fetcher,
      "https://api.test",
    );
    const item = backend.read("CKU-missing");
    expect(item).toBeUndefined();
  });

  it("returns undefined when json is null", () => {
    const fetcher = mockFetcher({ ok: true, status: 200, json: null });
    const backend = new ClickUpBackend(
      "list123",
      "pk_token",
      fetcher,
      "https://api.test",
    );
    const item = backend.read("CKU-x");
    expect(item).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ClickUpBackend.markDone
// ---------------------------------------------------------------------------
describe("ClickUpBackend.markDone", () => {
  it("sends PUT with status=closed to correct task URL", () => {
    const { fetcher, calls } = spyFetcher({
      ok: true,
      status: 200,
      json: {},
    });
    const backend = new ClickUpBackend(
      "list123",
      "pk_token",
      fetcher,
      "https://api.test",
    );

    const result = backend.markDone("CKU-task42");

    expect(result).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.test/task/task42");
    expect(calls[0].options.method).toBe("PUT");
    expect(calls[0].options.body).toBe(JSON.stringify({ status: "closed" }));
  });

  it("strips CKU- prefix from id", () => {
    const { fetcher, calls } = spyFetcher({
      ok: true,
      status: 200,
      json: {},
    });
    const backend = new ClickUpBackend(
      "list123",
      "pk_token",
      fetcher,
      "https://api.test",
    );

    backend.markDone("CKU-abc");
    expect(calls[0].url).toBe("https://api.test/task/abc");
  });

  it("accepts plain id string", () => {
    const { fetcher, calls } = spyFetcher({
      ok: true,
      status: 200,
      json: {},
    });
    const backend = new ClickUpBackend(
      "list123",
      "pk_token",
      fetcher,
      "https://api.test",
    );

    backend.markDone("plain456");
    expect(calls[0].url).toBe("https://api.test/task/plain456");
  });

  it("returns false when API call fails", () => {
    const fetcher = mockFetcher({
      ok: false,
      status: 500,
      json: { err: "server error" },
    });
    const backend = new ClickUpBackend(
      "list123",
      "pk_token",
      fetcher,
      "https://api.test",
    );
    expect(backend.markDone("CKU-x")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ClickUpBackend.addStatusLabel
// ---------------------------------------------------------------------------
describe("ClickUpBackend.addStatusLabel", () => {
  it("POSTs tag to correct task URL with colon replaced by hyphen", () => {
    const { fetcher, calls } = spyFetcher({
      ok: true,
      status: 200,
      json: {},
    });
    const backend = new ClickUpBackend(
      "list123",
      "pk_token",
      fetcher,
      "https://api.test",
    );

    const result = backend.addStatusLabel(
      "CKU-task10",
      "status:in-progress",
    );

    expect(result).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      "https://api.test/task/task10/tag/status-in-progress",
    );
    expect(calls[0].options.method).toBe("POST");
  });

  it("returns false when API call fails", () => {
    const fetcher = mockFetcher({
      ok: false,
      status: 400,
      json: { err: "bad request" },
    });
    const backend = new ClickUpBackend(
      "list123",
      "pk_token",
      fetcher,
      "https://api.test",
    );
    expect(
      backend.addStatusLabel("CKU-x", "status:pr-open"),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ClickUpBackend.removeStatusLabel
// ---------------------------------------------------------------------------
describe("ClickUpBackend.removeStatusLabel", () => {
  it("DELETEs tag from correct task URL with colon replaced by hyphen", () => {
    const { fetcher, calls } = spyFetcher({
      ok: true,
      status: 200,
      json: {},
    });
    const backend = new ClickUpBackend(
      "list123",
      "pk_token",
      fetcher,
      "https://api.test",
    );

    const result = backend.removeStatusLabel(
      "CKU-task10",
      "status:in-progress",
    );

    expect(result).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      "https://api.test/task/task10/tag/status-in-progress",
    );
    expect(calls[0].options.method).toBe("DELETE");
  });

  it("returns true even when tag does not exist (graceful skip)", () => {
    const fetcher = mockFetcher({
      ok: false,
      status: 404,
      json: { err: "tag not found" },
    });
    const backend = new ClickUpBackend(
      "list123",
      "pk_token",
      fetcher,
      "https://api.test",
    );
    expect(
      backend.removeStatusLabel("CKU-x", "status:nonexistent"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ClickUpBackend.removeAllStatusLabels
// ---------------------------------------------------------------------------
describe("ClickUpBackend.removeAllStatusLabels", () => {
  it("removes all known status tags", () => {
    const { fetcher, calls } = spyFetcher({
      ok: true,
      status: 200,
      json: {},
    });
    const backend = new ClickUpBackend(
      "list123",
      "pk_token",
      fetcher,
      "https://api.test",
    );

    backend.removeAllStatusLabels("CKU-task8");

    expect(calls).toHaveLength(STATUS_TAGS.length);
    for (let i = 0; i < STATUS_TAGS.length; i++) {
      const tagName = STATUS_TAGS[i].replace(/:/g, "-");
      expect(calls[i].url).toBe(
        `https://api.test/task/task8/tag/${tagName}`,
      );
      expect(calls[i].options.method).toBe("DELETE");
    }
  });
});

// ---------------------------------------------------------------------------
// STATUS_TAGS constant
// ---------------------------------------------------------------------------
describe("STATUS_TAGS", () => {
  it("includes expected tags", () => {
    expect(STATUS_TAGS).toContain("ninthwave:in-progress");
    expect(STATUS_TAGS).toContain("ninthwave:pr-open");
  });
});

// ---------------------------------------------------------------------------
// resolveClickUpConfig
// ---------------------------------------------------------------------------
describe("resolveClickUpConfig", () => {
  const originalEnv = process.env.CLICKUP_API_TOKEN;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CLICKUP_API_TOKEN = originalEnv;
    } else {
      delete process.env.CLICKUP_API_TOKEN;
    }
  });

  it("returns config when both API token and flag list ID are set", () => {
    process.env.CLICKUP_API_TOKEN = "pk_test_token";
    const result = resolveClickUpConfig("list123", () => undefined);

    expect(result).toEqual({ apiToken: "pk_test_token", listId: "list123" });
  });

  it("falls back to config getter for list ID when flag is undefined", () => {
    process.env.CLICKUP_API_TOKEN = "pk_test_token";
    const result = resolveClickUpConfig(undefined, (key) =>
      key === "CLICKUP_LIST_ID" ? "config_list" : undefined,
    );

    expect(result).toEqual({
      apiToken: "pk_test_token",
      listId: "config_list",
    });
  });

  it("prefers flag list ID over config", () => {
    process.env.CLICKUP_API_TOKEN = "pk_test_token";
    const result = resolveClickUpConfig("flag_list", (key) =>
      key === "CLICKUP_LIST_ID" ? "config_list" : undefined,
    );

    expect(result).toEqual({ apiToken: "pk_test_token", listId: "flag_list" });
  });

  it("returns null when API token is not set", () => {
    delete process.env.CLICKUP_API_TOKEN;
    const result = resolveClickUpConfig("list123", () => undefined);
    expect(result).toBeNull();
  });

  it("returns null when list ID is not available from either source", () => {
    process.env.CLICKUP_API_TOKEN = "pk_test_token";
    const result = resolveClickUpConfig(undefined, () => undefined);
    expect(result).toBeNull();
  });
});

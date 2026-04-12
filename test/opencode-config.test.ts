// Tests for core/opencode-config.ts -- managed .opencode/opencode.jsonc seeding.

import { describe, it, expect, afterEach } from "vitest";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { setupTempRepo, cleanupTempRepos } from "./helpers.ts";
import {
  NINTHWAVE_OPENCODE_AGENT_NAMES,
  NINTHWAVE_OPENCODE_ALLOW_ALL_PERMISSION,
  seedOpencodeConfig,
  stripJsoncComments,
} from "../core/opencode-config.ts";

afterEach(() => {
  cleanupTempRepos();
});

function readConfig(projectDir: string): unknown {
  const path = join(projectDir, ".opencode", "opencode.jsonc");
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(stripJsoncComments(raw));
}

describe("stripJsoncComments", () => {
  it("strips // line comments", () => {
    const input = `{\n  // this is a line comment\n  "a": 1 // trailing\n}`;
    const out = stripJsoncComments(input);
    expect(out).not.toContain("line comment");
    expect(out).not.toContain("trailing");
    expect(JSON.parse(out)).toEqual({ a: 1 });
  });

  it("strips /* block */ comments", () => {
    const input = `{\n  /* block\n     comment */\n  "a": 1\n}`;
    const out = stripJsoncComments(input);
    expect(out).not.toContain("block");
    expect(JSON.parse(out)).toEqual({ a: 1 });
  });

  it("preserves // inside string values", () => {
    const input = `{ "url": "https://example.com/path" }`;
    const out = stripJsoncComments(input);
    expect(JSON.parse(out)).toEqual({ url: "https://example.com/path" });
  });

  it("handles escaped quotes inside strings", () => {
    const input = `{ "s": "a \\"quoted\\" // not a comment" }`;
    const out = stripJsoncComments(input);
    expect(JSON.parse(out)).toEqual({ s: 'a "quoted" // not a comment' });
  });
});

describe("seedOpencodeConfig: fresh create", () => {
  it("creates .opencode/opencode.jsonc with all four agent keys when none exists", () => {
    const projectDir = setupTempRepo();
    const result = seedOpencodeConfig(projectDir);

    expect(result.action).toBe("created");
    expect(result.path).toBe(join(projectDir, ".opencode", "opencode.jsonc"));
    expect(existsSync(result.path)).toBe(true);

    const parsed = readConfig(projectDir) as Record<string, unknown>;
    expect(parsed["$schema"]).toBe("https://opencode.ai/config.json");
    const agent = parsed["agent"] as Record<string, unknown>;
    for (const name of NINTHWAVE_OPENCODE_AGENT_NAMES) {
      const entry = agent[name] as { permission: Record<string, string> };
      expect(entry).toBeDefined();
      expect(entry.permission).toEqual({ ...NINTHWAVE_OPENCODE_ALLOW_ALL_PERMISSION });
    }
  });

  it("includes the managed-by-ninthwave header comment", () => {
    const projectDir = setupTempRepo();
    seedOpencodeConfig(projectDir);
    const raw = readFileSync(join(projectDir, ".opencode", "opencode.jsonc"), "utf-8");
    expect(raw).toContain("Managed by ninthwave");
  });

  it("sets every known tool key to allow", () => {
    const projectDir = setupTempRepo();
    seedOpencodeConfig(projectDir);
    const parsed = readConfig(projectDir) as {
      agent: Record<string, { permission: Record<string, string> }>;
    };
    const perm = parsed.agent["ninthwave-implementer"]!.permission;
    // Spot-check the tool keys that opencode's docs most commonly prompt on.
    for (const key of ["edit", "bash", "webfetch", "websearch", "question", "task", "read"]) {
      expect(perm[key]).toBe("allow");
    }
  });

  it("creates the .opencode/ parent directory if it does not exist", () => {
    const projectDir = setupTempRepo();
    expect(existsSync(join(projectDir, ".opencode"))).toBe(false);
    seedOpencodeConfig(projectDir);
    expect(existsSync(join(projectDir, ".opencode"))).toBe(true);
  });
});

describe("seedOpencodeConfig: merge into existing file", () => {
  it("preserves unrelated top-level user keys verbatim", () => {
    const projectDir = setupTempRepo();
    mkdirSync(join(projectDir, ".opencode"), { recursive: true });
    const existing = {
      model: "anthropic/claude-sonnet-4",
      theme: "dark",
    };
    writeFileSync(
      join(projectDir, ".opencode", "opencode.jsonc"),
      JSON.stringify(existing, null, 2),
    );

    const result = seedOpencodeConfig(projectDir);
    expect(result.action).toBe("merged");

    const parsed = readConfig(projectDir) as Record<string, unknown>;
    expect(parsed["model"]).toBe("anthropic/claude-sonnet-4");
    expect(parsed["theme"]).toBe("dark");
    expect(parsed["agent"]).toBeDefined();
  });

  it("preserves sibling Agent fields on our agent names (e.g. model, prompt)", () => {
    const projectDir = setupTempRepo();
    mkdirSync(join(projectDir, ".opencode"), { recursive: true });
    const existing = {
      agent: {
        "ninthwave-implementer": {
          model: "anthropic/claude-opus-4",
          prompt: "custom prompt override",
        },
      },
    };
    writeFileSync(
      join(projectDir, ".opencode", "opencode.jsonc"),
      JSON.stringify(existing, null, 2),
    );

    seedOpencodeConfig(projectDir);

    const parsed = readConfig(projectDir) as {
      agent: Record<string, { model?: string; prompt?: string; permission: Record<string, string> }>;
    };
    const impl = parsed.agent["ninthwave-implementer"]!;
    expect(impl.model).toBe("anthropic/claude-opus-4");
    expect(impl.prompt).toBe("custom prompt override");
    expect(impl.permission.edit).toBe("allow");
    expect(impl.permission.bash).toBe("allow");
  });

  it("overrides user permission leaves that would block our agents", () => {
    const projectDir = setupTempRepo();
    mkdirSync(join(projectDir, ".opencode"), { recursive: true });
    const existing = {
      agent: {
        "ninthwave-implementer": {
          permission: {
            edit: "ask",
            bash: "deny",
            customKey: "allow",
          },
        },
      },
    };
    writeFileSync(
      join(projectDir, ".opencode", "opencode.jsonc"),
      JSON.stringify(existing, null, 2),
    );

    seedOpencodeConfig(projectDir);

    const parsed = readConfig(projectDir) as {
      agent: Record<string, { permission: Record<string, string> }>;
    };
    const perm = parsed.agent["ninthwave-implementer"]!.permission;
    expect(perm.edit).toBe("allow");
    expect(perm.bash).toBe("allow");
    // Unknown user-defined keys are preserved (catchall), not wiped.
    expect(perm["customKey"]).toBe("allow");
  });

  it("adds missing Ninthwave agents when the file has only user agents", () => {
    const projectDir = setupTempRepo();
    mkdirSync(join(projectDir, ".opencode"), { recursive: true });
    const existing = {
      agent: {
        "user-build-agent": { model: "openai/gpt-4" },
      },
    };
    writeFileSync(
      join(projectDir, ".opencode", "opencode.jsonc"),
      JSON.stringify(existing, null, 2),
    );

    seedOpencodeConfig(projectDir);

    const parsed = readConfig(projectDir) as {
      agent: Record<string, { model?: string; permission?: Record<string, string> }>;
    };
    // User agent is preserved untouched.
    expect(parsed.agent["user-build-agent"]).toEqual({ model: "openai/gpt-4" });
    // All four ninthwave agents are now present with full permissions.
    for (const name of NINTHWAVE_OPENCODE_AGENT_NAMES) {
      expect(parsed.agent[name]!.permission!.edit).toBe("allow");
    }
  });

  it("parses JSONC with comments in an existing user file", () => {
    const projectDir = setupTempRepo();
    mkdirSync(join(projectDir, ".opencode"), { recursive: true });
    writeFileSync(
      join(projectDir, ".opencode", "opencode.jsonc"),
      [
        "// user config",
        "{",
        '  "theme": "dark" // nice theme',
        "}",
      ].join("\n"),
    );

    const result = seedOpencodeConfig(projectDir);
    expect(result.action).toBe("merged");
    const parsed = readConfig(projectDir) as Record<string, unknown>;
    expect(parsed["theme"]).toBe("dark");
    expect(parsed["agent"]).toBeDefined();
  });

  it("leaves a malformed user file alone rather than clobbering it", () => {
    const projectDir = setupTempRepo();
    mkdirSync(join(projectDir, ".opencode"), { recursive: true });
    const malformed = "{ not valid json at all <<<";
    writeFileSync(join(projectDir, ".opencode", "opencode.jsonc"), malformed);

    const result = seedOpencodeConfig(projectDir);
    expect(result.action).toBe("unchanged");
    expect(readFileSync(join(projectDir, ".opencode", "opencode.jsonc"), "utf-8")).toBe(malformed);
  });
});

describe("seedOpencodeConfig: idempotency", () => {
  it("returns 'unchanged' on a second call against a file we just wrote", () => {
    const projectDir = setupTempRepo();
    const first = seedOpencodeConfig(projectDir);
    expect(first.action).toBe("created");

    const beforeSecond = readFileSync(
      join(projectDir, ".opencode", "opencode.jsonc"),
      "utf-8",
    );
    const second = seedOpencodeConfig(projectDir);
    expect(second.action).toBe("unchanged");
    const afterSecond = readFileSync(
      join(projectDir, ".opencode", "opencode.jsonc"),
      "utf-8",
    );
    expect(afterSecond).toBe(beforeSecond);
  });

  it("returns 'unchanged' when the existing file already has our permission keys", () => {
    const projectDir = setupTempRepo();
    mkdirSync(join(projectDir, ".opencode"), { recursive: true });
    const agent: Record<string, unknown> = {};
    for (const name of NINTHWAVE_OPENCODE_AGENT_NAMES) {
      agent[name] = { permission: { ...NINTHWAVE_OPENCODE_ALLOW_ALL_PERMISSION } };
    }
    writeFileSync(
      join(projectDir, ".opencode", "opencode.jsonc"),
      JSON.stringify({ $schema: "https://opencode.ai/config.json", agent }, null, 2),
    );

    const result = seedOpencodeConfig(projectDir);
    expect(result.action).toBe("unchanged");
  });
});

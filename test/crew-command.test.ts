// Tests for core/commands/crew.ts -- status/create/join/disconnect subcommands,
// CLI registration, and helper `removeLocalBrokerSecret`.

import { describe, it, expect, afterEach } from "vitest";
import { join } from "path";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";

import {
  cmdCrew,
  removeLocalBrokerSecret,
  type CrewDeps,
} from "../core/commands/crew.ts";
import { lookupCommand } from "../core/help.ts";
import { loadConfig, loadLocalConfig, saveLocalConfig } from "../core/config.ts";
import { setupTempRepo, cleanupTempRepos } from "./helpers.ts";

afterEach(() => {
  cleanupTempRepos();
});

// ── Helpers ────────────────────────────────────────────────────────

/**
 * A valid 32-byte base64 broker secret. Deterministic so assertions in this
 * file can compare against it directly.
 */
const VALID_SECRET_A = Buffer.alloc(32, 7).toString("base64");
const VALID_SECRET_B = Buffer.alloc(32, 42).toString("base64");

function makeLog(): { log: (...args: unknown[]) => void; text: () => string; lines: () => string[] } {
  const captured: string[] = [];
  return {
    log: (...args: unknown[]) => {
      captured.push(args.map(String).join(" "));
    },
    text: () => captured.join("\n"),
    lines: () => captured.slice(),
  };
}

function seedBrokerSecret(projectRoot: string, secret: string): void {
  mkdirSync(join(projectRoot, ".ninthwave"), { recursive: true });
  saveLocalConfig(projectRoot, { broker_secret: secret });
}

// ── CLI registration ───────────────────────────────────────────────

describe("crew command registration", () => {
  it("is registered in COMMAND_REGISTRY", () => {
    const entry = lookupCommand("crew");
    expect(entry).toBeDefined();
    expect(entry!.name).toBe("crew");
  });

  it("is in the advanced group", () => {
    const entry = lookupCommand("crew")!;
    expect(entry.group).toBe("advanced");
  });

  it("needs project root but not work dir", () => {
    const entry = lookupCommand("crew")!;
    expect(entry.needsRoot).toBe(true);
    expect(entry.needsWork).toBe(false);
  });

  it("has examples covering every subcommand", () => {
    const entry = lookupCommand("crew")!;
    const examples = entry.examples.join("\n");
    expect(examples).toContain("nw crew");
    expect(examples).toContain("nw crew create");
    expect(examples).toContain("nw crew join");
    expect(examples).toContain("nw crew disconnect");
  });

  it("usage starts with command name", () => {
    const entry = lookupCommand("crew")!;
    expect(entry.usage.startsWith("crew")).toBe(true);
  });
});

// ── Dispatch ───────────────────────────────────────────────────────

describe("cmdCrew dispatch", () => {
  it("routes no args to status", async () => {
    const repo = setupTempRepo();
    const captured = makeLog();
    await cmdCrew([], repo, { log: captured.log });
    expect(captured.text()).toContain("Crew:");
    expect(captured.text()).toContain("not configured");
  });

  it("routes `status` to status", async () => {
    const repo = setupTempRepo();
    const captured = makeLog();
    await cmdCrew(["status"], repo, { log: captured.log });
    expect(captured.text()).toContain("Crew:");
  });

  it("errors on unknown subcommand", async () => {
    const repo = setupTempRepo();
    const captured = makeLog();
    const origExit = process.exit;
    const origErr = console.error;
    let exitCode: number | undefined;
    const errors: string[] = [];
    (process as unknown as { exit: (code?: number) => never }).exit = ((code?: number) => {
      exitCode = code;
      throw new Error("__exit__");
    }) as typeof process.exit;
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    };
    try {
      await expect(
        cmdCrew(["bogus"], repo, { log: captured.log }),
      ).rejects.toThrow("__exit__");
    } finally {
      (process as unknown as { exit: typeof origExit }).exit = origExit;
      console.error = origErr;
    }
    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toContain("Unknown crew subcommand");
  });
});

// ── Subcommand: status ─────────────────────────────────────────────

describe("crew status", () => {
  it("reports not configured when no secret exists", async () => {
    const repo = setupTempRepo();
    const captured = makeLog();
    await cmdCrew(["status"], repo, { log: captured.log });
    expect(captured.text()).toContain("not configured");
    expect(captured.text()).toContain("nw crew create");
  });

  it("reports configured when a local broker_secret is present", async () => {
    const repo = setupTempRepo();
    seedBrokerSecret(repo, VALID_SECRET_A);
    const captured = makeLog();
    await cmdCrew(["status"], repo, { log: captured.log });
    const text = captured.text();
    expect(text).toContain("configured");
    expect(text).not.toContain("not configured");
    expect(text).toContain("secret present");
  });

  it("shows the default broker URL when crew_url is unset", async () => {
    const repo = setupTempRepo();
    seedBrokerSecret(repo, VALID_SECRET_A);
    const captured = makeLog();
    await cmdCrew(["status"], repo, { log: captured.log });
    expect(captured.text()).toContain("wss://ninthwave.sh");
    expect(captured.text()).toContain("default");
  });

  it("shows a custom crew_url when configured in the shared config", async () => {
    const repo = setupTempRepo();
    seedBrokerSecret(repo, VALID_SECRET_A);
    mkdirSync(join(repo, ".ninthwave"), { recursive: true });
    writeFileSync(
      join(repo, ".ninthwave", "config.json"),
      JSON.stringify({ crew_url: "wss://broker.example.com" }),
    );
    const captured = makeLog();
    await cmdCrew(["status"], repo, { log: captured.log });
    const text = captured.text();
    expect(text).toContain("wss://broker.example.com");
    expect(text).not.toContain("(default)");
  });

  it("treats a secret in the shared config as configured", async () => {
    const repo = setupTempRepo();
    mkdirSync(join(repo, ".ninthwave"), { recursive: true });
    writeFileSync(
      join(repo, ".ninthwave", "config.json"),
      JSON.stringify({ broker_secret: VALID_SECRET_A }),
    );
    const captured = makeLog();
    await cmdCrew(["status"], repo, { log: captured.log });
    expect(captured.text()).toContain("configured");
  });
});

// ── Subcommand: create ─────────────────────────────────────────────

describe("crew create", () => {
  it("generates a secret, writes it to config.local.json, and displays it", async () => {
    const repo = setupTempRepo();
    const captured = makeLog();
    const deps: CrewDeps = {
      log: captured.log,
      generateProjectIdentity: () => ({
        project_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        broker_secret: VALID_SECRET_A,
      }),
      // Never prompt on the happy path; fail loudly if it tries.
      confirmPrompt: async () => {
        throw new Error("confirmPrompt should not be called when no secret exists");
      },
    };
    await cmdCrew(["create"], repo, deps);

    const local = loadLocalConfig(repo);
    expect(local.broker_secret).toBe(VALID_SECRET_A);

    const text = captured.text();
    expect(text).toContain("Broker secret created");
    expect(text).toContain(VALID_SECRET_A);
    expect(text).toContain("config.local.json");
    expect(text).toContain("Share this with teammates");
  });

  it("warns and asks before overwriting an existing secret", async () => {
    const repo = setupTempRepo();
    seedBrokerSecret(repo, VALID_SECRET_A);
    const captured = makeLog();
    const prompts: string[] = [];
    const deps: CrewDeps = {
      log: captured.log,
      generateProjectIdentity: () => ({
        project_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        broker_secret: VALID_SECRET_B,
      }),
      confirmPrompt: async (msg) => {
        prompts.push(msg);
        return true;
      },
    };
    await cmdCrew(["create"], repo, deps);

    expect(prompts.length).toBe(1);
    expect(prompts[0]).toContain("Overwrite");

    const local = loadLocalConfig(repo);
    expect(local.broker_secret).toBe(VALID_SECRET_B);

    const text = captured.text();
    expect(text).toContain("already exists");
    expect(text).toContain(VALID_SECRET_B);
  });

  it("aborts without writing when user declines the overwrite prompt", async () => {
    const repo = setupTempRepo();
    seedBrokerSecret(repo, VALID_SECRET_A);
    const captured = makeLog();
    let generated = false;
    const deps: CrewDeps = {
      log: captured.log,
      generateProjectIdentity: () => {
        generated = true;
        return {
          project_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          broker_secret: VALID_SECRET_B,
        };
      },
      confirmPrompt: async () => false,
    };
    await cmdCrew(["create"], repo, deps);

    expect(generated).toBe(false);
    const local = loadLocalConfig(repo);
    expect(local.broker_secret).toBe(VALID_SECRET_A);
    expect(captured.text()).toContain("Aborted");
  });
});

// ── Subcommand: join ───────────────────────────────────────────────

describe("crew join", () => {
  it("validates and saves a pasted secret when none is present", async () => {
    const repo = setupTempRepo();
    const captured = makeLog();
    const deps: CrewDeps = {
      log: captured.log,
      confirmPrompt: async () => {
        throw new Error("confirmPrompt should not be called when no secret exists");
      },
    };
    await cmdCrew(["join", VALID_SECRET_A], repo, deps);

    const local = loadLocalConfig(repo);
    expect(local.broker_secret).toBe(VALID_SECRET_A);
    expect(captured.text()).toContain("Joined crew");
  });

  it("rejects an invalid secret before touching config", async () => {
    const repo = setupTempRepo();
    const captured = makeLog();
    const origExit = process.exit;
    const origErr = console.error;
    let exitCode: number | undefined;
    const errors: string[] = [];
    (process as unknown as { exit: (code?: number) => never }).exit = ((code?: number) => {
      exitCode = code;
      throw new Error("__exit__");
    }) as typeof process.exit;
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    };
    try {
      await expect(
        cmdCrew(["join", "not-a-real-secret"], repo, { log: captured.log }),
      ).rejects.toThrow("__exit__");
    } finally {
      (process as unknown as { exit: typeof origExit }).exit = origExit;
      console.error = origErr;
    }
    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toContain("Invalid broker secret");
    expect(loadLocalConfig(repo).broker_secret).toBeUndefined();
  });

  it("fails when no secret is supplied", async () => {
    const repo = setupTempRepo();
    const origExit = process.exit;
    const origErr = console.error;
    let exitCode: number | undefined;
    const errors: string[] = [];
    (process as unknown as { exit: (code?: number) => never }).exit = ((code?: number) => {
      exitCode = code;
      throw new Error("__exit__");
    }) as typeof process.exit;
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    };
    try {
      await expect(cmdCrew(["join"], repo, {})).rejects.toThrow("__exit__");
    } finally {
      (process as unknown as { exit: typeof origExit }).exit = origExit;
      console.error = origErr;
    }
    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toContain("requires a broker secret");
  });

  it("warns and asks before replacing a different existing secret", async () => {
    const repo = setupTempRepo();
    seedBrokerSecret(repo, VALID_SECRET_A);
    const captured = makeLog();
    const prompts: string[] = [];
    const deps: CrewDeps = {
      log: captured.log,
      confirmPrompt: async (msg) => {
        prompts.push(msg);
        return true;
      },
    };
    await cmdCrew(["join", VALID_SECRET_B], repo, deps);

    expect(prompts.length).toBe(1);
    expect(prompts[0]).toContain("Replace");
    expect(loadLocalConfig(repo).broker_secret).toBe(VALID_SECRET_B);
  });

  it("aborts when user declines the replace prompt", async () => {
    const repo = setupTempRepo();
    seedBrokerSecret(repo, VALID_SECRET_A);
    const captured = makeLog();
    const deps: CrewDeps = {
      log: captured.log,
      confirmPrompt: async () => false,
    };
    await cmdCrew(["join", VALID_SECRET_B], repo, deps);

    expect(loadLocalConfig(repo).broker_secret).toBe(VALID_SECRET_A);
    expect(captured.text()).toContain("Aborted");
  });

  it("skips the prompt when the pasted secret matches the existing one", async () => {
    const repo = setupTempRepo();
    seedBrokerSecret(repo, VALID_SECRET_A);
    const captured = makeLog();
    const deps: CrewDeps = {
      log: captured.log,
      confirmPrompt: async () => {
        throw new Error("confirmPrompt should not be called for a matching secret");
      },
    };
    await cmdCrew(["join", VALID_SECRET_A], repo, deps);

    expect(loadLocalConfig(repo).broker_secret).toBe(VALID_SECRET_A);
    expect(captured.text()).toContain("Joined crew");
  });
});

// ── Subcommand: disconnect ─────────────────────────────────────────

describe("crew disconnect", () => {
  it("removes broker_secret from config.local.json after confirmation", async () => {
    const repo = setupTempRepo();
    seedBrokerSecret(repo, VALID_SECRET_A);
    const captured = makeLog();
    const deps: CrewDeps = {
      log: captured.log,
      confirmPrompt: async () => true,
    };
    await cmdCrew(["disconnect"], repo, deps);

    expect(loadLocalConfig(repo).broker_secret).toBeUndefined();
    expect(captured.text()).toContain("Disconnected");
  });

  it("does nothing when no secret is configured", async () => {
    const repo = setupTempRepo();
    const captured = makeLog();
    const deps: CrewDeps = {
      log: captured.log,
      confirmPrompt: async () => {
        throw new Error("confirmPrompt should not be called when no secret exists");
      },
    };
    await cmdCrew(["disconnect"], repo, deps);
    expect(captured.text()).toContain("No broker secret is configured");
  });

  it("aborts when the user declines", async () => {
    const repo = setupTempRepo();
    seedBrokerSecret(repo, VALID_SECRET_A);
    const captured = makeLog();
    const deps: CrewDeps = {
      log: captured.log,
      confirmPrompt: async () => false,
    };
    await cmdCrew(["disconnect"], repo, deps);
    expect(loadLocalConfig(repo).broker_secret).toBe(VALID_SECRET_A);
    expect(captured.text()).toContain("Aborted");
  });

  it("surfaces an error when only the shared config holds the secret", async () => {
    const repo = setupTempRepo();
    mkdirSync(join(repo, ".ninthwave"), { recursive: true });
    writeFileSync(
      join(repo, ".ninthwave", "config.json"),
      JSON.stringify({ broker_secret: VALID_SECRET_A }),
    );
    const captured = makeLog();
    const deps: CrewDeps = {
      log: captured.log,
      confirmPrompt: async () => true,
    };
    await cmdCrew(["disconnect"], repo, deps);

    // Shared config still has the secret -- we never mutate the committed file.
    expect(loadConfig(repo).broker_secret).toBe(VALID_SECRET_A);
    expect(captured.text()).toContain("Could not remove broker_secret");
  });
});

// ── Helper: removeLocalBrokerSecret ────────────────────────────────

describe("removeLocalBrokerSecret", () => {
  it("returns false when the file does not exist", () => {
    const repo = setupTempRepo();
    expect(removeLocalBrokerSecret(repo)).toBe(false);
  });

  it("returns false when broker_secret is absent", () => {
    const repo = setupTempRepo();
    mkdirSync(join(repo, ".ninthwave"), { recursive: true });
    writeFileSync(
      join(repo, ".ninthwave", "config.local.json"),
      JSON.stringify({ crew_url: "wss://example.com" }),
    );
    expect(removeLocalBrokerSecret(repo)).toBe(false);
    // File untouched -- crew_url still present.
    const raw = JSON.parse(
      readFileSync(join(repo, ".ninthwave", "config.local.json"), "utf-8"),
    );
    expect(raw.crew_url).toBe("wss://example.com");
  });

  it("removes broker_secret while preserving other keys", () => {
    const repo = setupTempRepo();
    mkdirSync(join(repo, ".ninthwave"), { recursive: true });
    writeFileSync(
      join(repo, ".ninthwave", "config.local.json"),
      JSON.stringify({
        broker_secret: VALID_SECRET_A,
        crew_url: "wss://broker.example.com",
        custom_key: "preserved",
      }),
    );
    expect(removeLocalBrokerSecret(repo)).toBe(true);

    const raw = JSON.parse(
      readFileSync(join(repo, ".ninthwave", "config.local.json"), "utf-8"),
    );
    expect(raw.broker_secret).toBeUndefined();
    expect(raw.crew_url).toBe("wss://broker.example.com");
    expect(raw.custom_key).toBe("preserved");
  });

  it("is a no-op on malformed JSON", () => {
    const repo = setupTempRepo();
    mkdirSync(join(repo, ".ninthwave"), { recursive: true });
    const path = join(repo, ".ninthwave", "config.local.json");
    writeFileSync(path, "{not valid json");
    expect(removeLocalBrokerSecret(repo)).toBe(false);
    // Malformed file was not overwritten.
    expect(readFileSync(path, "utf-8")).toBe("{not valid json");
    expect(existsSync(path)).toBe(true);
  });
});

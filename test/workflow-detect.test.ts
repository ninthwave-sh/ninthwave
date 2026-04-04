// Tests for GitHub Actions workflow presence detection.
// No vi.mock -- uses real filesystem via temp directories.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { detectWorkflowPresence, clearWorkflowPresenceCache } from "../core/workflow-detect.ts";

let tmpDir: string;

beforeEach(() => {
  clearWorkflowPresenceCache();
  tmpDir = mkdtempSync(join(tmpdir(), "nw-wf-test-"));
});

afterEach(() => {
  clearWorkflowPresenceCache();
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeWorkflow(name: string, content: string): void {
  const dir = join(tmpDir, ".github", "workflows");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), content);
}

describe("detectWorkflowPresence", () => {
  it("returns false for both when no .github/workflows directory", () => {
    const result = detectWorkflowPresence(tmpDir);
    expect(result).toEqual({ hasPrWorkflows: false, hasPushWorkflows: false });
  });

  it("returns false for both when workflows directory is empty", () => {
    mkdirSync(join(tmpDir, ".github", "workflows"), { recursive: true });
    const result = detectWorkflowPresence(tmpDir);
    expect(result).toEqual({ hasPrWorkflows: false, hasPushWorkflows: false });
  });

  it("detects pull_request trigger (map form)", () => {
    writeWorkflow("ci.yml", `
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  test:
    runs-on: ubuntu-latest
`);
    const result = detectWorkflowPresence(tmpDir);
    expect(result.hasPrWorkflows).toBe(true);
    expect(result.hasPushWorkflows).toBe(false);
  });

  it("detects push trigger (map form with branches)", () => {
    writeWorkflow("cd.yml", `
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
`);
    const result = detectWorkflowPresence(tmpDir);
    expect(result.hasPrWorkflows).toBe(false);
    expect(result.hasPushWorkflows).toBe(true);
  });

  it("detects both triggers in separate files", () => {
    writeWorkflow("ci.yml", `
on:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
`);
    writeWorkflow("cd.yml", `
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
`);
    const result = detectWorkflowPresence(tmpDir);
    expect(result.hasPrWorkflows).toBe(true);
    expect(result.hasPushWorkflows).toBe(true);
  });

  it("detects both triggers in the same file", () => {
    writeWorkflow("ci.yml", `
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
`);
    const result = detectWorkflowPresence(tmpDir);
    expect(result.hasPrWorkflows).toBe(true);
    expect(result.hasPushWorkflows).toBe(true);
  });

  it("detects inline array triggers", () => {
    writeWorkflow("ci.yml", `
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
`);
    const result = detectWorkflowPresence(tmpDir);
    expect(result.hasPrWorkflows).toBe(true);
    expect(result.hasPushWorkflows).toBe(true);
  });

  it("returns false for non-matching triggers (schedule, workflow_dispatch)", () => {
    writeWorkflow("cron.yml", `
on:
  schedule:
    - cron: '0 0 * * *'
  workflow_dispatch:

jobs:
  cleanup:
    runs-on: ubuntu-latest
`);
    const result = detectWorkflowPresence(tmpDir);
    expect(result.hasPrWorkflows).toBe(false);
    expect(result.hasPushWorkflows).toBe(false);
  });

  it("returns false for workflow_call only", () => {
    writeWorkflow("reusable.yml", `
on:
  workflow_call:

jobs:
  test:
    runs-on: ubuntu-latest
`);
    const result = detectWorkflowPresence(tmpDir);
    expect(result.hasPrWorkflows).toBe(false);
    expect(result.hasPushWorkflows).toBe(false);
  });

  it("does not match trigger keywords in job steps (only before jobs:)", () => {
    writeWorkflow("release.yml", `
on:
  workflow_dispatch:

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - name: push release artifacts
        run: echo "push to registry"
      - name: create pull_request
        run: gh pr create
`);
    const result = detectWorkflowPresence(tmpDir);
    expect(result.hasPrWorkflows).toBe(false);
    expect(result.hasPushWorkflows).toBe(false);
  });

  it("handles .yaml extension", () => {
    writeWorkflow("ci.yaml", `
on:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
`);
    const result = detectWorkflowPresence(tmpDir);
    expect(result.hasPrWorkflows).toBe(true);
  });

  it("ignores non-yaml files in workflows directory", () => {
    writeWorkflow("readme.md", "# This mentions push and pull_request but is not a workflow");
    const result = detectWorkflowPresence(tmpDir);
    expect(result.hasPrWorkflows).toBe(false);
    expect(result.hasPushWorkflows).toBe(false);
  });

  it("caches results per repoRoot", () => {
    writeWorkflow("ci.yml", `on: [push]\njobs:\n  t:\n    runs-on: ubuntu-latest`);
    const first = detectWorkflowPresence(tmpDir);
    expect(first.hasPushWorkflows).toBe(true);

    // Delete the file -- cache should still return the same result
    rmSync(join(tmpDir, ".github"), { recursive: true, force: true });
    const second = detectWorkflowPresence(tmpDir);
    expect(second).toBe(first); // same reference = from cache
  });

  it("detects push with tag filter (not branch)", () => {
    writeWorkflow("release.yml", `
on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
`);
    const result = detectWorkflowPresence(tmpDir);
    // push trigger exists even if only for tags -- conservative detection
    expect(result.hasPushWorkflows).toBe(true);
  });
});

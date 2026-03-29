import { describe, it, expect, afterEach } from "vitest";
import {
  setupTempRepo,
  setupTempRepoPair,
  useFixtureDir,
  cleanupTempRepos,
} from "./helpers.ts";
import { join, dirname, basename } from "path";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { parseWorkItems } from "../core/parser.ts";
import {
  resolveRepo,
  bootstrapRepo,
  writeCrossRepoIndex,
  removeCrossRepoIndex,
  getWorktreeInfo,
  VALID_ALIAS_RE,
} from "../core/cross-repo.ts";

describe("cross-repo", () => {
  afterEach(() => cleanupTempRepos());

  // Group 1: parseWorkItems() Repo field extraction
  describe("repo field parsing", () => {
    it("parses all 4 items from cross_repo fixture", () => {
      const repo = setupTempRepo();
      const workDir = useFixtureDir(repo, "cross_repo.md");
      const items = parseWorkItems(
        workDir,
        join(repo, ".worktrees"),
      );

      expect(items).toHaveLength(4);
    });

    it("parses repo alias for cross-repo items", () => {
      const repo = setupTempRepo();
      const workDir = useFixtureDir(repo, "cross_repo.md");
      const items = parseWorkItems(
        workDir,
        join(repo, ".worktrees"),
      );

      const apiItem = items.find((i) => i.id === "H-API-1");
      expect(apiItem?.repoAlias).toBe("target-repo-a");

      const waItem = items.find((i) => i.id === "H-WA-1");
      expect(waItem?.repoAlias).toBe("target-repo-b");
    });

    it("hub-local items have empty repo alias", () => {
      const repo = setupTempRepo();
      const workDir = useFixtureDir(repo, "cross_repo.md");
      const items = parseWorkItems(
        workDir,
        join(repo, ".worktrees"),
      );

      const docItem = items.find((i) => i.id === "M-DOC-1");
      expect(docItem?.repoAlias).toBe("");
    });

    it("valid.md (no Repo fields) still parses 4 items", () => {
      const repo = setupTempRepo();
      const workDir = useFixtureDir(repo, "valid.md");
      const items = parseWorkItems(
        workDir,
        join(repo, ".worktrees"),
      );

      expect(items).toHaveLength(4);
    });

    it("M-CI-1 still has correct priority in valid.md", () => {
      const repo = setupTempRepo();
      const workDir = useFixtureDir(repo, "valid.md");
      const items = parseWorkItems(
        workDir,
        join(repo, ".worktrees"),
      );

      const item = items.find((i) => i.id === "M-CI-1");
      expect(item?.priority).toBe("medium");
    });
  });

  // Group 2: Sibling directory resolution
  describe("sibling directory discovery", () => {
    it("setup_temp_repo_pair creates sibling repos", () => {
      const hub = setupTempRepoPair();
      const parent = dirname(hub);

      expect(existsSync(join(parent, "target-repo-a", ".git"))).toBe(true);
      expect(existsSync(join(parent, "target-repo-b", ".git"))).toBe(true);
    }, 15000);
  });

  // Group 3: Cross-repo index read/write
  describe("cross-repo index CRUD", () => {
    it("index can be written and read", { timeout: 15000 }, () => {
      const hub = setupTempRepoPair();
      const parent = dirname(hub);
      mkdirSync(join(hub, ".worktrees"), { recursive: true });

      const indexFile = join(hub, ".worktrees", ".cross-repo-index");
      writeFileSync(
        indexFile,
        `H-API-1\t${parent}/target-repo-a\t${parent}/target-repo-a/.worktrees/ninthwave-H-API-1\nH-WA-1\t${parent}/target-repo-b\t${parent}/target-repo-b/.worktrees/ninthwave-H-WA-1\n`,
      );

      expect(existsSync(indexFile)).toBe(true);
      const content = readFileSync(indexFile, "utf-8");
      const lines = content.trim().split("\n");
      expect(lines).toHaveLength(2);
      expect(content).toContain("H-API-1");
      expect(content).toContain("H-WA-1");
    });

    it("entry can be removed from index", { timeout: 15000 }, () => {
      const hub = setupTempRepoPair();
      const parent = dirname(hub);
      mkdirSync(join(hub, ".worktrees"), { recursive: true });

      const indexFile = join(hub, ".worktrees", ".cross-repo-index");
      writeFileSync(
        indexFile,
        `H-API-1\t${parent}/target-repo-a\t${parent}/target-repo-a/.worktrees/ninthwave-H-API-1\nH-WA-1\t${parent}/target-repo-b\t${parent}/target-repo-b/.worktrees/ninthwave-H-WA-1\n`,
      );

      // Simulate removal: filter out H-API-1
      const content = readFileSync(indexFile, "utf-8");
      const filtered = content
        .split("\n")
        .filter((line) => !line.startsWith("H-API-1\t"))
        .join("\n");
      writeFileSync(indexFile, filtered);

      const updated = readFileSync(indexFile, "utf-8");
      expect(updated).not.toContain("H-API-1");
      expect(updated).toContain("H-WA-1");
    });
  });

  // Group 4: writeCrossRepoIndex deduplication
  describe("writeCrossRepoIndex deduplication", () => {
    it("writing same ID twice results in one entry", () => {
      const repo = setupTempRepo();
      const indexFile = join(repo, ".worktrees", ".cross-repo-index");

      writeCrossRepoIndex(indexFile, "T-1", "/repo-a", "/repo-a/.worktrees/ninthwave-T-1");
      writeCrossRepoIndex(indexFile, "T-1", "/repo-a", "/repo-a/.worktrees/ninthwave-T-1-v2");

      const content = readFileSync(indexFile, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain("ninthwave-T-1-v2");
    });

    it("writing different IDs produces separate entries", () => {
      const repo = setupTempRepo();
      const indexFile = join(repo, ".worktrees", ".cross-repo-index");

      writeCrossRepoIndex(indexFile, "T-1", "/repo-a", "/repo-a/.worktrees/ninthwave-T-1");
      writeCrossRepoIndex(indexFile, "T-2", "/repo-b", "/repo-b/.worktrees/ninthwave-T-2");

      const content = readFileSync(indexFile, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());
      expect(lines).toHaveLength(2);
      expect(content).toContain("T-1");
      expect(content).toContain("T-2");
    });

    it("existing index operations still work after dedup write", () => {
      const repo = setupTempRepo();
      const indexFile = join(repo, ".worktrees", ".cross-repo-index");
      mkdirSync(join(repo, ".worktrees"), { recursive: true });

      // Write two entries
      writeCrossRepoIndex(indexFile, "T-1", "/repo-a", "/repo-a/.worktrees/ninthwave-T-1");
      writeCrossRepoIndex(indexFile, "T-2", "/repo-b", "/repo-b/.worktrees/ninthwave-T-2");

      // getWorktreeInfo should find them
      const info1 = getWorktreeInfo("T-1", indexFile, join(repo, ".worktrees"));
      expect(info1).not.toBeNull();
      expect(info1!.itemId).toBe("T-1");
      expect(info1!.repoRoot).toBe("/repo-a");

      // Remove one
      removeCrossRepoIndex(indexFile, "T-1");
      const content = readFileSync(indexFile, "utf-8");
      expect(content).not.toContain("T-1");
      expect(content).toContain("T-2");
    });
  });

  // Group 5: resolveRepo error handling
  describe("resolveRepo error handling", () => {
    it("returns projectRoot for empty alias", () => {
      const repo = setupTempRepo();
      expect(resolveRepo("", repo)).toBe(repo);
    });

    it("returns projectRoot for 'self' alias", () => {
      const repo = setupTempRepo();
      expect(resolveRepo("self", repo)).toBe(repo);
    });

    it("returns projectRoot for 'hub' alias", () => {
      const repo = setupTempRepo();
      expect(resolveRepo("hub", repo)).toBe(repo);
    });

    it("resolves sibling repo via convention", () => {
      const hub = setupTempRepoPair();
      const parent = dirname(hub);
      expect(resolveRepo("target-repo-a", hub)).toBe(
        join(parent, "target-repo-a"),
      );
    });

    it("throws on unresolvable alias (no sibling, no repos.conf)", () => {
      const repo = setupTempRepo();
      expect(() => resolveRepo("nonexistent-repo", repo)).toThrow(
        /not found/i,
      );
    });

    it("throws when repos.conf maps alias to non-git directory", () => {
      const repo = setupTempRepo();
      const confDir = join(repo, ".ninthwave");
      mkdirSync(confDir, { recursive: true });
      // Create a directory that is NOT a git repo
      const fakePath = join(dirname(repo), "not-a-repo");
      mkdirSync(fakePath, { recursive: true });
      writeFileSync(
        join(confDir, "repos.conf"),
        `my-alias = ${fakePath}\n`,
      );
      expect(() => resolveRepo("my-alias", repo)).toThrow(
        /not a git repository/i,
      );
    });

    it("callers can catch the error and continue", () => {
      const repo = setupTempRepo();
      let caught = false;
      try {
        resolveRepo("nonexistent-repo", repo);
      } catch {
        caught = true;
      }
      expect(caught).toBe(true);
      // Caller can continue after catching
      const result = resolveRepo("", repo);
      expect(result).toBe(repo);
    });

    it("rejects alias with path traversal (../foo)", () => {
      const repo = setupTempRepo();
      expect(() => resolveRepo("../foo", repo)).toThrow(/Invalid repo alias/);
    });

    it("rejects alias with semicolons (foo;bar)", () => {
      const repo = setupTempRepo();
      expect(() => resolveRepo("foo;bar", repo)).toThrow(/Invalid repo alias/);
    });

    it("rejects alias with slashes (foo/bar)", () => {
      const repo = setupTempRepo();
      expect(() => resolveRepo("foo/bar", repo)).toThrow(/Invalid repo alias/);
    });

    it("rejects alias starting with a dot (.hidden)", () => {
      const repo = setupTempRepo();
      expect(() => resolveRepo(".hidden", repo)).toThrow(/Invalid repo alias/);
    });

    it("rejects alias starting with a hyphen (-flag)", () => {
      const repo = setupTempRepo();
      expect(() => resolveRepo("-flag", repo)).toThrow(/Invalid repo alias/);
    });

    it("accepts valid alias with dots, hyphens, underscores", () => {
      // These should NOT throw the validation error (they may throw "not found")
      const repo = setupTempRepo();
      expect(() => resolveRepo("valid.repo-name_123", repo)).toThrow(/not found/i);
    });
  });

  // Group 5b: VALID_ALIAS_RE coverage
  describe("VALID_ALIAS_RE", () => {
    it("accepts simple names", () => {
      expect(VALID_ALIAS_RE.test("myrepo")).toBe(true);
    });

    it("accepts names with dots, hyphens, underscores", () => {
      expect(VALID_ALIAS_RE.test("my.repo-name_v2")).toBe(true);
    });

    it("accepts single character name", () => {
      expect(VALID_ALIAS_RE.test("a")).toBe(true);
    });

    it("rejects empty string", () => {
      expect(VALID_ALIAS_RE.test("")).toBe(false);
    });

    it("rejects path traversal", () => {
      expect(VALID_ALIAS_RE.test("../../../etc")).toBe(false);
    });

    it("rejects slashes", () => {
      expect(VALID_ALIAS_RE.test("foo/bar")).toBe(false);
    });

    it("rejects starting with dot", () => {
      expect(VALID_ALIAS_RE.test(".hidden")).toBe(false);
    });

    it("rejects starting with hyphen", () => {
      expect(VALID_ALIAS_RE.test("-flag")).toBe(false);
    });

    it("rejects spaces", () => {
      expect(VALID_ALIAS_RE.test("foo bar")).toBe(false);
    });
  });

  // Group 5c: bootstrapRepo alias validation
  describe("bootstrapRepo alias validation", () => {
    it("rejects aliases with path traversal characters", () => {
      const repo = setupTempRepo();
      const result = bootstrapRepo("../../../etc", repo);
      expect(result.status).toBe("failed");
      expect((result as { reason: string }).reason).toContain("Invalid repo alias");
    });

    it("rejects aliases with semicolons", () => {
      const repo = setupTempRepo();
      const result = bootstrapRepo("foo;bar", repo);
      expect(result.status).toBe("failed");
    });

    it("allows hub-local aliases through without validation", () => {
      const repo = setupTempRepo();
      expect(bootstrapRepo("", repo).status).toBe("exists");
      expect(bootstrapRepo("self", repo).status).toBe("exists");
      expect(bootstrapRepo("hub", repo).status).toBe("exists");
    });
  });

  // Group 6: Hub fallback behavior
  describe("hub fallback", () => {
    it("items without Repo field default to empty alias", () => {
      const repo = setupTempRepo();
      const workDir = useFixtureDir(repo, "valid.md");
      const items = parseWorkItems(
        workDir,
        join(repo, ".worktrees"),
      );

      for (const item of items) {
        expect(item.repoAlias).toBe("");
      }
    });
  });
});

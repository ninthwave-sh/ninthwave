// Agent file seeding into worktrees.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { run, GIT_TIMEOUT } from "./shell.ts";
import { info as defaultInfo } from "./output.ts";
import { agentFileTargets, renderAgentArtifact } from "./ai-tools.ts";
import { discoverAgentSources, detectManagedCopyStatus, writeManagedCopy } from "./commands/setup.ts";

/** Parse the configured LLM model from YAML frontmatter. */
export function parseAgentModel(content: string): string | null {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!frontmatterMatch) return null;

  const modelMatch = frontmatterMatch[1]?.match(/^[ \t]*model[ \t]*:[ \t]*(.+?)[ \t]*$/m);
  if (!modelMatch) return null;

  let model = modelMatch[1]?.trim() ?? "";
  if (!model) return null;

  if (
    (model.startsWith('"') && model.endsWith('"')) ||
    (model.startsWith("'") && model.endsWith("'"))
  ) {
    model = model.slice(1, -1).trim();
  }

  return model.length > 0 ? model : null;
}

/** Dependencies for seedAgentFiles, injectable for testing. */
export interface SeedAgentFilesDeps {
  run: typeof run;
  readFileSync: typeof readFileSync;
  existsSync: typeof existsSync;
  mkdirSync: typeof mkdirSync;
  writeFileSync: typeof writeFileSync;
  info: typeof defaultInfo;
}

export interface SeededAgentFile {
  path: string;
  commitRecommended: boolean;
}

const defaultSeedDeps: SeedAgentFilesDeps = {
  run,
  readFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  info: defaultInfo,
};

/**
 * Read an agent file's content, preferring origin/main over local filesystem.
 * Returns the file content or null if unavailable from both sources.
 */
export function readAgentFileContent(
  hubRoot: string,
  filename: string,
  deps: Pick<SeedAgentFilesDeps, "run" | "readFileSync" | "existsSync"> = defaultSeedDeps,
): string | null {
  // Try reading from origin/main first for consistency with remote state
  try {
    const gitResult = deps.run("git", ["show", `origin/main:agents/${filename}`], {
      cwd: hubRoot,
      timeout: GIT_TIMEOUT,
    });
    if (gitResult.exitCode === 0 && gitResult.stdout.length > 0) {
      return gitResult.stdout;
    }
  } catch {
    // Fall back to the local filesystem if git is unavailable.
  }

  // Fallback to local filesystem
  const localPath = join(hubRoot, "agents", filename);
  if (deps.existsSync(localPath)) {
    return deps.readFileSync(localPath, "utf-8");
  }

  return null;
}

/**
 * Seed agent files into a worktree as managed copies.
 * Reads agent content from origin/main for consistency with remote state,
 * falling back to the hub repo's local agents/ directory. Returns the list
 * of relative paths that were created or refreshed, plus whether each path
 * should be suggested for commit in the worker prompt.
 */
function isIgnoredByGit(
  worktreePath: string,
  relativePath: string,
  deps: Pick<SeedAgentFilesDeps, "run" | "existsSync">,
): boolean {
  const hasGitMetadata = deps.existsSync(join(worktreePath, ".git"));
  const hasRootGitignore = deps.existsSync(join(worktreePath, ".gitignore"));
  if (!hasGitMetadata && !hasRootGitignore) {
    return false;
  }

  try {
    const result = deps.run("git", ["check-ignore", "--no-index", relativePath], {
      cwd: worktreePath,
      timeout: GIT_TIMEOUT,
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export function seedAgentFiles(
  worktreePath: string,
  hubRoot: string,
  deps: SeedAgentFilesDeps = defaultSeedDeps,
): SeededAgentFile[] {
  const seeded: SeededAgentFile[] = [];
  const agentFiles = agentFileTargets(discoverAgentSources(hubRoot));

  for (const agent of agentFiles) {
    const sourceContent = readAgentFileContent(hubRoot, agent.source, deps);
    if (!sourceContent) continue;

    for (const target of agent.targets) {
      const rendered = renderAgentArtifact(agent.source, sourceContent, target);
      const filename = rendered.filename;
      const relativePath = join(target.dir, filename);
      const destPath = join(worktreePath, target.dir, filename);

      const status = detectManagedCopyStatus(destPath, rendered.content);
      if (status === "up-to-date") continue;

      writeManagedCopy(destPath, rendered.content);
      seeded.push({
        path: relativePath,
        commitRecommended: !isIgnoredByGit(worktreePath, relativePath, deps),
      });
    }
  }

  if (seeded.length > 0) {
    deps.info(`Seeded agent files into worktree: ${seeded.map((entry) => entry.path).join(", ")}`);
  }

  return seeded;
}

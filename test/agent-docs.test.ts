// Structural assertions for the agent prompt markdown files. These guard
// against silent regressions in critical handoff steps that workers depend on.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");

describe("agents/implementer.md", () => {
  const implementerMd = readFileSync(
    join(REPO_ROOT, "agents", "implementer.md"),
    "utf-8",
  );

  describe("Phase 11 rebase request", () => {
    // Extract just the "#### Rebase Request" subsection so we don't accidentally
    // pass on Phase 3 content that already mentions the merged-check.
    const rebaseSectionStart = implementerMd.indexOf("#### Rebase Request");
    const rebaseSectionEnd = implementerMd.indexOf("#### Stop Request");
    const rebaseSection = implementerMd.slice(
      rebaseSectionStart,
      rebaseSectionEnd,
    );

    it("exists as a subsection of Phase 11", () => {
      expect(rebaseSectionStart).toBeGreaterThan(0);
      expect(rebaseSectionEnd).toBeGreaterThan(rebaseSectionStart);
    });

    it("checks whether BASE_BRANCH has already merged before rebasing onto it (M-ORCH-16)", () => {
      expect(rebaseSection).toContain('gh pr list --head "$BASE_BRANCH" --state merged');
    });

    it("rebases onto main and clears BASE_BRANCH when the dependency has already merged (M-ORCH-16)", () => {
      // The merged path must rebase onto main and clear BASE_BRANCH so subsequent
      // PR updates do not retarget the deleted dependency branch.
      expect(rebaseSection).toMatch(/BASE_BRANCH=""/);
      expect(rebaseSection).toContain("git rebase origin/main");
    });

    it("still rebases onto $BASE_BRANCH when the dependency has not merged (regression guard)", () => {
      expect(rebaseSection).toContain("git rebase origin/$BASE_BRANCH");
    });
  });
});

import { describe, expect, it } from "vitest";

import {
  RepoRefError,
  compareRepoRefs,
  hashNormalizedRepoUrl,
  hashRepoUrl,
  normalizeRepoHash,
  normalizeRepoUrl,
  resolveRepoRef,
} from "../core/repo-ref.ts";

function expectRepoRefError(fn: () => unknown, code: RepoRefError["code"]): void {
  try {
    fn();
    throw new Error(`Expected RepoRefError with code ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(RepoRefError);
    expect((error as RepoRefError).code).toBe(code);
  }
}

describe("repo-ref", () => {
  it("normalizes equivalent HTTPS and SSH URLs to the same repo identity", () => {
    const httpsUrl = "https://github.com/ninthwave-io/ninthwave.git";
    const sshUrl = "git@github.com:ninthwave-io/ninthwave.git";
    const sshProtocolUrl = "ssh://git@github.com/ninthwave-io/ninthwave.git";

    expect(normalizeRepoUrl(httpsUrl)).toBe("github.com/ninthwave-io/ninthwave");
    expect(normalizeRepoUrl(sshUrl)).toBe("github.com/ninthwave-io/ninthwave");
    expect(normalizeRepoUrl(sshProtocolUrl)).toBe("github.com/ninthwave-io/ninthwave");

    expect(hashRepoUrl(httpsUrl)).toBe(hashRepoUrl(sshUrl));
    expect(hashRepoUrl(httpsUrl)).toBe(hashRepoUrl(sshProtocolUrl));
  });

  it("keeps repo hashes stable across equivalent URL forms", () => {
    const canonical = "github.com/ninthwave-io/ninthwave";

    expect(hashNormalizedRepoUrl(canonical)).toBe(
      "df2751384a603456180b71882175d3e1e925275574581256f9f5d0a39d637687",
    );
    expect(hashRepoUrl("https://github.com/ninthwave-io/ninthwave/")).toBe(
      hashNormalizedRepoUrl(canonical),
    );
    expect(hashRepoUrl("git@github.com:ninthwave-io/ninthwave.git")).toBe(
      hashNormalizedRepoUrl(canonical),
    );
  });

  it("accepts raw repoUrl, precomputed repoHash, and stored repoRef inputs", () => {
    const repoUrl = "https://github.com/ninthwave-io/ninthwave.git";
    const repoHash = hashRepoUrl(repoUrl);

    expect(resolveRepoRef({ repoUrl })).toEqual({
      normalizedRepoUrl: "github.com/ninthwave-io/ninthwave",
      repoHash,
      repoRef: repoHash,
    });
    expect(resolveRepoRef({ repoHash })).toEqual({
      repoHash,
      repoRef: repoHash,
    });
    expect(resolveRepoRef({ repoRef: repoHash.toUpperCase() })).toEqual({
      repoHash,
      repoRef: repoHash,
    });
    expect(resolveRepoRef({ repoRef: "github.com/ninthwave-io/ninthwave.git" })).toEqual({
      repoHash,
      repoRef: repoHash,
    });
  });

  it("uses one canonical comparison value for equivalent inputs", () => {
    const repoUrl = "https://github.com/ninthwave-io/ninthwave.git";
    const repoHash = hashRepoUrl(repoUrl);

    expect(compareRepoRefs({ repoUrl }, { repoHash })).toEqual({
      matches: true,
      left: {
        normalizedRepoUrl: "github.com/ninthwave-io/ninthwave",
        repoHash,
        repoRef: repoHash,
      },
      right: {
        repoHash,
        repoRef: repoHash,
      },
    });
  });

  it("surfaces mismatch detection inputs the runtime can reject later", () => {
    const expected = compareRepoRefs(
      { repoUrl: "https://github.com/ninthwave-io/ninthwave.git" },
      { repoRef: hashRepoUrl("git@github.com:ninthwave-io/other-repo.git") },
    );

    expect(expected.matches).toBe(false);
    expect(expected.left.repoRef).not.toBe(expected.right.repoRef);
    expect(expected.left.normalizedRepoUrl).toBe("github.com/ninthwave-io/ninthwave");
  });

  it("rejects missing and invalid repo identity inputs explicitly", () => {
    expectRepoRefError(() => resolveRepoRef({}), "missing_repo_identity");
    expectRepoRefError(() => normalizeRepoUrl("not-a-repo"), "invalid_repo_url");
    expectRepoRefError(() => normalizeRepoHash("short"), "invalid_repo_hash");
    expectRepoRefError(() => resolveRepoRef({ repoRef: "not-a-ref" }), "invalid_repo_ref");
  });

  it("rejects inconsistent repoUrl and repoHash inputs explicitly", () => {
    expectRepoRefError(
      () => resolveRepoRef({
        repoUrl: "https://github.com/ninthwave-io/ninthwave.git",
        repoHash: hashRepoUrl("https://github.com/ninthwave-io/other-repo.git"),
      }),
      "repo_identity_mismatch",
    );
  });
});

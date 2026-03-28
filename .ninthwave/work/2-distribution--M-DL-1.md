# Feat: curl installer for Linux and CI (M-DL-1)

**Priority:** Medium
**Source:** CEO review of Homebrew distribution plan 2026-03-28
**Depends on:** Homebrew pipeline must be working (release tarballs must exist on GitHub)
**Domain:** distribution

Create a curl installer script (`curl -fsSL https://ninthwave.sh/install | bash`) as a secondary distribution channel for Linux users and CI environments. Maps to the existing "vendored" upgrade path in the ninthwave-upgrade skill.

## Behavior

1. Detect OS (darwin/linux) and arch (arm64/x64)
2. Fetch latest release version from GitHub API
3. Download the correct tarball from GitHub releases
4. Extract to `~/.ninthwave/` (binary in `bin/`, resources alongside)
5. Add `~/.ninthwave/bin` to PATH via shell profile (.bashrc, .zshrc)
6. Create `nw` symlink
7. Print success message with `nw version` output

## Hosting

The script lives at `install.sh` in the repo and is served from `https://ninthwave.sh/install` (or `https://raw.githubusercontent.com/ninthwave-sh/ninthwave/main/install.sh`).

**Test plan:**
- Test OS/arch detection on macOS arm64, macOS x64, Linux x64
- Test PATH modification appends correctly (doesn't duplicate)
- Test idempotent: running twice doesn't break anything

Acceptance: `curl -fsSL https://ninthwave.sh/install | bash` installs ninthwave on a clean Linux machine. `nw version` works after install. `/ninthwave-upgrade` detects this as "vendored" install type.

Key files: `install.sh` (new)

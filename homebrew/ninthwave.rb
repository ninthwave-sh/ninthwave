# Homebrew formula for ninthwave.
#
# This is the template formula kept in-repo. The release workflow
# (.github/workflows/release.yml) substitutes version and SHA256 values,
# then pushes the result to the ninthwave-sh/homebrew-tap repository.
#
# Install: brew install ninthwave-sh/tap/ninthwave
# Update:  brew upgrade ninthwave

class Ninthwave < Formula
  desc "Parallel AI coding orchestration — human-sized PRs"
  homepage "https://github.com/ninthwave-sh/ninthwave"
  license "Apache-2.0"
  version "__VERSION__"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/ninthwave-sh/ninthwave/releases/download/v__VERSION__/ninthwave-__VERSION__-darwin-arm64.tar.gz"
      sha256 "__SHA_DARWIN_ARM64__"
    else
      url "https://github.com/ninthwave-sh/ninthwave/releases/download/v__VERSION__/ninthwave-__VERSION__-darwin-x64.tar.gz"
      sha256 "__SHA_DARWIN_X64__"
    end
  end

  on_linux do
    url "https://github.com/ninthwave-sh/ninthwave/releases/download/v__VERSION__/ninthwave-__VERSION__-linux-x64.tar.gz"
    sha256 "__SHA_LINUX_X64__"
  end

  def install
    bin.install "ninthwave"
    # Short alias: `nw` is the daily-driver command (2 chars, no conflicts).
    bin.install_symlink "ninthwave" => "nw"

    # Resource files (skills, agents, templates, docs) used by `nw init`.
    # Install everything except the binary — future-proof as new resources are added.
    (share/"ninthwave").install Dir["*"] - ["ninthwave"]
  end

  def caveats
    <<~EOS
      ninthwave requires cmux for parallel sessions.
        Install: brew install --cask manaflow-ai/cmux/cmux
        Or download from: https://cmux.com

      Run `nw doctor` to verify your setup.
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/ninthwave version")
    # Verify nw symlink works
    assert_match version.to_s, shell_output("#{bin}/nw version")
    # Verify resource files are discoverable (BUNDLE_MARKER)
    assert_predicate share/"ninthwave/skills/work/SKILL.md", :exist?
    assert_predicate share/"ninthwave/VERSION", :exist?
  end
end

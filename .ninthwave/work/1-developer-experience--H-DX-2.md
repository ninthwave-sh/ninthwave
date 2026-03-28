# Feat: Validate AI tool configuration in `nw doctor` (H-DX-2)

**Priority:** High
**Source:** Dogfood friction — worker launch failures from misconfigured AI tools are hard to diagnose
**Depends on:** None
**Domain:** developer-experience

Extend `nw doctor` to validate that detected AI tools are properly configured for parallel worker sessions. Currently `nw doctor` checks for binary availability (e.g., `claude --version`) but doesn't verify configuration prerequisites that cause silent launch failures.

## Checks to add

For each detected AI tool, run tool-specific configuration validation:

**Copilot CLI:**
- Check `~/.copilot/config.json` exists
- Check `trusted_folders` contains the project root (or a parent path)
- If missing: suggest `nw init` or manual add

**Claude Code:**
- Check `claude` binary is available and responds to `--version`
- Verify the project directory is accessible (not in a restricted path)

**OpenCode:**
- Check `opencode` binary is available

## Implementation

In `core/commands/doctor.ts`, add an `aiToolConfig` check section after the existing tool availability checks. Each check returns `{ ok: boolean; message: string }`. Display results in the existing doctor table format with ✓/✗ indicators.

**Test plan:**
- Test: Copilot detected + trusted_folders includes project root → pass
- Test: Copilot detected + trusted_folders missing project root → warn with fix instruction
- Test: Copilot detected + config.json doesn't exist → warn with `nw init` suggestion
- Test: Claude detected + binary available → pass
- Test: No AI tools detected → skip section entirely (no false negatives)
- Test: doctor output format includes AI tool checks in the report

Acceptance: `nw doctor` validates AI tool configuration beyond binary availability. Copilot trust folder check is implemented. Failed checks show specific remediation instructions. All existing doctor tests still pass. `bun test test/` passes.

Key files: `core/commands/doctor.ts`, `test/doctor.test.ts`

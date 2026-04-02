# Fix: Persist startup defaults from both confirmation entry points (H-STS-2)

**Priority:** High
**Source:** /Users/roblambell/code/ninthwave/.opencode/plans/1775156954966-hidden-star.md
**Depends on:** H-STS-1
**Domain:** startup-persistence
**Lineage:** 626dc5f2-a4f1-4af5-ac4f-ad0b5bcf9f8d

Update the startup confirmation flows in `cmdNoArgs` and the interactive branch of `cmdWatch` to use the shared persistence helper instead of persisting only a subset of fields. Keep `nw` and `nw watch` behavior aligned so the confirmed startup screen immediately writes the same reusable defaults, while still treating join codes as runtime-only values. Expand the existing startup integration coverage to lock in the new persistence contract without building a large new orchestrate harness.

**Test plan:**
- Extend `test/onboard.test.ts` so confirmed `cmdNoArgs` saves the full durable payload, including collaboration mode and selected tools
- Update the relevant orchestration tests to verify the interactive startup branch persists helper-derived defaults for merge, review, WIP, backend mode, collaboration mode, and tool choices
- Verify `cmdNoArgs` and `cmdWatch` still pass runtime-only connection flags through to execution without saving join codes
- Run `bun test test/interactive.test.ts test/onboard.test.ts test/orchestrate.test.ts` after the implementation

Acceptance: both startup confirmation entry points persist the same durable defaults immediately after confirmation. `cmdNoArgs` and interactive `cmdWatch` preserve runtime collaboration behavior, save selected AI tools when chosen, preserve existing tools when skipped, and never write join codes to config.

Key files: `core/commands/onboard.ts`, `core/commands/orchestrate.ts`, `test/onboard.test.ts`, `test/orchestrate.test.ts`

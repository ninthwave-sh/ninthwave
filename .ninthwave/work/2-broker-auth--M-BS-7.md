# Docs: Update broker auth documentation (M-BS-7)

**Priority:** Medium
**Source:** Broker Secret & Crew Connection UX Redesign plan
**Depends on:** H-BS-6
**Domain:** broker-auth
**Lineage:** 52623cde-4263-43ad-bc31-be7a43aacca2

Update documentation to reflect the new broker secret flow:

1. **ARCHITECTURE.md** (lines 414-480, crew broker section): Update the connection flow to
   describe opt-in secret generation at init, auto-connect behavior, and the `nw crew`
   subcommand. Remove or update references to the old "local-first: never auto-connect"
   policy.

2. **JSONC header in generateConfig()** (`core/commands/init.ts:535-539`): Update the comment
   in the generated `.ninthwave/config.json` to reflect the new flow. Current text says
   "broker_secret lives in config.local.json -- pass the secret to teammates out of band."
   Update to mention `nw crew join` and `nw init --broker-secret` as the recommended paths.

3. **Help descriptions** in `core/help.ts`: Polish the descriptions for `init`, `crew`, and
   orchestration flags to ensure consistency and accuracy after all the preceding changes.

**Test plan:**
- Manual review

Acceptance: ARCHITECTURE.md crew section accurately describes the new broker auth flow. JSONC header references current commands. Help text is consistent across init, crew, and orchestration commands. No stale references to auto-generated secrets or "local-first: never auto-connect."

Key files: `ARCHITECTURE.md:414-480`, `core/commands/init.ts:535-539`, `core/help.ts`

# Feat: Align crew protocol payloads for self-hosted broker compatibility (H-SHB-3)

**Priority:** High
**Source:** Spec `.opencode/plans/1775207598126-tidy-cactus.md`
**Depends on:** H-SHB-1, H-SHB-2
**Domain:** crew-protocol
**Lineage:** 56db292e-fc15-4f9f-896b-b396d35f4d35

Extend the OSS crew protocol just enough for hosted and self-hosted brokers to share the same client path. Update `core/crew.ts` and the orchestrator create or join flow so sync payloads can carry richer remote item snapshots, create requests send repo reference information, join connections can present both `repoUrl` and `repoHash` compatibility inputs, and `SyncAckMessage` accepts forward-compatible fields like `privacySettings` without breaking current callers.

**Test plan:**
- Extend `test/crew-connect.test.ts` to cover parsing richer `remoteItems`, permissive `parseCrewStatusUpdate()` handling, and repo mismatch rejection paths from the client perspective.
- Add or update orchestrator tests around `createCrewCode()` request bodies and websocket connection query parameters so both repo identity forms are sent when available.
- Verify older payloads without new fields still parse cleanly and do not regress existing hosted-broker behavior.

Acceptance: The crew client accepts both legacy and richer broker payloads, share or join requests send repo reference data compatible with hosted and self-hosted brokers, and targeted client/protocol tests plus the full suite pass.

Key files: `core/crew.ts`, `core/commands/orchestrate.ts`, `test/crew-connect.test.ts`, `test/status.test.ts`

# Feat: Add project `crew_url` config support (H-CRW-1)

**Priority:** High
**Source:** Approved plan `1775111435127-crisp-falcon.md`
**Depends on:** None
**Domain:** project-config
**Lineage:** 309e0ebb-2fc8-4536-839b-8d6f14035573

Extend project config loading so `.ninthwave/config.json` can carry an optional `crew_url` override for collaboration. The loader should accept only valid absolute `ws://` or `wss://` URLs, treat invalid values as absent, and preserve the current silent-fallback behavior for malformed or partial project config.

**Test plan:**
- Add `loadConfig()` coverage for a valid `crew_url` alongside existing boolean keys.
- Add `loadConfig()` coverage for invalid, non-string, and absent `crew_url` values resolving to `undefined`.
- Verify `saveConfig()` merge and round-trip behavior still preserve project settings without clobbering unrelated keys.

Acceptance: `loadConfig(projectRoot)` returns `crew_url` only for valid websocket URLs, leaves invalid or missing values unset, and existing `review_external` and `schedule_enabled` behavior stays unchanged.

Key files: `core/config.ts`, `test/config.test.ts`

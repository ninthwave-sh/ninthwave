# Feat: Preserve `crew_url` across `ninthwave init` reruns (H-CRW-3)

**Priority:** High
**Source:** Approved plan `1775111435127-crisp-falcon.md`
**Depends on:** H-CRW-1
**Domain:** project-init
**Lineage:** 5cb2b1e8-ce36-4c9d-ad59-48207eea6b20

Adjust init's config rewrite behavior so projects do not lose a custom `crew_url` when `ninthwave init` is run again. Fresh init should still write the minimal default config, but reruns should carry forward an existing valid `crew_url` while continuing to reset generated boolean defaults.

**Test plan:**
- Add `initProject()` coverage for preserving an existing valid `crew_url` during a rerun.
- Add coverage that fresh init still emits only the default generated settings when no override exists.
- Verify the existing overwrite behavior for `review_external` and `schedule_enabled` still resets those booleans to init defaults.

Acceptance: Fresh `ninthwave init` does not invent `crew_url`, but rerunning init on a repo with a valid existing override keeps that URL while regenerating the managed boolean settings.

Key files: `core/commands/init.ts`, `test/init.test.ts`

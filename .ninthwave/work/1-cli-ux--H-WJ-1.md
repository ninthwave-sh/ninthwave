# Fix: Crew code validation to match cloud broker format (H-WJ-1)

**Priority:** High
**Source:** Plan: Streamline nw watch Interactive Journey
**Depends on:** None
**Domain:** cli-ux

The client-side crew code validation pattern `CREW_CODE_PATTERN` in `core/commands/crew.ts` is `/^[a-z]+-[a-z]+$/` (lowercase alpha only, variable length), but the cloud broker (`ninthwave-cloud/apps/broker/src/index.ts:8-14`) generates codes in `[A-Za-z0-9]{3}-[A-Za-z0-9]{3}` format (mixed case + digits, always 3+3). Update the pattern and `isCrewCode()` to match the actual format. Also update the WebSocket URL pattern in `core/mock-broker.ts` if it uses a different regex for crew code routing.

**Test plan:**
- Update `test/crew-command.test.ts` validation tests: accept `xK2-9fB`, `ABC-XYZ`, `a1B-c2D`; reject `abc-xyz` (wrong -- actually this is valid too), `abcd-efgh` (too long), `ab-cd` (too short), `abc` (no hyphen), `ABC-XY1Z` (4 chars)
- Verify `isCrewCode()` returns true for codes matching `[A-Za-z0-9]{3}-[A-Za-z0-9]{3}` and false for everything else
- Check mock-broker WebSocket route regex matches the updated pattern

Acceptance: `CREW_CODE_PATTERN` matches `[A-Za-z0-9]{3}-[A-Za-z0-9]{3}`. `isCrewCode()` validates correctly. All crew-command tests pass. Mock broker route pattern is consistent.

Key files: `core/commands/crew.ts`, `core/mock-broker.ts`, `test/crew-command.test.ts`

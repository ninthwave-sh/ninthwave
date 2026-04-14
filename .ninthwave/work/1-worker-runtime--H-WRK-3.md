# Fix: Strengthen the non-Claude worker wait contract (H-WRK-3)

**Priority:** High
**Source:** Approved plan 1776189941462-playful-river
**Depends on:** H-WRK-2
**Domain:** worker-runtime
**Lineage:** e46e80ef-d771-46e0-a418-c7dce779afbb

OpenCode, Codex, and Copilot sometimes complete the visible implementation work and then ignore the tail end of the prompt that tells them to stay alive for inbox-driven follow-up. Strengthen the launched runtime prompt for non-Claude tools so it explicitly says not to exit after implementation, to re-run `nw inbox --wait` if it exits or times out, and to remain available until the orchestrator delivers follow-up work or closes the session. Keep Claude behavior unchanged in this item.

**Test plan:**
- Extend `test/ai-tools.test.ts` to assert the stronger idle and wait instructions are appended for `opencode`, `codex`, and `copilot`
- Verify the Claude launch payload remains unchanged so existing Claude behavior is preserved
- Extend `test/init.test.ts` only if the canonical implementer wording also changes and seeded agent artifacts must stay aligned

Acceptance: non-Claude launch payloads include explicit instructions to remain alive after implementation, use `nw inbox --check` during active work, rerun `nw inbox --wait` if it exits without a real message, and not treat silence as permission to stop. Claude launch payloads remain unchanged. Existing inbox-driven follow-up phases remain additive rather than replaced.

Key files: `core/ai-tools.ts`, `agents/implementer.md`, `test/ai-tools.test.ts`, `test/init.test.ts`

# Fix: Eliminate double Start in Claude worker sessions (H-WR-4)

**Priority:** High
**Source:** Dogfooding observation 2026-03-28 (screenshot showing duplicate Start messages)
**Depends on:** None
**Domain:** worker-reliability

When launching Claude Code workers, "Start" appears twice in the conversation. After `launchAiSession` spawns the `claude` process, `sendWithReadyWait` sends "Start" via cmux paste-buffer and polls for processing indicators. If verification times out -- e.g. Claude shows "Herding..." which is not in `PROCESSING_INDICATORS` -- the retry loop sends "Start" again, interrupting the worker mid-flight.

Fix by passing "Start" as a positional CLI argument (`claude ... -- Start`) and setting `initialPrompt = ""` to skip the post-launch send entirely. This mirrors the Copilot pattern (launch.ts line 231). Also add "Herding" to `PROCESSING_INDICATORS` for health monitoring accuracy.

**Test plan:**
- Update existing Claude command construction tests in `test/launch.test.ts` to verify `-- Start` is in the command string and `sendMessage` is not called post-launch (follow Copilot's test pattern at lines 1061-1076)
- Add regression guard: verify OpenCode still uses `sendMessage` for post-launch prompt delivery
- Add "Herding" to processing indicator tests in `test/worker-health.test.ts` (follow pattern at lines 106-160)
- Run `bun test test/` -- all tests pass

Acceptance: Claude command includes `-- Start` as positional argument. No `sendMessage` call occurs after Claude launch. OpenCode path unchanged (still uses `sendWithReadyWait`). "Herding" detected as processing indicator. All tests pass.

Key files: `core/commands/launch.ts:207-210`, `core/worker-health.ts:35-56`, `test/launch.test.ts`, `test/worker-health.test.ts`

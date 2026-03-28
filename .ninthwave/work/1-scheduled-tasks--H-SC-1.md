# Feat: Schedule file parser, cron evaluator, and types (H-SC-1)

**Priority:** High
**Source:** Scheduled tasks feature plan (CEO + Eng reviewed 2026-03-28)
**Depends on:** None
**Domain:** scheduled-tasks

Add the ScheduledTask type and the parsing/evaluation modules that all other schedule work items depend on.

1. Add `ScheduledTask` interface to `core/types.ts` with fields: id (slug-style), title, schedule (raw expression), scheduleCron (normalized 5-field cron), priority, domain, timeout (ms, default 30min), prompt (body text), filePath, enabled (boolean).

2. Create `core/schedule-files.ts` mirroring the `work-item-files.ts` parsing pattern:
   - `parseScheduleFile(filePath)` -- extract ID from heading parentheses, parse `**Schedule:**`, `**Priority:**`, `**Domain:**`, `**Timeout:**`, `**Enabled:**` fields. Return null on malformed files.
   - `listScheduledTasks(scheduleDir)` -- read all `.md` files from `.ninthwave/schedules/`, parse each, return valid ScheduledTask[].

3. Create `core/schedule-eval.ts` (~200 lines, no external dependencies):
   - `parseScheduleExpression(expr)` -- convert natural language to 5-field cron. Supported patterns: `every Nh`/`every Nm` (anchored to midnight), `every day at HH:MM`, `every weekday at HH:MM`, `every <weekday> at HH:MM`, `cron: <5-field>`. Reject unrecognized patterns with error.
   - `matchesCronField(field, value)` -- match wildcard (*), specific value, range (1-5), list (1,3,5), step (*/15). Handle day-of-week OR semantics with day-of-month (cron spec: fields 3+5 are OR'd when both are non-wildcard).
   - `isDue(cronExpr, lastRunAt, now)` -- check if task should fire. 2-minute window for tolerance. Skip if lastRunAt is in the current minute (double-fire prevention).
   - `nextRunTime(cronExpr, after)` -- compute next occurrence after a given time. Used for `nw schedule` list display.

**Test plan:**
- `test/schedule-files.test.ts`: parse valid file with all fields, parse file with defaults only, parse file missing Schedule field (returns null), parse file missing heading (returns null), parse disabled file (enabled=false), listScheduledTasks with mixed valid/invalid files
- `test/schedule-eval.test.ts`: natural language conversion for each supported pattern, rejection of unsupported patterns, cron field matching for each type (wildcard, specific, range, list, step), day-of-week OR semantics (both day-of-month and day-of-week non-wildcard), isDue with never-run/due/not-due/already-ran-this-minute, 2-minute window edge cases, DST spring-forward (2:30 schedule skipped), DST fall-back (1:30 fires once via lastRunAt dedup), nextRunTime with minute/hour/day rollover

Acceptance: `parseScheduleFile` correctly parses the documented file format. `parseScheduleExpression` handles all 5 natural language patterns plus raw cron. `isDue` correctly evaluates all 5 cron fields including day-of-week OR semantics. All tests pass.

Key files: `core/types.ts`, `core/schedule-files.ts`, `core/schedule-eval.ts`, `core/work-item-files.ts` (reference pattern), `test/schedule-files.test.ts`, `test/schedule-eval.test.ts`

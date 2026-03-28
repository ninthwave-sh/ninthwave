# Feat: Init scaffolding for schedules directory (H-SC-2)

**Priority:** High
**Source:** Scheduled tasks feature plan (CEO + Eng reviewed 2026-03-28)
**Depends on:** None
**Domain:** scheduled-tasks

Add `.ninthwave/schedules/` directory scaffolding to `nw init` with 1-2 disabled example schedule files that show users the format.

1. In `core/commands/init.ts`, add to the `scaffold()` function (after the existing `.ninthwave/` directory creation around line 670):
   - Create `.ninthwave/schedules/` directory
   - Write an example file `ci--example-daily-audit.md` with `**Enabled:** false` showing the schedule file format (daily cron schedule, example prompt about auditing test results)
   - Only create example files if the directory is newly created (idempotent -- don't overwrite existing schedules on re-init)

2. The example file should demonstrate: heading with slug ID, Schedule field with natural language, Priority, Domain, Timeout, Enabled=false, and a realistic prompt body.

**Test plan:**
- Extend `test/init.test.ts`: verify `scaffold()` creates `.ninthwave/schedules/` directory, verify example file is written with correct format, verify re-running scaffold does not overwrite existing schedule files (idempotent)

Acceptance: Running `nw init` on a fresh project creates `.ninthwave/schedules/` with a disabled example file. Running `nw init` again does not overwrite user-created schedule files.

Key files: `core/commands/init.ts`, `test/init.test.ts`

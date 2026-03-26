# Feat: CloudWatch Alarms task backend (M-CWA-1)

**Priority:** Medium
**Source:** Phase E vision — expand surface area. CloudWatch is the third major observability backend (alongside Sentry and PagerDuty already shipped), completing the production signal pipeline for AWS shops.
**Depends on:**
**Domain:** backends

## Context

Production incidents from CloudWatch Alarms should automatically become ninthwave work items, just like Sentry issues and PagerDuty incidents. CloudWatch is the canonical observability tool for AWS-hosted services.

The pattern is identical to the PagerDuty backend (`core/backends/pagerduty.ts`): list active items, convert to `TodoItem`, resolve on PR merge via a `StatusSync` implementation.

## Requirements

1. Create `core/backends/cloudwatch.ts` implementing `TaskBackend` and `StatusSync`:
   - `listItems()`: call AWS CloudWatch `DescribeAlarms` API (via `aws cloudwatch describe-alarms --state-value ALARM --output json`) filtered by optional `alarmNamePrefix`
   - Map each alarm to `TodoItem`:
     - `id`: `CWA-{AlarmName}` (sanitized, hyphens for non-alphanumeric)
     - `title`: `AlarmName`
     - `domain`: `cloudwatch`
     - `priority`: map `AlarmActions` count → "high" if ≥1, "medium" otherwise; fall back to "medium"
     - `rawText`: include `Namespace`, `MetricName`, `ComparisonOperator`, `Threshold`, `StateReason` as structured description
   - `markDone(id)`: call `aws cloudwatch set-alarm-state` to set the alarm to OK state (best-effort; log warning if it fails)
2. Accept config keys from `.ninthwave/config.json`:
   - `cloudwatch_region`: AWS region (required)
   - `cloudwatch_alarm_prefix`: optional filter prefix for alarm names
   - `cloudwatch_profile`: optional AWS CLI profile name (passed as `--profile`)
3. Register the backend in `core/backends/index.ts` with key `"cloudwatch"`.
4. Wire into `core/commands/list.ts`: when `--backend cloudwatch` is passed, use the CloudWatch backend.
5. Wire into `core/commands/init.ts`: add CloudWatch to the backend selection prompt (alongside existing options).
6. Use `Bun.spawnSync` (matching the pattern in `pagerduty.ts` for CLI delegation) — call `aws` CLI directly rather than importing an SDK to keep zero-dependency policy.

Acceptance: `ninthwave list --backend cloudwatch` (with valid AWS credentials and CloudWatch alarms in ALARM state) returns work items. `ninthwave init` offers CloudWatch as a backend option. The backend is tested with injected CLI output (no AWS credentials required in CI). Region and prefix config keys are documented in a comment at the top of the backend file.

**Test plan:**
- Unit test: `parseAlarmOutput()` converts `DescribeAlarms` JSON to `TodoItem[]` correctly
- Unit test: alarm with no actions maps to "medium" priority
- Unit test: alarm name with special characters is sanitized in `id`
- Unit test: `StateReason` included in `rawText`
- Unit test: `cloudwatch_alarm_prefix` filter is passed as `--alarm-name-prefix` flag
- Unit test: `cloudwatch_profile` is passed as `--profile` flag when set
- Unit test: `markDone()` calls `set-alarm-state` with correct args
- Unit test: `markDone()` logs warning on non-zero exit, returns without throwing
- Edge case: empty alarm list — returns empty array without error
- Edge case: AWS CLI not installed — throws descriptive error

Key files: `core/backends/cloudwatch.ts` (new), `core/backends/index.ts`, `core/commands/list.ts`, `core/commands/init.ts`, `test/backends/cloudwatch.test.ts` (new)

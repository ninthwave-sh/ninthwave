# Feat: Route supervisor anomalies to webhook notifications (M-NTF-1)

**Priority:** Medium
**Source:** VISION.md — section D (LLM Supervisor, remaining items)
**Depends on:**
**Domain:** supervisor

## Context

The supervisor detects anomalies, friction, and process improvements during orchestration but currently only logs them to structured events and friction files. The existing webhook infrastructure (`core/webhooks.ts`) already supports Slack/Discord notifications for orchestrator lifecycle events (batch_complete, pr_merged, ci_failed, orchestrate_complete).

Wire supervisor observations into the webhook system so users get notified of anomalies and escalations in real-time, without checking logs.

## Requirements

1. Add two new `WebhookEvent` types: `"supervisor_anomaly"` and `"supervisor_escalation"`.
2. After `applySupervisorActions` in the orchestrate loop, fire a webhook for anomalies (if any) and escalations (if any). Debounce: at most one supervisor webhook per tick (don't spam one per anomaly).
3. Format the webhook payload with a clear Slack/Discord message summarizing: which items are affected, what the anomaly is, what action was taken (if any).
4. Respect the existing webhook configuration — uses the same `webhook_url` from `.ninthwave/config`. No additional configuration needed.
5. Add a `supervisor_notifications` config flag (default: `true` when supervisor is active) to allow disabling supervisor-specific webhooks without disabling the supervisor itself.

Acceptance: When the supervisor detects anomalies during an orchestration tick, a webhook notification is fired to the configured URL. Escalation actions also trigger notifications. Notifications are debounced to one per supervisor tick. The `supervisor_notifications` config flag controls this behavior. Existing webhook events are unaffected.

**Test plan:**
- Unit test: supervisor anomaly triggers webhook with correct event type and payload
- Unit test: supervisor escalation triggers webhook with correct event type and payload
- Unit test: empty anomalies/escalations do not trigger webhooks
- Unit test: `supervisor_notifications: false` config suppresses supervisor webhooks
- Unit test: debouncing — multiple anomalies in one tick produce one webhook
- Edge case: webhook URL not configured — supervisor notifications are silently skipped (no error)

Key files: `core/webhooks.ts`, `core/commands/orchestrate.ts`, `core/config.ts`

# TODOS

## API Service

### Feat: Add rate limiting (H-API-1)

**Priority:** High
**Source:** Platform review 2026-03-22
**Depends on:** None
**Repo:** target-repo-a

Add rate limiting middleware to the API gateway.

Acceptance: Rate limiting returns 429 after threshold.

Key files: `lib/gateway/rate_limiter.ex`

---

### Fix: Connection pool timeout (M-API-2)

**Priority:** Medium
**Source:** Eng review 2026-03-22
**Depends on:** H-API-1
**Repo:** target-repo-a

Fix intermittent connection pool timeout errors.

Acceptance: No more timeout errors in CI.

Key files: `config/test.exs`

---

## Web App

### Feat: Add onboarding flow (H-WA-1)

**Priority:** High
**Source:** Product review 2026-03-20
**Depends on:** None
**Repo:** target-repo-b

Add welcome flow for new users.

Acceptance: Onboarding flow renders on first login.

Key files: `src/components/Onboarding.tsx`

---

## Documentation

### Docs: Update ADR for rate limiting (M-DOC-1)

**Priority:** Medium
**Source:** Platform review 2026-03-22
**Depends on:** H-API-1

Record the rate limiting decision as an ADR.

Acceptance: ADR document added to docs/adr/.

Key files: `docs/adr/003-rate-limiting.md`

---

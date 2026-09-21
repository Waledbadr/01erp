# 19 — PHASE 18: PUBLIC API, WEBHOOKS & GLOBAL SEARCH

Depends on: Phases 01-17. Implements Master Prompt Part 11 (API: `/api/v1`, hashed revocable rate-limited keys, OpenAPI; webhooks signed with retry). Read `skills/tenant-security`, `skills/testing-standards`.

---

## A. PUBLIC API

- Versioned REST under `/api/v1`: read access to main resources (customers, suppliers, items, invoices, bills, payments, journals, trial balance) + create where safe, documented in OpenAPI/Swagger (interactive).
- API keys: hashed at rest, scoped (per-resource permissions), revocable, expirable, rate-limited per key, last-used tracked, every call logged (Master Prompt Part 9 audit).
- Server-side authorization identical to UI rules: keys obey roles/permissions/tenant guard exactly — a key can never exceed its creator's rights.

## B. WEBHOOKS

- Endpoints per company: URL, secret, subscribed events (invoice.posted, payment.received, purchase.posted, journal.posted, stock.low...), active flag.
- Delivery: HMAC-SHA256 signature + timestamp header, anti-replay window, event IDs with idempotency, exponential backoff retries (8 attempts), dead-letter state, manual retry UI. Events published via outbox pattern — never inside the posting transaction.

## C. GLOBAL SEARCH (Ctrl+K)

- Unified search across customers, suppliers, items, invoices, bills, journals — server-side, debounced, permission-filtered (results obey role visibility exactly, incl. no cost/margin leaks).
- Keyboard-first navigation, recent items, deep links. Mobile: dedicated search screen.

## D. PAGES

- Settings -> Integrations: API keys (shown once at creation, scopes, expiry, revoke), webhook endpoints + delivery log with retry actions, OpenAPI link. Search UI is global (not a page).

---

## TESTS (mandatory)

1. Key with narrow scope -> allowed endpoints 200, others 403; expired/revoked key -> 401 everywhere
2. Rate limit exceeded -> 429 with Retry-After header
3. Webhook signature valid -> accepted; tampered payload -> rejected; stale timestamp -> rejected (anti-replay)
4. Failing endpoint -> 8 backoff retries then dead-letter; manual retry works
5. Outbox: event published even if delivery fails; no event loss on posting-transaction rollback semantics
6. Tenant isolation: key of company A returns nothing of company B (API-level)
7. Ctrl+K respects permissions (Viewer sees no restricted results; no cost fields)
8. OpenAPI spec validates and matches implemented routes (test)

---

## DEFINITION OF DONE (Phase 18)

- [ ] All 8 test groups pass
- [ ] Keys hashed, scoped, logged; webhooks signed + retried + dead-lettered honestly
- [ ] Zero dead actions; mobile/RTL/LTR verified
- [ ] Regression green for Phases 00-17
- [ ] docs/API.md complete; PHASE_STATUS.md updated with evidence

Then run the Completion Audit (prompts/AUDIT-TEMPLATE.md).

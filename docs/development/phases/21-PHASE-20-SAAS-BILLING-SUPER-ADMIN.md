# 21 — PHASE 20: SAAS BILLING & SUPER ADMIN PLATFORM

Depends on: Phases 01, 02, 13, 14. Billing invoices post through the Phase 02 engine (G1/G2). Super Admin platform role seeded in Phase 01. Read `skills/accounting-engine`, `skills/tenant-security`.

---

## A. PLANS & SUBSCRIPTIONS

- Plan catalog: Free / Basic / Pro / Enterprise — price, billing cycle, limits (users, documents/month, storage, AI requests), feature flags. Plan changes never destroy data.
- Subscription state machine per company: Trialing -> Active -> Past Due -> Suspended (read-only) -> Canceled. **Suspension = READ-ONLY mode**: no data deletion, login works, all writes return a clear `READ_ONLY` state — restore is instant on payment.
- Usage metering ledger per company/period (users active, documents created, storage bytes, AI requests) — every number traceable to source records; overage warnings at 80% (via Phase 13), hard block at 100% for the specific limit only.

## B. BILLING

- Subscription invoices generated per cycle: computed via Phase 02 engine (Dr AR-subscriber / Cr Subscription Revenue + output VAT per mapping) — balanced, idempotent per cycle, reversible.
- Payment via gateway adapter; without credentials: explicit Not Configured (R1/R2 — no fake payments). Webhook confirmation is idempotent (duplicate webhook never double-activates).
- Company-facing Billing page: current plan, usage meters, invoices list, upgrade/downgrade, payment method status.

## C. SUPER ADMIN PLATFORM (separate surface)

- Dedicated Super Admin app area (platform role from Phase 01): companies list (plan, status, usage, MRR), suspend/reactivate with reason, impersonation NOT allowed; metrics dashboard (MRR, churn, active companies, usage totals).
- Data boundary: Super Admin sees company METADATA only — never invoices, journals, customers, or items of tenants. Exceptional support access requires a time-boxed, reasoned, audited grant (admin_access_grants) and every access is logged.
- Subscription events (created, past_due, suspended, restored) feed Phase 14 automation triggers.

## D. PAGES

- Tenant Billing & Subscription; Super Admin: companies, company detail (metadata), grants log, platform metrics. Read-only banner + write-blocking implemented system-wide for Suspended state.

---

## TESTS (mandatory)

1. Plan change -> limits apply immediately; cycle invoice posted via Phase 02 engine balances (VAT exact)
2. 80% usage -> warning notification (Phase 13); 100% -> specific action blocked with clear message, rest of system usable
3. Suspension -> every write endpoint 403 READ_ONLY, reads fine; payment webhook -> instant restore; duplicate webhook idempotent
4. Super Admin sees metadata; attempt to read a tenant's invoices -> 403 unless a valid grant exists; grant expiry cuts access; access logged
5. Tenant user cannot reach any Super Admin route (test)
6. Usage ledger numbers equal actual counts (property test)
7. Cancellation keeps all data readable/exportable; re-subscription restores everything (test)
8. Billing invoice idempotency: regenerating same cycle never duplicates the journal (sourceKey test)

---

## DEFINITION OF DONE (Phase 20)

- [ ] All 8 test groups pass
- [ ] Suspension is strictly read-only — zero data loss paths (auditor verifies)
- [ ] Billing flows through the real posting engine (grep: no parallel ledger)
- [ ] Zero dead actions; mobile/RTL/LTR verified
- [ ] Regression green for Phases 00-19
- [ ] PHASE_STATUS.md updated with evidence + declared payment-gateway dependency

Then run the Completion Audit (prompts/AUDIT-TEMPLATE.md).

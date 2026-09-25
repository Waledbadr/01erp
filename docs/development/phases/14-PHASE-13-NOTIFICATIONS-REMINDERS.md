# 14 — PHASE 13: NOTIFICATIONS & REMINDERS

Depends on Phases 01-12 (events exist to notify about).

---

## A. NOTIFICATION CENTER

- In-app notifications: typed events (invoice posted/paid, payment received, purchase events, expense approvals, low stock, negative stock, due soon, overdue, ZATCA failure, backup failure, email/webhook failures, approvals requested), priority levels, read/unread, mark-all-read, per-user preferences (which types, which channels), deep links to source.
- Optional push: architecture + adapter, feature-flagged (Not Configured default is acceptable; declare in PHASE_STATUS.md).

## B. COLLECTIONS & REMINDERS (G4-linked)

- Overdue/due-soon lists auto-sourced from ledger due dates.
- Reminder composer per customer (or bulk selection): statement attached, localized message templates with variables, preview, schedule (pre-due / due day / post-due / overdue, or custom), channels: email (real), WhatsApp/SMS via adapters (Not Configured if absent).
- Duplicate-send protection (same customer + same invoice + same template within window -> blocked with notice); full communication audit log.

## C. PAGES

- Notification center (filters, preferences), reminder composer + bulk send flow, communication log per customer.

---

## DEFINITION OF DONE (Phase 13)

- [ ] Every event type listed fires a real notification on its trigger (tests)
- [ ] Reminder flow: compose -> preview -> schedule -> send (or queue) -> logged (E2E)
- [ ] Duplicate-send protection works (test)
- [ ] Preferences suppress chosen types (test)
- [ ] Zero dead actions; mobile/RTL/LTR verified; regression green
- [ ] PHASE_STATUS.md updated

Then run the Completion Audit (prompts/AUDIT-TEMPLATE.md).

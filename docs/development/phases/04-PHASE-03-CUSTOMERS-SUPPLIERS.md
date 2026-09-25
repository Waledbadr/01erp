# 04 — PHASE 03: CUSTOMERS & SUPPLIERS

Depends on: Phases 01, 02. Read `skills/tenant-security/SKILL.md`.

---

## A. CUSTOMERS

- Fields: Arabic name, English name, type (Individual/Establishment/Company/Government/Foreign), VAT number, CR, Unified Number, mobile, email, address (structured, Saudi-ready), payment terms (Immediate / Net X / End-of-month + X / custom — consistent due-date calculation per Master Prompt), credit limit + credit status, credit-hold flag, cash-only flag, sales rep, account manager, customer group, price list reference, default discount %, tax category, status (Active/Suspended/Archived).
- **Duplicate prevention**: unique-per-tenant checks on VAT, CR, Unified Number, mobile — enforced by backend + DB constraints (nullable-unique pattern). Attempts produce clear localized messages identifying the existing record.
- **Ledger integration**: each customer auto-gets a subaccount under the Customers control account (via Account Mapping, Phase 02) at creation; customer balance is ALWAYS ledger-derived (G4) — no standalone balance column as truth.
- Credit control hooks (used by Phase 06): credit limit check, credit-hold block, cash-only enforcement — exposed as a service function, warning/block per company rule settings.

## B. SUPPLIERS

- Same data depth + Local/International/Non-VAT flag, supplier groups, tax category, payment terms, credit limit, price history (auto-recorded from purchase bills), attachments, contracts (stored as attachments with type).
- Auto subaccount under Suppliers control account.
- Suspended supplier blocks new purchases (backend-enforced; override with permission + reason + audit).

## C. SHARED PAGES (both, fully wired, RTL/LTR, mobile-first)

- List page: server-side search (name both languages, mobile, VAT, CR), filters (group, status, type, rep), status badges, sortable columns, pagination; mobile card layout.
- Create/Edit: tabbed form — Basic / Tax & Legal / Commercial / Attachments. Validation at UI + API + DB.
- Detail page: header (status actions), summary cards (ledger balance, open invoices count, overdue amount, YTD volume), tabs: Transactions (ledger-derived), Invoices, Payments & Allocations, Attachments, Timeline (document lifecycle events), Audit (visible to permitted roles).
- Suspended/archived parties: visible in lists with badge; blocked actions explain why; existing documents remain untouched.
- Merge: NOT in scope (declare in PHASE_STATUS.md).

## D. IMPORT / EXPORT (baseline version — full center in Phase 19)

- Import wizard per entity: template download, upload, preview, column mapping, validation (formats, duplicates against existing, cross-field rules), row-by-row errors (Arabic + English, row numbers), execute, batch report (created/updated/failed counts), batch log entry, rollback of the batch.
- Export: Excel + CSV of filtered list.
- Modes: Create Only / Update Only / Create+Update (keyed by VAT/mobile/SKU per entity rules).

---

## DEFINITION OF DONE (Phase 03)

- [ ] Create customer -> subaccount auto-created under control account (test verifies account + linkage)
- [ ] Duplicate VAT/CR/Unified/mobile rejected with informative message (tests, per-tenant isolation of duplicates)
- [ ] Customer balance on detail page equals ledger balance (assertion test against known journals)
- [ ] Payment terms engine: Net 30 / EOM+30 / custom produce correct due dates (table test)
- [ ] Suspended supplier purchase block enforced server-side; override path works with audit (test)
- [ ] Import: 500-row file with intentional duplicates/format errors -> correct batch report + rollback restores state (test)
- [ ] All pages pass mobile/RTL/LTR checks; zero dead actions
- [ ] Regression green for Phases 00-02
- [ ] PHASE_STATUS.md updated with evidence

Then run the Completion Audit (prompts/AUDIT-TEMPLATE.md).

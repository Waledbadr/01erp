# 03 — PHASE 02: ACCOUNTING CORE — CoA, PostING Engine, Periods, Opening Balances

Depends on: Phase 01. Read Master Prompt Parts 3 and 11, plus `skills/accounting-engine/SKILL.md`. This phase is the foundation of EVERYTHING financial — its correctness is the project's correctness.

---

## A. CHART OF ACCOUNTS

- Hierarchical CoA per company (accounts + subaccounts), Arabic AND English names, account type (Asset/Liability/Equity/Revenue/COGS/Expense), normal balance, allow posting flag (header vs posting accounts), active flag, sort order.
- Saudi-oriented default CoA seeded on company creation (Phase 01) — here it becomes fully manageable: add/edit/deactivate/reorder.
- **Account Mapping configuration** (per company): designated linked accounts for Customers control account, Suppliers control account, VAT Input, VAT Output, Sales, Sales Returns, Purchases, Purchase Returns, Inventory, COGS, Cash, Banks, Customer Advances, Supplier Advances, Rounding Differences, Retained Earnings, Depreciation, Accumulated Depreciation. All module logic resolves accounts via this mapping — NEVER hard-coded account IDs. Mapping editor page with completeness validation.
- Deletion rules: an account used by any posting rule or journal line can never be deleted (only deactivated). Enforced in backend + constraint.

## B. POSTING ENGINE (G1/G2 contract — implement exactly)

- `postJournal({ companyId, sourceType, sourceId, sourceKey, date, description, reference, costCenterId?, lines: [{accountId, debit, credit, description, branchId?}] })`
- Single DB transaction; reject if sum(debit) != sum(credit) (decimal-exact, per G7/G8).
- Idempotency: unique `(companyId, sourceType, sourceKey)` — duplicate calls return the existing journal, never create a second.
- **DB-level balance enforcement**: deferred constraint or trigger on journal lines so unbalanced data cannot exist even via direct SQL (defense-in-depth beyond app checks).
- Journals immutable once posted: no UPDATE of amounts/accounts on posted journals anywhere in codebase. Corrections ONLY via reversal journal (new journal, `reversesJournalId`). Search the codebase for any update path on posted journals and prove it does not exist (test).
- Concurrency-safe document numbering for journals (per G-consistent numbering config).
- Cost centers (schema + optional usage here; full UI in Phase 10).

## C. FINANCIAL PERIODS

- Fiscal years per company (start/end dates, status Open/Closed). Period = month within year (or per company config).
- Posting restricted to open periods; closed-period posting requires the special permission and is audit-logged with reason.
- Period close: no open-period override silently; close is explicit, confirmed, audited. Reopen requires permission + reason + audit.
- Year closing procedure: close revenue/COGS/expense accounts into Retained Earnings (closing journals, reversible), carry balances forward to next fiscal year opening.

## D. OPENING BALANCES

- Entry wizard per source type: Customers (as opening balance OR itemized open invoices), Suppliers (same), Cashboxes, Bank Accounts, Inventory (quantity + cost per warehouse — ties into Phase 05 stock layer), GL accounts.
- Excel/CSV import with the full wizard (upload, preview, mapping, validation, duplicate detection, row-by-row Arabic/English errors, batch report).
- Everything funnels through ONE balanced Opening Journals set per company; wizard refuses to finish while unbalanced (shows the exact difference).
- Opening journals are tagged (`sourceType: 'opening'`) and reversible as a set.

## E. MANUAL JOURNALS

- Screen with unlimited lines: account picker (tree search), debit/credit, line description, cost center (optional), reference, attachments (file security per Master Prompt Part 9).
- Real-time running totals + difference indicator; save disabled unless balanced (client convenience — backend still authoritative).
- Post requires Post/Approve permission; posted manual journals follow the same immutability + reversal rules.
- Draft manual journals may be edited/deleted freely until posted.

## F. PAGES (all fully wired)

- Chart of Accounts: tree/table with expand, search, add child, edit, deactivate; used-in-rules indicator.
- Account Mapping editor (with completeness checklist against Saudi defaults).
- Journal Vouchers: list (filters: date range, account, source type, period, status), detail view (lines, source document deep-link, reversal link if reversed).
- New Manual Journal (multi-line, balance indicator, attachments).
- Financial Periods: year/period grid, close/reopen with ConfirmDialog + reason.
- Opening Balances: per-source wizards + import + balance status dashboard.
- Year Closing: guided, with preview of closing journals BEFORE execution.

## G. TESTS (this phase is test-dense — non-negotiable)

Journal-correctness tests, each asserting exact accounts/amounts AND balance:

1. Cash sale (cash, revenue, output VAT)
2. Credit sale (AR, revenue, output VAT)
3. Customer receipt with allocation (cash, AR)
4. Full + partial payment of one invoice
5. Customer advance / unallocated receipt (cash, customer advances)
6. Overpayment
7. Sales return + credit note (full and partial)
8. Purchase + landed cost allocation (inventory, input VAT, AP; inventory cost reflects landed)
9. Accrued expense then payment (two journals)
10. Inventory adjustment (+/-) with reason
11. Opening balances set balancing enforcement (attempt unbalanced -> rejected)
12. Reversal-only rule: mutate posted journal -> impossible; reverse -> correct opposite entries
13. Idempotency: post same sourceKey twice -> one journal
14. Period close -> posting rejected; override with permission -> allowed + audited
15. DB-level: insert unbalanced lines directly (bypassing app) -> constraint rejects
16. Year closing: P&L zeroed, retained earnings correct, next-year opening balances carried

---

## DEFINITION OF DONE (Phase 02)

- [ ] All 16 test groups above pass; every journal in tests recomputed by hand matches
- [ ] DB-level balance constraint proven (test bypasses app layer and is rejected)
- [ ] No code path mutates a posted journal (test scans/enforces)
- [ ] Account mapping resolves 100% of module accounts; zero hard-coded account IDs (grep + test)
- [ ] Period close/reopen flows work with permissions + audit + reason
- [ ] Opening balances wizard refuses unbalanced completion; import produces correct row-level error reports
- [ ] All pages work Desktop/Mobile, RTL/LTR; zero dead buttons; zero placeholders
- [ ] Regression: Phases 00-01 checks still green (isolation tests included)
- [ ] docs/ACCOUNTING_RULES.md written completely; PHASE_STATUS.md updated with evidence

Then run the Completion Audit (prompts/AUDIT-TEMPLATE.md) — for this phase the auditor must hand-recompute at least 3 journals.

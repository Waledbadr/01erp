# 07 — PHASE 06: SALES — Quotations, Orders, Invoices, Receipts, Returns

Depends on: Phases 02-05. Read `skills/accounting-engine`, `skills/inventory-engine`, `skills/saudi-vat`, `skills/testing-standards`. The largest phase: every screen real, every journal exact.

---

## A. WORKFLOW & LIFECYCLE

- Chain: Quotation -> Sales Order -> Invoice -> Receipt -> Statement — any step skippable; invoice can be created directly.
- Lifecycle state machines (per document type, per Master Prompt Part 8): Draft -> Submitted -> Approved -> Posted -> Partially Paid -> Paid -> Closed; plus Cancelled / Reversed / Partially Returned / Fully Returned / Overdue (derived, not manual). Status transitions enforce consequences: Draft touches nothing; Posted posts journals + stock + VAT atomically; cancellation before posting deletes safely; after posting ONLY reversal/credit-note paths.
- Copy document -> new draft with current prices, recalculated VAT/discounts, new number; lineage recorded in audit.

## B. INVOICE ENGINE

- Lines: item-unit (conversion via Phase 04 utility), qty, unit price (pricing resolution from Phase 04 with source shown), line discount (% / fixed), charges lines (configurable types, taxable flag per tax rules), line VAT rate + amount (G8 line-level rounding), tax snapshot frozen at posting.
- Invoice totals computed ONLY by backend (G7): subtotal, discount total, charges, VAT, grand total — inclusive/exclusive display modes.
- Numbering: concurrency-safe per company (unique constraint; no gaps policy documented).
- Idempotency: client idempotency key on create/post; double-submit produces one invoice (test).
- Credit control integration (Phase 03 service): limit/hold/cash-only checks at posting: warn or block per company rule; override with permission + reason + audit.

## C. POSTING CONTRACT (all through Phase 02 engine, exact journals)

- Cash sale: Dr Cash/Bank, Cr Sales, Cr VAT Output (+ COGS: Dr COGS / Cr Inventory via stock issue)
- Credit sale: Dr AR (customer subaccount), Cr Sales, Cr VAT Output (+ COGS)
- Partial receipt with allocation: Dr Cash/Bank, Cr AR per allocation lines; unallocated portion -> Customer Advances
- Overpayment: excess -> Customer Advances (separate account per mapping)
- Sales return (full/partial, linked to original or standalone with permission): reverse revenue, reverse VAT output, restock at original/appropriate cost (stock movement + journal), Dr Sales Returns / Cr AR (or cash), COGS reversal; generates Credit Note document with its own lifecycle.
- Every posting uses Account Mapping (zero hard-coded IDs).

## D. RECEIPTS & ALLOCATIONS (G5)

- Receipt screen: customer, date, method (cash/cheque/bank transfer -> selects cashbox/bank account), amount, allocations table: FIFO suggestion (oldest due first / oldest first / manual) editable per line; unallocated remainder -> advance; overpayment handling.
- Reallocation tool (permission): move allocations between invoices with full audit.
- Cheque receipts feed Phase 08 cheque module.

## E. STATEMENTS (G4)

- Ledger-derived customer statement: date range, opening, transactions (invoices, receipts, credit/debit notes, adjustments) with running balance, closing; "Amount Due" phrasing for external view, Debit/Credit for accounting view; premium PDF (Phase 12 template engine), email/share hooks.

## F. PAGES (all fully wired, mobile-first)

- **Fast Sales Screen** (flagship): Customer -> scan/search item -> qty (unit switcher with conversion preview) -> price (with discount) -> payment -> save. Actions: Save, Save & Print, Save & PDF, Save & Email, Save & Share, Save & New. Advanced section collapsible (charges, rep, warehouse, due date, notes, attachments). Sub-2s flow on mobile; keyboard-first on desktop.
- Quotation / Sales Order / Invoice lists (filters: status, customer, date range, rep, payment status), create/edit (draft), detail with Timeline + lifecycle actions contextual to state.
- Invoice detail: premium layout, post/approve actions, collect payment shortcut, return shortcut, print/email/share, full audit view.
- Receipts list + create (allocation grid with FIFO suggestion) + detail.
- Sales returns list + create (link original invoice; pick lines/qty) + detail + credit note view.
- Customer statement page (filters -> preview -> PDF/Excel/share).
- Mobile quick actions: New Invoice, New Receipt, New Customer, New Expense (expense lands Phase 08 — add only if that phase exists; otherwise hide).

---

## TESTS (mandatory — hand-verifiable)

1. Cash sale full journal set (revenue, VAT, cash, COGS, inventory) with exact amounts
2. Credit sale + aging-consistent due date from payment terms
3. Partial payment allocation + remainder as advance; customer ledger balance exact
4. Full payment; invoice Paid; statement closing = 0
5. Overpayment -> advance; later allocation consumes it
6. Sales return partial: revenue/VAT/stock/COGS reversals exact; credit note lifecycle correct
7. Standalone return with permission + audit; without permission -> 403
8. Credit limit block + override with reason; cash-only customer credit sale blocked
9. Idempotent double-post -> one invoice
10. Tax snapshot: change tax config after posting -> old invoice unchanged (test)
11. Line rounding: mixed rates + inclusive line decomposes to expected per-line 2dp amounts
12. Copy document -> new number, current prices, lineage audit

---

## DEFINITION OF DONE (Phase 06)

- [ ] All 12 test groups pass; auditor hand-recomputes 3 journals
- [ ] Fast Sales Screen completes a cash sale end-to-end on mobile viewport in E2E
- [ ] Every lifecycle transition has a working UI action; zero dead buttons
- [ ] Zero hard-coded account IDs; mapping resolves everything (grep + test)
- [ ] Statements reconcile to the cent against ledger (test)
- [ ] RTL/LTR + mobile verified on all new pages
- [ ] Regression green for Phases 00-05
- [ ] PHASE_STATUS.md updated with evidence

Then run the Completion Audit (prompts/AUDIT-TEMPLATE.md).

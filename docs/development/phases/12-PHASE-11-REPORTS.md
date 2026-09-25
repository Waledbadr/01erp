# 12 — PHASE 11: REPORTS CENTER

Depends on: Phases 02-10. Reports read ONLY authoritative layers (ledger, movements ledger, tax ledger) — never module-side caches (G1/G3/G4).

---

## A. REPORT INFRASTRUCTURE

- Unified report framework: parameters schema -> server-side query -> tabular result -> render (screen table / export Excel / CSV / PDF / print). Save filter presets per user. Drill-down from any row to its source document.
- Heavy reports run async (job + notification) with a documented threshold; screen reports paginate server-side.

## B. FINANCIAL REPORTS

- Trial Balance (by period/range, hierarchy, opening/movement/closing, drill to ledger)
- General Ledger (account-centric, date range, running balance, source deep-links)
- P&L (period vs comparison period; by branch/cost center slicers where data exists)
- Balance Sheet (as-of date; retained earnings correct after year closing)
- Cash Flow (indirect method from ledger, documented mapping)
- Journal reports (all journals with filters; source-type breakdown)

## C. AR/AP REPORTS

- Customer/Supplier statements (G4), Aging buckets (current/30/60/90/120+, by due date), Overdue list with reminder action hooks, Balances summary, Customer profitability (revenue - COGS - allocated returns; permission-gated).

## D. SALES REPORTS

- Daily/Monthly/Annual summaries; by Customer/Item/Sales Rep/Branch/Payment Method/Price List; Invoice profit & Item profit (margin; gated by cost-permission per Part 10); returns analysis.

## E. INVENTORY REPORTS

- Stock valuation (current/as-of, by warehouse/category), Movement report (all sources, drill-down), Dead/slow-moving (no movement in X days, configurable), Best/worst sellers, Inventory aging (receipt-date based), low-stock report.

## F. VAT REPORTS (data from Phase 09)

- Sales VAT / Purchase VAT / Net position per period; by rate/category/customer/supplier/branch; VAT reconciliation (tax ledger vs GL, zero-difference assertion surfaced).

## G. PAGES

- Reports hub (grouped, searchable, favorite filters), each report screen: parameter panel -> result table -> export/print -> save filter. Mobile: parameter collapse + summary cards above table.

---

## DEFINITION OF DONE (Phase 11)

- [ ] Every report's totals reconcile to the cent against known seeded journals (assertion tests per report family)
- [ ] Drill-down opens the real source document
- [ ] Exports produce valid Excel/CSV (content-tested); PDFs render Arabic correctly in RTL (visual E2E)
- [ ] At least one heavy report runs async via job (test)
- [ ] Cost/margin reports hidden from unauthorized roles incl. API (test)
- [ ] Zero dead actions; mobile/RTL/LTR verified
- [ ] Regression green
- [ ] PHASE_STATUS.md updated

Then run the Completion Audit (prompts/AUDIT-TEMPLATE.md) — auditor recomputes 3 reports by hand from raw journals.

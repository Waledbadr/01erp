# 11 — PHASE 10: FIXED ASSETS & COST CENTERS

Depends on: Phases 02, 08. Read `skills/accounting-engine`.

---

## A. FIXED ASSETS

- Asset register: asset number (auto, concurrency-safe), name (AR/EN), category, purchase date, purchase cost (links to a purchase/expense or standalone acquisition journal), useful life (months), residual value, status (Active/Disposed), branch, cost center, location notes, attachments (invoices, warranty).
- **Straight-line depreciation**: monthly run (manual with permission or scheduled job — document choice in DECISIONS.md): Dr Depreciation Expense / Cr Accumulated Depreciation per asset; exact decimals; never depreciates below residual.
- Depreciation history per asset (each run journaled + auditable); book value = cost - accumulated (ledger-derived, G1).
- Disposal: sale (proceeds, gain/loss computed vs book value -> journaled P&L line) or scrapping (loss). Asset closed; audit complete.
- Acquisition via Phase 07/08 flows automatically registers when category mapping says so; standalone acquisition journal supported.

## B. COST CENTERS

- CRUD + optional usage across journals, expenses, revenue lines, assets; cost-center filter in reports (Phase 11); P&L by cost center report.

## C. PAGES

- Assets list (status, book value, accumulated depreciation), asset card (details + depreciation schedule table + history + disposal action), run depreciation screen (preview journals before executing), cost centers CRUD.

---

## TESTS (mandatory)

1. Asset 120,000, 5y life, no residual -> monthly 2,000 exact; 12 months -> accumulated 24,000; book value correct
2. Depreciation run journaled per asset; re-run same period idempotent/blocked (no double depreciation)
3. Sale above book value -> gain journal exact; below -> loss; scrapping -> loss
4. Asset linked from purchase flow gets correct acquisition journal
5. Cost center P&L slices sum to company P&L (property test)

---

## DEFINITION OF DONE (Phase 10)

- [ ] All 5 test groups pass; auditor recomputes a depreciation schedule by hand
- [ ] Book values equal ledger-derived amounts (test)
- [ ] Zero dead actions; mobile/RTL/LTR verified
- [ ] Regression green
- [ ] PHASE_STATUS.md updated

Then run the Completion Audit (prompts/AUDIT-TEMPLATE.md).

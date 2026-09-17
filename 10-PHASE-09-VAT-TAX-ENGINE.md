# 10 — PHASE 09: VAT & TAX ENGINE

Depends on: Phases 02, 06, 07 (or run after them). Read `skills/saudi-vat` — this phase makes it the system-wide truth.

---

## A. TAX ENGINE

- Rate registry: 0%, 5%, 15%, Exempt, Out of Scope + custom rates (future) — per-company effective dates (schema supports; activation optional).
- Tax determination: item tax category (optional) x customer/supplier category x transaction type x company defaults — resolution order documented in VAT_ZATCA_RULES.md.
- Inclusive/exclusive handling with exact decomposition (G7/G8); per-line VAT rounded 2dp half-up; totals = sum of rounded lines (no silent redistribution); rounding differences -> rounding account.
- **Tax Snapshot**: every posted document freezes resolved rate, category, and computed tax per line — later config changes never alter posted documents (test proves).
- Credit/debit notes reverse tax exactly matching the original snapshot.

## B. VAT LEDGER & REPORTS DATA

- Tax ledger per company (derived from posted journals): output VAT (sales, adjustments, credit notes), input VAT (purchases, expenses, landed cost, returns), net position per period.
- Period VAT summary: sales VAT, purchase VAT, net payable/refundable — matching GL tax accounts to the cent (reconciliation report per G3).
- By-dimension data ready for Phase 11 reports: by rate, category, customer, supplier, branch, invoice.

## C. VAT SETTINGS PAGE

- Default rate, inclusive/exclusive default, tax categories CRUD, rounding behavior display, snapshot policy explanation — with validation and audit on change.

---

## TESTS (mandatory)

1. Every Phase 06/07 scenario re-run asserting tax amounts to the cent
2. Inclusive decomposition: known multi-line invoice -> exact per-line net/tax/gross
3. Mixed rates on one invoice (5% + 15% + zero + exempt) -> exact totals
4. Rounding: constructed amounts producing half-cent cases -> deterministic expected results
5. Config change after posting -> snapshots unchanged
6. Credit note tax == original tax (multiple rates)
7. VAT ledger reconciliation vs GL (zero difference, including returns and landed cost input VAT)
8. Determination order: item override vs customer category vs default — precedence table test

---

## DEFINITION OF DONE (Phase 09)

- [ ] All 8 test groups pass
- [ ] VAT reconciliation report shows zero difference on a seeded mixed dataset (auditor verifies)
- [ ] Zero dead actions; RTL/LTR verified
- [ ] Regression green for all previous phases
- [ ] docs/VAT_ZATCA_RULES.md complete; PHASE_STATUS.md updated

Then run the Completion Audit (prompts/AUDIT-TEMPLATE.md).

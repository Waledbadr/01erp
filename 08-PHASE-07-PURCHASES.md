# 08 — PHASE 07: PURCHASES — PR, PO, GRN, Bills, Landed Cost, Returns

Depends on: Phases 02-05. Read `skills/accounting-engine`, `skills/inventory-engine`, `skills/saudi-vat`.

---

## A. WORKFLOW & LIFECYCLE

- Purchase Request -> Purchase Order -> GRN (goods receipt) -> Supplier Bill -> Payment — any step skippable; standalone supplier bill supported.
- States: Draft/Submitted/Approved/Posted/Partially Paid/Paid/Closed; Cancelled; Reversed; return states. Draft touches nothing; Posted posts AP + inventory (via receipt) + input VAT atomically.
- Ordered / Received / Remaining quantities tracked per PO line across multiple GRNs; receiving beyond ordered qty blocked by default (company rule: warn or block; override with permission + reason + audit).

## B. RECEIVING & LANDED COST INTEGRATION

- GRN: lines, qty by unit (conversion via Phase 04), warehouse, batch/expiry fields (schema-ready), attachments (delivery note photos).
- Receipt triggers stock movement (Phase 05 service) + WAC update.
- Landed cost entry attaches to GRN/bill: allocation engine per Phase 05 (I3) — quantity/value/weight/volume/percentage/manual; adjusted costs feed WAC; journals Dr Inventory / Cr AP-or-Cash.

## C. 3-WAY MATCHING

- Optional per company setting. Compare PO <-> GRN <-> Supplier Bill per line: quantity and price variances highlighted; policy: warn or block posting on mismatch; authorized override with permission + reason + audit.
- Matching report shows the three documents side by side with variance flags.

## D. SUPPLIER BILL & POSTING CONTRACT

- Credit purchase: Dr Inventory (at landed-adjusted cost), Dr VAT Input, Cr AP (supplier subaccount)
- Cash purchase: same with Cr Cash/Bank
- Partial/full supplier payments with allocation (G5 engine, oldest-first suggestion, advances, reallocation)
- Purchase return (full/partial/linked/standalone with permission): reverse inventory (movement + journal), reverse input VAT, Dr AP / Cr Purchase Returns; linked debit note document with lifecycle.

## E. PRICE HISTORY

- Every posted bill line records supplier-item-unit price; supplier detail shows price history table and last-price hint on new PO/bill lines.

## F. PAGES (all fully wired)

- PR / PO / GRN / Supplier Bill / Purchase Return: lists (status, receiving progress bars), create/edit drafts, detail with Timeline, contextual lifecycle actions.
- Receiving screen: from PO (pre-filled remaining) or ad-hoc; scan-friendly qty entry; warehouse selection; immediate variance flags vs PO.
- Landed cost entry screen: attach to receipt, cost lines, allocation method preview with per-line adjusted costs before posting.
- 3-Way Matching report (side-by-side + variance highlighting + override action).
- Supplier payments list/create (allocation grid) + reallocation tool.
- Supplier statement page (G4 quality, same as customer).

---

## TESTS (mandatory)

1. PO 100 -> GRN 60 + 40 -> remaining math exact
2. Over-receive blocked; override works with audit
3. Purchase + landed cost: journals + WAC final exactly (100 @ 10 + 200 freight -> 12/unit end-to-end through posting)
4. Input VAT journal exact; VAT report data correct
5. 3-way match: qty + price mismatches detected; block per policy; override with reason
6. Partial then full supplier payment with allocation; supplier ledger exact
7. Purchase return: inventory/VAT/AP reversals exact; debit note lifecycle
8. Price history records and displays last purchase price
9. Standalone supplier bill (no PO) posts correctly
10. Idempotent double-post -> one bill

---

## DEFINITION OF DONE (Phase 07)

- [ ] All 10 test groups pass; WAC after landed cost hand-verified by auditor
- [ ] Receiving flow works scan-first on mobile viewport (E2E)
- [ ] 3-way matching report functional with real override flow
- [ ] Zero dead actions; mobile/RTL/LTR verified
- [ ] Regression green for Phases 00-06
- [ ] PHASE_STATUS.md updated with evidence

Then run the Completion Audit (prompts/AUDIT-TEMPLATE.md).

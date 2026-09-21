# 20 — PHASE 19: IMPORT / EXPORT CENTER

Depends on: Phases 03, 06, 07 (baseline per-entity wizards already exist — this phase UNIFIES them into one center and adds the full pipeline + movements import). Read `skills/testing-standards`. Master Prompt Part 11 imports/exports rules apply.

---

## A. UNIFIED PIPELINE (all imports)

- One wizard for every template: Upload -> Preview (first N rows + column detection) -> Mapping (file column -> system field, saved per template) -> Validation (row-by-row Arabic/English errors with row numbers) -> Commit / Rollback.
- **No write before explicit Commit.** Entire commit runs in ONE database transaction — any row failure rolls back everything (no silent partial imports). Unique constraint conflicts produce clear row errors.
- Batch report per job (created/updated/failed counts) + downloadable error report. Rollback removes everything the batch created (including its journals/stock — verified by test).

## B. TEMPLATES

- Master data: customers, suppliers, items (+ units/barcodes/prices), accounts, opening balances.
- Movements: sales invoices (with lines), purchase bills (with lines), payments with allocations, journal entries, stock opening.
- Every template ships with a downloadable sample file; exports mirror imports (Excel/CSV) so round-trip is tested.

## C. MODES & RULES

- Create Only / Update Only / Create+Update keyed by stable business keys (VAT/mobile for parties, SKU for items, document number for movements) — per-entity rules documented.
- Validation covers formats, references (customer exists? account exists? period open per G6?), duplicates, and cross-field rules (e.g., VAT number format). Opening balance sets must balance before commit (G1).
- Everything tenant-scoped; imported rows never carry a companyId column — the active tenant decides.

## D. PAGES

- Import center: jobs list (template, status, stats, error report download, rollback action) + wizard. Export center: resource picker -> filters -> format -> download. Both RTL/LTR, mobile-card layouts.

---

## TESTS (mandatory)

1. Valid customer/item import -> commit -> rows exist, tenant-correct; stats exact
2. File with 3 bad rows -> validation report identifies rows + reasons; commit blocked until fixed
3. Induced DB failure mid-commit -> full rollback, zero residue (test)
4. Rollback after successful commit -> all created records + their journals/stock removed (test)
5. Unbalanced opening balances -> rejected with exact difference shown (G1)
6. Duplicate keys in Update mode -> correct records updated; in Create mode -> clear row errors
7. Export with filters -> file contains exactly the filtered set (test)
8. Round-trip: export then re-import produces zero diffs (test)

---

## DEFINITION OF DONE (Phase 19)

- [ ] All 8 test groups pass; auditor imports a real-world messy file and reads the error report
- [ ] Zero partial-import possibility (transactional commit proven)
- [ ] Baseline wizards from Phases 03/06/07 replaced by this center (no duplicate paths — verify by scan)
- [ ] Zero dead actions; mobile/RTL/LTR verified
- [ ] Regression green for Phases 00-18
- [ ] PHASE_STATUS.md updated with evidence

Then run the Completion Audit (prompts/AUDIT-TEMPLATE.md).

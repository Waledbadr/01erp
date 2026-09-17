# 05 — PHASE 04: ITEMS, UNITS, WAREHOUSES & BARCODES

Depends on: Phases 01, 02. Read `skills/inventory-engine/SKILL.md` (identity model + conversion math).

---

## A. ITEMS

- Fields: Arabic name, English name, SKU (unique per tenant), category (hierarchical), brand, origin country, image (secure upload per Master Prompt Part 9), description, active/inactive, sales/purchase/inventory unit defaults, reorder point + minimum stock (per warehouse defaults), tax category (optional per Master Prompt), barcode aliases at item level if needed.
- SKU + per-unit barcode uniqueness per tenant (constraints).

## B. UNITS & ITEM-SPECIFIC CONVERSIONS

- Global unit catalog (Piece, KG, Box, Carton, Liter, Meter...) + **item-specific conversion factors**: Apple: 1 BOX = 12 KG; Orange: 1 BOX = 15 KG (I1). Base unit per item; all stock quantities stored in base-unit equivalents.
- Per item-unit: conversion factor, sales price, purchase cost reference, barcode (I4 model), optional alias barcodes.
- Conversion math is centralized in one tested utility (toBaseQuantity / fromBaseQuantity) — no scattered conversion logic anywhere else (enforced by code review + test).

## C. WAREHOUSES & BRANCHES

- Multiple warehouses + branches per company (Phase 01 created the first ones); activate/deactivate; default per user.

## D. BARCODE SYSTEM

- Identity: PRODUCT -> PRODUCT UNIT -> BARCODE (primary + aliases; primary unique per unit per tenant).
- Instant search by barcode scan (keyboard-wedge scanners, camera scanning via getUserMedia where available), SKU, Arabic or English name — debounced server-side search respecting tenant + permissions.
- **Label printing**: barcode label designer — multiple sizes (e.g., 50x25, 100x50, Zebra-compatible templates), fields (name, price, SKU, barcode), batch printing with quantity per item, real PDF output.

## E. PRICING FOUNDATION

- Default price per item-unit + customer-specific pricing layer (customer + item-unit price, quantity breaks schema-ready, effective-date fields, manual override permission, full price history audit). Pricing resolution service: exact customer price -> price list -> default, with source explanation. Used by Phase 06.

## F. PAGES (fully wired)

- Item list: instant scan/search box, filters (category, brand, status), stock-on-hand summary column (from Phase 05 layer — zero-filled until then, clearly labeled).
- Item create/edit: tabs Basic / Units & Conversions (dynamic rows with conversion preview) / Prices / Barcodes & Labels / Attachments.
- Item detail: unit table with barcodes, price history, category path, low-stock indicator (once stock exists).
- Units catalog management; Warehouses & Branches management.
- Label printing studio (design + batch queue + PDF).
- Quick item create inline from sales screen is Phase 06 — do not build here.

---

## DEFINITION OF DONE (Phase 04)

- [ ] Two-unit item (Piece / Carton x12) converts correctly both directions — utility unit tests + API test
- [ ] Selling 1 Carton deducts 12 Pieces of base stock math via the shared utility (test) [stock ledger lands in Phase 05]
- [ ] Duplicate primary barcode per unit rejected; alias barcode resolves to correct item-unit (tests)
- [ ] Scan search returns correct item in <300ms on 10k-item catalog (seeded perf test)
- [ ] Customer-specific price overrides default; price history records changes (tests)
- [ ] Label PDF batch generates correct barcodes per unit (visual + scannable verification in E2E)
- [ ] Zero dead actions; mobile/RTL/LTR verified
- [ ] Regression green for Phases 00-02
- [ ] PHASE_STATUS.md updated with evidence

Then run the Completion Audit (prompts/AUDIT-TEMPLATE.md).

# 06 — PHASE 05: INVENTORY ENGINE — Movements, WAC, Landed Cost, Stocktake

Depends on: Phases 02, 04. Read `skills/inventory-engine/SKILL.md` fully — this phase implements it. Accounting integration follows G1-G3 and I1-I6.

---

## A. STOCK LEDGER

- Per (item, warehouse): quantity on hand (base units), WAC unit cost, total value. Row-level locking (SELECT ... FOR UPDATE) on stock row during every movement — serialized WAC per I2.
- **Movements ledger** (append-only): every change as a movement row — item, warehouse, quantity delta (base units), unit cost applied, resulting WAC, value delta, sourceType + sourceId (MANDATORY, FK-enforced per I5), user, timestamp, reason where applicable. Never update history; corrections are new movements.
- Stock as-of any date and cost as-of any date queries from the movements ledger (reports in Phase 11 use these).

## B. MOVEMENT TYPES

- Opening stock (wizard + import; journaled Dr Inventory / Cr Opening Equity per mapping)
- Purchase receipt (+; WAC recalculation; journaled with purchase bill per Phase 07 contract — here provide the stock-side service)
- Sales issue (-; at current WAC -> COGS journal feed per Phase 06 contract)
- Sales return (+; at original cost logic)
- Purchase return (-)
- Transfer between warehouses (two legs, value preserved — test total value unchanged)
- Adjustment +/- (mandatory reason; journaled per mapping; Damage/Waste/Loss as classified adjustment reasons)
- Stocktake: create count -> enter counted quantities (scan-friendly) -> variance report -> approve -> auto-generate adjustment movements + journals per variance line.

## C. WAC (I2) — EXACT ALGORITHM

On receipt of Q units at unit cost C into warehouse W (inside the stock-row lock):
newWAC = (oldQty * oldWAC + Q * C) / (oldQty + Q)

- Uses exact decimals (G7); rounding per G8.
- Issues and transfers move at current WAC (moving-average update on warehouse-out is NOT applied — document the chosen policy in INVENTORY_RULES.md).
- Negative result (issuing more than on hand) governed by I6 negative-stock setting: blocked by default; override requires permission + audit.

## D. LANDED COST (I3)

- Landed cost document attached to a purchase receipt/bill: cost lines (freight, customs, clearance, insurance, handling, other) with amount + allocation method.
- Allocation engine: by quantity, value, weight, volume, percentage, or manual per line — distributed to receipt lines, producing adjusted unit costs.
- Adjusted costs feed WAC (C above) so inventory reflects actual cost: purchase + allocated landed = actual cost (example in skill: 100 x 10 + 200 freight = 12/unit).
- Journaled: Dr Inventory / Cr Payable-or-Cash per landed cost line; full audit of allocation inputs.

## E. LOW STOCK & ALERTS

- Reorder point / minimum stock per item (per warehouse defaults from Phase 04); low-stock detection service + notification hooks (Phase 13 renders them; here the detection + test).

## F. PAGES (fully wired)

- Stock sheet: current stock by warehouse/item/category with quantities, WAC, value; filters; as-of-date picker.
- Opening stock wizard (grid entry + import) with valuation preview and balancing journals.
- Transfers: create (from/to warehouse, items, qty, unit with conversion), list with statuses, detail.
- Adjustments: create with mandatory reason; approval step; movement preview before post.
- Stocktake: create (scope: warehouse/category/items) -> count entry (barcode-first UI) -> variance review -> approve.
- Item movement history (from movements ledger) with source deep-links.

---

## TESTS (mandatory, exact numbers)

1. WAC: receive 100 @ 10 -> receive 100 @ 14 => WAC 12; issue 50 at 12; value correct at every step.
2. Two simultaneous receipts (parallel test) -> WAC correct, no lost update (proves row locking).
3. Transfer: total company inventory value unchanged.
4. Stocktake variance +5 / -3 -> movements + journals exactly right.
5. Landed cost: 100 @ 10 + 200 freight by quantity => WAC 12; journals balanced; allocation audit row exists.
6. Negative stock attempt -> rejected (default); override with permission -> allowed + audit entry.
7. Movement without source -> rejected by schema/API.
8. Stock as-of-date reconstructs a past snapshot exactly (test against movement sequence).
9. Sales-issue COGS feed produces correct journal (amount = qty x WAC at issue time).

---

## DEFINITION OF DONE (Phase 05)

- [ ] All 9 test groups pass with hand-verified numbers
- [ ] Concurrency test proves no lost WAC update under parallel receipts
- [ ] Movements ledger append-only (no mutation path exists — test)
- [ ] Landed cost allocation journaled and audited end-to-end
- [ ] Stock as-of queries exact
- [ ] All pages pass mobile/RTL/LTR; zero dead actions
- [ ] Regression green for Phases 00-04
- [ ] docs/INVENTORY_RULES.md complete; PHASE_STATUS.md updated with evidence

Then run the Completion Audit (prompts/AUDIT-TEMPLATE.md) — auditor recomputes WAC sequences by hand.

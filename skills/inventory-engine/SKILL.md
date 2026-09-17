---
name: inventory-engine
description: Rules and contract for the inventory movement model, perpetual weighted average cost (WAC), serialized row locking, base-unit conversions, landed cost allocations, stocktake, and negative stock prevention.
---

# Inventory Engine Skill (`skills/inventory-engine/SKILL.md`)

## 1. The Movement Model (Source-Mandatory)
Every physical quantity alteration in the warehouse must originate from a verified and persisted `StockMovement` transaction with a mandatory `sourceType` and `sourceId`. Free-floating or unlinked quantity increments or decrements are strictly forbidden.

### Movement Types:
- `PURCHASE_RECEIPT` (GRN): Increases physical stock, triggers WAC recalculation.
- `PURCHASE_RETURN`: Decreases stock at current WAC or purchase cost.
- `SALES_DELIVERY`: Decreases stock, issues COGS journal at current WAC.
- `SALES_RETURN`: Increases stock back into warehouse at return cost.
- `TRANSFER_OUT` & `TRANSFER_IN`: Inter-warehouse or in-transit stock movement.
- `STOCKTAKE_VARIANCE`: Reconciles physical count variance with explicit variance journal.
- `SCRAP_OR_LOSS`: Writes off damaged or expired goods to inventory shrinkage expense.

---

## 2. Perpetual Weighted Average Cost (WAC) Algorithm

### Formula:
$$\text{New WAC} = \frac{(\text{Current Qty} \times \text{Current WAC}) + (\text{Incoming Qty} \times \text{Effective Unit Cost})}{\text{Current Qty} + \text{Incoming Qty}}$$

### Serialized Execution Rule (No Race Conditions):
In high-throughput environments, multiple purchase receipts for the same item must NOT be calculated concurrently in uncoordinated threads.
```sql
-- Postgres Serialized Row Lock on Item Warehouse Record
SELECT current_qty, current_wac_cents
FROM item_warehouse_balances
WHERE tenant_id = $1 AND warehouse_id = $2 AND item_id = $3
FOR UPDATE;
```
Once the lock is acquired, recalculate the new WAC, commit the incoming movement, update the balance table, and release the lock.

---

## 3. Unit Conversion Math (Base-Unit Quantities)
All internal warehouse stock balances, movements, and ledger valuations are stored strictly in the item's **Base Unit** (Smallest indivisible inventory unit, e.g., "Piece" or "Gram").

### Rules:
1. Every secondary unit of measure (e.g., "Box", "Carton", "Pallet") must specify a fixed integer multiplier relative to the base unit:
   $$\text{Base Qty} = \text{Transaction Qty} \times \text{Conversion Ratio}$$
2. Transaction unit prices are normalized to base unit costs:
   $$\text{Base Unit Cost} = \frac{\text{Transaction Unit Price}}{\text{Conversion Ratio}}$$
3. Barcodes are permanently registered at the `(Item, Unit)` level (Rule I4). Scanning a barcode automatically identifies both the item identity and the conversion factor.

---

## 4. Landed Cost Allocation Methods
When additional shipping, customs duties, insurance, or freight charges are incurred on a shipment, they must be capitalized into the item inventory valuation before or after receipt:
1. **By Value (Monetary)**:
   $$\text{Allocated Share}_i = \text{Total Landed Cost} \times \frac{\text{Item}_i\text{ Purchase Value}}{\sum \text{Total Goods Purchase Value}}$$
2. **By Quantity (Base Units)**:
   $$\text{Allocated Share}_i = \text{Total Landed Cost} \times \frac{\text{Item}_i\text{ Base Qty}}{\sum \text{Total Shipment Base Qty}}$$
3. **By Weight / Volume**:
   Allocated proportionally based on recorded net weight or volume specs.

---

## 5. Negative-Stock Rules
Unless a tenant specifically enables a temporary pre-approved emergency backorder policy:
- **Default Policy**: Strict prohibition of negative physical inventory.
- Any outgoing transaction (sales delivery, transfer, write-off) that would cause `Current Qty - Outgoing Qty < 0` MUST be rejected with a `STOCK_INSUFFICIENT_EXCEPTION`.
- This prevents distortion of WAC denominators and distorted COGS calculations.

---

## 6. Stocktake & Cycle Count Flow
1. **Freeze/Snapshot**: Generate a stocktake sheet with system stock balances at timestamp $T$.
2. **Blind/Count Input**: Warehouse operators submit physical counts without seeing expected quantities.
3. **Variance Review**: System computes:
   $$\text{Variance Qty} = \text{Physical Count} - \text{System Book Qty}$$
4. **Approval & Posting**: Controller reviews variance. Posting creates a `STOCKTAKE_VARIANCE` movement and balanced General Ledger adjustment:
   - Positive variance: Debit Inventory, Credit Inventory Gain.
   - Negative variance: Debit Inventory Shrinkage/Loss, Credit Inventory.

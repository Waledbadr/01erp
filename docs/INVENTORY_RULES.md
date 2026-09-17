# Inventory Management & Valuation Rules — Saudi ERP

## 1. Core Principles (Golden Inventory Rules)

### I1. Full Traceability & Zero Orphan Movements
Every inventory movement must link to a valid source document (`PurchaseBill`, `SalesInvoice`, `StockTransfer`, `StockAdjustment`, `Stocktake`). Direct, unreferenced mutations to inventory balances are strictly forbidden.

### I2. Weighted Average Cost (WAC) Specification
Inventory valuation follows the perpetual Weighted Average Cost (WAC) method:
$$\text{New WAC} = \frac{(\text{Current Qty} \times \text{Current WAC}) + (\text{Incoming Qty} \times \text{Effective Unit Cost})}{\text{Current Qty} + \text{Incoming Qty}}$$

#### Concurrency & Serialization:
- In multi-user environments, two simultaneous purchase receipts for the same item could overwrite each other's WAC calculation.
- The engine enforces row-level locking (`SELECT ... FOR UPDATE` on the item stock record) during transaction execution.
- WAC updates are recorded in an audit movement log with previous cost, incoming cost, and resultant cost.

### I3. Multi-Unit Packaging & Conversions
- Every item has a primary **Base Unit** (e.g. "Piece" / "حبة" or "Kilogram" / "كيلوجرام").
- Items may have multiple **Secondary Units** (e.g. "Pack" / "بكت", "Carton" / "كرتون", "Pallet" / "طبلية").
- **Conversion factors are item-specific**:
  - Item A (Soda Can): 1 Carton = 24 Pieces.
  - Item B (Olive Oil): 1 Carton = 12 Bottles.
- Stock on hand is always tracked internally in the item's Base Unit quantity, while documents and reports display quantities in the selected unit.

### I4. Barcode Identity Architecture
```
+-------------------------------------------------------------+
|                      Base Product (Item)                    |
|                SKU: ITM-001 | Name: Tomato Paste            |
+------------------------------+------------------------------+
                               |
        +----------------------+----------------------+
        |                                             |
        v                                             v
+-------------------------------+             +-------------------------------+
|  Base Unit: Piece (حبة)        |             | Secondary Unit: Carton (كرتون)|
|  Factor: 1.0 (Base)           |             | Factor: 24.0                  |
|  Primary Barcode: 6281000001  |             | Primary Barcode: 6281000002   |
+-------------------------------+             +-------------------------------+
```
- A barcode is bound to an `(Item, Unit)` tuple.
- Scanning barcode `6281000002` at POS or warehouse entry automatically resolves both the item and quantity multiplier (24 pieces).

### I5. Landed Cost Allocation
Importing goods into Saudi Arabia incurs additional costs (customs duty, marine/air freight, clearance agent fees, municipal inspection fees).
The Landed Cost Engine allows distributing these costs onto purchase bill line items using four standard allocation algorithms:
1. **By Value (النسبة إلى القيمة)**: $\text{Line Additional Cost} = \text{Total Cost} \times \frac{\text{Line Total Net}}{\sum \text{Bills Total Net}}$
2. **By Quantity (النسبة إلى الكمية)**: $\text{Line Additional Cost} = \text{Total Cost} \times \frac{\text{Line Base Quantity}}{\sum \text{Total Base Quantity}}$
3. **By Weight / Volume (النسبة إلى الوزن أو الحجم)**: When item physical specs are recorded.
4. **Manual Explicit Entry (توزيع يدوي مخصص)**.

The effective unit cost used in WAC recalculation is:
$$\text{Effective Unit Cost} = \text{Invoice Unit Price} + \frac{\text{Allocated Landed Cost}}{\text{Line Quantity}}$$

### I6. Negative Stock Policy
- By default, transactions that would reduce warehouse stock below zero are blocked with an immediate validation error.
- If a tenant specifically activates "Allow Negative Stock" under Company Settings:
  - An explicit warning is displayed on the transaction screen.
  - An audit log event is recorded with the user ID, timestamp, and stock shortfall.
  - COGS for the negative portion is provisionally calculated using the last known WAC and flagged for automatic cost adjustment when replenishing stock arrives.

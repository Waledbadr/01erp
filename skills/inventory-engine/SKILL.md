---
name: inventory-engine
description: Apply source-linked stock movement, weighted average cost, and landed cost rules when implementing inventory.
---

# Inventory engine

Read before changing stock. Every immutable movement carries companyId, itemId, warehouseId, sourceType, sourceId, base-unit quantity, unit cost, and reversal link when applicable. Enforce source linkage in schema and validate source ownership. Convert entered quantity by the item's unit-specific exact factor into base units; never use a global box conversion. Lock the item/warehouse stock row with SELECT FOR UPDATE before any receipt or issue. Receipt WAC = (old quantity × old WAC + received quantity × actual unit cost) / new quantity, preserving high precision; zero remaining quantity resets cost policy explicitly. Issue uses locked pre-issue WAC. Block negative stock by default; an authorized company override emits warning and audit event.

Landed cost: allocate freight/customs/etc. by selected quantity, purchase value, weight, volume, percentage, or manual shares. Validate shares sum exactly; put deterministic rounding residual on a designated line and record allocation method. Add allocations to receipt cost before WAC update, or post a traceable value adjustment if receipt was already booked. Stocktake freezes/counts a scope, compares to a recorded snapshot, requires approval, and emits source-linked adjustment movements and ledger postings. Transfers produce paired issue/receipt movements with one transfer source and no silent value change. Reconcile stock valuation to the GL.

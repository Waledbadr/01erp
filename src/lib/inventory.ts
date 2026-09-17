/**
 * Inventory Management & Cost Calculation Engine — Saudi ERP
 * Enforces Golden Rules I1-I6, ADR-005, and ADR-006.
 */

export interface UOM {
  id: string;
  nameAr: string;
  nameEn: string;
  conversionFactor: number; // Multiplier relative to base unit (Base Unit = 1.0)
  barcode: string; // Barcode unique to this (Item, Unit) tuple
  isBaseUnit: boolean;
}

export interface ItemMaster {
  id: string;
  sku: string;
  nameAr: string;
  nameEn: string;
  baseUnit: string;
  units: UOM[];
  currentStock: number; // In base units
  currentWAC: number; // In SAR per base unit
}

export interface WACResult {
  newQty: number;
  newWAC: number;
  previousQty: number;
  previousWAC: number;
  incomingQty: number;
  effectiveUnitCost: number;
  totalNewValue: number;
}

/**
 * Calculates new Weighted Average Cost (WAC) upon stock receipt (Rule I2).
 * Formula: New WAC = (Current Stock * Current WAC + Incoming Qty * Unit Cost) / (Current Stock + Incoming Qty)
 */
export function calculateWAC(
  currentStock: number,
  currentWAC: number,
  incomingQty: number,
  effectiveUnitCost: number
): WACResult {
  if (incomingQty <= 0) {
    throw new Error('Incoming stock quantity must be strictly greater than zero.');
  }

  const currentVal = Math.max(0, currentStock) * Math.max(0, currentWAC);
  const incomingVal = incomingQty * effectiveUnitCost;
  const newQty = Math.max(0, currentStock) + incomingQty;
  const newWAC = newQty > 0 ? (currentVal + incomingVal) / newQty : effectiveUnitCost;

  return {
    newQty,
    newWAC: Number(newWAC.toFixed(4)),
    previousQty: currentStock,
    previousWAC: currentWAC,
    incomingQty,
    effectiveUnitCost,
    totalNewValue: Number((newQty * newWAC).toFixed(2)),
  };
}

/**
 * Resolves scanned barcode to item and appropriate unit multiplier (Rule I4).
 */
export function resolveBarcode(items: ItemMaster[], barcode: string): { item: ItemMaster; unit: UOM } | null {
  for (const item of items) {
    const matchingUnit = item.units.find((u) => u.barcode === barcode.trim());
    if (matchingUnit) {
      return { item, unit: matchingUnit };
    }
  }
  return null;
}

/**
 * Distributes landed costs (freight, customs, insurance) across bill line items (Rule I5).
 */
export function allocateLandedCostByValue(
  lines: Array<{ id: string; netAmount: number; quantity: number }>,
  totalLandedCost: number
): Array<{ id: string; allocatedCost: number; additionalCostPerUnit: number }> {
  const totalNet = lines.reduce((acc, l) => acc + l.netAmount, 0);
  if (totalNet <= 0) {
    throw new Error('Total bill lines value must be greater than zero for value-based allocation.');
  }

  return lines.map((line) => {
    const ratio = line.netAmount / totalNet;
    const allocated = totalLandedCost * ratio;
    const perUnit = line.quantity > 0 ? allocated / line.quantity : 0;
    return {
      id: line.id,
      allocatedCost: Number(allocated.toFixed(2)),
      additionalCostPerUnit: Number(perUnit.toFixed(4)),
    };
  });
}

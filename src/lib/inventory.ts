/**
 * Inventory Management & Cost Calculation Engine — Saudi ERP
 * Enforces Golden Rules I1-I6, ADR-005, and ADR-006.
 */

export interface UOM {
  id: string;
  nameAr: string;
  nameEn: string;
  conversionFactor: number; // Multiplier relative to base unit (Base Unit = 1.0)
  barcode: string; // Primary barcode unique to this (Item, Unit) tuple
  aliasBarcodes?: string[]; // Secondary / alias barcodes mapping to this unit
  isBaseUnit: boolean;
  salePrice?: number;
  wholesalePrice?: number;
  cost?: number;
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
  sellingPrice?: number;
  taxRate?: number;
  barcodeAliases?: string[];
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

// ==========================================
// 1. CENTRALIZED UNIT CONVERSION MATH
// ==========================================

/**
 * Converts a transactional quantity in any unit to its Base Unit equivalent.
 * Base Qty = Transaction Qty * Conversion Factor
 * Enforced across the entire platform — no scattered conversion math.
 */
export function toBaseQuantity(quantity: number, conversionFactor: number): number {
  if (conversionFactor <= 0 || !Number.isFinite(conversionFactor)) {
    throw new Error('Conversion factor must be strictly positive and finite.');
  }
  if (!Number.isFinite(quantity)) {
    throw new Error('Quantity must be a valid finite number.');
  }
  const result = quantity * conversionFactor;
  return Math.round((result + Number.EPSILON) * 10000) / 10000;
}

/**
 * Converts a Base Unit quantity back into a target secondary unit quantity.
 * Unit Qty = Base Qty / Conversion Factor
 */
export function fromBaseQuantity(baseQuantity: number, conversionFactor: number): number {
  if (conversionFactor <= 0 || !Number.isFinite(conversionFactor)) {
    throw new Error('Conversion factor must be strictly positive and finite.');
  }
  if (!Number.isFinite(baseQuantity)) {
    throw new Error('Base quantity must be a valid finite number.');
  }
  const result = baseQuantity / conversionFactor;
  return Math.round((result + Number.EPSILON) * 10000) / 10000;
}

/**
 * Deducts stock sold in a transactional unit from base unit inventory balance.
 * Example: Selling 1 Carton (factor 12) deducts 12 Pieces from base stock.
 */
export function deductBaseStock(
  currentBaseStock: number,
  transactionQty: number,
  conversionFactor: number
): number {
  const deductQty = toBaseQuantity(transactionQty, conversionFactor);
  const remaining = currentBaseStock - deductQty;
  return Math.round((remaining + Number.EPSILON) * 10000) / 10000;
}

/**
 * Converts quantity directly between two secondary units of the same item.
 */
export function convertBetweenUnits(
  quantity: number,
  fromFactor: number,
  toFactor: number
): number {
  const baseQty = toBaseQuantity(quantity, fromFactor);
  return fromBaseQuantity(baseQty, toFactor);
}

// ==========================================
// 2. PRICING RESOLUTION & CUSTOMER SPECIFIC PRICING
// ==========================================

export interface CustomerPriceRule {
  id: string;
  tenantId: string;
  customerId: string;
  customerNameAr?: string;
  itemId: string;
  itemSku?: string;
  itemNameAr?: string;
  unitId?: string; // Optional: applies to specific unit, or all units if empty
  unitNameAr?: string;
  unitPrice: number; // in SAR
  discountPercentage?: number;
  minQuantity?: number; // Quantity break threshold
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PriceHistoryRecord {
  id: string;
  tenantId: string;
  itemId: string;
  unitId?: string;
  unitNameAr?: string;
  oldPrice: number;
  newPrice: number;
  changeType: 'DEFAULT_UNIT_PRICE' | 'CUSTOMER_PRICE' | 'PRICE_LIST' | 'MANUAL_OVERRIDE';
  reason?: string;
  userId: string;
  userEmail: string;
  timestamp: string;
}

export interface PricingResolutionResult {
  unitPrice: number;
  source: 'CUSTOMER_SPECIFIC' | 'PRICE_LIST' | 'DEFAULT_UNIT_PRICE' | 'MANUAL_OVERRIDE';
  sourceExplanationAr: string;
  sourceExplanationEn: string;
  originalDefaultPrice: number;
  discountPercentage?: number;
  matchedRuleId?: string;
}

/**
 * Resolves item pricing hierarchy:
 * 1. Manual Override (if authorized)
 * 2. Exact Customer-Specific Pricing Rule (with quantity breaks and effective date check)
 * 3. Price List rule
 * 4. Default Item-Unit Price
 */
export function resolveItemPrice(params: {
  item: ItemMaster;
  unitId?: string;
  customerId?: string;
  customerRules?: CustomerPriceRule[];
  quantity?: number;
  priceListPrices?: Record<string, number>; // unitId -> price
  manualOverridePrice?: number;
  canManualOverride?: boolean;
  referenceDate?: string; // YYYY-MM-DD, defaults to today
}): PricingResolutionResult {
  const {
    item,
    unitId,
    customerId,
    customerRules = [],
    quantity = 1,
    priceListPrices,
    manualOverridePrice,
    canManualOverride = false,
    referenceDate = new Date().toISOString().split('T')[0],
  } = params;

  // Find target unit
  const targetUnit = unitId
    ? item.units.find((u) => u.id === unitId)
    : item.units.find((u) => u.isBaseUnit) || item.units[0];

  const defaultPrice = targetUnit?.salePrice !== undefined
    ? targetUnit.salePrice
    : (item.sellingPrice || 0) * (targetUnit?.conversionFactor || 1);

  // 1. Manual Override
  if (manualOverridePrice !== undefined && manualOverridePrice >= 0) {
    if (!canManualOverride) {
      throw new Error('Permission denied: User is not authorized to manually override prices (pricing:override:apply required).');
    }
    return {
      unitPrice: Number(manualOverridePrice.toFixed(2)),
      source: 'MANUAL_OVERRIDE',
      sourceExplanationAr: 'تعديل سعر يدوي مصرّح به',
      sourceExplanationEn: 'Authorized manual price override',
      originalDefaultPrice: defaultPrice,
    };
  }

  // 2. Customer Specific Pricing Rule
  if (customerId && customerRules.length > 0) {
    const applicableRules = customerRules.filter((r) => {
      if (!r.isActive) return false;
      if (r.customerId !== customerId) return false;
      if (r.itemId !== item.id) return false;
      if (r.unitId && targetUnit && r.unitId !== targetUnit.id) return false;

      // Quantity break check
      if (r.minQuantity && quantity < r.minQuantity) return false;

      // Effective dates check
      if (r.startDate && r.startDate > referenceDate) return false;
      if (r.endDate && r.endDate < referenceDate) return false;

      return true;
    });

    if (applicableRules.length > 0) {
      // Sort by highest minQuantity (most specific quantity break first), then latest created
      applicableRules.sort((a, b) => (b.minQuantity || 0) - (a.minQuantity || 0));
      const matched = applicableRules[0];

      let resolvedPrice = matched.unitPrice;
      let discountPct = matched.discountPercentage;

      if (matched.discountPercentage && matched.discountPercentage > 0) {
        resolvedPrice = defaultPrice * (1 - matched.discountPercentage / 100);
      }

      return {
        unitPrice: Number(resolvedPrice.toFixed(2)),
        source: 'CUSTOMER_SPECIFIC',
        sourceExplanationAr: matched.minQuantity && matched.minQuantity > 1
          ? `سعر خاص بالعميل (شريحة كمية >= ${matched.minQuantity})`
          : 'سعر خاص متفق عليه للعميل',
        sourceExplanationEn: matched.minQuantity && matched.minQuantity > 1
          ? `Customer-specific tier price (Qty >= ${matched.minQuantity})`
          : 'Agreed customer-specific price',
        originalDefaultPrice: defaultPrice,
        discountPercentage: discountPct,
        matchedRuleId: matched.id,
      };
    }
  }

  // 3. Price List
  if (priceListPrices && targetUnit && priceListPrices[targetUnit.id] !== undefined) {
    const listPrice = priceListPrices[targetUnit.id];
    return {
      unitPrice: Number(listPrice.toFixed(2)),
      source: 'PRICE_LIST',
      sourceExplanationAr: 'سعر قائمة الأسعار المعتمدة للعميل',
      sourceExplanationEn: 'Customer assigned price list rate',
      originalDefaultPrice: defaultPrice,
    };
  }

  // 4. Default Unit Price
  return {
    unitPrice: Number(defaultPrice.toFixed(2)),
    source: 'DEFAULT_UNIT_PRICE',
    sourceExplanationAr: 'سعر بيع الوحدة الافتراضي في الدليل',
    sourceExplanationEn: 'Default master unit catalog sale price',
    originalDefaultPrice: defaultPrice,
  };
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
 * Supports primary unit barcode, unit alias barcodes, and item-level alias barcodes.
 */
export function resolveBarcode(items: ItemMaster[], barcode: string): { item: ItemMaster; unit: UOM } | null {
  const clean = barcode.trim();
  if (!clean) return null;

  for (const item of items) {
    // 1. Direct unit primary barcode
    const matchingUnit = item.units.find((u) => u.barcode === clean);
    if (matchingUnit) {
      return { item, unit: matchingUnit };
    }

    // 2. Unit-level alias barcodes
    const matchingAliasUnit = item.units.find((u) => u.aliasBarcodes && u.aliasBarcodes.includes(clean));
    if (matchingAliasUnit) {
      return { item, unit: matchingAliasUnit };
    }

    // 3. Item-level barcode aliases (resolves to base unit)
    if (item.barcodeAliases && item.barcodeAliases.includes(clean)) {
      const baseUnit = item.units.find((u) => u.isBaseUnit) || item.units[0];
      return { item, unit: baseUnit };
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

// =========================================================================
// PHASE 05: STOCK LEDGER, WAC, MOVEMENTS, AND LANDED COST ENGINE
// =========================================================================

export type MovementType =
  | 'OPENING_STOCK'
  | 'PURCHASE_RECEIPT'
  | 'PURCHASE_RETURN'
  | 'SALES_ISSUE'
  | 'SALES_RETURN'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'STOCKTAKE_VARIANCE'
  | 'SCRAP_OR_LOSS';

export type MovementSourceType =
  | 'PURCHASE_BILL'
  | 'PURCHASE_RECEIPT'
  | 'PURCHASE_RETURN'
  | 'SALES_INVOICE'
  | 'SALES_RETURN'
  | 'STOCK_TRANSFER'
  | 'STOCK_ADJUSTMENT'
  | 'STOCKTAKE'
  | 'OPENING_STOCK'
  | 'MANUAL_OVERRIDE';

export type LandedCostAllocationMethod =
  | 'QUANTITY'
  | 'VALUE'
  | 'WEIGHT'
  | 'VOLUME'
  | 'PERCENTAGE'
  | 'MANUAL';

export type LandedCostCategory =
  | 'FREIGHT'
  | 'CUSTOMS'
  | 'CLEARANCE'
  | 'INSURANCE'
  | 'HANDLING'
  | 'OTHER';

export interface StockMovement {
  id: string;
  tenantId: string;
  warehouseId: string;
  warehouseNameAr?: string;
  itemId: string;
  sku: string;
  itemNameAr: string;
  movementType: MovementType;
  quantityDelta: number; // positive for intake, negative for issue (base units)
  unitCostApplied: number; // SAR per base unit
  resultingWac: number; // SAR per base unit
  valueDelta: number; // SAR total value change
  resultingStock: number; // resulting quantity in warehouse
  sourceType: MovementSourceType; // MANDATORY: FK-enforced per Rule I1 / I5
  sourceId: string; // MANDATORY: Document or transaction ID
  sourceDocumentNumber?: string;
  journalId?: string;
  reason?: string;
  notes?: string;
  batchNumber?: string;
  serialNumber?: string;
  userId?: string;
  userEmail: string;
  movementDate: string; // YYYY-MM-DD
  createdAt: string;
}

export interface StockTransferLine {
  itemId: string;
  sku: string;
  itemNameAr: string;
  unitId?: string;
  unitNameAr?: string;
  quantity: number;
  baseQuantity: number;
  unitCost: number;
  totalValue: number;
}

export interface StockTransfer {
  id: string;
  tenantId: string;
  transferNumber: string; // TRF-YYYY-XXXXX
  fromWarehouseId: string;
  fromWarehouseNameAr: string;
  toWarehouseId: string;
  toWarehouseNameAr: string;
  status: 'DRAFT' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED';
  transferDate: string;
  lines: StockTransferLine[];
  totalValueSar: number;
  notes?: string;
  createdBy?: string;
  createdAt: string;
}

export interface StockAdjustmentLine {
  itemId: string;
  sku: string;
  itemNameAr: string;
  unitId?: string;
  unitNameAr?: string;
  quantityDelta: number;
  baseQuantityDelta: number;
  unitCost: number;
  totalValueDelta: number;
  reason: string;
}

export interface StockAdjustment {
  id: string;
  tenantId: string;
  adjustmentNumber: string; // ADJ-YYYY-XXXXX
  warehouseId: string;
  warehouseNameAr: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  adjustmentDate: string;
  reasonCode: 'DAMAGE' | 'WASTE' | 'LOSS' | 'EXPIRY' | 'FOUND_GOODS' | 'CORRECTION';
  description: string;
  lines: StockAdjustmentLine[];
  journalId?: string;
  approvedBy?: string;
  approvedAt?: string;
  createdBy?: string;
  createdAt: string;
}

export interface StocktakeEntry {
  itemId: string;
  sku: string;
  itemNameAr: string;
  baseUnit: string;
  systemBookQty: number;
  countedQty: number;
  varianceQty: number;
  unitWac: number;
  varianceValueSar: number;
  scannedBarcode?: string;
}

export interface Stocktake {
  id: string;
  tenantId: string;
  stocktakeNumber: string; // STK-YYYY-XXXXX
  warehouseId: string;
  warehouseNameAr: string;
  scopeType: 'FULL_WAREHOUSE' | 'BY_CATEGORY' | 'BY_ITEMS';
  categoryId?: string;
  categoryNameAr?: string;
  status: 'DRAFT' | 'IN_PROGRESS' | 'REVIEW' | 'APPROVED' | 'CANCELLED';
  snapshotDate: string;
  entries: StocktakeEntry[];
  totalPositiveVarianceSar: number;
  totalNegativeVarianceSar: number;
  netVarianceSar: number;
  journalId?: string;
  approvedBy?: string;
  approvedAt?: string;
  createdBy?: string;
  createdAt: string;
}

export interface LandedCostItemLine {
  itemId: string;
  sku: string;
  itemNameAr: string;
  quantity: number;
  basePrice: number;
  weightKg?: number;
  volumeCbm?: number;
  manualAmount?: number;
  allocatedAmount?: number;
  additionalCostPerUnit?: number;
  effectiveUnitCost?: number;
}

export interface LandedCostExpenseLine {
  id: string;
  type: LandedCostCategory;
  amountSar: number;
  description?: string;
  vendorId?: string;
  vendorNameAr?: string;
}

export interface LandedCostDocument {
  id: string;
  tenantId: string;
  documentNumber: string; // LC-YYYY-XXXXX
  sourceBillId: string;
  sourceBillNumber: string;
  status: 'DRAFT' | 'POSTED';
  allocationMethod: LandedCostAllocationMethod;
  costLines: LandedCostExpenseLine[];
  totalLandedCostSar: number;
  allocations: LandedCostItemLine[];
  journalId?: string;
  createdBy?: string;
  createdAt: string;
}

/**
 * Perpetual WAC exact formula per Rule I2 and G7/G8:
 * newWAC = (oldQty * oldWAC + Q * C) / (oldQty + Q)
 * If total quantity after intake is 0 or negative, maintains previous WAC or incoming cost.
 */
export function calculateWACExact(
  currentQty: number,
  currentWac: number,
  incomingQty: number,
  incomingUnitCost: number
): {
  newQty: number;
  newWac: number;
  totalValuationSar: number;
} {
  const safeCurrentQty = Math.max(0, currentQty);
  const safeCurrentWac = Math.max(0, currentWac);
  const safeIncomingQty = Math.max(0, incomingQty);
  const safeIncomingCost = Math.max(0, incomingUnitCost);

  const totalQty = safeCurrentQty + safeIncomingQty;

  if (totalQty <= 0) {
    return {
      newQty: 0,
      newWac: safeIncomingCost || safeCurrentWac || 0,
      totalValuationSar: 0,
    };
  }

  // Exact fixed-point calculation in Halalas (cents)
  const currentValHalalas = Math.round(safeCurrentQty * safeCurrentWac * 100);
  const incomingValHalalas = Math.round(safeIncomingQty * safeIncomingCost * 100);
  const totalValHalalas = currentValHalalas + incomingValHalalas;

  const rawWac = totalValHalalas / (totalQty * 100);
  const roundedWac = Math.round(rawWac * 100) / 100;
  const roundedTotalVal = Math.round(totalQty * roundedWac * 100) / 100;

  return {
    newQty: totalQty,
    newWac: roundedWac,
    totalValuationSar: roundedTotalVal,
  };
}

/**
 * Multi-method Landed Cost Allocation Engine (Rule I3 / I5)
 * Supports QUANTITY, VALUE, WEIGHT, VOLUME, PERCENTAGE, and MANUAL allocation.
 */
export function allocateLandedCostMultiMethod(
  method: LandedCostAllocationMethod,
  items: LandedCostItemLine[],
  costLines: LandedCostExpenseLine[]
): {
  totalCostSar: number;
  allocations: LandedCostItemLine[];
} {
  const totalCostSar = costLines.reduce((acc, c) => acc + (Number(c.amountSar) || 0), 0);
  if (totalCostSar < 0) {
    throw new Error('Total landed cost cannot be negative.');
  }

  if (items.length === 0) {
    return { totalCostSar, allocations: [] };
  }

  let totalBasis = 0;
  switch (method) {
    case 'QUANTITY':
      totalBasis = items.reduce((acc, i) => acc + i.quantity, 0);
      break;
    case 'VALUE':
      totalBasis = items.reduce((acc, i) => acc + i.quantity * i.basePrice, 0);
      break;
    case 'WEIGHT':
      totalBasis = items.reduce((acc, i) => acc + (i.weightKg || 0) * i.quantity, 0);
      break;
    case 'VOLUME':
      totalBasis = items.reduce((acc, i) => acc + (i.volumeCbm || 0) * i.quantity, 0);
      break;
    case 'PERCENTAGE':
    case 'MANUAL':
      totalBasis = items.reduce((acc, i) => acc + (i.manualAmount || 0), 0);
      break;
  }

  let allocatedSum = 0;
  const result: LandedCostItemLine[] = items.map((item, index) => {
    let allocatedAmount = 0;

    if (method === 'MANUAL') {
      allocatedAmount = Number(item.manualAmount || 0);
    } else if (totalBasis > 0) {
      let itemBasis = 0;
      if (method === 'QUANTITY') itemBasis = item.quantity;
      else if (method === 'VALUE') itemBasis = item.quantity * item.basePrice;
      else if (method === 'WEIGHT') itemBasis = (item.weightKg || 0) * item.quantity;
      else if (method === 'VOLUME') itemBasis = (item.volumeCbm || 0) * item.quantity;
      else if (method === 'PERCENTAGE') itemBasis = item.manualAmount || 0;

      // Use exact proportion
      if (index === items.length - 1 && method !== 'PERCENTAGE') {
        // Last item absorbs penny rounding difference
        allocatedAmount = Math.max(0, Math.round((totalCostSar - allocatedSum) * 100) / 100);
      } else {
        const share = itemBasis / totalBasis;
        allocatedAmount = Math.round(totalCostSar * share * 100) / 100;
        allocatedSum += allocatedAmount;
      }
    }

    const additionalCostPerUnit = item.quantity > 0 ? Math.round((allocatedAmount / item.quantity) * 10000) / 10000 : 0;
    const effectiveUnitCost = Math.round((item.basePrice + additionalCostPerUnit) * 100) / 100;

    return {
      ...item,
      allocatedAmount,
      additionalCostPerUnit,
      effectiveUnitCost,
    };
  });

  return {
    totalCostSar,
    allocations: result,
  };
}

/**
 * Reconstructs the exact stock on hand and WAC as of a past date/time (Rule I1).
 * Iterates through historical movements up to that point.
 */
export function reconstructStockAsOfDate(
  movements: StockMovement[],
  asOfIsoOrDate: string,
  itemId?: string,
  warehouseId?: string
): {
  quantityOnHand: number;
  wac: number;
  totalValuationSar: number;
  movementCount: number;
} {
  const cutoff = asOfIsoOrDate.includes('T') ? asOfIsoOrDate : `${asOfIsoOrDate}T23:59:59.999Z`;

  const filtered = movements
    .filter((m) => {
      if (itemId && m.itemId !== itemId) return false;
      if (warehouseId && m.warehouseId !== warehouseId) return false;
      const mDate = m.createdAt || `${m.movementDate}T00:00:00.000Z`;
      return mDate <= cutoff;
    })
    .sort((a, b) => (a.createdAt || a.movementDate).localeCompare(b.createdAt || b.movementDate));

  let currentQty = 0;
  let currentWac = 0;

  for (const mov of filtered) {
    if (mov.quantityDelta > 0) {
      // Inflow: recalculate WAC
      const totalNewQty = currentQty + mov.quantityDelta;
      if (totalNewQty > 0) {
        const totalOldVal = currentQty * currentWac;
        const incomingVal = mov.quantityDelta * mov.unitCostApplied;
        currentWac = Math.round(((totalOldVal + incomingVal) / totalNewQty) * 100) / 100;
      }
      currentQty = totalNewQty;
    } else if (mov.quantityDelta < 0) {
      // Outflow: moves out at current WAC, WAC remains unchanged per moving-average policy
      currentQty += mov.quantityDelta;
      if (currentQty <= 0) {
        currentQty = Math.max(0, currentQty);
      }
    }
  }

  const totalValuationSar = Math.round(currentQty * currentWac * 100) / 100;

  return {
    quantityOnHand: currentQty,
    wac: currentWac,
    totalValuationSar,
    movementCount: filtered.length,
  };
}

/**
 * Detects low stock items based on minimum stock levels and reorder points.
 */
export function detectLowStockAlerts(
  items: Array<{
    id: string;
    sku: string;
    nameAr: string;
    type?: string;
    minimumStockLevel?: number;
    /** Field name used by the item master (Item.minStockLevel). */
    minStockLevel?: number;
    reorderQuantity?: number;
  }>,
  warehouseStocks: Array<{ itemId: string; currentStockBaseQty: number }>
): Array<{
  itemId: string;
  sku: string;
  nameAr: string;
  currentStock: number;
  minimumStockLevel: number;
  reorderQuantity: number;
  status: 'OUT_OF_STOCK' | 'CRITICAL_LOW' | 'REORDER_NEEDED' | 'ADEQUATE';
}> {
  // Services hold no stock and never need reordering.
  return items.filter((item) => item.type !== 'SERVICE').map((item) => {
    const totalQty = warehouseStocks
      .filter((s) => s.itemId === item.id)
      .reduce((sum, s) => sum + s.currentStockBaseQty, 0);

    const minLevel = item.minimumStockLevel || item.minStockLevel || 0;
    const reorderQty = item.reorderQuantity || 0;

    let status: 'OUT_OF_STOCK' | 'CRITICAL_LOW' | 'REORDER_NEEDED' | 'ADEQUATE' = 'ADEQUATE';
    if (totalQty <= 0) {
      status = 'OUT_OF_STOCK';
    } else if (minLevel > 0 && totalQty <= minLevel) {
      status = 'CRITICAL_LOW';
    } else if (reorderQty > 0 && totalQty <= reorderQty) {
      status = 'REORDER_NEEDED';
    }

    return {
      itemId: item.id,
      sku: item.sku,
      nameAr: item.nameAr,
      currentStock: totalQty,
      minimumStockLevel: minLevel,
      reorderQuantity: reorderQty,
      status,
    };
  });
}


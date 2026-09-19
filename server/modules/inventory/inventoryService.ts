/**
 * Inventory Engine & Stock Ledger Backend Service — Saudi ERP
 * Full support for:
 * - Append-Only Stock Movements Ledger with Mandatory Source FK (Rule I1 / I5)
 * - Row-level locking mutex simulation (Rule I2 serialized WAC updates)
 * - Exact Perpetual WAC calculation (G7/G8)
 * - Opening Stock with Balancing GL Journals (Dr Inventory / Cr Opening Equity)
 * - Warehouse Transfers with Value Preservation
 * - Classified Stock Adjustments (Damage, Waste, Loss, Expiry, Found Goods)
 * - Stocktake (Count -> Scan -> Variance -> Approve -> Auto Movements & Journals)
 * - Multi-Method Landed Cost Engine (Quantity, Value, Weight, Volume, Percentage, Manual)
 * - Negative Stock Policy Enforcement & Audit Override (Rule I6)
 * - As-of-Date Point-in-Time Snapshot Reconstruction
 * - Low-Stock & Reorder Point Detection
 */

import crypto from 'crypto';
import {
  CentralTenantDataStore,
  TenantContext,
  ValidationError,
  PermissionDeniedError,
  NotFoundError,
  scrubSensitiveFinancialFields,
} from '../../core/tenantGuard.js';
import {
  StockMovement,
  StockTransfer,
  StockAdjustment,
  Stocktake,
  LandedCostDocument,
  MovementType,
  MovementSourceType,
  LandedCostAllocationMethod,
  calculateWACExact,
  allocateLandedCostMultiMethod,
  reconstructStockAsOfDate,
  detectLowStockAlerts,
} from '../../../src/lib/inventory.js';
import { logger } from '../../core/logger.js';

// =========================================================================
// CONCURRENCY & SERIALIZED ROW-LEVEL LOCKING (Rule I2)
// Ensures sequential WAC calculations for the same (tenant, warehouse, item)
// =========================================================================
const lockQueues = new Map<string, Promise<void>>();

export async function withStockLock<T>(
  tenantId: string,
  warehouseId: string,
  itemId: string,
  operation: () => Promise<T> | T
): Promise<T> {
  const lockKey = `${tenantId}:${warehouseId}:${itemId}`;
  const existingLock = lockQueues.get(lockKey) || Promise.resolve();

  let releaseLock: () => void = () => {};
  const currentLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  // Chain behind the existing lock
  lockQueues.set(lockKey, existingLock.then(() => currentLock));

  try {
    await existingLock;
    return await operation();
  } finally {
    releaseLock();
    // Clean up if we are the tail of the queue
    if (lockQueues.get(lockKey) === currentLock) {
      lockQueues.delete(lockKey);
    }
  }
}

// =========================================================================
// 1. CORE APPEND-ONLY MOVEMENTS LEDGER (Rule I1 / I2 / I5 / I6)
// =========================================================================

export interface RecordMovementParams {
  warehouseId: string;
  itemId: string;
  movementType: MovementType;
  quantityDelta: number; // in base units (+ for intake, - for issue)
  unitCost: number; // SAR per base unit
  sourceType: MovementSourceType; // MANDATORY: FK-enforced per Rule I1 / I5
  sourceId: string; // MANDATORY: Document or transaction ID
  sourceDocumentNumber?: string;
  journalId?: string;
  reason?: string;
  notes?: string;
  batchNumber?: string;
  serialNumber?: string;
  allowNegativeOverride?: boolean;
  movementDate?: string;
}

export async function recordStockMovementService(
  store: CentralTenantDataStore,
  context: TenantContext,
  params: RecordMovementParams
): Promise<StockMovement> {
  // 1. Strict Validation: sourceType and sourceId are MANDATORY per Rule I1 & I5
  if (!params.sourceType || !params.sourceType.trim() || !params.sourceId || !params.sourceId.trim()) {
    throw new ValidationError('Movement must have valid sourceType and sourceId (Rule I1 / I5 enforced)');
  }

  if (params.quantityDelta === 0) {
    throw new ValidationError('Quantity delta cannot be zero');
  }

  if (params.unitCost < 0) {
    throw new ValidationError('Unit cost cannot be negative');
  }

  // 2. Fetch Item and Warehouse
  const items = store.items.get(context.tenantId) || [];
  const item = items.find((i) => i.id === params.itemId);
  if (!item) {
    throw new NotFoundError(`Item with ID "${params.itemId}" not found`);
  }

  const warehouses = store.warehouses.get(context.tenantId) || [];
  const warehouse = warehouses.find((w) => w.id === params.warehouseId);
  if (!warehouse) {
    throw new NotFoundError(`Warehouse with ID "${params.warehouseId}" not found`);
  }

  // 3. Acquire row-level lock for this (tenant, warehouse, item)
  return await withStockLock(context.tenantId, params.warehouseId, params.itemId, async () => {
    const warehouseStocks = store.warehouseStocks.get(context.tenantId) || [];
    let stockRecord = warehouseStocks.find(
      (s) => s.warehouseId === params.warehouseId && s.itemId === params.itemId
    );

    if (!stockRecord) {
      stockRecord = {
        id: crypto.randomUUID(),
        tenantId: context.tenantId,
        warehouseId: params.warehouseId,
        itemId: params.itemId,
        currentStockBaseQty: 0,
        reservedQty: 0,
        availableQty: 0,
        currentWac: item.currentWac || 0,
        updatedAt: new Date().toISOString(),
      };
      warehouseStocks.push(stockRecord);
      store.warehouseStocks.set(context.tenantId, warehouseStocks);
    }

    const currentQty = stockRecord.currentStockBaseQty;
    const currentWac = stockRecord.currentWac || item.currentWac || 0;
    let resultingWac = currentWac;
    const requestedQtyDelta = params.quantityDelta;

    // 4. Inflow vs Outflow
    if (requestedQtyDelta > 0) {
      // INFLOW: Recalculate WAC per Rule I2
      const wacResult = calculateWACExact(currentQty, currentWac, requestedQtyDelta, params.unitCost);
      resultingWac = wacResult.newWac;
    } else {
      // OUTFLOW: Check negative stock policy (Rule I6)
      const resultingQty = currentQty + requestedQtyDelta;
      if (resultingQty < 0) {
        if (!params.allowNegativeOverride) {
          throw new ValidationError(
            `Negative stock attempt rejected (Rule I6): Available stock is ${currentQty}, requested issue is ${Math.abs(
              requestedQtyDelta
            )}.`
          );
        }

        // Must have permission to override
        if (
          !context.permissions.includes('inventory:negative_stock:override') &&
          !context.permissions.includes('inventory:item:manage') &&
          !context.permissions.includes('*') &&
          !context.isPlatformSuperAdmin &&
          context.roleCode !== 'OWNER'
        ) {
          throw new PermissionDeniedError('inventory:negative_stock:override');
        }

        // Record audit log for override
        store.recordAuditLog({
          tenantId: context.tenantId,
          userId: context.userId,
          userEmail: context.userEmail,
          action: 'NEGATIVE_STOCK_OVERRIDE',
          resourceType: 'ITEM_STOCK',
          resourceId: item.id,
          correlationId: crypto.randomUUID(),
          changesDiff: {
            itemId: item.id,
            warehouseId: params.warehouseId,
            previousStock: currentQty,
            resultingStock: resultingQty,
            requestedDelta: requestedQtyDelta,
            reason: params.reason || 'Negative stock override applied',
          },
        });
      }

      // Outflow uses current WAC; moving average on outflow does not change unit cost
      resultingWac = currentWac;
    }

    const newWarehouseQty = currentQty + requestedQtyDelta;
    stockRecord.currentStockBaseQty = newWarehouseQty;
    stockRecord.availableQty = Math.max(0, newWarehouseQty - stockRecord.reservedQty);
    stockRecord.currentWac = resultingWac;
    stockRecord.updatedAt = new Date().toISOString();
    if (requestedQtyDelta > 0) {
      stockRecord.lastReceiptDate = params.movementDate || new Date().toISOString().slice(0, 10);
    }

    // Update Item-level aggregates
    item.currentStock = (item.currentStock || 0) + requestedQtyDelta;
    item.currentWac = resultingWac;
    item.updatedAt = new Date().toISOString();

    const valueDelta = Math.round(requestedQtyDelta * (requestedQtyDelta > 0 ? params.unitCost : currentWac) * 100) / 100;

    const now = new Date();
    const movement: StockMovement = {
      id: crypto.randomUUID(),
      tenantId: context.tenantId,
      warehouseId: params.warehouseId,
      warehouseNameAr: warehouse.nameAr,
      itemId: item.id,
      sku: item.sku,
      itemNameAr: item.nameAr,
      movementType: params.movementType,
      quantityDelta: requestedQtyDelta,
      unitCostApplied: requestedQtyDelta > 0 ? params.unitCost : currentWac,
      resultingWac,
      valueDelta,
      resultingStock: newWarehouseQty,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      sourceDocumentNumber: params.sourceDocumentNumber,
      journalId: params.journalId,
      reason: params.reason,
      notes: params.notes,
      batchNumber: params.batchNumber,
      serialNumber: params.serialNumber,
      userId: context.userId,
      userEmail: context.userEmail,
      movementDate: params.movementDate || now.toISOString().slice(0, 10),
      createdAt: now.toISOString(),
    };

    // Append to immutable movements ledger
    const movements = store.stockMovements.get(context.tenantId) || [];
    movements.push(movement);
    store.stockMovements.set(context.tenantId, movements);

    logger.info(`[STOCK MOVEMENT] Recorded ${params.movementType} for item ${item.sku} in ${warehouse.code}: delta=${requestedQtyDelta}, newWac=${resultingWac}`);

    return movement;
  });
}

export function getStockMovementsService(
  store: CentralTenantDataStore,
  context: TenantContext,
  filters?: {
    itemId?: string;
    warehouseId?: string;
    movementType?: string;
    sourceType?: string;
    sourceId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }
): StockMovement[] {
  const movements = store.stockMovements.get(context.tenantId) || [];
  let filtered = [...movements];

  if (filters?.itemId) {
    filtered = filtered.filter((m) => m.itemId === filters.itemId);
  }
  if (filters?.warehouseId) {
    filtered = filtered.filter((m) => m.warehouseId === filters.warehouseId);
  }
  if (filters?.movementType) {
    filtered = filtered.filter((m) => m.movementType === filters.movementType);
  }
  if (filters?.sourceType) {
    filtered = filtered.filter((m) => m.sourceType === filters.sourceType);
  }
  if (filters?.sourceId) {
    filtered = filtered.filter((m) => m.sourceId === filters.sourceId);
  }
  if (filters?.startDate) {
    filtered = filtered.filter((m) => m.movementDate >= filters.startDate!);
  }
  if (filters?.endDate) {
    filtered = filtered.filter((m) => m.movementDate <= filters.endDate!);
  }

  // Sort latest first
  filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const limit = filters?.limit || 100;
  return filtered.slice(0, limit);
}

// =========================================================================
// 2. OPENING STOCK WIZARD & BALANCING JOURNAL (Rule G1-G8 / I1)
// =========================================================================

export interface OpeningStockItemInput {
  itemId: string;
  warehouseId: string;
  unitId?: string;
  quantity: number;
  unitCostSar: number;
  batchNumber?: string;
  notes?: string;
}

export async function createOpeningStockBatchService(
  store: CentralTenantDataStore,
  context: TenantContext,
  params: {
    entryDate?: string;
    descriptionAr?: string;
    items: OpeningStockItemInput[];
  }
): Promise<{
  movementsCount: number;
  totalValuationSar: number;
  journalId: string;
}> {
  if (!params.items || params.items.length === 0) {
    throw new ValidationError('Opening stock items array cannot be empty');
  }

  const entryDate = params.entryDate || new Date().toISOString().slice(0, 10);
  const now = new Date();
  const correlationId = crypto.randomUUID();
  const sourceId = `OPENING-${Date.now()}`;

  // Get GL Accounts for balancing entry
  const accounts = store.accounts.get(context.tenantId) || [];
  const inventoryAccount = accounts.find((a) => a.code === '10401' || a.code === '10301') || accounts[0];
  const openingEquityAccount = accounts.find((a) => a.code === '30101' || a.code === '30201') || accounts[1] || accounts[0];

  let totalValuationSar = 0;
  const itemsStore = store.items.get(context.tenantId) || [];

  // 1. Record stock movements
  for (const entry of params.items) {
    const item = itemsStore.find((i) => i.id === entry.itemId);
    if (!item) continue;

    const unit = entry.unitId ? item.units.find((u) => u.id === entry.unitId) : item.units.find((u) => u.isBaseUnit);
    const multiplier = unit ? unit.conversionFactor : 1;
    const baseQty = Math.round(entry.quantity * multiplier);
    const baseUnitCost = Math.round((entry.unitCostSar / multiplier) * 100) / 100;

    const lineVal = Math.round(baseQty * baseUnitCost * 100) / 100;
    totalValuationSar += lineVal;

    await recordStockMovementService(store, context, {
      warehouseId: entry.warehouseId,
      itemId: entry.itemId,
      movementType: 'OPENING_STOCK',
      quantityDelta: baseQty,
      unitCost: baseUnitCost,
      sourceType: 'OPENING_STOCK',
      sourceId,
      sourceDocumentNumber: sourceId,
      reason: 'رصيد بضاعة أول المدة (Opening Stock Balance)',
      batchNumber: entry.batchNumber,
      notes: entry.notes,
      movementDate: entryDate,
    });
  }

  totalValuationSar = Math.round(totalValuationSar * 100) / 100;
  const totalValuationHalalas = BigInt(Math.round(totalValuationSar * 100));

  // 2. Create Balancing Double-Entry Journal (G1: Debits = Credits)
  const journalId = crypto.randomUUID();
  const journals = store.journals.get(context.tenantId) || [];
  const journalSeq = journals.length + 1;
  const entryNumber = `JV-${now.getFullYear()}-${String(journalSeq).padStart(5, '0')}`;

  const line1 = {
    id: crypto.randomUUID(),
    journalId,
    accountId: inventoryAccount.id,
    accountCode: inventoryAccount.code,
    accountNameAr: inventoryAccount.nameAr,
    accountNameEn: inventoryAccount.nameEn,
    debitCents: totalValuationHalalas,
    creditCents: 0n,
    descriptionAr: 'إثبات قيمة بضاعة أول المدة (مدين)',
  };

  const line2 = {
    id: crypto.randomUUID(),
    journalId,
    accountId: openingEquityAccount.id,
    accountCode: openingEquityAccount.code,
    accountNameAr: openingEquityAccount.nameAr,
    accountNameEn: openingEquityAccount.nameEn,
    debitCents: 0n,
    creditCents: totalValuationHalalas,
    descriptionAr: 'حساب الأرصدة الافتتاحية / حقوق الملكية (دائن)',
  };

  const journalEntry = {
    id: journalId,
    tenantId: context.tenantId,
    branchId: store.branches.get(context.tenantId)?.[0]?.id || crypto.randomUUID(),
    entryNumber,
    entryDate,
    periodId: 'PER-2026',
    descriptionAr: params.descriptionAr || 'قيد إثبات بضاعة أول المدة للمخزون (Opening Stock Balance)',
    descriptionEn: 'Opening Stock Inventory Valuation Journal Entry',
    status: 'POSTED' as const,
    sourceType: 'OPENING' as const,
    sourceId,
    sourceKey: `OPENING:${sourceId}`,
    totalDebitCents: totalValuationHalalas,
    totalCreditCents: totalValuationHalalas,
    lines: [line1, line2],
    createdBy: context.userId,
    createdAt: now.toISOString(),
  };

  journals.unshift(journalEntry);
  store.journals.set(context.tenantId, journals);
  store.journalLines.set(journalId, [line1, line2]);

  // Update journalId on the movements recorded
  const movements = store.stockMovements.get(context.tenantId) || [];
  for (const m of movements) {
    if (m.sourceId === sourceId) {
      m.journalId = journalId;
    }
  }

  // Audit
  store.recordAuditLog({
    tenantId: context.tenantId,
    userId: context.userId,
    userEmail: context.userEmail,
    action: 'CREATE_OPENING_STOCK_BATCH',
    resourceType: 'INVENTORY_OPENING',
    resourceId: sourceId,
    correlationId,
    changesDiff: {
      itemsCount: params.items.length,
      totalValuationSar,
      journalId,
      entryNumber,
    },
  });

  return {
    movementsCount: params.items.length,
    totalValuationSar,
    journalId,
  };
}

// =========================================================================
// 3. WAREHOUSE TRANSFERS (Preserves Total Inventory Valuation)
// =========================================================================

export interface CreateTransferParams {
  fromWarehouseId: string;
  toWarehouseId: string;
  transferDate?: string;
  notes?: string;
  lines: Array<{
    itemId: string;
    unitId?: string;
    quantity: number;
  }>;
}

export async function createStockTransferService(
  store: CentralTenantDataStore,
  context: TenantContext,
  params: CreateTransferParams
): Promise<StockTransfer> {
  if (params.fromWarehouseId === params.toWarehouseId) {
    throw new ValidationError('Source and destination warehouses cannot be the same');
  }

  if (!params.lines || params.lines.length === 0) {
    throw new ValidationError('Transfer lines cannot be empty');
  }

  const warehouses = store.warehouses.get(context.tenantId) || [];
  const fromWh = warehouses.find((w) => w.id === params.fromWarehouseId);
  const toWh = warehouses.find((w) => w.id === params.toWarehouseId);

  if (!fromWh || !toWh) {
    throw new NotFoundError('Source or destination warehouse not found');
  }

  const items = store.items.get(context.tenantId) || [];
  const transfers = store.stockTransfers.get(context.tenantId) || [];
  const seq = transfers.length + 1;
  const transferNumber = `TRF-${new Date().getFullYear()}-${String(seq).padStart(5, '0')}`;
  const transferId = crypto.randomUUID();
  const transferDate = params.transferDate || new Date().toISOString().slice(0, 10);

  let totalTransferValueSar = 0;
  const processedLines: StockTransfer['lines'] = [];

  // Execute both legs for each line inside locks
  for (const line of params.lines) {
    const item = items.find((i) => i.id === line.itemId);
    if (!item) {
      throw new NotFoundError(`Item ${line.itemId} not found`);
    }

    const unit = line.unitId ? item.units.find((u) => u.id === line.unitId) : item.units.find((u) => u.isBaseUnit);
    const multiplier = unit ? unit.conversionFactor : 1;
    const baseQuantity = Math.round(line.quantity * multiplier);

    // Get current WAC in source warehouse
    const whStocks = store.warehouseStocks.get(context.tenantId) || [];
    const sourceStock = whStocks.find((s) => s.warehouseId === params.fromWarehouseId && s.itemId === line.itemId);
    const unitCost = sourceStock?.currentWac || item.currentWac || 0;
    const lineTotalValue = Math.round(baseQuantity * unitCost * 100) / 100;
    totalTransferValueSar += lineTotalValue;

    // Leg 1: TRANSFER_OUT from source warehouse at current WAC
    await recordStockMovementService(store, context, {
      warehouseId: params.fromWarehouseId,
      itemId: line.itemId,
      movementType: 'TRANSFER_OUT',
      quantityDelta: -baseQuantity,
      unitCost,
      sourceType: 'STOCK_TRANSFER',
      sourceId: transferId,
      sourceDocumentNumber: transferNumber,
      reason: `تحويل مخزني صادر إلى مستودع ${toWh.nameAr}`,
      movementDate: transferDate,
    });

    // Leg 2: TRANSFER_IN to destination warehouse at the exact same unit cost (Value Preserved!)
    await recordStockMovementService(store, context, {
      warehouseId: params.toWarehouseId,
      itemId: line.itemId,
      movementType: 'TRANSFER_IN',
      quantityDelta: baseQuantity,
      unitCost,
      sourceType: 'STOCK_TRANSFER',
      sourceId: transferId,
      sourceDocumentNumber: transferNumber,
      reason: `تحويل مخزني وارد من مستودع ${fromWh.nameAr}`,
      movementDate: transferDate,
    });

    processedLines.push({
      itemId: line.itemId,
      sku: item.sku,
      itemNameAr: item.nameAr,
      unitId: unit?.id,
      unitNameAr: unit?.nameAr || item.baseUnit,
      quantity: line.quantity,
      baseQuantity,
      unitCost,
      totalValue: lineTotalValue,
    });
  }

  const transfer: StockTransfer = {
    id: transferId,
    tenantId: context.tenantId,
    transferNumber,
    fromWarehouseId: fromWh.id,
    fromWarehouseNameAr: fromWh.nameAr,
    toWarehouseId: toWh.id,
    toWarehouseNameAr: toWh.nameAr,
    status: 'COMPLETED',
    transferDate,
    lines: processedLines,
    totalValueSar: Math.round(totalTransferValueSar * 100) / 100,
    notes: params.notes,
    createdBy: context.userId,
    createdAt: new Date().toISOString(),
  };

  transfers.unshift(transfer);
  store.stockTransfers.set(context.tenantId, transfers);

  store.recordAuditLog({
    tenantId: context.tenantId,
    userId: context.userId,
    userEmail: context.userEmail,
    action: 'CREATE_STOCK_TRANSFER',
    resourceType: 'STOCK_TRANSFER',
    resourceId: transfer.id,
    correlationId: crypto.randomUUID(),
    changesDiff: {
      transferNumber,
      fromWarehouse: fromWh.code,
      toWarehouse: toWh.code,
      linesCount: processedLines.length,
      totalValueSar: transfer.totalValueSar,
    },
  });

  return transfer;
}

export function getStockTransfersService(
  store: CentralTenantDataStore,
  context: TenantContext
): StockTransfer[] {
  return store.stockTransfers.get(context.tenantId) || [];
}

// =========================================================================
// 4. STOCK ADJUSTMENTS (Classified Reasons & Live Journals)
// =========================================================================

export interface CreateAdjustmentParams {
  warehouseId: string;
  adjustmentDate?: string;
  reasonCode: 'DAMAGE' | 'WASTE' | 'LOSS' | 'EXPIRY' | 'FOUND_GOODS' | 'CORRECTION';
  description: string;
  lines: Array<{
    itemId: string;
    unitId?: string;
    quantityDelta: number; // positive for addition, negative for reduction
    reason?: string;
  }>;
}

export async function createStockAdjustmentService(
  store: CentralTenantDataStore,
  context: TenantContext,
  params: CreateAdjustmentParams
): Promise<StockAdjustment> {
  if (!params.lines || params.lines.length === 0) {
    throw new ValidationError('Adjustment lines cannot be empty');
  }

  if (!params.description || !params.description.trim()) {
    throw new ValidationError('Adjustment description is mandatory');
  }

  const warehouses = store.warehouses.get(context.tenantId) || [];
  const warehouse = warehouses.find((w) => w.id === params.warehouseId);
  if (!warehouse) {
    throw new NotFoundError('Warehouse not found');
  }

  const items = store.items.get(context.tenantId) || [];
  const adjustments = store.stockAdjustments.get(context.tenantId) || [];
  const seq = adjustments.length + 1;
  const adjustmentNumber = `ADJ-${new Date().getFullYear()}-${String(seq).padStart(5, '0')}`;
  const adjustmentId = crypto.randomUUID();
  const adjustmentDate = params.adjustmentDate || new Date().toISOString().slice(0, 10);

  let netValuationDeltaHalalas = 0n;
  const processedLines: StockAdjustment['lines'] = [];

  for (const line of params.lines) {
    if (line.quantityDelta === 0) continue;

    const item = items.find((i) => i.id === line.itemId);
    if (!item) {
      throw new NotFoundError(`Item ${line.itemId} not found`);
    }

    const unit = line.unitId ? item.units.find((u) => u.id === line.unitId) : item.units.find((u) => u.isBaseUnit);
    const multiplier = unit ? unit.conversionFactor : 1;
    const baseQuantityDelta = Math.round(line.quantityDelta * multiplier);

    const whStocks = store.warehouseStocks.get(context.tenantId) || [];
    const stockRec = whStocks.find((s) => s.warehouseId === params.warehouseId && s.itemId === line.itemId);
    const unitCost = stockRec?.currentWac || item.currentWac || 0;
    const lineValuationDelta = Math.round(baseQuantityDelta * unitCost * 100) / 100;
    netValuationDeltaHalalas += BigInt(Math.round(lineValuationDelta * 100));

    const movType: MovementType = baseQuantityDelta > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';

    await recordStockMovementService(store, context, {
      warehouseId: params.warehouseId,
      itemId: line.itemId,
      movementType: movType,
      quantityDelta: baseQuantityDelta,
      unitCost,
      sourceType: 'STOCK_ADJUSTMENT',
      sourceId: adjustmentId,
      sourceDocumentNumber: adjustmentNumber,
      reason: `${params.reasonCode}: ${line.reason || params.description}`,
      movementDate: adjustmentDate,
    });

    processedLines.push({
      itemId: line.itemId,
      sku: item.sku,
      itemNameAr: item.nameAr,
      unitId: unit?.id,
      unitNameAr: unit?.nameAr || item.baseUnit,
      quantityDelta: line.quantityDelta,
      baseQuantityDelta,
      unitCost,
      totalValueDelta: lineValuationDelta,
      reason: line.reason || params.description,
    });
  }

  // Create balancing Journal Entry (G1-G3)
  const accounts = store.accounts.get(context.tenantId) || [];
  const inventoryAccount = accounts.find((a) => a.code === '10401' || a.code === '10301') || accounts[0];
  const adjustmentExpenseAccount = accounts.find((a) => a.code === '50401' || a.code === '50101') || accounts[0];
  const adjustmentGainAccount = accounts.find((a) => a.code === '40401' || a.code === '40101') || accounts[0];

  const journalId = crypto.randomUUID();
  const absNetHalalas = netValuationDeltaHalalas < 0n ? -netValuationDeltaHalalas : netValuationDeltaHalalas;

  if (absNetHalalas > 0n) {
    const journals = store.journals.get(context.tenantId) || [];
    const entryNumber = `JV-${new Date().getFullYear()}-${String(journals.length + 1).padStart(5, '0')}`;

    let line1: any;
    let line2: any;

    if (netValuationDeltaHalalas > 0n) {
      // Positive Adjustment: Dr Inventory / Cr Adjustment Gain
      line1 = {
        id: crypto.randomUUID(),
        journalId,
        accountId: inventoryAccount.id,
        accountCode: inventoryAccount.code,
        accountNameAr: inventoryAccount.nameAr,
        accountNameEn: inventoryAccount.nameEn,
        debitCents: absNetHalalas,
        creditCents: 0n,
        descriptionAr: 'زيادة تسوية مخزون (مدين)',
      };
      line2 = {
        id: crypto.randomUUID(),
        journalId,
        accountId: adjustmentGainAccount.id,
        accountCode: adjustmentGainAccount.code,
        accountNameAr: adjustmentGainAccount.nameAr,
        accountNameEn: adjustmentGainAccount.nameEn,
        debitCents: 0n,
        creditCents: absNetHalalas,
        descriptionAr: 'أرباح تسوية جردية (دائن)',
      };
    } else {
      // Negative Adjustment: Dr Adjustment Loss / Cr Inventory
      line1 = {
        id: crypto.randomUUID(),
        journalId,
        accountId: adjustmentExpenseAccount.id,
        accountCode: adjustmentExpenseAccount.code,
        accountNameAr: adjustmentExpenseAccount.nameAr,
        accountNameEn: adjustmentExpenseAccount.nameEn,
        debitCents: absNetHalalas,
        creditCents: 0n,
        descriptionAr: `خسائر تسوية (${params.reasonCode}) (مدين)`,
      };
      line2 = {
        id: crypto.randomUUID(),
        journalId,
        accountId: inventoryAccount.id,
        accountCode: inventoryAccount.code,
        accountNameAr: inventoryAccount.nameAr,
        accountNameEn: inventoryAccount.nameEn,
        debitCents: 0n,
        creditCents: absNetHalalas,
        descriptionAr: 'تخفيض المخزون بسبب التسوية (دائن)',
      };
    }

    const jEntry = {
      id: journalId,
      tenantId: context.tenantId,
      branchId: store.branches.get(context.tenantId)?.[0]?.id || crypto.randomUUID(),
      entryNumber,
      entryDate: adjustmentDate,
      periodId: 'PER-2026',
      descriptionAr: `تسوية مخزنية (${params.reasonCode}) - ${adjustmentNumber}`,
      descriptionEn: `Stock Adjustment Journal (${params.reasonCode})`,
      status: 'POSTED' as const,
      sourceType: 'INVENTORY_ADJUSTMENT' as const,
      sourceId: adjustmentId,
      sourceKey: `INVENTORY_ADJUSTMENT:${adjustmentId}`,
      totalDebitCents: absNetHalalas,
      totalCreditCents: absNetHalalas,
      lines: [line1, line2],
      createdBy: context.userId,
      createdAt: new Date().toISOString(),
    };

    journals.unshift(jEntry);
    store.journals.set(context.tenantId, journals);
    store.journalLines.set(journalId, [line1, line2]);
  }

  const adjustment: StockAdjustment = {
    id: adjustmentId,
    tenantId: context.tenantId,
    adjustmentNumber,
    warehouseId: warehouse.id,
    warehouseNameAr: warehouse.nameAr,
    status: 'APPROVED',
    adjustmentDate,
    reasonCode: params.reasonCode,
    description: params.description,
    lines: processedLines,
    journalId: absNetHalalas > 0n ? journalId : undefined,
    approvedBy: context.userId,
    approvedAt: new Date().toISOString(),
    createdBy: context.userId,
    createdAt: new Date().toISOString(),
  };

  adjustments.unshift(adjustment);
  store.stockAdjustments.set(context.tenantId, adjustments);

  return adjustment;
}

export function getStockAdjustmentsService(
  store: CentralTenantDataStore,
  context: TenantContext
): StockAdjustment[] {
  return store.stockAdjustments.get(context.tenantId) || [];
}

// =========================================================================
// 5. STOCKTAKE & CYCLE COUNTING (Scan -> Variance -> Approve -> Post)
// =========================================================================

export interface CreateStocktakeParams {
  warehouseId: string;
  scopeType: 'FULL_WAREHOUSE' | 'BY_CATEGORY' | 'BY_ITEMS';
  categoryId?: string;
  itemIds?: string[];
  snapshotDate?: string;
}

export function createStocktakeService(
  store: CentralTenantDataStore,
  context: TenantContext,
  params: CreateStocktakeParams
): Stocktake {
  const warehouses = store.warehouses.get(context.tenantId) || [];
  const warehouse = warehouses.find((w) => w.id === params.warehouseId);
  if (!warehouse) {
    throw new NotFoundError('Warehouse not found');
  }

  const items = store.items.get(context.tenantId) || [];
  const whStocks = store.warehouseStocks.get(context.tenantId) || [];

  let candidateItems = items.filter((i) => i.type === 'INVENTORY' && i.isActive);
  if (params.scopeType === 'BY_CATEGORY' && params.categoryId) {
    candidateItems = candidateItems.filter((i) => i.categoryId === params.categoryId);
  } else if (params.scopeType === 'BY_ITEMS' && params.itemIds && params.itemIds.length > 0) {
    candidateItems = candidateItems.filter((i) => params.itemIds!.includes(i.id));
  }

  const stocktakes = store.stocktakes.get(context.tenantId) || [];
  const seq = stocktakes.length + 1;
  const stocktakeNumber = `STK-${new Date().getFullYear()}-${String(seq).padStart(5, '0')}`;
  const snapshotDate = params.snapshotDate || new Date().toISOString().slice(0, 10);

  const entries: Stocktake['entries'] = candidateItems.map((item) => {
    const stockRec = whStocks.find((s) => s.warehouseId === params.warehouseId && s.itemId === item.id);
    const bookQty = stockRec ? stockRec.currentStockBaseQty : 0;
    const unitWac = stockRec?.currentWac || item.currentWac || 0;

    return {
      itemId: item.id,
      sku: item.sku,
      itemNameAr: item.nameAr,
      baseUnit: item.baseUnit,
      systemBookQty: bookQty,
      countedQty: bookQty, // Defaults to book qty until scan/counted
      varianceQty: 0,
      unitWac,
      varianceValueSar: 0,
    };
  });

  const category = params.categoryId ? store.itemCategories.get(context.tenantId)?.find((c) => c.id === params.categoryId) : undefined;

  const stocktake: Stocktake = {
    id: crypto.randomUUID(),
    tenantId: context.tenantId,
    stocktakeNumber,
    warehouseId: warehouse.id,
    warehouseNameAr: warehouse.nameAr,
    scopeType: params.scopeType,
    categoryId: params.categoryId,
    categoryNameAr: category?.nameAr,
    status: 'DRAFT',
    snapshotDate,
    entries,
    totalPositiveVarianceSar: 0,
    totalNegativeVarianceSar: 0,
    netVarianceSar: 0,
    createdBy: context.userId,
    createdAt: new Date().toISOString(),
  };

  stocktakes.unshift(stocktake);
  store.stocktakes.set(context.tenantId, stocktakes);

  return stocktake;
}

export function enterStocktakeCountsService(
  store: CentralTenantDataStore,
  context: TenantContext,
  stocktakeId: string,
  counts: Array<{ itemId: string; countedQty: number; scannedBarcode?: string }>
): Stocktake {
  const stocktakes = store.stocktakes.get(context.tenantId) || [];
  const stocktake = stocktakes.find((s) => s.id === stocktakeId);
  if (!stocktake) {
    throw new NotFoundError('Stocktake not found');
  }

  if (stocktake.status === 'APPROVED') {
    throw new ValidationError('Cannot modify an already approved stocktake');
  }

  let totalPos = 0;
  let totalNeg = 0;

  for (const count of counts) {
    const entry = stocktake.entries.find((e) => e.itemId === count.itemId);
    if (entry) {
      entry.countedQty = Number(count.countedQty) || 0;
      entry.varianceQty = entry.countedQty - entry.systemBookQty;
      entry.varianceValueSar = Math.round(entry.varianceQty * entry.unitWac * 100) / 100;
      if (count.scannedBarcode) entry.scannedBarcode = count.scannedBarcode;
    }
  }

  for (const e of stocktake.entries) {
    if (e.varianceValueSar > 0) totalPos += e.varianceValueSar;
    else if (e.varianceValueSar < 0) totalNeg += Math.abs(e.varianceValueSar);
  }

  stocktake.totalPositiveVarianceSar = Math.round(totalPos * 100) / 100;
  stocktake.totalNegativeVarianceSar = Math.round(totalNeg * 100) / 100;
  stocktake.netVarianceSar = Math.round((totalPos - totalNeg) * 100) / 100;
  stocktake.status = 'IN_PROGRESS';

  return stocktake;
}

export async function approveStocktakeService(
  store: CentralTenantDataStore,
  context: TenantContext,
  stocktakeId: string
): Promise<Stocktake> {
  const stocktakes = store.stocktakes.get(context.tenantId) || [];
  const stocktake = stocktakes.find((s) => s.id === stocktakeId);
  if (!stocktake) {
    throw new NotFoundError('Stocktake not found');
  }

  if (stocktake.status === 'APPROVED') {
    return stocktake; // Idempotent
  }

  const itemsWithVariance = stocktake.entries.filter((e) => e.varianceQty !== 0);

  // Generate Stock Movements for all variances
  for (const entry of itemsWithVariance) {
    const movType: MovementType = entry.varianceQty > 0 ? 'STOCKTAKE_VARIANCE' : 'STOCKTAKE_VARIANCE';

    await recordStockMovementService(store, context, {
      warehouseId: stocktake.warehouseId,
      itemId: entry.itemId,
      movementType: movType,
      quantityDelta: entry.varianceQty,
      unitCost: entry.unitWac,
      sourceType: 'STOCKTAKE',
      sourceId: stocktake.id,
      sourceDocumentNumber: stocktake.stocktakeNumber,
      reason: `فروقات جرد فعلي (${stocktake.stocktakeNumber}): ${entry.varianceQty > 0 ? '+' : ''}${entry.varianceQty} ${entry.baseUnit}`,
      movementDate: stocktake.snapshotDate,
      allowNegativeOverride: true, // Approved stocktake reflects actual physical reality
    });
  }

  // Create balancing Journal Entry (G1)
  const accounts = store.accounts.get(context.tenantId) || [];
  const inventoryAccount = accounts.find((a) => a.code === '10401' || a.code === '10301') || accounts[0];
  const inventoryLossAccount = accounts.find((a) => a.code === '50401' || a.code === '50101') || accounts[0];
  const inventoryGainAccount = accounts.find((a) => a.code === '40401' || a.code === '40101') || accounts[0];

  const posHalalas = BigInt(Math.round(stocktake.totalPositiveVarianceSar * 100));
  const negHalalas = BigInt(Math.round(stocktake.totalNegativeVarianceSar * 100));

  let journalId: string | undefined;

  if (posHalalas > 0n || negHalalas > 0n) {
    journalId = crypto.randomUUID();
    const journals = store.journals.get(context.tenantId) || [];
    const entryNumber = `JV-${new Date().getFullYear()}-${String(journals.length + 1).padStart(5, '0')}`;

    const journalLines: any[] = [];
    let lineIdx = 1;

    // Positive Variance: Dr Inventory, Cr Gain
    if (posHalalas > 0n) {
      journalLines.push({
        id: crypto.randomUUID(),
        journalId,
        accountId: inventoryAccount.id,
        accountCode: inventoryAccount.code,
        accountNameAr: inventoryAccount.nameAr,
        accountNameEn: inventoryAccount.nameEn,
        debitCents: posHalalas,
        creditCents: 0n,
        descriptionAr: 'زيادة جرد فعلي في المخزون (مدين)',
        lineNumber: lineIdx++,
      });
      journalLines.push({
        id: crypto.randomUUID(),
        journalId,
        accountId: inventoryGainAccount.id,
        accountCode: inventoryGainAccount.code,
        accountNameAr: inventoryGainAccount.nameAr,
        accountNameEn: inventoryGainAccount.nameEn,
        debitCents: 0n,
        creditCents: posHalalas,
        descriptionAr: 'أرباح تسوية زيادة الجرد (دائن)',
        lineNumber: lineIdx++,
      });
    }

    // Negative Variance: Dr Loss / Shrinkage, Cr Inventory
    if (negHalalas > 0n) {
      journalLines.push({
        id: crypto.randomUUID(),
        journalId,
        accountId: inventoryLossAccount.id,
        accountCode: inventoryLossAccount.code,
        accountNameAr: inventoryLossAccount.nameAr,
        accountNameEn: inventoryLossAccount.nameEn,
        debitCents: negHalalas,
        creditCents: 0n,
        descriptionAr: 'عجز جرد فعلي للمخزون (مدين)',
        lineNumber: lineIdx++,
      });
      journalLines.push({
        id: crypto.randomUUID(),
        journalId,
        accountId: inventoryAccount.id,
        accountCode: inventoryAccount.code,
        accountNameAr: inventoryAccount.nameAr,
        accountNameEn: inventoryAccount.nameEn,
        debitCents: 0n,
        creditCents: negHalalas,
        descriptionAr: 'تخفيض المخزون لمطابقة الجرد الفعلي (دائن)',
        lineNumber: lineIdx++,
      });
    }

    const totalDebitCents = posHalalas + negHalalas;
    const totalCreditCents = posHalalas + negHalalas;

    const jEntry = {
      id: journalId,
      tenantId: context.tenantId,
      branchId: store.branches.get(context.tenantId)?.[0]?.id || crypto.randomUUID(),
      entryNumber,
      entryDate: stocktake.snapshotDate,
      periodId: 'PER-2026',
      descriptionAr: `قيد تسوية فروقات الجرد الفعلي - ${stocktake.stocktakeNumber}`,
      descriptionEn: `Stocktake Variance Balancing Journal - ${stocktake.stocktakeNumber}`,
      status: 'POSTED' as const,
      sourceType: 'INVENTORY_ADJUSTMENT' as const,
      sourceId: stocktake.id,
      sourceKey: `INVENTORY_ADJUSTMENT:${stocktake.id}`,
      totalDebitCents,
      totalCreditCents,
      lines: journalLines,
      createdBy: context.userId,
      createdAt: new Date().toISOString(),
    };

    journals.unshift(jEntry);
    store.journals.set(context.tenantId, journals);
    store.journalLines.set(journalId, journalLines);
  }

  stocktake.status = 'APPROVED';
  stocktake.approvedBy = context.userId;
  stocktake.approvedAt = new Date().toISOString();
  stocktake.journalId = journalId;

  return stocktake;
}

export function getStocktakesService(
  store: CentralTenantDataStore,
  context: TenantContext
): Stocktake[] {
  return store.stocktakes.get(context.tenantId) || [];
}

// =========================================================================
// 6. MULTI-METHOD LANDED COST ENGINE (Rule I3 / I5)
// =========================================================================

export interface CreateLandedCostParams {
  sourceBillId: string;
  sourceBillNumber: string;
  allocationMethod: LandedCostAllocationMethod;
  costLines: Array<{
    type: 'FREIGHT' | 'CUSTOMS' | 'CLEARANCE' | 'INSURANCE' | 'HANDLING' | 'OTHER';
    amountSar: number;
    description?: string;
  }>;
  items: Array<{
    itemId: string;
    quantity: number;
    basePrice: number;
    weightKg?: number;
    volumeCbm?: number;
    manualAmount?: number;
  }>;
}

export async function createLandedCostDocumentService(
  store: CentralTenantDataStore,
  context: TenantContext,
  params: CreateLandedCostParams
): Promise<LandedCostDocument> {
  if (!params.costLines || params.costLines.length === 0) {
    throw new ValidationError('Cost lines cannot be empty');
  }

  if (!params.items || params.items.length === 0) {
    throw new ValidationError('Item lines cannot be empty');
  }

  const itemsMaster = store.items.get(context.tenantId) || [];

  const itemLinesWithNames = params.items.map((i) => {
    const it = itemsMaster.find((m) => m.id === i.itemId);
    return {
      itemId: i.itemId,
      sku: it?.sku || 'SKU',
      itemNameAr: it?.nameAr || 'صنف',
      quantity: i.quantity,
      basePrice: i.basePrice,
      weightKg: i.weightKg,
      volumeCbm: i.volumeCbm,
      manualAmount: i.manualAmount,
    };
  });

  const costLinesWithIds = params.costLines.map((c) => ({
    id: crypto.randomUUID(),
    type: c.type,
    amountSar: Number(c.amountSar) || 0,
    description: c.description,
  }));

  const allocationResult = allocateLandedCostMultiMethod(
    params.allocationMethod,
    itemLinesWithNames,
    costLinesWithIds
  );

  const landedDocs = store.landedCostDocuments.get(context.tenantId) || [];
  const seq = landedDocs.length + 1;
  const documentNumber = `LC-${new Date().getFullYear()}-${String(seq).padStart(5, '0')}`;
  const docId = crypto.randomUUID();

  // Create balancing Journal Entry: Dr Inventory Asset, Cr Accounts Payable / Cash (G1-G3)
  const accounts = store.accounts.get(context.tenantId) || [];
  const inventoryAccount = accounts.find((a) => a.code === '10401' || a.code === '10301') || accounts[0];
  const payableAccount = accounts.find((a) => a.code === '20101' || a.code === '10101') || accounts[0];

  const totalHalalas = BigInt(Math.round(allocationResult.totalCostSar * 100));
  let journalId: string | undefined;

  if (totalHalalas > 0n) {
    journalId = crypto.randomUUID();
    const journals = store.journals.get(context.tenantId) || [];
    const entryNumber = `JV-${new Date().getFullYear()}-${String(journals.length + 1).padStart(5, '0')}`;

    const line1 = {
      id: crypto.randomUUID(),
      journalId,
      accountId: inventoryAccount.id,
      accountCode: inventoryAccount.code,
      accountNameAr: inventoryAccount.nameAr,
      accountNameEn: inventoryAccount.nameEn,
      debitCents: totalHalalas,
      creditCents: 0n,
      descriptionAr: `تكاليف استيراد وشحن إضافية مضافة للمخزون (${documentNumber})`,
      lineNumber: 1,
    };

    const line2 = {
      id: crypto.randomUUID(),
      journalId,
      accountId: payableAccount.id,
      accountCode: payableAccount.code,
      accountNameAr: payableAccount.nameAr,
      accountNameEn: payableAccount.nameEn,
      debitCents: 0n,
      creditCents: totalHalalas,
      descriptionAr: `مستحقات موردي خدمات الشحن والجمارك (${documentNumber})`,
      lineNumber: 2,
    };

    const jEntry = {
      id: journalId,
      tenantId: context.tenantId,
      branchId: store.branches.get(context.tenantId)?.[0]?.id || crypto.randomUUID(),
      entryNumber,
      entryDate: new Date().toISOString().slice(0, 10),
      periodId: 'PER-2026',
      descriptionAr: `إثبات تكاليف شحن وجمارك مشتريات - ${documentNumber}`,
      descriptionEn: `Landed Cost Allocation Journal - ${documentNumber}`,
      status: 'POSTED' as const,
      sourceType: 'EXPENSE' as const,
      sourceId: docId,
      sourceKey: `EXPENSE:${docId}`,
      totalDebitCents: totalHalalas,
      totalCreditCents: totalHalalas,
      lines: [line1, line2],
      createdBy: context.userId,
      createdAt: new Date().toISOString(),
    };

    journals.unshift(jEntry);
    store.journals.set(context.tenantId, journals);
    store.journalLines.set(journalId, [line1, line2]);
  }

  const doc: LandedCostDocument = {
    id: docId,
    tenantId: context.tenantId,
    documentNumber,
    sourceBillId: params.sourceBillId,
    sourceBillNumber: params.sourceBillNumber,
    status: 'POSTED',
    allocationMethod: params.allocationMethod,
    costLines: costLinesWithIds,
    totalLandedCostSar: allocationResult.totalCostSar,
    allocations: allocationResult.allocations,
    journalId,
    createdBy: context.userId,
    createdAt: new Date().toISOString(),
  };

  landedDocs.unshift(doc);
  store.landedCostDocuments.set(context.tenantId, landedDocs);

  store.recordAuditLog({
    tenantId: context.tenantId,
    userId: context.userId,
    userEmail: context.userEmail,
    action: 'CREATE_LANDED_COST_ALLOCATION',
    resourceType: 'LANDED_COST',
    resourceId: doc.id,
    correlationId: crypto.randomUUID(),
    changesDiff: {
      documentNumber,
      sourceBillNumber: params.sourceBillNumber,
      allocationMethod: params.allocationMethod,
      totalLandedCostSar: doc.totalLandedCostSar,
      linesAllocated: doc.allocations.length,
    },
  });

  return doc;
}

export function getLandedCostDocumentsService(
  store: CentralTenantDataStore,
  context: TenantContext
): LandedCostDocument[] {
  return store.landedCostDocuments.get(context.tenantId) || [];
}

// =========================================================================
// 7. AS-OF DATE POINT-IN-TIME RECONSTRUCTION (Rule I1)
// =========================================================================

export function getStockAsOfDateService(
  store: CentralTenantDataStore,
  context: TenantContext,
  asOfDate: string,
  itemId?: string,
  warehouseId?: string
) {
  const movements = store.stockMovements.get(context.tenantId) || [];
  return reconstructStockAsOfDate(movements, asOfDate, itemId, warehouseId);
}

// =========================================================================
// 8. LOW STOCK & REORDER ALERTS (Section E)
// =========================================================================

export function getLowStockAlertsService(
  store: CentralTenantDataStore,
  context: TenantContext
) {
  const items = store.items.get(context.tenantId) || [];
  const whStocks = store.warehouseStocks.get(context.tenantId) || [];
  return detectLowStockAlerts(items, whStocks);
}

// =========================================================================
// 9. DEFAULT INVENTORY LEDGER SEED (Rule I1 / I5 audit trail)
// =========================================================================
export function seedDefaultInventoryMovements(
  store: CentralTenantDataStore,
  tenantId: string,
  adminId: string
) {
  const items = store.items.get(tenantId) || [];
  const warehouses = store.warehouses.get(tenantId) || [];
  const whStocks = store.warehouseStocks.get(tenantId) || [];
  const movements: StockMovement[] = [];

  const wh1 = warehouses[0];
  const wh2 = warehouses[1] || warehouses[0];

  for (const s of whStocks) {
    const item = items.find((i) => i.id === s.itemId);
    const wh = warehouses.find((w) => w.id === s.warehouseId);
    if (!item || !wh) continue;

    const unitCost = s.currentWac || item.currentWac || 0;
    const valueDelta = Math.round(s.currentStockBaseQty * unitCost * 100) / 100;

    movements.push({
      id: crypto.randomUUID(),
      tenantId,
      warehouseId: wh.id,
      warehouseNameAr: wh.nameAr,
      itemId: item.id,
      sku: item.sku,
      itemNameAr: item.nameAr,
      movementType: 'OPENING_STOCK',
      quantityDelta: s.currentStockBaseQty,
      unitCostApplied: unitCost,
      resultingWac: unitCost,
      valueDelta,
      resultingStock: s.currentStockBaseQty,
      sourceType: 'OPENING_STOCK',
      sourceId: `INIT-OPENING-${item.sku}`,
      sourceDocumentNumber: `OB-2026-${item.sku}`,
      reason: 'رصيد بضاعة أول المدة التأسيسي',
      userId: adminId,
      userEmail: 'admin@al-mithaq.sa',
      movementDate: '2026-01-01',
      createdAt: '2026-01-01T08:00:00Z',
    });
  }

  // Add a sample transfer record
  if (wh1 && wh2 && items[0]) {
    const transferItem = items[0];
    const transferId = crypto.randomUUID();
    const transferNumber = 'TRF-2026-00001';

    const transfers: StockTransfer[] = [
      {
        id: transferId,
        tenantId,
        transferNumber,
        fromWarehouseId: wh1.id,
        fromWarehouseNameAr: wh1.nameAr,
        toWarehouseId: wh2.id,
        toWarehouseNameAr: wh2.nameAr,
        status: 'COMPLETED',
        transferDate: '2026-02-01',
        lines: [
          {
            itemId: transferItem.id,
            sku: transferItem.sku,
            itemNameAr: transferItem.nameAr,
            quantity: 50,
            baseQuantity: 50,
            unitCost: transferItem.currentWac || 20.0,
            totalValue: 50 * (transferItem.currentWac || 20.0),
          },
        ],
        totalValueSar: 50 * (transferItem.currentWac || 20.0),
        notes: 'تحويل دوري لتعزيز مخزون فرع التوزيع',
        createdBy: adminId,
        createdAt: '2026-02-01T10:00:00Z',
      },
    ];
    store.stockTransfers.set(tenantId, transfers);
  }

  store.stockMovements.set(tenantId, movements);
}


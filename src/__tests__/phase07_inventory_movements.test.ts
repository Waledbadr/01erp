import { describe, it, expect, beforeEach } from 'vitest';
import {
  centralStore,
  TenantScopedRepository,
} from '../../server/core/tenantGuard.js';
import {
  calculateWACExact,
  allocateLandedCostMultiMethod,
  reconstructStockAsOfDate,
  detectLowStockAlerts,
} from '../lib/inventory.js';

describe('PHASE-07: Inventory Movements, WAC Recalculation, Transfers & Stocktake', () => {
  let tenantId: string;
  let adminRepo: TenantScopedRepository;
  let cashierRepo: TenantScopedRepository;
  let warehouse1Id: string;
  let warehouse2Id: string;
  let itemId: string;

  beforeEach(() => {
    centralStore.initDefaultSeed();

    const demoTenant = Array.from(centralStore.tenants.values())[0];
    tenantId = demoTenant.id;

    adminRepo = new TenantScopedRepository({
      userId: 'user-admin-01',
      tenantId,
      userEmail: 'admin@al-inma.sa',
      role: 'OWNER',
      roleCode: 'OWNER',
      permissions: ['*'],
      ipAddress: '127.0.0.1',
      userAgent: 'Vitest Test Agent',
    });

    cashierRepo = new TenantScopedRepository({
      userId: 'user-cashier-01',
      tenantId,
      userEmail: 'cashier@al-inma.sa',
      role: 'CASHIER',
      roleCode: 'CASHIER',
      permissions: ['sales:invoice:create', 'sales:invoice:view'],
      ipAddress: '127.0.0.1',
      userAgent: 'Vitest Test Agent',
    });

    const whs = adminRepo.getWarehouses();
    warehouse1Id = whs[0].id;
    warehouse2Id = whs[1] ? whs[1].id : whs[0].id;

    const items = adminRepo.getItems();
    itemId = items[0].id;
  });

  // =========================================================================
  // 1. RULE I1: Zero Orphan Movements & Mandatory Source FK
  // =========================================================================
  describe('1. Rule I1: Append-Only Stock Movements & Mandatory Source FK', () => {
    it('rejects orphan stock movement missing sourceType or sourceId', async () => {
      await expect(
        adminRepo.recordStockMovement({
          warehouseId: warehouse1Id,
          itemId,
          movementType: 'PURCHASE_RECEIPT',
          quantityDelta: 10,
          unitCost: 25.0,
          sourceType: '' as any,
          sourceId: '',
        })
      ).rejects.toThrow(/Rule I1/);
    });

    it('successfully appends valid stock movement to immutable ledger', async () => {
      const movement = await adminRepo.recordStockMovement({
        warehouseId: warehouse1Id,
        itemId,
        movementType: 'PURCHASE_RECEIPT',
        quantityDelta: 50,
        unitCost: 30.0,
        sourceType: 'PURCHASE_BILL',
        sourceId: 'BILL-TEST-001',
        sourceDocumentNumber: 'PB-2026-00099',
        reason: 'استلام بضاعة مشتريات مورد',
      });

      expect(movement.id).toBeDefined();
      expect(movement.quantityDelta).toBe(50);
      expect(movement.unitCostApplied).toBe(30.0);
      expect(movement.sourceType).toBe('PURCHASE_BILL');
      expect(movement.sourceId).toBe('BILL-TEST-001');

      const movements = adminRepo.getStockMovements({ itemId });
      expect(movements.some((m) => m.id === movement.id)).toBe(true);
    });
  });

  // =========================================================================
  // 2. RULE I2: Perpetual Weighted Average Cost (WAC) Recalculation
  // =========================================================================
  describe('2. Rule I2: Perpetual Weighted Average Cost (WAC) Math & Intake/Outflow', () => {
    it('calculates WAC exactly using fixed-point halalas arithmetic', () => {
      // Current: 100 units @ 20.00 SAR = 2,000 SAR
      // Incoming: 50 units @ 35.00 SAR = 1,750 SAR
      // Total: 150 units = 3,750 SAR -> WAC = 25.00 SAR
      const result = calculateWACExact(100, 20.0, 50, 35.0);
      expect(result.newQty).toBe(150);
      expect(result.newWac).toBe(25.0);
      expect(result.totalValuationSar).toBe(3750.0);
    });

    it('updates stock record WAC upon inventory intake and preserves WAC on outflow', async () => {
      // Reset warehouse stock to known baseline: 100 units @ 20 SAR
      const whStocks = centralStore.warehouseStocks.get(tenantId)!;
      let stock = whStocks.find((s) => s.warehouseId === warehouse1Id && s.itemId === itemId);
      if (stock) {
        stock.currentStockBaseQty = 100;
        stock.availableQty = 100;
        stock.currentWac = 20.0;
      }

      // Intake: 50 units @ 35 SAR
      const intake = await adminRepo.recordStockMovement({
        warehouseId: warehouse1Id,
        itemId,
        movementType: 'PURCHASE_RECEIPT',
        quantityDelta: 50,
        unitCost: 35.0,
        sourceType: 'PURCHASE_BILL',
        sourceId: 'BILL-WAC-001',
      });

      expect(intake.resultingWac).toBe(25.0);
      expect(intake.resultingStock).toBe(150);

      // Outflow: 30 units (Sales dispatch)
      const outflow = await adminRepo.recordStockMovement({
        warehouseId: warehouse1Id,
        itemId,
        movementType: 'SALES_ISSUE',
        quantityDelta: -30,
        unitCost: 25.0,
        sourceType: 'SALES_INVOICE',
        sourceId: 'INV-WAC-001',
      });

      // Outflow preserves WAC at 25.00 SAR per moving average standard
      expect(outflow.resultingWac).toBe(25.0);
      expect(outflow.resultingStock).toBe(120);
    });
  });

  // =========================================================================
  // 3. RULE I6: Negative Stock Policy & Audit Override
  // =========================================================================
  describe('3. Rule I6: Negative Stock Policy Enforcement', () => {
    it('blocks transaction that causes warehouse stock to drop below zero', async () => {
      const whStocks = centralStore.warehouseStocks.get(tenantId)!;
      const stock = whStocks.find((s) => s.warehouseId === warehouse1Id && s.itemId === itemId);
      const available = stock ? stock.currentStockBaseQty : 0;

      // Attempt to issue more than available
      await expect(
        adminRepo.recordStockMovement({
          warehouseId: warehouse1Id,
          itemId,
          movementType: 'SALES_ISSUE',
          quantityDelta: -(available + 50),
          unitCost: 20.0,
          sourceType: 'SALES_INVOICE',
          sourceId: 'INV-FAIL-001',
          allowNegativeOverride: false,
        })
      ).rejects.toThrow(/Rule I6/);
    });

    it('rejects negative stock override if user lacks authorization', async () => {
      const whStocks = centralStore.warehouseStocks.get(tenantId)!;
      const stock = whStocks.find((s) => s.warehouseId === warehouse1Id && s.itemId === itemId);
      const available = stock ? stock.currentStockBaseQty : 0;

      await expect(
        cashierRepo.recordStockMovement({
          warehouseId: warehouse1Id,
          itemId,
          movementType: 'SALES_ISSUE',
          quantityDelta: -(available + 10),
          unitCost: 20.0,
          sourceType: 'SALES_INVOICE',
          sourceId: 'INV-UNAUTH-001',
          allowNegativeOverride: true,
        })
      ).rejects.toThrow();
    });

    it('allows negative stock override when permitted and records audit trail', async () => {
      const whStocks = centralStore.warehouseStocks.get(tenantId)!;
      const stock = whStocks.find((s) => s.warehouseId === warehouse1Id && s.itemId === itemId);
      const available = stock ? stock.currentStockBaseQty : 0;

      const movement = await adminRepo.recordStockMovement({
        warehouseId: warehouse1Id,
        itemId,
        movementType: 'SALES_ISSUE',
        quantityDelta: -(available + 5),
        unitCost: 20.0,
        sourceType: 'SALES_INVOICE',
        sourceId: 'INV-OVERRIDE-001',
        allowNegativeOverride: true,
        reason: 'موافقة استثنائية من المدير العام لتلبية طلب عاجل',
      });

      expect(movement.resultingStock).toBe(-5);
      const audits = centralStore.auditLogs;
      expect(audits.some((a) => a.action === 'NEGATIVE_STOCK_OVERRIDE')).toBe(true);
    });
  });

  // =========================================================================
  // 4. OPENING STOCK BATCH & BALANCING GL JOURNAL
  // =========================================================================
  describe('4. Opening Stock Wizard & Balancing GL Journal (Rule G1)', () => {
    it('creates opening stock batch and posts balanced journal entry (Dr Inventory / Cr Opening Equity)', async () => {
      const result = await adminRepo.createOpeningStockBatch({
        entryDate: '2026-01-01',
        descriptionAr: 'رصيد بضاعة أول المدة للسنة المالية 2026',
        items: [
          {
            itemId,
            warehouseId: warehouse1Id,
            quantity: 200,
            unitCostSar: 15.0,
            batchNumber: 'BATCH-2026-01',
          },
        ],
      });

      expect(result.movementsCount).toBe(1);
      expect(result.totalValuationSar).toBe(3000.0);
      expect(result.journalId).toBeDefined();

      const journals = adminRepo.getJournals();
      const openingJournal = journals.find((j) => j.id === result.journalId);
      expect(openingJournal).toBeDefined();
      expect(openingJournal?.totalDebitCents).toBe(openingJournal?.totalCreditCents);
      expect(openingJournal?.totalDebitCents).toBe(300000n); // 3,000 SAR in halalas
    });
  });

  // =========================================================================
  // 5. INTER-WAREHOUSE TRANSFERS (Value Preservation)
  // =========================================================================
  describe('5. Inter-Warehouse Transfers & Enterprise Value Preservation', () => {
    it('rejects transfer when source and destination warehouse are the same', async () => {
      await expect(
        adminRepo.createStockTransfer({
          fromWarehouseId: warehouse1Id,
          toWarehouseId: warehouse1Id,
          lines: [{ itemId, quantity: 10 }],
        })
      ).rejects.toThrow(/same/);
    });

    it('transfers stock between warehouses while strictly preserving total valuation', async () => {
      // Ensure source warehouse has stock
      await adminRepo.recordStockMovement({
        warehouseId: warehouse1Id,
        itemId,
        movementType: 'OPENING_STOCK',
        quantityDelta: 100,
        unitCost: 20.0,
        sourceType: 'OPENING_STOCK',
        sourceId: 'INIT-TRF-001',
      });

      const transfer = await adminRepo.createStockTransfer({
        fromWarehouseId: warehouse1Id,
        toWarehouseId: warehouse2Id,
        transferDate: '2026-03-01',
        notes: 'نقل مخزون لتغذية الفرع الإقليمي',
        lines: [
          {
            itemId,
            quantity: 25,
          },
        ],
      });

      expect(transfer.id).toBeDefined();
      expect(transfer.status).toBe('COMPLETED');
      expect(transfer.lines[0].baseQuantity).toBe(25);
      expect(transfer.totalValueSar).toBe(Math.round(25 * transfer.lines[0].unitCost * 100) / 100);

      // Verify both movement legs exist in ledger
      const movements = adminRepo.getStockMovements({ sourceId: transfer.id });
      expect(movements.length).toBe(2);

      const transferOut = movements.find((m) => m.movementType === 'TRANSFER_OUT');
      const transferIn = movements.find((m) => m.movementType === 'TRANSFER_IN');

      expect(transferOut?.quantityDelta).toBe(-25);
      expect(transferIn?.quantityDelta).toBe(25);
      expect(transferOut?.unitCostApplied).toBe(transferIn?.unitCostApplied);
    });
  });

  // =========================================================================
  // 6. CLASSIFIED STOCK ADJUSTMENTS
  // =========================================================================
  describe('6. Classified Stock Adjustments & Balancing GL Journals', () => {
    it('creates negative stock adjustment (Damage/Loss) with balancing journal', async () => {
      const adj = await adminRepo.createStockAdjustment({
        warehouseId: warehouse1Id,
        reasonCode: 'DAMAGE',
        description: 'تلف بضاعة أثناء التفريغ والتحميل',
        lines: [
          {
            itemId,
            quantityDelta: -5,
            reason: 'كسر في العبوة الخارجية',
          },
        ],
      });

      expect(adj.status).toBe('APPROVED');
      expect(adj.journalId).toBeDefined();

      const journals = adminRepo.getJournals();
      const jEntry = journals.find((j) => j.id === adj.journalId);
      expect(jEntry).toBeDefined();
      expect(jEntry?.totalDebitCents).toBe(jEntry?.totalCreditCents);
    });

    it('creates positive stock adjustment (Found Goods) with gain journal', async () => {
      const adj = await adminRepo.createStockAdjustment({
        warehouseId: warehouse1Id,
        reasonCode: 'FOUND_GOODS',
        description: 'زيادة مخزنية مكتشفة بعد إعادة الترتيب',
        lines: [
          {
            itemId,
            quantityDelta: 10,
            reason: 'بضاعة عثر عليها بالرف B-02',
          },
        ],
      });

      expect(adj.status).toBe('APPROVED');
      expect(adj.journalId).toBeDefined();
    });
  });

  // =========================================================================
  // 7. STOCKTAKE & PHYSICAL CYCLE COUNTING
  // =========================================================================
  describe('7. Stocktake & Cycle Counting Workflow', () => {
    it('creates stocktake, enters counts, detects variances, and approves with auto-post', async () => {
      // 1. Create Stocktake
      const stocktake = adminRepo.createStocktake({
        warehouseId: warehouse1Id,
        scopeType: 'FULL_WAREHOUSE',
        snapshotDate: '2026-03-15',
      });

      expect(stocktake.status).toBe('DRAFT');
      expect(stocktake.entries.length).toBeGreaterThan(0);

      const targetEntry = stocktake.entries.find((e) => e.itemId === itemId)!;
      const originalBook = targetEntry.systemBookQty;

      // 2. Enter counted quantity (e.g. 5 units short)
      const counted = Math.max(0, originalBook - 5);
      const updatedStocktake = adminRepo.enterStocktakeCounts(stocktake.id, [
        {
          itemId,
          countedQty: counted,
          scannedBarcode: '6281000001',
        },
      ]);

      expect(updatedStocktake.status).toBe('IN_PROGRESS');
      const updatedEntry = updatedStocktake.entries.find((e) => e.itemId === itemId)!;
      expect(updatedEntry.varianceQty).toBe(counted - originalBook);

      // 3. Approve Stocktake
      const approved = await adminRepo.approveStocktake(stocktake.id);
      expect(approved.status).toBe('APPROVED');

      // Verify stock movements were created for variances
      const movements = adminRepo.getStockMovements({ sourceId: stocktake.id });
      if (updatedEntry.varianceQty !== 0) {
        expect(movements.length).toBeGreaterThan(0);
      }
    });
  });

  // =========================================================================
  // 8. MULTI-METHOD LANDED COST ENGINE
  // =========================================================================
  describe('8. Multi-Method Landed Cost Allocation Engine', () => {
    it('allocates landed cost by VALUE proportionally and absorbs penny rounding', () => {
      const items = [
        { itemId: 'item-1', sku: 'SKU-1', itemNameAr: 'صنف 1', quantity: 10, basePrice: 100.0 }, // Value: 1000 SAR (50%)
        { itemId: 'item-2', sku: 'SKU-2', itemNameAr: 'صنف 2', quantity: 10, basePrice: 100.0 }, // Value: 1000 SAR (50%)
      ];
      const costLines = [
        { id: 'c1', type: 'FREIGHT' as const, amountSar: 200.0 },
      ];

      const result = allocateLandedCostMultiMethod('VALUE', items, costLines);
      expect(result.totalCostSar).toBe(200.0);
      expect(result.allocations[0].allocatedAmount).toBe(100.0);
      expect(result.allocations[1].allocatedAmount).toBe(100.0);
      expect(result.allocations[0].effectiveUnitCost).toBe(110.0); // 100 + (100/10)
    });

    it('creates and posts Landed Cost document with balanced GL journal', async () => {
      const doc = await adminRepo.createLandedCostDocument({
        sourceBillId: 'BILL-LC-001',
        sourceBillNumber: 'PB-2026-00101',
        allocationMethod: 'QUANTITY',
        costLines: [
          { type: 'CUSTOMS', amountSar: 500.0, description: 'رسوم جمركية ميناء الملك عبدالعزيز' },
          { type: 'CLEARANCE', amountSar: 150.0, description: 'أتعاب المخلص الجمركي' },
        ],
        items: [
          { itemId, quantity: 50, basePrice: 40.0 },
        ],
      });

      expect(doc.id).toBeDefined();
      expect(doc.totalLandedCostSar).toBe(650.0);
      expect(doc.journalId).toBeDefined();

      const journals = adminRepo.getJournals();
      const jEntry = journals.find((j) => j.id === doc.journalId);
      expect(jEntry).toBeDefined();
      expect(jEntry?.totalDebitCents).toBe(65000n);
    });
  });

  // =========================================================================
  // 9. AS-OF DATE POINT-IN-TIME RECONSTRUCTION & LOW STOCK ALERTS
  // =========================================================================
  describe('9. Point-in-Time Stock Reconstruction & Low-Stock Alerts', () => {
    it('reconstructs stock balance as of a historical date', () => {
      const movements = [
        {
          id: 'm1',
          tenantId,
          warehouseId: warehouse1Id,
          warehouseNameAr: 'المستودع الرئيسي',
          itemId: 'item-test',
          sku: 'SKU-T',
          itemNameAr: 'صنف تجريبي',
          movementType: 'OPENING_STOCK' as const,
          quantityDelta: 100,
          unitCostApplied: 20.0,
          resultingWac: 20.0,
          valueDelta: 2000.0,
          resultingStock: 100,
          sourceType: 'OPENING_STOCK' as const,
          sourceId: 'SRC-1',
          userId: 'u1',
          userEmail: 'u1@test.com',
          movementDate: '2026-01-01',
          createdAt: '2026-01-01T10:00:00Z',
        },
        {
          id: 'm2',
          tenantId,
          warehouseId: warehouse1Id,
          warehouseNameAr: 'المستودع الرئيسي',
          itemId: 'item-test',
          sku: 'SKU-T',
          itemNameAr: 'صنف تجريبي',
          movementType: 'SALES_ISSUE' as const,
          quantityDelta: -40,
          unitCostApplied: 20.0,
          resultingWac: 20.0,
          valueDelta: -800.0,
          resultingStock: 60,
          sourceType: 'SALES_INVOICE' as const,
          sourceId: 'SRC-2',
          userId: 'u1',
          userEmail: 'u1@test.com',
          movementDate: '2026-02-01',
          createdAt: '2026-02-01T10:00:00Z',
        },
      ];

      const snapshotBefore = reconstructStockAsOfDate(movements, '2026-01-15', 'item-test');
      expect(snapshotBefore.quantityOnHand).toBe(100);
      expect(snapshotBefore.wac).toBe(20.0);

      const snapshotAfter = reconstructStockAsOfDate(movements, '2026-02-15', 'item-test');
      expect(snapshotAfter.quantityOnHand).toBe(60);
      expect(snapshotAfter.wac).toBe(20.0);
    });

    it('detects low stock alerts and reorder point thresholds', () => {
      const items = [
        { id: 'item-low', sku: 'SKU-LOW', nameAr: 'صنف منخفض', minimumStockLevel: 20, reorderQuantity: 50 },
        { id: 'item-ok', sku: 'SKU-OK', nameAr: 'صنف كافي', minimumStockLevel: 10, reorderQuantity: 20 },
      ];
      const whStocks = [
        { itemId: 'item-low', currentStockBaseQty: 5 },
        { itemId: 'item-ok', currentStockBaseQty: 50 },
      ];

      const alerts = detectLowStockAlerts(items, whStocks);
      const lowAlert = alerts.find((a) => a.itemId === 'item-low');
      const okAlert = alerts.find((a) => a.itemId === 'item-ok');

      expect(lowAlert?.status).toBe('CRITICAL_LOW');
      expect(okAlert?.status).toBe('ADEQUATE');
    });
  });
});

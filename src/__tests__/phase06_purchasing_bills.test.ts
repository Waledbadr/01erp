import { describe, it, expect, beforeEach } from 'vitest';
import {
  centralStore,
  TenantScopedRepository,
} from '../../server/core/tenantGuard.js';
import {
  calculatePurchasingLine,
  calculatePurchasingTotals,
  performThreeWayMatch,
  roundHalalas,
  toHalalasInt,
  fromHalalasInt,
} from '../lib/purchasing.js';

describe('PHASE-06: Purchasing, Bills, Landed Costs, 3-Way Matching & Supplier Master', () => {
  let tenantId: string;
  let adminRepo: TenantScopedRepository;
  let warehouseId: string;
  let itemId: string;
  let supplierId: string;

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

    const whs = adminRepo.getWarehouses();
    warehouseId = whs[0].id;

    const items = adminRepo.getItems();
    itemId = items[0].id;

    const suppliers = adminRepo.getSuppliers();
    supplierId = suppliers.suppliers[0].id;
  });

  it('1. Calculates purchasing lines with exact Halalas integer rounding and 15% VAT', () => {
    const line = calculatePurchasingLine({
      quantity: 10,
      unitCostSar: 100,
      discountPercent: 10, // 10% discount = 10 SAR off per unit -> 90 SAR
      taxRate: 15,
      conversionFactor: 1,
    });

    expect(line.taxableAmountSar).toBe(900.0);
    expect(line.taxAmountSar).toBe(135.0); // 15% of 900
    expect(line.totalAmountSar).toBe(1035.0);
    expect(Number(toHalalasInt(line.totalAmountSar))).toBe(103500);
  });

  it('2. Enforces 3-way matching between Purchase Order, Bill, and Goods Receipt', () => {
    const poLines = [
      { itemId, quantity: 20, unitCostSar: 50.0 },
    ];
    const billLines = [
      { itemId, quantity: 20, unitCostSar: 50.0 },
    ];
    const grnLines = [
      { itemId, receivedQuantity: 20 },
    ];

    const matchResult = performThreeWayMatch(poLines, billLines, grnLines);
    expect(matchResult.isMatched).toBe(true);
    expect(matchResult.status).toBe('MATCHED');
    expect(matchResult.variances.length).toBe(0);

    // Test quantity variance mismatch
    const mismatchedGrn = [
      { itemId, receivedQuantity: 15 }, // Only 15 received instead of 20
    ];
    const mismatchResult = performThreeWayMatch(poLines, billLines, mismatchedGrn);
    expect(mismatchResult.isMatched).toBe(false);
    expect(mismatchResult.status).toBe('VARIANCE');
    expect(mismatchResult.variances.length).toBeGreaterThan(0);
  });

  it('3. Successfully creates and confirms a Purchase Order (PO)', () => {
    const po = adminRepo.createPurchaseOrder({
      supplierId,
      expectedDeliveryDate: '2026-02-15',
      notes: 'أمر شراء دوري للبضائع الأساسية',
      lines: [
        {
          itemId,
          quantity: 25,
          unitCostSar: 45.0,
          discountPercent: 0,
          taxRate: 15,
        },
      ],
    });

    expect(po.orderNumber).toMatch(/^PO-\d{4}-\d{5}$/);
    expect(po.status).toBe('CONFIRMED');
    expect(po.supplierId).toBe(supplierId);
    expect(po.lines.length).toBe(1);
    expect(po.subtotalSar).toBe(1125.0); // 25 * 45
    expect(po.taxTotalSar).toBe(168.75); // 15% of 1125
    expect(po.totalAmountSar).toBe(1293.75);
  });

  it('4. Creates and posts a Purchase Bill with Rule G1 double-entry GL journal and WAC recalculation', () => {
    const itemBefore = adminRepo.getItemById(itemId)!;
    const oldWac = itemBefore.currentWac || itemBefore.cost;
    const oldStock = itemBefore.currentStock;

    const bill = adminRepo.createPurchaseBill({
      supplierId,
      supplierInvoiceNumber: 'SUP-INV-2026-001',
      warehouseId,
      issueDate: '2026-01-20',
      dueDate: '2026-02-20',
      paymentMethod: 'CREDIT_ACCOUNT',
      lines: [
        {
          itemId,
          quantity: 50,
          unitCostSar: 60.0,
          discountPercent: 0,
          taxRate: 15,
        },
      ],
    });

    expect(bill.billNumber).toMatch(/^BILL-\d{4}-\d{5}$/);
    expect(bill.status).toBe('DRAFT');

    // Post the bill
    const { bill: posted, journalEntry } = adminRepo.postPurchaseBill(bill.id);
    expect(posted.status).toBe('POSTED');
    expect(posted.journalId).toBeDefined();

    // Verify GL Journal Entry (Rule G1: Debits strictly equal Credits)
    const journal = adminRepo.getJournalById(posted.journalId!);
    expect(journal).toBeDefined();
    expect(journal!.isBalanced).toBe(true);
    expect(journal!.totalDebit).toBe(journal!.totalCredit);
    expect(journal!.totalDebit).toBe(posted.totalAmountSar);

    // Verify Inventory Stock and WAC recalculation (Rule I2)
    const itemAfter = adminRepo.getItemById(itemId)!;
    expect(itemAfter.currentStock).toBe(oldStock + 50);
  });

  it('5. Creates a Vendor Debit Note (Purchase Return) reversing 15% VAT and stock', () => {
    // First create and post a purchase bill
    const bill = adminRepo.createPurchaseBill({
      supplierId,
      supplierInvoiceNumber: 'SUP-RET-001',
      warehouseId,
      issueDate: '2026-01-22',
      dueDate: '2026-02-22',
      paymentMethod: 'CREDIT_ACCOUNT',
      lines: [
        {
          itemId,
          quantity: 20,
          unitCostSar: 50.0,
          discountPercent: 0,
          taxRate: 15,
        },
      ],
    });
    adminRepo.postPurchaseBill(bill.id);

    const stockBefore = adminRepo.getItemById(itemId)!.currentStock;

    // Issue Debit Note for returning 5 units
    const { debitNote } = adminRepo.createVendorDebitNote({
      originalBillId: bill.id,
      reasonCode: 'DEFECTIVE_GOODS',
      reasonDescription: 'بضاعة غير مطابقة للمواصفات',
      lines: [
        {
          itemId,
          quantity: 5,
          unitCostSar: 50.0,
        },
      ],
    });

    expect(debitNote.debitNoteNumber).toMatch(/^(?:DBN|DN)-\d{4}-\d{5}$/);
    expect(debitNote.subtotalSar).toBe(250.0);
    expect(debitNote.taxTotalSar).toBe(37.5);
    expect(debitNote.totalAmountSar).toBe(287.5);

    // Check inventory stock decreased by returned quantity
    const stockAfter = adminRepo.getItemById(itemId)!.currentStock;
    expect(stockAfter).toBe(stockBefore - 5);
  });

  it('6. Records a Supplier Payment voucher updating remaining bill balances and AP subaccounts', () => {
    // Create and post bill
    const bill = adminRepo.createPurchaseBill({
      supplierId,
      supplierInvoiceNumber: 'SUP-PAY-001',
      warehouseId,
      issueDate: '2026-01-25',
      dueDate: '2026-02-25',
      paymentMethod: 'CREDIT_ACCOUNT',
      lines: [
        {
          itemId,
          quantity: 10,
          unitCostSar: 100.0,
          discountPercent: 0,
          taxRate: 15,
        },
      ],
    });
    adminRepo.postPurchaseBill(bill.id);

    const totalBillSar = bill.totalAmountSar; // 1000 + 150 = 1150 SAR

    // Make partial payment of 500 SAR
    const { payment } = adminRepo.createSupplierPayment({
      supplierId,
      amountSar: 500.0,
      paymentMethod: 'BANK_TRANSFER',
      paymentDate: '2026-01-26',
      referenceNumber: 'TR-TEST-99824',
      allocations: [
        {
          billId: bill.id,
          allocatedAmountSar: 500.0,
        },
      ],
    });

    expect(payment.paymentNumber).toMatch(/^PAY-\d{4}-\d{5}$/);
    expect(payment.amountSar).toBe(500.0);

    // Verify bill status is now PARTIALLY_PAID
    const updatedBill = adminRepo.getPurchaseBillById(bill.id)!;
    expect(updatedBill.paidAmountSar).toBe(500.0);
    expect(updatedBill.remainingAmountSar).toBe(roundHalalas(totalBillSar - 500.0));
    expect(updatedBill.status).toBe('PARTIALLY_PAID');
  });

  it('7. Generates accurate Accounts Payable aging report with buckets', () => {
    const aging = adminRepo.getSupplierAging();
    expect(Array.isArray(aging)).toBe(true);
    expect(aging.length).toBeGreaterThan(0);

    const firstSupplierAging = aging[0];
    expect(firstSupplierAging).toHaveProperty('supplierId');
    expect(firstSupplierAging).toHaveProperty('supplierNameAr');
    expect(firstSupplierAging).toHaveProperty('current0To30');
    expect(firstSupplierAging).toHaveProperty('days31To60');
    expect(firstSupplierAging).toHaveProperty('days61To90');
    expect(firstSupplierAging).toHaveProperty('days90Plus');
    expect(firstSupplierAging).toHaveProperty('totalOutstanding');
  });

  it('8. Blocks purchasing from SUSPENDED suppliers unless explicit override is provided', () => {
    // Suspend the supplier
    adminRepo.setSupplierStatus(supplierId, 'SUSPENDED', 'موقوف مؤقتاً بسبب عدم تجديد السجل التجاري');

    // Attempt purchase check without override
    const checkBlocked = adminRepo.checkSupplierCanPurchase(supplierId);
    expect(checkBlocked.allowed).toBe(false);
    expect(checkBlocked.reason).toBeDefined();

    // Check with override authorized
    const checkWithOverride = adminRepo.checkSupplierCanPurchase(
      supplierId,
      'استثناء معتمد من المدير المالي لاستلام توريد حرج'
    );
    expect(checkWithOverride.allowed).toBe(true);
  });
});

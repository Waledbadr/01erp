import { describe, it, expect, beforeEach } from 'vitest';
import { PosService } from '../../server/modules/pos/posService.js';
import { PosCartItem, PosPaymentSplit } from '../../server/modules/pos/types.js';

describe('Phase 15: Point of Sale (POS) Engine', () => {
  const tenantId = 'tenant-pos-test';
  let registerId: string;

  beforeEach(() => {
    const registers = PosService.getRegisters(tenantId);
    registerId = registers[0].id;
  });

  describe('1. POS Registers & Shift Lifecycle', () => {
    it('returns initialized default POS registers for a tenant', () => {
      const registers = PosService.getRegisters(tenantId);
      expect(registers.length).toBeGreaterThan(0);
      expect(registers[0].code).toBe('POS-01');
      expect(registers[0].status).toBe('ACTIVE');
    });

    it('opens a new cashier shift with an opening float', () => {
      const shift = PosService.openShift(
        tenantId,
        registerId,
        'usr-cashier-test',
        'سعد القحطاني',
        'CASHIER',
        600.00
      );

      expect(shift.status).toBe('OPEN');
      expect(shift.cashierName).toBe('سعد القحطاني');
      expect(shift.openingFloatSar).toBe(600.00);
      expect(shift.expectedCashSar).toBe(600.00);
      expect(shift.transactionCount).toBe(0);

      // Verify active shift retrieval
      const active = PosService.getActiveShift(tenantId, registerId);
      expect(active).toBeDefined();
      expect(active?.id).toBe(shift.id);
    });

    it('prevents opening multiple concurrent shifts on the same register', () => {
      expect(() => {
        PosService.openShift(
          tenantId,
          registerId,
          'usr-cashier-2',
          'محمد العتيبي',
          'CASHIER',
          300
        );
      }).toThrow(/already has an open shift/);
    });
  });

  describe('2. Cash In / Cash Out Movements', () => {
    it('records a Cash In movement (adding drawer float) and updates expected cash', () => {
      const active = PosService.getActiveShift(tenantId, registerId)!;
      const prevExpected = active.expectedCashSar;

      const movement = PosService.recordCashMovement(
        tenantId,
        active.id,
        'CASH_IN',
        150.00,
        'فكة إضافية من الخزينة',
        'مشرف الوردية'
      );

      expect(movement.type).toBe('CASH_IN');
      expect(movement.amountSar).toBe(150.00);

      const updated = PosService.getActiveShift(tenantId, registerId)!;
      expect(updated.totalCashInSar).toBe(150.00);
      expect(updated.expectedCashSar).toBe(prevExpected + 150.00);
    });

    it('records a Cash Out movement (safe drop) and updates expected cash', () => {
      const active = PosService.getActiveShift(tenantId, registerId)!;
      const prevExpected = active.expectedCashSar;

      const movement = PosService.recordCashMovement(
        tenantId,
        active.id,
        'CASH_OUT',
        200.00,
        'تحويل سيولة للخزينة الرئيسية',
        'الكاشير'
      );

      expect(movement.type).toBe('CASH_OUT');
      expect(movement.amountSar).toBe(200.00);

      const updated = PosService.getActiveShift(tenantId, registerId)!;
      expect(updated.totalCashOutSar).toBe(200.00);
      expect(updated.expectedCashSar).toBe(prevExpected - 200.00);
    });
  });

  describe('3. POS Order Processing & ZATCA QR Code', () => {
    it('processes a POS order with exact line items, 15% VAT, and split payments', () => {
      const active = PosService.getActiveShift(tenantId, registerId)!;

      const items: PosCartItem[] = [
        {
          itemId: 'itm-01',
          itemCode: 'ITM-WAT-01',
          nameAr: 'مياه معدنية 330 مل',
          nameEn: 'Mineral Water 330ml',
          barcode: '628100100101',
          uom: 'BOX',
          unitPriceSar: 20.00,
          quantity: 2,
          vatRate: 0.15,
          discountAmountSar: 0,
          discountPercentage: 0,
          subtotalSar: 40.00,
          vatAmountSar: 6.00,
          totalSar: 46.00,
          costPriceSar: 12.00,
        },
        {
          itemId: 'itm-02',
          itemCode: 'ITM-COF-01',
          nameAr: 'قهوة سعودية بالهيل',
          nameEn: 'Saudi Coffee',
          barcode: '628100200202',
          uom: 'PCS',
          unitPriceSar: 50.00,
          quantity: 1,
          vatRate: 0.15,
          discountAmountSar: 0,
          discountPercentage: 0,
          subtotalSar: 50.00,
          vatAmountSar: 7.50,
          totalSar: 57.50,
          costPriceSar: 30.00,
        },
      ];

      // Total is 46.00 + 57.50 = 103.50 SAR
      const payments: PosPaymentSplit[] = [
        { tenderType: 'MADA', amountSar: 50.00 },
        { tenderType: 'CASH', amountSar: 53.50 },
      ];

      const order = PosService.processOrder(tenantId, {
        shiftId: active.id,
        registerId,
        items,
        payments,
        customerName: 'فهد العتيبي',
      });

      expect(order.invoiceNumber).toMatch(/^POS-INV-/);
      expect(order.subtotalSar).toBe(90.00);
      expect(order.vatTotalSar).toBe(13.50);
      expect(order.grandTotalSar).toBe(103.50);
      expect(order.payments.length).toBe(2);
      expect(order.zatcaQrCodeBase64).toBeDefined();
      expect(order.journalEntryId).toBeDefined();

      // Verify Shift Update
      const updatedShift = PosService.getActiveShift(tenantId, registerId)!;
      expect(updatedShift.transactionCount).toBe(1);
      expect(updatedShift.netSalesSar).toBe(103.50);
      expect(updatedShift.madaSalesSar).toBe(50.00);
      expect(updatedShift.cashSalesSar).toBe(53.50);
      expect(updatedShift.expectedCashSar).toBe(
        updatedShift.openingFloatSar + updatedShift.totalCashInSar - updatedShift.totalCashOutSar + 53.50
      );
    });
  });

  describe('4. Mid-Shift X-Report', () => {
    it('generates an accurate real-time X-Report without closing the shift', () => {
      const active = PosService.getActiveShift(tenantId, registerId)!;
      const xReport = PosService.generateXReport(tenantId, active.id);

      expect(xReport.shift.id).toBe(active.id);
      expect(xReport.register.id).toBe(registerId);
      expect(xReport.recentOrdersCount).toBe(1);
      expect(xReport.shift.netSalesSar).toBe(103.50);
      expect(xReport.generatedAt).toBeDefined();
    });
  });

  describe('5. Held Cart (Parked Tickets) Management', () => {
    it('holds an in-progress cart, lists it, and resumes it', () => {
      const heldItems: PosCartItem[] = [
        {
          itemId: 'itm-03',
          itemCode: 'ITM-DAT-01',
          nameAr: 'تمر سكري فاخر',
          nameEn: 'Dates Sukari',
          barcode: '628100300303',
          uom: 'KG',
          unitPriceSar: 35.00,
          quantity: 2,
          vatRate: 0.15,
          discountAmountSar: 0,
          discountPercentage: 0,
          subtotalSar: 70.00,
          vatAmountSar: 10.50,
          totalSar: 80.50,
        },
      ];

      const held = PosService.holdCart(
        tenantId,
        registerId,
        'usr-cashier-test',
        heldItems,
        'سالم الدوسري',
        'العميل ذهب لإحضار صنف إضافي'
      );

      expect(held.customerName).toBe('سالم الدوسري');
      expect(held.grandTotalSar).toBe(80.50);

      // List held carts
      const list = PosService.getHeldCarts(tenantId, registerId);
      expect(list.some((h) => h.id === held.id)).toBe(true);

      // Resume held cart
      const resumed = PosService.resumeHeldCart(tenantId, held.id);
      expect(resumed.items.length).toBe(1);
      expect(resumed.items[0].itemId).toBe('itm-03');

      // Verify removed from held store
      const afterList = PosService.getHeldCarts(tenantId, registerId);
      expect(afterList.some((h) => h.id === held.id)).toBe(false);
    });
  });

  describe('6. Offline Queue Batch Sync', () => {
    it('syncs offline queued orders in batch mode and posts to GL', () => {
      const active = PosService.getActiveShift(tenantId, registerId)!;

      const offlineOrders = [
        {
          offlineId: 'off-order-101',
          shiftId: active.id,
          registerId,
          items: [
            {
              itemId: 'itm-04',
              itemCode: 'ITM-OIL-01',
              nameAr: 'زيت زيتون بكر',
              nameEn: 'Olive Oil',
              barcode: '628100500505',
              uom: 'BOTTLE',
              unitPriceSar: 50.00,
              quantity: 1,
              vatRate: 0.15,
              discountAmountSar: 0,
              discountPercentage: 0,
              subtotalSar: 50.00,
              vatAmountSar: 7.50,
              totalSar: 57.50,
            },
          ],
          payments: [{ tenderType: 'MADA' as const, amountSar: 57.50 }],
          customerName: 'عميل أوفلاين',
          createdAt: new Date().toISOString(),
          totalSar: 57.50,
        },
      ];

      const result = PosService.syncOfflineOrders(tenantId, offlineOrders);

      expect(result.synced.length).toBe(1);
      expect(result.errors.length).toBe(0);
      expect(result.synced[0].isOfflineSync).toBe(true);
      expect(result.synced[0].grandTotalSar).toBe(57.50);
    });
  });

  describe('7. Shift Close & Z-Report Reconciliation', () => {
    it('closes the shift, handles physical cash discrepancy, and produces Z-Report', () => {
      const active = PosService.getActiveShift(tenantId, registerId)!;
      const expectedCash = active.expectedCashSar;

      // Close shift with exact cash
      const zReport = PosService.closeShift(
        tenantId,
        active.id,
        expectedCash,
        'مطابقة تامة',
        'usr-super-01',
        'معتمد من المشرف'
      );

      expect(zReport.reportNumber).toBeGreaterThan(0);
      expect(zReport.shift.status).toBe('CLOSED');
      expect(zReport.reconciliation.difference).toBe(0);
      expect(zReport.reconciliation.status).toBe('BALANCED');

      // Verify register is no longer linked to an open shift
      const reg = PosService.getRegisterById(tenantId, registerId);
      expect(reg?.currentShiftId).toBeUndefined();

      // Verify active shift is undefined
      const activeAfter = PosService.getActiveShift(tenantId, registerId);
      expect(activeAfter).toBeUndefined();
    });
  });
});

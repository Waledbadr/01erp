/**
 * Point of Sale (POS) Express API Routes — Saudi ERP Platform
 * REST endpoints for POS Registers, Shifts, Checkout, Cash Movements, X/Z Reports, and Offline Queue Sync.
 */

import { Router, Request, Response } from 'express';
import { PosService } from './posService.js';
import { logger } from '../../core/logger.js';
import { requireAuth } from '../../core/authMiddleware.js';

export const posRouter = Router();

// Every POS endpoint needs a signed-in user; registers, shifts and orders belong to the
// session's company (tenantId in the query/body is ignored; it used to default to a shared
// 'default-tenant' for every company).
posRouter.use(requireAuth);

// Sample fast POS catalog items for direct POS terminal search & touch-grid
const POS_DEFAULT_CATALOG = [
  {
    itemId: 'itm-pos-001',
    itemCode: 'ITM-WAT-01',
    barcode: '628100100101',
    nameAr: 'مياه معدنية طبيعية 330 مل (كرتون 24 حبة)',
    nameEn: 'Natural Mineral Water 330ml (Pack 24)',
    categoryAr: 'مشروبات ومياه',
    categoryEn: 'Beverages',
    uom: 'BOX',
    unitPriceSar: 18.00,
    costPriceSar: 12.50,
    vatRate: 0.15,
    stockQuantity: 145,
    quickKey: 'F1',
    isFavorite: true,
  },
  {
    itemId: 'itm-pos-002',
    itemCode: 'ITM-COF-01',
    barcode: '628100200202',
    nameAr: 'قهوة سعودية أصيلة بالهيل 500 جرام',
    nameEn: 'Authentic Saudi Coffee with Cardamom 500g',
    categoryAr: 'مواد غذائية وبن',
    categoryEn: 'Coffee & Food',
    uom: 'PCS',
    unitPriceSar: 45.00,
    costPriceSar: 30.00,
    vatRate: 0.15,
    stockQuantity: 82,
    quickKey: 'F2',
    isFavorite: true,
  },
  {
    itemId: 'itm-pos-003',
    itemCode: 'ITM-DAT-01',
    barcode: '628100300303',
    nameAr: 'تمر سكري القصيم فاخر 1 كجم',
    nameEn: 'Premium Qassim Sukari Dates 1kg',
    categoryAr: 'تمور وفاكهة',
    categoryEn: 'Dates & Sweets',
    uom: 'KG',
    unitPriceSar: 35.00,
    costPriceSar: 22.00,
    vatRate: 0.15,
    stockQuantity: 95,
    quickKey: 'F3',
    isFavorite: true,
  },
  {
    itemId: 'itm-pos-004',
    itemCode: 'ITM-PAP-01',
    barcode: '628100400404',
    nameAr: 'ورق تصوير حراري نقاط بيع 80x80 ملم (بكت 5 رول)',
    nameEn: 'Thermal POS Receipt Roll 80x80mm (Pack 5)',
    categoryAr: 'قرطاسية ومطبوعات',
    categoryEn: 'Stationery',
    uom: 'PACK',
    unitPriceSar: 25.00,
    costPriceSar: 16.00,
    vatRate: 0.15,
    stockQuantity: 210,
    quickKey: 'F4',
    isFavorite: true,
  },
  {
    itemId: 'itm-pos-005',
    itemCode: 'ITM-OIL-01',
    barcode: '628100500505',
    nameAr: 'زيت زيتون الجوف بكر ممتاز 1 لتر',
    nameEn: 'Al-Jouf Extra Virgin Olive Oil 1L',
    categoryAr: 'مواد غذائية وبن',
    categoryEn: 'Coffee & Food',
    uom: 'BOTTLE',
    unitPriceSar: 58.00,
    costPriceSar: 40.00,
    vatRate: 0.15,
    stockQuantity: 64,
    quickKey: 'F5',
    isFavorite: false,
  },
  {
    itemId: 'itm-pos-006',
    itemCode: 'ITM-TEA-01',
    barcode: '628100600606',
    nameAr: 'شاي سيلاني فاخر كبوس 100 كيس',
    nameEn: 'Premium Ceylon Tea 100 Bags',
    categoryAr: 'مشروبات ومياه',
    categoryEn: 'Beverages',
    uom: 'BOX',
    unitPriceSar: 14.50,
    costPriceSar: 9.80,
    vatRate: 0.15,
    stockQuantity: 120,
    quickKey: 'F6',
    isFavorite: false,
  },
  {
    itemId: 'itm-pos-007',
    itemCode: 'ITM-HON-01',
    barcode: '628100700707',
    nameAr: 'عسل سدر بلدي طبيعي 500 جرام',
    nameEn: 'Natural Sidr Honey 500g',
    categoryAr: 'تمور وفاكهة',
    categoryEn: 'Dates & Sweets',
    uom: 'JAR',
    unitPriceSar: 160.00,
    costPriceSar: 110.00,
    vatRate: 0.15,
    stockQuantity: 38,
    quickKey: 'F7',
    isFavorite: true,
  },
  {
    itemId: 'itm-pos-008',
    itemCode: 'ITM-SAN-01',
    barcode: '628100800808',
    nameAr: 'معقم أيدي طبي 500 مل برائحة اللافندر',
    nameEn: 'Hand Sanitizer 500ml Lavender',
    categoryAr: 'عناية ومنظفات',
    categoryEn: 'Care & Cleaning',
    uom: 'PCS',
    unitPriceSar: 12.00,
    costPriceSar: 7.20,
    vatRate: 0.15,
    stockQuantity: 180,
    quickKey: 'F8',
    isFavorite: false,
  },
];

/**
 * 1. Get POS product catalog
 */
posRouter.get('/catalog', (req: Request, res: Response) => {
  res.json({
    success: true,
    catalog: POS_DEFAULT_CATALOG,
  });
});

/**
 * 2. Get Registers list
 */
posRouter.get('/registers', (req: Request, res: Response) => {
  const tenantId = req.tenantContext!.tenantId;
  const registers = PosService.getRegisters(tenantId);
  res.json({
    success: true,
    registers,
  });
});

/**
 * 3. Get Active Shift for Register
 */
posRouter.get('/shifts/active/:registerId', (req: Request, res: Response) => {
  const tenantId = req.tenantContext!.tenantId;
  const registerId = req.params.registerId;
  const shift = PosService.getActiveShift(tenantId, registerId);
  const register = PosService.getRegisterById(tenantId, registerId);

  res.json({
    success: true,
    hasActiveShift: !!shift,
    shift: shift || null,
    register: register || null,
  });
});

/**
 * 4. Open Shift
 */
posRouter.post('/shifts/open', (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const { registerId, cashierId, cashierName, cashierRole, openingFloatSar } = req.body;

    if (!registerId) {
      return res.status(400).json({ success: false, message: 'Register ID is required' });
    }

    const shift = PosService.openShift(
      tenantId,
      registerId,
      cashierId || 'usr-cashier-01',
      cashierName || 'أحمد المحمدي (كاشير)',
      cashierRole || 'CASHIER',
      Number(openingFloatSar) || 0
    );

    res.json({
      success: true,
      shift,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err.message || 'Failed to open shift',
    });
  }
});

/**
 * 5. Record Cash In / Cash Out Movement
 */
posRouter.post('/shifts/cash-movement', (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const { shiftId, type, amountSar, reason, performedBy } = req.body;

    if (!shiftId || !type || !amountSar) {
      return res.status(400).json({ success: false, message: 'shiftId, type, and amount are required' });
    }

    const movement = PosService.recordCashMovement(
      tenantId,
      shiftId,
      type,
      Number(amountSar),
      reason || (type === 'CASH_IN' ? 'إيداع نقدي إضافي' : 'سحب نقدي للخزينة'),
      performedBy || 'الكاشير المسؤول'
    );

    res.json({
      success: true,
      movement,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err.message || 'Failed to record cash movement',
    });
  }
});

/**
 * 6. Generate X-Report
 */
posRouter.get('/shifts/:shiftId/x-report', (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const shiftId = req.params.shiftId;
    const report = PosService.generateXReport(tenantId, shiftId);

    res.json({
      success: true,
      report,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err.message || 'Failed to generate X-report',
    });
  }
});

/**
 * 7. Close Shift & Generate Z-Report
 */
posRouter.post('/shifts/:shiftId/close', (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const shiftId = req.params.shiftId;
    const { actualCashCountedSar, discrepancyReason, supervisorApprovalId, supervisorNotes } = req.body;

    if (actualCashCountedSar === undefined || actualCashCountedSar === null) {
      return res.status(400).json({ success: false, message: 'actualCashCountedSar is required' });
    }

    const zReport = PosService.closeShift(
      tenantId,
      shiftId,
      Number(actualCashCountedSar),
      discrepancyReason,
      supervisorApprovalId,
      supervisorNotes
    );

    res.json({
      success: true,
      zReport,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err.message || 'Failed to close shift',
    });
  }
});

/**
 * 8. Process POS Order
 */
posRouter.post('/orders', (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const order = PosService.processOrder(tenantId, req.body);

    res.json({
      success: true,
      order,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err.message || 'Failed to process order',
    });
  }
});

/**
 * 9. Batch Offline Sync Orders
 */
posRouter.post('/orders/sync', (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const { offlineOrders } = req.body;

    if (!Array.isArray(offlineOrders)) {
      return res.status(400).json({ success: false, message: 'offlineOrders array is required' });
    }

    const result = PosService.syncOfflineOrders(tenantId, offlineOrders);

    res.json({
      success: true,
      syncedCount: result.synced.length,
      syncedOrders: result.synced,
      errors: result.errors,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err.message || 'Failed to sync offline orders',
    });
  }
});

/**
 * 10. List Orders for Shift
 */
posRouter.get('/orders', (req: Request, res: Response) => {
  const tenantId = req.tenantContext!.tenantId;
  const shiftId = req.query.shiftId as string | undefined;
  const registerId = req.query.registerId as string | undefined;

  const orders = PosService.getOrders(tenantId, { shiftId, registerId });
  res.json({
    success: true,
    orders,
  });
});

/**
 * 11. Held Carts (Parked tickets)
 */
posRouter.post('/held-carts', (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const { registerId, cashierId, items, customerName, note } = req.body;

    const held = PosService.holdCart(tenantId, registerId, cashierId, items, customerName, note);
    res.json({
      success: true,
      heldCart: held,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err.message || 'Failed to hold cart',
    });
  }
});

posRouter.get('/held-carts', (req: Request, res: Response) => {
  const tenantId = req.tenantContext!.tenantId;
  const registerId = req.query.registerId as string | undefined;
  const heldCarts = PosService.getHeldCarts(tenantId, registerId);

  res.json({
    success: true,
    heldCarts,
  });
});

posRouter.post('/held-carts/:id/resume', (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const resumed = PosService.resumeHeldCart(tenantId, req.params.id);

    res.json({
      success: true,
      resumedCart: resumed,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err.message || 'Failed to resume cart',
    });
  }
});

posRouter.delete('/held-carts/:id', (req: Request, res: Response) => {
  const tenantId = req.tenantContext!.tenantId;
  const deleted = PosService.deleteHeldCart(tenantId, req.params.id);

  res.json({
    success: deleted,
  });
});

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requirePermission } from '../../core/authMiddleware.js';

export const purchasingRouter = Router();

purchasingRouter.get('/status', (req: Request, res: Response) => {
  res.json({
    module: 'purchasing',
    version: '4.0.0',
    phase: 'PHASE-08',
    capabilities: [
      'PURCHASE_REQUESTS_APPROVAL_WORKFLOW',
      'PURCHASE_ORDERS_OVER_RECEIVE_POLICY',
      'GOODS_RECEIPT_NOTES_GRN_BATCH_EXPIRY',
      'LANDED_COST_MULTI_METHOD_CAPITALIZATION',
      'THREE_WAY_MATCHING_WITH_AUDITED_OVERRIDES',
      'PURCHASE_BILLS_INPUT_VAT_15',
      'VENDOR_DEBIT_NOTES_PURCHASE_RETURNS',
      'SUPPLIER_PAYMENT_VOUCHERS_FIFO_ADVANCE',
      'PAYMENT_REALLOCATION_ENGINE',
      'PRICE_HISTORY_TRACKING',
      'SUPPLIER_STATEMENTS_AND_AGING',
      'PERPETUAL_WAC_RECALCULATION',
    ],
  });
});

// =============================================================
// 1. PURCHASE REQUESTS (طلبات الشراء)
// =============================================================

purchasingRouter.get('/requests', requireAuth, requirePermission('purchasing:order:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      search: req.query.search as string,
      status: req.query.status as string,
      priority: req.query.priority as string,
    };
    const requests = req.tenantRepo!.getPurchaseRequests(filters);
    res.json(requests);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.get('/requests/:id', requireAuth, requirePermission('purchasing:order:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const pr = req.tenantRepo!.getPurchaseRequestById(req.params.id);
    if (!pr) {
      return res.status(404).json({ error: 'Purchase request not found' });
    }
    res.json(pr);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.post('/requests', requireAuth, requirePermission('purchasing:order:create'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const newPR = req.tenantRepo!.createPurchaseRequest(req.body);
    res.status(201).json(newPR);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.post('/requests/:id/submit', requireAuth, requirePermission('purchasing:order:create'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const submitted = req.tenantRepo!.submitPurchaseRequest(req.params.id);
    res.json(submitted);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.post('/requests/:id/approve', requireAuth, requirePermission('purchasing:order:create'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const approved = req.tenantRepo!.approvePurchaseRequest(req.params.id);
    res.json(approved);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.post('/requests/:id/reject', requireAuth, requirePermission('purchasing:order:create'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = req.body;
    const rejected = req.tenantRepo!.rejectPurchaseRequest(req.params.id, reason);
    res.json(rejected);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.post('/requests/:id/convert-to-po', requireAuth, requirePermission('purchasing:order:create'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { supplierId } = req.body;
    const po = req.tenantRepo!.convertPRToPO(req.params.id, supplierId);
    res.status(201).json(po);
  } catch (err) {
    next(err);
  }
});

// =============================================================
// 2. PURCHASE ORDERS (أوامر الشراء)
// =============================================================

purchasingRouter.get('/orders', requireAuth, requirePermission('purchasing:order:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      search: req.query.search as string,
      status: req.query.status as string,
      supplierId: req.query.supplierId as string,
    };
    const orders = req.tenantRepo!.getPurchaseOrders(filters);
    res.json(orders);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.get('/orders/:id', requireAuth, requirePermission('purchasing:order:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = req.tenantRepo!.getPurchaseOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    res.json(order);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.post('/orders', requireAuth, requirePermission('purchasing:order:create'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const newOrder = req.tenantRepo!.createPurchaseOrder(req.body);
    res.status(201).json(newOrder);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.post('/orders/:id/confirm', requireAuth, requirePermission('purchasing:order:create'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const confirmed = req.tenantRepo!.confirmPurchaseOrder(req.params.id);
    res.json(confirmed);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.post('/orders/:id/cancel', requireAuth, requirePermission('purchasing:order:create'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = req.body;
    const cancelled = req.tenantRepo!.cancelPurchaseOrder(req.params.id, reason);
    res.json(cancelled);
  } catch (err) {
    next(err);
  }
});

// =============================================================
// 3. GOODS RECEIPT NOTES (GRN / سندات استلام البضاعة)
// =============================================================

purchasingRouter.get('/grn', requireAuth, requirePermission('purchasing:order:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      search: req.query.search as string,
      status: req.query.status as string,
      supplierId: req.query.supplierId as string,
      poId: req.query.poId as string,
    };
    const receipts = req.tenantRepo!.getGoodsReceiptNotes(filters);
    res.json(receipts);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.get('/grn/:id', requireAuth, requirePermission('purchasing:order:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const grn = req.tenantRepo!.getGoodsReceiptNoteById(req.params.id);
    if (!grn) {
      return res.status(404).json({ error: 'Goods receipt note not found' });
    }
    res.json(grn);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.post('/grn', requireAuth, requirePermission('purchasing:order:create'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const grn = req.tenantRepo!.createGoodsReceiptNote(req.body);
    res.status(201).json(grn);
  } catch (err) {
    next(err);
  }
});

// =============================================================
// 4. LANDED COST ALLOCATION (تكاليف الإنزال والشحن)
// =============================================================

purchasingRouter.post('/landed-cost/allocate', requireAuth, requirePermission('purchasing:bill:create'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = req.tenantRepo!.allocateLandedCost(req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// =============================================================
// 5. 3-WAY MATCHING EVALUATION & OVERRIDES
// =============================================================

purchasingRouter.get('/matching/report', requireAuth, requirePermission('purchasing:bill:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { poId, billId, grnId } = req.query;
    const report = req.tenantRepo!.getThreeWayMatchingReport({
      poId: poId as string,
      billId: billId as string,
      grnId: grnId as string,
    });
    res.json(report);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.post('/matching/override', requireAuth, requirePermission('purchasing:bill:post'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { billId, overrideReason } = req.body;
    const bill = req.tenantRepo!.overrideThreeWayMatch({ billId, overrideReason });
    res.json(bill);
  } catch (err) {
    next(err);
  }
});

// =============================================================
// 6. PURCHASE BILLS / VENDOR INVOICES (فواتير المشتريات)
// =============================================================

purchasingRouter.get('/bills', requireAuth, requirePermission('purchasing:bill:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      search: req.query.search as string,
      status: req.query.status as string,
      supplierId: req.query.supplierId as string,
    };
    const bills = req.tenantRepo!.getPurchaseBills(filters);
    res.json(bills);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.get('/bills/:id', requireAuth, requirePermission('purchasing:bill:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const bill = req.tenantRepo!.getPurchaseBillById(req.params.id);
    if (!bill) {
      return res.status(404).json({ error: 'Purchase bill not found' });
    }
    res.json(bill);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.post('/bills', requireAuth, requirePermission('purchasing:bill:create'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const newBill = req.tenantRepo!.createPurchaseBill(req.body);
    res.status(201).json(newBill);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.post('/bills/:id/post', requireAuth, requirePermission('purchasing:bill:post'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const posted = req.tenantRepo!.postPurchaseBill(req.params.id);
    res.json(posted);
  } catch (err) {
    next(err);
  }
});

// =============================================================
// 7. VENDOR DEBIT NOTES (إشعارات مدينة / مرتجع مشتريات)
// =============================================================

purchasingRouter.get('/debit-notes', requireAuth, requirePermission('purchasing:bill:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      search: req.query.search as string,
      supplierId: req.query.supplierId as string,
    };
    const notes = req.tenantRepo!.getVendorDebitNotes(filters);
    res.json(notes);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.get('/debit-notes/:id', requireAuth, requirePermission('purchasing:bill:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const note = req.tenantRepo!.getVendorDebitNoteById(req.params.id);
    if (!note) {
      return res.status(404).json({ error: 'Debit note not found' });
    }
    res.json(note);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.post('/debit-notes', requireAuth, requirePermission('purchasing:bill:create'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const newNote = req.tenantRepo!.createVendorDebitNote(req.body);
    res.status(201).json(newNote);
  } catch (err) {
    next(err);
  }
});

// =============================================================
// 8. SUPPLIER PAYMENTS & REALLOCATIONS (سندات الصرف)
// =============================================================

purchasingRouter.get('/payments', requireAuth, requirePermission('purchasing:payment:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      search: req.query.search as string,
      supplierId: req.query.supplierId as string,
    };
    const payments = req.tenantRepo!.getSupplierPayments(filters);
    res.json(payments);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.get('/payments/:id', requireAuth, requirePermission('purchasing:payment:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const payment = req.tenantRepo!.getSupplierPaymentById(req.params.id);
    if (!payment) {
      return res.status(404).json({ error: 'Supplier payment not found' });
    }
    res.json(payment);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.post('/payments', requireAuth, requirePermission('purchasing:payment:create'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const payment = req.tenantRepo!.createSupplierPayment(req.body);
    res.status(201).json(payment);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.post('/payments/:id/reallocate', requireAuth, requirePermission('purchasing:payment:create'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { newAllocations } = req.body;
    const payment = req.tenantRepo!.reallocateSupplierPayment(req.params.id, newAllocations || []);
    res.json(payment);
  } catch (err) {
    next(err);
  }
});

// =============================================================
// 9. SUPPLIER STATEMENTS & AGING (كشوفات الحساب وأعمار الديون)
// =============================================================

purchasingRouter.get('/aging', requireAuth, requirePermission('purchasing:supplier:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const aging = req.tenantRepo!.getSupplierAging();
    res.json(aging);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.get('/suppliers/:id/statement', requireAuth, requirePermission('purchasing:supplier:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const statement = req.tenantRepo!.getSupplierStatement(
      req.params.id,
      dateFrom as string,
      dateTo as string
    );
    res.json(statement);
  } catch (err) {
    next(err);
  }
});

// =============================================================
// 10. PRICE HISTORY & LAST PURCHASE PRICE (سجل الأسعار)
// =============================================================

purchasingRouter.get('/price-history', requireAuth, requirePermission('purchasing:order:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { supplierId, itemId } = req.query;
    const history = req.tenantRepo!.getSupplierPriceHistory({
      supplierId: supplierId as string,
      itemId: itemId as string,
    });
    res.json(history);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.get('/price-history/last', requireAuth, requirePermission('purchasing:order:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { supplierId, itemId, uomId } = req.query;
    if (!itemId) {
      return res.status(400).json({ error: 'itemId is required' });
    }
    const lastPrice = req.tenantRepo!.getLastPurchasePrice({
      supplierId: supplierId as string,
      itemId: itemId as string,
      uomId: uomId as string,
    });
    res.json(lastPrice);
  } catch (err) {
    next(err);
  }
});

// =============================================================
// 11. SUPPLIER MASTER (دليل الموردين والربط مع الحسابات)
// =============================================================

purchasingRouter.get('/suppliers', requireAuth, requirePermission('purchasing:supplier:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      search: req.query.search as string,
      status: req.query.status as string,
      type: req.query.type as string,
      group: req.query.group as string,
      supplierType: req.query.supplierType as string,
    };
    const result = req.tenantRepo!.getSuppliers(filters);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.get('/suppliers/export', requireAuth, requirePermission('purchasing:supplier:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { csv, filename } = req.tenantRepo!.exportParties('SUPPLIER');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.get('/suppliers/:id', requireAuth, requirePermission('purchasing:supplier:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const supplier = req.tenantRepo!.getSupplierById(req.params.id);
    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    res.json(supplier);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.post('/suppliers', requireAuth, requirePermission('purchasing:supplier:manage'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const newSupplier = req.tenantRepo!.createSupplier(req.body);
    res.status(201).json(newSupplier);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.put('/suppliers/:id', requireAuth, requirePermission('purchasing:supplier:manage'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = req.tenantRepo!.updateSupplier(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.patch('/suppliers/:id/status', requireAuth, requirePermission('purchasing:supplier:manage'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, reason } = req.body;
    const updated = req.tenantRepo!.setSupplierStatus(req.params.id, status, reason);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.post('/suppliers/:id/check-purchase', requireAuth, requirePermission('purchasing:supplier:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { overrideReason } = req.body;
    const check = req.tenantRepo!.checkSupplierCanPurchase(req.params.id, overrideReason);
    res.json(check);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.post('/suppliers/import', requireAuth, requirePermission('purchasing:supplier:manage'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mode, rows } = req.body;
    const report = req.tenantRepo!.executePartyImport({
      entity: 'SUPPLIER',
      mode: mode || 'CREATE_OR_UPDATE',
      rows: rows || [],
    });
    res.json(report);
  } catch (err) {
    next(err);
  }
});

purchasingRouter.post('/suppliers/rollback-import', requireAuth, requirePermission('settings:company:manage'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { batchId } = req.body;
    const result = req.tenantRepo!.rollbackPartyImport(batchId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

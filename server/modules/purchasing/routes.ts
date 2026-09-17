import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requirePermission } from '../../core/authMiddleware.js';

export const purchasingRouter = Router();

purchasingRouter.get('/status', (req: Request, res: Response) => {
  res.json({
    module: 'purchasing',
    version: '2.0.0',
    phase: 'PHASE-03',
    landedCostAllocation: ['BY_VALUE', 'BY_QUANTITY'],
    threeWayMatching: true,
    supplierSubaccountControl: '20101',
  });
});

// 1. List suppliers with search and filters
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

// 2. Export suppliers as CSV with UTF-8 BOM
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

// 3. Get supplier by ID (with ledger statement and balance)
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

// 4. Create supplier (auto-creates GL subaccount under 20101)
purchasingRouter.post('/suppliers', requireAuth, requirePermission('purchasing:supplier:manage'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const newSupplier = req.tenantRepo!.createSupplier(req.body);
    res.status(201).json(newSupplier);
  } catch (err) {
    next(err);
  }
});

// 5. Update supplier
purchasingRouter.put('/suppliers/:id', requireAuth, requirePermission('purchasing:supplier:manage'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = req.tenantRepo!.updateSupplier(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// 6. Update supplier status
purchasingRouter.patch('/suppliers/:id/status', requireAuth, requirePermission('purchasing:supplier:manage'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, reason } = req.body;
    const updated = req.tenantRepo!.setSupplierStatus(req.params.id, status, reason);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// 7. Check if purchase is allowed (Blocks SUSPENDED supplier unless authorized override provided)
purchasingRouter.post('/suppliers/:id/check-purchase', requireAuth, requirePermission('purchasing:supplier:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { overrideReason } = req.body;
    const check = req.tenantRepo!.checkSupplierCanPurchase(req.params.id, overrideReason);
    res.json(check);
  } catch (err) {
    next(err);
  }
});

// 8. Bulk Import Suppliers
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

// 9. Rollback Batch Import
purchasingRouter.post('/suppliers/rollback-import', requireAuth, requirePermission('settings:company:manage'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { batchId } = req.body;
    const result = req.tenantRepo!.rollbackPartyImport(batchId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});


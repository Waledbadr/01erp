import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requirePermission } from '../../core/authMiddleware.js';

export const salesRouter = Router();

salesRouter.get('/status', (req: Request, res: Response) => {
  res.json({
    module: 'sales',
    version: '2.0.0',
    phase: 'PHASE-03',
    supportedInvoices: ['388_STANDARD', '383_SIMPLIFIED'],
    zatcaCompliance: 'PHASE_2_READY',
    vatRate: 15,
    customerSubaccountControl: '10201',
  });
});

// 1. List customers with search, filters, and ledger-derived balances
salesRouter.get('/customers', requireAuth, requirePermission('sales:customer:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      search: req.query.search as string,
      status: req.query.status as string,
      type: req.query.type as string,
      group: req.query.group as string,
      salesRep: req.query.salesRep as string,
    };
    const result = req.tenantRepo!.getCustomers(filters);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 2. Export customers as CSV with UTF-8 BOM
salesRouter.get('/customers/export', requireAuth, requirePermission('sales:customer:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { csv, filename } = req.tenantRepo!.exportParties('CUSTOMER');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

// 3. Get customer by ID (with ledger statement and balance)
salesRouter.get('/customers/:id', requireAuth, requirePermission('sales:customer:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const customer = req.tenantRepo!.getCustomerById(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json(customer);
  } catch (err) {
    next(err);
  }
});

// 4. Create customer (auto-creates GL subaccount under 10201)
salesRouter.post('/customers', requireAuth, requirePermission('sales:customer:manage'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const newCustomer = req.tenantRepo!.createCustomer(req.body);
    res.status(201).json(newCustomer);
  } catch (err) {
    next(err);
  }
});

// 5. Update customer
salesRouter.put('/customers/:id', requireAuth, requirePermission('sales:customer:manage'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = req.tenantRepo!.updateCustomer(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// 6. Update customer status
salesRouter.patch('/customers/:id/status', requireAuth, requirePermission('sales:customer:manage'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, reason } = req.body;
    const updated = req.tenantRepo!.setCustomerStatus(req.params.id, status, reason);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// 7. Credit Check Evaluation
salesRouter.post('/customers/:id/credit-check', requireAuth, requirePermission('sales:customer:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const proposedAmountSar = Number(req.body.proposedAmountSar || 0);
    const evaluation = req.tenantRepo!.evaluateCustomerCredit(req.params.id, proposedAmountSar);
    res.json(evaluation);
  } catch (err) {
    next(err);
  }
});

// 8. Bulk Import Customers
salesRouter.post('/customers/import', requireAuth, requirePermission('sales:customer:manage'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mode, rows } = req.body;
    const report = req.tenantRepo!.executePartyImport({
      entity: 'CUSTOMER',
      mode: mode || 'CREATE_OR_UPDATE',
      rows: rows || [],
    });
    res.json(report);
  } catch (err) {
    next(err);
  }
});

// 9. Rollback Batch Import
salesRouter.post('/customers/rollback-import', requireAuth, requirePermission('settings:company:manage'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { batchId } = req.body;
    const result = req.tenantRepo!.rollbackPartyImport(batchId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 10. SALES INVOICES (STANDARD B2B & SIMPLIFIED B2C)
// ==========================================

// List Invoices with search and filters
salesRouter.get('/invoices', requireAuth, requirePermission('sales:invoice:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      search: req.query.search as string,
      type: req.query.type as string,
      status: req.query.status as string,
      customerId: req.query.customerId as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
    };
    const invoices = req.tenantRepo!.getSalesInvoices(filters);
    res.json(invoices);
  } catch (err) {
    next(err);
  }
});

// Get Invoice by ID
salesRouter.get('/invoices/:id', requireAuth, requirePermission('sales:invoice:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoice = req.tenantRepo!.getSalesInvoiceById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    res.json(invoice);
  } catch (err) {
    next(err);
  }
});

// Create Invoice (Draft or Post immediately)
salesRouter.post('/invoices', requireAuth, requirePermission('sales:invoice:create'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const newInvoice = await req.tenantRepo!.createSalesInvoice(req.body);
    res.status(201).json(newInvoice);
  } catch (err) {
    next(err);
  }
});

// Post Invoice to GL & Deduct Inventory Stock
salesRouter.post('/invoices/:id/post', requireAuth, requirePermission('sales:invoice:post'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const posted = await req.tenantRepo!.postSalesInvoice(req.params.id);
    res.json(posted);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 11. SALES QUOTATIONS (عروض الأسعار)
// ==========================================

salesRouter.get('/quotations', requireAuth, requirePermission('sales:invoice:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      search: req.query.search as string,
      status: req.query.status as string,
    };
    const quotations = req.tenantRepo!.getSalesQuotations(filters);
    res.json(quotations);
  } catch (err) {
    next(err);
  }
});

salesRouter.post('/quotations', requireAuth, requirePermission('sales:invoice:create'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const quotation = req.tenantRepo!.createSalesQuotation(req.body);
    res.status(201).json(quotation);
  } catch (err) {
    next(err);
  }
});

salesRouter.post('/quotations/:id/convert', requireAuth, requirePermission('sales:invoice:create'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoice = await req.tenantRepo!.convertQuotationToInvoice(req.params.id);
    res.status(201).json(invoice);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 12. CREDIT NOTES (إشعارات دائنة)
// ==========================================

salesRouter.get('/credit-notes', requireAuth, requirePermission('sales:invoice:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      search: req.query.search as string,
      originalInvoiceId: req.query.originalInvoiceId as string,
    };
    const notes = req.tenantRepo!.getSalesCreditNotes(filters);
    res.json(notes);
  } catch (err) {
    next(err);
  }
});

salesRouter.post('/credit-notes', requireAuth, requirePermission('sales:invoice:create'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const creditNote = await req.tenantRepo!.createSalesCreditNote(req.body);
    res.status(201).json(creditNote);
  } catch (err) {
    next(err);
  }
});



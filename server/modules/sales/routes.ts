import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requirePermission } from '../../core/authMiddleware.js';

export const salesRouter = Router();

salesRouter.get('/status', (req: Request, res: Response) => {
  res.json({
    module: 'sales',
    version: '4.0.0',
    phase: 'PHASE-04',
    supportedInvoices: ['388_STANDARD_B2B', '383_SIMPLIFIED_B2C'],
    lifecycleFeatures: [
      'QUOTATIONS',
      'SALES_ORDERS',
      'TAX_INVOICES',
      'CREDIT_NOTES_RETURNS',
      'CUSTOMER_RECEIPTS_FIFO',
      'CUSTOMER_STATEMENTS',
      'AGING_REPORT',
      'DOCUMENT_COPYING',
      'ZATCA_PHASE_2_READY',
    ],
    zatcaCompliance: 'PHASE_2_CLEARED_OR_REPORTED',
    vatRate: 15,
    customerSubaccountControl: '10201',
  });
});

// =========================================================================
// 1. CUSTOMERS
// =========================================================================

// List customers with search, filters, and ledger-derived balances
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

// Export customers as CSV with UTF-8 BOM
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

// Get customer by ID (with ledger statement and balance)
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

// Create customer (auto-creates GL subaccount under 10201)
salesRouter.post('/customers', requireAuth, requirePermission('sales:customer:manage'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const newCustomer = req.tenantRepo!.createCustomer(req.body);
    res.status(201).json(newCustomer);
  } catch (err) {
    next(err);
  }
});

// Update customer
salesRouter.put('/customers/:id', requireAuth, requirePermission('sales:customer:manage'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = req.tenantRepo!.updateCustomer(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Update customer status
salesRouter.patch('/customers/:id/status', requireAuth, requirePermission('sales:customer:manage'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, reason } = req.body;
    const updated = req.tenantRepo!.setCustomerStatus(req.params.id, status, reason);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Credit Check Evaluation
salesRouter.post('/customers/:id/credit-check', requireAuth, requirePermission('sales:customer:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const proposedAmountSar = Number(req.body.proposedAmountSar || 0);
    const evaluation = req.tenantRepo!.evaluateCustomerCredit(req.params.id, proposedAmountSar);
    res.json(evaluation);
  } catch (err) {
    next(err);
  }
});

// Customer Statement (Rule G4)
salesRouter.get('/customers/:id/statement', requireAuth, requirePermission('sales:customer:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const statement = req.tenantRepo!.getCustomerStatement(req.params.id, startDate, endDate);
    res.json(statement);
  } catch (err) {
    next(err);
  }
});

// Bulk Import Customers
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

// Rollback Batch Import
salesRouter.post('/customers/rollback-import', requireAuth, requirePermission('settings:company:manage'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { batchId } = req.body;
    const result = req.tenantRepo!.rollbackPartyImport(batchId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 2. SALES INVOICES (STANDARD B2B & SIMPLIFIED B2C)
// =========================================================================

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
      salesRep: req.query.salesRep as string,
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

// Update Invoice Status (e.g., SUBMITTED, APPROVED)
salesRouter.patch('/invoices/:id/status', requireAuth, requirePermission('sales:invoice:create'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body;
    const updated = req.tenantRepo!.updateSalesInvoiceStatus(req.params.id, status);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Cancel Draft Invoice
salesRouter.post('/invoices/:id/cancel', requireAuth, requirePermission('sales:invoice:create'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = req.body;
    const cancelled = req.tenantRepo!.cancelSalesInvoice(req.params.id, reason);
    res.json(cancelled);
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 3. SALES ORDERS (أوامر البيع)
// =========================================================================

salesRouter.get('/orders', requireAuth, requirePermission('sales:invoice:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      search: req.query.search as string,
      status: req.query.status as string,
      customerId: req.query.customerId as string,
    };
    const orders = req.tenantRepo!.getSalesOrders(filters);
    res.json(orders);
  } catch (err) {
    next(err);
  }
});

salesRouter.get('/orders/:id', requireAuth, requirePermission('sales:invoice:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = req.tenantRepo!.getSalesOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Sales Order not found' });
    }
    res.json(order);
  } catch (err) {
    next(err);
  }
});

salesRouter.post('/orders', requireAuth, requirePermission('sales:invoice:create'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = req.tenantRepo!.createSalesOrder(req.body);
    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
});

salesRouter.patch('/orders/:id/status', requireAuth, requirePermission('sales:invoice:create'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body;
    const updated = req.tenantRepo!.updateSalesOrderStatus(req.params.id, status);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

salesRouter.post('/orders/:id/convert-to-invoice', requireAuth, requirePermission('sales:invoice:create'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoice = await req.tenantRepo!.convertSalesOrderToInvoice(req.params.id);
    res.status(201).json(invoice);
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 4. SALES QUOTATIONS (عروض الأسعار)
// =========================================================================

salesRouter.get('/quotations', requireAuth, requirePermission('sales:invoice:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      search: req.query.search as string,
      status: req.query.status as string,
      customerId: req.query.customerId as string,
    };
    const quotations = req.tenantRepo!.getSalesQuotations(filters);
    res.json(quotations);
  } catch (err) {
    next(err);
  }
});

salesRouter.get('/quotations/:id', requireAuth, requirePermission('sales:invoice:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const quotation = req.tenantRepo!.getSalesQuotationById(req.params.id);
    if (!quotation) {
      return res.status(404).json({ error: 'Quotation not found' });
    }
    res.json(quotation);
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

salesRouter.patch('/quotations/:id/status', requireAuth, requirePermission('sales:invoice:create'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body;
    const updated = req.tenantRepo!.updateSalesQuotationStatus(req.params.id, status);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

salesRouter.post('/quotations/:id/convert-to-order', requireAuth, requirePermission('sales:invoice:create'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = req.tenantRepo!.convertQuotationToOrder(req.params.id);
    res.status(201).json(order);
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

// =========================================================================
// 4.1. CUSTOMER PRICE AGREEMENTS & CONTRACTED UNIT PRICING
// =========================================================================

salesRouter.get('/price-agreements', requireAuth, requirePermission('sales:invoice:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerId = req.query.customerId as string;
    const agreements = req.tenantRepo!.getCustomerPriceAgreements(customerId);
    res.json(agreements);
  } catch (err) {
    next(err);
  }
});

salesRouter.get('/price-agreements/:id', requireAuth, requirePermission('sales:invoice:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const agreement = req.tenantRepo!.getCustomerPriceAgreementById(req.params.id);
    if (!agreement) return res.status(404).json({ error: 'Price agreement not found' });
    res.json(agreement);
  } catch (err) {
    next(err);
  }
});

salesRouter.post('/price-agreements', requireAuth, requirePermission('sales:invoice:create'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const created = req.tenantRepo!.createCustomerPriceAgreement(req.body);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

salesRouter.put('/price-agreements/:id', requireAuth, requirePermission('sales:invoice:create'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = req.tenantRepo!.updateCustomerPriceAgreement(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

salesRouter.delete('/price-agreements/:id', requireAuth, requirePermission('sales:invoice:create'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const deleted = req.tenantRepo!.deleteCustomerPriceAgreement(req.params.id);
    res.json({ success: deleted });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 5. CREDIT NOTES & RETURNS (إشعارات دائنة ومردودات مبيعات)
// =========================================================================

salesRouter.get('/credit-notes', requireAuth, requirePermission('sales:invoice:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      search: req.query.search as string,
      originalInvoiceId: req.query.originalInvoiceId as string,
      customerId: req.query.customerId as string,
    };
    const notes = req.tenantRepo!.getSalesCreditNotes(filters);
    res.json(notes);
  } catch (err) {
    next(err);
  }
});

salesRouter.get('/credit-notes/:id', requireAuth, requirePermission('sales:invoice:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const note = req.tenantRepo!.getSalesCreditNoteById(req.params.id);
    if (!note) {
      return res.status(404).json({ error: 'Credit note not found' });
    }
    res.json(note);
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

// =========================================================================
// 6. CUSTOMER RECEIPTS & ALLOCATIONS (سندات القبض ومطابقة الدفعات - Rule G5)
// =========================================================================

salesRouter.get('/receipts', requireAuth, requirePermission('sales:invoice:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      search: req.query.search as string,
      customerId: req.query.customerId as string,
    };
    const receipts = req.tenantRepo!.getCustomerReceipts(filters);
    res.json(receipts);
  } catch (err) {
    next(err);
  }
});

salesRouter.get('/receipts/:id', requireAuth, requirePermission('sales:invoice:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const receipt = req.tenantRepo!.getCustomerReceiptById(req.params.id);
    if (!receipt) {
      return res.status(404).json({ error: 'Customer receipt not found' });
    }
    res.json(receipt);
  } catch (err) {
    next(err);
  }
});

salesRouter.post('/receipts', requireAuth, requirePermission('sales:invoice:create'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const receipt = await req.tenantRepo!.createCustomerReceipt(req.body);
    res.status(201).json(receipt);
  } catch (err) {
    next(err);
  }
});

salesRouter.post('/receipts/:id/reallocate', requireAuth, requirePermission('sales:invoice:create'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { newAllocations } = req.body;
    const reallocated = req.tenantRepo!.reallocateCustomerReceipt(req.params.id, newAllocations || []);
    res.json(reallocated);
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 7. AGING REPORTS & DOCUMENT DUPLICATION
// =========================================================================

salesRouter.get('/aging', requireAuth, requirePermission('sales:customer:view'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const report = req.tenantRepo!.getCustomerAging();
    res.json(report);
  } catch (err) {
    next(err);
  }
});

salesRouter.post('/copy-document', requireAuth, requirePermission('sales:invoice:create'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sourceType, sourceId } = req.body;
    const copied = await req.tenantRepo!.copySalesDocument({ sourceType, sourceId });
    res.status(201).json(copied);
  } catch (err) {
    next(err);
  }
});

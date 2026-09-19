/**
 * Automation Engine Express API Routes — Saudi ERP Platform
 * REST endpoints for managing rules, visual builder conditions, dry-run simulations, triggers, and audits.
 */

import { Router, Request, Response } from 'express';
import { AutomationService } from './automationService.js';
import { TriggerType } from './types.js';

export const automationRouter = Router();

// Sample testing payloads for every trigger type
const SAMPLE_PAYLOADS: Record<TriggerType, Record<string, any>> = {
  low_stock_detected: {
    itemId: 'item-101',
    itemCode: 'ITM-BRG-001',
    itemNameAr: 'برغي مجلفن 10 ملم',
    itemNameEn: 'Galvanized Bolt 10mm',
    stockQuantity: 4,
    reorderLevel: 15,
    reorderQuantity: 100,
    unit: 'BOX',
    isCritical: true,
    warehouseId: 'WH-RYD-01',
    warehouseName: 'مستودع الرياض الرئيسي',
  },
  document_posted: {
    documentId: 'inv-8821',
    documentType: 'SALES_INVOICE',
    invoiceNumber: 'INV-2026-00452',
    customerId: 'cust-501',
    customerName: 'شركة البناء المتقدم للمقاولات',
    totalAmountSar: 18500,
    totalVatSar: 2413.04,
    paymentMethod: 'CREDIT',
    branchId: 'BR-RYD',
    costCenterId: 'CC-COMM',
  },
  invoice_overdue: {
    invoiceId: 'inv-7120',
    invoiceNumber: 'INV-2026-00210',
    customerId: 'cust-302',
    customerName: 'مؤسسة الرياض للتجارة العامة',
    customerEmail: 'finance@riyadh-trading.sa',
    totalAmountSar: 6400,
    balanceDueSar: 6400,
    daysOverdue: 21,
    issueDate: '2026-08-10',
    dueDate: '2026-08-25',
  },
  zatca_failure: {
    invoiceId: 'inv-9901',
    invoiceNumber: 'INV-2026-00991',
    zatcaStatus: 'REJECTED',
    errorCode: 'BR-KSA-15-VAT-MISMATCH',
    errorMessage: 'Line tax calculation mismatch in XML UBL 2.1 syntax',
    timestamp: new Date().toISOString(),
    retryCount: 1,
  },
  credit_limit_breached: {
    customerId: 'cust-404',
    customerName: 'شركة الأفق الحديث المحدودة',
    creditLimitSar: 50000,
    currentBalanceSar: 58200,
    creditDeficitSar: 8200,
    daysSinceLastPayment: 45,
  },
  document_created: {
    documentId: 'doc-101',
    documentType: 'QUOTATION',
    documentNumber: 'QUO-2026-0012',
    totalAmountSar: 12500,
    createdBy: 'Sales Rep 1',
  },
  document_submitted: {
    documentId: 'po-301',
    documentType: 'PURCHASE_ORDER',
    documentNumber: 'PO-2026-0088',
    supplierName: 'مصنع الحديد السعودي',
    totalAmountSar: 35000,
  },
  document_approved: {
    documentId: 'exp-55',
    documentType: 'EXPENSE_VOUCHER',
    documentNumber: 'EXP-2026-0033',
    totalAmountSar: 3200,
    approvedBy: 'Financial Controller',
  },
  payment_received: {
    paymentId: 'rcpt-901',
    receiptNumber: 'RCP-2026-0071',
    customerName: 'شركة البناء المتقدم للمقاولات',
    amountSar: 18500,
    paymentMethod: 'BANK_TRANSFER',
    bankAccount: 'Al Rajhi SAR',
  },
  backup_failure: {
    backupId: 'bkp-err-01',
    backupType: 'DAILY_FULL',
    errorMessage: 'Cloud Storage authorization token expired',
    timestamp: new Date().toISOString(),
  },
  subscription_event: {
    subscriptionId: 'sub-org-01',
    eventType: 'RENEWAL_DUE',
    planName: 'Enterprise Cloud ERP',
    daysRemaining: 7,
  },
};

/**
 * GET /api/v1/automation/rules
 */
automationRouter.get('/rules', (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId || 'tenant-default';
  const rules = AutomationService.getRules(tenantId);
  res.json({ status: 'ok', data: rules, count: rules.length });
});

/**
 * GET /api/v1/automation/rules/:id
 */
automationRouter.get('/rules/:id', (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId || 'tenant-default';
  const rule = AutomationService.getRuleById(tenantId, req.params.id);
  if (!rule) {
    return res.status(404).json({ status: 'error', message: 'Rule not found' });
  }
  res.json({ status: 'ok', data: rule });
});

/**
 * POST /api/v1/automation/rules
 */
automationRouter.post('/rules', (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId || 'tenant-default';
  try {
    const saved = AutomationService.saveRule(tenantId, req.body);
    res.status(201).json({ status: 'ok', data: saved });
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err?.message });
  }
});

/**
 * PUT /api/v1/automation/rules/:id
 */
automationRouter.put('/rules/:id', (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId || 'tenant-default';
  try {
    const saved = AutomationService.saveRule(tenantId, { ...req.body, id: req.params.id });
    res.json({ status: 'ok', data: saved });
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err?.message });
  }
});

/**
 * PATCH /api/v1/automation/rules/:id/toggle
 */
automationRouter.patch('/rules/:id/toggle', (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId || 'tenant-default';
  try {
    const rule = AutomationService.toggleRule(tenantId, req.params.id);
    res.json({ status: 'ok', data: rule });
  } catch (err: any) {
    res.status(404).json({ status: 'error', message: err?.message });
  }
});

/**
 * DELETE /api/v1/automation/rules/:id
 */
automationRouter.delete('/rules/:id', (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId || 'tenant-default';
  const deleted = AutomationService.deleteRule(tenantId, req.params.id);
  if (!deleted) {
    return res.status(404).json({ status: 'error', message: 'Rule not found' });
  }
  res.json({ status: 'ok', message: 'Rule deleted successfully' });
});

/**
 * POST /api/v1/automation/rules/dry-run
 */
automationRouter.post('/rules/dry-run', (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId || 'tenant-default';
  const { rule, ruleId, samplePayload } = req.body;

  let ruleToTest = rule;
  if (!ruleToTest && ruleId) {
    ruleToTest = AutomationService.getRuleById(tenantId, ruleId);
  }

  if (!ruleToTest) {
    return res.status(400).json({ status: 'error', message: 'Rule definition or ruleId required for dry-run' });
  }

  const payload = samplePayload || SAMPLE_PAYLOADS[ruleToTest.trigger as TriggerType] || {};
  const result = AutomationService.dryRun(ruleToTest, payload);
  res.json({ status: 'ok', data: result });
});

/**
 * POST /api/v1/automation/trigger
 */
automationRouter.post('/trigger', async (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId || 'tenant-default';
  const { trigger, payload } = req.body;

  if (!trigger) {
    return res.status(400).json({ status: 'error', message: 'Trigger type is required' });
  }

  try {
    const logs = await AutomationService.executeTrigger(tenantId, trigger as TriggerType, payload || {});
    res.json({ status: 'ok', data: logs, executedRulesCount: logs.length });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message });
  }
});

/**
 * GET /api/v1/automation/history
 */
automationRouter.get('/history', (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId || 'tenant-default';
  const { ruleId, status, trigger } = req.query;

  const history = AutomationService.getHistory(tenantId, {
    ruleId: ruleId as string,
    status: status as string,
    trigger: trigger as string,
  });

  res.json({ status: 'ok', data: history, count: history.length });
});

/**
 * POST /api/v1/automation/history/:runId/retry
 */
automationRouter.post('/history/:runId/retry', async (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId || 'tenant-default';
  const { actionId } = req.body;

  if (!actionId) {
    return res.status(400).json({ status: 'error', message: 'actionId is required for retry' });
  }

  try {
    const result = await AutomationService.retryAction(tenantId, req.params.runId, actionId);
    res.json({ status: 'ok', data: result });
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err?.message });
  }
});

/**
 * GET /api/v1/automation/tasks
 */
automationRouter.get('/tasks', (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId || 'tenant-default';
  const tasks = AutomationService.getAutomationTasks(tenantId);
  res.json({ status: 'ok', data: tasks });
});

/**
 * GET /api/v1/automation/drafts
 */
automationRouter.get('/drafts', (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId || 'tenant-default';
  const drafts = AutomationService.getAutomationDrafts(tenantId);
  res.json({ status: 'ok', data: drafts });
});

/**
 * GET /api/v1/automation/webhooks
 */
automationRouter.get('/webhooks', (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId || 'tenant-default';
  const webhooks = AutomationService.getWebhookLogs(tenantId);
  res.json({ status: 'ok', data: webhooks });
});

/**
 * GET /api/v1/automation/sample-payloads
 */
automationRouter.get('/sample-payloads', (req: Request, res: Response) => {
  res.json({ status: 'ok', data: SAMPLE_PAYLOADS });
});

import { Router, Request, Response } from 'express';
import { centralStore, TenantScopedRepository } from '../../core/tenantGuard.js';
import { requireAuth } from '../../core/authMiddleware.js';
import {
  getTreasuryAccountsService,
  getTreasuryAccountByIdService,
  createTreasuryAccountService,
  updateTreasuryAccountService,
  setTreasuryAccountStatusService,
  getTreasuryReceiptsService,
  getTreasuryReceiptByIdService,
  createTreasuryReceiptService,
  getTreasuryPaymentsService,
  getTreasuryPaymentByIdService,
  createTreasuryPaymentService,
  getTreasuryTransfersService,
  getTreasuryTransferByIdService,
  createTreasuryTransferService,
  getPettyCashSettlementsService,
  getPettyCashSettlementByIdService,
  createPettyCashSettlementService,
  getBankStatementsService,
  uploadBankStatementService,
  getBankReconciliationsService,
  createBankReconciliationService,
  getChequesService,
  clearChequeService,
  bounceChequeService,
  getTreasuryOverviewMetricsService,
} from './treasuryService.js';

export const treasuryRouter = Router();

// 0. Module Status & Health
treasuryRouter.get('/status', (req: Request, res: Response) => {
  res.json({
    module: 'treasury',
    version: '2.0.0',
    supportedAccounts: ['CASH_DRAWER', 'BANK_ACCOUNT', 'PETTY_CASH', 'POS_TERMINAL'],
    reconciliationEngine: 'STATEMENT_MATCHING',
    readyForPhase08: true,
  });
});

// Middleware for authentication
treasuryRouter.use(requireAuth);

// Helper to extract repo and context
function getRepo(req: Request) {
  const context = (req as any).tenantContext;
  return {
    repo: new TenantScopedRepository(context),
    context,
    tenantId: context.tenantId,
  };
}

// ============================================================================
// 1. OVERVIEW KPI METRICS
// ============================================================================
treasuryRouter.get('/overview', (req: Request, res: Response) => {
  try {
    const { tenantId } = getRepo(req);
    const metrics = getTreasuryOverviewMetricsService(centralStore, tenantId);
    res.json({ success: true, data: metrics });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 2. TREASURY ACCOUNTS & VAULTS
// ============================================================================
treasuryRouter.get('/accounts', (req: Request, res: Response) => {
  try {
    const { tenantId } = getRepo(req);
    const { type, status, search } = req.query as { type?: string; status?: string; search?: string };
    const accounts = getTreasuryAccountsService(centralStore, tenantId, { type, status, search });
    res.json({ success: true, data: accounts });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

treasuryRouter.get('/accounts/:id', (req: Request, res: Response) => {
  try {
    const { tenantId } = getRepo(req);
    const account = getTreasuryAccountByIdService(centralStore, tenantId, req.params.id);
    res.json({ success: true, data: account });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

treasuryRouter.post('/accounts', (req: Request, res: Response) => {
  try {
    const { context } = getRepo(req);
    const account = createTreasuryAccountService(centralStore, context, req.body);
    res.status(201).json({ success: true, data: account });
  } catch (err: any) {
    res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
});

treasuryRouter.put('/accounts/:id', (req: Request, res: Response) => {
  try {
    const { context } = getRepo(req);
    const account = updateTreasuryAccountService(centralStore, context, req.params.id, req.body);
    res.json({ success: true, data: account });
  } catch (err: any) {
    res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
});

treasuryRouter.patch('/accounts/:id/status', (req: Request, res: Response) => {
  try {
    const { context } = getRepo(req);
    const { status } = req.body;
    const account = setTreasuryAccountStatusService(centralStore, context, req.params.id, status);
    res.json({ success: true, data: account });
  } catch (err: any) {
    res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 3. RECEIPT VOUCHERS (سندات القبض)
// ============================================================================
treasuryRouter.get('/receipts', (req: Request, res: Response) => {
  try {
    const { tenantId } = getRepo(req);
    const { category, status, customerId, search } = req.query as any;
    const receipts = getTreasuryReceiptsService(centralStore, tenantId, { category, status, customerId, search });
    res.json({ success: true, data: receipts });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

treasuryRouter.get('/receipts/:id', (req: Request, res: Response) => {
  try {
    const { tenantId } = getRepo(req);
    const receipt = getTreasuryReceiptByIdService(centralStore, tenantId, req.params.id);
    res.json({ success: true, data: receipt });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

treasuryRouter.post('/receipts', (req: Request, res: Response) => {
  try {
    const { context } = getRepo(req);
    const receipt = createTreasuryReceiptService(centralStore, context, req.body);
    res.status(201).json({ success: true, data: receipt });
  } catch (err: any) {
    res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 4. PAYMENT VOUCHERS (سندات الصرف)
// ============================================================================
treasuryRouter.get('/payments', (req: Request, res: Response) => {
  try {
    const { tenantId } = getRepo(req);
    const { category, status, supplierId, search } = req.query as any;
    const payments = getTreasuryPaymentsService(centralStore, tenantId, { category, status, supplierId, search });
    res.json({ success: true, data: payments });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

treasuryRouter.get('/payments/:id', (req: Request, res: Response) => {
  try {
    const { tenantId } = getRepo(req);
    const payment = getTreasuryPaymentByIdService(centralStore, tenantId, req.params.id);
    res.json({ success: true, data: payment });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

treasuryRouter.post('/payments', (req: Request, res: Response) => {
  try {
    const { context } = getRepo(req);
    const payment = createTreasuryPaymentService(centralStore, context, req.body);
    res.status(201).json({ success: true, data: payment });
  } catch (err: any) {
    res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 5. INTER-ACCOUNT TRANSFERS (التحويل بين الخزائن)
// ============================================================================
treasuryRouter.get('/transfers', (req: Request, res: Response) => {
  try {
    const { tenantId } = getRepo(req);
    const transfers = getTreasuryTransfersService(centralStore, tenantId);
    res.json({ success: true, data: transfers });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

treasuryRouter.get('/transfers/:id', (req: Request, res: Response) => {
  try {
    const { tenantId } = getRepo(req);
    const transfer = getTreasuryTransferByIdService(centralStore, tenantId, req.params.id);
    res.json({ success: true, data: transfer });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

treasuryRouter.post('/transfers', (req: Request, res: Response) => {
  try {
    const { context } = getRepo(req);
    const transfer = createTreasuryTransferService(centralStore, context, req.body);
    res.status(201).json({ success: true, data: transfer });
  } catch (err: any) {
    res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 6. PETTY CASH & CUSTODY SETTLEMENTS (تسوية العهد)
// ============================================================================
treasuryRouter.get('/petty-cash', (req: Request, res: Response) => {
  try {
    const { tenantId } = getRepo(req);
    const { custodyAccountId, status } = req.query as any;
    const settlements = getPettyCashSettlementsService(centralStore, tenantId, { custodyAccountId, status });
    res.json({ success: true, data: settlements });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

treasuryRouter.get('/petty-cash/:id', (req: Request, res: Response) => {
  try {
    const { tenantId } = getRepo(req);
    const settlement = getPettyCashSettlementByIdService(centralStore, tenantId, req.params.id);
    res.json({ success: true, data: settlement });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

treasuryRouter.post('/petty-cash', (req: Request, res: Response) => {
  try {
    const { context } = getRepo(req);
    const settlement = createPettyCashSettlementService(centralStore, context, req.body);
    res.status(201).json({ success: true, data: settlement });
  } catch (err: any) {
    res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 7. BANK RECONCILIATION & STATEMENTS
// ============================================================================
treasuryRouter.get('/bank-statements', (req: Request, res: Response) => {
  try {
    const { tenantId } = getRepo(req);
    const { treasuryAccountId } = req.query as any;
    const statements = getBankStatementsService(centralStore, tenantId, treasuryAccountId);
    res.json({ success: true, data: statements });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

treasuryRouter.post('/bank-statements', (req: Request, res: Response) => {
  try {
    const { context } = getRepo(req);
    const statement = uploadBankStatementService(centralStore, context, req.body);
    res.status(201).json({ success: true, data: statement });
  } catch (err: any) {
    res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
});

treasuryRouter.get('/bank-reconciliations', (req: Request, res: Response) => {
  try {
    const { tenantId } = getRepo(req);
    const { treasuryAccountId } = req.query as any;
    const reconciliations = getBankReconciliationsService(centralStore, tenantId, treasuryAccountId);
    res.json({ success: true, data: reconciliations });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

treasuryRouter.post('/bank-reconciliations', (req: Request, res: Response) => {
  try {
    const { context } = getRepo(req);
    const rec = createBankReconciliationService(centralStore, context, req.body);
    res.status(201).json({ success: true, data: rec });
  } catch (err: any) {
    res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 8. CHEQUES PORTFOLIO (حافظة الشيكات)
// ============================================================================
treasuryRouter.get('/cheques', (req: Request, res: Response) => {
  try {
    const { tenantId } = getRepo(req);
    const { type, status, search } = req.query as any;
    const cheques = getChequesService(centralStore, tenantId, { type, status, search });
    res.json({ success: true, data: cheques });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

treasuryRouter.post('/cheques/:id/clear', (req: Request, res: Response) => {
  try {
    const { context } = getRepo(req);
    const { depositBankAccountId } = req.body;
    const cheque = clearChequeService(centralStore, context, req.params.id, depositBankAccountId);
    res.json({ success: true, data: cheque });
  } catch (err: any) {
    res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
});

treasuryRouter.post('/cheques/:id/bounce', (req: Request, res: Response) => {
  try {
    const { context } = getRepo(req);
    const { reason } = req.body;
    const cheque = bounceChequeService(centralStore, context, req.params.id, reason || 'Unspecified bounce reason');
    res.json({ success: true, data: cheque });
  } catch (err: any) {
    res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
});

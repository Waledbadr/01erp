import { Router, Request, Response } from 'express';
import { TenantScopedRepository } from '../../core/tenantGuard.js';
import { requireAuth } from '../../core/authMiddleware.js';
import {
  getTaxRatesService,
  getTaxRateByIdService,
  createTaxRateService,
  updateTaxRateService,
  deleteTaxRateService,
  getVatSettingsService,
  updateVatSettingsService,
  determineTaxService,
  calculateDocumentTaxService,
  getVatLedgerService,
  getVatPeriodSummaryService,
  getVatReconciliationService,
  getVatDimensionBreakdownService,
} from './vatService.js';

export const vatRouter = Router();

// Module status check
vatRouter.get('/status', (req: Request, res: Response) => {
  res.json({
    module: 'vat-tax-engine',
    version: '1.0.0',
    supportedCategories: ['S', 'Z', 'E', 'O'],
    standardRates: [15, 5, 0],
    roundingRule: 'HALF_UP_LINE_CENT_EXACT',
    readyForPhase09: true,
  });
});

// Middleware for authentication
vatRouter.use(requireAuth);

function getContext(req: Request) {
  const context = (req as any).tenantContext;
  return {
    context,
    tenantId: context.tenantId,
  };
}

// ============================================================================
// 1. TAX RATES REGISTRY
// ============================================================================
vatRouter.get('/rates', (req: Request, res: Response) => {
  try {
    const { tenantId } = getContext(req);
    const rates = getTaxRatesService(tenantId);
    res.json({ success: true, data: rates });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

vatRouter.get('/rates/:id', (req: Request, res: Response) => {
  try {
    const { tenantId } = getContext(req);
    const rate = getTaxRateByIdService(tenantId, req.params.id);
    if (!rate) {
      return res.status(404).json({ error: 'Tax rate not found' });
    }
    res.json({ success: true, data: rate });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

vatRouter.post('/rates', (req: Request, res: Response) => {
  try {
    const { tenantId, context } = getContext(req);
    const newRate = createTaxRateService(tenantId, req.body, context);
    res.status(201).json({ success: true, data: newRate });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

vatRouter.put('/rates/:id', (req: Request, res: Response) => {
  try {
    const { tenantId, context } = getContext(req);
    const updated = updateTaxRateService(tenantId, req.params.id, req.body, context);
    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

vatRouter.delete('/rates/:id', (req: Request, res: Response) => {
  try {
    const { tenantId, context } = getContext(req);
    deleteTaxRateService(tenantId, req.params.id, context);
    res.json({ success: true, message: 'Tax rate deleted' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// 2. VAT SETTINGS & POLICIES
// ============================================================================
vatRouter.get('/settings', (req: Request, res: Response) => {
  try {
    const { tenantId } = getContext(req);
    const settings = getVatSettingsService(tenantId);
    res.json({ success: true, data: settings });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

vatRouter.put('/settings', (req: Request, res: Response) => {
  try {
    const { tenantId, context } = getContext(req);
    const updated = updateVatSettingsService(tenantId, req.body, context);
    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// 3. TAX DETERMINATION & CALCULATION ENGINE
// ============================================================================
vatRouter.post('/determine', (req: Request, res: Response) => {
  try {
    const { tenantId } = getContext(req);
    const result = determineTaxService(tenantId, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

vatRouter.post('/calculate', (req: Request, res: Response) => {
  try {
    const { tenantId } = getContext(req);
    const { lines, pricingPreference } = req.body;
    if (!Array.isArray(lines)) {
      return res.status(400).json({ error: 'lines must be an array' });
    }
    const result = calculateDocumentTaxService(tenantId, lines, pricingPreference);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// 4. VAT LEDGER & PERIOD RETURNS
// ============================================================================
vatRouter.get('/ledger', (req: Request, res: Response) => {
  try {
    const { tenantId } = getContext(req);
    const { startDate, endDate, vatType, taxCategoryCode, documentType } = req.query;
    const ledger = getVatLedgerService(tenantId, {
      startDate: startDate as string,
      endDate: endDate as string,
      vatType: vatType as any,
      taxCategoryCode: taxCategoryCode as string,
      documentType: documentType as string,
    });
    res.json({ success: true, count: ledger.length, data: ledger });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

vatRouter.get('/summary', (req: Request, res: Response) => {
  try {
    const { tenantId } = getContext(req);
    const { startDate, endDate } = req.query;
    const summary = getVatPeriodSummaryService(tenantId, startDate as string, endDate as string);
    res.json({ success: true, data: summary });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

vatRouter.get('/reconciliation', (req: Request, res: Response) => {
  try {
    const { tenantId } = getContext(req);
    const { asOfDate } = req.query;
    const reconciliation = getVatReconciliationService(tenantId, asOfDate as string);
    res.json({ success: true, data: reconciliation });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

vatRouter.get('/dimensions', (req: Request, res: Response) => {
  try {
    const { tenantId } = getContext(req);
    const { dimension, startDate, endDate } = req.query;
    if (!dimension) {
      return res.status(400).json({ error: 'dimension parameter is required (RATE, CATEGORY, CUSTOMER, SUPPLIER, BRANCH, INVOICE)' });
    }
    const data = getVatDimensionBreakdownService(
      tenantId,
      dimension as any,
      startDate as string,
      endDate as string
    );
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

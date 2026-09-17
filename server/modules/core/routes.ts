import { Router, Request, Response } from 'express';
import { checkDatabaseHealth } from '../../db/client.js';
import { SYSTEM_DEFAULT_TAX_RATES, SYSTEM_DEFAULT_UNITS_OF_MEASURE, SYSTEM_DEFAULT_DOCUMENT_TYPES, SAUDI_STANDARD_CHART_OF_ACCOUNTS } from '../../db/seed-system.js';

export const coreRouter = Router();

// System manifests metadata (read-only baseline)
coreRouter.get('/metadata', (req: Request, res: Response) => {
  res.json({
    platform: 'Saudi Enterprise ERP & ZATCA Phase 2 Cloud Platform',
    version: '1.0.0-phase00',
    phase: 'PHASE-00',
    status: 'ACTIVE',
    localeSupport: ['ar-SA', 'en-US'],
    defaultDirection: 'rtl',
    accountingStandard: 'Saudi SOCPA / IFRS for SMEs',
    vatStandard: 'ZATCA 15% Standard Rate',
    currency: {
      code: 'SAR',
      symbolAr: 'ر.س',
      symbolEn: 'SAR',
      decimals: 2,
    },
  });
});

// System Tax Rates
coreRouter.get('/tax-rates', (req: Request, res: Response) => {
  res.json({
    data: SYSTEM_DEFAULT_TAX_RATES,
    count: SYSTEM_DEFAULT_TAX_RATES.length,
  });
});

// System Units of Measure
coreRouter.get('/units-of-measure', (req: Request, res: Response) => {
  res.json({
    data: SYSTEM_DEFAULT_UNITS_OF_MEASURE,
    count: SYSTEM_DEFAULT_UNITS_OF_MEASURE.length,
  });
});

// System Document Types
coreRouter.get('/document-types', (req: Request, res: Response) => {
  res.json({
    data: SYSTEM_DEFAULT_DOCUMENT_TYPES,
    count: SYSTEM_DEFAULT_DOCUMENT_TYPES.length,
  });
});

// Standard Saudi Chart of Accounts
coreRouter.get('/chart-of-accounts/default', (req: Request, res: Response) => {
  res.json({
    data: SAUDI_STANDARD_CHART_OF_ACCOUNTS,
    count: SAUDI_STANDARD_CHART_OF_ACCOUNTS.length,
  });
});

import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from './core/env.js';
import { logger } from './core/logger.js';
import { authMiddleware } from './core/authMiddleware.js';
import { authRouter } from './modules/auth/routes.js';
import { companyRouter } from './modules/company/routes.js';
import { usersRouter } from './modules/users/routes.js';
import { superadminRouter } from './modules/superadmin/routes.js';
import { auditRouter } from './modules/audit/routes.js';
import { coreRouter } from './modules/core/routes.js';
import { accountingRouter } from './modules/accounting/routes.js';
import { inventoryRouter } from './modules/inventory/routes.js';
import { salesRouter } from './modules/sales/routes.js';
import { purchasingRouter } from './modules/purchasing/routes.js';
import { treasuryRouter } from './modules/treasury/routes.js';
import { zatcaRouter } from './modules/zatca/routes.js';
import { vatRouter } from './modules/vat/routes.js';
import { assetsRouter } from './modules/assets/routes.js';
import { securityRouter } from './modules/security/routes.js';
import { backupsRouter } from './modules/backup/routes.js';
import { reportsRouter } from './modules/reports/routes.js';
import { documentsRouter } from './modules/documents/routes.js';
import { notificationsRouter } from './modules/notifications/routes.js';
import { automationRouter } from './modules/automation/routes.js';
import { posRouter } from './modules/pos/routes.js';
import { ocrRouter } from './modules/ocr/routes.js';
import { assistantRouter } from './modules/assistant/routes.js';
import { integrationsRouter } from './modules/integrations/routes.js';
import { importExportRouter } from './modules/importexport/routes.js';
import { billingRouter } from './modules/billing/routes.js';
import { checkTenantNotSuspended, securityHeadersMiddleware, csrfProtectionMiddleware } from './core/authMiddleware.js';
import { generateCsrfToken } from './core/security.js';

export function createExpressApp(): express.Express {
  const app = express();

  // 1. Correlation ID & Security Headers Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const correlationId = (req.headers['x-correlation-id'] as string) || crypto.randomUUID();
    res.setHeader('x-correlation-id', correlationId);
    (req as Request & { correlationId: string }).correlationId = correlationId;
    next();
  });

  // Statutory Security Headers (CSP, HSTS, X-Content-Type-Options, frame-ancestors, etc.)
  app.use(securityHeadersMiddleware);

  // 2. Parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // 3. Central Auth & Tenant Context Middleware
  app.use(authMiddleware);

  // CSRF Protection on Mutating Operations
  app.use(csrfProtectionMiddleware);

  // 4. Public Health Check & Diagnostic Endpoints
  app.get(['/api/health/live', '/health/live'], (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get(['/api/health/ready', '/health/ready'], async (_req: Request, res: Response) => {
    try {
      const { checkDatabaseHealth } = await import('./db/client.js');
      const dbHealth = await checkDatabaseHealth();
      const isReady = dbHealth.status === 'healthy' || dbHealth.status === 'not_configured';

      res.status(isReady ? 200 : 503).json({
        status: isReady ? 'ready' : 'unhealthy',
        database: dbHealth,
        timestamp: new Date().toISOString(),
        version: '1.0.0-production',
      });
    } catch (err: unknown) {
      res.status(503).json({
        status: 'unhealthy',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // CSRF Token issuance endpoint
  app.get('/api/v1/auth/csrf-token', (req: Request, res: Response) => {
    const sessionToken = req.sessionToken || (req.headers['x-session-token'] as string) || 'public-session-token';
    const token = generateCsrfToken(sessionToken);
    res.status(200).json({
      csrfToken: token,
      message: 'CSRF token issued successfully',
    });
  });

  // 5. Tenant Suspension Check for mutating operations
  app.use('/api/*', checkTenantNotSuspended);

  // 6. Mount Domain Modules
  app.use('/api/v1/auth', authRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/v1/company', companyRouter);
  app.use('/api/company', companyRouter);
  app.use('/api/v1/users', usersRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/v1/superadmin', superadminRouter);
  app.use('/api/superadmin', superadminRouter);
  app.use('/api/v1/billing', billingRouter);
  app.use('/api/billing', billingRouter);
  app.use('/api/v1/audit', auditRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/v1/core', coreRouter);
  app.use('/api/core', coreRouter);
  app.use('/api/v1/accounting', accountingRouter);
  app.use('/api/accounting', accountingRouter);
  app.use('/api/v1/inventory', inventoryRouter);
  app.use('/api/inventory', inventoryRouter);
  app.use('/api/v1/sales', salesRouter);
  app.use('/api/sales', salesRouter);
  app.use('/api/v1/purchasing', purchasingRouter);
  app.use('/api/purchasing', purchasingRouter);
  app.use('/api/v1/parties/customers', salesRouter);
  app.use('/api/parties/customers', salesRouter);
  app.use('/api/v1/parties/suppliers', purchasingRouter);
  app.use('/api/parties/suppliers', purchasingRouter);
  app.use('/api/v1/treasury', treasuryRouter);
  app.use('/api/treasury', treasuryRouter);
  app.use('/api/v1/zatca', zatcaRouter);
  app.use('/api/zatca', zatcaRouter);
  app.use('/api/v1/vat', vatRouter);
  app.use('/api/vat', vatRouter);
  app.use('/api/v1/assets', assetsRouter);
  app.use('/api/assets', assetsRouter);
  app.use('/api/v1/security', securityRouter);
  app.use('/api/security', securityRouter);
  app.use('/api/v1/backups', backupsRouter);
  app.use('/api/backups', backupsRouter);
  app.use('/api/v1/system/backups', backupsRouter);
  app.use('/api/system/backups', backupsRouter);
  app.use('/api/v1/reports', reportsRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/v1/documents', documentsRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/v1/notifications', notificationsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/v1/automation', automationRouter);
  app.use('/api/automation', automationRouter);
  app.use('/api/v1/pos', posRouter);
  app.use('/api/pos', posRouter);
  app.use('/api/v1/ocr', ocrRouter);
  app.use('/api/ocr', ocrRouter);
  app.use('/api/v1/assistant', assistantRouter);
  app.use('/api/assistant', assistantRouter);
  app.use('/api/v1', integrationsRouter);
  app.use('/api', integrationsRouter);
  app.use('/api/v1/import-export', importExportRouter);
  app.use('/api/import-export', importExportRouter);

  // 7. API 404 Catch-All: Always return JSON for unhandled /api/* paths
  app.all('/api/*', (req: Request, res: Response) => {
    res.status(404).json({
      error: 'API_ENDPOINT_NOT_FOUND',
      message: `The endpoint ${req.method} ${req.originalUrl} was not found on this server.`,
      path: req.originalUrl,
    });
  });

  // 8. Global API Error Handler
  app.use('/api/*', (err: Error, req: Request, res: Response, _next: NextFunction) => {
    const correlationId = (req as Request & { correlationId?: string }).correlationId || 'unknown';
    logger.error('Unhandled API Exception', {
      correlationId,
      path: req.path,
      error: err.message,
      stack: env.NODE_ENV === 'development' ? err.stack : undefined,
    });

    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'An internal error occurred. Please contact the administrator.',
      correlationId,
    });
  });

  return app;
}

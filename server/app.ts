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
import { identityPersistenceMiddleware } from './db/identityPersistence.js';

export function createExpressApp(): express.Express {
  const app = express();

  // 1. URL Normalization Middleware for Vercel Serverless Function rewrites
  app.use((req: Request, res: Response, next: NextFunction) => {
    // If incoming request URL is stripped by Vercel rewrite or proxy
    const originalUrl = req.originalUrl || req.url;
    if (originalUrl && originalUrl.startsWith('/api') && !req.url.startsWith('/api')) {
      req.url = originalUrl;
    }
    next();
  });

  // 2. Correlation ID & Security Headers Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const correlationId = (req.headers['x-correlation-id'] as string) || crypto.randomUUID();
    res.setHeader('x-correlation-id', correlationId);
    (req as Request & { correlationId: string }).correlationId = correlationId;
    next();
  });

  // Statutory Security Headers (CSP, HSTS, X-Content-Type-Options, frame-ancestors, etc.)
  app.use(securityHeadersMiddleware);

  // 3. Parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // 3b. Identity persistence (users, companies, sessions) when DATABASE_URL is set.
  //     Loads what the request needs from PostgreSQL and saves changes before responding.
  app.use(identityPersistenceMiddleware);

  // 4. Central Auth & Tenant Context Middleware
  app.use(authMiddleware);

  // CSRF Protection on Mutating Operations
  app.use(csrfProtectionMiddleware);

  // 5. Public Health Check & Diagnostic Endpoints
  app.get(['/api/health/live', '/health/live', '/api/v1/health/live'], (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get(['/api/health/ready', '/health/ready', '/api/v1/health/ready'], async (_req: Request, res: Response) => {
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
  app.get(['/api/v1/auth/csrf-token', '/api/auth/csrf-token', '/v1/auth/csrf-token', '/auth/csrf-token'], (req: Request, res: Response) => {
    const sessionToken = req.sessionToken || (req.headers['x-session-token'] as string) || 'public-session-token';
    const token = generateCsrfToken(sessionToken);
    res.status(200).json({
      csrfToken: token,
      message: 'CSRF token issued successfully',
    });
  });

  // 6. Tenant Suspension Check for mutating operations
  app.use('/api/*', checkTenantNotSuspended);

  // 7. Mount Domain Modules with universal path prefixes
  const mountRoutes = (prefix: string) => {
    app.use(`${prefix}/auth`, authRouter);
    app.use(`${prefix}/company`, companyRouter);
    app.use(`${prefix}/users`, usersRouter);
    app.use(`${prefix}/superadmin`, superadminRouter);
    app.use(`${prefix}/billing`, billingRouter);
    app.use(`${prefix}/audit`, auditRouter);
    app.use(`${prefix}/core`, coreRouter);
    app.use(`${prefix}/accounting`, accountingRouter);
    app.use(`${prefix}/inventory`, inventoryRouter);
    app.use(`${prefix}/sales`, salesRouter);
    app.use(`${prefix}/purchasing`, purchasingRouter);
    app.use(`${prefix}/parties/customers`, salesRouter);
    app.use(`${prefix}/parties/suppliers`, purchasingRouter);
    app.use(`${prefix}/treasury`, treasuryRouter);
    app.use(`${prefix}/zatca`, zatcaRouter);
    app.use(`${prefix}/vat`, vatRouter);
    app.use(`${prefix}/assets`, assetsRouter);
    app.use(`${prefix}/security`, securityRouter);
    app.use(`${prefix}/backups`, backupsRouter);
    app.use(`${prefix}/system/backups`, backupsRouter);
    app.use(`${prefix}/reports`, reportsRouter);
    app.use(`${prefix}/documents`, documentsRouter);
    app.use(`${prefix}/notifications`, notificationsRouter);
    app.use(`${prefix}/automation`, automationRouter);
    app.use(`${prefix}/pos`, posRouter);
    app.use(`${prefix}/ocr`, ocrRouter);
    app.use(`${prefix}/assistant`, assistantRouter);
    app.use(`${prefix}/import-export`, importExportRouter);
    app.use(`${prefix}`, integrationsRouter);
  };

  mountRoutes('/api/v1');
  mountRoutes('/api');
  mountRoutes('/v1');

  // 8. API 404 Catch-All: Always return JSON for unhandled /api/* paths
  app.all(['/api/*', '/v1/*'], (req: Request, res: Response) => {
    res.status(404).json({
      error: 'API_ENDPOINT_NOT_FOUND',
      message: `The endpoint ${req.method} ${req.originalUrl || req.url} was not found on this server.`,
      path: req.originalUrl || req.url,
    });
  });

  // 9. Global API Error Handler
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    const correlationId = (req as Request & { correlationId?: string }).correlationId || 'unknown';
    logger.error('Unhandled API Exception', {
      correlationId,
      path: req.path,
      error: err.message,
      stack: err.stack,
    });

    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: err.message || 'An internal error occurred. Please contact the administrator.',
      correlationId,
      details: err.message,
    });
  });

  return app;
}

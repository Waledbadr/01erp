import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { env } from './server/core/env.js';
import { logger, StructuredLogger } from './server/core/logger.js';
import { checkDatabaseHealth } from './server/db/client.js';
import { authMiddleware } from './server/core/authMiddleware.js';
import { authRouter } from './server/modules/auth/routes.js';
import { companyRouter } from './server/modules/company/routes.js';
import { usersRouter } from './server/modules/users/routes.js';
import { superadminRouter } from './server/modules/superadmin/routes.js';
import { auditRouter } from './server/modules/audit/routes.js';
import { coreRouter } from './server/modules/core/routes.js';
import { accountingRouter } from './server/modules/accounting/routes.js';
import { inventoryRouter } from './server/modules/inventory/routes.js';
import { salesRouter } from './server/modules/sales/routes.js';
import { purchasingRouter } from './server/modules/purchasing/routes.js';
import { treasuryRouter } from './server/modules/treasury/routes.js';
import { zatcaRouter } from './server/modules/zatca/routes.js';
import { vatRouter } from './server/modules/vat/routes.js';
import { assetsRouter } from './server/modules/assets/routes.js';
import { securityRouter } from './server/modules/security/routes.js';
import { backupsRouter } from './server/modules/backup/routes.js';
import { reportsRouter } from './server/modules/reports/routes.js';
import { documentsRouter } from './server/modules/documents/routes.js';
import { notificationsRouter } from './server/modules/notifications/routes.js';
import { automationRouter } from './server/modules/automation/routes.js';
import { posRouter } from './server/modules/pos/routes.js';
import { ocrRouter } from './server/modules/ocr/routes.js';

async function startServer() {
  const app = express();
  const PORT = env.PORT || 3000;

  // 1. Correlation ID Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const correlationId = (req.headers['x-correlation-id'] as string) || crypto.randomUUID();
    res.setHeader('x-correlation-id', correlationId);
    (req as Request & { correlationId: string }).correlationId = correlationId;
    next();
  });

  // 2. Parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // 3. Central Auth & Tenant Context Middleware
  app.use(authMiddleware);

  // 4. Request Logging (Sensitive data redacted)
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const correlationId = (req as Request & { correlationId: string }).correlationId;
    const reqLogger = new StructuredLogger(correlationId);

    res.on('finish', () => {
      const durationMs = Date.now() - start;
      if (req.path.startsWith('/api/')) {
        reqLogger.info(`${req.method} ${req.path} ${res.statusCode} (${durationMs}ms)`, {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs,
        });
      }
    });

    next();
  });

  // 5. Health Check Endpoints (G1 / Cloud Run Compliance)
  app.get('/api/health/live', (req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      service: 'saudi-erp-cloud',
      phase: 'PHASE-01',
    });
  });

  app.get('/api/health/ready', async (req: Request, res: Response) => {
    const dbHealth = await checkDatabaseHealth();
    const isReady = dbHealth.status !== 'unreachable';
    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'ok' : 'degraded',
      database: dbHealth,
      timestamp: new Date().toISOString(),
      modulesReady: ['core', 'auth', 'company', 'users', 'superadmin', 'audit', 'accounting', 'inventory', 'sales', 'purchasing', 'treasury', 'assets'],
    });
  });

  // 6. Modular API Routes
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/company', companyRouter);
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/superadmin', superadminRouter);
  app.use('/api/v1/audit', auditRouter);
  app.use('/api/v1/core', coreRouter);
  app.use('/api/v1/accounting', accountingRouter);
  app.use('/api/v1/inventory', inventoryRouter);
  app.use('/api/v1/sales', salesRouter);
  app.use('/api/v1/purchasing', purchasingRouter);
  app.use('/api/v1/treasury', treasuryRouter);
  app.use('/api/treasury', treasuryRouter);
  app.use('/api/v1/zatca', zatcaRouter);
  app.use('/api/zatca', zatcaRouter);
  app.use('/api/v1/vat', vatRouter);
  app.use('/api/vat', vatRouter);
  app.use('/api/v1/assets', assetsRouter);
  app.use('/api/assets', assetsRouter);
  app.use('/api/v1/security', securityRouter);
  app.use('/api/v1/backups', backupsRouter);
  app.use('/api/v1/system/backups', backupsRouter);
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

  // 6. Global API Error Handler
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

  // 7. Vite Integration (Development Middleware vs Production Static Serving)
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // 8. Bind Server to Port 3000 & Host 0.0.0.0
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Saudi Enterprise ERP Server running on http://0.0.0.0:${PORT} [${env.NODE_ENV}]`);
  });
}

startServer().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});

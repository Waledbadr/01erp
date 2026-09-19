import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../core/authMiddleware.js';
import {
  getFilteredAuditLogsService,
  getAuditStatsService,
  verifyAuditChainIntegrityService,
  exportAuditLogsToCsv,
} from './auditService.js';

export const auditRouter = Router();

// GET /api/v1/audit/logs - Enhanced filtered audit logs
auditRouter.get('/logs', requireAuth, requirePermission('reports:audit:view'), (req: Request, res: Response) => {
  const tenantId = req.tenantRepo!.tenantId;
  const filters = {
    action: req.query.action as string,
    resourceType: req.query.resourceType as string,
    userEmail: req.query.userEmail as string,
    search: req.query.search as string,
    dateFrom: req.query.dateFrom as string,
    dateTo: req.query.dateTo as string,
    limit: req.query.limit ? Number(req.query.limit) : 50,
    offset: req.query.offset ? Number(req.query.offset) : 0,
  };

  const result = getFilteredAuditLogsService(tenantId, filters);
  return res.json(result);
});

// GET /api/v1/audit/stats - Audit dashboard metrics
auditRouter.get('/stats', requireAuth, requirePermission('reports:audit:view'), (req: Request, res: Response) => {
  const tenantId = req.tenantRepo!.tenantId;
  const stats = getAuditStatsService(tenantId);
  return res.json(stats);
});

// GET /api/v1/audit/verify-integrity - Cryptographic SHA-256 chain verification
auditRouter.get('/verify-integrity', requireAuth, requirePermission('reports:audit:view'), (req: Request, res: Response) => {
  const tenantId = req.tenantRepo!.tenantId;
  const result = verifyAuditChainIntegrityService(tenantId);
  return res.json(result);
});

// GET /api/v1/audit/export/csv - Statutory CSV Export
auditRouter.get('/export/csv', requireAuth, requirePermission('reports:audit:view'), (req: Request, res: Response) => {
  const tenantId = req.tenantRepo!.tenantId;
  const filters = {
    action: req.query.action as string,
    resourceType: req.query.resourceType as string,
    userEmail: req.query.userEmail as string,
    search: req.query.search as string,
    dateFrom: req.query.dateFrom as string,
    dateTo: req.query.dateTo as string,
  };

  const csvData = exportAuditLogsToCsv(tenantId, filters);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="audit_trail_${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.status(200).send(csvData);
});

// GET /api/v1/audit/export/json - JSON Export
auditRouter.get('/export/json', requireAuth, requirePermission('reports:audit:view'), (req: Request, res: Response) => {
  const tenantId = req.tenantRepo!.tenantId;
  const { logs } = getFilteredAuditLogsService(tenantId, { limit: 10000 });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="audit_trail_${new Date().toISOString().slice(0, 10)}.json"`);
  return res.json({ tenantId, exportedAt: new Date().toISOString(), total: logs.length, logs });
});

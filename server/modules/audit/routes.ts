import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../core/authMiddleware.js';

export const auditRouter = Router();

auditRouter.get('/logs', requireAuth, requirePermission('reports:audit:view'), (req: Request, res: Response) => {
  const limit = req.query.limit ? Math.min(Number(req.query.limit), 200) : 100;
  const logs = req.tenantRepo!.getAuditLogs(limit);
  return res.json({ logs, total: logs.length });
});

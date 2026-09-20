import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../core/authMiddleware.js';
import {
  createBackupSnapshotService,
  listBackupSnapshotsService,
  getBackupSnapshotService,
  downloadBackupSnapshotService,
  verifyBackupSnapshotService,
  restoreBackupSnapshotService,
  triggerScheduledBackupService,
  seedInitialBackupIfEmpty,
} from './backupService.js';

export const backupsRouter = Router();

// GET /api/v1/backups - List backup snapshots
backupsRouter.get('/', requireAuth, requirePermission('reports:audit:view'), (req: Request, res: Response) => {
  const tenantId = req.tenantRepo!.tenantId;
  seedInitialBackupIfEmpty(tenantId, req.tenantContext!.userId, req.tenantContext!.userEmail);
  const backups = listBackupSnapshotsService(tenantId);
  return res.json({ backups, total: backups.length });
});

// POST /api/v1/backups - Create an on-demand snapshot
backupsRouter.post('/', requireAuth, requirePermission('reports:audit:view'), (req: Request, res: Response) => {
  const tenantId = req.tenantRepo!.tenantId;
  const { description, retentionTier, storageLocation, type } = req.body;

  const metadata = createBackupSnapshotService(
    tenantId,
    req.tenantContext!.userId,
    req.tenantContext!.userEmail,
    description,
    type || 'MANUAL',
    retentionTier || 'DAILY_7D',
    storageLocation || 'OFFSITE_SECURE_VAULT'
  );

  return res.status(201).json(metadata);
});

// POST /api/v1/backups/schedule-trigger - Trigger automated scheduled backup run
backupsRouter.post('/schedule-trigger', requireAuth, (req: Request, res: Response) => {
  const tenantId = req.tenantRepo!.tenantId;
  const role = req.tenantContext!.role;
  const isSuperAdmin = req.tenantContext!.isPlatformSuperAdmin;

  if (!isSuperAdmin && role !== 'OWNER' && role !== 'SUPER_ADMIN') {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Triggering scheduled backup jobs requires Owner or Super Admin privileges.',
    });
  }

  const { type, retentionTier } = req.body;
  const metadata = triggerScheduledBackupService(
    tenantId,
    type || 'SCHEDULED_DAILY_INCREMENTAL',
    retentionTier || 'DAILY_7D'
  );

  return res.status(201).json(metadata);
});

// GET /api/v1/backups/:id - Inspect snapshot metadata
backupsRouter.get('/:id', requireAuth, requirePermission('reports:audit:view'), (req: Request, res: Response) => {
  const tenantId = req.tenantRepo!.tenantId;
  const backup = getBackupSnapshotService(tenantId, req.params.id);
  if (!backup) {
    return res.status(404).json({ error: 'BACKUP_NOT_FOUND', message: 'Backup snapshot not found' });
  }
  return res.json(backup);
});

// GET /api/v1/backups/:id/download - Download JSON snapshot with SHA-256 checksum header
backupsRouter.get('/:id/download', requireAuth, requirePermission('reports:audit:view'), (req: Request, res: Response) => {
  const tenantId = req.tenantRepo!.tenantId;
  const result = downloadBackupSnapshotService(
    tenantId,
    req.params.id,
    req.tenantContext!.userId,
    req.tenantContext!.userEmail
  );

  if (!result) {
    return res.status(404).json({ error: 'BACKUP_NOT_FOUND', message: 'Backup snapshot not found' });
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.setHeader('X-Checksum-SHA256', result.checksumSha256);
  return res.status(200).send(result.payloadJson);
});

// POST /api/v1/backups/:id/verify - Run automated restoration drill
backupsRouter.post('/:id/verify', requireAuth, requirePermission('reports:audit:view'), (req: Request, res: Response) => {
  const tenantId = req.tenantRepo!.tenantId;
  const report = verifyBackupSnapshotService(
    tenantId,
    req.params.id,
    req.tenantContext!.userId,
    req.tenantContext!.userEmail
  );

  if (!report) {
    return res.status(404).json({ error: 'BACKUP_NOT_FOUND', message: 'Backup snapshot not found' });
  }

  return res.json(report);
});

// POST /api/v1/backups/:id/restore - Execute disaster recovery restoration
backupsRouter.post('/:id/restore', requireAuth, (req: Request, res: Response) => {
  const tenantId = req.tenantRepo!.tenantId;
  const role = req.tenantContext!.role;
  const isSuperAdmin = req.tenantContext!.isPlatformSuperAdmin;

  // docs/BACKUPS.md Section 3.1: Super Admin / Owner privilege strictly required
  if (!isSuperAdmin && role !== 'OWNER' && role !== 'SUPER_ADMIN') {
    return res.status(403).json({
      error: 'RESTORE_FORBIDDEN',
      message: 'Disaster recovery restoration requires Owner or Super Admin privileges.',
    });
  }

  const justificationReason = req.body?.justificationReason || req.body?.reason;
  if (!justificationReason || String(justificationReason).trim().length < 10) {
    return res.status(400).json({
      error: 'JUSTIFICATION_REQUIRED',
      message: 'Disaster recovery restoration requires a documented operational reason of at least 10 characters.',
    });
  }

  try {
    const result = restoreBackupSnapshotService(
      tenantId,
      req.params.id,
      req.tenantContext!.userId,
      req.tenantContext!.userEmail,
      String(justificationReason).trim()
    );

    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: 'RESTORE_FAILED', message: err.message });
  }
});

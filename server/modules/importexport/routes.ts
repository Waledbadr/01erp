import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../core/authMiddleware.js';
import { centralStore } from '../../core/tenantGuard.js';
import { IMPORT_TEMPLATES_CONFIG } from './templateDefinitions.js';
import { validateImportRows } from './importValidationService.js';
import { executeImportCommit } from './importCommitService.js';
import { executeImportRollback } from './importRollbackService.js';
import { exportResourceData, buildCsvString } from './exportService.js';
import { ImportTemplate, ImportMode } from './types.js';

export const importExportRouter = Router();

function getUserFromReq(req: Request) {
  const user = (req as any).user || {
    id: 'user-admin-default',
    email: 'admin@saudi-erp.sa',
    tenantId: (req.headers['x-tenant-id'] as string) || 'tenant-default',
  };
  const tenantId = (req.headers['x-tenant-id'] as string) || user.tenantId || 'tenant-default';
  return { tenantId, userId: user.id || 'user-admin-default', userEmail: user.email || 'admin@saudi-erp.sa' };
}

// =========================================================================
// 1. TEMPLATES & SAMPLES
// =========================================================================

// List all 10 supported templates with field definitions
importExportRouter.get('/templates', requireAuth, (req: Request, res: Response) => {
  const templates = Object.values(IMPORT_TEMPLATES_CONFIG).map((cfg) => ({
    template: cfg.template,
    nameAr: cfg.nameAr,
    nameEn: cfg.nameEn,
    category: cfg.category,
    descriptionAr: cfg.descriptionAr,
    descriptionEn: cfg.descriptionEn,
    primaryKeyField: cfg.primaryKeyField,
    fieldsCount: cfg.fields.length,
    fields: cfg.fields,
  }));
  res.json({ success: true, count: templates.length, templates });
});

// Download sample data / template for a given resource
importExportRouter.get('/templates/:template/sample', requireAuth, (req: Request, res: Response) => {
  const templateKey = req.params.template.toUpperCase() as ImportTemplate;
  const config = IMPORT_TEMPLATES_CONFIG[templateKey];

  if (!config) {
    return res.status(404).json({ success: false, error: `Template ${req.params.template} not found` });
  }

  const format = (req.query.format as string) || 'csv';

  if (format.toLowerCase() === 'json') {
    return res.json({
      template: config.template,
      sampleRows: config.sampleRows,
    });
  }

  const headers = config.fields.map((f) => f.field);
  const csv = buildCsvString(headers, config.sampleRows);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="template_${config.template.toLowerCase()}.csv"`);
  res.send(csv);
});

// =========================================================================
// 2. DRY-RUN VALIDATION
// =========================================================================

importExportRouter.post('/validate', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = getUserFromReq(req);
    const { template, mode = 'CREATE_OR_UPDATE', rows } = req.body;

    if (!template || !rows || !Array.isArray(rows)) {
      return res.status(400).json({
        success: false,
        error: 'template (string) and rows (array) are required in request body',
      });
    }

    const result = validateImportRows(
      centralStore,
      tenantId,
      template as ImportTemplate,
      mode as ImportMode,
      rows
    );

    res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 3. TRANSACTIONAL COMMIT
// =========================================================================

importExportRouter.post('/commit', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId, userId, userEmail } = getUserFromReq(req);
    const { template, mode = 'CREATE_OR_UPDATE', rows, filename, simulateDbFailureAtRow } = req.body;

    if (!template || !rows || !Array.isArray(rows)) {
      return res.status(400).json({
        success: false,
        error: 'template and rows are required for commit',
      });
    }

    const job = executeImportCommit(centralStore, tenantId, userId, userEmail, {
      template: template as ImportTemplate,
      mode: mode as ImportMode,
      rows,
      filename,
      simulateDbFailureAtRow,
    });

    res.status(201).json({
      success: true,
      messageAr: `تم تنفيذ عملية استيراد (${template}) بنجاح واعتماد ${job.createdCount} سجل جديد وتحديث ${job.updatedCount} سجل.`,
      messageEn: `Successfully committed ${template} import job. Created ${job.createdCount} and updated ${job.updatedCount} records.`,
      job,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: err.message,
      aborted: true,
    });
  }
});

// =========================================================================
// 4. ATOMIC ROLLBACK
// =========================================================================

importExportRouter.post('/rollback/:jobId', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId, userId, userEmail } = getUserFromReq(req);
    const { jobId } = req.params;

    const rollbackResult = executeImportRollback(centralStore, tenantId, userId, userEmail, jobId);

    res.json({
      success: true,
      result: rollbackResult,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: err.message,
    });
  }
});

// =========================================================================
// 5. JOBS & AUDIT HISTORY
// =========================================================================

importExportRouter.get('/jobs', requireAuth, (req: Request, res: Response) => {
  const { tenantId } = getUserFromReq(req);
  const jobs = centralStore.batchImports.get(tenantId) || [];
  res.json({
    success: true,
    count: jobs.length,
    jobs,
  });
});

importExportRouter.get('/jobs/:jobId', requireAuth, (req: Request, res: Response) => {
  const { tenantId } = getUserFromReq(req);
  const jobs = centralStore.batchImports.get(tenantId) || [];
  const job = jobs.find((j: any) => j.id === req.params.jobId);

  if (!job) {
    return res.status(404).json({ success: false, error: 'Import job not found' });
  }

  res.json({ success: true, job });
});

// =========================================================================
// 6. RESOURCE EXPORT (CSV / JSON)
// =========================================================================

importExportRouter.post('/export', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = getUserFromReq(req);
    const { resource, format = 'CSV', search, status, category, fromDate, toDate } = req.body;

    if (!resource) {
      return res.status(400).json({ success: false, error: 'resource is required for export' });
    }

    const exported = exportResourceData(centralStore, tenantId, {
      resource,
      format,
      search,
      status,
      category,
      fromDate,
      toDate,
    });

    if (req.query.download === 'true') {
      res.setHeader('Content-Type', exported.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
      return res.send(exported.content);
    }

    res.json({
      success: true,
      ...exported,
    });
  } catch (err) {
    next(err);
  }
});

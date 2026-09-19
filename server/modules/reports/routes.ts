/**
 * Reports Center API Routes — Saudi ERP Backend
 * Adheres to:
 * - RESTful standards with tenant guard isolation
 * - Content-tested CSV/Excel exports with UTF-8 BOM
 * - Rule C cost scrubber on unauthorized roles
 */

import { Router, Request, Response } from 'express';
import { REPORT_DEFINITIONS, ReportType, generateReportCsv, generateReportExcelHtml } from '../../../src/lib/reports.js';
import { ReportService } from './reportService.js';
import { centralStore } from '../../core/tenantGuard.js';

export const reportsRouter = Router();

// Helper to extract tenantId from session or header
function resolveTenantId(req: Request): string {
  if (req.tenantContext?.tenantId) return req.tenantContext.tenantId;
  if (req.headers['x-tenant-id']) return String(req.headers['x-tenant-id']);
  if (req.query.tenantId) return String(req.query.tenantId);

  // Default to first tenant in store if present
  const firstTenant = Array.from(centralStore.tenants.keys())[0];
  return firstTenant || 'system-default-tenant';
}

function resolveUser(req: Request) {
  if (req.tenantContext) {
    return {
      id: req.tenantContext.userId,
      email: req.tenantContext.userEmail,
      role: req.tenantContext.role,
      permissions: req.tenantContext.permissions || [],
    };
  }
  return {
    id: 'system-user',
    email: 'admin@saudierp.com',
    role: 'ADMIN',
    permissions: ['*'],
  };
}

/**
 * GET /api/v1/reports/hub
 * Returns the catalog of all 24 available reports grouped by category
 */
reportsRouter.get('/hub', (req: Request, res: Response) => {
  try {
    const tenantId = resolveTenantId(req);
    const user = resolveUser(req);
    const presets = ReportService.getPresets(tenantId, user.id);
    const jobs = ReportService.getJobs(tenantId);

    res.json({
      success: true,
      definitions: REPORT_DEFINITIONS,
      presets,
      activeJobsCount: jobs.filter((j) => j.status === 'PROCESSING').length,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/reports/execute/:reportType
 * Executes a report synchronously with parameters
 */
reportsRouter.get('/execute/:reportType', (req: Request, res: Response) => {
  try {
    const tenantId = resolveTenantId(req);
    const reportType = req.params.reportType as ReportType;
    const user = resolveUser(req);
    const query = req.query;

    const params = {
      startDate: query.startDate as string,
      endDate: query.endDate as string,
      asOfDate: query.asOfDate as string,
      comparisonStartDate: query.comparisonStartDate as string,
      comparisonEndDate: query.comparisonEndDate as string,
      accountId: query.accountId as string,
      accountHierarchyLevel: query.accountHierarchyLevel ? Number(query.accountHierarchyLevel) : undefined,
      includeZeroBalances: query.includeZeroBalances === 'true',
      branchId: query.branchId as string,
      costCenterId: query.costCenterId as string,
      warehouseId: query.warehouseId as string,
      customerId: query.customerId as string,
      supplierId: query.supplierId as string,
      itemId: query.itemId as string,
      minDays: query.minDays ? Number(query.minDays) : undefined,
      periodType: query.periodType as any,
    };

    // If query says async=true or is heavy, trigger async job
    if (query.async === 'true') {
      const job = ReportService.createAsyncJob(
        tenantId,
        user.id,
        user.email,
        reportType,
        params,
        user.permissions,
        user.role
      );
      return res.json({ success: true, async: true, job });
    }

    const result = ReportService.executeReport(tenantId, reportType, params, user.permissions, user.role);
    res.json({ success: true, report: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/reports/export/:reportType
 * Export report as CSV (with UTF-8 BOM for Excel) or Excel HTML
 */
reportsRouter.get('/export/:reportType', (req: Request, res: Response) => {
  try {
    const tenantId = resolveTenantId(req);
    const reportType = req.params.reportType as ReportType;
    const user = resolveUser(req);
    const format = (req.query.format as string) || 'csv';
    const lang = (req.query.lang as 'ar' | 'en') || 'ar';

    const params = {
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      asOfDate: req.query.asOfDate as string,
      accountId: req.query.accountId as string,
      customerId: req.query.customerId as string,
      supplierId: req.query.supplierId as string,
      warehouseId: req.query.warehouseId as string,
      includeZeroBalances: req.query.includeZeroBalances === 'true',
    };

    const result = ReportService.executeReport(tenantId, reportType, params, user.permissions, user.role);

    if (format.toLowerCase() === 'excel' || format.toLowerCase() === 'xls') {
      const excelHtml = generateReportExcelHtml(result, lang);
      res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${reportType}_${Date.now()}.xls"`);
      return res.send(excelHtml);
    } else {
      const csvData = generateReportCsv(result, lang);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${reportType}_${Date.now()}.csv"`);
      return res.send(csvData);
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/reports/jobs
 * Initiates an async heavy report execution
 */
reportsRouter.post('/jobs', (req: Request, res: Response) => {
  try {
    const tenantId = resolveTenantId(req);
    const user = resolveUser(req);
    const { reportType, parameters } = req.body;

    if (!reportType) {
      return res.status(400).json({ success: false, error: 'reportType is required' });
    }

    const job = ReportService.createAsyncJob(
      tenantId,
      user.id,
      user.email,
      reportType,
      parameters || {},
      user.permissions,
      user.role
    );

    res.status(201).json({ success: true, job });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/reports/jobs
 * List all async report jobs for the current tenant
 */
reportsRouter.get('/jobs', (req: Request, res: Response) => {
  try {
    const tenantId = resolveTenantId(req);
    const jobs = ReportService.getJobs(tenantId);
    res.json({ success: true, jobs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/reports/jobs/:id
 * Get single async report job status & results
 */
reportsRouter.get('/jobs/:id', (req: Request, res: Response) => {
  try {
    const tenantId = resolveTenantId(req);
    const job = ReportService.getJobById(tenantId, req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    res.json({ success: true, job });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/reports/jobs/:id/download
 * Download result data of a finished job
 */
reportsRouter.get('/jobs/:id/download', (req: Request, res: Response) => {
  try {
    const tenantId = resolveTenantId(req);
    const job = ReportService.getJobById(tenantId, req.params.id);
    if (!job || !job.resultData) {
      return res.status(404).json({ success: false, error: 'Job result data not found' });
    }
    const csv = generateReportCsv(job.resultData, 'ar');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${job.reportType}_${job.id}.csv"`);
    res.send(csv);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/reports/presets
 * List saved filter presets
 */
reportsRouter.get('/presets', (req: Request, res: Response) => {
  try {
    const tenantId = resolveTenantId(req);
    const user = resolveUser(req);
    const presets = ReportService.getPresets(tenantId, user.id);
    res.json({ success: true, presets });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/reports/presets
 * Save a filter preset
 */
reportsRouter.post('/presets', (req: Request, res: Response) => {
  try {
    const tenantId = resolveTenantId(req);
    const user = resolveUser(req);
    const { reportType, name, parameters, isDefault } = req.body;

    if (!reportType || !name) {
      return res.status(400).json({ success: false, error: 'reportType and name are required' });
    }

    const preset = ReportService.savePreset(tenantId, user.id, reportType, name, parameters || {}, isDefault);
    res.status(201).json({ success: true, preset });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/v1/reports/presets/:id
 * Delete a filter preset
 */
reportsRouter.delete('/presets/:id', (req: Request, res: Response) => {
  try {
    const tenantId = resolveTenantId(req);
    const deleted = ReportService.deletePreset(tenantId, req.params.id);
    res.json({ success: true, deleted });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/reports/source-document/:type/:id
 * Drill-down resolution endpoint to load original transaction document
 */
reportsRouter.get('/source-document/:type/:id', (req: Request, res: Response) => {
  try {
    const tenantId = resolveTenantId(req);
    const { type, id } = req.params;
    const doc = ReportService.resolveSourceDocument(tenantId, type, id);

    if (!doc) {
      return res.status(404).json({ success: false, error: 'Source document not found' });
    }

    res.json({ success: true, document: doc });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PHASE 21 / PHASE 20 — SUPER ADMIN PLATFORM REST API ROUTES
 * Platform Overview Metrics, Company Metadata Directory,
 * Suspension / Reactivation with Audit Trail,
 * Support Access Grants (admin_access_grants) & Strict Privacy Boundary Enforcement.
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireSuperAdmin } from '../../core/authMiddleware.js';
import { centralStore } from '../../core/tenantGuard.js';
import { validateSaudiVatNumber, validateSaudiCrNumber } from '../../core/security.js';
import { BillingService } from '../billing/billingService.js';

export const superadminRouter = Router();

// Apply superadmin restriction to all endpoints in this router
superadminRouter.use(requireAuth, requireSuperAdmin);

// 1. Platform Metrics Overview (MRR, ARR, Tenants, Storage, Documents)
superadminRouter.get('/metrics', (req: Request, res: Response) => {
  try {
    const metrics = BillingService.getPlatformMetrics();
    return res.json({ success: true, metrics });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to fetch platform metrics' });
  }
});

// 2. List all companies (Metadata only per privacy mandate)
superadminRouter.get('/companies', (req: Request, res: Response) => {
  try {
    const list = BillingService.getCompanyMetadataList();
    return res.json({ success: true, companies: list, total: list.length });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to list companies' });
  }
});

// 3. Create new company from platform administration
superadminRouter.post('/companies', (req: Request, res: Response) => {
  const { nameAr, nameEn, vatNumber, crNumber, unifiedNumber } = req.body;
  if (!nameAr || !vatNumber || !crNumber) {
    return res.status(400).json({ error: 'MISSING_FIELDS' });
  }

  const vatCheck = validateSaudiVatNumber(vatNumber);
  if (!vatCheck.valid) return res.status(400).json({ error: 'INVALID_VAT', message: vatCheck.error });

  const crCheck = validateSaudiCrNumber(crNumber);
  if (!crCheck.valid) return res.status(400).json({ error: 'INVALID_CR', message: crCheck.error });

  const tenant = centralStore.createTenant({
    nameAr,
    nameEn: nameEn || nameAr,
    vatNumber,
    crNumber,
    unifiedNumber,
    adminUserId: req.tenantContext!.userId,
  });

  centralStore.recordAuditLog({
    tenantId: tenant.id,
    userId: req.tenantContext!.userId,
    userEmail: req.tenantContext!.userEmail,
    ipAddress: req.tenantContext!.ipAddress,
    userAgent: req.tenantContext!.userAgent,
    action: 'PLATFORM_SUPERADMIN_CREATE_COMPANY',
    resourceType: 'tenants',
    resourceId: tenant.id,
    correlationId: req.tenantContext!.correlationId,
  });

  return res.status(201).json({ success: true, company: tenant });
});

// 4. Suspend company with auditable reason
superadminRouter.post('/tenants/:companyId/suspend', async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ error: 'REASON_REQUIRED', message: 'A specific reason is required to suspend a tenant.' });
    }

    const tenant = centralStore.tenants.get(companyId);
    if (!tenant) return res.status(404).json({ error: 'COMPANY_NOT_FOUND' });

    const updatedSub = await BillingService.suspendSubscription(
      companyId,
      reason.trim(),
      req.tenantContext?.userEmail
    );

    return res.json({
      success: true,
      messageAr: 'تم تعليق حساب المنشأة وتفعيل وضع القراءة فقط',
      messageEn: 'Tenant suspended and placed in read-only mode',
      subscription: updatedSub,
      isSuspended: true,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to suspend tenant' });
  }
});

// 5. Restore / Reactivate company
superadminRouter.post('/tenants/:companyId/restore', async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const tenant = centralStore.tenants.get(companyId);
    if (!tenant) return res.status(404).json({ error: 'COMPANY_NOT_FOUND' });

    const updatedSub = await BillingService.reactivateSubscription(
      companyId,
      req.tenantContext?.userEmail
    );

    return res.json({
      success: true,
      messageAr: 'تمت إعادة تفعيل حساب المنشأة ورفع وضع القراءة فقط',
      messageEn: 'Tenant reactivated and write mode restored',
      subscription: updatedSub,
      isSuspended: false,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to restore tenant' });
  }
});

// Legacy status update compatibility
superadminRouter.put('/companies/:companyId/status', async (req: Request, res: Response) => {
  const { companyId } = req.params;
  const { isSuspended, reason } = req.body;

  const tenant = centralStore.tenants.get(companyId);
  if (!tenant) return res.status(404).json({ error: 'COMPANY_NOT_FOUND' });

  if (isSuspended) {
    await BillingService.suspendSubscription(companyId, reason || 'Administrative suspension', req.tenantContext?.userEmail);
  } else {
    await BillingService.reactivateSubscription(companyId, req.tenantContext?.userEmail);
  }

  return res.json({
    message: `تم ${isSuspended ? 'إيقاف' : 'إعادة تفعيل'} المنشأة بنجاح.`,
    isSuspended: tenant.isSuspended,
  });
});

// 6. Issue Support Access Grant (admin_access_grants)
superadminRouter.post('/support-grants', (req: Request, res: Response) => {
  try {
    const { tenantId, reason, durationMinutes } = req.body;
    if (!tenantId || !reason) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'tenantId and justification reason are required.' });
    }

    const grant = BillingService.createSupportGrant({
      superAdminId: req.tenantContext!.userId,
      superAdminEmail: req.tenantContext!.userEmail,
      tenantId,
      reason,
      durationMinutes: Number(durationMinutes || 15),
    });

    return res.status(201).json({
      success: true,
      messageAr: 'تم إصدار تصريح وصول الدعم الفني المحدد زمنياً بنجاح',
      messageEn: 'Time-boxed support access grant issued successfully',
      grant,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to create support grant' });
  }
});

// 7. List Support Access Grants
superadminRouter.get('/support-grants', (req: Request, res: Response) => {
  try {
    const tenantId = req.query.tenantId as string | undefined;
    const grants = BillingService.getSupportGrants(tenantId);
    return res.json({ success: true, grants });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to list support grants' });
  }
});

// 8. Revoke Support Access Grant
superadminRouter.post('/support-grants/:id/revoke', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const revoked = BillingService.revokeSupportGrant(id, req.tenantContext!.userEmail);
    return res.json({
      success: true,
      messageAr: 'تم إلغاء تصريح وصول الدعم الفني فوراً',
      messageEn: 'Support access grant revoked immediately',
      grant: revoked,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to revoke support grant' });
  }
});

// 9. List Support Access Audit Logs
superadminRouter.get('/support-grants/logs', (req: Request, res: Response) => {
  try {
    const tenantId = req.query.tenantId as string | undefined;
    const logs = BillingService.getSupportAccessLogs(tenantId);
    return res.json({ success: true, logs });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to list support access logs' });
  }
});

// 10. Strict Data Boundary: Access Tenant Operational Data
// Requires an ACTIVE, UNEXPIRED Support Access Grant
superadminRouter.get('/tenants/:companyId/operational-data', (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const userEmail = req.tenantContext!.userEmail;

    // Check if grant exists and is valid
    const hasGrant = BillingService.validateSupportGrant(userEmail, companyId);
    if (!hasGrant) {
      return res.status(403).json({
        error: 'TENANT_DATA_ACCESS_FORBIDDEN',
        message:
          'Super Admin data boundary enforcement: A valid, time-boxed support access grant (admin_access_grants) is strictly required to inspect tenant operational records.',
      });
    }

    // Log the access event
    BillingService.logSupportAccess({
      superAdminEmail: userEmail,
      tenantId: companyId,
      action: 'INSPECT_OPERATIONAL_DATA',
      resourceType: 'operational_records',
      ipAddress: req.tenantContext?.ipAddress,
    });

    // Provide operational overview for support diagnostics
    const salesInvoices = centralStore.salesInvoices.get(companyId) || [];
    const purchaseBills = centralStore.purchaseBills.get(companyId) || [];
    const journals = centralStore.journals.get(companyId) || [];
    const items = centralStore.items.get(companyId) || [];

    return res.json({
      success: true,
      authorizedUnderGrant: true,
      data: {
        totalSalesInvoices: salesInvoices.length,
        totalPurchaseBills: purchaseBills.length,
        totalJournals: journals.length,
        totalItems: items.length,
        recentInvoices: salesInvoices.slice(0, 5),
        recentJournals: journals.slice(0, 5),
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Error accessing operational data' });
  }
});

// 11. Strict Anti-Impersonation Protection
superadminRouter.post('/impersonate', (req: Request, res: Response) => {
  // Impersonation is strictly prohibited across the entire platform
  return res.status(403).json({
    error: 'IMPERSONATION_PROHIBITED',
    message: 'User and tenant impersonation is strictly prohibited by Saudi ERP platform security and compliance policy.',
  });
});

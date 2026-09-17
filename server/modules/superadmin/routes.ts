import { Router, Request, Response } from 'express';
import { requireAuth, requireSuperAdmin } from '../../core/authMiddleware.js';
import { centralStore } from '../../core/tenantGuard.js';
import { validateSaudiVatNumber, validateSaudiCrNumber } from '../../core/security.js';

export const superadminRouter = Router();

// Apply superadmin restriction to all endpoints in this router
superadminRouter.use(requireAuth, requireSuperAdmin);

// List all companies
superadminRouter.get('/companies', (req: Request, res: Response) => {
  const list = Array.from(centralStore.tenants.values()).map((t) => ({
    id: t.id,
    code: t.code,
    nameAr: t.nameAr,
    nameEn: t.nameEn,
    vatNumber: t.vatNumber,
    crNumber: t.crNumber,
    isSuspended: t.isSuspended,
    onboardingCompleted: t.onboardingCompleted,
    createdAt: t.createdAt,
    branchesCount: (centralStore.branches.get(t.id) || []).length,
    usersCount: (centralStore.memberships.get(t.id) || []).length,
  }));
  return res.json({ companies: list, total: list.length });
});

// Create new company from platform administration
superadminRouter.post('/companies', (req: Request, res: Response) => {
  const { nameAr, nameEn, vatNumber, crNumber, unifiedNumber, adminEmail } = req.body;
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

  return res.status(201).json({ company: tenant });
});

// Suspend or activate company
superadminRouter.put('/companies/:companyId/status', (req: Request, res: Response) => {
  const { companyId } = req.params;
  const { isSuspended } = req.body;

  const tenant = centralStore.tenants.get(companyId);
  if (!tenant) return res.status(404).json({ error: 'COMPANY_NOT_FOUND' });

  tenant.isSuspended = Boolean(isSuspended);

  centralStore.recordAuditLog({
    tenantId: companyId,
    userId: req.tenantContext!.userId,
    userEmail: req.tenantContext!.userEmail,
    ipAddress: req.tenantContext!.ipAddress,
    userAgent: req.tenantContext!.userAgent,
    action: isSuspended ? 'SUSPEND_COMPANY' : 'REACTIVATE_COMPANY',
    resourceType: 'tenants',
    resourceId: companyId,
    correlationId: req.tenantContext!.correlationId,
  });

  return res.json({ message: `تم ${isSuspended ? 'إيقاف' : 'إعادة تفعيل'} المنشأة بنجاح.`, isSuspended: tenant.isSuspended });
});

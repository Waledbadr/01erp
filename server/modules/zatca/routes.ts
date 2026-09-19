import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requirePermission } from '../../core/authMiddleware.js';
import { centralStore } from '../../core/tenantGuard.js';
import {
  getZatcaConfigService,
  generateZatcaCsrService,
  uploadZatcaCredentialsService,
  onboardComplianceCsidService,
  onboardProductionCsidService,
  switchZatcaEnvironmentService,
  getEInvoiceDocumentsService,
  getEInvoiceDocumentByIdService,
  submitEInvoiceDocumentService,
  batchRetryEInvoicesService,
  verifyTenantHashChainService,
  validateInvoiceComplianceService,
  transmitInvoiceToZatcaService,
  getZatcaQueueService,
  retryZatcaQueueJobService,
  decodeZatcaQrService,
  getZatcaStatusMetricsService,
} from './zatcaService.js';

export const zatcaRouter = Router();

// ==========================================
// 1. ZATCA CONFIGURATION & CSID ONBOARDING
// ==========================================

// Get Current ZATCA Device & CSID Configuration (Scrubbed / No Private Key Exposure)
zatcaRouter.get(
  '/config',
  requireAuth,
  requirePermission('settings:zatca:manage'),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const config = getZatcaConfigService(centralStore, req.tenantContext!.tenantId);
      res.json(config);
    } catch (err) {
      next(err);
    }
  }
);

// Upload External Certificates & Private Key Securely
zatcaRouter.post(
  '/config/credentials',
  requireAuth,
  requirePermission('settings:zatca:manage'),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const config = uploadZatcaCredentialsService(
        centralStore,
        req.tenantContext!.tenantId,
        req.tenantContext!.userId,
        req.tenantContext!.userEmail,
        req.body
      );
      res.json(config);
    } catch (err) {
      next(err);
    }
  }
);

// Generate PKCS#10 CSR for EGS Unit
zatcaRouter.post(
  '/csr',
  requireAuth,
  requirePermission('settings:zatca:manage'),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const config = generateZatcaCsrService(
        centralStore,
        req.tenantContext!.tenantId,
        req.tenantContext!.userId,
        req.tenantContext!.userEmail,
        req.body
      );
      res.status(201).json(config);
    } catch (err) {
      next(err);
    }
  }
);

// Onboard Compliance CSID (CCSID) with Fatoora Portal OTP
zatcaRouter.post(
  '/csid/compliance',
  requireAuth,
  requirePermission('settings:zatca:manage'),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const { otp } = req.body;
      const config = onboardComplianceCsidService(
        centralStore,
        req.tenantContext!.tenantId,
        req.tenantContext!.userId,
        req.tenantContext!.userEmail,
        otp
      );
      res.json(config);
    } catch (err) {
      next(err);
    }
  }
);

// Onboard Production CSID (PCSID)
zatcaRouter.post(
  '/csid/production',
  requireAuth,
  requirePermission('settings:zatca:manage'),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const config = onboardProductionCsidService(
        centralStore,
        req.tenantContext!.tenantId,
        req.tenantContext!.userId,
        req.tenantContext!.userEmail
      );
      res.json(config);
    } catch (err) {
      next(err);
    }
  }
);

// Switch Environment (Simulation <-> Production) with strict permission and audit
zatcaRouter.post(
  '/environment',
  requireAuth,
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const { environment } = req.body;
      const hasProdSwitch =
        req.tenantContext!.isPlatformSuperAdmin ||
        req.tenantContext!.role === 'OWNER' ||
        req.tenantContext!.roleCode === 'OWNER' ||
        req.tenantContext!.permissions.includes('*') ||
        req.tenantContext!.permissions.includes('settings:zatca:production_switch');

      const config = switchZatcaEnvironmentService(
        centralStore,
        req.tenantContext!.tenantId,
        req.tenantContext!.userId,
        req.tenantContext!.userEmail,
        environment,
        Boolean(hasProdSwitch)
      );
      res.json(config);
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// 2. DASHBOARD METRICS & STATUS
// ==========================================

zatcaRouter.get(
  '/status',
  requireAuth,
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = getZatcaStatusMetricsService(centralStore, req.tenantContext!.tenantId);
      res.json(status);
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// 3. E-INVOICE DOCUMENT LAYER ENDPOINTS
// ==========================================

// List E-Invoice Documents
zatcaRouter.get(
  '/documents',
  requireAuth,
  requirePermission('sales:invoice:view'),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = {
        status: req.query.status as any,
        type: req.query.type as any,
        search: req.query.search as string,
      };
      const docs = getEInvoiceDocumentsService(req.tenantContext!.tenantId, filters);
      res.json(docs);
    } catch (err) {
      next(err);
    }
  }
);

// Get E-Invoice Document by ID with XMLs and Attempts Log
zatcaRouter.get(
  '/documents/:id',
  requireAuth,
  requirePermission('sales:invoice:view'),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = getEInvoiceDocumentByIdService(req.tenantContext!.tenantId, req.params.id);
      if (!doc) {
        return res.status(404).json({ error: 'E-Invoice document not found' });
      }
      res.json(doc);
    } catch (err) {
      next(err);
    }
  }
);

// Submit or Retry Submitting an E-Invoice Document
zatcaRouter.post(
  '/documents/:id/submit',
  requireAuth,
  requirePermission('sales:invoice:post'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await submitEInvoiceDocumentService(
        centralStore,
        req.tenantContext!,
        req.params.id,
        req.body
      );
      res.json(doc);
    } catch (err) {
      next(err);
    }
  }
);

// Batch Retry all failed or attention-required e-invoices
zatcaRouter.post(
  '/documents/batch-retry',
  requireAuth,
  requirePermission('sales:invoice:post'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await batchRetryEInvoicesService(centralStore, req.tenantContext!);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// Verify Cryptographic Hash Chain Integrity
zatcaRouter.get(
  '/chain/verify',
  requireAuth,
  requirePermission('sales:invoice:view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await verifyTenantHashChainService(centralStore, req.tenantContext!);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// 4. INVOICE COMPLIANCE VALIDATION & TRANSMISSION
// ==========================================

// Validate Invoice against BR-KSA Rules
zatcaRouter.get(
  '/invoices/:id/validate',
  requireAuth,
  requirePermission('sales:invoice:view'),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = validateInvoiceComplianceService(
        centralStore,
        req.tenantContext!.tenantId,
        req.params.id
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// Transmit Invoice to ZATCA
zatcaRouter.post(
  '/invoices/:id/transmit',
  requireAuth,
  requirePermission('sales:invoice:post'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const job = await transmitInvoiceToZatcaService(
        centralStore,
        req.tenantContext!,
        req.params.id
      );
      res.json(job);
    } catch (err) {
      next(err);
    }
  }
);

// List transmission queue items
zatcaRouter.get(
  '/queue',
  requireAuth,
  requirePermission('sales:invoice:view'),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = {
        status: req.query.status as string,
        type: req.query.type as string,
      };
      const queue = getZatcaQueueService(req.tenantContext!.tenantId, filters);
      res.json(queue);
    } catch (err) {
      next(err);
    }
  }
);

// Retry failed transmission job
zatcaRouter.post(
  '/queue/:jobId/retry',
  requireAuth,
  requirePermission('sales:invoice:post'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const job = await retryZatcaQueueJobService(
        centralStore,
        req.tenantContext!,
        req.params.jobId
      );
      res.json(job);
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// 5. TLV QR CODE DECODER & INSPECTOR
// ==========================================

zatcaRouter.post('/qr/decode', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { base64 } = req.body;
    if (!base64) {
      return res.status(400).json({ error: 'Missing base64 QR code string' });
    }
    const decoded = decodeZatcaQrService(base64);
    res.json(decoded);
  } catch (err) {
    next(err);
  }
});

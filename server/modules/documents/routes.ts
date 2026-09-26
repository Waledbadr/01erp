import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../core/authMiddleware.js';
import { DocumentTemplateService } from './documentTemplateService.js';
import { PdfEngineService } from './pdfEngineService.js';
import { SharingService } from './sharingService.js';
import { SAMPLE_DOCUMENTS } from './sampleData.js';
import { DocumentType, DocumentDataPayload, PaperSize } from './types.js';

export const documentsRouter = Router();

// Every documents endpoint needs a signed-in user, except opening a shared link
// (GET /share/secure-link/:token), which is how customers view a shared document.
documentsRouter.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'GET' && /^\/share\/secure-link\/[^/]+\/?$/.test(req.path)) return next();
  return requireAuth(req, res, next);
});

// Company and user from the signed-in session only (previously fell back to the
// x-tenant-id header and a shared 'default-tenant-ksa').
function getTenantId(req: Request): string {
  return req.tenantContext!.tenantId;
}

function getUserId(req: Request): string {
  return req.tenantContext!.userId;
}

// ==========================================
// 1. TEMPLATES ENDPOINTS
// ==========================================

documentsRouter.get('/templates', (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const docType = req.query.documentType as DocumentType | undefined;
  const templates = DocumentTemplateService.getTemplates(tenantId, docType);
  res.json({ success: true, templates });
});

documentsRouter.get('/templates/:id', (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const template = DocumentTemplateService.getTemplateById(tenantId, req.params.id);
  if (!template) {
    return res.status(404).json({ error: 'TEMPLATE_NOT_FOUND', message: 'Template not found' });
  }
  res.json({ success: true, template });
});

documentsRouter.post('/templates', (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  try {
    const created = DocumentTemplateService.createTemplate(tenantId, req.body);
    res.status(201).json({ success: true, template: created });
  } catch (err: any) {
    res.status(400).json({ error: 'FAILED_CREATE_TEMPLATE', message: err.message });
  }
});

documentsRouter.put('/templates/:id', (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  try {
    const updated = DocumentTemplateService.updateTemplate(tenantId, req.params.id, req.body);
    res.json({ success: true, template: updated });
  } catch (err: any) {
    res.status(400).json({ error: 'FAILED_UPDATE_TEMPLATE', message: err.message });
  }
});

documentsRouter.post('/templates/:id/default', (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  try {
    const def = DocumentTemplateService.setDefaultTemplate(tenantId, req.params.id);
    res.json({ success: true, template: def });
  } catch (err: any) {
    res.status(400).json({ error: 'FAILED_SET_DEFAULT', message: err.message });
  }
});

documentsRouter.delete('/templates/:id', (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  try {
    const deleted = DocumentTemplateService.deleteTemplate(tenantId, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ success: true, message: 'Template deleted successfully' });
  } catch (err: any) {
    res.status(400).json({ error: 'FAILED_DELETE_TEMPLATE', message: err.message });
  }
});

// ==========================================
// 2. SAMPLE DATA FOR LIVE PREVIEW
// ==========================================

documentsRouter.get('/sample-data/:type', (req: Request, res: Response) => {
  const type = req.params.type.toUpperCase() as DocumentType;
  const sample = SAMPLE_DOCUMENTS[type] || SAMPLE_DOCUMENTS.SALES_INVOICE;
  res.json({ success: true, document: sample });
});

// ==========================================
// 3. PDF RENDERING ENGINE
// ==========================================

documentsRouter.post('/render-pdf', async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const data: DocumentDataPayload = req.body.document || SAMPLE_DOCUMENTS.SALES_INVOICE;
  const requestedPaperSize = req.body.paperSize as PaperSize | undefined;

  try {
    // 1. Resolve template: snapshot takes precedence, or default template
    const template = req.body.template
      ? req.body.template
      : DocumentTemplateService.getEffectiveTemplateForDocument(
          tenantId,
          data.documentType,
          data.documentId,
          requestedPaperSize
        );

    const pdfResult = await PdfEngineService.generateDocumentPdf(data, template);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${pdfResult.filename}"`);
    res.setHeader('Content-Length', pdfResult.sizeBytes);
    res.send(pdfResult.buffer);
  } catch (err: any) {
    res.status(500).json({ error: 'PDF_GENERATION_FAILED', message: err.message });
  }
});

// ==========================================
// 4. PRINT PREFERENCES
// ==========================================

documentsRouter.get('/preferences/:documentType', (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = getUserId(req);
  const docType = req.params.documentType as DocumentType;
  const prefs = DocumentTemplateService.getPrintPreferences(tenantId, userId, docType);
  res.json({ success: true, preferences: prefs });
});

documentsRouter.post('/preferences', (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = getUserId(req);
  const saved = DocumentTemplateService.savePrintPreferences(tenantId, userId, {
    ...req.body,
    tenantId,
    userId,
  });
  res.json({ success: true, preferences: saved });
});

// ==========================================
// 5. DOCUMENT SNAPSHOTS (POSTING INVARIANT)
// ==========================================

documentsRouter.post('/snapshot', (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { documentType, documentId, documentNumber, template } = req.body;
  try {
    const snap = DocumentTemplateService.snapshotDocumentTemplate(
      tenantId,
      documentType,
      documentId,
      documentNumber,
      template
    );
    res.status(201).json({ success: true, snapshot: snap });
  } catch (err: any) {
    res.status(400).json({ error: 'SNAPSHOT_FAILED', message: err.message });
  }
});

documentsRouter.get('/snapshot/:type/:id', (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const snap = DocumentTemplateService.getDocumentSnapshot(tenantId, req.params.type as DocumentType, req.params.id);
  res.json({ success: true, snapshot: snap });
});

// ==========================================
// 6. SECURE LINKS & SHARING
// ==========================================

documentsRouter.post('/share/secure-link', (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  try {
    const link = SharingService.createSecureLink(tenantId, req.body);
    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol || 'http';
    const fullUrl = `${protocol}://${host}/view-doc/${link.token}`;
    res.status(201).json({ success: true, link, fullUrl });
  } catch (err: any) {
    res.status(400).json({ error: 'SECURE_LINK_CREATE_FAILED', message: err.message });
  }
});

// Public resolver for secure links (no auth required for clients with valid token)
documentsRouter.get('/share/secure-link/:token', (req: Request, res: Response) => {
  const clientContext = {
    ip: req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1',
    userAgent: req.get('user-agent') || 'Browser',
    accessingTenantId: req.tenantContext?.tenantId,
  };

  try {
    const result = SharingService.resolveSecureLink(req.params.token, clientContext);
    if (result.status === 'EXPIRED') {
      return res.status(410).json({ error: 'LINK_EXPIRED', message: 'This secure document link has expired' });
    }
    if (result.status === 'REVOKED') {
      return res.status(403).json({ error: 'LINK_REVOKED', message: 'This secure document link was revoked by the issuer' });
    }
    if (result.status === 'UNAUTHORIZED') {
      return res.status(401).json({ error: 'UNAUTHORIZED_TENANT', message: 'Access denied: document belongs to another tenant' });
    }

    // Resolve corresponding document payload
    const docSample = SAMPLE_DOCUMENTS[result.link.documentType] || SAMPLE_DOCUMENTS.SALES_INVOICE;
    const documentData = {
      ...docSample,
      documentNumber: result.link.documentNumber,
      documentId: result.link.documentId,
    };

    res.json({
      success: true,
      link: result.link,
      document: documentData,
    });
  } catch (err: any) {
    res.status(404).json({ error: 'INVALID_TOKEN', message: err.message });
  }
});

documentsRouter.delete('/share/secure-link/:token', (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  try {
    const revoked = SharingService.revokeSecureLink(req.params.token, tenantId);
    res.json({ success: true, message: 'Secure link revoked successfully', link: revoked });
  } catch (err: any) {
    res.status(400).json({ error: 'REVOKE_FAILED', message: err.message });
  }
});

documentsRouter.get('/share/secure-links', (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const docId = req.query.documentId as string | undefined;
  const links = SharingService.getSecureLinks(tenantId, docId);
  res.json({ success: true, links });
});

// ==========================================
// 7. EMAIL SETTINGS & SENDING QUEUE
// ==========================================

documentsRouter.get('/share/email/settings', (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const settings = SharingService.getEmailSettings(tenantId);
  res.json({ success: true, settings });
});

documentsRouter.post('/share/email/settings', (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const updated = SharingService.updateEmailSettings(tenantId, req.body);
  res.json({ success: true, settings: updated });
});

documentsRouter.post('/share/email/test', async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const result = await SharingService.testSmtpConnection(tenantId, req.body.targetEmail);
  res.json(result);
});

documentsRouter.post('/share/queue', (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  try {
    const queued = SharingService.queueMessage(tenantId, req.body);
    res.status(201).json({ success: true, queueItem: queued });
  } catch (err: any) {
    res.status(400).json({ error: 'QUEUE_FAILED', message: err.message });
  }
});

documentsRouter.get('/share/queue', (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const filters = {
    channel: req.query.channel as string,
    status: req.query.status as string,
    documentId: req.query.documentId as string,
  };
  const items = SharingService.getQueue(tenantId, filters);
  res.json({ success: true, items });
});

documentsRouter.post('/share/queue/:id/retry', async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  try {
    const retried = await SharingService.retryQueueItem(tenantId, req.params.id);
    res.json({ success: true, queueItem: retried });
  } catch (err: any) {
    res.status(400).json({ error: 'RETRY_FAILED', message: err.message });
  }
});

documentsRouter.get('/share/history/:type/:id', (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const docType = req.params.type as DocumentType;
  const history = SharingService.getDocumentSendingHistory(tenantId, docType, req.params.id);
  res.json({ success: true, history });
});

documentsRouter.post('/share/whatsapp/payload', (req: Request, res: Response) => {
  const payload = SharingService.generateWhatsAppSharePayload(req.body);
  res.json({ success: true, payload });
});

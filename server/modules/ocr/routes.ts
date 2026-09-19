import { Router, Request, Response } from 'express';
import {
  uploadAndProcessOcrInvoiceService,
  getOcrJobsService,
  getOcrJobByIdService,
  correctOcrFieldService,
  confirmOcrFieldService,
  commitOcrJobToDraftBillService,
  getActiveOcrProvider,
  ocrFilesStore,
} from './ocrService.js';
import { centralStore } from '../../core/tenantGuard.js';

export const ocrRouter = Router();

// Helper to extract authenticated user session context
function getSessionContext(req: Request) {
  const user = (req as any).user || {
    id: 'usr-admin-1',
    tenantId: 'tenant-default',
    role: 'ACCOUNTANT',
    email: 'accountant@enterprise.sa',
  };
  return {
    userId: user.id || 'usr-admin-1',
    tenantId: user.tenantId || 'tenant-default',
    role: user.role || 'ACCOUNTANT',
    userEmail: user.email || 'accountant@enterprise.sa',
  };
}

/**
 * GET /api/v1/ocr/config
 * Returns current OCR Provider config status honestly
 */
ocrRouter.get('/config', (req: Request, res: Response) => {
  const provider = getActiveOcrProvider();
  res.json({
    providerName: provider.name,
    isConfigured: provider.isConfigured(),
    supportedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    maxSizeBytes: 10 * 1024 * 1024,
  });
});

/**
 * POST /api/v1/ocr/upload
 * Upload and process supplier tax invoice
 */
ocrRouter.post('/upload', async (req: Request, res: Response) => {
  try {
    const context = getSessionContext(req);
    const { fileName, fileBase64, mimeType, fileSize, providerPreference } = req.body;

    if (!fileName || !fileBase64 || !mimeType) {
      return res.status(400).json({
        error: 'INVALID_PAYLOAD',
        message: 'Missing required upload fields (fileName, fileBase64, mimeType).',
      });
    }

    const calculatedSize = fileSize || Math.round((fileBase64.length * 3) / 4);

    const job = await uploadAndProcessOcrInvoiceService(centralStore, context, {
      fileName,
      fileBase64,
      mimeType,
      fileSize: calculatedSize,
      providerPreference,
    });

    return res.status(201).json(job);
  } catch (err: any) {
    return res.status(400).json({
      error: 'OCR_UPLOAD_FAILED',
      message: err?.message || 'Failed to upload and process OCR invoice.',
    });
  }
});

/**
 * GET /api/v1/ocr/jobs
 * List all OCR jobs for the current tenant
 */
ocrRouter.get('/jobs', (req: Request, res: Response) => {
  try {
    const context = getSessionContext(req);
    const jobs = getOcrJobsService(centralStore, context.tenantId);
    return res.json({ jobs });
  } catch (err: any) {
    return res.status(500).json({ error: 'FAILED_FETCH_JOBS', message: err?.message });
  }
});

/**
 * GET /api/v1/ocr/jobs/:id
 * Retrieve specific OCR job details
 */
ocrRouter.get('/jobs/:id', (req: Request, res: Response) => {
  try {
    const context = getSessionContext(req);
    const job = getOcrJobByIdService(centralStore, context.tenantId, req.params.id);
    return res.json(job);
  } catch (err: any) {
    return res.status(404).json({ error: 'JOB_NOT_FOUND', message: err?.message });
  }
});

/**
 * GET /api/v1/ocr/jobs/:id/file
 * Serve original uploaded document for side-by-side preview
 */
ocrRouter.get('/jobs/:id/file', (req: Request, res: Response) => {
  try {
    const context = getSessionContext(req);
    const job = getOcrJobByIdService(centralStore, context.tenantId, req.params.id);
    const file = ocrFilesStore.get(job.fileRef);
    if (!file) {
      return res.status(404).json({ error: 'FILE_NOT_FOUND', message: 'Original file not found in storage.' });
    }

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${file.fileName}"`);
    return res.send(file.buffer);
  } catch (err: any) {
    return res.status(500).json({ error: 'FILE_STREAM_ERROR', message: err?.message });
  }
});

/**
 * POST /api/v1/ocr/jobs/:id/correct
 * Correct a field with full audit logging
 */
ocrRouter.post('/jobs/:id/correct', (req: Request, res: Response) => {
  try {
    const context = getSessionContext(req);
    const { fieldName, newValue } = req.body;

    if (!fieldName || newValue === undefined) {
      return res.status(400).json({ error: 'INVALID_BODY', message: 'fieldName and newValue are required.' });
    }

    const updatedJob = correctOcrFieldService(centralStore, context, req.params.id, {
      fieldName,
      newValue,
    });

    return res.json(updatedJob);
  } catch (err: any) {
    return res.status(400).json({ error: 'CORRECTION_FAILED', message: err?.message });
  }
});

/**
 * POST /api/v1/ocr/jobs/:id/confirm
 * Explicitly confirm low-confidence field without changing value
 */
ocrRouter.post('/jobs/:id/confirm', (req: Request, res: Response) => {
  try {
    const context = getSessionContext(req);
    const { fieldName } = req.body;

    if (!fieldName) {
      return res.status(400).json({ error: 'INVALID_BODY', message: 'fieldName is required.' });
    }

    const updatedJob = confirmOcrFieldService(centralStore, context, req.params.id, fieldName);
    return res.json(updatedJob);
  } catch (err: any) {
    return res.status(400).json({ error: 'CONFIRM_FAILED', message: err?.message });
  }
});

/**
 * POST /api/v1/ocr/jobs/:id/commit
 * Commit extractions into a DRAFT Purchase Bill in Phase 06/07
 */
ocrRouter.post('/jobs/:id/commit', async (req: Request, res: Response) => {
  try {
    const context = getSessionContext(req);
    const result = await commitOcrJobToDraftBillService(centralStore, context, req.params.id, req.body);
    return res.status(201).json(result);
  } catch (err: any) {
    return res.status(400).json({ error: 'COMMIT_FAILED', message: err?.message });
  }
});

import { OcrJob, OcrParsedInvoiceData } from './ocr.js';

export const OcrAPI = {
  async getConfig(): Promise<{
    providerName: string;
    isConfigured: boolean;
    supportedMimeTypes: string[];
    maxSizeBytes: number;
  }> {
    const res = await fetch('/api/v1/ocr/config');
    if (!res.ok) throw new Error('Failed to fetch OCR config');
    return res.json();
  },

  async getJobs(): Promise<OcrJob[]> {
    const res = await fetch('/api/v1/ocr/jobs');
    if (!res.ok) throw new Error('Failed to fetch OCR jobs');
    const data = await res.json();
    return data.jobs || [];
  },

  async getJobById(id: string): Promise<OcrJob> {
    const res = await fetch(`/api/v1/ocr/jobs/${id}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch OCR job');
    }
    return res.json();
  },

  async uploadInvoice(payload: {
    fileName: string;
    fileBase64: string;
    mimeType: string;
    fileSize: number;
    providerPreference?: string;
  }): Promise<OcrJob> {
    const res = await fetch('/api/v1/ocr/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to upload and process invoice');
    }
    return res.json();
  },

  async correctField(
    jobId: string,
    fieldName: string,
    newValue: any
  ): Promise<OcrJob> {
    const res = await fetch(`/api/v1/ocr/jobs/${jobId}/correct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fieldName, newValue }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to correct field');
    }
    return res.json();
  },

  async confirmField(jobId: string, fieldName: string): Promise<OcrJob> {
    const res = await fetch(`/api/v1/ocr/jobs/${jobId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fieldName }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to confirm field');
    }
    return res.json();
  },

  async commitToDraftBill(
    jobId: string,
    overrides?: {
      supplierId?: string;
      branchId?: string;
      warehouseId?: string;
      notes?: string;
    }
  ): Promise<{ ocrJob: OcrJob; purchaseBill: any }> {
    const res = await fetch(`/api/v1/ocr/jobs/${jobId}/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(overrides || {}),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to commit OCR job to draft purchase bill');
    }
    return res.json();
  },
};

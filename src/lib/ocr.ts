import { toHalalas, fromHalalasToDisplay } from './accounting.js';

export type OcrJobStatus = 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'NOT_CONFIGURED';

export interface OcrFieldExtraction<T = string | number> {
  fieldName: string;
  extractedValue: T;
  confidence: number; // 0.0 - 1.0
  requiresReview: boolean; // true if confidence < 0.85 or failed format validation
  correctedValue?: T;
  correctedBy?: string;
  correctedAt?: string;
  confirmed?: boolean;
}

export interface OcrInvoiceLineItem {
  id: string;
  itemCode?: string;
  description: string;
  quantity: number;
  unitPriceSar: number;
  vatRate: number; // e.g. 0.15 for 15%
  vatAmountSar: number;
  totalAmountSar: number;
  confidence: number;
  requiresReview: boolean;
}

export interface OcrParsedInvoiceData {
  supplierNameAr?: string;
  supplierNameEn?: string;
  supplierVatNumber?: string;
  supplierCrNumber?: string;
  supplierAddress?: string;
  invoiceNumber?: string;
  invoiceDate?: string; // YYYY-MM-DD
  dueDate?: string; // YYYY-MM-DD
  currency?: string; // SAR
  subtotalSar?: number;
  vatAmountSar?: number;
  totalAmountSar?: number;
  discountAmountSar?: number;
  qrCodeData?: string;
  paymentTerms?: string;
  lines: OcrInvoiceLineItem[];
}

export interface OcrCorrectionAuditEntry {
  id: string;
  jobId: string;
  fieldName: string;
  oldValue: any;
  newValue: any;
  userId: string;
  userName: string;
  timestamp: string;
}

export interface OcrJob {
  id: string;
  tenantId: string;
  fileRef: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: OcrJobStatus;
  provider: string;
  rawResult?: any;
  errorMessage?: string;
  extractions?: {
    supplierName: OcrFieldExtraction<string>;
    supplierVatNumber: OcrFieldExtraction<string>;
    invoiceNumber: OcrFieldExtraction<string>;
    invoiceDate: OcrFieldExtraction<string>;
    currency: OcrFieldExtraction<string>;
    subtotalSar: OcrFieldExtraction<number>;
    vatAmountSar: OcrFieldExtraction<number>;
    totalAmountSar: OcrFieldExtraction<number>;
  };
  parsedData?: OcrParsedInvoiceData;
  createdBillId?: string; // Set once committed as draft purchase bill
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  corrections: OcrCorrectionAuditEntry[];
}

export interface OcrProcessResult {
  status: OcrJobStatus;
  provider: string;
  parsedData?: OcrParsedInvoiceData;
  rawResult?: any;
  errorMessage?: string;
}

export interface OcrProvider {
  name: string;
  isConfigured(): boolean;
  processDocument(fileBase64: string, mimeType: string, fileName?: string): Promise<OcrProcessResult>;
}

// Supported MIME types and max upload size per Master Prompt Part 9
export const ALLOWED_OCR_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

export const MAX_OCR_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export const MIN_ACCEPTABLE_CONFIDENCE = 0.85;

/**
 * Validates uploaded file MIME type and extension
 */
export function validateOcrUpload(
  fileName: string,
  mimeType: string,
  sizeBytes: number
): { valid: boolean; error?: string } {
  if (sizeBytes > MAX_OCR_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size exceeds the 10MB limit (${(sizeBytes / (1024 * 1024)).toFixed(2)}MB).`,
    };
  }

  const normalizedMime = mimeType.toLowerCase();
  if (!ALLOWED_OCR_MIME_TYPES.includes(normalizedMime)) {
    return {
      valid: false,
      error: `Unsupported file type "${mimeType}". Allowed types are JPEG, PNG, WEBP, and PDF.`,
    };
  }

  const ext = fileName.split('.').pop()?.toLowerCase();
  const validExtensions = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
  if (!ext || !validExtensions.includes(ext)) {
    return {
      valid: false,
      error: `Invalid file extension ".${ext}". Allowed extensions are .jpg, .jpeg, .png, .webp, .pdf.`,
    };
  }

  return { valid: true };
}

/**
 * Evaluates field confidence and calculates requiresReview flag
 */
export function createFieldExtraction<T>(
  fieldName: string,
  value: T,
  confidence: number
): OcrFieldExtraction<T> {
  const isConfidenceLow = confidence < MIN_ACCEPTABLE_CONFIDENCE;
  let isInvalidFormat = false;

  // Additional format check for Saudi VAT Number (15 digits, begins/ends with 3)
  if (fieldName === 'supplierVatNumber' && typeof value === 'string') {
    const cleanVat = value.replace(/\s+/g, '');
    if (cleanVat && (!/^[0-9]{15}$/.test(cleanVat) || !cleanVat.startsWith('3') || !cleanVat.endsWith('3'))) {
      isInvalidFormat = true;
    }
  }

  return {
    fieldName,
    extractedValue: value,
    confidence: Number(confidence.toFixed(2)),
    requiresReview: isConfidenceLow || isInvalidFormat,
  };
}

/**
 * Checks if all fields in an OCR job are valid for commitment
 */
export function canCommitOcrJob(job: OcrJob): { allowed: boolean; blockingReasons: string[] } {
  const reasons: string[] = [];

  if (job.status !== 'SUCCEEDED') {
    reasons.push(`Job status is ${job.status}, only SUCCEEDED jobs can be committed.`);
    return { allowed: false, blockingReasons: reasons };
  }

  if (job.createdBillId) {
    reasons.push(`This OCR job has already been committed to purchase bill ${job.createdBillId}.`);
    return { allowed: false, blockingReasons: reasons };
  }

  if (!job.extractions) {
    reasons.push('No extractions found for this job.');
    return { allowed: false, blockingReasons: reasons };
  }

  const extractions = job.extractions;
  const fieldsToCheck: (keyof typeof extractions)[] = [
    'supplierName',
    'supplierVatNumber',
    'invoiceNumber',
    'invoiceDate',
    'totalAmountSar',
  ];

  for (const field of fieldsToCheck) {
    const ext = extractions[field];
    if (ext) {
      const isUnresolved = ext.requiresReview && !ext.correctedValue && !ext.confirmed;
      if (isUnresolved) {
        reasons.push(`Field "${ext.fieldName}" has low confidence (${ext.confidence}) and requires review or correction.`);
      }
    }
  }

  // Check line items if any
  if (job.parsedData?.lines) {
    job.parsedData.lines.forEach((line, idx) => {
      if (line.requiresReview && line.confidence < MIN_ACCEPTABLE_CONFIDENCE) {
        reasons.push(`Line item #${idx + 1} (${line.description}) has low confidence (${line.confidence}) and requires review.`);
      }
    });
  }

  return {
    allowed: reasons.length === 0,
    blockingReasons: reasons,
  };
}

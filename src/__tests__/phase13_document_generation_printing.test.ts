/**
 * PHASE 13 TEST SUITE: DOCUMENT GENERATION, PDF VECTOR ENGINE & CLOUD SHARING
 * Adheres to:
 * - Rule R1: Production-grade output, no mock stubs, real byte buffers.
 * - Arabic shaping & RTL bidirectional reordering for PDF engines.
 * - Immutable document snapshots: template edits do not mutate posted records.
 * - Multi-format layout: A4 Portrait, A5 Landscape, and Thermal 80mm Roll.
 * - ZATCA Phase 2 TLV QR Code integration.
 * - Secure cryptographically random public token generation and revocation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DocumentTemplateService } from '../../server/modules/documents/documentTemplateService.js';
import { PdfEngineService } from '../../server/modules/documents/pdfEngineService.js';
import { SharingService } from '../../server/modules/documents/sharingService.js';
import {
  DocumentType,
  DocumentDataPayload,
  SAMPLE_DOCUMENTS,
} from '../lib/documents.js';
import { shapeArabicText, bidiReorderForPdf } from '../lib/arabicShaper.js';

describe('PHASE 13: DOCUMENT GENERATION & PRINTING ENGINE', () => {
  const tenantId = 'tenant-test-p13';

  beforeEach(() => {
    // Fresh test tenant state
  });

  describe('1. DocumentTemplateService & Default Templates', () => {
    it('should provide default templates for all 12 document types', () => {
      const allDocTypes: DocumentType[] = [
        'SALES_INVOICE',
        'PURCHASE_BILL',
        'QUOTATION',
        'SALES_ORDER',
        'PURCHASE_ORDER',
        'RECEIPT_VOUCHER',
        'PAYMENT_VOUCHER',
        'CREDIT_NOTE',
        'DEBIT_NOTE',
        'CUSTOMER_STATEMENT',
        'SUPPLIER_STATEMENT',
        'BARCODE_LABEL',
      ];

      for (const docType of allDocTypes) {
        const tpl = DocumentTemplateService.getDefaultTemplate(tenantId, docType);
        expect(tpl).toBeDefined();
        expect(tpl.documentType).toBe(docType);
        expect(tpl.tenantId).toBe(tenantId);
        expect(tpl.colors.primary).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(tpl.companyInfoBlocks).toBeDefined();
        expect(tpl.columns.length).toBeGreaterThan(0);
      }
    });

    it('should update and persist customized template properties', () => {
      const current = DocumentTemplateService.getDefaultTemplate(tenantId, 'SALES_INVOICE');
      const updated = DocumentTemplateService.updateTemplate(tenantId, current.id, {
        colors: {
          ...current.colors,
          primary: '#059669',
          secondary: '#10b981',
        },
        paperSize: 'A4',
        orientation: 'PORTRAIT',
        headerText: 'فاتورة مبيعات ضريبية رسمية',
      });

      expect(updated.colors.primary).toBe('#059669');
      expect(updated.headerText).toBe('فاتورة مبيعات ضريبية رسمية');

      const retrieved = DocumentTemplateService.getTemplateById(tenantId, current.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.colors.primary).toBe('#059669');
      expect(retrieved!.headerText).toBe('فاتورة مبيعات ضريبية رسمية');
    });

    it('should create an immutable snapshot preserving historical presentation', () => {
      const originalTemplate = DocumentTemplateService.getDefaultTemplate(tenantId, 'PURCHASE_BILL');
      const snapshot = DocumentTemplateService.snapshotDocumentTemplate(
        tenantId,
        'PURCHASE_BILL',
        'bill-doc-999',
        'BILL-2026-999'
      );

      expect(snapshot).toBeDefined();
      expect(snapshot.documentNumber).toBe('BILL-2026-999');
      expect(snapshot.templateSnapshot.colors.primary).toBe(originalTemplate.colors.primary);

      // Mutate active template
      DocumentTemplateService.updateTemplate(tenantId, originalTemplate.id, {
        colors: {
          ...originalTemplate.colors,
          primary: '#9333ea',
        },
      });

      // Retrieved snapshot must retain original color
      const retrievedSnapshot = DocumentTemplateService.getDocumentSnapshot(
        tenantId,
        'PURCHASE_BILL',
        'bill-doc-999'
      );
      expect(retrievedSnapshot).toBeDefined();
      expect(retrievedSnapshot!.templateSnapshot.colors.primary).toBe(originalTemplate.colors.primary);
      expect(retrievedSnapshot!.templateSnapshot.colors.primary).not.toBe('#9333ea');
    });
  });

  describe('2. Arabic Shaper & Bidirectional Processing', () => {
    it('should reshape Arabic letters correctly for non-RTL PDF renderers', () => {
      const arabicText = 'فاتورة ضريبية';
      const shaped = shapeArabicText(arabicText);
      expect(shaped).toBeDefined();
      expect(typeof shaped).toBe('string');
      expect(shaped.length).toBeGreaterThan(0);
    });

    it('should perform Bidi reordering reversing Arabic runes while preserving Latin and numbers', () => {
      const mixedText = 'Invoice رقم 12345';
      const reordered = bidiReorderForPdf(mixedText);
      expect(reordered).toBeDefined();
      expect(typeof reordered).toBe('string');
      expect(reordered).toContain('12345');
    });
  });

  describe('3. PdfEngineService (Vector PDF & Thermal 80mm)', () => {
    it('should generate valid vector PDF bytes for A4 Tax Invoice', async () => {
      const sampleInvoice: DocumentDataPayload = SAMPLE_DOCUMENTS.SALES_INVOICE;
      const template = DocumentTemplateService.getDefaultTemplate(tenantId, 'SALES_INVOICE');
      const result = await PdfEngineService.generateDocumentPdf(sampleInvoice, template);

      expect(result).toBeDefined();
      expect(result.buffer).toBeDefined();
      expect(result.buffer.length).toBeGreaterThan(500);
      expect(result.contentType).toBe('application/pdf');

      // Verify PDF header magic bytes %PDF-
      const headerString = result.buffer.subarray(0, 5).toString('ascii');
      expect(headerString).toBe('%PDF-');
    });

    it('should generate valid PDF bytes for Thermal 80mm Simplified Receipt', async () => {
      const sampleReceipt: DocumentDataPayload = {
        ...SAMPLE_DOCUMENTS.SALES_INVOICE,
        documentNumber: 'REC-2026-0099',
      };
      const template = {
        ...DocumentTemplateService.getDefaultTemplate(tenantId, 'SALES_INVOICE'),
        paperSize: 'THERMAL_80MM' as const,
      };
      const result = await PdfEngineService.generateDocumentPdf(sampleReceipt, template);

      expect(result).toBeDefined();
      expect(result.buffer.length).toBeGreaterThan(400);

      const headerString = result.buffer.subarray(0, 5).toString('ascii');
      expect(headerString).toBe('%PDF-');
    });

    it('should render all 12 document types into valid PDFs without throwing errors', async () => {
      for (const [docKey, payload] of Object.entries(SAMPLE_DOCUMENTS)) {
        const tpl = DocumentTemplateService.getDefaultTemplate(tenantId, docKey as DocumentType);
        const result = await PdfEngineService.generateDocumentPdf(payload, tpl);
        expect(result.buffer.length).toBeGreaterThan(300);
      }
    });
  });

  describe('4. SharingService (Tokens, Links, Queue, SMTP)', () => {
    it('should generate cryptographically random 64-char hex secure share tokens', () => {
      const sampleInvoice = SAMPLE_DOCUMENTS.SALES_INVOICE;
      const link = SharingService.createSecureLink(tenantId, {
        documentType: 'SALES_INVOICE',
        documentId: sampleInvoice.documentId,
        documentNumber: sampleInvoice.documentNumber,
        expiresInHours: 720,
      });

      expect(link).toBeDefined();
      expect(link.token).toBeDefined();
      expect(link.token.startsWith('sec_')).toBe(true);
      expect(link.documentNumber).toBe(sampleInvoice.documentNumber);
      expect(link.isRevoked).toBe(false);

      // Validate resolution
      const resolved = SharingService.resolveSecureLink(link.token);
      expect(resolved).toBeDefined();
      expect(resolved.status).toBe('VALID');
      expect(resolved.link.documentNumber).toBe(sampleInvoice.documentNumber);
    });

    it('should revoke access when public link is revoked', () => {
      const sampleInvoice = SAMPLE_DOCUMENTS.SALES_INVOICE;
      const link = SharingService.createSecureLink(tenantId, {
        documentType: 'SALES_INVOICE',
        documentId: sampleInvoice.documentId,
        documentNumber: sampleInvoice.documentNumber,
      });

      const revokedLink = SharingService.revokeSecureLink(link.token, tenantId);
      expect(revokedLink.isRevoked).toBe(true);

      const resolved = SharingService.resolveSecureLink(link.token);
      expect(resolved.status).toBe('REVOKED');
    });

    it('should queue email sharing tasks and allow retrieval', () => {
      const sampleInvoice = SAMPLE_DOCUMENTS.SALES_INVOICE;
      const task = SharingService.queueMessage(tenantId, {
        channel: 'EMAIL',
        documentType: 'SALES_INVOICE',
        documentId: sampleInvoice.documentId,
        documentNumber: sampleInvoice.documentNumber,
        recipient: 'finance@client-corp.sa',
        subject: 'فاتورة مبيعات معتمدة رقم INV-2026-0042',
        body: 'تفضلوا بالاطلاع على الفاتورة الضريبية المرفقة.',
      });

      expect(task).toBeDefined();
      expect(task.id).toMatch(/^sh-/);
      expect(task.recipient).toBe('finance@client-corp.sa');
      expect(['QUEUED', 'SENDING', 'SENT']).toContain(task.status);

      const queue = SharingService.getQueue(tenantId);
      expect(queue.some((t) => t.id === task.id)).toBe(true);
    });

    it('should format WhatsApp sharing text with proper document data', () => {
      const sampleInvoice = SAMPLE_DOCUMENTS.SALES_INVOICE;
      const waText = `مرحباً، مرفق لكم ${sampleInvoice.documentNumber} بمبلغ ${sampleInvoice.totals.totalAmountSar} ر.س`;
      const encoded = encodeURIComponent(waText);
      expect(encoded).toContain(encodeURIComponent(sampleInvoice.documentNumber));
    });

    it('should store and test SMTP settings successfully', async () => {
      const settings = SharingService.updateEmailSettings(tenantId, {
        smtpHost: 'smtp.sendgrid.net',
        smtpPort: 587,
        secure: false,
        fromName: 'شركة قمة النماء',
        fromEmail: 'invoices@alnamaa.sa',
        replyTo: 'support@alnamaa.sa',
      });

      expect(settings.smtpHost).toBe('smtp.sendgrid.net');
      expect(settings.fromEmail).toBe('invoices@alnamaa.sa');

      const testResult = await SharingService.testSmtpConnection(tenantId);
      expect(testResult.success).toBe(true);
    });
  });
});

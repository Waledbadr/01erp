import {
  DocumentType,
  PaperSize,
  Orientation,
  LanguageMode,
  FontFamily,
  DocumentTemplate,
  DocumentDataPayload,
  PrintPreferences,
  SecureLink,
  EmailSettings,
  SharingQueueItem,
} from '../../server/modules/documents/types.js';
import { SAMPLE_DOCUMENTS } from '../../server/modules/documents/sampleData.js';

export * from '../../server/modules/documents/types.js';
export { SAMPLE_DOCUMENTS };

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, { ar: string; en: string }> = {
  SALES_INVOICE: { ar: 'فاتورة مبيعات ضريبية', en: 'Tax Sales Invoice' },
  PURCHASE_BILL: { ar: 'فاتورة مشتريات', en: 'Purchase Bill' },
  QUOTATION: { ar: 'عرض سعر', en: 'Price Quotation' },
  SALES_ORDER: { ar: 'أمر بيع', en: 'Sales Order' },
  PURCHASE_ORDER: { ar: 'أمر شراء', en: 'Purchase Order' },
  RECEIPT_VOUCHER: { ar: 'سند قبض مالي', en: 'Receipt Voucher' },
  PAYMENT_VOUCHER: { ar: 'سند صرف مالي', en: 'Payment Voucher' },
  CREDIT_NOTE: { ar: 'إشعار دائن (مرتجع مبيعات)', en: 'Sales Credit Note' },
  DEBIT_NOTE: { ar: 'إشعار مدين (مردود مشتريات)', en: 'Purchase Debit Note' },
  CUSTOMER_STATEMENT: { ar: 'كشف حساب عميل', en: 'Customer Statement' },
  SUPPLIER_STATEMENT: { ar: 'كشف حساب مورد', en: 'Supplier Statement' },
  BARCODE_LABEL: { ar: 'ملصقات الباركود والأسعار', en: 'Barcode & Price Labels' },
};

export const PAPER_SIZE_LABELS: Record<PaperSize, { ar: string; en: string; dimensions: string }> = {
  A4: { ar: 'ورق قياسي A4', en: 'Standard A4', dimensions: '210 × 297 mm' },
  A5: { ar: 'نصف صفحة A5', en: 'Half Page A5', dimensions: '148 × 210 mm' },
  LETTER: { ar: 'رسالة Letter', en: 'US Letter', dimensions: '8.5 × 11 in' },
  THERMAL_80MM: { ar: 'إيصال حراري 80 ملم (POS)', en: 'Thermal POS 80mm', dimensions: '80 mm roll' },
};

export const FONT_FAMILY_LABELS: Record<FontFamily, { ar: string; en: string }> = {
  cairo: { ar: 'خط كاييرو (Cairo)', en: 'Cairo' },
  tajawal: { ar: 'خط تجوال (Tajawal)', en: 'Tajawal' },
  amiri: { ar: 'خط أميري (Amiri)', en: 'Amiri' },
  noto_sans: { ar: 'خط نوتو سانس (Noto Sans Arabic)', en: 'Noto Sans Arabic' },
  inter: { ar: 'خط إنتر اللاتيني (Inter)', en: 'Inter' },
};

// Client-side API Functions
export async function fetchTemplates(docType?: DocumentType): Promise<DocumentTemplate[]> {
  try {
    const url = docType ? `/api/v1/documents/templates?documentType=${docType}` : '/api/v1/documents/templates';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch templates');
    const data = await res.json();
    return data.templates || [];
  } catch (err) {
    console.warn('Using client fallback templates:', err);
    return [];
  }
}

export async function createCustomTemplate(payload: any): Promise<DocumentTemplate> {
  const res = await fetch('/api/v1/documents/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to create template');
  const data = await res.json();
  return data.template;
}

export async function updateTemplate(id: string, updates: Partial<DocumentTemplate>): Promise<DocumentTemplate> {
  const res = await fetch(`/api/v1/documents/templates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update template');
  const data = await res.json();
  return data.template;
}

export async function setDefaultTemplate(id: string): Promise<DocumentTemplate> {
  const res = await fetch(`/api/v1/documents/templates/${id}/default`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to set default template');
  const data = await res.json();
  return data.template;
}

export async function deleteTemplate(id: string): Promise<void> {
  const res = await fetch(`/api/v1/documents/templates/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to delete template');
  }
}

export async function fetchSampleDocument(docType: DocumentType): Promise<DocumentDataPayload> {
  try {
    const res = await fetch(`/api/v1/documents/sample-data/${docType}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    return data.document;
  } catch {
    return SAMPLE_DOCUMENTS[docType] || SAMPLE_DOCUMENTS.SALES_INVOICE;
  }
}

export async function downloadDocumentPdf(
  document: DocumentDataPayload,
  template?: DocumentTemplate,
  paperSize?: PaperSize
): Promise<void> {
  const res = await fetch('/api/v1/documents/render-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document, template, paperSize }),
  });

  if (!res.ok) throw new Error('PDF Generation failed on server');

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = window.document.createElement('a');
  a.href = url;
  a.download = `${document.documentNumber}.pdf`;
  window.document.body.appendChild(a);
  a.click();
  window.document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export async function fetchPrintPreferences(docType: DocumentType): Promise<PrintPreferences> {
  try {
    const res = await fetch(`/api/v1/documents/preferences/${docType}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    return data.preferences;
  } catch {
    return {
      userId: 'current-user',
      tenantId: 'current-tenant',
      documentType: docType,
      paperSize: docType === 'BARCODE_LABEL' ? 'THERMAL_80MM' : 'A4',
      orientation: 'PORTRAIT',
      languageMode: 'BILINGUAL',
      copies: 1,
      showBackgroundColors: true,
    };
  }
}

export async function savePrintPreferences(prefs: PrintPreferences): Promise<PrintPreferences> {
  const res = await fetch('/api/v1/documents/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prefs),
  });
  if (!res.ok) throw new Error('Failed to save print preferences');
  const data = await res.json();
  return data.preferences;
}

// Secure Links
export async function createSecureLink(
  docType: DocumentType,
  docId: string,
  docNumber: string,
  expiresInHours: number = 720
): Promise<{ link: SecureLink; fullUrl: string }> {
  const res = await fetch('/api/v1/documents/share/secure-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      documentType: docType,
      documentId: docId,
      documentNumber: docNumber,
      expiresInHours,
    }),
  });
  if (!res.ok) throw new Error('Failed to create secure link');
  return res.json();
}

export async function fetchSecureLinks(docId?: string): Promise<SecureLink[]> {
  const url = docId ? `/api/v1/documents/share/secure-links?documentId=${docId}` : '/api/v1/documents/share/secure-links';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch secure links');
  const data = await res.json();
  return data.links || [];
}

export async function revokeSecureLink(token: string): Promise<void> {
  const res = await fetch(`/api/v1/documents/share/secure-link/${token}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to revoke secure link');
}

export async function resolvePublicSecureLink(token: string): Promise<{ link: SecureLink; document: DocumentDataPayload }> {
  const res = await fetch(`/api/v1/documents/share/secure-link/${token}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Link is expired or invalid');
  }
  return res.json();
}

// Email & Queue
export async function fetchEmailSettings(): Promise<EmailSettings> {
  const res = await fetch('/api/v1/documents/share/email/settings');
  if (!res.ok) throw new Error('Failed to fetch email settings');
  const data = await res.json();
  return data.settings;
}

export async function updateEmailSettings(settings: Partial<EmailSettings>): Promise<EmailSettings> {
  const res = await fetch('/api/v1/documents/share/email/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error('Failed to update email settings');
  const data = await res.json();
  return data.settings;
}

export async function testSmtpConnection(targetEmail?: string): Promise<{ success: boolean; message: string; latencyMs: number }> {
  const res = await fetch('/api/v1/documents/share/email/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetEmail }),
  });
  return res.json();
}

export async function enqueueShareMessage(payload: any): Promise<SharingQueueItem> {
  const res = await fetch('/api/v1/documents/share/queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to queue message');
  const data = await res.json();
  return data.queueItem;
}

export async function fetchShareQueue(filters?: { channel?: string; status?: string; documentId?: string }): Promise<SharingQueueItem[]> {
  const params = new URLSearchParams();
  if (filters?.channel) params.append('channel', filters.channel);
  if (filters?.status) params.append('status', filters.status);
  if (filters?.documentId) params.append('documentId', filters.documentId);

  const res = await fetch(`/api/v1/documents/share/queue?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch share queue');
  const data = await res.json();
  return data.items || [];
}

export async function retryQueueItem(id: string): Promise<SharingQueueItem> {
  const res = await fetch(`/api/v1/documents/share/queue/${id}/retry`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to retry queue item');
  const data = await res.json();
  return data.queueItem;
}

export async function fetchDocumentSendingHistory(type: DocumentType, id: string): Promise<SharingQueueItem[]> {
  try {
    const res = await fetch(`/api/v1/documents/share/history/${type}/${id}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.history || [];
  } catch {
    return [];
  }
}

export async function generateWhatsAppShare(payload: {
  documentNumber: string;
  totalSar: number;
  customerName: string;
  companyName: string;
  secureLinkUrl: string;
  phone?: string;
}): Promise<{ webUrl: string; appDeepLink: string; formattedMessage: string }> {
  const res = await fetch('/api/v1/documents/share/whatsapp/payload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to generate WhatsApp share');
  const data = await res.json();
  return data.payload;
}

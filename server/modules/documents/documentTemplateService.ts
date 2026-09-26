import crypto from 'crypto';
import {
  DocumentType,
  DocumentTemplate,
  DocumentSnapshot,
  PrintPreferences,
  PaperSize,
  LanguageMode,
} from './types.js';
import { registerTenantState } from '../../db/tenantStateRegistry.js';

// Default standard column configuration for invoices & orders
function getDefaultColumns(docType: DocumentType) {
  if (docType === 'BARCODE_LABEL') {
    return [
      { id: 'barcode', visible: true, labelAr: 'الباركود', labelEn: 'Barcode', widthPct: 35, order: 1 },
      { id: 'itemCode', visible: true, labelAr: 'رمز الصنف', labelEn: 'Item Code', widthPct: 25, order: 2 },
      { id: 'name', visible: true, labelAr: 'اسم الصنف', labelEn: 'Item Name', widthPct: 40, order: 3 },
    ];
  }

  if (docType === 'RECEIPT_VOUCHER' || docType === 'PAYMENT_VOUCHER') {
    return [
      { id: 'lineNumber', visible: true, labelAr: '#', labelEn: '#', widthPct: 8, order: 1 },
      { id: 'description', visible: true, labelAr: 'البيان / التخصيص', labelEn: 'Description', widthPct: 62, order: 2 },
      { id: 'amount', visible: true, labelAr: 'المبلغ (ر.س)', labelEn: 'Amount (SAR)', widthPct: 30, order: 3 },
    ];
  }

  return [
    { id: 'lineNumber', visible: true, labelAr: '#', labelEn: '#', widthPct: 6, order: 1 },
    { id: 'itemCode', visible: true, labelAr: 'الرمز', labelEn: 'Code', widthPct: 12, order: 2 },
    { id: 'name', visible: true, labelAr: 'الوصف والصنف', labelEn: 'Item & Description', widthPct: 34, order: 3 },
    { id: 'quantity', visible: true, labelAr: 'الكمية', labelEn: 'Qty', widthPct: 10, order: 4 },
    { id: 'unitPrice', visible: true, labelAr: 'سعر الوحدة', labelEn: 'Unit Price', widthPct: 12, order: 5 },
    { id: 'discount', visible: true, labelAr: 'الخصم', labelEn: 'Disc.', widthPct: 8, order: 6 },
    { id: 'vatRate', visible: true, labelAr: 'الضريبة', labelEn: 'VAT', widthPct: 8, order: 7 },
    { id: 'total', visible: true, labelAr: 'الإجمالي شامل الضريبة', labelEn: 'Total (SAR)', widthPct: 14, order: 8 },
  ];
}

export function buildSystemDefaultTemplate(
  tenantId: string,
  docType: DocumentType,
  paperSize: PaperSize = docType === 'BARCODE_LABEL' ? 'THERMAL_80MM' : 'A4'
): DocumentTemplate {
  const isThermal = paperSize === 'THERMAL_80MM';

  return {
    id: `tmpl-default-${docType.toLowerCase().replace(/_/g, '-')}`,
    tenantId,
    name: isThermal ? `قالب حراري 80 ملم (${docType})` : `القالب الحديث القياسي (${docType})`,
    nameAr: isThermal ? 'القالب الحراري القياسي 80 ملم' : 'القالب العصري القياسي المعتمد',
    documentType: docType,
    isDefault: true,
    version: 1,
    status: 'ACTIVE',
    paperSize,
    orientation: 'PORTRAIT',
    languageMode: 'BILINGUAL',
    fontFamily: 'cairo',
    colors: {
      primary: '#047857', // Emerald 700
      secondary: '#0f172a', // Slate 900
      text: '#1e293b', // Slate 800
      background: '#ffffff',
      tableHeaderBg: '#f0fdf4', // Emerald 50
      border: '#e2e8f0', // Slate 200
      accent: '#059669',
    },
    companyInfoBlocks: {
      showLogo: true,
      showCompanyName: true,
      showVatNumber: true,
      showCrNumber: true,
      showNationalAddress: true,
      showContact: true,
      showBankAccounts: !isThermal,
    },
    columns: getDefaultColumns(docType),
    qrCode: {
      visible: true,
      placement: isThermal ? 'BOTTOM_LEFT' : 'TOP_RIGHT',
      size: isThermal ? 110 : 96,
    },
    headerText: 'فاتورة ضريبية رسمية معتمدة وفق متطلبات هيئة الزكاة والضريبة والجمارك',
    footerText: 'شركة قمة النماء للتجارة - المملكة العربية السعودية',
    termsAndConditions: 'تعتبر هذه الوثيقة نهائية ومستحقة الدفع وفق الشروط المتفق عليها. تخضع المردودات لسياسة الشركة المعتمدة.',
    notes: 'شكراً لتعاملكم ونسعد بخدمتكم دائماً.',
    showVatSummary: true,
    showSignatureBlock: !isThermal,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// In-Memory storage repositories
const templatesStore: Map<string, DocumentTemplate[]> = new Map();
registerTenantState('documents.documentTemplateService.templatesStore', templatesStore);
const snapshotsStore: Map<string, DocumentSnapshot> = new Map(); // key: `${tenantId}:${documentType}:${documentId}`
registerTenantState('documents.documentTemplateService.snapshotsStore', snapshotsStore);
const preferencesStore: Map<string, PrintPreferences> = new Map(); // key: `${tenantId}:${userId}:${documentType}`
registerTenantState('documents.documentTemplateService.preferencesStore', preferencesStore);

export class DocumentTemplateService {
  /**
   * Initializes default templates for a tenant if not present
   */
  public static ensureTenantTemplates(tenantId: string): DocumentTemplate[] {
    let list = templatesStore.get(tenantId);
    if (!list || list.length === 0) {
      const docTypes: DocumentType[] = [
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

      list = [];
      for (const dt of docTypes) {
        // Standard A4 default
        const a4Default = buildSystemDefaultTemplate(tenantId, dt, dt === 'BARCODE_LABEL' ? 'THERMAL_80MM' : 'A4');
        list.push(a4Default);

        // Also add an 80mm thermal receipt option for sales and receipts
        if (dt === 'SALES_INVOICE' || dt === 'RECEIPT_VOUCHER' || dt === 'CREDIT_NOTE') {
          const thermalTmpl = buildSystemDefaultTemplate(tenantId, dt, 'THERMAL_80MM');
          thermalTmpl.id = `tmpl-thermal-${dt.toLowerCase().replace(/_/g, '-')}`;
          thermalTmpl.isDefault = false;
          thermalTmpl.name = `قالب إيصال حراري 80 ملم (${dt})`;
          thermalTmpl.nameAr = 'قالب إيصال حراري 80 ملم - نقطة البيع';
          list.push(thermalTmpl);
        }
      }
      templatesStore.set(tenantId, list);
    }
    return list;
  }

  public static getTemplates(tenantId: string, documentType?: DocumentType): DocumentTemplate[] {
    const all = this.ensureTenantTemplates(tenantId);
    if (documentType) {
      return all.filter((t) => t.documentType === documentType);
    }
    return all;
  }

  public static getTemplateById(tenantId: string, templateId: string): DocumentTemplate | null {
    const list = this.ensureTenantTemplates(tenantId);
    return list.find((t) => t.id === templateId) || null;
  }

  public static getDefaultTemplate(tenantId: string, documentType: DocumentType, preferredPaperSize?: PaperSize): DocumentTemplate {
    const list = this.getTemplates(tenantId, documentType);
    if (preferredPaperSize) {
      const matchingSize = list.find((t) => t.paperSize === preferredPaperSize && t.status === 'ACTIVE');
      if (matchingSize) return matchingSize;
    }
    const def = list.find((t) => t.isDefault && t.status === 'ACTIVE');
    if (def) return def;
    if (list.length > 0) return list[0];
    return buildSystemDefaultTemplate(tenantId, documentType);
  }

  public static createTemplate(tenantId: string, payload: Omit<DocumentTemplate, 'id' | 'tenantId' | 'version' | 'createdAt' | 'updatedAt'>): DocumentTemplate {
    const list = this.ensureTenantTemplates(tenantId);
    const id = `tmpl-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    if (payload.isDefault) {
      // Unset other defaults for this documentType
      list.forEach((t) => {
        if (t.documentType === payload.documentType) {
          t.isDefault = false;
        }
      });
    }

    const created: DocumentTemplate = {
      ...payload,
      id,
      tenantId,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    list.push(created);
    templatesStore.set(tenantId, list);
    return created;
  }

  public static updateTemplate(tenantId: string, templateId: string, updates: Partial<DocumentTemplate>): DocumentTemplate {
    const list = this.ensureTenantTemplates(tenantId);
    const index = list.findIndex((t) => t.id === templateId);
    if (index === -1) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const current = list[index];

    if (updates.isDefault) {
      list.forEach((t) => {
        if (t.documentType === current.documentType && t.id !== templateId) {
          t.isDefault = false;
        }
      });
    }

    const updated: DocumentTemplate = {
      ...current,
      ...updates,
      id: current.id,
      tenantId,
      version: current.version + 1, // Version increments on modification
      updatedAt: new Date().toISOString(),
    };

    list[index] = updated;
    templatesStore.set(tenantId, list);
    return updated;
  }

  public static setDefaultTemplate(tenantId: string, templateId: string): DocumentTemplate {
    const list = this.ensureTenantTemplates(tenantId);
    const target = list.find((t) => t.id === templateId);
    if (!target) {
      throw new Error(`Template not found: ${templateId}`);
    }

    list.forEach((t) => {
      if (t.documentType === target.documentType) {
        t.isDefault = t.id === templateId;
      }
    });

    templatesStore.set(tenantId, list);
    return target;
  }

  public static deleteTemplate(tenantId: string, templateId: string): boolean {
    const list = this.ensureTenantTemplates(tenantId);
    const index = list.findIndex((t) => t.id === templateId);
    if (index === -1) return false;
    const target = list[index];
    if (target.isDefault) {
      throw new Error('Cannot delete default template. Set another template as default first.');
    }
    list.splice(index, 1);
    templatesStore.set(tenantId, list);
    return true;
  }

  // ==========================================
  // MANDATORY SNAPSHOT SYSTEM
  // Rule: Template change affects only new documents (posted keep their snapshot)
  // ==========================================

  public static snapshotDocumentTemplate(
    tenantId: string,
    documentType: DocumentType,
    documentId: string,
    documentNumber: string,
    template?: DocumentTemplate
  ): DocumentSnapshot {
    const effectiveTemplate = template || this.getDefaultTemplate(tenantId, documentType);
    const key = `${tenantId}:${documentType}:${documentId}`;

    const snapshot: DocumentSnapshot = {
      id: `snap-${crypto.randomUUID()}`,
      tenantId,
      documentType,
      documentId,
      documentNumber,
      templateId: effectiveTemplate.id,
      templateVersion: effectiveTemplate.version,
      // Deep clone template snapshot so future edits to the template do not alter this snapshot
      templateSnapshot: JSON.parse(JSON.stringify(effectiveTemplate)),
      snapshottedAt: new Date().toISOString(),
    };

    snapshotsStore.set(key, snapshot);
    return snapshot;
  }

  public static getDocumentSnapshot(tenantId: string, documentType: DocumentType, documentId: string): DocumentSnapshot | null {
    const key = `${tenantId}:${documentType}:${documentId}`;
    return snapshotsStore.get(key) || null;
  }

  public static getEffectiveTemplateForDocument(
    tenantId: string,
    documentType: DocumentType,
    documentId: string,
    requestedPaperSize?: PaperSize
  ): DocumentTemplate {
    // 1. Check if an immutable snapshot exists for this posted/issued document
    const snapshot = this.getDocumentSnapshot(tenantId, documentType, documentId);
    if (snapshot && !requestedPaperSize) {
      return snapshot.templateSnapshot;
    }
    if (snapshot && requestedPaperSize && snapshot.templateSnapshot.paperSize === requestedPaperSize) {
      return snapshot.templateSnapshot;
    }

    // 2. Fall back to current company default template
    return this.getDefaultTemplate(tenantId, documentType, requestedPaperSize);
  }

  // ==========================================
  // USER PRINT PREFERENCES
  // ==========================================

  public static getPrintPreferences(tenantId: string, userId: string, documentType: DocumentType): PrintPreferences {
    const key = `${tenantId}:${userId}:${documentType}`;
    const existing = preferencesStore.get(key);
    if (existing) return existing;

    return {
      userId,
      tenantId,
      documentType,
      paperSize: documentType === 'BARCODE_LABEL' ? 'THERMAL_80MM' : 'A4',
      orientation: 'PORTRAIT',
      languageMode: 'BILINGUAL',
      copies: 1,
      showBackgroundColors: true,
    };
  }

  public static savePrintPreferences(tenantId: string, userId: string, payload: PrintPreferences): PrintPreferences {
    const key = `${tenantId}:${userId}:${payload.documentType}`;
    preferencesStore.set(key, payload);
    return payload;
  }
}

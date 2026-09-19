export type DocumentType =
  | 'SALES_INVOICE'
  | 'PURCHASE_BILL'
  | 'QUOTATION'
  | 'SALES_ORDER'
  | 'PURCHASE_ORDER'
  | 'RECEIPT_VOUCHER'
  | 'PAYMENT_VOUCHER'
  | 'CREDIT_NOTE'
  | 'DEBIT_NOTE'
  | 'CUSTOMER_STATEMENT'
  | 'SUPPLIER_STATEMENT'
  | 'BARCODE_LABEL';

export type PaperSize = 'A4' | 'A5' | 'LETTER' | 'THERMAL_80MM';
export type Orientation = 'PORTRAIT' | 'LANDSCAPE';
export type LanguageMode = 'AR' | 'EN' | 'BILINGUAL';
export type FontFamily = 'cairo' | 'tajawal' | 'amiri' | 'noto_sans' | 'inter';
export type QrPlacement = 'TOP_RIGHT' | 'TOP_LEFT' | 'BOTTOM_LEFT' | 'BOTTOM_RIGHT' | 'HEADER' | 'FOOTER' | 'INLINE';

export interface TemplateColorPalette {
  primary: string;
  secondary: string;
  text: string;
  background: string;
  tableHeaderBg: string;
  border: string;
  accent: string;
}

export interface CompanyInfoBlocksConfig {
  showLogo: boolean;
  showCompanyName: boolean;
  showVatNumber: boolean;
  showCrNumber: boolean;
  showNationalAddress: boolean;
  showContact: boolean;
  showBankAccounts: boolean;
}

export interface TemplateColumnConfig {
  id: string;
  visible: boolean;
  labelAr: string;
  labelEn: string;
  widthPct: number;
  order: number;
}

export interface QrCodeConfig {
  visible: boolean;
  placement: QrPlacement;
  size: number; // in pixels
}

export interface DocumentTemplate {
  id: string;
  tenantId: string;
  name: string;
  nameAr?: string;
  documentType: DocumentType;
  isDefault: boolean;
  version: number;
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  paperSize: PaperSize;
  orientation: Orientation;
  languageMode: LanguageMode;
  fontFamily: FontFamily;
  colors: TemplateColorPalette;
  logoUrl?: string;
  companyInfoBlocks: CompanyInfoBlocksConfig;
  columns: TemplateColumnConfig[];
  qrCode: QrCodeConfig;
  headerText?: string;
  footerText?: string;
  termsAndConditions?: string;
  notes?: string;
  showVatSummary: boolean;
  showSignatureBlock: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentSnapshot {
  id: string;
  tenantId: string;
  documentType: DocumentType;
  documentId: string;
  documentNumber: string;
  templateId: string;
  templateVersion: number;
  templateSnapshot: DocumentTemplate;
  snapshottedAt: string;
}

export interface PrintPreferences {
  userId: string;
  tenantId: string;
  documentType: DocumentType;
  paperSize: PaperSize;
  orientation: Orientation;
  languageMode: LanguageMode;
  copies: number;
  showBackgroundColors: boolean;
}

export interface SecureLinkAccessLog {
  timestamp: string;
  ip: string;
  userAgent: string;
  action: string;
}

export interface SecureLink {
  id: string;
  token: string;
  tenantId: string;
  documentType: DocumentType;
  documentId: string;
  documentNumber: string;
  allowNoLogin: boolean;
  expiresAt: string;
  isRevoked: boolean;
  revokedAt?: string;
  viewsCount: number;
  lastViewedAt?: string;
  accessLogs: SecureLinkAccessLog[];
  createdAt: string;
}

export interface EmailIdentity {
  id: string;
  name: string;
  email: string;
  isDefault: boolean;
}

export interface EmailSettings {
  tenantId: string;
  smtpHost: string;
  smtpPort: number;
  secure: boolean;
  username: string;
  passwordMasked: string;
  passwordEncrypted?: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  identities: EmailIdentity[];
  lastTestedAt?: string;
  lastTestStatus?: 'SUCCESS' | 'FAILED';
  lastTestError?: string;
}

export interface SharingAttachment {
  filename: string;
  contentType: string;
  sizeBytes?: number;
  dataBase64?: string;
}

export interface SharingQueueItem {
  id: string;
  tenantId: string;
  channel: 'EMAIL' | 'WHATSAPP' | 'SMS';
  documentType: DocumentType;
  documentId: string;
  documentNumber: string;
  recipient: string;
  senderIdentity?: string;
  subject?: string;
  body?: string;
  attachments?: SharingAttachment[];
  status: 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELLED';
  attempts: number;
  maxRetries: number;
  lastAttemptAt?: string;
  error?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  sentAt?: string;
}

export interface DocumentDataPayload {
  documentType: DocumentType;
  documentId: string;
  documentNumber: string;
  issueDate: string;
  dueDate?: string;
  currency: string;
  languageMode?: LanguageMode;
  company: {
    nameAr: string;
    nameEn: string;
    vatNumber: string;
    crNumber: string;
    nationalAddress: string;
    phone: string;
    email: string;
    logoUrl?: string;
    bankAccounts?: Array<{ bankName: string; iban: string; accountName: string }>;
  };
  party?: {
    nameAr: string;
    nameEn?: string;
    vatNumber?: string;
    crNumber?: string;
    address?: string;
    phone?: string;
    email?: string;
    partyType: 'CUSTOMER' | 'SUPPLIER';
  };
  lines: Array<{
    lineNumber: number;
    itemCode: string;
    nameAr: string;
    nameEn?: string;
    quantity: number;
    unitName: string;
    unitPriceSar: number;
    discountSar: number;
    subtotalSar: number;
    vatRatePct: number;
    vatAmountSar: number;
    totalSar: number;
    barcode?: string;
  }>;
  totals: {
    subtotalExclVatSar: number;
    discountTotalSar: number;
    taxableAmountSar: number;
    vatAmountSar: number;
    totalAmountSar: number;
    paidAmountSar?: number;
    balanceDueSar?: number;
  };
  zatca?: {
    qrCodeBase64: string;
    invoiceHash?: string;
    cryptographicStamp?: string;
    invoiceTypeCode?: string;
    isSimplified?: boolean;
  };
  paymentInfo?: {
    method: string;
    referenceNumber?: string;
    allocations?: Array<{ documentNumber: string; amountSar: number }>;
  };
  notes?: string;
  terms?: string;
}

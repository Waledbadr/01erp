/**
 * Public API, Webhooks & Global Search Types — Saudi ERP Platform
 * Supporting Hashed Revocable Rate-Limited API Keys, HMAC-SHA256 Webhook Delivery with Outbox & 8-Attempt Exponential Backoff,
 * and Unified Server-Side Global Search with Rule C Cost Redaction.
 */

export interface ApiKey {
  id: string;
  tenantId: string;
  name: string;
  keyPrefix: string; // e.g. "sk_live_a1b2..."
  keyHash: string; // SHA-256 hash of the complete raw secret key
  scopes: string[]; // e.g. ["customers:read", "invoices:write", "inventory:read"]
  rateLimit: number; // Max requests per minute (e.g. 60 or 120)
  expiresAt: string | null; // ISO timestamp or null for perpetual
  isRevoked: boolean;
  revokedAt?: string;
  revokedBy?: string;
  createdBy: string; // User ID of creator
  creatorEmail: string;
  creatorRole: string; // Role of creator (key can NEVER exceed creator's role/permissions)
  creatorPermissions: string[];
  createdAt: string;
  lastUsedAt?: string;
  lastUsedIp?: string;
  totalCalls: number;
}

export interface CreateApiKeyInput {
  name: string;
  scopes: string[];
  rateLimit?: number;
  expiresInDays?: number | null; // e.g. 30, 90, 365 or null
}

export interface CreateApiKeyResult {
  apiKey: ApiKey;
  rawSecretKey: string; // ONLY returned once upon creation!
}

export interface WebhookEndpoint {
  id: string;
  tenantId: string;
  name: string;
  url: string;
  secret: string; // e.g. "whsec_..."
  events: string[]; // ["invoice.posted", "payment.received", "purchase.posted", "journal.posted", "stock.low", "*"]
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastTriggeredAt?: string;
  successCount: number;
  failureCount: number;
}

export interface CreateWebhookEndpointInput {
  name: string;
  url: string;
  secret?: string;
  events: string[];
  isActive?: boolean;
}

export interface UpdateWebhookEndpointInput {
  name?: string;
  url?: string;
  secret?: string;
  events?: string[];
  isActive?: boolean;
}

export type WebhookDeliveryStatus = 'PENDING' | 'DELIVERED' | 'RETRYING' | 'DEAD_LETTER';

export interface WebhookOutboxEvent {
  id: string; // e.g. "evt_..."
  tenantId: string;
  eventType: string; // e.g. "invoice.posted"
  payload: Record<string, any>;
  status: 'PENDING' | 'PROCESSED' | 'FAILED';
  createdAt: string;
  processedAt?: string;
  error?: string;
}

export interface WebhookDelivery {
  id: string; // e.g. "del_..."
  tenantId: string;
  endpointId: string;
  endpointUrl: string;
  eventId: string;
  eventType: string;
  payload: Record<string, any>;
  requestHeaders: Record<string, string>;
  statusCode?: number;
  responseBody?: string;
  attempt: number; // 1 to 8
  maxAttempts: number; // 8
  status: WebhookDeliveryStatus;
  nextRetryAt?: string;
  error?: string;
  createdAt: string;
  deliveredAt?: string;
  durationMs?: number;
}

export type SearchCategory = 'ALL' | 'CUSTOMERS' | 'SUPPLIERS' | 'ITEMS' | 'INVOICES' | 'BILLS' | 'JOURNALS';

export interface SearchResultItem {
  id: string;
  category: 'CUSTOMER' | 'SUPPLIER' | 'ITEM' | 'INVOICE' | 'BILL' | 'JOURNAL';
  titleAr: string;
  titleEn: string;
  subtitleAr: string;
  subtitleEn: string;
  codeOrNumber: string;
  amountFormatted?: string;
  statusBadge?: {
    labelAr: string;
    labelEn: string;
    variant: 'default' | 'success' | 'warning' | 'danger' | 'info';
  };
  deepLink: string;
  matchedField: string;
  metadata?: Record<string, any>;
}

export interface GlobalSearchResponse {
  query: string;
  totalResults: number;
  categories: {
    category: string;
    count: number;
  }[];
  results: SearchResultItem[];
  executionTimeMs: number;
}

export const SYSTEM_API_SCOPES = [
  { scope: 'customers:read', nameAr: 'قراءة بيانات العملاء', nameEn: 'Read Customers', module: 'parties' },
  { scope: 'customers:write', nameAr: 'إنشاء وتعديل العملاء', nameEn: 'Write Customers', module: 'parties' },
  { scope: 'suppliers:read', nameAr: 'قراءة بيانات الموردين', nameEn: 'Read Suppliers', module: 'parties' },
  { scope: 'suppliers:write', nameAr: 'إنشاء وتعديل الموردين', nameEn: 'Write Suppliers', module: 'parties' },
  { scope: 'items:read', nameAr: 'قراءة دليل المنتجات والمخزون', nameEn: 'Read Items & Stock', module: 'inventory' },
  { scope: 'items:write', nameAr: 'إنشاء وتعديل المنتجات', nameEn: 'Write Items', module: 'inventory' },
  { scope: 'invoices:read', nameAr: 'قراءة فواتير المبيعات', nameEn: 'Read Sales Invoices', module: 'sales' },
  { scope: 'invoices:write', nameAr: 'إنشاء وترحيل الفواتير', nameEn: 'Write Sales Invoices', module: 'sales' },
  { scope: 'bills:read', nameAr: 'قراءة فواتير المشتريات', nameEn: 'Read Purchase Bills', module: 'purchasing' },
  { scope: 'bills:write', nameAr: 'إنشاء وترحيل فواتير المشتريات', nameEn: 'Write Purchase Bills', module: 'purchasing' },
  { scope: 'payments:read', nameAr: 'قراءة سندات القبض والصرف', nameEn: 'Read Payments & Receipts', module: 'treasury' },
  { scope: 'payments:write', nameAr: 'تسجيل المقبوضات والمدفوعات', nameEn: 'Write Payments', module: 'treasury' },
  { scope: 'journals:read', nameAr: 'قراءة قيود اليومية', nameEn: 'Read Journal Entries', module: 'accounting' },
  { scope: 'journals:write', nameAr: 'إنشاء قيود اليومية', nameEn: 'Write Journal Entries', module: 'accounting' },
  { scope: 'reports:read', nameAr: 'قراءة التقارير وميزان المراجعة', nameEn: 'Read Reports & Trial Balance', module: 'reports' },
  { scope: 'search:read', nameAr: 'البحث الشامل في السجلات', nameEn: 'Global Search', module: 'search' },
  { scope: 'webhooks:manage', nameAr: 'إدارة وتتبع الويب هوك', nameEn: 'Manage Webhooks', module: 'integrations' },
] as const;

export const WEBHOOK_AVAILABLE_EVENTS = [
  { event: 'invoice.posted', nameAr: 'ترحيل فاتورة مبيعات', nameEn: 'Sales Invoice Posted' },
  { event: 'invoice.paid', nameAr: 'سداد فاتورة مبيعات بالكامل', nameEn: 'Sales Invoice Paid' },
  { event: 'purchase.posted', nameAr: 'ترحيل فاتورة مشتريات', nameEn: 'Purchase Bill Posted' },
  { event: 'payment.received', nameAr: 'استلام سند قبض من عميل', nameEn: 'Payment Received' },
  { event: 'payment.disbursed', nameAr: 'تسجيل سند صرف لمورد', nameEn: 'Payment Disbursed' },
  { event: 'journal.posted', nameAr: 'ترحيل قيد يومية محاسبي', nameEn: 'Journal Entry Posted' },
  { event: 'stock.low', nameAr: 'انخفاض رصيد المخزون عن حد الطلب', nameEn: 'Stock Level Low' },
  { event: 'customer.created', nameAr: 'تسجيل عميل جديد', nameEn: 'Customer Created' },
  { event: 'zatca.reported', nameAr: 'إشعار هيئة الزكاة والضريبة (فاتورة)', nameEn: 'ZATCA Invoice Reported/Cleared' },
] as const;

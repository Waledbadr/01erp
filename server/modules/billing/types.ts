/**
 * PHASE 21 / PHASE 20 — SAAS BILLING & SUPER ADMIN PLATFORM
 * Core Types, Plans Catalog, Subscription States, and Usage Metrics.
 */

export type PlanCode = 'FREE' | 'BASIC' | 'PRO' | 'ENTERPRISE';

export type SubscriptionStatus =
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'SUSPENDED'
  | 'CANCELED';

export type BillingCycle = 'MONTHLY' | 'ANNUAL';

export interface PlanLimits {
  maxUsers: number;
  maxMonthlyDocuments: number;
  maxStorageBytes: number;
  maxMonthlyAiRequests: number;
}

export interface PlanFeatureFlags {
  allowZatcaPhase2: boolean;
  allowPos: boolean;
  allowAutomation: boolean;
  allowOcr: boolean;
  allowAiCopilot: boolean;
  allowCustomApi: boolean;
}

export interface SubscriptionPlan {
  code: PlanCode;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  priceMonthlySar: number;
  priceAnnualSar: number;
  priceMonthlyHalalas: number;
  priceAnnualHalalas: number;
  limits: PlanLimits;
  features: PlanFeatureFlags;
}

export const PLANS_CATALOG: Record<PlanCode, SubscriptionPlan> = {
  FREE: {
    code: 'FREE',
    nameAr: 'الباقة المجانية (تجريبية)',
    nameEn: 'Free Tier',
    descriptionAr: 'للمنشآت الفردية واستكشاف المنصة وتجربة العمليات الأساسية',
    descriptionEn: 'For individual entrepreneurs and trial exploration',
    priceMonthlySar: 0,
    priceAnnualSar: 0,
    priceMonthlyHalalas: 0,
    priceAnnualHalalas: 0,
    limits: {
      maxUsers: 1,
      maxMonthlyDocuments: 50,
      maxStorageBytes: 100 * 1024 * 1024, // 100 MB
      maxMonthlyAiRequests: 10,
    },
    features: {
      allowZatcaPhase2: false,
      allowPos: false,
      allowAutomation: false,
      allowOcr: false,
      allowAiCopilot: false,
      allowCustomApi: false,
    },
  },
  BASIC: {
    code: 'BASIC',
    nameAr: 'الباقة الأساسية (الأعمال الناشئة)',
    nameEn: 'Basic Business',
    descriptionAr: 'للمنشآت الصغيرة والمتوسطة البسيطة مع إصدار فواتير ضريبية مبسطة',
    descriptionEn: 'For small enterprises and standard invoicing workflows',
    priceMonthlySar: 199,
    priceAnnualSar: 1990,
    priceMonthlyHalalas: 19900,
    priceAnnualHalalas: 199000,
    limits: {
      maxUsers: 5,
      maxMonthlyDocuments: 500,
      maxStorageBytes: 1 * 1024 * 1024 * 1024, // 1 GB
      maxMonthlyAiRequests: 100,
    },
    features: {
      allowZatcaPhase2: true,
      allowPos: true,
      allowAutomation: false,
      allowOcr: false,
      allowAiCopilot: false,
      allowCustomApi: false,
    },
  },
  PRO: {
    code: 'PRO',
    nameAr: 'الباقة المتقدمة / الاحترافية',
    nameEn: 'Professional Pro',
    descriptionAr: 'شاملة الربط المتكامل مع هيئة الزكاة المرحلة الثانية، الأتمتة، والذكاء الاصطناعي',
    descriptionEn: 'Full ZATCA Phase 2 clearance, POS, Automation, OCR & Financial Copilot',
    priceMonthlySar: 499,
    priceAnnualSar: 4990,
    priceMonthlyHalalas: 49900,
    priceAnnualHalalas: 499000,
    limits: {
      maxUsers: 20,
      maxMonthlyDocuments: 2500,
      maxStorageBytes: 10 * 1024 * 1024 * 1024, // 10 GB
      maxMonthlyAiRequests: 1000,
    },
    features: {
      allowZatcaPhase2: true,
      allowPos: true,
      allowAutomation: true,
      allowOcr: true,
      allowAiCopilot: true,
      allowCustomApi: false,
    },
  },
  ENTERPRISE: {
    code: 'ENTERPRISE',
    nameAr: 'باقة المؤسسات الكبرى',
    nameEn: 'Enterprise Cloud',
    descriptionAr: 'سعة استيعابية فائقة، مستخدمين متعددين، وربط مخصص عبر واجهات API',
    descriptionEn: 'Unlimited capacity, high concurrency, dedicated API and SLA support',
    priceMonthlySar: 1299,
    priceAnnualSar: 12990,
    priceMonthlyHalalas: 129900,
    priceAnnualHalalas: 1299000,
    limits: {
      maxUsers: 100,
      maxMonthlyDocuments: 50000,
      maxStorageBytes: 100 * 1024 * 1024 * 1024, // 100 GB
      maxMonthlyAiRequests: 10000,
    },
    features: {
      allowZatcaPhase2: true,
      allowPos: true,
      allowAutomation: true,
      allowOcr: true,
      allowAiCopilot: true,
      allowCustomApi: true,
    },
  },
};

export const SUBSCRIPTION_PLANS_CATALOG = PLANS_CATALOG;

export interface TenantSubscription {
  id: string;
  tenantId: string;
  planCode: PlanCode;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  currentPeriodStart: string; // ISO date string
  currentPeriodEnd: string; // ISO date string
  trialEndsAt?: string;
  canceledAt?: string;
  suspendedAt?: string;
  suspensionReason?: string;
  paymentMethodStatus: 'NOT_CONFIGURED' | 'CONFIGURED' | 'FAILED';
  autoRenew: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TenantUsageMetrics {
  tenantId: string;
  periodKey: string; // YYYY-MM
  usersCount: number;
  documentsCount: number;
  storageBytes: number;
  aiRequestsCount: number;
  calculatedAt: string;
}

export interface SubscriptionInvoice {
  id: string;
  invoiceNumber: string; // e.g. SUB-2026-00001
  tenantId: string;
  planCode: PlanCode;
  billingCycle: BillingCycle;
  periodStart: string;
  periodEnd: string;
  subtotalSar: number;
  vatRatePercent: number; // 15
  vatSar: number; // Decimal-exact half up
  totalSar: number;
  subtotalHalalas: string;
  vatHalalas: string;
  totalHalalas: string;
  status: 'DRAFT' | 'POSTED' | 'PAID' | 'VOID';
  glJournalId?: string;
  glJournalNumber?: string;
  paidAt?: string;
  paymentGateway?: string;
  paymentTransactionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAccessGrant {
  id: string;
  superAdminId: string;
  superAdminEmail: string;
  tenantId: string;
  tenantCode: string;
  tenantNameAr: string;
  reason: string; // Mandatory justification (min 10 chars)
  grantedAt: string;
  expiresAt: string; // Time-boxed (15m - 60m)
  isRevoked: boolean;
  revokedAt?: string;
  revokedBy?: string;
}

export interface AdminAccessLog {
  id: string;
  grantId: string;
  superAdminEmail: string;
  tenantId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  timestamp: string;
  ipAddress?: string;
  correlationId?: string;
}

export interface PaymentGatewayConfig {
  provider: 'MOYASAR' | 'HYPERPAY';
  isConfigured: boolean;
  publishableKey?: string;
  secretKeyMasked?: string;
  webhookSecretMasked?: string;
}

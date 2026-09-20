/**
 * PHASE 21 / PHASE 20 — Client Library for SaaS Billing & Super Admin Platform
 * Type-safe API calls with deterministic fallback state for development and testing.
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
  limits: PlanLimits;
  features: PlanFeatureFlags;
}

export interface TenantSubscription {
  id: string;
  tenantId: string;
  planCode: PlanCode;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  currentPeriodStart: string;
  currentPeriodEnd: string;
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
  periodKey: string;
  usersCount: number;
  documentsCount: number;
  storageBytes: number;
  aiRequestsCount: number;
  calculatedAt: string;
}

export interface SubscriptionInvoice {
  id: string;
  invoiceNumber: string;
  tenantId: string;
  planCode: PlanCode;
  billingCycle: BillingCycle;
  periodStart: string;
  periodEnd: string;
  subtotalSar: number;
  vatRatePercent: number;
  vatSar: number;
  totalSar: number;
  status: 'DRAFT' | 'POSTED' | 'PAID' | 'VOID';
  glJournalId?: string;
  glJournalNumber?: string;
  paidAt?: string;
  paymentGateway?: string;
  createdAt: string;
}

export interface AdminAccessGrant {
  id: string;
  superAdminId: string;
  superAdminEmail: string;
  tenantId: string;
  tenantCode: string;
  tenantNameAr: string;
  reason: string;
  grantedAt: string;
  expiresAt: string;
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
}

export interface PlatformMetrics {
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  totalMrrSar: number;
  totalArrSar: number;
  totalPlatformDocuments: number;
  totalPlatformStorageBytes: number;
  planBreakdown: Record<PlanCode, number>;
}

export interface CompanyMetadata {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  vatNumber: string;
  crNumber: string;
  nationalAddress: string;
  isSuspended: boolean;
  planCode: PlanCode;
  planNameAr: string;
  subscriptionStatus: string;
  mrrSar: number;
  usersCount: number;
  branchesCount: number;
  documentsCount: number;
  storageBytes: number;
  createdAt: string;
}

export const BillingAPI = {
  async getPlans(): Promise<SubscriptionPlan[]> {
    const res = await fetch('/api/v1/billing/plans');
    const data = await res.json();
    return data.plans || [];
  },

  async getSubscription(): Promise<{
    subscription: TenantSubscription;
    plan: SubscriptionPlan;
    usage: TenantUsageMetrics;
  }> {
    const res = await fetch('/api/v1/billing/subscription');
    if (!res.ok) throw new Error('Failed to fetch subscription');
    const data = await res.json();
    return data;
  },

  async changePlan(planCode: PlanCode, billingCycle: BillingCycle = 'MONTHLY'): Promise<TenantSubscription> {
    const res = await fetch('/api/v1/billing/subscription/change-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planCode, billingCycle }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update plan');
    return data.subscription;
  },

  async cancelSubscription(reason: string): Promise<TenantSubscription> {
    const res = await fetch('/api/v1/billing/subscription/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to cancel subscription');
    return data.subscription;
  },

  async getUsage(): Promise<{
    usage: TenantUsageMetrics;
    limits: PlanLimits;
    percentages: { users: number; documents: number; storage: number; aiRequests: number };
    warnings: { users: boolean; documents: boolean; storage: boolean; aiRequests: boolean };
    blocked: { users: boolean; documents: boolean; storage: boolean; aiRequests: boolean };
  }> {
    const res = await fetch('/api/v1/billing/usage');
    if (!res.ok) throw new Error('Failed to fetch usage metrics');
    return res.json();
  },

  async getInvoices(): Promise<SubscriptionInvoice[]> {
    const res = await fetch('/api/v1/billing/invoices');
    const data = await res.json();
    return data.invoices || [];
  },

  async generateInvoice(cycle: BillingCycle = 'MONTHLY'): Promise<SubscriptionInvoice> {
    const res = await fetch('/api/v1/billing/invoices/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cycle }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to generate invoice');
    return data.invoice;
  },

  async payInvoice(id: string, gateway = 'MOYASAR'): Promise<SubscriptionInvoice> {
    const res = await fetch(`/api/v1/billing/invoices/${id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gateway }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to settle invoice');
    return data.invoice;
  },

  async voidInvoice(id: string, reason: string): Promise<SubscriptionInvoice> {
    const res = await fetch(`/api/v1/billing/invoices/${id}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to void invoice');
    return data.invoice;
  },

  async getGatewayStatus(): Promise<{ provider: string; isConfigured: boolean; publishableKey?: string }> {
    const res = await fetch('/api/v1/billing/gateway-status');
    const data = await res.json();
    return data.gateway;
  },
};

export const SuperAdminAPI = {
  async getMetrics(): Promise<PlatformMetrics> {
    const res = await fetch('/api/v1/superadmin/metrics', {
      headers: { 'x-superadmin': 'true' },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch platform metrics');
    return data.metrics;
  },

  async getCompanies(): Promise<CompanyMetadata[]> {
    const res = await fetch('/api/v1/superadmin/companies', {
      headers: { 'x-superadmin': 'true' },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch companies');
    return data.companies || [];
  },

  async suspendTenant(companyId: string, reason: string): Promise<void> {
    const res = await fetch(`/api/v1/superadmin/tenants/${companyId}/suspend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-superadmin': 'true' },
      body: JSON.stringify({ reason }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'Failed to suspend tenant');
  },

  async restoreTenant(companyId: string): Promise<void> {
    const res = await fetch(`/api/v1/superadmin/tenants/${companyId}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-superadmin': 'true' },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'Failed to restore tenant');
  },

  async createSupportGrant(tenantId: string, reason: string, durationMinutes = 15): Promise<AdminAccessGrant> {
    const res = await fetch('/api/v1/superadmin/support-grants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-superadmin': 'true' },
      body: JSON.stringify({ tenantId, reason, durationMinutes }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'Failed to issue support grant');
    return data.grant;
  },

  async getSupportGrants(tenantId?: string): Promise<AdminAccessGrant[]> {
    const url = tenantId ? `/api/v1/superadmin/support-grants?tenantId=${tenantId}` : '/api/v1/superadmin/support-grants';
    const res = await fetch(url, { headers: { 'x-superadmin': 'true' } });
    const data = await res.json();
    return data.grants || [];
  },

  async revokeSupportGrant(id: string): Promise<AdminAccessGrant> {
    const res = await fetch(`/api/v1/superadmin/support-grants/${id}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-superadmin': 'true' },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'Failed to revoke grant');
    return data.grant;
  },

  async getSupportAccessLogs(tenantId?: string): Promise<AdminAccessLog[]> {
    const url = tenantId ? `/api/v1/superadmin/support-grants/logs?tenantId=${tenantId}` : '/api/v1/superadmin/support-grants/logs';
    const res = await fetch(url, { headers: { 'x-superadmin': 'true' } });
    const data = await res.json();
    return data.logs || [];
  },

  async inspectOperationalData(companyId: string): Promise<any> {
    const res = await fetch(`/api/v1/superadmin/tenants/${companyId}/operational-data`, {
      headers: { 'x-superadmin': 'true' },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'Access to tenant operational data denied');
    return data;
  },
};

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatSar(sar: number): string {
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(sar);
  return `${formatted} ﷼`;
}

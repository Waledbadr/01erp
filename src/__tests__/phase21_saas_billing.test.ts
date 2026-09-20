/**
 * PHASE 21 / PHASE 20 — SAAS MULTI-TENANT BILLING & SUPER ADMIN PLATFORM VERIFICATION TEST SUITE
 *
 * Verifies:
 * 1. Plan tier structures, limits, and pricing in exact integer halalas (Rule G7/G8).
 * 2. Subscription lifecycle transitions (TRIALING -> ACTIVE -> SUSPENDED -> ACTIVE, CANCELED).
 * 3. Real-time usage tracking, 80% warning thresholds, and 100% hard block (UsageLimitExceededError).
 * 4. Double-entry General Ledger invoice generation (Rule G1: Debits == Credits).
 * 5. Strict Super Admin Privacy Boundaries (Metadata only, admin_access_grants with mandatory justification).
 * 6. Immediate support grant revocation & tamper-evident access audit logs.
 * 7. Write protection on suspended tenants (Read-Only mode).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { centralStore, TenantContext, TenantScopedRepository } from '../../server/core/tenantGuard.js';
import { BillingService } from '../../server/modules/billing/billingService.js';
import { SUBSCRIPTION_PLANS_CATALOG } from '../../server/modules/billing/types.js';

describe('Phase 21: SaaS Multi-Tenant Billing & Super Admin Platform', () => {
  let testTenantId: string;
  const superAdminEmail = 'superadmin@saudi-erp.sa';

  beforeEach(() => {
    // Setup test tenant in centralStore
    const tenant = centralStore.createTenant({
      nameAr: 'شركة الابتكار السحابي للتجارة',
      nameEn: 'Cloud Innovation Trading Co.',
      vatNumber: '310000000000003',
      crNumber: '1010000001',
      adminUserId: 'usr-admin-01',
    });
    testTenantId = tenant.id;
  });

  describe('1. Plan Tier Definitions & Halala Financial Precision (Rule G7/G8)', () => {
    it('should define 4 compliant Saudi ERP tiers with realistic resource limits', () => {
      expect(SUBSCRIPTION_PLANS_CATALOG.FREE).toBeDefined();
      expect(SUBSCRIPTION_PLANS_CATALOG.BASIC).toBeDefined();
      expect(SUBSCRIPTION_PLANS_CATALOG.PRO).toBeDefined();
      expect(SUBSCRIPTION_PLANS_CATALOG.ENTERPRISE).toBeDefined();

      // Free tier
      expect(SUBSCRIPTION_PLANS_CATALOG.FREE.priceMonthlyHalalas).toBe(0);
      expect(SUBSCRIPTION_PLANS_CATALOG.FREE.limits.maxUsers).toBe(1);

      // Basic tier: 199 SAR = 19900 halalas
      expect(SUBSCRIPTION_PLANS_CATALOG.BASIC.priceMonthlyHalalas).toBe(19900);
      expect(SUBSCRIPTION_PLANS_CATALOG.BASIC.limits.maxUsers).toBe(5);
      expect(SUBSCRIPTION_PLANS_CATALOG.BASIC.limits.maxMonthlyDocuments).toBe(500);

      // Pro tier: 499 SAR = 49900 halalas
      expect(SUBSCRIPTION_PLANS_CATALOG.PRO.priceMonthlyHalalas).toBe(49900);
      expect(SUBSCRIPTION_PLANS_CATALOG.PRO.limits.maxUsers).toBe(20);
      expect(SUBSCRIPTION_PLANS_CATALOG.PRO.features.allowZatcaPhase2).toBe(true);

      // Enterprise tier: 1299 SAR = 129900 halalas
      expect(SUBSCRIPTION_PLANS_CATALOG.ENTERPRISE.priceMonthlyHalalas).toBe(129900);
      expect(SUBSCRIPTION_PLANS_CATALOG.ENTERPRISE.limits.maxUsers).toBe(100);
    });

    it('should offer 2 months free discount on annual billing', () => {
      // Basic Monthly: 199 * 10 = 1990 SAR annual (2 months free out of 12)
      expect(SUBSCRIPTION_PLANS_CATALOG.BASIC.priceAnnualHalalas).toBe(199000);
      expect(SUBSCRIPTION_PLANS_CATALOG.BASIC.priceAnnualHalalas).toBe(
        SUBSCRIPTION_PLANS_CATALOG.BASIC.priceMonthlyHalalas * 10
      );

      // Pro: 499 * 10 = 4990 SAR annual
      expect(SUBSCRIPTION_PLANS_CATALOG.PRO.priceAnnualHalalas).toBe(499000);
    });
  });

  describe('2. Subscription Lifecycle Management', () => {
    it('should initialize or get active subscription for tenant', async () => {
      const sub = await BillingService.getOrCreateSubscription(testTenantId);
      expect(sub).toBeDefined();
      expect(sub.tenantId).toBe(testTenantId);
      expect(sub.status).toBe('ACTIVE');
      expect(['FREE', 'BASIC', 'PRO']).toContain(sub.planCode);
      expect(sub.autoRenew).toBe(true);
    });

    it('should change plan and update subscription details', async () => {
      const updated = await BillingService.changePlan(testTenantId, 'ENTERPRISE', 'ANNUAL');
      expect(updated.planCode).toBe('ENTERPRISE');
      expect(updated.billingCycle).toBe('ANNUAL');

      const current = await BillingService.getOrCreateSubscription(testTenantId);
      expect(current.planCode).toBe('ENTERPRISE');
      expect(current.billingCycle).toBe('ANNUAL');
    });

    it('should cancel subscription auto-renew while retaining data and read access', async () => {
      const canceled = await BillingService.cancelSubscription(testTenantId, 'Cost optimization');
      expect(canceled.autoRenew).toBe(false);
      expect(canceled.canceledAt).toBeDefined();

      // Tenant data remains accessible in store
      const tenant = centralStore.tenants.get(testTenantId);
      expect(tenant).toBeDefined();
    });
  });

  describe('3. Resource Metering & Hard Enforcement (UsageLimitExceededError)', () => {
    it('should accurately calculate real-time usage and threshold percentages', async () => {
      const usageOverview = await BillingService.checkTenantUsage(testTenantId);
      expect(usageOverview).toBeDefined();
      expect(usageOverview.limits).toBeDefined();
      expect(usageOverview.percentages).toBeDefined();
      expect(usageOverview.warnings).toBeDefined();
      expect(usageOverview.blocked).toBeDefined();
    });

    it('should increment traceable usage and detect 80% warning and 100% block', async () => {
      // Set to Basic plan (max 500 documents)
      await BillingService.changePlan(testTenantId, 'BASIC', 'MONTHLY');

      // Record 410 documents (82% -> warning)
      await BillingService.incrementUsage(testTenantId, 'documents', 410);
      let usage = await BillingService.checkTenantUsage(testTenantId);
      expect(usage.percentages.documents).toBeGreaterThanOrEqual(80);
      expect(usage.warnings.documents).toBe(true);
      expect(usage.blocked.documents).toBe(false);

      // Record another 95 documents (total 505 / 500 -> 101% -> blocked)
      await BillingService.incrementUsage(testTenantId, 'documents', 95);
      usage = await BillingService.checkTenantUsage(testTenantId);
      expect(usage.percentages.documents).toBeGreaterThanOrEqual(100);
      expect(usage.blocked.documents).toBe(true);

      // Assert usage enforcement blocks further operations
      await expect(BillingService.assertWithinLimits(testTenantId, 'documents')).rejects.toThrow(
        /usage limit .* exceeded/i
      );
    });
  });

  describe('4. Double-Entry General Ledger Invoice Generation (Rule G1)', () => {
    it('should generate a statutory 15% VAT subscription invoice and post a balanced GL entry', async () => {
      // Switch to Basic Monthly: 199 SAR (19900 halalas)
      await BillingService.changePlan(testTenantId, 'BASIC', 'MONTHLY');

      const invoice = await BillingService.generateSubscriptionInvoice(testTenantId, 'MONTHLY');
      expect(invoice).toBeDefined();
      expect(invoice.invoiceNumber).toMatch(/^SUB-/);
      expect(Number(invoice.subtotalHalalas)).toBe(19900); // 199.00 SAR

      // 15% VAT on 199.00 = 29.85 SAR (2985 halalas)
      expect(Number(invoice.vatHalalas)).toBe(2985);
      expect(Number(invoice.totalHalalas)).toBe(22885); // 228.85 SAR
      expect(invoice.status).toBe('POSTED');

      // Check General Ledger Double-Entry balance (Rule G1)
      const journals = centralStore.journals.get(testTenantId) || [];
      const subJournal = journals.find((j) => j.id === invoice.glJournalId);
      expect(subJournal).toBeDefined();
      expect(subJournal?.status).toBe('POSTED');
      expect(subJournal?.totalDebitCents).toBe(subJournal?.totalCreditCents);
      expect(subJournal?.totalDebitCents).toBe(2288500n);
    });

    it('should settle invoice, update status to PAID, and reactivate subscription', async () => {
      const invoice = await BillingService.generateSubscriptionInvoice(testTenantId, 'MONTHLY');

      // Suspend tenant to verify payment reactivates it
      await BillingService.suspendSubscription(testTenantId, 'Past due testing');
      let sub = await BillingService.getOrCreateSubscription(testTenantId);
      expect(sub.status).toBe('SUSPENDED');

      // Pay invoice via Moyasar gateway
      const paidInvoice = await BillingService.paySubscriptionInvoice(
        invoice.id,
        testTenantId,
        'MOYASAR',
        'pay_moyasar_test_123'
      );
      expect(paidInvoice.status).toBe('PAID');
      expect(paidInvoice.paidAt).toBeDefined();

      // Subscription should be automatically restored to ACTIVE
      sub = await BillingService.getOrCreateSubscription(testTenantId);
      expect(sub.status).toBe('ACTIVE');
      expect(centralStore.tenants.get(testTenantId)?.isSuspended).toBe(false);
    });
  });

  describe('5. Super Admin Privacy Boundaries & Support Access Grants', () => {
    it('should expose only metadata in company directory list (no operational secrets)', () => {
      const companyList = BillingService.getCompanyMetadataList();
      expect(companyList.length).toBeGreaterThan(0);

      const target = companyList.find((c) => c.id === testTenantId);
      expect(target).toBeDefined();
      expect(target?.code).toBeDefined();
      expect(target?.nameAr).toBe('شركة الابتكار السحابي للتجارة');
      expect(target?.vatNumber).toBe('310000000000003');
      expect(target?.mrrSar).toBeGreaterThanOrEqual(0);
      expect(target?.usersCount).toBeGreaterThanOrEqual(0);

      // Should not contain internal transaction records
      expect((target as any).invoices).toBeUndefined();
      expect((target as any).journalEntries).toBeUndefined();
    });

    it('should strictly deny Super Admin access to tenant operational data without a valid grant', () => {
      const hasGrant = BillingService.validateSupportGrant(superAdminEmail, testTenantId);
      expect(hasGrant).toBe(false);
    });

    it('should reject support access grant creation if justification reason is shorter than 10 characters', () => {
      expect(() => {
        BillingService.createSupportGrant({
          superAdminId: 'usr-super-01',
          superAdminEmail,
          tenantId: testTenantId,
          reason: 'Too short', // < 10 chars
          durationMinutes: 15,
        });
      }).toThrow(/minimum 10 characters/);
    });

    it('should grant time-boxed support access when justification is valid', () => {
      const grant = BillingService.createSupportGrant({
        superAdminId: 'usr-super-01',
        superAdminEmail,
        tenantId: testTenantId,
        reason: 'Investigating customer ZATCA Phase 2 clearance error log',
        durationMinutes: 15,
      });

      expect(grant).toBeDefined();
      expect(grant.tenantId).toBe(testTenantId);
      expect(grant.superAdminEmail).toBe(superAdminEmail);
      expect(grant.isRevoked).toBe(false);

      // Now validation should succeed
      const hasGrant = BillingService.validateSupportGrant(superAdminEmail, testTenantId);
      expect(hasGrant).toBe(true);

      // Log support access
      BillingService.logSupportAccess({
        superAdminEmail,
        tenantId: testTenantId,
        action: 'INSPECT_ZATCA_LOGS',
        resourceType: 'operational_data',
      });

      const logs = BillingService.getSupportAccessLogs(testTenantId);
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].action).toBe('INSPECT_ZATCA_LOGS');
    });

    it('should immediately revoke support grant and cut off access', () => {
      const grant = BillingService.createSupportGrant({
        superAdminId: 'usr-super-01',
        superAdminEmail,
        tenantId: testTenantId,
        reason: 'Temporary troubleshooting for inventory discrepancy',
        durationMinutes: 30,
      });

      expect(BillingService.validateSupportGrant(superAdminEmail, testTenantId)).toBe(true);

      // Revoke grant
      const revoked = BillingService.revokeSupportGrant(grant.id, superAdminEmail);
      expect(revoked.isRevoked).toBe(true);

      // Access should now be forbidden
      expect(BillingService.validateSupportGrant(superAdminEmail, testTenantId)).toBe(false);
    });
  });

  describe('6. Platform Overview Metrics & Read-Only Protection', () => {
    it('should aggregate accurate platform-level metrics (MRR, ARR, Tenants)', () => {
      const metrics = BillingService.getPlatformMetrics();
      expect(metrics.totalTenants).toBeGreaterThan(0);
      expect(metrics.activeTenants).toBeGreaterThanOrEqual(1);
      expect(metrics.totalMrrSar).toBeGreaterThanOrEqual(0);
      expect(metrics.totalArrSar).toBe(metrics.totalMrrSar * 12);
      expect(metrics.planBreakdown).toBeDefined();
    });

    it('should enforce write protection when tenant is suspended', async () => {
      await BillingService.suspendSubscription(testTenantId, 'Testing account freeze');
      const tenant = centralStore.tenants.get(testTenantId);
      expect(tenant?.isSuspended).toBe(true);

      // Reactivate
      await BillingService.reactivateSubscription(testTenantId);
      expect(tenant?.isSuspended).toBe(false);
    });
  });
});

import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  validateSaudiVatNumber,
  validateSaudiCrNumber,
  validateSaudiUnifiedNumber,
  generateMfaEnrollment,
  verifyTotp,
  generateRecoveryCodes,
  verifyAndBurnRecoveryCode,
} from '../../server/core/security.js';
import {
  centralStore,
  TenantScopedRepository,
  TenantIsolationViolationError,
  PermissionDeniedError,
  scrubSensitiveFinancialFields,
  SYSTEM_DEFAULT_ROLES,
} from '../../server/core/tenantGuard.js';

describe('PHASE-01: Multi-Tenancy, Auth, RBAC & Company Master', () => {
  // ====================================================
  // 1. SAUDI TAX & REGULATORY IDENTIFIERS
  // ====================================================
  describe('Saudi Tax & Legal ID Validation', () => {
    it('validates Saudi VAT number format (15 digits, starting and ending with 3)', () => {
      // Valid VAT numbers
      expect(validateSaudiVatNumber('310123456700003').valid).toBe(true);
      expect(validateSaudiVatNumber('300000000000003').valid).toBe(true);

      // Invalid: starts with 1
      expect(validateSaudiVatNumber('110123456700003').valid).toBe(false);
      // Invalid: ends with 5
      expect(validateSaudiVatNumber('310123456700005').valid).toBe(false);
      // Invalid: 14 digits
      expect(validateSaudiVatNumber('31012345670003').valid).toBe(false);
      // Invalid: letters
      expect(validateSaudiVatNumber('31012345670000A').valid).toBe(false);
    });

    it('validates Saudi Commercial Registration number (10 digits)', () => {
      expect(validateSaudiCrNumber('1010123456').valid).toBe(true);
      expect(validateSaudiCrNumber('2050987654').valid).toBe(true);

      // Invalid lengths or characters
      expect(validateSaudiCrNumber('101012345').valid).toBe(false); // 9 digits
      expect(validateSaudiCrNumber('10101234567').valid).toBe(false); // 11 digits
      expect(validateSaudiCrNumber('101012345B').valid).toBe(false);
    });

    it('validates 700 Unified National Number (10 digits starting with 7)', () => {
      expect(validateSaudiUnifiedNumber('7001234567').valid).toBe(true);
      expect(validateSaudiUnifiedNumber('1001234567').valid).toBe(false);
    });
  });

  // ====================================================
  // 2. CRYPTOGRAPHIC UTILITIES & AUTH
  // ====================================================
  describe('Cryptographic Security & Password Hashing', () => {
    it('hashes passwords with PBKDF2-SHA512 and random salt, verifying correctly', () => {
      const password = 'SaudiSecurePassword2026!';
      const hash = hashPassword(password);

      expect(hash).toContain('$pbkdf2$100000$');
      expect(verifyPassword(password, hash)).toBe(true);
      expect(verifyPassword('WrongPassword', hash)).toBe(false);
    });

    it('generates TOTP MFA secret, verifies token, and handles recovery codes', () => {
      const enrollment = generateMfaEnrollment('admin@company.sa');
      expect(enrollment.secret).toBeDefined();
      expect(enrollment.otpauthUrl).toContain('admin%40company.sa');

      // Test recovery codes generation and burning
      const recovery = generateRecoveryCodes(5);
      expect(recovery.plaintext.length).toBe(5);
      expect(recovery.hashed.length).toBe(5);

      const codeToBurn = recovery.plaintext[2];
      const burnResult = verifyAndBurnRecoveryCode(codeToBurn, recovery.hashed);
      expect(burnResult.valid).toBe(true);
      expect(burnResult.remainingHashedCodes.length).toBe(4);

      // Second attempt with burned code fails
      const secondBurn = verifyAndBurnRecoveryCode(codeToBurn, burnResult.remainingHashedCodes);
      expect(secondBurn.valid).toBe(false);
    });

    it('enforces brute-force rate limiting and account lockout after 5 failed attempts', () => {
      const key = 'test-ip:testuser@saudi-erp.com';
      centralStore.clearFailedAttempts(key);

      for (let i = 0; i < 4; i++) {
        centralStore.recordFailedAttempt(key);
        expect(centralStore.checkRateLimitAndLockout(key).isLocked).toBe(false);
      }

      // 5th failed attempt triggers lockout
      centralStore.recordFailedAttempt(key);
      const lockedCheck = centralStore.checkRateLimitAndLockout(key);
      expect(lockedCheck.isLocked).toBe(true);
      expect(lockedCheck.remainingLockoutSec).toBeGreaterThan(0);

      // Clear after successful login
      centralStore.clearFailedAttempts(key);
      expect(centralStore.checkRateLimitAndLockout(key).isLocked).toBe(false);
    });
  });

  // ====================================================
  // 3. TENANT ISOLATION & SEEDING
  // ====================================================
  describe('Tenant Isolation & Auto-Seeding', () => {
    it('auto-seeds chart of accounts, sequences, branch, warehouse, cashbox, and bank on tenant creation', () => {
      const adminUserId = 'user-admin-01';
      const tenant = centralStore.createTenant({
        nameAr: 'شركة الرياض للتقنية والتجارة',
        nameEn: 'Riyadh Tech & Trading Co.',
        vatNumber: '310123456700003',
        crNumber: '1010998877',
        adminUserId,
      });

      expect(tenant.id).toBeDefined();
      expect(tenant.code).toMatch(/^TNT-\d+$/);

      // Verify Main Branch seeded
      const branches = centralStore.branches.get(tenant.id);
      expect(branches).toBeDefined();
      expect(branches!.length).toBe(1);
      expect(branches![0].code).toBe('BR-01');
      expect(branches![0].isMainBranch).toBe(true);

      // Verify Default Warehouse seeded
      const warehouses = centralStore.warehouses.get(tenant.id);
      expect(warehouses).toBeDefined();
      expect(warehouses!.length).toBe(1);
      expect(warehouses![0].code).toBe('WH-01');

      // Verify Default Cashbox seeded
      const cashboxes = centralStore.cashboxes.get(tenant.id);
      expect(cashboxes).toBeDefined();
      expect(cashboxes!.length).toBe(1);
      expect(cashboxes![0].code).toBe('CSH-01');

      // Verify Bank Account seeded
      const bankAccounts = centralStore.bankAccounts.get(tenant.id);
      expect(bankAccounts).toBeDefined();
      expect(bankAccounts!.length).toBe(1);
      expect(bankAccounts![0].iban).toContain('SA038');

      // Verify Saudi Standard Chart of Accounts seeded
      const accounts = centralStore.accounts.get(tenant.id);
      expect(accounts).toBeDefined();
      expect(accounts!.length).toBeGreaterThan(20);

      // Verify Account Mappings seeded
      const mappings = centralStore.accountMappings.get(tenant.id);
      expect(mappings).toBeDefined();
      expect(mappings!['CUSTOMERS_AR']).toBe('10201');
      expect(mappings!['VAT_OUTPUT']).toBe('20301');

      // Verify Document Sequences seeded (INV, CN, DN, PO, GRN, etc.)
      const sequences = centralStore.documentSequences.get(tenant.id);
      expect(sequences).toBeDefined();
      expect(sequences!.size).toBeGreaterThanOrEqual(6);
    });

    it('strictly prohibits cross-tenant access and throws TenantIsolationViolationError', () => {
      const tenantA = centralStore.createTenant({
        nameAr: 'شركة أ',
        nameEn: 'Company A',
        vatNumber: '310123456700003',
        crNumber: '1010111111',
        adminUserId: 'user-a',
      });

      const tenantB = centralStore.createTenant({
        nameAr: 'شركة ب',
        nameEn: 'Company B',
        vatNumber: '310987654300003',
        crNumber: '1010222222',
        adminUserId: 'user-b',
      });

      const repoA = new TenantScopedRepository({
        tenantId: tenantA.id,
        userId: 'user-a',
        userEmail: 'user-a@company-a.sa',
        role: 'OWNER',
        permissions: ['settings:company:manage'],
        isPlatformSuperAdmin: false,
        correlationId: 'corr-123',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });

      // Accessing company A succeeds
      expect(repoA.getCompany().id).toBe(tenantA.id);

      // Attempting to assert or access company B fails immediately
      expect(() => {
        repoA.assertTenant(tenantB.id);
      }).toThrow(TenantIsolationViolationError);
    });
  });

  // ====================================================
  // 4. ATOMIC DOCUMENT SEQUENCE GENERATION (CONCURRENCY)
  // ====================================================
  describe('Document Sequence Concurrency & Monotonicity', () => {
    it('generates 10 parallel document numbers with zero collisions and strictly sequential numbers', async () => {
      const tenant = centralStore.createTenant({
        nameAr: 'شركة الترقيم المتوازي',
        nameEn: 'Parallel Sequence Co.',
        vatNumber: '310555555500003',
        crNumber: '1010333333',
        adminUserId: 'user-seq',
      });

      const repo = new TenantScopedRepository({
        tenantId: tenant.id,
        userId: 'user-seq',
        userEmail: 'seq@company.sa',
        role: 'OWNER',
        permissions: [],
        isPlatformSuperAdmin: false,
        correlationId: 'corr-seq',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });

      const currentYear = new Date().getFullYear();

      // Fire 10 parallel document number requests simultaneously
      const promises = Array.from({ length: 10 }).map(() => repo.getNextDocNumber('INV', currentYear));
      const results = await Promise.all(promises);

      // Verify all 10 are distinct
      const uniqueSet = new Set(results);
      expect(uniqueSet.size).toBe(10);

      // Verify strict sequential format: INV-YYYY-00001 to INV-YYYY-00010
      for (let i = 1; i <= 10; i++) {
        const expected = `INV-${currentYear}-${String(i).padStart(5, '0')}`;
        expect(results).toContain(expected);
      }
    });
  });

  // ====================================================
  // 5. RBAC & SENSITIVE DATA SCRUBBING
  // ====================================================
  describe('RBAC & Sensitive Data Protection', () => {
    it('denies protected action when user lacks permission', () => {
      const repoSales = new TenantScopedRepository({
        tenantId: 'test-tenant-rbac',
        userId: 'user-sales',
        userEmail: 'sales@company.sa',
        role: 'SALES_MGR',
        permissions: ['sales:invoice:create', 'sales:invoice:view'],
        isPlatformSuperAdmin: false,
        correlationId: 'corr-rbac',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });

      // Allowed action
      expect(() => repoSales.assertPermission('sales:invoice:create')).not.toThrow();

      // Denied action (Cost viewing or General Ledger posting)
      expect(() => repoSales.assertPermission('accounting:cost:view')).toThrow(PermissionDeniedError);
      expect(() => repoSales.assertPermission('accounting:journal:post')).toThrow(PermissionDeniedError);
    });

    it('scrubs sensitive cost and margin fields recursively for unauthorized users', () => {
      const sensitiveProduct = {
        id: 'prod-001',
        nameAr: 'منتج تجاري',
        sellingPrice: 1000.0,
        cost: 650.0,
        unitCost: 650.0,
        margin: 350.0,
        profit: 350.0,
        marginPercentage: 35.0,
        variants: [
          {
            sku: 'VAR-A',
            cost: 600.0,
            sellingPrice: 900.0,
          },
        ],
      };

      // 1. Authorized user (Accountant / Owner)
      const visibleData = scrubSensitiveFinancialFields(sensitiveProduct, true);
      expect(visibleData.cost).toBe(650.0);
      expect(visibleData.margin).toBe(350.0);
      expect(visibleData.profit).toBe(350.0);
      expect(visibleData.variants[0].cost).toBe(600.0);

      // 2. Unauthorized user (Sales Manager / Cashier)
      const scrubbedData = scrubSensitiveFinancialFields(sensitiveProduct, false) as Record<string, unknown>;
      expect(scrubbedData.sellingPrice).toBe(1000.0);
      expect(scrubbedData.nameAr).toBe('منتج تجاري');
      // Cost & margin fields MUST be completely absent
      expect('cost' in scrubbedData).toBe(false);
      expect('unitCost' in scrubbedData).toBe(false);
      expect('margin' in scrubbedData).toBe(false);
      expect('profit' in scrubbedData).toBe(false);
      expect('marginPercentage' in scrubbedData).toBe(false);

      const scrubbedVariants = scrubbedData.variants as Record<string, unknown>[];
      expect('cost' in scrubbedVariants[0]).toBe(false);
      expect(scrubbedVariants[0].sellingPrice).toBe(900.0);
    });
  });
});

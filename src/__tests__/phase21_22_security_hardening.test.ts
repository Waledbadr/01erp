import { describe, it, expect, beforeEach } from 'vitest';
import { centralStore } from '../../server/core/tenantGuard.js';
import {
  encryptAesGcm,
  decryptAesGcm,
  generateCsrfToken,
  verifyCsrfToken,
  scanForSecrets,
  enforceDbLeastPrivilege,
  STATUTORY_SECURITY_HEADERS,
  recordLoginAttempt,
  getLoginHistoryForTenant,
} from '../../server/core/security.js';
import {
  createBackupSnapshotService,
  verifyBackupSnapshotService,
  restoreBackupSnapshotService,
  triggerScheduledBackupService,
  listBackupSnapshotsService,
} from '../../server/modules/backup/backupService.js';
import { rotateSessionTokenService } from '../../server/core/authMiddleware.js';

describe('PHASE 21 & 22: SECURITY HARDENING, AES-256-GCM ENCRYPTION & DRILL VERIFICATION', () => {
  const tenantId = 'tenant-sec-hardening-test-01';
  const adminUserId = 'usr_admin_sec_test';
  const adminEmail = 'security-admin@saudi-erp.com';

  beforeEach(() => {
    // Seed tenant and minimal accounts for testing
    centralStore.tenants.set(tenantId, {
      id: tenantId,
      code: 'TNT-SEC-01',
      nameAr: 'مؤسسة الأمن المتقدم للتجارة',
      nameEn: 'Advanced Security Trading Est',
      vatNumber: '310000000000003',
      crNumber: '1010000001',
      nationalAddress: 'الرياض 12211 - طريق الملك فهد',
      currency: 'SAR',
      timezone: 'Asia/Riyadh',
      language: 'ar-SA',
      fiscalYearStartMonth: 1,
      accountingBasis: 'ACCRUAL',
      vatPreference: 'EXCLUSIVE',
      vatRatePercentage: 15,
      zatcaEnv: 'sandbox',
      zatcaStatus: 'CONFIGURED',
      isSuspended: false,
      onboardingCompleted: true,
      onboardingStep: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    centralStore.accounts.set(tenantId, [
      {
        id: 'acc-1',
        tenantId,
        code: '10101',
        nameAr: 'الصندوق الرئيسي',
        nameEn: 'Main Cash',
        type: 'ASSET',
        normalBalance: 'DEBIT',
        isHeader: false,
        allowPosting: true,
        sortOrder: 1,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'acc-2',
        tenantId,
        code: '40101',
        nameAr: 'إيرادات المبيعات',
        nameEn: 'Sales Revenue',
        type: 'REVENUE',
        normalBalance: 'CREDIT',
        isHeader: false,
        allowPosting: true,
        sortOrder: 2,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    ]);

    // Seed a balanced journal entry
    centralStore.journals.set(tenantId, [
      {
        id: 'jrn-1',
        tenantId,
        branchId: 'br-main',
        entryNumber: 'JV-2026-00001',
        entryDate: '2026-09-20',
        periodId: 'fp-2026-09',
        sourceType: 'MANUAL',
        sourceId: 'src-1',
        sourceKey: 'MAN-001',
        descriptionAr: 'قيد رأس المال الأولي',
        descriptionEn: 'Initial Capital Entry',
        totalDebitCents: 1000000n,
        totalCreditCents: 1000000n,
        status: 'POSTED',
        createdBy: adminUserId,
        lines: [
          {
            id: 'line-1',
            journalId: 'jrn-1',
            accountId: 'acc-1',
            accountCode: '10101',
            accountNameAr: 'الصندوق الرئيسي',
            accountNameEn: 'Main Cash',
            debitCents: 1000000n,
            creditCents: 0n,
            descriptionAr: 'حساب الصندوق مدين',
            descriptionEn: 'Cash Debit',
          },
          {
            id: 'line-2',
            journalId: 'jrn-1',
            accountId: 'acc-2',
            accountCode: '40101',
            accountNameAr: 'إيرادات المبيعات',
            accountNameEn: 'Sales Revenue',
            debitCents: 0n,
            creditCents: 1000000n,
            descriptionAr: 'حساب الإيرادات دائن',
            descriptionEn: 'Revenue Credit',
          },
        ],
        createdAt: new Date().toISOString(),
      },
    ]);
  });

  describe('1. AES-256-GCM Symmetric Authenticated Encryption at Rest', () => {
    it('encrypts plaintext payload into ciphertext, IV, and authTag', () => {
      const sensitiveFinancialData = JSON.stringify({
        tenant: 'Saudi ERP Enterprise',
        netRevenueHalalas: '55000000',
        vatPayableHalalas: '8250000',
      });

      const encrypted = encryptAesGcm(sensitiveFinancialData);

      expect(encrypted.algorithm).toBe('AES-256-GCM');
      expect(encrypted.ivHex).toHaveLength(24); // 12 bytes = 24 hex characters
      expect(encrypted.authTagHex).toHaveLength(32); // 16 bytes = 32 hex characters
      expect(encrypted.ciphertextHex.length).toBeGreaterThan(0);
      expect(encrypted.sizeBytes).toBeGreaterThan(0);
      expect(encrypted.ciphertextHex).not.toContain('Saudi ERP Enterprise');
    });

    it('decrypts encrypted artifact back to identical plaintext', () => {
      const originalPayload = 'GL-Invariant-Debit-Equals-Credit-Audit-Trail-Verified';
      const encrypted = encryptAesGcm(originalPayload);
      const decrypted = decryptAesGcm(encrypted);

      expect(decrypted).toBe(originalPayload);
    });

    it('fails and rejects decryption if ciphertext or authentication tag is tampered with', () => {
      const payload = 'Secret-Accounting-Ledger-2026';
      const encrypted = encryptAesGcm(payload);

      // Tamper with ciphertext
      const tamperedCiphertext = {
        ...encrypted,
        ciphertextHex: encrypted.ciphertextHex.slice(0, -2) + 'ff',
      };
      expect(() => decryptAesGcm(tamperedCiphertext)).toThrow();

      // Tamper with auth tag
      const tamperedTag = {
        ...encrypted,
        tagHex: '00000000000000000000000000000000',
        authTagHex: '00000000000000000000000000000000',
      };
      expect(() => decryptAesGcm(tamperedTag)).toThrow();
    });
  });

  describe('2. Backup Snapshot Creation with Retention Tiers & Encryption Metadata', () => {
    it('creates an AES-256-GCM encrypted snapshot with retention tier and offsite storage location', () => {
      const snapshot = createBackupSnapshotService(
        tenantId,
        adminUserId,
        adminEmail,
        'Quarterly Financial Close Backup',
        'MANUAL',
        'QUARTERLY_90D',
        'OFFSITE_SECURE_VAULT'
      );

      expect(snapshot.id).toBeDefined();
      expect(snapshot.tenantId).toBe(tenantId);
      expect(snapshot.encryptionAlgorithm).toBe('AES-256-GCM');
      expect(snapshot.retentionTier).toBe('QUARTERLY_90D');
      expect(snapshot.storageLocation).toBe('OFFSITE_SECURE_VAULT');
      expect(snapshot.checksumSha256).toHaveLength(64);
      expect(snapshot.entityCounts.accounts).toBe(2);
      expect(snapshot.entityCounts.journals).toBe(1);
      expect(snapshot.entityCounts.journalLines).toBe(2);
      expect(snapshot.encryptedArtifactSize).toBeGreaterThan(0);
    });

    it('creates scheduled backup job via triggerScheduledBackupService', () => {
      const scheduledBkp = triggerScheduledBackupService(
        tenantId,
        'SCHEDULED_WEEKLY_FULL',
        'ANNUAL_365D'
      );

      expect(scheduledBkp.type).toBe('SCHEDULED_WEEKLY_FULL');
      expect(scheduledBkp.retentionTier).toBe('ANNUAL_365D');
      expect(scheduledBkp.storageLocation).toBe('OFFSITE_SECURE_VAULT');
      expect(scheduledBkp.createdByEmail).toBe('scheduler@saudi-erp.com');
    });
  });

  describe('3. Automated Restoration Drill & Integrity Verification (Zero-Drift Check)', () => {
    it('runs staging drill verifying checksum, AES-256-GCM decryption, and Trial Balance Zero Drift', () => {
      const snapshot = createBackupSnapshotService(
        tenantId,
        adminUserId,
        adminEmail,
        'Verification Drill Test Snapshot',
        'SCHEDULED',
        'DAILY_7D'
      );

      const drillReport = verifyBackupSnapshotService(
        tenantId,
        snapshot.id,
        adminUserId,
        adminEmail
      );

      expect(drillReport).not.toBeNull();
      expect(drillReport?.status).toBe('PASSED');
      expect(drillReport?.checksumMatches).toBe(true);
      expect(drillReport?.payloadStructureValid).toBe(true);
      expect(drillReport?.glDebitsEqualCredits).toBe(true);
      expect(drillReport?.trialBalanceZeroDrift).toBe(true);
      expect(drillReport?.spotJournalAudit.checkedCount).toBe(1);
      expect(drillReport?.spotJournalAudit.passedCount).toBe(1);
      expect(drillReport?.spotJournalAudit.failedCount).toBe(0);
      expect(drillReport?.measuredRestoreMs).toBeGreaterThan(0);

      // Verify the snapshot metadata is marked as drill-passed
      const all = listBackupSnapshotsService(tenantId);
      const updated = all.find((b) => b.id === snapshot.id);
      expect(updated?.isVerifiedDrillPassed).toBe(true);
      expect(updated?.verifiedAt).toBeDefined();
    });
  });

  describe('4. Disaster Recovery Restoration with Mandatory Justification & Safety Snapshot', () => {
    it('rejects restoration if operational justification is missing or shorter than 10 characters', () => {
      const snapshot = createBackupSnapshotService(tenantId, adminUserId, adminEmail);

      expect(() =>
        restoreBackupSnapshotService(tenantId, snapshot.id, adminUserId, adminEmail, 'short')
      ).toThrowError(/JUSTIFICATION_REQUIRED/);

      expect(() =>
        restoreBackupSnapshotService(tenantId, snapshot.id, adminUserId, adminEmail, '          ')
      ).toThrowError(/JUSTIFICATION_REQUIRED/);
    });

    it('executes disaster recovery restore, creates safety snapshot, restores data, and benchmarks duration', () => {
      const initialAccounts = centralStore.accounts.get(tenantId) || [];
      const baselineSnapshot = createBackupSnapshotService(tenantId, adminUserId, adminEmail, 'Baseline State');

      // Alter tenant data by adding an unauthorized account
      const modifiedAccounts = [
        ...initialAccounts,
        {
          id: 'acc-unauthorized',
          tenantId,
          code: '88888',
          nameAr: 'حساب غير مصرح به',
          nameEn: 'Unauthorized Account',
          type: 'EXPENSE' as const,
          normalBalance: 'DEBIT' as const,
          isHeader: false,
          allowPosting: true,
          sortOrder: 99,
          isActive: true,
          createdAt: new Date().toISOString(),
        },
      ];
      centralStore.accounts.set(tenantId, modifiedAccounts);
      expect(centralStore.accounts.get(tenantId)?.length).toBe(initialAccounts.length + 1);

      // Execute restore with valid justification
      const justification = 'Formal disaster recovery drill authorized by Enterprise Risk Officer';
      const result = restoreBackupSnapshotService(
        tenantId,
        baselineSnapshot.id,
        adminUserId,
        adminEmail,
        justification
      );

      expect(result.success).toBe(true);
      expect(result.restoredFromBackupId).toBe(baselineSnapshot.id);
      expect(result.preRestoreSafetyBackupId).toBeDefined();
      expect(result.justificationReason).toBe(justification);
      expect(result.restoreDurationMs).toBeGreaterThan(0);

      // State is accurately restored
      const restored = centralStore.accounts.get(tenantId) || [];
      expect(restored.length).toBe(initialAccounts.length);
      expect(restored.some((a) => a.code === '88888')).toBe(false);
    });
  });

  describe('5. Statutory Security Headers Enforcement', () => {
    it('contains all required security headers per docs/SECURITY.md Section 4', () => {
      expect(STATUTORY_SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff');
      expect(STATUTORY_SECURITY_HEADERS['X-Frame-Options']).toBe('SAMEORIGIN');
      expect(STATUTORY_SECURITY_HEADERS['Strict-Transport-Security']).toContain('max-age=31536000');
      expect(STATUTORY_SECURITY_HEADERS['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
      expect(STATUTORY_SECURITY_HEADERS['Content-Security-Policy']).toContain("default-src 'self'");
    });
  });

  describe('6. Cryptographic Anti-CSRF Token Generation & Verification', () => {
    it('generates a signed CSRF token bound to a session and validates it', () => {
      const sessionToken = 'session-test-token-778899';
      const csrfToken = generateCsrfToken(sessionToken);

      expect(csrfToken).toBeDefined();
      expect(csrfToken.split('.')).toHaveLength(3); // timestamp.random.signature

      const isValid = verifyCsrfToken(csrfToken, sessionToken);
      expect(isValid).toBe(true);
    });

    it('rejects CSRF tokens bound to another session or forged signatures', () => {
      const sessionTokenA = 'session-user-a';
      const sessionTokenB = 'session-user-b';

      const tokenA = generateCsrfToken(sessionTokenA);

      // Verifying token A with session B must fail
      expect(verifyCsrfToken(tokenA, sessionTokenB)).toBe(false);

      // Forged token must fail
      const forged = `${tokenA.split('.')[0]}.${tokenA.split('.')[1]}.forged_sig_12345`;
      expect(verifyCsrfToken(forged, sessionTokenA)).toBe(false);

      // Malformed token must fail
      expect(verifyCsrfToken('malformed-token', sessionTokenA)).toBe(false);
    });
  });

  describe('7. Session Token Rotation on Privilege Change', () => {
    it('rotates session token safely, invalidating old token and maintaining active session', () => {
      const oldToken = 'session-pre-rotation-001';
      centralStore.sessions.set(oldToken, {
        id: 'sess-id-1',
        sessionToken: oldToken,
        userId: adminUserId,
        tenantId,
        role: 'ACCOUNTANT',
        createdAt: new Date().toISOString(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        lastActiveAt: Date.now(),
      });

      const { newToken, session } = rotateSessionTokenService(oldToken);

      expect(newToken).toBeDefined();
      expect(newToken).not.toBe(oldToken);
      expect(centralStore.sessions.has(oldToken)).toBe(false);
      expect(centralStore.sessions.has(newToken)).toBe(true);
      expect(session.userId).toBe(adminUserId);
    });

    it('throws error when attempting to rotate non-existent session', () => {
      expect(() => rotateSessionTokenService('non-existent-token')).toThrowError(/INVALID_SESSION/);
    });
  });

  describe('8. Zero-Secrets Canary Scanner & Database Least-Privilege Protection', () => {
    it('detects exposed API keys, private keys, or credentials in payload content', () => {
      const cleanContent = 'const taxRate = 0.15; const currency = "SAR";';
      const cleanScan = scanForSecrets(cleanContent);
      expect(cleanScan.found).toBe(false);
      expect(cleanScan.matches).toHaveLength(0);

      const leakyContent = 'const apiKey = "sk_live_99887766554433221100";';
      const leakyScan = scanForSecrets(leakyContent);
      expect(leakyScan.found).toBe(true);
      expect(leakyScan.matches[0].type).toBe('LIVE_API_KEY');

      const privateKeyContent = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----';
      const pkScan = scanForSecrets(privateKeyContent);
      expect(pkScan.found).toBe(true);
      expect(pkScan.matches[0].type).toBe('PRIVATE_KEY');
    });

    it('enforces database least-privilege rules, blocking destructive SQL operations', () => {
      expect(() => enforceDbLeastPrivilege('DROP DATABASE saudi_erp;')).toThrowError(/DB_LEAST_PRIVILEGE_VIOLATION/);
      expect(() => enforceDbLeastPrivilege('TRUNCATE TABLE users;')).toThrowError(/DB_LEAST_PRIVILEGE_VIOLATION/);
      expect(() => enforceDbLeastPrivilege('ALTER SYSTEM SET max_connections = 1000;')).toThrowError(/DB_LEAST_PRIVILEGE_VIOLATION/);

      // Safe query without tenant filter warning/rejection
      expect(() => enforceDbLeastPrivilege('SELECT * FROM accounts WHERE tenant_id = $1;', tenantId)).not.toThrow();
    });

    it('records and retrieves login audit history with device and IP tracking', () => {
      recordLoginAttempt({
        tenantId,
        userId: adminUserId,
        userEmail: adminEmail,
        status: 'SUCCESS',
        ipAddress: '196.200.1.50',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        mfaUsed: true,
      });

      recordLoginAttempt({
        tenantId,
        userId: 'usr_unknown',
        userEmail: 'attacker@evil.com',
        status: 'FAILED',
        failureReason: 'INVALID_CREDENTIALS',
        ipAddress: '45.33.32.156',
        userAgent: 'curl/7.68.0',
        mfaUsed: false,
      });

      const history = getLoginHistoryForTenant(tenantId);
      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history.some((h) => h.status === 'SUCCESS' && h.mfaUsed)).toBe(true);
      expect(history.some((h) => h.status === 'FAILED' && h.failureReason === 'INVALID_CREDENTIALS')).toBe(true);
    });
  });
});

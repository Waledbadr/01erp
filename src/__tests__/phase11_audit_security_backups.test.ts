import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { centralStore, TenantScopedRepository, TenantContext } from '../../server/core/tenantGuard.js';
import {
  computeChainedLogHash,
  getFilteredAuditLogsService,
  verifyAuditChainIntegrityService,
  getAuditStatsService,
  exportAuditLogsToCsv,
  AUDIT_GENESIS_HASH,
} from '../../server/modules/audit/auditService.js';
import {
  base32Encode,
  base32Decode,
  computeTotp,
  verifyTotpToken,
  getActiveSessionsService,
  revokeSessionService,
  revokeAllOtherSessionsService,
  generateTwoFactorSetupService,
  enableTwoFactorService,
  validateDangerousOperationService,
  runComplianceScannerService,
} from '../../server/modules/security/securityService.js';
import {
  createBackupSnapshotService,
  listBackupSnapshotsService,
  getBackupSnapshotService,
  downloadBackupSnapshotService,
  verifyBackupSnapshotService,
  restoreBackupSnapshotService,
} from '../../server/modules/backup/backupService.js';

describe('PHASE 11: AUDIT TRAIL, SECURITY HARDENING & BACKUP RESTORE (docs/SECURITY.md, docs/BACKUPS.md)', () => {
  let tenantId: string;
  let adminUserId: string;
  let adminEmail: string;
  let context: TenantContext;
  let repo: TenantScopedRepository;
  let sessionToken: string;

  beforeEach(() => {
    adminUserId = `user-admin-${crypto.randomUUID().slice(0, 8)}`;
    adminEmail = 'compliance-officer@saudi-erp.sa';
    sessionToken = `session-${crypto.randomUUID()}`;

    // Initialize tenant in centralStore
    centralStore.createTenant({
      nameAr: 'شركة الحماية والتدقيق المتقدمة المحدودة',
      nameEn: 'Advanced Protection & Audit Co. Ltd.',
      vatNumber: '310000000000003',
      crNumber: '1010000001',
      adminUserId,
    });

    const tenant = Array.from(centralStore.tenants.values()).pop()!;
    tenantId = tenant.id;

    context = {
      tenantId,
      userId: adminUserId,
      userEmail: adminEmail,
      role: 'OWNER',
      permissions: ['ALL'],
      correlationId: 'test-p11-corr-id',
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    repo = new TenantScopedRepository(context);

    // Register test session
    centralStore.sessions.set(sessionToken, {
      userId: adminUserId,
      email: adminEmail,
      tenantId,
      role: 'OWNER',
      permissions: ['ALL'],
      branchId: 'BR-01',
      ipAddress: '192.168.1.100',
      userAgent: context.userAgent,
      deviceFingerprint: 'fp-chrome-windows',
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      expiresAt: Date.now() + 8 * 3600 * 1000,
    });
  });

  // =========================================================================
  // 1. AUDIT TRAIL & TAMPER-EVIDENT SHA-256 CHAINING
  // =========================================================================
  describe('1. Immutable Audit Logging & Cryptographic Integrity', () => {
    it('records immutable audit log entries and verifies tamper-evident SHA-256 chain', () => {
      // Record operations
      centralStore.recordAuditLog({
        tenantId,
        userId: adminUserId,
        userEmail: adminEmail,
        action: 'POST_JOURNAL',
        resourceType: 'journals',
        resourceId: 'JRN-2025-001',
        correlationId: 'corr-001',
        changesDiff: { totalDebit: '1000.00' },
      });

      centralStore.recordAuditLog({
        tenantId,
        userId: adminUserId,
        userEmail: adminEmail,
        action: 'REGISTER_FIXED_ASSET',
        resourceType: 'fixed_assets',
        resourceId: 'AST-2025-001',
        correlationId: 'corr-002',
        changesDiff: { assetName: 'Production Server' },
      });

      // Fetch filtered logs
      const { logs, total } = getFilteredAuditLogsService(tenantId, { limit: 10 });
      expect(total).toBeGreaterThanOrEqual(2);
      expect(logs[0].userEmail).toBe(adminEmail);

      // Verify SHA-256 hash chaining
      const chainVerification = verifyAuditChainIntegrityService(tenantId);
      expect(chainVerification.isValid).toBe(true);
      expect(chainVerification.verifiedCount).toBeGreaterThanOrEqual(2);
      expect(chainVerification.latestHash).not.toBe(AUDIT_GENESIS_HASH);

      // Compute individual hash
      const singleHash = computeChainedLogHash(AUDIT_GENESIS_HASH, logs[0]);
      expect(singleHash).toHaveLength(64); // Valid SHA-256 hex string
    });

    it('detects tampering in audit trail when an entry is maliciously modified', () => {
      const log1 = centralStore.recordAuditLog({
        tenantId,
        userId: adminUserId,
        userEmail: adminEmail,
        action: 'BACKUP_CREATE',
        resourceType: 'backups',
        resourceId: 'BKP-001',
        correlationId: 'corr-b1',
      });

      // Assign valid chained hash
      const validHash = computeChainedLogHash(AUDIT_GENESIS_HASH, log1);
      (log1 as any).chainedHash = validHash;

      const verificationBefore = verifyAuditChainIntegrityService(tenantId);
      expect(verificationBefore.isValid).toBe(true);

      // Tamper with action
      (log1 as any).chainedHash = 'malicious_tampered_hash_0000000000000000000000000000000000000000';
      const verificationAfter = verifyAuditChainIntegrityService(tenantId);
      expect(verificationAfter.isValid).toBe(false);
      expect(verificationAfter.discrepancyLogId).toBe(log1.id);
    });

    it('filters audit logs by action and search keywords', () => {
      centralStore.recordAuditLog({
        tenantId,
        userId: adminUserId,
        userEmail: adminEmail,
        action: 'CLOSE_PERIOD',
        resourceType: 'financial_periods',
        resourceId: 'FP-JAN-2025',
        correlationId: 'corr-p1',
        reason: 'Monthly closing sign-off',
      });

      const filtered = getFilteredAuditLogsService(tenantId, { action: 'CLOSE_PERIOD' });
      expect(filtered.logs.length).toBeGreaterThanOrEqual(1);
      expect(filtered.logs[0].action).toBe('CLOSE_PERIOD');

      const searchResult = getFilteredAuditLogsService(tenantId, { search: 'closing sign-off' });
      expect(searchResult.logs.length).toBeGreaterThanOrEqual(1);
    });

    it('generates statutory CSV export for audit records', () => {
      centralStore.recordAuditLog({
        tenantId,
        userId: adminUserId,
        userEmail: adminEmail,
        action: 'EXPORT_DATA',
        resourceType: 'reports',
        resourceId: 'REP-TAX-2025',
        correlationId: 'corr-exp',
      });

      const csv = exportAuditLogsToCsv(tenantId);
      expect(csv).toContain('Log ID,Timestamp (UTC),User Email,Action,Resource Type');
      expect(csv).toContain(adminEmail);
      expect(csv).toContain('EXPORT_DATA');
    });

    it('computes summary statistics for audit dashboard', () => {
      centralStore.recordAuditLog({
        tenantId,
        userId: adminUserId,
        userEmail: adminEmail,
        action: 'POST_JOURNAL',
        resourceType: 'journals',
        resourceId: 'JRN-STAT-001',
        correlationId: 'corr-stat-1',
      });

      const stats = getAuditStatsService(tenantId);
      expect(stats.totalLogs).toBeGreaterThanOrEqual(1);
      expect(stats.topActions.length).toBeGreaterThanOrEqual(1);
      expect(stats.tamperEvidentChainValid).toBe(true);
    });
  });

  // =========================================================================
  // 2. SESSION SECURITY & TWO-FACTOR AUTHENTICATION (TOTP)
  // =========================================================================
  describe('2. Session Management & 2FA Hardening', () => {
    it('lists active sessions with device and browser inspection', () => {
      const sessions = getActiveSessionsService(tenantId, sessionToken, adminUserId, true);
      expect(sessions.length).toBeGreaterThanOrEqual(1);

      const current = sessions.find((s) => s.isCurrentSession);
      expect(current).toBeDefined();
      expect(current?.browser).toBe('Google Chrome');
      expect(current?.os).toBe('Windows');
      expect(current?.deviceType).toBe('DESKTOP');
      expect(current?.ipAddress).toBe('192.168.1.100');
    });

    it('revokes a specific session and terminates unauthorized access', () => {
      const otherToken = `other-session-${crypto.randomUUID()}`;
      centralStore.sessions.set(otherToken, {
        userId: adminUserId,
        email: adminEmail,
        tenantId,
        role: 'ACCOUNTANT',
        permissions: ['accounting:journal:view'],
        ipAddress: '10.0.0.5',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        deviceFingerprint: 'fp-iphone',
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        expiresAt: Date.now() + 3600000,
      });

      expect(centralStore.sessions.has(otherToken)).toBe(true);

      const revoked = revokeSessionService(tenantId, otherToken, adminUserId, adminEmail);
      expect(revoked).toBe(true);
      expect(centralStore.sessions.has(otherToken)).toBe(false);

      // Verify audit log
      const latestAudit = centralStore.auditLogs[0];
      expect(latestAudit.action).toBe('SESSION_REVOKED');
    });

    it('revokes all other active sessions leaving only the current session active', () => {
      const token2 = `token2-${crypto.randomUUID()}`;
      const token3 = `token3-${crypto.randomUUID()}`;

      centralStore.sessions.set(token2, {
        userId: adminUserId,
        email: adminEmail,
        tenantId,
        role: 'OWNER',
        permissions: ['ALL'],
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        expiresAt: Date.now() + 3600000,
      });
      centralStore.sessions.set(token3, {
        userId: adminUserId,
        email: adminEmail,
        tenantId,
        role: 'OWNER',
        permissions: ['ALL'],
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        expiresAt: Date.now() + 3600000,
      });

      const count = revokeAllOtherSessionsService(tenantId, sessionToken, adminUserId, adminEmail);
      expect(count).toBeGreaterThanOrEqual(2);
      expect(centralStore.sessions.has(sessionToken)).toBe(true);
      expect(centralStore.sessions.has(token2)).toBe(false);
      expect(centralStore.sessions.has(token3)).toBe(false);
    });

    it('generates and verifies standard RFC 6238 TOTP 2FA credentials', () => {
      // Setup
      const setup = generateTwoFactorSetupService(adminEmail);
      expect(setup.secret).toBeDefined();
      expect(setup.secret.length).toBeGreaterThanOrEqual(16);
      expect(setup.otpauthUri).toContain('otpauth://totp/SaudiERP');
      expect(setup.recoveryCodes).toHaveLength(8);

      // Compute code using current timestamp
      const validCode = computeTotp(setup.secret, 0);
      expect(validCode).toMatch(/^\d{6}$/);

      // Verify valid token
      const isValid = verifyTotpToken(setup.secret, validCode);
      expect(isValid).toBe(true);

      // Verify invalid token rejection
      expect(verifyTotpToken(setup.secret, '000000')).toBe(false);
      expect(verifyTotpToken(setup.secret, 'abc')).toBe(false);

      // Enable 2FA on user
      const user = {
        id: adminUserId,
        email: adminEmail,
        name: 'Compliance Officer',
        role: 'OWNER',
      };
      centralStore.users.set(adminUserId, user as any);

      const enableRes = enableTwoFactorService(
        adminUserId,
        adminEmail,
        tenantId,
        setup.secret,
        validCode,
        setup.recoveryCodes
      );
      expect(enableRes.success).toBe(true);

      const updatedUser = centralStore.users.get(adminUserId) as any;
      expect(updatedUser.twoFactorEnabled).toBe(true);
      expect(updatedUser.twoFactorSecret).toBe(setup.secret);
    });
  });

  // =========================================================================
  // 3. DANGEROUS OPERATIONS CONFIRMATION PROTOCOL
  // =========================================================================
  describe('3. Dangerous Operations Protocol', () => {
    it('rejects dangerous operations with insufficient or missing justification', () => {
      const res = validateDangerousOperationService(tenantId, adminUserId, adminEmail, {
        operationType: 'REVERSE_JOURNAL',
        targetResourceId: 'JRN-100',
        justification: 'mistake', // < 10 chars
      });

      expect(res.approved).toBe(false);
      expect(res.errorAr).toContain('10 أحرف');
    });

    it('approves properly justified dangerous operation and creates audit trail', () => {
      const res = validateDangerousOperationService(tenantId, adminUserId, adminEmail, {
        operationType: 'REVERSE_JOURNAL',
        targetResourceId: 'JRN-2025-0099',
        justification: 'Approved error correction per audit committee memo #42 dated 2025-09-15',
      });

      expect(res.approved).toBe(true);

      const latestAudit = centralStore.auditLogs[0];
      expect(latestAudit.action).toBe('DANGEROUS_OP_CONFIRMED');
      expect(latestAudit.resourceType).toBe('REVERSE_JOURNAL');
      expect(latestAudit.reason).toContain('audit committee memo');
    });
  });

  // =========================================================================
  // 4. BACKUP & DISASTER RECOVERY PROTOCOL (docs/BACKUPS.md)
  // =========================================================================
  describe('4. Backup Snapshot, Verification Drill & Disaster Recovery Restore', () => {
    it('creates on-demand tenant backup snapshot with deterministic SHA-256 checksum', () => {
      const snapshot = createBackupSnapshotService(
        tenantId,
        adminUserId,
        adminEmail,
        'Pre-upgrade full system snapshot',
        'MANUAL'
      );

      expect(snapshot.id).toBeDefined();
      expect(snapshot.snapshotNumber).toMatch(/^BKP-\d{4}-\d{5}$/);
      expect(snapshot.sizeBytes).toBeGreaterThan(0);
      expect(snapshot.checksumSha256).toHaveLength(64);
      expect(snapshot.entityCounts.accounts).toBeGreaterThanOrEqual(1);

      // Ensure listed in catalog
      const list = listBackupSnapshotsService(tenantId);
      expect(list.some((b) => b.id === snapshot.id)).toBe(true);

      // Verify audit log written
      const audit = centralStore.auditLogs.find((l) => l.action === 'BACKUP_CREATE');
      expect(audit).toBeDefined();
      expect(audit?.resourceId).toBe(snapshot.id);
    });

    it('downloads backup snapshot archive with SHA-256 header and valid JSON payload', () => {
      const snapshot = createBackupSnapshotService(tenantId, adminUserId, adminEmail, 'Download test');
      const download = downloadBackupSnapshotService(tenantId, snapshot.id, adminUserId, adminEmail);

      expect(download).not.toBeNull();
      expect(download?.checksumSha256).toBe(snapshot.checksumSha256);
      expect(download?.filename).toContain(snapshot.snapshotNumber);

      const parsed = JSON.parse(download!.payloadJson);
      expect(parsed.tenantId).toBe(tenantId);
      expect(parsed.data.accounts).toBeDefined();
    });

    it('performs automated restoration drill and validates Rule G1 GL Invariant', () => {
      const snapshot = createBackupSnapshotService(tenantId, adminUserId, adminEmail, 'Verification drill test');
      const report = verifyBackupSnapshotService(tenantId, snapshot.id, adminUserId, adminEmail);

      expect(report).not.toBeNull();
      expect(report?.status).toBe('PASSED');
      expect(report?.checksumMatches).toBe(true);
      expect(report?.payloadStructureValid).toBe(true);
      expect(report?.glDebitsEqualCredits).toBe(true);
      expect(report?.findingsAr.length).toBeGreaterThanOrEqual(1);
    });

    it('executes disaster recovery restore with automatic pre-restore safety snapshot', () => {
      // 1. Create baseline snapshot
      const baselineSnapshot = createBackupSnapshotService(
        tenantId,
        adminUserId,
        adminEmail,
        'Baseline snapshot before changes'
      );

      // 2. Perform state changes in tenant
      const initialAccounts = centralStore.accounts.get(tenantId) || [];
      const modifiedAccounts = [
        ...initialAccounts,
        {
          id: 'acc-temp-test',
          tenantId,
          code: '99999',
          nameAr: 'حساب مؤقت تجريبي',
          nameEn: 'Temporary Test Account',
          type: 'ASSET' as any,
          subType: 'CURRENT_ASSET' as any,
          level: 3,
          isDebitNormal: true,
          normalBalance: 'DEBIT' as any,
          isHeader: false,
          allowPosting: true,
          allowsPosting: true,
          sortOrder: 99999,
          isActive: true,
          balanceCents: 0n,
          createdAt: new Date().toISOString(),
        },
      ];
      centralStore.accounts.set(tenantId, modifiedAccounts);
      expect(centralStore.accounts.get(tenantId)?.length).toBe(initialAccounts.length + 1);

      // 3. Execute disaster recovery restore to baseline
      const restoreResult = restoreBackupSnapshotService(
        tenantId,
        baselineSnapshot.id,
        adminUserId,
        adminEmail
      );

      expect(restoreResult.success).toBe(true);
      expect(restoreResult.restoredFromBackupId).toBe(baselineSnapshot.id);
      expect(restoreResult.preRestoreSafetyBackupId).toBeDefined();

      // 4. Verify tenant state restored to original accounts count
      const restoredAccounts = centralStore.accounts.get(tenantId) || [];
      expect(restoredAccounts.length).toBe(initialAccounts.length);
      expect(restoredAccounts.some((a) => a.code === '99999')).toBe(false);

      // 5. Verify audit log BACKUP_RESTORE written with pre-restore safety snapshot reference
      const restoreAudit = centralStore.auditLogs.find((l) => l.action === 'BACKUP_RESTORE');
      expect(restoreAudit).toBeDefined();
      expect(restoreAudit?.changesDiff?.preRestoreSafetyBackupId).toBe(restoreResult.preRestoreSafetyBackupId);
    });
  });

  // =========================================================================
  // 5. ENTERPRISE COMPLIANCE & SECURITY SCANNER
  // =========================================================================
  describe('5. Enterprise Compliance & Security Scanner', () => {
    it('runs comprehensive scanner covering multi-tenancy, GL invariant, 2FA and backups', () => {
      const report = runComplianceScannerService(tenantId);

      expect(report.scannedAt).toBeDefined();
      expect(report.overallScorePercentage).toBeGreaterThanOrEqual(80);
      expect(report.items.length).toBeGreaterThanOrEqual(6);

      const isolationCheck = report.items.find((i) => i.id === 'SEC-01');
      expect(isolationCheck?.status).toBe('COMPLIANT');

      const glCheck = report.items.find((i) => i.id === 'ACC-01');
      expect(glCheck?.status).toBe('COMPLIANT');

      const chainCheck = report.items.find((i) => i.id === 'SEC-02');
      expect(chainCheck?.status).toBe('COMPLIANT');

      const backupCheck = report.items.find((i) => i.id === 'BKP-01');
      expect(backupCheck?.status).toBe('COMPLIANT');
    });
  });
});

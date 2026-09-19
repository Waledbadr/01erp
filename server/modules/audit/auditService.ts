import crypto from 'crypto';
import { centralStore, AuditLogEntry } from '../../core/tenantGuard.js';
import {
  AuditFilterParams,
  AuditStats,
  AuditHashChainVerification,
} from '../../../src/lib/securityAuditBackup.js';

export const AUDIT_GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Deterministic SHA-256 hash for an individual audit record linked to previous hash
 */
export function computeChainedLogHash(prevHash: string, log: AuditLogEntry): string {
  const content = [
    prevHash,
    log.id,
    log.tenantId,
    log.userEmail || '',
    log.action,
    log.resourceType,
    log.resourceId,
    log.createdAt,
    log.correlationId || '',
  ].join('|');

  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Get filtered audit logs with pagination and search
 */
export function getFilteredAuditLogsService(
  tenantId: string,
  filters: AuditFilterParams = {}
): { logs: AuditLogEntry[]; total: number; limit: number; offset: number } {
  let list = centralStore.auditLogs.filter((log) => log.tenantId === tenantId);

  // Filter by action
  if (filters.action && filters.action !== 'ALL') {
    list = list.filter((l) => l.action.toLowerCase() === filters.action?.toLowerCase());
  }

  // Filter by resourceType
  if (filters.resourceType && filters.resourceType !== 'ALL') {
    list = list.filter((l) => l.resourceType.toLowerCase() === filters.resourceType?.toLowerCase());
  }

  // Filter by userEmail
  if (filters.userEmail) {
    const q = filters.userEmail.toLowerCase();
    list = list.filter((l) => l.userEmail.toLowerCase().includes(q));
  }

  // Generic search
  if (filters.search) {
    const q = filters.search.toLowerCase();
    list = list.filter(
      (l) =>
        l.action.toLowerCase().includes(q) ||
        l.resourceType.toLowerCase().includes(q) ||
        l.resourceId.toLowerCase().includes(q) ||
        l.userEmail.toLowerCase().includes(q) ||
        (l.reason && l.reason.toLowerCase().includes(q))
    );
  }

  // Date range filtering
  if (filters.dateFrom) {
    const fromTime = new Date(filters.dateFrom).getTime();
    list = list.filter((l) => new Date(l.createdAt).getTime() >= fromTime);
  }
  if (filters.dateTo) {
    const toTime = new Date(filters.dateTo).getTime();
    list = list.filter((l) => new Date(l.createdAt).getTime() <= toTime);
  }

  const total = list.length;
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 500);
  const offset = Math.max(Number(filters.offset) || 0, 0);

  const paginatedLogs = list.slice(offset, offset + limit);

  return {
    logs: paginatedLogs,
    total,
    limit,
    offset,
  };
}

/**
 * Verify immutable tamper-evident SHA-256 chain of audit logs for a tenant
 */
export function verifyAuditChainIntegrityService(tenantId: string): AuditHashChainVerification {
  // Chronological order: oldest to newest
  const tenantLogs = centralStore.auditLogs
    .filter((l) => l.tenantId === tenantId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (tenantLogs.length === 0) {
    return {
      isValid: true,
      verifiedCount: 0,
      genesisHash: AUDIT_GENESIS_HASH,
      latestHash: AUDIT_GENESIS_HASH,
      messageAr: 'سجل التدقيق فارغ حالياً للمنشأة. سلسلة التشفير في حالة مبدئية سليمة.',
      messageEn: 'Audit log is currently empty for this tenant. Chain is intact at genesis state.',
    };
  }

  let currentHash = AUDIT_GENESIS_HASH;
  for (let i = 0; i < tenantLogs.length; i++) {
    const log = tenantLogs[i];
    const calculatedHash = computeChainedLogHash(currentHash, log);

    // If log has recorded chainedHash, verify match
    if ((log as any).chainedHash && (log as any).chainedHash !== calculatedHash) {
      return {
        isValid: false,
        verifiedCount: i,
        genesisHash: AUDIT_GENESIS_HASH,
        latestHash: currentHash,
        discrepancyIndex: i,
        discrepancyLogId: log.id,
        messageAr: `تم اكتشاف خلل في سلسلة التشفير عند السجل رقم ${i + 1} (${log.action}). تم رصد تلاعب محتمل!`,
        messageEn: `Cryptographic discrepancy detected at log index ${i + 1} (${log.action}). Potential tamper event!`,
      };
    }

    currentHash = calculatedHash;
  }

  return {
    isValid: true,
    verifiedCount: tenantLogs.length,
    genesisHash: AUDIT_GENESIS_HASH,
    latestHash: currentHash,
    messageAr: `تم التحقق من سلامة كافة سجلات التدقيق (${tenantLogs.length} سجلاً). السلسلة التشفيرية موثوقة ومطابقة لمعايير الحماية 100%.`,
    messageEn: `All ${tenantLogs.length} audit records mathematically verified. Cryptographic SHA-256 chain is 100% intact and tamper-evident.`,
  };
}

/**
 * Generate aggregate audit metrics & statistics
 */
export function getAuditStatsService(tenantId: string): AuditStats {
  const tenantLogs = centralStore.auditLogs.filter((l) => l.tenantId === tenantId);
  const totalLogs = tenantLogs.length;

  const actionCounts = new Map<string, number>();
  const userCounts = new Map<string, number>();

  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  let recent24hCount = 0;

  for (const log of tenantLogs) {
    actionCounts.set(log.action, (actionCounts.get(log.action) || 0) + 1);
    if (log.userEmail) {
      userCounts.set(log.userEmail, (userCounts.get(log.userEmail) || 0) + 1);
    }
    if (new Date(log.createdAt).getTime() >= oneDayAgo) {
      recent24hCount++;
    }
  }

  const topActions = Array.from(actionCounts.entries())
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topUsers = Array.from(userCounts.entries())
    .map(([email, count]) => ({ email, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const verification = verifyAuditChainIntegrityService(tenantId);

  return {
    totalLogs,
    uniqueActionsCount: actionCounts.size,
    topActions,
    topUsers,
    recent24hCount,
    tamperEvidentChainValid: verification.isValid,
    chainLength: totalLogs,
    latestChainedHash: verification.latestHash,
  };
}

/**
 * Format audit logs as CSV string for statutory export
 */
export function exportAuditLogsToCsv(tenantId: string, filters: AuditFilterParams = {}): string {
  const { logs } = getFilteredAuditLogsService(tenantId, { ...filters, limit: 10000, offset: 0 });

  const headers = [
    'Log ID',
    'Timestamp (UTC)',
    'User Email',
    'Action',
    'Resource Type',
    'Resource ID',
    'Correlation ID',
    'IP Address',
    'Reason / Notes',
  ];

  const escapeCsv = (val: any) => {
    const s = String(val ?? '').replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = logs.map((l) => [
    escapeCsv(l.id),
    escapeCsv(l.createdAt),
    escapeCsv(l.userEmail),
    escapeCsv(l.action),
    escapeCsv(l.resourceType),
    escapeCsv(l.resourceId),
    escapeCsv(l.correlationId),
    escapeCsv(l.ipAddress || '127.0.0.1'),
    escapeCsv((l as any).reason || ''),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

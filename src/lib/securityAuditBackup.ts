/**
 * Security, Audit Trail & Disaster Recovery Domain Library — Saudi ERP
 * Enforces docs/SECURITY.md, docs/BACKUPS.md, and Saudi Statutory Compliance.
 */

export type AuditActionType =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'POST'
  | 'POST_JOURNAL'
  | 'REVERSE'
  | 'REVERSE_JOURNAL'
  | 'CLOSE_PERIOD'
  | 'REOPEN_PERIOD'
  | 'LOGIN'
  | 'LOGOUT'
  | 'FAILED_LOGIN'
  | 'EXPORT_DATA'
  | 'BACKUP_CREATE'
  | 'BACKUP_RESTORE'
  | 'BACKUP_DOWNLOAD'
  | 'BACKUP_VERIFY'
  | 'SESSION_REVOKED'
  | 'TWO_FACTOR_ENABLE'
  | 'TWO_FACTOR_DISABLE'
  | 'DANGEROUS_OP_CONFIRMED'
  | 'REGISTER_FIXED_ASSET'
  | 'DEPRECIATION_RUN'
  | 'DISPOSE_ASSET_SALE'
  | 'DISPOSE_ASSET_SCRAP';

export interface AuditLogRecord {
  id: string;
  tenantId: string;
  branchId?: string;
  userId?: string;
  userEmail: string;
  action: string;
  resourceType: string;
  resourceId: string;
  correlationId: string;
  ipAddress?: string;
  userAgent?: string;
  changesDiff?: Record<string, any>;
  reason?: string;
  chainedHash?: string;
  createdAt: string;
}

export interface AuditFilterParams {
  action?: string;
  resourceType?: string;
  userEmail?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export interface AuditStats {
  totalLogs: number;
  uniqueActionsCount: number;
  topActions: Array<{ action: string; count: number }>;
  topUsers: Array<{ email: string; count: number }>;
  recent24hCount: number;
  tamperEvidentChainValid: boolean;
  chainLength: number;
  latestChainedHash: string;
}

export interface AuditHashChainVerification {
  isValid: boolean;
  verifiedCount: number;
  genesisHash: string;
  latestHash: string;
  discrepancyIndex?: number;
  discrepancyLogId?: string;
  messageAr: string;
  messageEn: string;
}

export interface UserSessionRecord {
  sessionToken: string;
  userId: string;
  userEmail: string;
  role: string;
  isCurrentSession: boolean;
  ipAddress: string;
  userAgent: string;
  deviceType: 'DESKTOP' | 'MOBILE' | 'TABLET' | 'UNKNOWN';
  browser: string;
  os: string;
  createdAt: string;
  lastAccessedAt: string;
  expiresAt: string;
}

export interface TwoFactorSetupResult {
  secret: string;
  otpauthUri: string;
  recoveryCodes: string[];
  issuer: string;
  accountName: string;
}

export interface DangerousOperationRequest {
  operationType: 'REVERSE_JOURNAL' | 'LOCK_PERIOD' | 'UNLOCK_PERIOD' | 'OVERRIDE_NEGATIVE_INVENTORY' | 'ZATCA_CSID_PROD_ACTIVATE' | 'DATABASE_RESTORE';
  targetResourceId: string;
  justification: string;
  supervisorPasswordOrPin?: string;
}

export interface ComplianceCheckItem {
  id: string;
  category: 'SECURITY' | 'ACCOUNTING' | 'INVENTORY' | 'ZATCA' | 'BACKUP';
  titleAr: string;
  titleEn: string;
  status: 'COMPLIANT' | 'WARNING' | 'CRITICAL';
  detailsAr: string;
  detailsEn: string;
  remediationAr?: string;
  remediationEn?: string;
}

export interface ComplianceScanReport {
  scannedAt: string;
  overallScorePercentage: number;
  totalChecks: number;
  compliantCount: number;
  warningCount: number;
  criticalCount: number;
  items: ComplianceCheckItem[];
}

export interface BackupEntityCounts {
  accounts: number;
  journals: number;
  journalLines: number;
  items: number;
  warehouseStocks: number;
  customers: number;
  suppliers: number;
  salesInvoices: number;
  purchaseBills: number;
  treasuryAccounts: number;
  fixedAssets: number;
  auditLogs: number;
}

export type RetentionTier = 'DAILY_7D' | 'MONTHLY_30D' | 'QUARTERLY_90D' | 'ANNUAL_365D';
export type StorageLocation = 'PRIMARY_HOT' | 'OFFSITE_SECURE_VAULT' | 'COLDLINE_S3_GLACIER';
export type BackupType = 'SCHEDULED' | 'MANUAL' | 'PRE_RESTORE_SAFETY' | 'SCHEDULED_DAILY_INCREMENTAL' | 'SCHEDULED_WEEKLY_FULL';

export interface BackupSnapshotMetadata {
  id: string;
  tenantId: string;
  tenantNameAr: string;
  tenantNameEn: string;
  snapshotNumber: string; // BKP-YYYY-XXXXX
  type: BackupType;
  description?: string;
  sizeBytes: number;
  checksumSha256: string;
  createdByEmail: string;
  createdAt: string;
  entityCounts: BackupEntityCounts;
  isPreRestoreSafety: boolean;
  restorable: boolean;
  // Phase 21 Hardening Attributes
  encryptionAlgorithm: 'AES-256-GCM';
  retentionTier: RetentionTier;
  storageLocation: StorageLocation;
  isVerifiedDrillPassed: boolean;
  verifiedAt?: string;
  encryptedArtifactSize?: number;
}

export interface BackupVerificationReport {
  backupId: string;
  verifiedAt: string;
  checksumMatches: boolean;
  payloadStructureValid: boolean;
  glDebitsEqualCredits: boolean;
  totalGlDebitsCents: string;
  totalGlCreditsCents: string;
  entityCounts: BackupEntityCounts;
  status: 'PASSED' | 'FAILED';
  findingsAr: string[];
  findingsEn: string[];
  // Phase 21 Drill Details
  tableRowCounts: {
    accounts: number;
    journals: number;
    journalLines: number;
    items: number;
    customers: number;
    suppliers: number;
    salesInvoices: number;
    purchaseBills: number;
    fixedAssets: number;
  };
  trialBalanceZeroDrift: boolean;
  spotJournalAudit: {
    checkedCount: number;
    passedCount: number;
    failedCount: number;
  };
  measuredRestoreMs: number;
}

export interface RestoreResult {
  success: boolean;
  restoredAt: string;
  restoredFromBackupId: string;
  preRestoreSafetyBackupId: string;
  preRestoreSafetyChecksum: string;
  restoredEntityCounts: BackupEntityCounts;
  messageAr: string;
  messageEn: string;
  restoreDurationMs: number;
  justificationReason?: string;
}

export interface LoginHistoryRecord {
  id: string;
  tenantId: string;
  userId: string;
  userEmail: string;
  ipAddress: string;
  userAgent: string;
  status: 'SUCCESS' | 'FAILED' | 'LOCKED_OUT';
  failureReason?: string;
  timestamp: string;
}

export interface SecurityHardeningMetrics {
  headersEnforced: boolean;
  hstsActive: boolean;
  cspConfigured: boolean;
  csrfEnforced: boolean;
  cookieSameSiteStrict: boolean;
  dbLeastPrivilegeVerified: boolean;
  zeroSecretsAuditPassed: boolean;
  idleTimeoutMinutes: number;
  absoluteSessionHours: number;
}

/**
 * Format bytes into human-readable representation
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Parse user agent to extract clean device, browser, and OS for sessions display
 */
export function parseUserAgentDisplay(ua: string | undefined | null): {
  browser: string;
  os: string;
  deviceType: 'DESKTOP' | 'MOBILE' | 'TABLET' | 'UNKNOWN';
} {
  if (!ua) {
    return { browser: 'Unknown Client', os: 'Unknown OS', deviceType: 'UNKNOWN' };
  }

  let browser = 'Web Browser';
  if (ua.includes('Edg/')) browser = 'Microsoft Edge';
  else if (ua.includes('Chrome/')) browser = 'Google Chrome';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Apple Safari';
  else if (ua.includes('Firefox/')) browser = 'Mozilla Firefox';

  let os = 'Unknown OS';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Macintosh') || ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Linux') && !ua.includes('Android')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  let deviceType: 'DESKTOP' | 'MOBILE' | 'TABLET' | 'UNKNOWN' = 'DESKTOP';
  if (ua.includes('Mobile') || ua.includes('iPhone') || ua.includes('Android')) {
    deviceType = ua.includes('iPad') || ua.includes('Tablet') ? 'TABLET' : 'MOBILE';
  }

  return { browser, os, deviceType };
}

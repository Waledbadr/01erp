import crypto from 'crypto';
import { centralStore } from '../../core/tenantGuard.js';
import {
  BackupSnapshotMetadata,
  BackupVerificationReport,
  RestoreResult,
  BackupEntityCounts,
} from '../../../src/lib/securityAuditBackup.js';
import { getFixedAssetsService, setFixedAssetsForTenant } from '../assets/assetService.js';

interface StoredBackupSnapshot {
  metadata: BackupSnapshotMetadata;
  payloadJson: string;
}

// In-memory catalog of tenant backups
const tenantBackupsMap = new Map<string, StoredBackupSnapshot[]>();
let backupSequence = 1;

/**
 * Serialize a tenant's complete state and generate a cryptographic SHA-256 snapshot
 */
export function createBackupSnapshotService(
  tenantId: string,
  userId: string,
  userEmail: string,
  description?: string,
  type: 'SCHEDULED' | 'MANUAL' | 'PRE_RESTORE_SAFETY' = 'MANUAL'
): BackupSnapshotMetadata {
  const tenant = centralStore.tenants.get(tenantId);
  const tenantNameAr = tenant?.nameAr || 'المنشأة الافتراضية';
  const tenantNameEn = tenant?.nameEn || 'Default Enterprise';

  const branches = centralStore.branches.get(tenantId) || [];
  const warehouses = centralStore.warehouses.get(tenantId) || [];
  const accounts = centralStore.accounts.get(tenantId) || [];
  const accountMappings = centralStore.accountMappings.get(tenantId) || {};
  const journals = centralStore.journals.get(tenantId) || [];
  const items = centralStore.items.get(tenantId) || [];
  const itemCategories = centralStore.itemCategories.get(tenantId) || [];
  const unitsCatalog = centralStore.unitsCatalog.get(tenantId) || [];
  const warehouseStocks = centralStore.warehouseStocks.get(tenantId) || [];
  const stockMovements = centralStore.stockMovements.get(tenantId) || [];
  const customers = centralStore.customers.get(tenantId) || [];
  const suppliers = centralStore.suppliers.get(tenantId) || [];
  const salesInvoices = centralStore.salesInvoices.get(tenantId) || [];
  const salesQuotations = centralStore.salesQuotations.get(tenantId) || [];
  const salesCreditNotes = centralStore.salesCreditNotes.get(tenantId) || [];
  const purchaseBills = centralStore.purchaseBills.get(tenantId) || [];
  const vendorDebitNotes = centralStore.vendorDebitNotes.get(tenantId) || [];
  const treasuryAccounts = centralStore.cashboxes.get(tenantId) || [];
  const fixedAssets = getFixedAssetsService(tenantId, userId);
  const auditLogs = centralStore.auditLogs.filter((l) => l.tenantId === tenantId);

  let totalJournalLines = 0;
  for (const j of journals) {
    totalJournalLines += j.lines?.length || 0;
  }

  const entityCounts: BackupEntityCounts = {
    accounts: accounts.length,
    journals: journals.length,
    journalLines: totalJournalLines,
    items: items.length,
    warehouseStocks: warehouseStocks.length,
    customers: customers.length,
    suppliers: suppliers.length,
    salesInvoices: salesInvoices.length,
    purchaseBills: purchaseBills.length,
    treasuryAccounts: treasuryAccounts.length,
    fixedAssets: fixedAssets.length,
    auditLogs: auditLogs.length,
  };

  const payloadObject = {
    snapshotVersion: '1.0.0',
    tenantId,
    tenantNameAr,
    tenantNameEn,
    createdAt: new Date().toISOString(),
    createdByEmail: userEmail,
    entityCounts,
    data: {
      tenant,
      branches,
      warehouses,
      accounts,
      accountMappings,
      journals,
      items,
      itemCategories,
      unitsCatalog,
      warehouseStocks,
      stockMovements,
      customers,
      suppliers,
      salesInvoices,
      salesQuotations,
      salesCreditNotes,
      purchaseBills,
      vendorDebitNotes,
      treasuryAccounts,
      fixedAssets,
    },
  };

  // Convert BigInt to strings for deterministic JSON serialization
  const payloadJson = JSON.stringify(payloadObject, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  );

  const checksumSha256 = crypto.createHash('sha256').update(payloadJson, 'utf8').digest('hex');
  const sizeBytes = Buffer.byteLength(payloadJson, 'utf8');

  const snapshotId = crypto.randomUUID();
  const year = new Date().getFullYear();
  const snapshotNumber = `BKP-${year}-${String(backupSequence++).padStart(5, '0')}`;

  const metadata: BackupSnapshotMetadata = {
    id: snapshotId,
    tenantId,
    tenantNameAr,
    tenantNameEn,
    snapshotNumber,
    type,
    description: description || (type === 'PRE_RESTORE_SAFETY' ? 'نسخة أمان وقائية تلقائية قبل الاستعادة' : 'نسخة احتياطية يدوية للنظام'),
    sizeBytes,
    checksumSha256,
    createdByEmail: userEmail,
    createdAt: new Date().toISOString(),
    entityCounts,
    isPreRestoreSafety: type === 'PRE_RESTORE_SAFETY',
    restorable: true,
  };

  const storedList = tenantBackupsMap.get(tenantId) || [];
  storedList.unshift({ metadata, payloadJson });
  tenantBackupsMap.set(tenantId, storedList);

  centralStore.recordAuditLog({
    tenantId,
    userId,
    userEmail,
    action: 'BACKUP_CREATE',
    resourceType: 'backups',
    resourceId: snapshotId,
    correlationId: crypto.randomUUID(),
    changesDiff: {
      snapshotNumber,
      type,
      sizeBytes,
      checksumSha256,
      entityCounts,
    },
  });

  return metadata;
}

/**
 * List all backup snapshots for a tenant
 */
export function listBackupSnapshotsService(tenantId: string): BackupSnapshotMetadata[] {
  const list = tenantBackupsMap.get(tenantId) || [];
  return list.map((item) => item.metadata);
}

/**
 * Get single backup metadata
 */
export function getBackupSnapshotService(tenantId: string, backupId: string): BackupSnapshotMetadata | null {
  const list = tenantBackupsMap.get(tenantId) || [];
  const found = list.find((item) => item.metadata.id === backupId);
  return found ? found.metadata : null;
}

/**
 * Download serialized JSON payload for a backup snapshot
 */
export function downloadBackupSnapshotService(
  tenantId: string,
  backupId: string,
  userId: string,
  userEmail: string
): { payloadJson: string; checksumSha256: string; filename: string } | null {
  const list = tenantBackupsMap.get(tenantId) || [];
  const found = list.find((item) => item.metadata.id === backupId);
  if (!found) return null;

  centralStore.recordAuditLog({
    tenantId,
    userId,
    userEmail,
    action: 'BACKUP_DOWNLOAD',
    resourceType: 'backups',
    resourceId: backupId,
    correlationId: crypto.randomUUID(),
    changesDiff: {
      snapshotNumber: found.metadata.snapshotNumber,
      checksumSha256: found.metadata.checksumSha256,
    },
  });

  const filename = `${found.metadata.snapshotNumber}_${found.metadata.createdAt.slice(0, 10)}.json`;
  return {
    payloadJson: found.payloadJson,
    checksumSha256: found.metadata.checksumSha256,
    filename,
  };
}

/**
 * Automated restoration drill and checksum verification
 */
export function verifyBackupSnapshotService(
  tenantId: string,
  backupId: string,
  userId: string,
  userEmail: string
): BackupVerificationReport | null {
  const list = tenantBackupsMap.get(tenantId) || [];
  const found = list.find((item) => item.metadata.id === backupId);
  if (!found) return null;

  const findingsAr: string[] = [];
  const findingsEn: string[] = [];

  // Checksum verification
  const calculatedChecksum = crypto.createHash('sha256').update(found.payloadJson, 'utf8').digest('hex');
  const checksumMatches = calculatedChecksum === found.metadata.checksumSha256;

  if (checksumMatches) {
    findingsAr.push('البصمة التشفيرية SHA-256 مطابقة للأصل بنسبة 100%. لم يحدث أي تلف أو تغيير في البيانات.');
    findingsEn: findingsEn.push('Cryptographic SHA-256 checksum matches stored metadata 100%. Data integrity verified.');
  } else {
    findingsAr.push('فشل مطابقة البصمة التشفيرية SHA-256! النسخة قد تكون تالفة.');
    findingsEn: findingsEn.push('Cryptographic SHA-256 checksum mismatch! Archive may be corrupted.');
  }

  // Parse and test GL Balance Invariant (Rule G1)
  let payloadStructureValid = false;
  let glDebitsEqualCredits = true;
  let totalDebits = 0n;
  let totalCredits = 0n;

  try {
    const parsed = JSON.parse(found.payloadJson);
    payloadStructureValid = !!parsed.data && !!parsed.data.journals;

    const journals = parsed.data.journals || [];
    for (const j of journals) {
      const dr = BigInt(j.totalDebitCents || '0');
      const cr = BigInt(j.totalCreditCents || '0');
      totalDebits += dr;
      totalCredits += cr;
      if (dr !== cr) {
        glDebitsEqualCredits = false;
      }
    }

    if (glDebitsEqualCredits) {
      findingsAr.push(`تم فحص كافة قيود اليومية (${journals.length} قيد). معادلة الميزانية متطابقة تماماً (إجمالي المدين = إجمالي الدائن).`);
      findingsEn.push(`All ${journals.length} journal entries mathematically balanced (Total Debits === Total Credits).`);
    } else {
      findingsAr.push('تم العثور على قيود يومية غير متوازنة داخل النسخة الاحتياطية.');
      findingsEn.push('Unbalanced journal entries discovered inside backup archive.');
    }
  } catch (err: any) {
    payloadStructureValid = false;
    findingsAr.push(`خطأ في فك تشفير البيانات: ${err.message}`);
    findingsEn.push(`Payload parsing failure: ${err.message}`);
  }

  const passed = checksumMatches && payloadStructureValid && glDebitsEqualCredits;

  centralStore.recordAuditLog({
    tenantId,
    userId,
    userEmail,
    action: 'BACKUP_VERIFY',
    resourceType: 'backups',
    resourceId: backupId,
    correlationId: crypto.randomUUID(),
    changesDiff: {
      status: passed ? 'PASSED' : 'FAILED',
      checksumMatches,
      glDebitsEqualCredits,
    },
  });

  return {
    backupId,
    verifiedAt: new Date().toISOString(),
    checksumMatches,
    payloadStructureValid,
    glDebitsEqualCredits,
    totalGlDebitsCents: totalDebits.toString(),
    totalGlCreditsCents: totalCredits.toString(),
    entityCounts: found.metadata.entityCounts,
    status: passed ? 'PASSED' : 'FAILED',
    findingsAr,
    findingsEn,
  };
}

/**
 * Execute disaster recovery restoration from a verified snapshot
 * Automatically creates a pre-restore safety snapshot before applying data
 */
export function restoreBackupSnapshotService(
  tenantId: string,
  backupId: string,
  userId: string,
  userEmail: string
): RestoreResult {
  const list = tenantBackupsMap.get(tenantId) || [];
  const found = list.find((item) => item.metadata.id === backupId);
  if (!found) {
    throw new Error(`BACKUP_NOT_FOUND: Snapshot '${backupId}' does not exist.`);
  }

  // 1. Mandatory Pre-Restore Safety Snapshot (docs/BACKUPS.md Section 3.2)
  const preRestoreSafety = createBackupSnapshotService(
    tenantId,
    userId,
    userEmail,
    `لقطة أمان وقائية تلقائية قبل استعادة النسخة ${found.metadata.snapshotNumber}`,
    'PRE_RESTORE_SAFETY'
  );

  // 2. Parse Snapshot Payload
  const parsed = JSON.parse(found.payloadJson);
  const data = parsed.data;

  // 3. Restore in-memory data structures
  if (data.accounts) {
    centralStore.accounts.set(tenantId, data.accounts);
  }
  if (data.accountMappings) {
    centralStore.accountMappings.set(tenantId, data.accountMappings);
  }
  if (data.journals) {
    // Restore BigInts
    const restoredJournals = data.journals.map((j: any) => ({
      ...j,
      totalDebitCents: BigInt(j.totalDebitCents || '0'),
      totalCreditCents: BigInt(j.totalCreditCents || '0'),
      lines: (j.lines || []).map((l: any) => ({
        ...l,
        debitCents: BigInt(l.debitCents || '0'),
        creditCents: BigInt(l.creditCents || '0'),
      })),
    }));
    centralStore.journals.set(tenantId, restoredJournals);
  }
  if (data.items) {
    centralStore.items.set(tenantId, data.items);
  }
  if (data.itemCategories) {
    centralStore.itemCategories.set(tenantId, data.itemCategories);
  }
  if (data.warehouseStocks) {
    centralStore.warehouseStocks.set(tenantId, data.warehouseStocks);
  }
  if (data.stockMovements) {
    centralStore.stockMovements.set(tenantId, data.stockMovements);
  }
  if (data.customers) {
    centralStore.customers.set(tenantId, data.customers);
  }
  if (data.suppliers) {
    centralStore.suppliers.set(tenantId, data.suppliers);
  }
  if (data.salesInvoices) {
    centralStore.salesInvoices.set(tenantId, data.salesInvoices);
  }
  if (data.purchaseBills) {
    centralStore.purchaseBills.set(tenantId, data.purchaseBills);
  }
  if (data.treasuryAccounts) {
    centralStore.cashboxes.set(tenantId, data.treasuryAccounts);
  }
  if (data.fixedAssets) {
    setFixedAssetsForTenant(tenantId, data.fixedAssets);
  }

  // 4. Record Immutable Audit Log
  centralStore.recordAuditLog({
    tenantId,
    userId,
    userEmail,
    action: 'BACKUP_RESTORE',
    resourceType: 'backups',
    resourceId: backupId,
    correlationId: crypto.randomUUID(),
    changesDiff: {
      restoredFromSnapshotNumber: found.metadata.snapshotNumber,
      preRestoreSafetyBackupId: preRestoreSafety.id,
      preRestoreSafetySnapshotNumber: preRestoreSafety.snapshotNumber,
      restoredEntityCounts: found.metadata.entityCounts,
    },
  });

  return {
    success: true,
    restoredAt: new Date().toISOString(),
    restoredFromBackupId: backupId,
    preRestoreSafetyBackupId: preRestoreSafety.id,
    preRestoreSafetyChecksum: preRestoreSafety.checksumSha256,
    restoredEntityCounts: found.metadata.entityCounts,
    messageAr: `تمت استعادة بيانات النظام بنجاح من النسخة ${found.metadata.snapshotNumber}. تم حفظ لقطة أمان وقائية بالرقم ${preRestoreSafety.snapshotNumber}.`,
    messageEn: `Disaster recovery restoration succeeded from snapshot ${found.metadata.snapshotNumber}. Pre-restore safety snapshot created as ${preRestoreSafety.snapshotNumber}.`,
  };
}

/**
 * Seed initial sample backup for demonstration
 */
export function seedInitialBackupIfEmpty(tenantId: string, adminUserId: string, adminUserEmail: string) {
  const existing = tenantBackupsMap.get(tenantId);
  if (!existing || existing.length === 0) {
    createBackupSnapshotService(
      tenantId,
      adminUserId,
      adminUserEmail,
      'النسخة التأسيسية الشاملة الأولى للنظام',
      'SCHEDULED'
    );
  }
}

import crypto from 'crypto';
import { CentralTenantDataStore } from '../../core/tenantGuard.js';
import { ImportJob } from './types.js';

export interface RollbackResult {
  success: boolean;
  jobId: string;
  template: string;
  removedRecordsCount: number;
  restoredRecordsCount: number;
  removedJournalsCount: number;
  removedStockMovementsCount: number;
  messageAr: string;
  messageEn: string;
}

export function executeImportRollback(
  store: CentralTenantDataStore,
  tenantId: string,
  userId: string,
  userEmail: string,
  jobId: string
): RollbackResult {
  const batches = store.batchImports.get(tenantId) || [];
  const job = batches.find((b: any) => b.id === jobId) as ImportJob | undefined;

  if (!job) {
    throw new Error(`IMPORT_JOB_NOT_FOUND: عملية الاستيراد رقم ${jobId} غير موجودة`);
  }

  if (job.isRolledBack) {
    throw new Error(`ALREADY_ROLLED_BACK: تم التراجع عن هذه العملية مسبقاً في ${job.rolledBackAt}`);
  }

  const createdIds = new Set(job.createdRecordIds?.ids || []);
  const createdJournalIds = new Set(job.createdRecordIds?.journalIds || []);
  const createdStockIds = new Set(job.createdRecordIds?.stockMovementIds || []);
  let removedRecordsCount = createdIds.size;
  let restoredRecordsCount = 0;
  let removedJournalsCount = createdJournalIds.size;
  let removedStockMovementsCount = createdStockIds.size;

  // 1. Remove primary created records
  switch (job.template) {
    case 'CUSTOMERS': {
      const customers = store.customers.get(tenantId) || [];
      store.customers.set(tenantId, customers.filter((c) => !createdIds.has(c.id)));
      break;
    }
    case 'SUPPLIERS': {
      const suppliers = store.suppliers.get(tenantId) || [];
      store.suppliers.set(tenantId, suppliers.filter((s) => !createdIds.has(s.id)));
      break;
    }
    case 'ITEMS': {
      const items = store.items.get(tenantId) || [];
      store.items.set(tenantId, items.filter((i) => !createdIds.has(i.id)));
      break;
    }
    case 'ACCOUNTS': {
      const accounts = store.accounts.get(tenantId) || [];
      store.accounts.set(tenantId, accounts.filter((a) => !createdIds.has(a.id)));
      break;
    }
    case 'OPENING_BALANCES': {
      const balances = store.openingBalances.get(tenantId) || [];
      store.openingBalances.set(tenantId, balances.filter((b) => !createdIds.has(b.id)));
      break;
    }
    case 'SALES_INVOICES': {
      const invoices = store.salesInvoices.get(tenantId) || [];
      store.salesInvoices.set(tenantId, invoices.filter((i) => !createdIds.has(i.id)));
      break;
    }
    case 'PURCHASE_BILLS': {
      const bills = store.purchaseBills.get(tenantId) || [];
      store.purchaseBills.set(tenantId, bills.filter((b) => !createdIds.has(b.id)));
      break;
    }
    case 'PAYMENTS': {
      const receipts = store.customerReceipts.get(tenantId) || [];
      const payments = store.supplierPayments.get(tenantId) || [];
      store.customerReceipts.set(tenantId, receipts.filter((r) => !createdIds.has(r.id)));
      store.supplierPayments.set(tenantId, payments.filter((p) => !createdIds.has(p.id)));
      break;
    }
    case 'JOURNAL_ENTRIES': {
      const journals = store.journals.get(tenantId) || [];
      store.journals.set(tenantId, journals.filter((j) => !createdIds.has(j.id)));
      break;
    }
    case 'STOCK_OPENING': {
      const movements = store.stockMovements.get(tenantId) || [];
      const warehouseStocks = store.warehouseStocks.get(tenantId) || [];

      // Find stock movements to reverse warehouse stock additions
      const toRemove = movements.filter((m: any) => createdIds.has(m.id) || m.importJobId === jobId);
      toRemove.forEach((m: any) => {
        const stock = warehouseStocks.find(
          (ws: any) => ws.warehouseCode === m.warehouseCode && ws.itemSku === m.itemSku
        );
        if (stock) {
          (stock as any).quantity = ((stock as any).quantity || 0) - (m.quantity || 0);
          (stock as any).valuationSar = ((stock as any).valuationSar || 0) - (m.totalCost || 0);
        }
      });

      store.stockMovements.set(tenantId, movements.filter((m: any) => !createdIds.has(m.id) && m.importJobId !== jobId));
      store.warehouseStocks.set(tenantId, warehouseStocks);
      break;
    }
  }

  // 2. Remove all created linked journals and journal lines (Single source of truth)
  if (createdJournalIds.size > 0) {
    const journals = store.journals.get(tenantId) || [];
    store.journals.set(tenantId, journals.filter((j: any) => !createdJournalIds.has(j.id) && j.importJobId !== jobId));
    createdJournalIds.forEach((jid) => {
      store.journalLines.delete(jid);
    });
  }

  // 3. Restore updated records from previous snapshots
  if (job.previousSnapshots && job.previousSnapshots.length > 0) {
    restoredRecordsCount = job.previousSnapshots.length;
    job.previousSnapshots.forEach(({ entityType, id, snapshot }) => {
      switch (entityType) {
        case 'CUSTOMER': {
          const customers = store.customers.get(tenantId) || [];
          const idx = customers.findIndex((c) => c.id === id);
          if (idx >= 0) customers[idx] = snapshot;
          else customers.push(snapshot);
          store.customers.set(tenantId, customers);
          break;
        }
        case 'SUPPLIER': {
          const suppliers = store.suppliers.get(tenantId) || [];
          const idx = suppliers.findIndex((s) => s.id === id);
          if (idx >= 0) suppliers[idx] = snapshot;
          else suppliers.push(snapshot);
          store.suppliers.set(tenantId, suppliers);
          break;
        }
        case 'ITEM': {
          const items = store.items.get(tenantId) || [];
          const idx = items.findIndex((i) => i.id === id);
          if (idx >= 0) items[idx] = snapshot;
          else items.push(snapshot);
          store.items.set(tenantId, items);
          break;
        }
        case 'ACCOUNT': {
          const accounts = store.accounts.get(tenantId) || [];
          const idx = accounts.findIndex((a) => a.id === id);
          if (idx >= 0) accounts[idx] = snapshot;
          else accounts.push(snapshot);
          store.accounts.set(tenantId, accounts);
          break;
        }
      }
    });
  }

  // 4. Mark job as rolled back
  job.isRolledBack = true;
  job.status = 'ROLLED_BACK';
  job.rolledBackAt = new Date().toISOString();
  job.rolledBackBy = userEmail;

  store.recordAuditLog({
    tenantId,
    userId,
    userEmail,
    action: `IMPORT_${job.template}_ROLLBACK`,
    resourceType: 'import_jobs',
    resourceId: jobId,
    correlationId: crypto.randomUUID(),
    changesDiff: {
      removedRecordsCount,
      restoredRecordsCount,
      removedJournalsCount,
      removedStockMovementsCount,
    },
  });

  return {
    success: true,
    jobId,
    template: job.template,
    removedRecordsCount,
    restoredRecordsCount,
    removedJournalsCount,
    removedStockMovementsCount,
    messageAr: `تم التراجع بنجاح عن عملية الاستيراد (${jobId}). تم حذف ${removedRecordsCount} سجل و${removedJournalsCount} قيد محاسبي.`,
    messageEn: `Successfully rolled back import job (${jobId}). Removed ${removedRecordsCount} records and ${removedJournalsCount} journals.`,
  };
}

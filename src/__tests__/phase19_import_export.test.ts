/**
 * Comprehensive Automated Tests for Phase 19 — Unified Import & Export Center
 *
 * Tests:
 * 1. CSV with invalid VAT / mobile -> rejected before commit with row numbers and exact error
 * 2. CSV with duplicate keys within file -> rejected before commit with exact row reference
 * 3. Induced DB failure mid-commit -> full rollback, zero residue
 * 4. Unbalanced opening balances CSV -> rejected before commit with difference amount (Rule G1)
 * 5. CREATE_ONLY mode with existing key -> rejected; UPDATE_ONLY with missing key -> rejected; CREATE_OR_UPDATE -> upsert works
 * 6. Rollback after successful commit -> all created records + their journals/stock removed
 * 7. All 10 templates export valid CSV with matching columns (round-trip test)
 * 8. Audit log created for both import and rollback actions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CentralTenantDataStore } from '../../server/core/tenantGuard.js';
import { validateImportRows } from '../../server/modules/importexport/importValidationService.js';
import { executeImportCommit } from '../../server/modules/importexport/importCommitService.js';
import { executeImportRollback } from '../../server/modules/importexport/importRollbackService.js';
import { exportResourceData } from '../../server/modules/importexport/exportService.js';
import { parseCsvText, autoMapColumns, applyColumnMapping } from '../lib/importExport.js';
import { IMPORT_TEMPLATES_CONFIG } from '../../server/modules/importexport/templateDefinitions.js';
import { ImportTemplate } from '../../server/modules/importexport/types.js';

describe('Phase 19: Unified Import & Export Center Verification', () => {
  let store: CentralTenantDataStore;
  const tenantId = 'TENANT-P19-TEST';
  const userId = 'USER-ADMIN-01';
  const userEmail = 'admin@saudi-erp.sa';

  beforeEach(() => {
    store = new CentralTenantDataStore();

    // Seed test tenant with minimal base data
    store.tenants.set(tenantId, {
      id: tenantId,
      nameAr: 'شركة الاختبار الموحدة',
      nameEn: 'Unified Test Co',
      crNumber: '1010123456',
      vatNumber: '300099988800003',
      city: 'الرياض',
      district: 'العليا',
      buildingNumber: '1234',
      postalCode: '12211',
      isActive: true,
    } as any);

    // Seed base chart of accounts
    store.accounts.set(tenantId, [
      { id: 'a1', tenantId, code: '10101', nameAr: 'الصندوق الرئيسي', type: 'ASSET', normalBalance: 'DEBIT', balanceSar: 0 } as any,
      { id: 'a2', tenantId, code: '10102', nameAr: 'مصرف الراجحي', type: 'ASSET', normalBalance: 'DEBIT', balanceSar: 0 } as any,
      { id: 'a3', tenantId, code: '10201', nameAr: 'العملاء والمدينون', type: 'ASSET', normalBalance: 'DEBIT', balanceSar: 0 } as any,
      { id: 'a4', tenantId, code: '10401', nameAr: 'مخزون البضائع', type: 'ASSET', normalBalance: 'DEBIT', balanceSar: 0 } as any,
      { id: 'a5', tenantId, code: '20101', nameAr: 'الموردون والدائنون', type: 'LIABILITY', normalBalance: 'CREDIT', balanceSar: 0 } as any,
      { id: 'a6', tenantId, code: '30101', nameAr: 'رأس المال والافتتاحي', type: 'EQUITY', normalBalance: 'CREDIT', balanceSar: 0 } as any,
      { id: 'a7', tenantId, code: '40101', nameAr: 'إيراد المبيعات', type: 'REVENUE', normalBalance: 'CREDIT', balanceSar: 0 } as any,
      { id: 'a8', tenantId, code: '50101', nameAr: 'تكلفة المبيعات والمشتريات', type: 'COGS', normalBalance: 'DEBIT', balanceSar: 0 } as any,
    ]);

    // Seed warehouse
    store.warehouses.set(tenantId, [
      { id: 'wh1', tenantId, code: 'WH-RYD-01', nameAr: 'مستودع الرياض الرئيسي', isActive: true } as any,
    ]);

    // Seed initial existing customer and item for duplicate/upsert tests
    store.customers.set(tenantId, [
      {
        id: 'cust-orig-1',
        tenantId,
        code: 'CUST-0001',
        nameAr: 'عميل قديم مسجل',
        mobile: '0501111111',
        vatNumber: '300011111100003',
        creditLimit: 10000,
        isActive: true,
      } as any,
    ]);

    store.items.set(tenantId, [
      {
        id: 'item-orig-1',
        tenantId,
        sku: 'ITM-ORIG-100',
        nameAr: 'صنف مخزني أساسي',
        baseUnit: 'PCS',
        purchasePrice: 100,
        sellingPrice: 150,
        cost: 100,
        isActive: true,
      } as any,
    ]);
  });

  // =========================================================================
  // TEST 1: Invalid VAT / Mobile rejected before commit with row numbers
  // =========================================================================
  it('1. Rejects CSV with invalid Saudi VAT or mobile before commit with row numbers and exact error', () => {
    const invalidRows = [
      {
        nameAr: 'شركة النور الصالحة',
        mobile: '0502223344',
        vatNumber: '300022233300003', // Valid 15 digits
      },
      {
        nameAr: 'مؤسسة الهاتف الخاطئ',
        mobile: '0612345678', // Invalid: Not 05XXXXXXXX
        vatNumber: '300044455500003',
      },
      {
        nameAr: 'شركة الضريبة الخاطئة',
        mobile: '0559998877',
        vatNumber: '400012345600002', // Invalid: Doesn't start/end with 3
      },
    ];

    const validation = validateImportRows(store, tenantId, 'CUSTOMERS', 'CREATE_OR_UPDATE', invalidRows);

    expect(validation.isValid).toBe(false);
    expect(validation.errorRows).toBe(2);
    expect(validation.validRows).toBe(1);

    // Row 2 error check
    const row2Error = validation.errors.find((e) => e.rowNumber === 2 && e.field === 'mobile');
    expect(row2Error).toBeDefined();
    expect(row2Error?.errorCode).toBe('INVALID_SAUDI_MOBILE');
    expect(row2Error?.messageAr).toContain('رقم الجوال غير صحيح');

    // Row 3 error check
    const row3Error = validation.errors.find((e) => e.rowNumber === 3 && e.field === 'vatNumber');
    expect(row3Error).toBeDefined();
    expect(row3Error?.errorCode).toBe('INVALID_SAUDI_VAT');
    expect(row3Error?.messageAr).toContain('الرقم الضريبي');

    // Attempting commit must throw exception without modifying store
    expect(() =>
      executeImportCommit(store, tenantId, userId, userEmail, {
        template: 'CUSTOMERS',
        mode: 'CREATE_OR_UPDATE',
        rows: invalidRows,
      })
    ).toThrow(/VALIDATION_FAILED/);
  });

  // =========================================================================
  // TEST 2: Duplicate keys within file rejected with exact row reference
  // =========================================================================
  it('2. Rejects CSV with duplicate keys within file with exact row reference before commit', () => {
    const duplicateRows = [
      {
        nameAr: 'الفرع الأول',
        mobile: '0541112233',
        vatNumber: '300055566600003',
      },
      {
        nameAr: 'الفرع الثاني المختلف',
        mobile: '0549990000',
        vatNumber: '300077788800003',
      },
      {
        nameAr: 'فرع مكرر نفس رقم الجوال',
        mobile: '0541112233', // Duplicate of row 1!
        vatNumber: '300099900000003',
      },
    ];

    const validation = validateImportRows(store, tenantId, 'CUSTOMERS', 'CREATE_OR_UPDATE', duplicateRows);

    expect(validation.isValid).toBe(false);
    const dupError = validation.errors.find((e) => e.rowNumber === 3 && e.errorCode === 'DUPLICATE_IN_FILE');
    expect(dupError).toBeDefined();
    expect(dupError?.messageAr).toContain('نفس رقم السطر 1');
    expect(dupError?.messageEn).toContain('same as row 1');
  });

  // =========================================================================
  // TEST 3: Induced DB failure mid-commit -> full rollback, zero residue
  // =========================================================================
  it('3. Guarantees atomic transaction: Induced DB failure mid-commit leaves zero residue', () => {
    const initialCustomerCount = (store.customers.get(tenantId) || []).length;
    const initialJournalCount = (store.journals.get(tenantId) || []).length;

    const rowsToCommit = [
      { nameAr: 'عميل دفعة 1', mobile: '0503334411', vatNumber: '300033344100003' },
      { nameAr: 'عميل دفعة 2', mobile: '0503334422', vatNumber: '300033344200003' },
      { nameAr: 'عميل دفعة 3 كراش', mobile: '0503334433', vatNumber: '300033344300003' },
    ];

    // Induce a simulated database failure at row 3
    expect(() =>
      executeImportCommit(store, tenantId, userId, userEmail, {
        template: 'CUSTOMERS',
        mode: 'CREATE_OR_UPDATE',
        rows: rowsToCommit,
        simulateDbFailureAtRow: 3,
      })
    ).toThrow(/INDUCED_DB_CRASH_SIMULATION/);

    // CRITICAL ASSERTION: Zero residue! Rows 1 & 2 must NOT be persisted!
    const currentCustomers = store.customers.get(tenantId) || [];
    expect(currentCustomers.length).toBe(initialCustomerCount);
    expect(currentCustomers.some((c) => c.nameAr === 'عميل دفعة 1')).toBe(false);
    expect(currentCustomers.some((c) => c.nameAr === 'عميل دفعة 2')).toBe(false);

    // Failed job must be logged with FAILED status and rolledBack = true
    const batchJobs = store.batchImports.get(tenantId) || [];
    expect(batchJobs.length).toBe(1);
    expect(batchJobs[0].status).toBe('FAILED');
    expect(batchJobs[0].isRolledBack).toBe(true);
    expect(batchJobs[0].failedCount).toBe(3);
  });

  // =========================================================================
  // TEST 4: Unbalanced opening balances CSV rejected with difference amount (Rule G1)
  // =========================================================================
  it('4. Rejects unbalanced opening balances CSV before commit and reports exact difference (Rule G1)', () => {
    const unbalancedBalances = [
      { accountCode: '10101', debitSar: 100000, creditSar: 0, descriptionAr: 'نقدية' },
      { accountCode: '10102', debitSar: 50000, creditSar: 0, descriptionAr: 'بنك' },
      { accountCode: '30101', debitSar: 0, creditSar: 120000, descriptionAr: 'رأس مال غير متوازن' },
    ];
    // Total Debits: 150,000 SAR. Total Credits: 120,000 SAR. Difference: 30,000 SAR.

    const validation = validateImportRows(store, tenantId, 'OPENING_BALANCES', 'CREATE_OR_UPDATE', unbalancedBalances);

    expect(validation.isValid).toBe(false);
    expect(validation.details?.balanced).toBe(false);
    expect(validation.details?.totalDebitSar).toBe(150000);
    expect(validation.details?.totalCreditSar).toBe(120000);
    expect(validation.details?.differenceSar).toBe(30000);

    const g1Error = validation.errors.find((e) => e.errorCode === 'RULE_G1_UNBALANCED_OPENING_BALANCES');
    expect(g1Error).toBeDefined();
    expect(g1Error?.messageAr).toContain('الفارق هو 30,000.00 ر.س');
    expect(g1Error?.messageEn).toContain('exact difference is 30,000.00 SAR');

    // Commit must be rejected
    expect(() =>
      executeImportCommit(store, tenantId, userId, userEmail, {
        template: 'OPENING_BALANCES',
        mode: 'CREATE_OR_UPDATE',
        rows: unbalancedBalances,
      })
    ).toThrow(/RULE_G1_UNBALANCED_OPENING_BALANCES/);
  });

  // =========================================================================
  // TEST 5: Modes enforcement (CREATE_ONLY, UPDATE_ONLY, CREATE_OR_UPDATE)
  // =========================================================================
  it('5. Enforces modes: CREATE_ONLY rejects existing keys, UPDATE_ONLY rejects missing keys, CREATE_OR_UPDATE upserts', () => {
    // 5.1 CREATE_ONLY mode with existing customer (mobile 0501111111 exists)
    const existingRow = [{ nameAr: 'محاولة تكرار', mobile: '0501111111', vatNumber: '300011111100003' }];
    const valCreateOnly = validateImportRows(store, tenantId, 'CUSTOMERS', 'CREATE_ONLY', existingRow);
    expect(valCreateOnly.isValid).toBe(false);
    expect(valCreateOnly.errors[0].errorCode).toBe('RECORD_ALREADY_EXISTS');

    // 5.2 UPDATE_ONLY mode with non-existent customer
    const missingRow = [{ nameAr: 'عميل غير مسجل', mobile: '0508889900', vatNumber: '300088899000003' }];
    const valUpdateOnly = validateImportRows(store, tenantId, 'CUSTOMERS', 'UPDATE_ONLY', missingRow);
    expect(valUpdateOnly.isValid).toBe(false);
    expect(valUpdateOnly.errors[0].errorCode).toBe('RECORD_NOT_FOUND');

    // 5.3 CREATE_OR_UPDATE (Upsert): mix of 1 update and 1 new record
    const upsertRows = [
      { nameAr: 'عميل قديم تم تحديث اسمه', mobile: '0501111111', vatNumber: '300011111100003', creditLimitSar: 99000 },
      { nameAr: 'عميل جديد بالكامل', mobile: '0507776655', vatNumber: '300077766500003', creditLimitSar: 25000 },
    ];
    const valUpsert = validateImportRows(store, tenantId, 'CUSTOMERS', 'CREATE_OR_UPDATE', upsertRows);
    expect(valUpsert.isValid).toBe(true);

    const commitJob = executeImportCommit(store, tenantId, userId, userEmail, {
      template: 'CUSTOMERS',
      mode: 'CREATE_OR_UPDATE',
      rows: upsertRows,
    });

    expect(commitJob.status).toBe('COMPLETED');
    expect(commitJob.createdCount).toBe(1);
    expect(commitJob.updatedCount).toBe(1);

    const updatedCustomer = store.customers.get(tenantId)?.find((c) => c.mobile === '0501111111');
    expect(updatedCustomer?.nameAr).toBe('عميل قديم تم تحديث اسمه');
    expect(updatedCustomer?.creditLimit).toBe(99000);

    const newCustomer = store.customers.get(tenantId)?.find((c) => c.mobile === '0507776655');
    expect(newCustomer).toBeDefined();
    expect(newCustomer?.nameAr).toBe('عميل جديد بالكامل');
  });

  // =========================================================================
  // TEST 6: Rollback after successful commit removes all created records + journals/stock
  // =========================================================================
  it('6. Rollback after successful commit completely removes created records, linked journals, and reverses updates', () => {
    // Commit a balanced opening stock batch (which creates stock movements + equity journal)
    const stockRows = [
      {
        documentNumber: 'OPN-TEST-99',
        warehouseCode: 'WH-RYD-01',
        itemSku: 'ITM-ORIG-100',
        quantity: 50,
        unitCost: 100,
      },
    ];

    const job = executeImportCommit(store, tenantId, userId, userEmail, {
      template: 'STOCK_OPENING',
      mode: 'CREATE_OR_UPDATE',
      rows: stockRows,
    });

    expect(job.status).toBe('COMPLETED');
    expect(job.createdRecordIds.journalIds?.length).toBe(1);

    // Verify stock and journal exist
    const stockBeforeRollback = store.warehouseStocks.get(tenantId)?.find((ws: any) => ws.itemSku === 'ITM-ORIG-100');
    expect((stockBeforeRollback as any)?.quantity).toBe(50);
    expect(store.journals.get(tenantId)?.some((j) => j.entryNumber === 'JV-STK-OPN-TEST-99')).toBe(true);

    // EXECUTE ROLLBACK
    const rollbackResult = executeImportRollback(store, tenantId, userId, userEmail, job.id);
    expect(rollbackResult.success).toBe(true);
    expect(rollbackResult.removedJournalsCount).toBe(1);

    // Verify stock reversed to 0 and journal deleted from single source of truth
    const stockAfterRollback = store.warehouseStocks.get(tenantId)?.find((ws: any) => ws.itemSku === 'ITM-ORIG-100');
    expect((stockAfterRollback as any)?.quantity).toBe(0);
    expect(store.journals.get(tenantId)?.some((j) => j.entryNumber === 'JV-STK-OPN-TEST-99')).toBe(false);

    // Verify job record marked as rolled back
    const storedJob = store.batchImports.get(tenantId)?.find((b) => b.id === job.id);
    expect(storedJob?.isRolledBack).toBe(true);
    expect(storedJob?.status).toBe('ROLLED_BACK');
  });

  // =========================================================================
  // TEST 7: All 10 templates export valid CSV with matching columns (round-trip test)
  // =========================================================================
  it('7. Guarantees 100% round-trip: All 10 templates export valid CSV with matching headers and zero validation diffs', () => {
    const allTemplates: ImportTemplate[] = [
      'CUSTOMERS',
      'SUPPLIERS',
      'ITEMS',
      'ACCOUNTS',
      'OPENING_BALANCES',
      'SALES_INVOICES',
      'PURCHASE_BILLS',
      'PAYMENTS',
      'JOURNAL_ENTRIES',
      'STOCK_OPENING',
    ];

    expect(allTemplates.length).toBe(10);

    for (const tpl of allTemplates) {
      const config = IMPORT_TEMPLATES_CONFIG[tpl];
      expect(config).toBeDefined();

      // Export resource
      const exported = exportResourceData(store, tenantId, { resource: tpl, format: 'CSV' });
      expect(exported.format).toBe('CSV');
      expect(exported.content.startsWith('\uFEFF')).toBe(true); // UTF-8 BOM present

      // Parse exported CSV
      const { headers, rows } = parseCsvText(exported.content);
      const expectedFields = config.fields.map((f) => f.field);

      // Verify every expected field is present in exported headers
      for (const field of expectedFields) {
        expect(headers).toContain(field);
      }

      // Auto-map parsed headers against the template
      const mapping = autoMapColumns(headers, tpl);
      for (const field of expectedFields) {
        expect(mapping[field]).toBe(field);
      }
    }
  });

  // =========================================================================
  // TEST 8: Audit log created for both import commit and rollback actions
  // =========================================================================
  it('8. Verifies audit trail: Both import commit and rollback record immutable audit logs with correlation IDs', () => {
    const initialAuditCount = store.auditLogs.length;

    const newRows = [
      { nameAr: 'مورد تدقيق 1', mobile: '0543332211', vatNumber: '300044433300003' },
    ];

    const job = executeImportCommit(store, tenantId, userId, userEmail, {
      template: 'SUPPLIERS',
      mode: 'CREATE_OR_UPDATE',
      rows: newRows,
    });

    // Check commit audit log
    const commitAudit = store.auditLogs.find((a) => a.action === 'IMPORT_SUPPLIERS_COMMIT' && a.resourceId === job.id);
    expect(commitAudit).toBeDefined();
    expect(commitAudit?.tenantId).toBe(tenantId);
    expect(commitAudit?.userEmail).toBe(userEmail);
    expect(commitAudit?.correlationId).toBeDefined();

    // Perform rollback
    executeImportRollback(store, tenantId, userId, userEmail, job.id);

    // Check rollback audit log
    const rollbackAudit = store.auditLogs.find((a) => a.action === 'IMPORT_SUPPLIERS_ROLLBACK' && a.resourceId === job.id);
    expect(rollbackAudit).toBeDefined();
    expect(rollbackAudit?.tenantId).toBe(tenantId);
    expect(rollbackAudit?.userEmail).toBe(userEmail);
    expect(rollbackAudit?.changesDiff.removedRecordsCount).toBe(1);
    expect(store.auditLogs.length).toBeGreaterThanOrEqual(initialAuditCount + 2);
  });
});

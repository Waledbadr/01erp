import crypto from 'crypto';
import { CentralTenantDataStore } from '../../core/tenantGuard.js';
import {
  ImportTemplate,
  ImportMode,
  ImportJob,
  ImportValidationError,
} from './types.js';
import { validateImportRows } from './importValidationService.js';
import { toHalalas } from '../../../src/lib/accounting.js';

export interface CommitParams {
  template: ImportTemplate;
  mode: ImportMode;
  rows: Record<string, any>[];
  filename?: string;
  simulateDbFailureAtRow?: number; // For test #3: induced DB failure mid-commit
}

export function executeImportCommit(
  store: CentralTenantDataStore,
  tenantId: string,
  userId: string,
  userEmail: string,
  params: CommitParams
): ImportJob {
  const { template, mode, rows, filename = 'import_file.csv', simulateDbFailureAtRow } = params;

  // 1. Pre-validation: Dry-run check first
  const validation = validateImportRows(store, tenantId, template, mode, rows);
  if (!validation.isValid) {
    const errorMessages = validation.errors
      .filter((e) => e.severity === 'ERROR')
      .map((e) => `[Row ${e.rowNumber}] ${e.errorCode}: ${e.messageAr}`)
      .join('; ');
    throw new Error(`VALIDATION_FAILED: لا يمكن الاعتماد لوجود أخطاء إلزامية (${errorMessages})`);
  }

  const jobId = crypto.randomUUID();
  const createdRecordIds: {
    entityType: string;
    ids: string[];
    journalIds?: string[];
    stockMovementIds?: string[];
    subaccountIds?: string[];
  } = {
    entityType: template,
    ids: [],
    journalIds: [],
    stockMovementIds: [],
    subaccountIds: [],
  };

  const previousSnapshots: Array<{ entityType: string; id: string; snapshot: any }> = [];

  // =========================================================================
  // TRANSACTIONAL SAFETY NET: Snapshot all potentially affected collections
  // =========================================================================
  const backupCustomers = JSON.parse(JSON.stringify(store.customers.get(tenantId) || []));
  const backupSuppliers = JSON.parse(JSON.stringify(store.suppliers.get(tenantId) || []));
  const backupItems = JSON.parse(JSON.stringify(store.items.get(tenantId) || []));
  const backupAccounts = JSON.parse(JSON.stringify(store.accounts.get(tenantId) || []));
  const backupOpeningBalances = JSON.parse(JSON.stringify(store.openingBalances.get(tenantId) || []));
  const backupSalesInvoices = JSON.parse(JSON.stringify(store.salesInvoices.get(tenantId) || []));
  const backupPurchaseBills = JSON.parse(JSON.stringify(store.purchaseBills.get(tenantId) || []));
  const backupCustomerReceipts = JSON.parse(JSON.stringify(store.customerReceipts.get(tenantId) || []));
  const backupSupplierPayments = JSON.parse(JSON.stringify(store.supplierPayments.get(tenantId) || []));
  const backupJournals = JSON.parse(JSON.stringify(store.journals.get(tenantId) || []));
  const backupStockMovements = JSON.parse(JSON.stringify(store.stockMovements.get(tenantId) || []));
  const backupWarehouseStocks = JSON.parse(JSON.stringify(store.warehouseStocks.get(tenantId) || []));

  // Backup journal lines for tenant's journals
  const tenantJournalIds = new Set(backupJournals.map((j: any) => j.id));
  const backupJournalLines = new Map<string, any[]>();
  tenantJournalIds.forEach((jid: any) => {
    const lines = store.journalLines.get(jid);
    if (lines) {
      backupJournalLines.set(jid, JSON.parse(JSON.stringify(lines)));
    }
  });

  const rollbackEntireBatch = () => {
    store.customers.set(tenantId, backupCustomers);
    store.suppliers.set(tenantId, backupSuppliers);
    store.items.set(tenantId, backupItems);
    store.accounts.set(tenantId, backupAccounts);
    store.openingBalances.set(tenantId, backupOpeningBalances);
    store.salesInvoices.set(tenantId, backupSalesInvoices);
    store.purchaseBills.set(tenantId, backupPurchaseBills);
    store.customerReceipts.set(tenantId, backupCustomerReceipts);
    store.supplierPayments.set(tenantId, backupSupplierPayments);
    store.journals.set(tenantId, backupJournals);
    store.stockMovements.set(tenantId, backupStockMovements);
    store.warehouseStocks.set(tenantId, backupWarehouseStocks);

    // restore journal lines
    tenantJournalIds.forEach((jid: any) => {
      const restored = backupJournalLines.get(jid);
      if (restored) {
        store.journalLines.set(jid, restored);
      } else {
        store.journalLines.delete(jid);
      }
    });
    // clean up any new journal lines created
    if (createdRecordIds.journalIds) {
      createdRecordIds.journalIds.forEach((jid) => store.journalLines.delete(jid));
    }
  };

  let createdCount = 0;
  let updatedCount = 0;
  let failedCount = 0;
  const commitErrors: ImportValidationError[] = [];

  try {
    const nowIso = new Date().toISOString();

    switch (template) {
      case 'CUSTOMERS': {
        const customers = store.customers.get(tenantId) || [];
        rows.forEach((row, index) => {
          const rowNumber = index + 1;
          if (simulateDbFailureAtRow && rowNumber === simulateDbFailureAtRow) {
            throw new Error(`INDUCED_DB_CRASH_SIMULATION: Database transaction failed at row ${rowNumber}`);
          }

          const vatNumber = row.vatNumber ? String(row.vatNumber).trim() : undefined;
          const mobile = String(row.mobile).trim();
          const nameAr = String(row.nameAr).trim();
          const nameEn = row.nameEn ? String(row.nameEn).trim() : nameAr;

          const existingIndex = customers.findIndex(
            (c) => (vatNumber && c.vatNumber === vatNumber) || c.mobile === mobile
          );

          if (existingIndex >= 0) {
            const existing = customers[existingIndex];
            previousSnapshots.push({ entityType: 'CUSTOMER', id: existing.id, snapshot: JSON.parse(JSON.stringify(existing)) });
            customers[existingIndex] = {
              ...existing,
              nameAr,
              nameEn,
              email: row.email || existing.email,
              crNumber: row.crNumber || existing.crNumber,
              creditLimit: row.creditLimitSar !== undefined ? Number(row.creditLimitSar) : existing.creditLimit,
              city: row.city || (existing as any).city,
              district: row.district || (existing as any).district,
              updatedAt: nowIso,
            } as any;
            updatedCount++;
          } else {
            const newId = crypto.randomUUID();
            const newCode = `CUST-${String(customers.length + 1).padStart(4, '0')}`;
            const subaccountId = `10201-${newCode}`;
            const newCust = {
              id: newId,
              tenantId,
              code: newCode,
              nameAr,
              nameEn,
              type: row.type || 'ESTABLISHMENT',
              customerGroup: 'RETAIL',
              priceList: 'RETAIL',
              vatNumber,
              crNumber: row.crNumber,
              mobile,
              email: row.email,
              city: row.city,
              district: row.district,
              paymentTerms: 'NET_30',
              creditLimit: Number(row.creditLimitSar) || 0,
              subaccountId,
              balanceSar: 0,
              isActive: true,
              importJobId: jobId,
              createdAt: nowIso,
              updatedAt: nowIso,
            };
            customers.push(newCust as any);
            createdRecordIds.ids.push(newId);
            createdRecordIds.subaccountIds?.push(subaccountId);
            createdCount++;
          }
        });
        store.customers.set(tenantId, customers);
        break;
      }

      case 'SUPPLIERS': {
        const suppliers = store.suppliers.get(tenantId) || [];
        rows.forEach((row, index) => {
          const rowNumber = index + 1;
          if (simulateDbFailureAtRow && rowNumber === simulateDbFailureAtRow) {
            throw new Error(`INDUCED_DB_CRASH_SIMULATION: Database transaction failed at row ${rowNumber}`);
          }

          const vatNumber = row.vatNumber ? String(row.vatNumber).trim() : undefined;
          const mobile = String(row.mobile).trim();
          const nameAr = String(row.nameAr).trim();
          const nameEn = row.nameEn ? String(row.nameEn).trim() : nameAr;

          const existingIndex = suppliers.findIndex(
            (s) => (vatNumber && s.vatNumber === vatNumber) || s.mobile === mobile
          );

          if (existingIndex >= 0) {
            const existing = suppliers[existingIndex];
            previousSnapshots.push({ entityType: 'SUPPLIER', id: existing.id, snapshot: JSON.parse(JSON.stringify(existing)) });
            suppliers[existingIndex] = {
              ...existing,
              nameAr,
              nameEn,
              email: row.email || existing.email,
              crNumber: row.crNumber || existing.crNumber,
              bankIban: row.bankIban || existing.bankIban,
              updatedAt: nowIso,
            };
            updatedCount++;
          } else {
            const newId = crypto.randomUUID();
            const newCode = `SUPP-${String(suppliers.length + 1).padStart(4, '0')}`;
            const subaccountId = `20101-${newCode}`;
            const newSupp = {
              id: newId,
              tenantId,
              code: newCode,
              nameAr,
              nameEn,
              type: row.type || 'COMPANY',
              supplierType: 'LOCAL',
              supplierGroup: 'COMMODITIES',
              vatNumber,
              crNumber: row.crNumber,
              mobile,
              email: row.email,
              bankIban: row.bankIban,
              paymentTerms: 'NET_30',
              creditLimit: Number(row.creditLimitSar) || 0,
              subaccountId,
              balanceSar: 0,
              isActive: true,
              importJobId: jobId,
              createdAt: nowIso,
              updatedAt: nowIso,
            };
            suppliers.push(newSupp as any);
            createdRecordIds.ids.push(newId);
            createdRecordIds.subaccountIds?.push(subaccountId);
            createdCount++;
          }
        });
        store.suppliers.set(tenantId, suppliers);
        break;
      }

      case 'ITEMS': {
        const items = store.items.get(tenantId) || [];
        rows.forEach((row, index) => {
          const rowNumber = index + 1;
          if (simulateDbFailureAtRow && rowNumber === simulateDbFailureAtRow) {
            throw new Error(`INDUCED_DB_CRASH_SIMULATION: Database transaction failed at row ${rowNumber}`);
          }

          const sku = String(row.sku).trim();
          const nameAr = String(row.nameAr).trim();
          const nameEn = row.nameEn ? String(row.nameEn).trim() : nameAr;
          const sellingPrice = Number(row.sellingPrice) || 0;
          const purchasePrice = row.purchasePrice !== undefined ? Number(row.purchasePrice) : 0;
          const baseUnit = String(row.baseUnit || 'PCS').toUpperCase();
          const vatRate = row.vatRate !== undefined ? Number(row.vatRate) : 15;

          const existingIndex = items.findIndex((i) => i.sku.toLowerCase() === sku.toLowerCase());

          if (existingIndex >= 0) {
            const existing = items[existingIndex];
            previousSnapshots.push({ entityType: 'ITEM', id: existing.id, snapshot: JSON.parse(JSON.stringify(existing)) });
            items[existingIndex] = {
              ...existing,
              nameAr,
              nameEn,
              sellingPrice,
              purchasePrice,
              baseUnit,
              vatRate,
              barcode: row.barcode || (existing as any).barcode,
              updatedAt: nowIso,
            } as any;
            updatedCount++;
          } else {
            const newId = crypto.randomUUID();
            const newItem = {
              id: newId,
              tenantId,
              sku,
              nameAr,
              nameEn,
              category: row.category || 'GENERAL',
              baseUnit,
              purchasePrice,
              sellingPrice,
              cost: purchasePrice,
              vatRate,
              barcode: row.barcode || sku,
              trackInventory: true,
              isActive: true,
              importJobId: jobId,
              createdAt: nowIso,
              updatedAt: nowIso,
            };
            items.push(newItem as any);
            createdRecordIds.ids.push(newId);
            createdCount++;
          }
        });
        store.items.set(tenantId, items);
        break;
      }

      case 'ACCOUNTS': {
        const accounts = store.accounts.get(tenantId) || [];
        rows.forEach((row, index) => {
          const rowNumber = index + 1;
          if (simulateDbFailureAtRow && rowNumber === simulateDbFailureAtRow) {
            throw new Error(`INDUCED_DB_CRASH_SIMULATION: Database transaction failed at row ${rowNumber}`);
          }

          const code = String(row.code).trim();
          const nameAr = String(row.nameAr).trim();
          const nameEn = row.nameEn ? String(row.nameEn).trim() : nameAr;
          const type = String(row.type).toUpperCase().trim();
          const normalBalance = row.normalBalance ? String(row.normalBalance).toUpperCase().trim() : (['ASSET', 'EXPENSE', 'COGS'].includes(type) ? 'DEBIT' : 'CREDIT');

          const existingIndex = accounts.findIndex((a) => a.code === code);
          if (existingIndex >= 0) {
            const existing = accounts[existingIndex];
            previousSnapshots.push({ entityType: 'ACCOUNT', id: existing.id, snapshot: JSON.parse(JSON.stringify(existing)) });
            accounts[existingIndex] = {
              ...existing,
              nameAr,
              nameEn,
              type: type as any,
              normalBalance: normalBalance as any,
              parentCode: row.parentCode,
            } as any;
            updatedCount++;
          } else {
            const newId = crypto.randomUUID();
            const newAccount = {
              id: newId,
              tenantId,
              code,
              nameAr,
              nameEn,
              type: type as any,
              normalBalance,
              parentCode: row.parentCode,
              allowPosting: true,
              isActive: true,
              balanceSar: 0,
              importJobId: jobId,
              createdAt: nowIso,
            } as any;
            accounts.push(newAccount as any);
            createdRecordIds.ids.push(newId);
            createdCount++;
          }
        });
        store.accounts.set(tenantId, accounts);
        break;
      }

      case 'OPENING_BALANCES': {
        const openingBalances = store.openingBalances.get(tenantId) || [];
        const journals = store.journals.get(tenantId) || [];

        // Post balancing General Ledger journal entry for opening balances (Rule G1)
        const journalId = crypto.randomUUID();
        const entryNumber = `JV-OPN-${nowIso.slice(0, 10).replace(/-/g, '')}-${String(journals.length + 1).padStart(3, '0')}`;
        const journalLines: any[] = [];
        let totalDebitHalalas = 0n;
        let totalCreditHalalas = 0n;

        rows.forEach((row, index) => {
          const rowNumber = index + 1;
          if (simulateDbFailureAtRow && rowNumber === simulateDbFailureAtRow) {
            throw new Error(`INDUCED_DB_CRASH_SIMULATION: Database transaction failed at row ${rowNumber}`);
          }

          const accountCode = String(row.accountCode).trim();
          const debitSar = Number(row.debitSar) || 0;
          const creditSar = Number(row.creditSar) || 0;
          const desc = row.descriptionAr || 'رصيد افتتاحي';

          const entryId = crypto.randomUUID();
          openingBalances.push({
            id: entryId,
            tenantId,
            accountCode,
            debitSar,
            creditSar,
            descriptionAr: desc,
            journalId,
            importJobId: jobId,
            createdAt: nowIso,
          } as any);
          createdRecordIds.ids.push(entryId);
          createdCount++;

          const dH = toHalalas(String(debitSar));
          const cH = toHalalas(String(creditSar));
          totalDebitHalalas += dH;
          totalCreditHalalas += cH;

          journalLines.push({
            id: crypto.randomUUID(),
            journalId,
            tenantId,
            accountCode,
            debitHalalas: dH,
            creditHalalas: cH,
            debitSar,
            creditSar,
            descriptionAr: desc,
          });
        });

        // Add journal to ledger
        const journalEntry = {
          id: journalId,
          tenantId,
          entryNumber,
          entryDate: nowIso.slice(0, 10),
          sourceType: 'OPENING_BALANCES',
          sourceId: jobId,
          status: 'POSTED',
          totalDebitHalalas,
          totalCreditHalalas,
          totalDebitSar: Number(totalDebitHalalas) / 100,
          totalCreditSar: Number(totalCreditHalalas) / 100,
          narrationAr: 'القيد الافتتاحي المالي المعتمد',
          narrationEn: 'Posted Opening Balances Journal Entry',
          isReversed: false,
          importJobId: jobId,
          createdBy: userEmail,
          createdAt: nowIso,
        };

        journals.push(journalEntry as any);
        store.journals.set(tenantId, journals);
        store.journalLines.set(journalId, journalLines);
        store.openingBalances.set(tenantId, openingBalances);
        createdRecordIds.journalIds?.push(journalId);
        break;
      }

      case 'SALES_INVOICES': {
        const invoices = store.salesInvoices.get(tenantId) || [];
        const journals = store.journals.get(tenantId) || [];
        const customers = store.customers.get(tenantId) || [];

        // Group rows by invoiceNumber
        const grouped = new Map<string, typeof rows>();
        rows.forEach((r) => {
          const num = String(r.invoiceNumber).trim();
          const list = grouped.get(num) || [];
          list.push(r);
          grouped.set(num, list);
        });

        let rowIndexCounter = 0;
        grouped.forEach((invRows, invNum) => {
          rowIndexCounter++;
          if (simulateDbFailureAtRow && rowIndexCounter === simulateDbFailureAtRow) {
            throw new Error(`INDUCED_DB_CRASH_SIMULATION: Database transaction failed at row ${rowIndexCounter}`);
          }

          const first = invRows[0];
          const custIdent = String(first.customerVatOrMobile).trim();
          const customer = customers.find((c) => c.vatNumber === custIdent || c.mobile === custIdent || c.code === custIdent) || customers[0];

          let subtotalSar = 0;
          let taxTotalSar = 0;
          const lines = invRows.map((lr, lIdx) => {
            const qty = Number(lr.quantity) || 1;
            const unitPrice = Number(lr.unitPrice) || 0;
            const discount = Number(lr.discountAmount) || 0;
            const lineSub = qty * unitPrice - discount;
            const vatRate = lr.vatRate !== undefined ? Number(lr.vatRate) : 15;
            const lineTax = (lineSub * vatRate) / 100;
            subtotalSar += lineSub;
            taxTotalSar += lineTax;
            return {
              id: crypto.randomUUID(),
              lineNumber: lIdx + 1,
              itemSku: String(lr.itemSku).trim(),
              nameAr: lr.itemSku,
              quantity: qty,
              unitPrice,
              discountAmount: discount,
              taxableAmount: lineSub,
              vatRate,
              taxAmount: lineTax,
              totalAmount: lineSub + lineTax,
            };
          });

          const totalSar = subtotalSar + taxTotalSar;
          const invoiceId = crypto.randomUUID();

          // Create invoice
          const invObj = {
            id: invoiceId,
            tenantId,
            invoiceNumber: invNum,
            issueDate: first.issueDate || nowIso.slice(0, 10),
            customerId: customer?.id || '',
            customerNameAr: customer?.nameAr || 'عميل نقدي',
            customerVatNumber: customer?.vatNumber,
            invoiceType: '388_STANDARD_B2B',
            status: 'POSTED',
            subtotalSar,
            taxTotalSar,
            totalSar,
            lines,
            importJobId: jobId,
            createdAt: nowIso,
          };
          invoices.push(invObj as any);
          createdRecordIds.ids.push(invoiceId);
          createdCount++;

          // Create double-entry journal (Rule G1)
          const journalId = crypto.randomUUID();
          const jvNum = `JV-INV-${invNum}`;
          const dH = toHalalas(String(totalSar));
          const cH_Rev = toHalalas(String(subtotalSar));
          const cH_Vat = toHalalas(String(taxTotalSar));

          const jvLines = [
            {
              id: crypto.randomUUID(),
              journalId,
              tenantId,
              accountCode: '10201', // Accounts Receivable
              debitHalalas: dH,
              creditHalalas: 0n,
              debitSar: totalSar,
              creditSar: 0,
              descriptionAr: `استحقاق فاتورة مبيعات ${invNum}`,
            },
            {
              id: crypto.randomUUID(),
              journalId,
              tenantId,
              accountCode: '40101', // Sales Revenue
              debitHalalas: 0n,
              creditHalalas: cH_Rev,
              debitSar: 0,
              creditSar: subtotalSar,
              descriptionAr: `إيراد مبيعات فاتورة ${invNum}`,
            },
            {
              id: crypto.randomUUID(),
              journalId,
              tenantId,
              accountCode: '20201', // VAT Output
              debitHalalas: 0n,
              creditHalalas: cH_Vat,
              debitSar: 0,
              creditSar: taxTotalSar,
              descriptionAr: `ضريبة مخرجات فاتورة ${invNum}`,
            },
          ];

          const jv = {
            id: journalId,
            tenantId,
            entryNumber: jvNum,
            entryDate: first.issueDate || nowIso.slice(0, 10),
            sourceType: 'SALES_INVOICE',
            sourceId: invoiceId,
            status: 'POSTED',
            totalDebitHalalas: dH,
            totalCreditHalalas: cH_Rev + cH_Vat,
            totalDebitSar: totalSar,
            totalCreditSar: totalSar,
            narrationAr: `قيد فاتورة مبيعات مستوردة ${invNum}`,
            narrationEn: `Imported Sales Invoice JV ${invNum}`,
            isReversed: false,
            importJobId: jobId,
            createdAt: nowIso,
          };

          journals.push(jv as any);
          store.journalLines.set(journalId, jvLines as any);
          createdRecordIds.journalIds?.push(journalId);
        });

        store.salesInvoices.set(tenantId, invoices);
        store.journals.set(tenantId, journals);
        break;
      }

      case 'PURCHASE_BILLS': {
        const bills = store.purchaseBills.get(tenantId) || [];
        const journals = store.journals.get(tenantId) || [];
        const suppliers = store.suppliers.get(tenantId) || [];

        const grouped = new Map<string, typeof rows>();
        rows.forEach((r) => {
          const num = String(r.billNumber).trim();
          const list = grouped.get(num) || [];
          list.push(r);
          grouped.set(num, list);
        });

        let rowIndexCounter = 0;
        grouped.forEach((bRows, billNum) => {
          rowIndexCounter++;
          if (simulateDbFailureAtRow && rowIndexCounter === simulateDbFailureAtRow) {
            throw new Error(`INDUCED_DB_CRASH_SIMULATION: Database transaction failed at row ${rowIndexCounter}`);
          }

          const first = bRows[0];
          const suppIdent = String(first.supplierVatOrMobile).trim();
          const supplier = suppliers.find((s) => s.vatNumber === suppIdent || s.mobile === suppIdent || s.code === suppIdent) || suppliers[0];

          let subtotalSar = 0;
          let taxTotalSar = 0;
          const lines = bRows.map((br, bIdx) => {
            const qty = Number(br.quantity) || 1;
            const cost = Number(br.unitCost) || 0;
            const lineSub = qty * cost;
            const vatRate = br.vatRate !== undefined ? Number(br.vatRate) : 15;
            const lineTax = (lineSub * vatRate) / 100;
            subtotalSar += lineSub;
            taxTotalSar += lineTax;
            return {
              id: crypto.randomUUID(),
              lineNumber: bIdx + 1,
              itemSku: String(br.itemSku).trim(),
              nameAr: br.itemSku,
              quantity: qty,
              unitCost: cost,
              taxableAmount: lineSub,
              vatRate,
              taxAmount: lineTax,
              totalAmount: lineSub + lineTax,
            };
          });

          const totalSar = subtotalSar + taxTotalSar;
          const billId = crypto.randomUUID();

          const billObj = {
            id: billId,
            tenantId,
            billNumber: billNum,
            supplierBillNumber: billNum,
            billDate: first.billDate || nowIso.slice(0, 10),
            supplierId: supplier?.id || '',
            supplierNameAr: supplier?.nameAr || 'مورد محلي',
            supplierVatNumber: supplier?.vatNumber,
            status: 'POSTED',
            subtotalSar,
            taxTotalSar,
            totalSar,
            lines,
            importJobId: jobId,
            createdAt: nowIso,
          };
          bills.push(billObj as any);
          createdRecordIds.ids.push(billId);
          createdCount++;

          // Journal entry: Debit Purchases + Debit Input VAT, Credit AP
          const journalId = crypto.randomUUID();
          const jvNum = `JV-BILL-${billNum}`;
          const dH_Purch = toHalalas(String(subtotalSar));
          const dH_Vat = toHalalas(String(taxTotalSar));
          const cH_AP = toHalalas(String(totalSar));

          const jvLines = [
            {
              id: crypto.randomUUID(),
              journalId,
              tenantId,
              accountCode: '50101', // Purchases/COGS or Inventory
              debitHalalas: dH_Purch,
              creditHalalas: 0n,
              debitSar: subtotalSar,
              creditSar: 0,
              descriptionAr: `إثبات مشتريات فاتورة مورد ${billNum}`,
            },
            {
              id: crypto.randomUUID(),
              journalId,
              tenantId,
              accountCode: '10301', // VAT Input
              debitHalalas: dH_Vat,
              creditHalalas: 0n,
              debitSar: taxTotalSar,
              creditSar: 0,
              descriptionAr: `ضريبة مدخلات فاتورة مورد ${billNum}`,
            },
            {
              id: crypto.randomUUID(),
              journalId,
              tenantId,
              accountCode: '20101', // Accounts Payable
              debitHalalas: 0n,
              creditHalalas: cH_AP,
              debitSar: 0,
              creditSar: totalSar,
              descriptionAr: `مستحقات مورد فاتورة ${billNum}`,
            },
          ];

          const jv = {
            id: journalId,
            tenantId,
            entryNumber: jvNum,
            entryDate: first.billDate || nowIso.slice(0, 10),
            sourceType: 'PURCHASE_BILL',
            sourceId: billId,
            status: 'POSTED',
            totalDebitHalalas: dH_Purch + dH_Vat,
            totalCreditHalalas: cH_AP,
            totalDebitSar: totalSar,
            totalCreditSar: totalSar,
            narrationAr: `قيد فاتورة مشتريات مستوردة ${billNum}`,
            narrationEn: `Imported Purchase Bill JV ${billNum}`,
            isReversed: false,
            importJobId: jobId,
            createdAt: nowIso,
          };

          journals.push(jv as any);
          store.journalLines.set(journalId, jvLines as any);
          createdRecordIds.journalIds?.push(journalId);
        });

        store.purchaseBills.set(tenantId, bills);
        store.journals.set(tenantId, journals);
        break;
      }

      case 'PAYMENTS': {
        const receipts = store.customerReceipts.get(tenantId) || [];
        const payments = store.supplierPayments.get(tenantId) || [];
        const journals = store.journals.get(tenantId) || [];

        rows.forEach((row, index) => {
          const rowNumber = index + 1;
          if (simulateDbFailureAtRow && rowNumber === simulateDbFailureAtRow) {
            throw new Error(`INDUCED_DB_CRASH_SIMULATION: Database transaction failed at row ${rowNumber}`);
          }

          const voucherNum = String(row.voucherNumber).trim();
          const pType = String(row.paymentType).toUpperCase().trim();
          const amount = Number(row.amountSar) || 0;
          const pDate = row.paymentDate || nowIso.slice(0, 10);
          const pMethod = row.paymentMethod || 'BANK';

          const recordId = crypto.randomUUID();
          const journalId = crypto.randomUUID();
          const amtHalalas = toHalalas(String(amount));

          if (pType === 'RECEIPT') {
            receipts.push({
              id: recordId,
              tenantId,
              receiptNumber: voucherNum,
              receiptDate: pDate,
              amountSar: amount,
              paymentMethod: pMethod,
              status: 'POSTED',
              importJobId: jobId,
              createdAt: nowIso,
            } as any);

            // Journal: Debit Cash/Bank, Credit AR
            const jvLines = [
              {
                id: crypto.randomUUID(),
                journalId,
                tenantId,
                accountCode: pMethod === 'CASH' ? '10101' : '10102',
                debitHalalas: amtHalalas,
                creditHalalas: 0n,
                debitSar: amount,
                creditSar: 0,
                descriptionAr: `سند قبض ${voucherNum}`,
              },
              {
                id: crypto.randomUUID(),
                journalId,
                tenantId,
                accountCode: '10201',
                debitHalalas: 0n,
                creditHalalas: amtHalalas,
                debitSar: 0,
                creditSar: amount,
                descriptionAr: `سداد عميل بموجب سند قبض ${voucherNum}`,
              },
            ];

            journals.push({
              id: journalId,
              tenantId,
              entryNumber: `JV-RCT-${voucherNum}`,
              entryDate: pDate,
              sourceType: 'CUSTOMER_RECEIPT',
              sourceId: recordId,
              status: 'POSTED',
              totalDebitHalalas: amtHalalas,
              totalCreditHalalas: amtHalalas,
              totalDebitSar: amount,
              totalCreditSar: amount,
              narrationAr: `قيد سند قبض مستورد ${voucherNum}`,
              importJobId: jobId,
              createdAt: nowIso,
            } as any);

            store.journalLines.set(journalId, jvLines as any);
          } else {
            payments.push({
              id: recordId,
              tenantId,
              paymentNumber: voucherNum,
              paymentDate: pDate,
              amountSar: amount,
              paymentMethod: pMethod,
              status: 'POSTED',
              importJobId: jobId,
              createdAt: nowIso,
            } as any);

            // Journal: Debit AP, Credit Cash/Bank
            const jvLines = [
              {
                id: crypto.randomUUID(),
                journalId,
                tenantId,
                accountCode: '20101',
                debitHalalas: amtHalalas,
                creditHalalas: 0n,
                debitSar: amount,
                creditSar: 0,
                descriptionAr: `سداد مورد بموجب سند صرف ${voucherNum}`,
              },
              {
                id: crypto.randomUUID(),
                journalId,
                tenantId,
                accountCode: pMethod === 'CASH' ? '10101' : '10102',
                debitHalalas: 0n,
                creditHalalas: amtHalalas,
                debitSar: 0,
                creditSar: amount,
                descriptionAr: `سند صرف ${voucherNum}`,
              },
            ];

            journals.push({
              id: journalId,
              tenantId,
              entryNumber: `JV-PAY-${voucherNum}`,
              entryDate: pDate,
              sourceType: 'SUPPLIER_PAYMENT',
              sourceId: recordId,
              status: 'POSTED',
              totalDebitHalalas: amtHalalas,
              totalCreditHalalas: amtHalalas,
              totalDebitSar: amount,
              totalCreditSar: amount,
              narrationAr: `قيد سند صرف مستورد ${voucherNum}`,
              importJobId: jobId,
              createdAt: nowIso,
            } as any);

            store.journalLines.set(journalId, jvLines as any);
          }

          createdRecordIds.ids.push(recordId);
          createdRecordIds.journalIds?.push(journalId);
          createdCount++;
        });

        store.customerReceipts.set(tenantId, receipts);
        store.supplierPayments.set(tenantId, payments);
        store.journals.set(tenantId, journals);
        break;
      }

      case 'JOURNAL_ENTRIES': {
        const journals = store.journals.get(tenantId) || [];
        const grouped = new Map<string, typeof rows>();
        rows.forEach((r) => {
          const num = String(r.entryNumber).trim();
          const list = grouped.get(num) || [];
          list.push(r);
          grouped.set(num, list);
        });

        let rowIndexCounter = 0;
        grouped.forEach((entryRows, entryNum) => {
          rowIndexCounter++;
          if (simulateDbFailureAtRow && rowIndexCounter === simulateDbFailureAtRow) {
            throw new Error(`INDUCED_DB_CRASH_SIMULATION: Database transaction failed at row ${rowIndexCounter}`);
          }

          const first = entryRows[0];
          const journalId = crypto.randomUUID();
          let totalDebitH = 0n;
          let totalCreditH = 0n;

          const jvLines = entryRows.map((lr) => {
            const d = Number(lr.debitSar) || 0;
            const c = Number(lr.creditSar) || 0;
            const dH = toHalalas(String(d));
            const cH = toHalalas(String(c));
            totalDebitH += dH;
            totalCreditH += cH;
            return {
              id: crypto.randomUUID(),
              journalId,
              tenantId,
              accountCode: String(lr.accountCode).trim(),
              debitHalalas: dH,
              creditHalalas: cH,
              debitSar: d,
              creditSar: c,
              descriptionAr: lr.lineDescription || 'قيد مستورد',
            };
          });

          const jv = {
            id: journalId,
            tenantId,
            entryNumber: entryNum,
            entryDate: first.entryDate || nowIso.slice(0, 10),
            sourceType: 'MANUAL_IMPORT',
            sourceId: jobId,
            status: 'POSTED',
            totalDebitHalalas: totalDebitH,
            totalCreditHalalas: totalCreditH,
            totalDebitSar: Number(totalDebitH) / 100,
            totalCreditSar: Number(totalCreditH) / 100,
            narrationAr: first.lineDescription || `قيد يومية مستورد ${entryNum}`,
            narrationEn: `Imported Journal Entry ${entryNum}`,
            isReversed: false,
            importJobId: jobId,
            createdBy: userEmail,
            createdAt: nowIso,
          };

          journals.push(jv as any);
          store.journalLines.set(journalId, jvLines as any);
          createdRecordIds.ids.push(journalId);
          createdRecordIds.journalIds?.push(journalId);
          createdCount++;
        });

        store.journals.set(tenantId, journals);
        break;
      }

      case 'STOCK_OPENING': {
        const stockMovements = store.stockMovements.get(tenantId) || [];
        const warehouseStocks = store.warehouseStocks.get(tenantId) || [];
        const journals = store.journals.get(tenantId) || [];

        const grouped = new Map<string, typeof rows>();
        rows.forEach((r) => {
          const docNum = String(r.documentNumber).trim();
          const list = grouped.get(docNum) || [];
          list.push(r);
          grouped.set(docNum, list);
        });

        let rowIndexCounter = 0;
        grouped.forEach((docRows, docNum) => {
          rowIndexCounter++;
          if (simulateDbFailureAtRow && rowIndexCounter === simulateDbFailureAtRow) {
            throw new Error(`INDUCED_DB_CRASH_SIMULATION: Database transaction failed at row ${rowIndexCounter}`);
          }

          let totalValuationSar = 0;

          docRows.forEach((sr) => {
            const movementId = crypto.randomUUID();
            const itemSku = String(sr.itemSku).trim();
            const warehouseCode = String(sr.warehouseCode).trim();
            const qty = Number(sr.quantity) || 0;
            const cost = Number(sr.unitCost) || 0;
            const val = qty * cost;
            totalValuationSar += val;

            // 1. Record stock movement
            stockMovements.push({
              id: movementId,
              tenantId,
              documentNumber: docNum,
              movementType: 'OPENING_STOCK',
              itemSku,
              warehouseCode,
              quantity: qty,
              unitCost: cost,
              totalCost: val,
              referenceType: 'STOCK_OPENING',
              referenceId: jobId,
              importJobId: jobId,
              createdAt: nowIso,
            } as any);

            createdRecordIds.ids.push(movementId);
            createdRecordIds.stockMovementIds?.push(movementId);
            createdCount++;

            // 2. Update warehouse inventory stock level
            const stockIndex = warehouseStocks.findIndex(
              (ws: any) => ws.warehouseCode === warehouseCode && ws.itemSku === itemSku
            );
            if (stockIndex >= 0) {
              (warehouseStocks[stockIndex] as any).quantity = ((warehouseStocks[stockIndex] as any).quantity || 0) + qty;
              (warehouseStocks[stockIndex] as any).valuationSar = ((warehouseStocks[stockIndex] as any).valuationSar || 0) + val;
            } else {
              warehouseStocks.push({
                id: crypto.randomUUID(),
                tenantId,
                warehouseCode,
                itemSku,
                quantity: qty,
                valuationSar: val,
                lastCost: cost,
                importJobId: jobId,
              } as any);
            }
          });

          // 3. Post balancing inventory opening journal into Equity (Rule G1)
          const journalId = crypto.randomUUID();
          const valHalalas = toHalalas(String(totalValuationSar));
          const jvLines = [
            {
              id: crypto.randomUUID(),
              journalId,
              tenantId,
              accountCode: '10401', // Inventory Asset
              debitHalalas: valHalalas,
              creditHalalas: 0n,
              debitSar: totalValuationSar,
              creditSar: 0,
              descriptionAr: `إثبات بضاعة أول المدة وثيقة ${docNum}`,
            },
            {
              id: crypto.randomUUID(),
              journalId,
              tenantId,
              accountCode: '30101', // Opening Equity / Capital
              debitHalalas: 0n,
              creditHalalas: valHalalas,
              debitSar: 0,
              creditSar: totalValuationSar,
              descriptionAr: `رصيد أول المدة المقابل في حقوق الملكية ${docNum}`,
            },
          ];

          journals.push({
            id: journalId,
            tenantId,
            entryNumber: `JV-STK-${docNum}`,
            entryDate: nowIso.slice(0, 10),
            sourceType: 'OPENING_STOCK',
            sourceId: jobId,
            status: 'POSTED',
            totalDebitHalalas: valHalalas,
            totalCreditHalalas: valHalalas,
            totalDebitSar: totalValuationSar,
            totalCreditSar: totalValuationSar,
            narrationAr: `قيد بضاعة أول المدة بالمستودعات ${docNum}`,
            importJobId: jobId,
            createdAt: nowIso,
          } as any);

          store.journalLines.set(journalId, jvLines as any);
          createdRecordIds.journalIds?.push(journalId);
        });

        store.stockMovements.set(tenantId, stockMovements);
        store.warehouseStocks.set(tenantId, warehouseStocks);
        store.journals.set(tenantId, journals);
        break;
      }
    }
  } catch (err: any) {
    // =========================================================================
    // FULL TRANSACTION ROLLBACK: Restore zero residue on any mid-commit failure!
    // =========================================================================
    rollbackEntireBatch();
    failedCount = rows.length;
    commitErrors.push({
      rowNumber: 0,
      field: 'transaction',
      value: null,
      errorCode: 'TRANSACTION_ABORTED',
      messageAr: `فشلت العملية وتم التراجع عن كافة البيانات بدون أي بقايا: ${err.message}`,
      messageEn: `Transaction aborted and cleanly rolled back with zero residue: ${err.message}`,
      severity: 'ERROR',
    });

    const failedJob: ImportJob = {
      id: jobId,
      tenantId,
      template,
      mode,
      status: 'FAILED',
      filename,
      totalRows: rows.length,
      createdCount: 0,
      updatedCount: 0,
      failedCount: rows.length,
      errors: commitErrors,
      createdRecordIds: { entityType: template, ids: [] },
      previousSnapshots: [],
      createdAt: new Date().toISOString(),
      createdBy: userEmail,
      isRolledBack: true,
      rolledBackAt: new Date().toISOString(),
      rolledBackBy: 'SYSTEM_TRANSACTION_ROLLBACK',
    };

    const batches = store.batchImports.get(tenantId) || [];
    batches.unshift(failedJob);
    store.batchImports.set(tenantId, batches);

    throw err;
  }

  // Record successful commit job
  const job: ImportJob = {
    id: jobId,
    tenantId,
    template,
    mode,
    status: 'COMPLETED',
    filename,
    totalRows: rows.length,
    createdCount,
    updatedCount,
    failedCount,
    errors: commitErrors,
    createdRecordIds,
    previousSnapshots,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    createdBy: userEmail,
    isRolledBack: false,
  };

  const batches = store.batchImports.get(tenantId) || [];
  batches.unshift(job);
  store.batchImports.set(tenantId, batches);

  store.recordAuditLog({
    tenantId,
    userId,
    userEmail,
    action: `IMPORT_${template}_COMMIT`,
    resourceType: 'import_jobs',
    resourceId: jobId,
    correlationId: crypto.randomUUID(),
    changesDiff: {
      template,
      mode,
      totalRows: rows.length,
      createdCount,
      updatedCount,
    },
  });

  return job;
}

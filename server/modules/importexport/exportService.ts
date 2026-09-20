import { CentralTenantDataStore } from '../../core/tenantGuard.js';
import { ExportFilterParams, ImportTemplate } from './types.js';
import { IMPORT_TEMPLATES_CONFIG } from './templateDefinitions.js';

export function escapeCsvField(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvString(headers: string[], rows: Record<string, any>[]): string {
  const headerLine = headers.map(escapeCsvField).join(',');
  const lines = rows.map((row) => headers.map((h) => escapeCsvField(row[h])).join(','));
  // Prepend UTF-8 BOM (\uFEFF) for Excel Arabic readability
  return '\uFEFF' + [headerLine, ...lines].join('\r\n');
}

export function exportResourceData(
  store: CentralTenantDataStore,
  tenantId: string,
  params: ExportFilterParams
): { format: 'CSV' | 'JSON'; mimeType: string; filename: string; content: string; rowCount: number } {
  const resource = params.resource as ImportTemplate;
  const format = params.format || 'CSV';
  const config = IMPORT_TEMPLATES_CONFIG[resource];
  const search = params.search ? params.search.toLowerCase().trim() : '';
  const fromDate = params.fromDate;
  const toDate = params.toDate;

  let rawRows: Record<string, any>[] = [];

  switch (resource) {
    case 'CUSTOMERS': {
      const customers = store.customers.get(tenantId) || [];
      rawRows = customers
        .filter((c: any) => {
          if (search && !c.nameAr.toLowerCase().includes(search) && !c.code.toLowerCase().includes(search) && !c.mobile.includes(search)) return false;
          if (params.status && String(c.isActive) !== params.status) return false;
          return true;
        })
        .map((c: any) => ({
          nameAr: c.nameAr,
          nameEn: c.nameEn || '',
          vatNumber: c.vatNumber || '',
          crNumber: c.crNumber || '',
          mobile: c.mobile,
          email: c.email || '',
          creditLimitSar: c.creditLimit || 0,
          city: c.city || '',
          district: c.district || '',
        }));
      break;
    }

    case 'SUPPLIERS': {
      const suppliers = store.suppliers.get(tenantId) || [];
      rawRows = suppliers
        .filter((s: any) => {
          if (search && !s.nameAr.toLowerCase().includes(search) && !s.code.toLowerCase().includes(search) && !s.mobile.includes(search)) return false;
          if (params.status && String(s.isActive) !== params.status) return false;
          return true;
        })
        .map((s: any) => ({
          nameAr: s.nameAr,
          nameEn: s.nameEn || '',
          vatNumber: s.vatNumber || '',
          crNumber: s.crNumber || '',
          mobile: s.mobile,
          email: s.email || '',
          bankIban: s.bankIban || '',
        }));
      break;
    }

    case 'ITEMS': {
      const items = store.items.get(tenantId) || [];
      rawRows = items
        .filter((i: any) => {
          if (search && !i.sku.toLowerCase().includes(search) && !i.nameAr.toLowerCase().includes(search)) return false;
          if (params.category && (i.category || i.categoryId) !== params.category) return false;
          if (params.status && String(i.isActive) !== params.status) return false;
          return true;
        })
        .map((i: any) => ({
          sku: i.sku,
          nameAr: i.nameAr,
          nameEn: i.nameEn || '',
          category: i.category || 'GENERAL',
          baseUnit: i.baseUnit || 'PCS',
          purchasePrice: i.purchasePrice ?? i.cost ?? 0,
          sellingPrice: i.sellingPrice ?? 0,
          vatRate: i.vatRate ?? 15,
          barcode: i.barcode || i.sku,
        }));
      break;
    }

    case 'ACCOUNTS': {
      const accounts = store.accounts.get(tenantId) || [];
      rawRows = accounts
        .filter((a: any) => {
          if (search && !a.code.toLowerCase().includes(search) && !a.nameAr.toLowerCase().includes(search)) return false;
          if (params.category && a.type !== params.category) return false;
          return true;
        })
        .map((a: any) => ({
          code: a.code,
          nameAr: a.nameAr,
          nameEn: a.nameEn || '',
          type: a.type,
          normalBalance: a.normalBalance || 'DEBIT',
          parentCode: a.parentCode || a.parentId || '',
        }));
      break;
    }

    case 'OPENING_BALANCES': {
      const opening = store.openingBalances.get(tenantId) || [];
      rawRows = opening.map((o: any) => ({
        accountCode: o.accountCode,
        debitSar: o.debitSar || 0,
        creditSar: o.creditSar || 0,
        descriptionAr: o.descriptionAr || 'رصيد افتتاحي',
      }));
      break;
    }

    case 'SALES_INVOICES': {
      const invoices = store.salesInvoices.get(tenantId) || [];
      const customers = store.customers.get(tenantId) || [];
      const rows: Record<string, any>[] = [];

      invoices
        .filter((inv: any) => {
          if (search && !inv.invoiceNumber.toLowerCase().includes(search)) return false;
          if (fromDate && inv.issueDate < fromDate) return false;
          if (toDate && inv.issueDate > toDate) return false;
          return true;
        })
        .forEach((inv: any) => {
          const cust = customers.find((c: any) => c.id === inv.customerId);
          const custId = cust?.vatNumber || cust?.mobile || cust?.code || inv.customerVatNumber || '300012345600003';
          (inv.lines || []).forEach((line: any) => {
            rows.push({
              invoiceNumber: inv.invoiceNumber,
              issueDate: inv.issueDate,
              customerVatOrMobile: custId,
              itemSku: line.itemSku,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              discountAmount: line.discountAmount || 0,
              vatRate: line.vatRate ?? 15,
            });
          });
        });
      rawRows = rows;
      break;
    }

    case 'PURCHASE_BILLS': {
      const bills = store.purchaseBills.get(tenantId) || [];
      const suppliers = store.suppliers.get(tenantId) || [];
      const rows: Record<string, any>[] = [];

      bills
        .filter((b: any) => {
          if (search && !b.billNumber.toLowerCase().includes(search)) return false;
          const bDate = b.billDate || b.issueDate || '';
          if (fromDate && bDate < fromDate) return false;
          if (toDate && bDate > toDate) return false;
          return true;
        })
        .forEach((b: any) => {
          const supp = suppliers.find((s: any) => s.id === b.supplierId);
          const suppId = supp?.vatNumber || supp?.mobile || supp?.code || b.supplierVatNumber || '300045612300003';
          (b.lines || []).forEach((line: any) => {
            rows.push({
              billNumber: b.billNumber,
              billDate: b.billDate || b.issueDate || '',
              supplierVatOrMobile: suppId,
              itemSku: line.itemSku,
              quantity: line.quantity,
              unitCost: line.unitCost,
              vatRate: line.vatRate ?? 15,
            });
          });
        });
      rawRows = rows;
      break;
    }

    case 'PAYMENTS': {
      const receipts = store.customerReceipts.get(tenantId) || [];
      const payments = store.supplierPayments.get(tenantId) || [];
      const rows: Record<string, any>[] = [];

      receipts.forEach((r: any) => {
        rows.push({
          voucherNumber: r.receiptNumber,
          paymentType: 'RECEIPT',
          partyVatOrMobile: r.customerId || '300012345600003',
          amountSar: r.amountSar || (Number(r.amountHalalas || 0) / 100),
          paymentMethod: r.paymentMethod || 'BANK',
          paymentDate: r.receiptDate,
        });
      });

      payments.forEach((p: any) => {
        rows.push({
          voucherNumber: p.paymentNumber,
          paymentType: 'PAYMENT',
          partyVatOrMobile: p.supplierId || '300045612300003',
          amountSar: p.amountSar || (Number(p.amountHalalas || 0) / 100),
          paymentMethod: p.paymentMethod || 'BANK',
          paymentDate: p.paymentDate,
        });
      });

      rawRows = rows.filter((r) => {
        if (search && !r.voucherNumber.toLowerCase().includes(search)) return false;
        if (fromDate && r.paymentDate < fromDate) return false;
        if (toDate && r.paymentDate > toDate) return false;
        return true;
      });
      break;
    }

    case 'JOURNAL_ENTRIES': {
      const journals = store.journals.get(tenantId) || [];
      const rows: Record<string, any>[] = [];

      journals
        .filter((j: any) => {
          if (search && !j.entryNumber.toLowerCase().includes(search)) return false;
          if (fromDate && j.entryDate < fromDate) return false;
          if (toDate && j.entryDate > toDate) return false;
          return true;
        })
        .forEach((j: any) => {
          const lines = store.journalLines.get(j.id) || [];
          lines.forEach((l: any) => {
            rows.push({
              entryNumber: j.entryNumber,
              entryDate: j.entryDate,
              accountCode: l.accountCode,
              debitSar: l.debitSar || (Number(l.debitHalalas || 0) / 100),
              creditSar: l.creditSar || (Number(l.creditHalalas || 0) / 100),
              lineDescription: l.descriptionAr || j.narrationAr || '',
            });
          });
        });
      rawRows = rows;
      break;
    }

    case 'STOCK_OPENING': {
      const movements = store.stockMovements.get(tenantId) || [];
      rawRows = movements
        .filter((m: any) => m.movementType === 'OPENING_STOCK' || m.movementType === 'OPENING')
        .map((m: any) => ({
          documentNumber: m.documentNumber || 'OPN-WH-001',
          warehouseCode: m.warehouseCode || m.warehouseId || '',
          itemSku: m.itemSku || '',
          quantity: m.quantity || 0,
          unitCost: m.unitCost || 0,
        }));
      break;
    }
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const baseFilename = `${resource.toLowerCase()}_export_${dateStr}`;

  if (format === 'JSON') {
    return {
      format: 'JSON',
      mimeType: 'application/json; charset=utf-8',
      filename: `${baseFilename}.json`,
      content: JSON.stringify(rawRows, null, 2),
      rowCount: rawRows.length,
    };
  }

  // Format CSV matching the exact template fields for seamless 100% round-trip!
  const headerKeys = config?.fields.map((f) => f.field) || Object.keys(rawRows[0] || {});
  const csvContent = buildCsvString(headerKeys, rawRows);

  return {
    format: 'CSV',
    mimeType: 'text/csv; charset=utf-8',
    filename: `${baseFilename}.csv`,
    content: csvContent,
    rowCount: rawRows.length,
  };
}

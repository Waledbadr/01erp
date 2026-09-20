/**
 * Global Search Engine — Saudi ERP Platform
 * Unified Server-Side Search across Customers, Suppliers, Inventory Items, Sales Invoices,
 * Purchase Bills, and Journal Entries with Strict RBAC Permission Filtering and Rule C Cost Masking.
 */

import { TenantContext, centralStore } from '../../core/tenantGuard.js';
import { SearchResultItem, GlobalSearchResponse, SearchCategory } from './types.js';

/**
 * Check if the user context has permission to access a specific module resource.
 */
function hasResourcePermission(context: TenantContext, permission: string): boolean {
  if (context.role === 'OWNER' || context.role === 'SUPER_ADMIN' || context.isPlatformSuperAdmin) {
    return true;
  }
  return context.permissions.includes('*') || context.permissions.includes(permission);
}

/**
 * Check if user has permission to view sensitive financial cost / margin data.
 */
function canViewSensitiveCost(context: TenantContext): boolean {
  if (context.role === 'OWNER' || context.role === 'SUPER_ADMIN' || context.isPlatformSuperAdmin) {
    return true;
  }
  return (
    context.permissions.includes('*') ||
    context.permissions.includes('accounting:cost:view') ||
    context.permissions.includes('reports:financial:view')
  );
}

/**
 * Execute unified server-side global search.
 */
export function globalSearchService(
  tenantId: string,
  rawQuery: string,
  context: TenantContext,
  options?: { category?: SearchCategory; limit?: number }
): GlobalSearchResponse {
  const startTime = Date.now();
  const query = (rawQuery || '').trim().toLowerCase();
  const limit = options?.limit && options.limit > 0 ? options.limit : 50;
  const targetCategory = options?.category || 'ALL';

  if (!query || query.length < 1) {
    return {
      query: rawQuery,
      totalResults: 0,
      categories: [],
      results: [],
      executionTimeMs: 0,
    };
  }

  const results: SearchResultItem[] = [];
  const canSeeCost = canViewSensitiveCost(context);

  // 1. CUSTOMERS SEARCH
  if (hasResourcePermission(context, 'sales:customer:view') && (targetCategory === 'ALL' || targetCategory === 'CUSTOMERS')) {
    const customersList = centralStore.customers.get(tenantId) || [];
    for (const cust of customersList) {
      if (cust.status === 'ARCHIVED') continue;

      const matchNameAr = (cust.nameAr || '').toLowerCase().includes(query);
      const matchNameEn = (cust.nameEn || '').toLowerCase().includes(query);
      const matchVat = (cust.vatNumber || '').toLowerCase().includes(query);
      const matchCr = (cust.crNumber || '').toLowerCase().includes(query);
      const matchPhone = (cust.mobile || '').toLowerCase().includes(query);
      const matchEmail = (cust.email || '').toLowerCase().includes(query);
      const matchCode = (cust.code || cust.id || '').toLowerCase().includes(query);

      if (matchNameAr || matchNameEn || matchVat || matchCr || matchPhone || matchEmail || matchCode) {
        let matchedField = 'Name';
        if (matchVat) matchedField = 'VAT / الرقم الضريبي';
        else if (matchCr) matchedField = 'CR / السجل التجاري';
        else if (matchPhone) matchedField = 'Phone / الهاتف';
        else if (matchCode) matchedField = 'Code / الكود';

        results.push({
          id: cust.id,
          category: 'CUSTOMER',
          titleAr: cust.nameAr,
          titleEn: cust.nameEn || cust.nameAr,
          subtitleAr: `عميل | ضريبة: ${cust.vatNumber || 'غير مسجل'} | هاتف: ${cust.mobile || '-'}`,
          subtitleEn: `Customer | VAT: ${cust.vatNumber || 'N/A'} | Phone: ${cust.mobile || '-'}`,
          codeOrNumber: cust.code || cust.id,
          statusBadge: {
            labelAr: cust.status === 'ACTIVE' ? 'نشط' : 'معلق',
            labelEn: cust.status === 'ACTIVE' ? 'Active' : 'Suspended',
            variant: cust.status === 'ACTIVE' ? 'success' : 'warning',
          },
          deepLink: `/parties?id=${cust.id}&type=customer`,
          matchedField,
        });
      }
    }
  }

  // 2. SUPPLIERS SEARCH
  if (hasResourcePermission(context, 'purchasing:supplier:view') && (targetCategory === 'ALL' || targetCategory === 'SUPPLIERS')) {
    const suppliersList = centralStore.suppliers.get(tenantId) || [];
    for (const supp of suppliersList) {
      if (supp.status === 'ARCHIVED') continue;

      const matchNameAr = (supp.nameAr || '').toLowerCase().includes(query);
      const matchNameEn = (supp.nameEn || '').toLowerCase().includes(query);
      const matchVat = (supp.vatNumber || '').toLowerCase().includes(query);
      const matchCr = (supp.crNumber || '').toLowerCase().includes(query);
      const matchPhone = (supp.mobile || '').toLowerCase().includes(query);
      const matchEmail = (supp.email || '').toLowerCase().includes(query);
      const matchCode = (supp.code || supp.id || '').toLowerCase().includes(query);

      if (matchNameAr || matchNameEn || matchVat || matchCr || matchPhone || matchEmail || matchCode) {
        let matchedField = 'Name';
        if (matchVat) matchedField = 'VAT / الرقم الضريبي';
        else if (matchCr) matchedField = 'CR / السجل التجاري';
        else if (matchPhone) matchedField = 'Phone / الهاتف';
        else if (matchCode) matchedField = 'Code / الكود';

        results.push({
          id: supp.id,
          category: 'SUPPLIER',
          titleAr: supp.nameAr,
          titleEn: supp.nameEn || supp.nameAr,
          subtitleAr: `مورد | ضريبة: ${supp.vatNumber || 'غير مسجل'} | هاتف: ${supp.mobile || '-'}`,
          subtitleEn: `Supplier | VAT: ${supp.vatNumber || 'N/A'} | Phone: ${supp.mobile || '-'}`,
          codeOrNumber: supp.code || supp.id,
          statusBadge: {
            labelAr: supp.status === 'ACTIVE' ? 'نشط' : 'معلق',
            labelEn: supp.status === 'ACTIVE' ? 'Active' : 'Suspended',
            variant: supp.status === 'ACTIVE' ? 'success' : 'warning',
          },
          deepLink: `/parties?id=${supp.id}&type=supplier`,
          matchedField,
        });
      }
    }
  }

  // 3. INVENTORY ITEMS SEARCH (Requires 'inventory:item:view')
  if (hasResourcePermission(context, 'inventory:item:view') && (targetCategory === 'ALL' || targetCategory === 'ITEMS')) {
    const itemsList = centralStore.items.get(tenantId) || [];
    for (const item of itemsList) {
      if (!item.isActive) continue;

      const matchNameAr = (item.nameAr || '').toLowerCase().includes(query);
      const matchNameEn = (item.nameEn || '').toLowerCase().includes(query);
      const matchSku = (item.sku || '').toLowerCase().includes(query);
      const matchCategory = (item.categoryNameAr || '').toLowerCase().includes(query);
      const matchBarcode = (item.units || []).some((u) => (u.barcode || '').toLowerCase().includes(query));

      if (matchNameAr || matchNameEn || matchSku || matchCategory || matchBarcode) {
        let matchedField = 'Name';
        if (matchSku) matchedField = 'SKU / رمز الصنف';
        else if (matchBarcode) matchedField = 'Barcode / الباركود';
        else if (matchCategory) matchedField = 'Category / التصنيف';

        const retailPriceStr = `${(item.sellingPrice || 0).toFixed(2)} SAR`;

        let costInfoAr = '';
        let costInfoEn = '';
        if (canSeeCost && item.cost !== undefined) {
          costInfoAr = ` | تكلفة: ${item.cost.toFixed(2)} ر.س`;
          costInfoEn = ` | Cost: ${item.cost.toFixed(2)} SAR`;
        }

        results.push({
          id: item.id,
          category: 'ITEM',
          titleAr: item.nameAr,
          titleEn: item.nameEn || item.nameAr,
          subtitleAr: `صنف مخزني | رمز: ${item.sku} | تصنيف: ${item.categoryNameAr || '-'}${costInfoAr}`,
          subtitleEn: `Item | SKU: ${item.sku} | Cat: ${item.categoryNameAr || '-'}${costInfoEn}`,
          codeOrNumber: item.sku,
          amountFormatted: retailPriceStr,
          statusBadge: {
            labelAr: item.isActive ? 'متاح' : 'متوقف',
            labelEn: item.isActive ? 'Active' : 'Inactive',
            variant: item.isActive ? 'success' : 'default',
          },
          deepLink: `/inventory?id=${item.id}`,
          matchedField,
          metadata: {
            sku: item.sku,
            category: item.categoryNameAr,
            ...(canSeeCost ? { costPriceSar: item.cost, wac: item.currentWac } : {}),
          },
        });
      }
    }
  }

  // 4. SALES INVOICES SEARCH (Requires 'sales:invoice:view')
  if (hasResourcePermission(context, 'sales:invoice:view') && (targetCategory === 'ALL' || targetCategory === 'INVOICES')) {
    const invoicesList = centralStore.salesInvoices.get(tenantId) || [];
    for (const inv of invoicesList) {
      const matchNum = (inv.invoiceNumber || '').toLowerCase().includes(query);
      const matchCustomer = (inv.customerNameAr || '').toLowerCase().includes(query);
      const matchVat = (inv.customerVatNumber || '').toLowerCase().includes(query);
      const matchStatus = (inv.status || '').toLowerCase().includes(query);

      if (matchNum || matchCustomer || matchVat || matchStatus) {
        let matchedField = 'Invoice Number';
        if (matchCustomer) matchedField = 'Customer / العميل';
        else if (matchVat) matchedField = 'VAT Number / الرقم الضريبي';

        const amountSar = inv.totalAmountSar.toFixed(2);

        results.push({
          id: inv.id,
          category: 'INVOICE',
          titleAr: `فاتورة مبيعات ${inv.invoiceNumber}`,
          titleEn: `Sales Invoice ${inv.invoiceNumber}`,
          subtitleAr: `عميل: ${inv.customerNameAr || '-'} | تاريخ: ${inv.issueDate} | نوع: ${inv.invoiceType === 'STANDARD_B2B' ? 'ضريبية B2B' : 'مبسطة B2C'}`,
          subtitleEn: `Customer: ${inv.customerNameEn || inv.customerNameAr || '-'} | Date: ${inv.issueDate} | Type: ${inv.invoiceType}`,
          codeOrNumber: inv.invoiceNumber,
          amountFormatted: `${amountSar} SAR`,
          statusBadge: {
            labelAr: inv.status === 'POSTED' ? 'مرحلة' : inv.status === 'PAID' ? 'مسددة' : 'مسودة',
            labelEn: inv.status,
            variant: inv.status === 'POSTED' || inv.status === 'PAID' ? 'success' : 'warning',
          },
          deepLink: `/sales?id=${inv.id}`,
          matchedField,
        });
      }
    }
  }

  // 5. PURCHASE BILLS SEARCH (Requires 'purchasing:bill:view')
  if (hasResourcePermission(context, 'purchasing:bill:view') && (targetCategory === 'ALL' || targetCategory === 'BILLS')) {
    const billsList = centralStore.purchaseBills.get(tenantId) || [];
    for (const bill of billsList) {
      const matchNum = (bill.billNumber || '').toLowerCase().includes(query);
      const matchSupplier = (bill.supplierNameAr || '').toLowerCase().includes(query);
      const matchVendorInvoice = (bill.supplierInvoiceNumber || '').toLowerCase().includes(query);

      if (matchNum || matchSupplier || matchVendorInvoice) {
        let matchedField = 'Bill Number';
        if (matchSupplier) matchedField = 'Supplier / المورد';
        else if (matchVendorInvoice) matchedField = 'Vendor Ref / رقم فاتورة المورد';

        const amountSar = bill.totalAmountSar.toFixed(2);

        results.push({
          id: bill.id,
          category: 'BILL',
          titleAr: `فاتورة مشتريات ${bill.billNumber}`,
          titleEn: `Purchase Bill ${bill.billNumber}`,
          subtitleAr: `مورد: ${bill.supplierNameAr || '-'} | تاريخ: ${bill.issueDate} | رقم المورد: ${bill.supplierInvoiceNumber || '-'}`,
          subtitleEn: `Supplier: ${bill.supplierNameEn || bill.supplierNameAr || '-'} | Date: ${bill.issueDate} | Vendor Ref: ${bill.supplierInvoiceNumber || '-'}`,
          codeOrNumber: bill.billNumber,
          amountFormatted: `${amountSar} SAR`,
          statusBadge: {
            labelAr: bill.status === 'POSTED' ? 'مرحلة' : bill.status === 'PAID' ? 'مدفوعة' : 'مسودة',
            labelEn: bill.status,
            variant: bill.status === 'POSTED' || bill.status === 'PAID' ? 'success' : 'default',
          },
          deepLink: `/purchasing?id=${bill.id}`,
          matchedField,
        });
      }
    }
  }

  // 6. JOURNAL ENTRIES SEARCH (Requires 'accounting:journal:view')
  if (hasResourcePermission(context, 'accounting:journal:view') && (targetCategory === 'ALL' || targetCategory === 'JOURNALS')) {
    const journalsList = centralStore.journals.get(tenantId) || [];
    for (const jnl of journalsList) {
      const matchNum = (jnl.entryNumber || '').toLowerCase().includes(query);
      const matchDescAr = (jnl.descriptionAr || '').toLowerCase().includes(query);
      const matchDescEn = (jnl.descriptionEn || '').toLowerCase().includes(query);
      const matchRef = (jnl.reference || '').toLowerCase().includes(query);

      if (matchNum || matchDescAr || matchDescEn || matchRef) {
        let matchedField = 'Entry Number';
        if (matchDescAr || matchDescEn) matchedField = 'Description / البيان';
        else if (matchRef) matchedField = 'Reference / المرجع';

        const debitSar = (Number(jnl.totalDebitCents) / 100).toFixed(2);

        results.push({
          id: jnl.id,
          category: 'JOURNAL',
          titleAr: `قيد محاسبي ${jnl.entryNumber}`,
          titleEn: `Journal Entry ${jnl.entryNumber}`,
          subtitleAr: `${jnl.descriptionAr || 'بدون بيان'} | تاريخ: ${jnl.entryDate} | مرجع: ${jnl.reference || '-'}`,
          subtitleEn: `${jnl.descriptionEn || 'No description'} | Date: ${jnl.entryDate} | Ref: ${jnl.reference || '-'}`,
          codeOrNumber: jnl.entryNumber,
          amountFormatted: `${debitSar} SAR`,
          statusBadge: {
            labelAr: jnl.status === 'POSTED' ? 'مرحل' : 'مسودة',
            labelEn: jnl.status,
            variant: jnl.status === 'POSTED' ? 'success' : 'warning',
          },
          deepLink: `/accounting?id=${jnl.id}`,
          matchedField,
        });
      }
    }
  }

  // Count by categories
  const categoryCounts = new Map<string, number>();
  for (const item of results) {
    categoryCounts.set(item.category, (categoryCounts.get(item.category) || 0) + 1);
  }

  const categories = Array.from(categoryCounts.entries()).map(([cat, count]) => ({
    category: cat,
    count,
  }));

  const executionTimeMs = Date.now() - startTime;
  const slicedResults = results.slice(0, limit);

  return {
    query: rawQuery,
    totalResults: results.length,
    categories,
    results: slicedResults,
    executionTimeMs,
  };
}

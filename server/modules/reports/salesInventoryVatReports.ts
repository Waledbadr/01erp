/**
 * Authoritative Sales, Inventory, and VAT Reports Service — Saudi ERP Backend
 * Adheres strictly to:
 * - Rule G1: General Ledger single source of truth
 * - Rule G3: Authoritative Stock Movements Ledger
 * - Rule C: Sensitive financial cost scrubber
 * - ZATCA & VAT statutory rules
 */

import { centralStore } from '../../core/tenantGuard.js';
import { fromHalalasToDisplay, toHalalas } from '../../../src/lib/accounting.js';
import { ReportParameterSchema, ReportResult } from '../../../src/lib/reports.js';

function safeBigInt(val: any): bigint {
  if (val === undefined || val === null) return 0n;
  if (typeof val === 'bigint') return val;
  try {
    return BigInt(val);
  } catch {
    return 0n;
  }
}

// ==========================================
// 1. SALES REPORTS
// ==========================================

export function executeSalesPeriodicSummary(tenantId: string, params: ReportParameterSchema): ReportResult {
  const start = Date.now();
  const invoices = (centralStore.salesInvoices?.get(tenantId) || []).filter((i) => i.status === 'POSTED');

  let totalGross = 0n;
  let totalDiscount = 0n;
  let totalTaxable = 0n;
  let totalVat = 0n;
  let totalNetWithVat = 0n;

  const grouped: Record<string, { period: string; count: number; subtotal: bigint; vat: bigint; total: bigint }> = {};

  invoices.forEach((inv) => {
    if (params.startDate && inv.issueDate < params.startDate) return;
    if (params.endDate && inv.issueDate > params.endDate) return;

    let periodKey = inv.issueDate;
    if (params.periodType === 'MONTHLY') {
      periodKey = inv.issueDate.slice(0, 7); // YYYY-MM
    } else if (params.periodType === 'ANNUAL') {
      periodKey = inv.issueDate.slice(0, 4); // YYYY
    }

    if (!grouped[periodKey]) {
      grouped[periodKey] = { period: periodKey, count: 0, subtotal: 0n, vat: 0n, total: 0n };
    }

    const invAny = inv as any;
    const sub = safeBigInt(invAny.subtotalCents || invAny.totalCents);
    const vat = safeBigInt(invAny.vatAmountCents || invAny.totalVatCents || 0n);
    const tot = safeBigInt(invAny.totalWithVatCents || (sub + vat));

    grouped[periodKey].count += 1;
    grouped[periodKey].subtotal += sub;
    grouped[periodKey].vat += vat;
    grouped[periodKey].total += tot;

    totalTaxable += sub;
    totalVat += vat;
    totalNetWithVat += tot;
  });

  const rows = Object.values(grouped)
    .sort((a, b) => b.period.localeCompare(a.period))
    .map((g) => {
      const avg = g.count > 0 ? g.total / BigInt(g.count) : 0n;
      return {
        id: g.period,
        period: g.period,
        invoiceCount: g.count,
        subtotal: fromHalalasToDisplay(g.subtotal),
        vatAmount: fromHalalasToDisplay(g.vat),
        totalWithVat: fromHalalasToDisplay(g.total),
        totalAmount: fromHalalasToDisplay(g.total),
        averageTicket: fromHalalasToDisplay(avg),
      };
    });

  return {
    reportType: 'SALES_PERIODIC_SUMMARY',
    category: 'SALES',
    titleAr: 'ملخص المبيعات الدوري (يومي / شهري / سنوي)',
    titleEn: 'Periodic Sales Summary',
    generatedAt: new Date().toISOString(),
    parameters: params,
    summaryCards: [
      {
        id: 'sales-tot-net',
        labelAr: 'إجمالي المبيعات الخاضعة',
        labelEn: 'Total Net Taxable Sales',
        value: `${fromHalalasToDisplay(totalTaxable)} ر.س`,
        variant: 'default',
      },
      {
        id: 'sales-tot-vat',
        labelAr: 'ضريبة القيمة المضافة المحصلة (15%)',
        labelEn: 'Total Output VAT Collected',
        value: `${fromHalalasToDisplay(totalVat)} ر.س`,
        variant: 'default',
      },
      {
        id: 'sales-grand-total',
        labelAr: 'إجمالي المبيعات مع الضريبة',
        labelEn: 'Grand Total with VAT',
        value: `${fromHalalasToDisplay(totalNetWithVat)} ر.س`,
        variant: 'success',
      },
    ],
    columns: [
      { field: 'period', labelAr: 'الفترة', labelEn: 'Period', align: 'start', type: 'text' },
      { field: 'invoiceCount', labelAr: 'عدد الفواتير', labelEn: 'Invoices Count', align: 'center', type: 'badge' },
      { field: 'subtotal', labelAr: 'المبلغ الخاضع (SAR)', labelEn: 'Taxable (SAR)', align: 'end', type: 'currency' },
      { field: 'vatAmount', labelAr: 'ضريبة 15% (SAR)', labelEn: 'VAT 15% (SAR)', align: 'end', type: 'currency' },
      { field: 'totalWithVat', labelAr: 'الإجمالي بالضريبة (SAR)', labelEn: 'Total with VAT (SAR)', align: 'end', type: 'currency' },
      { field: 'averageTicket', labelAr: 'متوسط الفاتورة', labelEn: 'Avg Ticket (SAR)', align: 'end', type: 'currency' },
    ],
    rows,
    totals: {
      subtotal: fromHalalasToDisplay(totalTaxable),
      vatAmount: fromHalalasToDisplay(totalVat),
      totalWithVat: fromHalalasToDisplay(totalNetWithVat),
    },
    pagination: {
      page: 1,
      pageSize: rows.length || 1,
      totalRows: rows.length,
      totalPages: 1,
    },
    executionTimeMs: Date.now() - start,
  };
}

export function executeSalesByDimension(
  tenantId: string,
  params: ReportParameterSchema,
  dimension: 'CUSTOMER' | 'ITEM' | 'REP' | 'BRANCH' | 'PAYMENT'
): ReportResult {
  const start = Date.now();
  const invoices = (centralStore.salesInvoices?.get(tenantId) || []).filter((i) => i.status === 'POSTED');
  const customers = centralStore.customers.get(tenantId) || [];
  const items = centralStore.items.get(tenantId) || [];

  const grouped: Record<string, { code: string; nameAr: string; nameEn: string; count: number; subtotal: bigint; vat: bigint; total: bigint; qty?: number }> = {};

  invoices.forEach((inv) => {
    if (params.startDate && inv.issueDate < params.startDate) return;
    if (params.endDate && inv.issueDate > params.endDate) return;

    const invAny = inv as any;

    if (dimension === 'CUSTOMER') {
      const cust = customers.find((c) => c.id === inv.customerId);
      const key = inv.customerId || 'CASH_CUSTOMER';
      if (!grouped[key]) {
        grouped[key] = {
          code: cust?.code || 'CASH',
          nameAr: cust?.nameAr || 'عميل نقدي عابر',
          nameEn: cust?.nameEn || 'Cash Customer',
          count: 0,
          subtotal: 0n,
          vat: 0n,
          total: 0n,
        };
      }
      grouped[key].count += 1;
      grouped[key].subtotal += safeBigInt(invAny.subtotalCents || invAny.totalCents);
      grouped[key].vat += safeBigInt(invAny.vatAmountCents || invAny.totalVatCents || 0n);
      grouped[key].total += safeBigInt(invAny.totalWithVatCents || invAny.totalCents);
    } else if (dimension === 'BRANCH') {
      const key = inv.branchId || 'MAIN_BRANCH';
      if (!grouped[key]) {
        grouped[key] = {
          code: key,
          nameAr: inv.branchNameAr || 'الفرع الرئيسي - الرياض',
          nameEn: invAny.branchNameEn || 'Main Branch - Riyadh',
          count: 0,
          subtotal: 0n,
          vat: 0n,
          total: 0n,
        };
      }
      grouped[key].count += 1;
      grouped[key].subtotal += safeBigInt(invAny.subtotalCents || invAny.totalCents);
      grouped[key].vat += safeBigInt(invAny.vatAmountCents || invAny.totalVatCents || 0n);
      grouped[key].total += safeBigInt(invAny.totalWithVatCents || invAny.totalCents);
    } else if (dimension === 'PAYMENT') {
      const key = inv.paymentMethod || 'CASH';
      if (!grouped[key]) {
        const arName = key === 'CASH' ? 'نقداً (الصندوق)' : key === 'MADA' ? 'بطاقة مدى' : key === 'BANK_TRANSFER' ? 'تحويل بنكي' : 'آجل (ذمم مدينة)';
        grouped[key] = {
          code: key,
          nameAr: arName,
          nameEn: key,
          count: 0,
          subtotal: 0n,
          vat: 0n,
          total: 0n,
        };
      }
      grouped[key].count += 1;
      grouped[key].subtotal += safeBigInt(invAny.subtotalCents || invAny.totalCents);
      grouped[key].vat += safeBigInt(invAny.vatAmountCents || invAny.totalVatCents || 0n);
      grouped[key].total += safeBigInt(invAny.totalWithVatCents || invAny.totalCents);
    } else if (dimension === 'ITEM') {
      const invAny = inv as any;
      (invAny.lines || invAny.items || []).forEach((line: any) => {
        const item = items.find((it) => it.id === line.itemId || it.sku === line.itemSku);
        const key = line.itemId || line.itemSku || 'UNKNOWN_ITEM';
        if (!grouped[key]) {
          grouped[key] = {
            code: item?.sku || line.itemSku || key,
            nameAr: item?.nameAr || line.itemNameAr || 'صنف',
            nameEn: item?.nameEn || line.itemNameEn || 'Item',
            count: 0,
            subtotal: 0n,
            vat: 0n,
            total: 0n,
            qty: 0,
          };
        }
        const lineSub = safeBigInt(line.lineTotalCents || line.subtotalCents || 0n);
        const lineVat = safeBigInt(line.vatAmountCents || 0n);
        grouped[key].count += 1;
        grouped[key].qty! += Number(line.quantity || 1);
        grouped[key].subtotal += lineSub;
        grouped[key].vat += lineVat;
        grouped[key].total += (lineSub + lineVat);
      });
    }
  });

  const rows = Object.values(grouped)
    .sort((a, b) => (b.total > a.total ? 1 : -1))
    .map((g) => ({
      id: g.code,
      code: g.code,
      nameAr: g.nameAr,
      nameEn: g.nameEn,
      count: g.count,
      quantity: g.qty !== undefined ? g.qty : undefined,
      subtotal: fromHalalasToDisplay(g.subtotal),
      vatAmount: fromHalalasToDisplay(g.vat),
      totalWithVat: fromHalalasToDisplay(g.total),
    }));

  const grandSubtotal = Object.values(grouped).reduce((acc, g) => acc + g.subtotal, 0n);
  const grandVat = Object.values(grouped).reduce((acc, g) => acc + g.vat, 0n);
  const grandTotal = Object.values(grouped).reduce((acc, g) => acc + g.total, 0n);

  let reportType: any = 'SALES_BY_CUSTOMER';
  let titleAr = 'المبيعات حسب العميل';
  let titleEn = 'Sales by Customer';

  if (dimension === 'ITEM') {
    reportType = 'SALES_BY_ITEM';
    titleAr = 'المبيعات حسب الصنف والوحدة';
    titleEn = 'Sales by Item & Packaging Unit';
  } else if (dimension === 'BRANCH') {
    reportType = 'SALES_BY_BRANCH';
    titleAr = 'المبيعات حسب الفرع والمركز';
    titleEn = 'Sales by Branch & Location';
  } else if (dimension === 'PAYMENT') {
    reportType = 'SALES_BY_PAYMENT_METHOD';
    titleAr = 'المبيعات حسب طريقة الدفع (نقد / مدى / تحويل)';
    titleEn = 'Sales by Payment Method';
  }

  const columns = [
    { field: 'code', labelAr: 'الرمز', labelEn: 'Code', align: 'start' as const, type: 'text' as const },
    { field: 'nameAr', labelAr: 'الاسم / الوصف', labelEn: 'Name', align: 'start' as const, type: 'text' as const },
    ...(dimension === 'ITEM' ? [{ field: 'quantity', labelAr: 'الكمية المباعة', labelEn: 'Qty Sold', align: 'center' as const, type: 'badge' as const }] : []),
    { field: 'count', labelAr: 'عدد العمليات', labelEn: 'Count', align: 'center' as const, type: 'badge' as const },
    { field: 'subtotal', labelAr: 'الصافي الخاضع (SAR)', labelEn: 'Taxable (SAR)', align: 'end' as const, type: 'currency' as const },
    { field: 'vatAmount', labelAr: 'الضريبة 15% (SAR)', labelEn: 'VAT 15% (SAR)', align: 'end' as const, type: 'currency' as const },
    { field: 'totalWithVat', labelAr: 'الإجمالي شامل الضريبة (SAR)', labelEn: 'Total with VAT (SAR)', align: 'end' as const, type: 'currency' as const },
  ];

  return {
    reportType,
    category: 'SALES',
    titleAr,
    titleEn,
    generatedAt: new Date().toISOString(),
    parameters: params,
    summaryCards: [
      {
        id: 'dim-grand-total',
        labelAr: 'إجمالي المبيعات للفترة',
        labelEn: 'Total Sales Volume',
        value: `${fromHalalasToDisplay(grandTotal)} ر.س`,
        variant: 'success',
      },
    ],
    columns,
    rows,
    totals: {
      subtotal: fromHalalasToDisplay(grandSubtotal),
      vatAmount: fromHalalasToDisplay(grandVat),
      totalWithVat: fromHalalasToDisplay(grandTotal),
    },
    pagination: {
      page: 1,
      pageSize: rows.length || 1,
      totalRows: rows.length,
      totalPages: 1,
    },
    executionTimeMs: Date.now() - start,
  };
}

export function executeInvoiceProfitMargin(tenantId: string, params: ReportParameterSchema, canViewCost: boolean): ReportResult {
  const start = Date.now();
  const invoices = (centralStore.salesInvoices?.get(tenantId) || []).filter((i) => i.status === 'POSTED');
  const customers = centralStore.customers.get(tenantId) || [];

  let totalRev = 0n;
  let totalCogs = 0n;

  const rows = invoices.map((inv) => {
    if (params.startDate && inv.issueDate < params.startDate) return null;
    if (params.endDate && inv.issueDate > params.endDate) return null;

    const invAny = inv as any;
    const cust = customers.find((c) => c.id === inv.customerId);
    const rev = safeBigInt(invAny.subtotalCents || invAny.totalCents);
    const cogs = safeBigInt(invAny.totalCogsCents || 0n);
    const margin = rev - cogs;
    const marginPct = rev > 0n ? Number((margin * 10000n) / rev) / 100 : 0;

    totalRev += rev;
    totalCogs += cogs;

    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      date: inv.issueDate,
      customerName: cust?.nameAr || 'نقدي',
      revenue: fromHalalasToDisplay(rev),
      cogs: canViewCost ? fromHalalasToDisplay(cogs) : '[REDACTED]',
      grossMargin: canViewCost ? fromHalalasToDisplay(margin) : '[REDACTED]',
      marginPct: canViewCost ? `${marginPct.toFixed(2)}%` : '[REDACTED]',
      sourceDocument: {
        type: 'SALES_INVOICE',
        id: inv.id,
        number: inv.invoiceNumber,
        date: inv.issueDate,
      },
    };
  }).filter(Boolean) as any[];

  const grandMargin = totalRev - totalCogs;
  const overallMarginPct = totalRev > 0n ? Number((grandMargin * 10000n) / totalRev) / 100 : 0;

  return {
    reportType: 'INVOICE_PROFIT_MARGIN',
    category: 'SALES',
    titleAr: 'ربحية الفواتير والأصناف (هامش الربح)',
    titleEn: 'Invoice Profit Margin Analysis',
    generatedAt: new Date().toISOString(),
    parameters: params,
    summaryCards: [
      {
        id: 'pm-rev',
        labelAr: 'إجمالي الإيرادات الخاضعة',
        labelEn: 'Total Revenue',
        value: `${fromHalalasToDisplay(totalRev)} ر.س`,
        variant: 'default',
      },
      {
        id: 'pm-margin',
        labelAr: 'إجمالي هامش الربح',
        labelEn: 'Gross Margin',
        value: canViewCost ? `${fromHalalasToDisplay(grandMargin)} ر.س (${overallMarginPct.toFixed(2)}%)` : '[محجوب لعدم الصلاحية]',
        variant: canViewCost && grandMargin >= 0n ? 'success' : 'danger',
      },
    ],
    columns: [
      { field: 'invoiceNumber', labelAr: 'رقم الفاتورة', labelEn: 'Invoice #', align: 'start', type: 'link' },
      { field: 'date', labelAr: 'التاريخ', labelEn: 'Date', align: 'start', type: 'date' },
      { field: 'customerName', labelAr: 'العميل', labelEn: 'Customer', align: 'start', type: 'text' },
      { field: 'revenue', labelAr: 'الإيراد (SAR)', labelEn: 'Revenue (SAR)', align: 'end', type: 'currency' },
      { field: 'cogs', labelAr: 'التكلفة (SAR)', labelEn: 'COGS (SAR)', align: 'end', type: 'currency', isSensitiveCost: true },
      { field: 'grossMargin', labelAr: 'هامش الربح (SAR)', labelEn: 'Gross Margin (SAR)', align: 'end', type: 'currency', isSensitiveCost: true },
      { field: 'marginPct', labelAr: 'نسبة الربح %', labelEn: 'Margin %', align: 'end', type: 'text', isSensitiveCost: true },
    ],
    rows,
    totals: {
      revenue: fromHalalasToDisplay(totalRev),
      cogs: canViewCost ? fromHalalasToDisplay(totalCogs) : '[REDACTED]',
      grossMargin: canViewCost ? fromHalalasToDisplay(grandMargin) : '[REDACTED]',
      marginPct: canViewCost ? `${overallMarginPct.toFixed(2)}%` : '[REDACTED]',
    },
    pagination: {
      page: 1,
      pageSize: rows.length || 1,
      totalRows: rows.length,
      totalPages: 1,
    },
    executionTimeMs: Date.now() - start,
  };
}

// ==========================================
// 2. INVENTORY REPORTS
// ==========================================

export function executeStockValuation(tenantId: string, params: ReportParameterSchema, canViewCost: boolean): ReportResult {
  const start = Date.now();
  const items = centralStore.items.get(tenantId) || [];
  const movements = (centralStore.stockMovements?.get(tenantId) || []).filter((m: any) => m.status === 'POSTED' || m.movementType);

  const asOfDate = params.asOfDate || new Date().toISOString().slice(0, 10);

  let grandTotalQty = 0;
  let grandTotalValuationCents = 0n;

  const rows = items.map((item) => {
    const itemAny = item as any;
    // Point-in-time calculation from authoritative stock movements (G3)
    let qty = 0;
    const itemMovements = movements.filter((m: any) => (m.itemId === item.id || m.sku === item.sku) && (m.date || m.movementDate || '') <= asOfDate);
    
    if (itemMovements.length > 0) {
      itemMovements.forEach((m: any) => {
        if (params.warehouseId && m.warehouseId && m.warehouseId !== params.warehouseId) return;

        const delta = Number(m.quantityDelta || m.quantity || 0);
        const dir = m.direction || (m.quantityDelta > 0 ? 'IN' : 'OUT');
        if (dir === 'IN' || m.movementType === 'RECEIPT' || m.movementType === 'PURCHASE') {
          qty += Math.abs(delta);
        } else {
          qty -= Math.abs(delta);
        }
      });
    } else {
      qty = Number(itemAny.currentStock || 0);
    }

    // WAC cost
    const wacCostCents = safeBigInt(itemAny.avgCostCents || itemAny.costPriceCents || itemAny.averageCostCents || 0n);
    const valuationCents = BigInt(Math.max(0, qty)) * wacCostCents;

    grandTotalQty += qty;
    grandTotalValuationCents += valuationCents;

    return {
      id: item.id,
      sku: item.sku,
      barcode: itemAny.barcode || '-',
      nameAr: item.nameAr,
      nameEn: item.nameEn,
      category: itemAny.categoryName || itemAny.categoryNameAr || 'بضائع',
      unit: itemAny.baseUnit || 'حبة',
      onHandQty: qty,
      wacCostSar: canViewCost ? fromHalalasToDisplay(wacCostCents) : '[REDACTED]',
      totalValuationSar: canViewCost ? fromHalalasToDisplay(valuationCents) : '[REDACTED]',
    };
  }).filter((r) => params.includeZeroBalances || r.onHandQty !== 0);

  return {
    reportType: 'STOCK_VALUATION',
    category: 'INVENTORY',
    titleAr: `تقييم المخزون (Point-in-Time WAC) كما في ${asOfDate}`,
    titleEn: `Stock Valuation Report As Of ${asOfDate}`,
    generatedAt: new Date().toISOString(),
    parameters: params,
    summaryCards: [
      {
        id: 'val-count',
        labelAr: 'إجمالي الأصناف المقيّمة',
        labelEn: 'Total Items Count',
        value: `${rows.length} صنف`,
        variant: 'default',
      },
      {
        id: 'val-total-val',
        labelAr: 'إجمالي القيمة الدفترية للمخزون (SAR)',
        labelEn: 'Total Inventory Valuation (SAR)',
        value: canViewCost ? `${fromHalalasToDisplay(grandTotalValuationCents)} ر.س` : '[محجوب لعدم الصلاحية]',
        variant: 'success',
      },
    ],
    columns: [
      { field: 'sku', labelAr: 'الرمز (SKU)', labelEn: 'SKU', align: 'start', type: 'text' },
      { field: 'nameAr', labelAr: 'اسم الصنف', labelEn: 'Item Name', align: 'start', type: 'text' },
      { field: 'unit', labelAr: 'الوحدة', labelEn: 'Unit', align: 'center', type: 'badge' },
      { field: 'onHandQty', labelAr: 'الكمية المتوفرة', labelEn: 'On Hand Qty', align: 'center', type: 'badge' },
      { field: 'wacCostSar', labelAr: 'متوسط التكلفة (WAC)', labelEn: 'WAC Unit Cost', align: 'end', type: 'currency', isSensitiveCost: true },
      { field: 'totalValuationSar', labelAr: 'إجمالي القيمة (SAR)', labelEn: 'Total Valuation (SAR)', align: 'end', type: 'currency', isSensitiveCost: true },
    ],
    rows,
    totals: {
      onHandQty: String(grandTotalQty),
      totalValuationSar: canViewCost ? fromHalalasToDisplay(grandTotalValuationCents) : '[REDACTED]',
    },
    pagination: {
      page: 1,
      pageSize: rows.length || 1,
      totalRows: rows.length,
      totalPages: 1,
    },
    executionTimeMs: Date.now() - start,
  };
}

export function executeStockMovementsReport(tenantId: string, params: ReportParameterSchema): ReportResult {
  const start = Date.now();
  const items = centralStore.items.get(tenantId) || [];
  const movements = (centralStore.stockMovements?.get(tenantId) || []).filter((m: any) => m.status === 'POSTED' || m.movementType);

  const rows = movements
    .filter((m: any) => {
      const mDate = m.date || m.movementDate || '';
      if (params.startDate && mDate < params.startDate) return false;
      if (params.endDate && mDate > params.endDate) return false;
      if (params.itemId && m.itemId !== params.itemId) return false;
      return true;
    })
    .map((m: any) => {
      const it = items.find((i) => i.id === m.itemId || i.sku === m.sku);
      const mDate = m.date || m.movementDate || '';
      return {
        id: m.id,
        date: mDate,
        movementNumber: m.movementNumber || m.sourceDocumentNumber || m.id.slice(0, 8),
        sku: it?.sku || m.sku,
        itemName: it?.nameAr || m.itemNameAr || 'صنف',
        movementType: m.movementType || 'TRANSFER',
        direction: m.direction || (m.quantityDelta > 0 ? 'IN' : 'OUT'),
        quantity: Math.abs(Number(m.quantityDelta || m.quantity || 0)),
        warehouseName: m.warehouseNameAr || 'المستودع الرئيسي',
        referenceDoc: m.referenceNumber || m.sourceDocumentNumber || '-',
        sourceDocument: {
          type: 'STOCK_MOVEMENT' as const,
          id: m.id,
          number: m.movementNumber || m.referenceNumber || m.sourceDocumentNumber || m.id.slice(0, 8),
          date: mDate,
        },
      };
    });

  return {
    reportType: 'STOCK_MOVEMENTS_REPORT',
    category: 'INVENTORY',
    titleAr: 'سجل حركات المخزون التفصيلي (Movements Ledger)',
    titleEn: 'Stock Movements Ledger Report',
    generatedAt: new Date().toISOString(),
    parameters: params,
    summaryCards: [
      {
        id: 'sm-count',
        labelAr: 'إجمالي الحركات المسجلة',
        labelEn: 'Total Movements Count',
        value: `${rows.length} حركة`,
        variant: 'default',
      },
    ],
    columns: [
      { field: 'date', labelAr: 'التاريخ', labelEn: 'Date', align: 'start', type: 'date' },
      { field: 'movementNumber', labelAr: 'رقم الحركة', labelEn: 'Movement #', align: 'start', type: 'link' },
      { field: 'sku', labelAr: 'الرمز', labelEn: 'SKU', align: 'start', type: 'text' },
      { field: 'itemName', labelAr: 'اسم الصنف', labelEn: 'Item Name', align: 'start', type: 'text' },
      { field: 'movementType', labelAr: 'نوع الحركة', labelEn: 'Type', align: 'center', type: 'badge' },
      { field: 'quantity', labelAr: 'الكمية', labelEn: 'Quantity', align: 'center', type: 'badge' },
      { field: 'warehouseName', labelAr: 'المستودع', labelEn: 'Warehouse', align: 'start', type: 'text' },
      { field: 'referenceDoc', labelAr: 'المستند المرجعي', labelEn: 'Ref Doc', align: 'start', type: 'text' },
    ],
    rows,
    pagination: {
      page: 1,
      pageSize: rows.length || 1,
      totalRows: rows.length,
      totalPages: 1,
    },
    executionTimeMs: Date.now() - start,
  };
}

export function executeDeadSlowMoving(tenantId: string, params: ReportParameterSchema): ReportResult {
  const start = Date.now();
  const items = centralStore.items.get(tenantId) || [];
  const movements = (centralStore.stockMovements?.get(tenantId) || []).filter((m: any) => m.status === 'POSTED' || m.movementType);
  const now = new Date().getTime();
  const minDays = params.minDays || 60;

  const rows = items.map((it) => {
    const itAny = it as any;
    const itemMovements = movements.filter((m: any) => m.itemId === it.id || m.sku === it.sku);
    let lastMovementDate = 'لا توجد حركات سابقة';
    let daysSinceLast = 999;

    if (itemMovements.length > 0) {
      const sorted = [...itemMovements].sort((a: any, b: any) => new Date(b.date || b.movementDate || 0).getTime() - new Date(a.date || a.movementDate || 0).getTime());
      lastMovementDate = (sorted[0] as any).date || (sorted[0] as any).movementDate || '';
      daysSinceLast = Math.floor((now - new Date(lastMovementDate).getTime()) / (1000 * 60 * 60 * 24));
    }

    const qty = it.currentStock || 0;
    const tiedUpCapital = BigInt(qty) * safeBigInt(itAny.costPriceCents || itAny.avgCostCents || 0n);

    return {
      id: it.id,
      sku: it.sku,
      nameAr: it.nameAr,
      currentStock: qty,
      lastMovementDate,
      daysSinceLast,
      tiedUpCapitalSar: fromHalalasToDisplay(tiedUpCapital),
    };
  }).filter((r) => r.daysSinceLast >= minDays && r.currentStock > 0);

  return {
    reportType: 'DEAD_SLOW_MOVING',
    category: 'INVENTORY',
    titleAr: `المخزون الراكد وبطيء الحركة (أكثر من ${minDays} يوماً بدون حركة)`,
    titleEn: `Dead & Slow-Moving Stock Analysis (> ${minDays} Days)`,
    generatedAt: new Date().toISOString(),
    parameters: params,
    summaryCards: [
      {
        id: 'dsm-count',
        labelAr: 'عدد الأصناف الراكدة',
        labelEn: 'Slow-Moving Items Count',
        value: `${rows.length} صنف`,
        variant: 'warning',
      },
    ],
    columns: [
      { field: 'sku', labelAr: 'الرمز (SKU)', labelEn: 'SKU', align: 'start', type: 'text' },
      { field: 'nameAr', labelAr: 'اسم الصنف', labelEn: 'Item Name', align: 'start', type: 'text' },
      { field: 'currentStock', labelAr: 'المخزون الحالي', labelEn: 'Stock', align: 'center', type: 'badge' },
      { field: 'lastMovementDate', labelAr: 'تاريخ آخر حركة', labelEn: 'Last Movement', align: 'start', type: 'date' },
      { field: 'daysSinceLast', labelAr: 'أيام الركود', labelEn: 'Days Inactive', align: 'center', type: 'badge' },
      { field: 'tiedUpCapitalSar', labelAr: 'رأس المال المجمد (SAR)', labelEn: 'Tied-up Capital', align: 'end', type: 'currency' },
    ],
    rows,
    pagination: {
      page: 1,
      pageSize: rows.length || 1,
      totalRows: rows.length,
      totalPages: 1,
    },
    executionTimeMs: Date.now() - start,
  };
}

export function executeLowStockReport(tenantId: string, params: ReportParameterSchema): ReportResult {
  const start = Date.now();
  const items = centralStore.items.get(tenantId) || [];

  const rows = items
    .map((it) => {
      const stock = it.currentStock || 0;
      const minStock = it.minStockLevel || 10;
      const reorderQty = it.reorderQuantity || (minStock * 2);
      const isLow = stock <= minStock;

      return {
        id: it.id,
        sku: it.sku,
        nameAr: it.nameAr,
        currentStock: stock,
        minStockLevel: minStock,
        shortage: minStock > stock ? minStock - stock : 0,
        suggestedReorder: reorderQty,
        isLow,
      };
    })
    .filter((r) => r.isLow);

  return {
    reportType: 'LOW_STOCK_REPORT',
    category: 'INVENTORY',
    titleAr: 'تقرير نواقص المخزون ونقاط إعادة الطلب',
    titleEn: 'Low Stock & Reorder Points Alert',
    generatedAt: new Date().toISOString(),
    parameters: params,
    summaryCards: [
      {
        id: 'ls-count',
        labelAr: 'الأصناف دون الحد الأدنى',
        labelEn: 'Items Below Reorder Point',
        value: `${rows.length} صنف`,
        variant: 'danger',
      },
    ],
    columns: [
      { field: 'sku', labelAr: 'الرمز (SKU)', labelEn: 'SKU', align: 'start', type: 'text' },
      { field: 'nameAr', labelAr: 'اسم الصنف', labelEn: 'Item Name', align: 'start', type: 'text' },
      { field: 'currentStock', labelAr: 'الرصيد الفعلي', labelEn: 'Actual Stock', align: 'center', type: 'badge' },
      { field: 'minStockLevel', labelAr: 'الحد الأدنى', labelEn: 'Min Level', align: 'center', type: 'badge' },
      { field: 'shortage', labelAr: 'مقدار العجز', labelEn: 'Shortage Qty', align: 'center', type: 'badge' },
      { field: 'suggestedReorder', labelAr: 'الكمية المقترحة للطلب', labelEn: 'Suggested Reorder', align: 'center', type: 'badge' },
    ],
    rows,
    pagination: {
      page: 1,
      pageSize: rows.length || 1,
      totalRows: rows.length,
      totalPages: 1,
    },
    executionTimeMs: Date.now() - start,
  };
}

// ==========================================
// 3. VAT REPORTS
// ==========================================

export function executeVatSalesReport(tenantId: string, params: ReportParameterSchema): ReportResult {
  const start = Date.now();
  const invoices = (centralStore.salesInvoices?.get(tenantId) || []).filter((i) => i.status === 'POSTED');
  const customers = centralStore.customers.get(tenantId) || [];

  let standardTaxable = 0n;
  let standardVat = 0n;
  let zeroTaxable = 0n;
  let exemptTaxable = 0n;

  const rows = invoices
    .filter((inv) => {
      if (params.startDate && inv.issueDate < params.startDate) return false;
      if (params.endDate && inv.issueDate > params.endDate) return false;
      return true;
    })
    .map((inv) => {
      const cust = customers.find((c) => c.id === inv.customerId);
      const invAny = inv as any;
      const sub = safeBigInt(invAny.subtotalCents || invAny.totalCents);
      const vat = safeBigInt(invAny.vatAmountCents || invAny.totalVatCents || 0n);
      const rate = invAny.vatRate || 15;

      if (rate === 15) {
        standardTaxable += sub;
        standardVat += vat;
      } else if (rate === 0) {
        zeroTaxable += sub;
      } else {
        exemptTaxable += sub;
      }

      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        issueDate: inv.issueDate,
        customerName: cust?.nameAr || 'نقدي',
        customerVat: cust?.vatNumber || '-',
        taxRate: `${rate}%`,
        taxableAmount: fromHalalasToDisplay(sub),
        vatAmount: fromHalalasToDisplay(vat),
        totalWithVat: fromHalalasToDisplay(sub + vat),
        sourceDocument: {
          type: 'SALES_INVOICE' as const,
          id: inv.id,
          number: inv.invoiceNumber,
          date: inv.issueDate,
        },
      };
    });

  return {
    reportType: 'VAT_SALES_REPORT',
    category: 'VAT',
    titleAr: 'تقرير ضريبة المبيعات والمخرجات (15% و0% ومعفى)',
    titleEn: 'Sales Output VAT Report',
    generatedAt: new Date().toISOString(),
    parameters: params,
    summaryCards: [
      {
        id: 'vat-std-taxable',
        labelAr: 'المبيعات الخاضعة للنسبة الأساسية (15%)',
        labelEn: 'Standard Rated Sales (15%)',
        value: `${fromHalalasToDisplay(standardTaxable)} ر.س`,
        variant: 'default',
      },
      {
        id: 'vat-std-vat',
        labelAr: 'ضريبة المخرجات المستحقة للهيئة (15%)',
        labelEn: 'Output VAT Due (15%)',
        value: `${fromHalalasToDisplay(standardVat)} ر.س`,
        variant: 'success',
      },
    ],
    columns: [
      { field: 'invoiceNumber', labelAr: 'رقم الفاتورة', labelEn: 'Invoice #', align: 'start', type: 'link' },
      { field: 'issueDate', labelAr: 'التاريخ', labelEn: 'Date', align: 'start', type: 'date' },
      { field: 'customerName', labelAr: 'اسم العميل', labelEn: 'Customer Name', align: 'start', type: 'text' },
      { field: 'customerVat', labelAr: 'الرقم الضريبي', labelEn: 'VAT Number', align: 'start', type: 'text' },
      { field: 'taxRate', labelAr: 'النسبة', labelEn: 'Rate', align: 'center', type: 'badge' },
      { field: 'taxableAmount', labelAr: 'المبلغ الخاضع (SAR)', labelEn: 'Taxable (SAR)', align: 'end', type: 'currency' },
      { field: 'vatAmount', labelAr: 'مبلغ الضريبة (SAR)', labelEn: 'VAT (SAR)', align: 'end', type: 'currency' },
      { field: 'totalWithVat', labelAr: 'الإجمالي (SAR)', labelEn: 'Total (SAR)', align: 'end', type: 'currency' },
    ],
    rows,
    totals: {
      taxableAmount: fromHalalasToDisplay(standardTaxable + zeroTaxable + exemptTaxable),
      vatAmount: fromHalalasToDisplay(standardVat),
      totalWithVat: fromHalalasToDisplay(standardTaxable + zeroTaxable + exemptTaxable + standardVat),
    },
    pagination: {
      page: 1,
      pageSize: rows.length || 1,
      totalRows: rows.length,
      totalPages: 1,
    },
    executionTimeMs: Date.now() - start,
  };
}

export function executeVatGlReconciliation(tenantId: string, params: ReportParameterSchema): ReportResult {
  const start = Date.now();
  const accounts = centralStore.accounts.get(tenantId) || [];
  const journals = (centralStore.journals.get(tenantId) || []).filter((j) => j.status === 'POSTED');
  const invoices = (centralStore.salesInvoices?.get(tenantId) || []).filter((i) => i.status === 'POSTED');
  const bills = (centralStore.purchaseBills?.get(tenantId) || []).filter((b) => b.status === 'POSTED');

  const startDate = params.startDate;
  const endDate = params.endDate;

  // 1. Output VAT from Sales Invoices
  let docOutputVat = 0n;
  invoices.forEach((inv) => {
    if (startDate && inv.issueDate < startDate) return;
    if (endDate && inv.issueDate > endDate) return;
    const invAny = inv as any;
    docOutputVat += safeBigInt(invAny.vatAmountCents || invAny.totalVatCents || (invAny.taxTotalSar ? toHalalas(String(invAny.taxTotalSar)) : 0n));
  });

  // 2. Input VAT from Purchase Bills
  let docInputVat = 0n;
  bills.forEach((b) => {
    const bAny = b as any;
    const bDate = bAny.billDate || bAny.invoiceDate || bAny.date;
    if (startDate && bDate < startDate) return;
    if (endDate && bDate > endDate) return;
    docInputVat += safeBigInt(bAny.taxAmountCents || bAny.totalVatCents || 0n);
  });

  // 3. GL Account 20301 (Output VAT Payable) Net Credit Balance
  let glOutputVat = 0n;
  // 4. GL Account 10301 (Input VAT Recoverable) Net Debit Balance
  let glInputVat = 0n;

  journals.forEach((j) => {
    const jAny = j as any;
    const jDate = jAny.date || jAny.entryDate || jAny.createdAt;
    if (startDate && jDate < startDate) return;
    if (endDate && jDate > endDate) return;

    (j.lines || []).forEach((l) => {
      let code = l.accountCode || '';
      if (!code && l.accountId) {
        const acc = accounts.find((a) => a.id === l.accountId);
        if (acc) code = acc.code;
      }
      const deb = safeBigInt(l.debitCents);
      const cre = safeBigInt(l.creditCents);

      if (code.startsWith('20301') || code.startsWith('210401')) {
        glOutputVat += (cre - deb);
      } else if (code.startsWith('10301') || code.startsWith('110501')) {
        glInputVat += (deb - cre);
      }
    });
  });

  const outputDiff = docOutputVat > glOutputVat ? docOutputVat - glOutputVat : glOutputVat - docOutputVat;
  const inputDiff = docInputVat > glInputVat ? docInputVat - glInputVat : glInputVat - docInputVat;
  const isOutputReconciled = outputDiff === 0n;
  const isInputReconciled = inputDiff === 0n;
  const isFullyReconciled = isOutputReconciled && isInputReconciled;

  const rows = [
    {
      id: 'rec-output',
      lineNameAr: 'ضريبة المخرجات (المبيعات) - حساب 20301',
      lineNameEn: 'Output VAT (Sales) - Account 20301',
      documentLedgerAmount: fromHalalasToDisplay(docOutputVat),
      generalLedgerAmount: fromHalalasToDisplay(glOutputVat),
      discrepancy: fromHalalasToDisplay(outputDiff),
      status: isOutputReconciled ? 'RECONCILED' : 'DISCREPANCY',
    },
    {
      id: 'rec-input',
      lineNameAr: 'ضريبة المدخلات (المشتريات) - حساب 10301',
      lineNameEn: 'Input VAT (Purchases) - Account 10301',
      documentLedgerAmount: fromHalalasToDisplay(docInputVat),
      generalLedgerAmount: fromHalalasToDisplay(glInputVat),
      discrepancy: fromHalalasToDisplay(inputDiff),
      status: isInputReconciled ? 'RECONCILED' : 'DISCREPANCY',
    },
    {
      id: 'rec-net',
      lineNameAr: 'صافي المركز الضريبي للهيئة (مخرجات - مدخلات)',
      lineNameEn: 'Net Statutory Position (Output - Input)',
      documentLedgerAmount: fromHalalasToDisplay(docOutputVat - docInputVat),
      generalLedgerAmount: fromHalalasToDisplay(glOutputVat - glInputVat),
      discrepancy: fromHalalasToDisplay((docOutputVat - docInputVat) - (glOutputVat - glInputVat)),
      status: isFullyReconciled ? 'RECONCILED' : 'DISCREPANCY',
    },
  ];

  return {
    reportType: 'VAT_GL_RECONCILIATION',
    category: 'VAT',
    titleAr: 'مطابقة سجل الضريبة مع دفتر الأستاذ العام (فحص الصفر)',
    titleEn: 'VAT vs General Ledger Reconciliation (Zero-Diff)',
    generatedAt: new Date().toISOString(),
    parameters: params,
    summaryCards: [
      {
        id: 'rec-status',
        labelAr: 'حالة المطابقة المحاسبية (Zero-Diff)',
        labelEn: 'Reconciliation Status',
        value: isFullyReconciled ? 'مطابق 100% (صفر فروقات)' : 'توجد فروقات',
        variant: isFullyReconciled ? 'success' : 'danger',
      },
      {
        id: 'rec-net-due',
        labelAr: 'صافي الضريبة الواجبة للسداد (SAR)',
        labelEn: 'Net VAT Payable (SAR)',
        value: `${fromHalalasToDisplay(glOutputVat - glInputVat)} ر.س`,
        variant: 'info',
      },
    ],
    columns: [
      { field: 'lineNameAr', labelAr: 'البند الضريبي والمحاسبي', labelEn: 'Line Description', align: 'start', type: 'text' },
      { field: 'documentLedgerAmount', labelAr: 'سجل الفواتير (SAR)', labelEn: 'Invoices Ledger', align: 'end', type: 'currency' },
      { field: 'generalLedgerAmount', labelAr: 'دفتر الأستاذ العام (SAR)', labelEn: 'General Ledger', align: 'end', type: 'currency' },
      { field: 'discrepancy', labelAr: 'الفارق المحاسبي', labelEn: 'Discrepancy', align: 'end', type: 'currency' },
      { field: 'status', labelAr: 'حالة الفحص', labelEn: 'Audit Status', align: 'center', type: 'badge' },
    ],
    rows,
    pagination: {
      page: 1,
      pageSize: rows.length,
      totalRows: rows.length,
      totalPages: 1,
    },
    isBalanced: isFullyReconciled,
    executionTimeMs: Date.now() - start,
  };
}

/**
 * Authoritative AR/AP Reports Service — Saudi ERP Backend
 * Adheres strictly to:
 * - Rule G4: Customer/Supplier authoritative statements from General Ledger & vouchers
 * - Rule C: Sensitive financial cost scrubber on customer profitability
 */

import { centralStore } from '../../core/tenantGuard.js';
import { fromHalalasToDisplay } from '../../../src/lib/accounting.js';
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

export function executeCustomerStatement(tenantId: string, params: ReportParameterSchema): ReportResult {
  const start = Date.now();
  const customers = centralStore.customers.get(tenantId) || [];
  const invoices = (centralStore.salesInvoices?.get(tenantId) || []).filter((i) => i.status === 'POSTED');
  const receipts = (centralStore as any).receiptVouchers?.get(tenantId) || (centralStore as any).customerReceipts?.get(tenantId) || [];
  const journals = (centralStore.journals.get(tenantId) || []).filter((j) => j.status === 'POSTED');

  const customerId = params.customerId || (customers.length > 0 ? customers[0].id : '');
  const customer = customers.find((c) => c.id === customerId);

  let runningBalance = 0n;
  const startDate = params.startDate;
  const endDate = params.endDate;

  // Calculate opening balance before startDate
  invoices.forEach((inv) => {
    const invAny = inv as any;
    if (inv.customerId === customerId && startDate && inv.issueDate < startDate) {
      runningBalance += safeBigInt(invAny.totalWithVatCents || invAny.totalAmountCents || invAny.totalCents);
    }
  });

  receipts.forEach((rcp: any) => {
    if (rcp.partyId === customerId && startDate && (rcp.date || rcp.voucherDate) < startDate) {
      runningBalance -= safeBigInt(rcp.amountCents);
    }
  });

  const transactions: any[] = [];

  // Opening balance line if applicable
  if (runningBalance !== 0n) {
    transactions.push({
      id: 'op-bal',
      date: startDate || '-',
      documentNumber: 'افتتاحي / Opening',
      docType: 'OPENING',
      description: 'الرصيد الافتتاحي ما قبل الفترة',
      debit: runningBalance > 0n ? fromHalalasToDisplay(runningBalance) : '0.00',
      credit: runningBalance < 0n ? fromHalalasToDisplay(-runningBalance) : '0.00',
      runningBalance: fromHalalasToDisplay(runningBalance),
    });
  }

  // Invoices
  invoices.forEach((inv) => {
    if (inv.customerId !== customerId) return;
    if (startDate && inv.issueDate < startDate) return;
    if (endDate && inv.issueDate > endDate) return;

    const invAny = inv as any;
    const amt = safeBigInt(invAny.totalWithVatCents || invAny.totalAmountCents || invAny.totalCents);
    runningBalance += amt;

    transactions.push({
      id: inv.id,
      date: inv.issueDate,
      documentNumber: inv.invoiceNumber,
      docType: 'INVOICE',
      description: `فاتورة ضريبية ${invAny.type === 'STANDARD_B2B' ? 'B2B' : 'B2C'}`,
      debit: fromHalalasToDisplay(amt),
      credit: '0.00',
      runningBalance: fromHalalasToDisplay(runningBalance),
      sourceDocument: {
        type: 'SALES_INVOICE',
        id: inv.id,
        number: inv.invoiceNumber,
        date: inv.issueDate,
      },
    });
  });

  // Receipts
  receipts.forEach((rcp) => {
    if (rcp.partyId !== customerId) return;
    if (startDate && rcp.date < startDate) return;
    if (endDate && rcp.date > endDate) return;

    const amt = safeBigInt(rcp.amountCents);
    runningBalance -= amt;

    transactions.push({
      id: rcp.id,
      date: rcp.date,
      documentNumber: rcp.voucherNumber,
      docType: 'RECEIPT',
      description: `سند قبض نقدي / بنكي (${rcp.paymentMethod})`,
      debit: '0.00',
      credit: fromHalalasToDisplay(amt),
      runningBalance: fromHalalasToDisplay(runningBalance),
      sourceDocument: {
        type: 'CUSTOMER_RECEIPT',
        id: rcp.id,
        number: rcp.voucherNumber,
        date: rcp.date,
      },
    });
  });

  transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return {
    reportType: 'CUSTOMER_STATEMENT',
    category: 'AR_AP',
    titleAr: `كشف حساب العميل: ${customer?.nameAr || 'غير محدد'} (${customer?.vatNumber || ''})`,
    titleEn: `Customer Statement: ${customer?.nameEn || 'N/A'}`,
    generatedAt: new Date().toISOString(),
    parameters: params,
    summaryCards: [
      {
        id: 'cust-limit',
        labelAr: 'الحد الائتماني المعتمد',
        labelEn: 'Approved Credit Limit',
        value: `${((customer as any)?.creditLimitSar || (customer as any)?.creditLimit) ? Number((customer as any)?.creditLimitSar || (customer as any)?.creditLimit).toLocaleString() : '0.00'} ر.س`,
        variant: 'default',
      },
      {
        id: 'cust-closing',
        labelAr: 'الرصيد المستحق الحالي',
        labelEn: 'Current Due Balance',
        value: `${fromHalalasToDisplay(runningBalance)} ر.س`,
        variant: runningBalance > 0n ? 'warning' : 'success',
      },
    ],
    columns: [
      { field: 'date', labelAr: 'التاريخ', labelEn: 'Date', align: 'start', type: 'date' },
      { field: 'documentNumber', labelAr: 'رقم المستند', labelEn: 'Doc #', align: 'start', type: 'link' },
      { field: 'docType', labelAr: 'النوع', labelEn: 'Type', align: 'center', type: 'badge' },
      { field: 'description', labelAr: 'البيان', labelEn: 'Description', align: 'start', type: 'text' },
      { field: 'debit', labelAr: 'مدين (SAR)', labelEn: 'Debit (SAR)', align: 'end', type: 'currency' },
      { field: 'credit', labelAr: 'دائن (SAR)', labelEn: 'Credit (SAR)', align: 'end', type: 'currency' },
      { field: 'runningBalance', labelAr: 'الرصيد الجاري', labelEn: 'Running Balance', align: 'end', type: 'currency' },
    ],
    rows: transactions,
    totals: {
      runningBalance: fromHalalasToDisplay(runningBalance),
    },
    pagination: {
      page: 1,
      pageSize: transactions.length || 1,
      totalRows: transactions.length,
      totalPages: 1,
    },
    executionTimeMs: Date.now() - start,
  };
}

export function executeSupplierStatement(tenantId: string, params: ReportParameterSchema): ReportResult {
  const start = Date.now();
  const suppliers = centralStore.suppliers.get(tenantId) || [];
  const bills = (centralStore.purchaseBills?.get(tenantId) || []).filter((b) => b.status === 'POSTED');
  const payments = (centralStore as any).paymentVouchers?.get(tenantId) || (centralStore as any).supplierPayments?.get(tenantId) || [];

  const supplierId = params.supplierId || (suppliers.length > 0 ? suppliers[0].id : '');
  const supplier = suppliers.find((s) => s.id === supplierId);

  let runningBalance = 0n;
  const startDate = params.startDate;
  const endDate = params.endDate;

  const transactions: any[] = [];

  // Opening balance
  bills.forEach((b) => {
    const bAny = b as any;
    const bDate = bAny.billDate || bAny.date || bAny.issueDate || '';
    if (b.supplierId === supplierId && startDate && bDate < startDate) {
      runningBalance += safeBigInt(bAny.totalAmountCents || bAny.totalAmountSar || 0n);
    }
  });

  payments.forEach((p: any) => {
    const pDate = p.date || p.voucherDate || '';
    if (p.partyId === supplierId && startDate && pDate < startDate) {
      runningBalance -= safeBigInt(p.amountCents);
    }
  });

  if (runningBalance !== 0n) {
    transactions.push({
      id: 'op-bal-sup',
      date: startDate || '-',
      documentNumber: 'افتتاحي / Opening',
      docType: 'OPENING',
      description: 'رصيد المورد ما قبل الفترة',
      debit: runningBalance < 0n ? fromHalalasToDisplay(-runningBalance) : '0.00',
      credit: runningBalance > 0n ? fromHalalasToDisplay(runningBalance) : '0.00',
      runningBalance: fromHalalasToDisplay(runningBalance),
    });
  }

  // Bills
  bills.forEach((b) => {
    const bAny = b as any;
    const bDate = bAny.billDate || bAny.date || bAny.issueDate || '';
    if (b.supplierId !== supplierId) return;
    if (startDate && bDate < startDate) return;
    if (endDate && bDate > endDate) return;

    const amt = safeBigInt(bAny.totalAmountCents || bAny.totalAmountSar || 0n);
    runningBalance += amt;

    transactions.push({
      id: b.id,
      date: bDate,
      documentNumber: b.billNumber,
      docType: 'BILL',
      description: `فاتورة شراء ${b.supplierInvoiceNumber ? '(' + b.supplierInvoiceNumber + ')' : ''}`,
      debit: '0.00',
      credit: fromHalalasToDisplay(amt),
      runningBalance: fromHalalasToDisplay(runningBalance),
      sourceDocument: {
        type: 'PURCHASE_BILL',
        id: b.id,
        number: b.billNumber,
        date: bDate,
      },
    });
  });

  // Payments
  payments.forEach((p) => {
    if (p.partyId !== supplierId) return;
    if (startDate && p.date < startDate) return;
    if (endDate && p.date > endDate) return;

    const amt = safeBigInt(p.amountCents);
    runningBalance -= amt;

    transactions.push({
      id: p.id,
      date: p.date,
      documentNumber: p.voucherNumber,
      docType: 'PAYMENT',
      description: `سند صرف للمورد (${p.paymentMethod})`,
      debit: fromHalalasToDisplay(amt),
      credit: '0.00',
      runningBalance: fromHalalasToDisplay(runningBalance),
      sourceDocument: {
        type: 'SUPPLIER_PAYMENT',
        id: p.id,
        number: p.voucherNumber,
        date: p.date,
      },
    });
  });

  transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return {
    reportType: 'SUPPLIER_STATEMENT',
    category: 'AR_AP',
    titleAr: `كشف حساب المورد: ${supplier?.nameAr || 'غير محدد'}`,
    titleEn: `Supplier Statement: ${supplier?.nameEn || 'N/A'}`,
    generatedAt: new Date().toISOString(),
    parameters: params,
    summaryCards: [
      {
        id: 'sup-balance',
        labelAr: 'إجمالي المستحق للمورد',
        labelEn: 'Total Due to Supplier',
        value: `${fromHalalasToDisplay(runningBalance)} ر.س`,
        variant: runningBalance > 0n ? 'warning' : 'success',
      },
    ],
    columns: [
      { field: 'date', labelAr: 'التاريخ', labelEn: 'Date', align: 'start', type: 'date' },
      { field: 'documentNumber', labelAr: 'رقم المستند', labelEn: 'Doc #', align: 'start', type: 'link' },
      { field: 'docType', labelAr: 'النوع', labelEn: 'Type', align: 'center', type: 'badge' },
      { field: 'description', labelAr: 'البيان', labelEn: 'Description', align: 'start', type: 'text' },
      { field: 'debit', labelAr: 'مدين (مسدد) (SAR)', labelEn: 'Debit (Paid) (SAR)', align: 'end', type: 'currency' },
      { field: 'credit', labelAr: 'دائن (مستحق) (SAR)', labelEn: 'Credit (Due) (SAR)', align: 'end', type: 'currency' },
      { field: 'runningBalance', labelAr: 'الرصيد المستحق', labelEn: 'Running Balance', align: 'end', type: 'currency' },
    ],
    rows: transactions,
    totals: {
      runningBalance: fromHalalasToDisplay(runningBalance),
    },
    pagination: {
      page: 1,
      pageSize: transactions.length || 1,
      totalRows: transactions.length,
      totalPages: 1,
    },
    executionTimeMs: Date.now() - start,
  };
}

export function executeArAging(tenantId: string, params: ReportParameterSchema): ReportResult {
  const start = Date.now();
  const customers = centralStore.customers.get(tenantId) || [];
  const invoices = (centralStore.salesInvoices?.get(tenantId) || []).filter((i) => i.status === 'POSTED');
  const now = new Date(params.asOfDate || new Date().toISOString().slice(0, 10)).getTime();

  let totCurrent = 0n;
  let tot30 = 0n;
  let tot60 = 0n;
  let tot90 = 0n;
  let tot120Plus = 0n;
  let grandTotal = 0n;

  const rows = customers.map((c) => {
    let cur = 0n;
    let b30 = 0n;
    let b60 = 0n;
    let b90 = 0n;
    let b120 = 0n;

    const custInvoices = invoices.filter((i) => i.customerId === c.id);
    custInvoices.forEach((inv) => {
      const invAny = inv as any;
      const remainingCents = safeBigInt(invAny.remainingBalanceCents || invAny.balanceCents || invAny.totalAmountCents || invAny.totalWithVatCents || invAny.totalCents);
      if (remainingCents <= 0n) return;

      const dueDate = new Date(inv.dueDate || inv.issueDate).getTime();
      const diffDays = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) cur += remainingCents;
      else if (diffDays <= 30) b30 += remainingCents;
      else if (diffDays <= 60) b60 += remainingCents;
      else if (diffDays <= 90) b90 += remainingCents;
      else b120 += remainingCents;
    });

    const partyTotal = cur + b30 + b60 + b90 + b120;
    totCurrent += cur;
    tot30 += b30;
    tot60 += b60;
    tot90 += b90;
    tot120Plus += b120;
    grandTotal += partyTotal;

    return {
      id: c.id,
      customerCode: c.code,
      customerName: c.nameAr,
      customerNameAr: c.nameAr,
      customerNameEn: c.nameEn,
      current: fromHalalasToDisplay(cur),
      bucket30: fromHalalasToDisplay(b30),
      bucket60: fromHalalasToDisplay(b60),
      bucket90: fromHalalasToDisplay(b90),
      bucket120Plus: fromHalalasToDisplay(b120),
      totalBalance: fromHalalasToDisplay(partyTotal),
      hasOverdue: (b30 + b60 + b90 + b120) > 0n,
    };
  }).filter((r) => r.totalBalance !== '0.00');

  return {
    reportType: 'AR_AGING',
    category: 'AR_AP',
    titleAr: 'أعمار ديون العملاء (Aging Buckets)',
    titleEn: 'Accounts Receivable Aging Schedule',
    generatedAt: new Date().toISOString(),
    parameters: params,
    summaryCards: [
      {
        id: 'ar-tot',
        labelAr: 'إجمالي الذمم المدينة',
        labelEn: 'Total Receivables',
        value: `${fromHalalasToDisplay(grandTotal)} ر.س`,
        variant: 'default',
      },
      {
        id: 'ar-overdue',
        labelAr: 'إجمالي الديون المتأخرة (+30 يوماً)',
        labelEn: 'Total Overdue (>30 Days)',
        value: `${fromHalalasToDisplay(tot30 + tot60 + tot90 + tot120Plus)} ر.س`,
        variant: 'warning',
      },
      {
        id: 'ar-critical',
        labelAr: 'ديون حرجة (+120 يوماً)',
        labelEn: 'Critical Overdue (>120 Days)',
        value: `${fromHalalasToDisplay(tot120Plus)} ر.س`,
        variant: 'danger',
      },
    ],
    columns: [
      { field: 'customerCode', labelAr: 'رمز العميل', labelEn: 'Code', align: 'start', type: 'text' },
      { field: 'customerName', labelAr: 'اسم العميل', labelEn: 'Customer Name', align: 'start', type: 'text' },
      { field: 'current', labelAr: 'جاري (0-30)', labelEn: 'Current (0-30)', align: 'end', type: 'currency' },
      { field: 'bucket30', labelAr: '31-60 يوماً', labelEn: '31-60 Days', align: 'end', type: 'currency' },
      { field: 'bucket60', labelAr: '61-90 يوماً', labelEn: '61-90 Days', align: 'end', type: 'currency' },
      { field: 'bucket90', labelAr: '91-120 يوماً', labelEn: '91-120 Days', align: 'end', type: 'currency' },
      { field: 'bucket120Plus', labelAr: 'أكثر من 120 يوم', labelEn: '120+ Days', align: 'end', type: 'currency' },
      { field: 'totalBalance', labelAr: 'إجمالي الرصيد (SAR)', labelEn: 'Total (SAR)', align: 'end', type: 'currency' },
    ],
    rows,
    totals: {
      current: fromHalalasToDisplay(totCurrent),
      bucket30: fromHalalasToDisplay(tot30),
      bucket60: fromHalalasToDisplay(tot60),
      bucket90: fromHalalasToDisplay(tot90),
      bucket120Plus: fromHalalasToDisplay(tot120Plus),
      totalBalance: fromHalalasToDisplay(grandTotal),
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

export function executeOverdueReceivables(tenantId: string, params: ReportParameterSchema): ReportResult {
  const start = Date.now();
  const customers = centralStore.customers.get(tenantId) || [];
  const invoices = (centralStore.salesInvoices?.get(tenantId) || []).filter((i) => i.status === 'POSTED');
  const now = new Date().getTime();

  const rows: any[] = [];
  let grandTotalOverdue = 0n;

  invoices.forEach((inv) => {
    const invAny = inv as any;
    const remainingCents = safeBigInt(invAny.remainingBalanceCents || invAny.totalWithVatCents || invAny.totalCents);
    if (remainingCents <= 0n) return;

    const dueDate = new Date(inv.dueDate || inv.issueDate).getTime();
    if (dueDate >= now) return; // Not overdue yet

    const daysOverdue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));
    const cust = customers.find((c) => c.id === inv.customerId);

    grandTotalOverdue += remainingCents;

    rows.push({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate || inv.issueDate,
      daysOverdue,
      customerName: cust?.nameAr || 'عميل نقدي',
      customerPhone: (cust as any)?.phone || (cust as any)?.mobile || '-',
      customerEmail: cust?.email || '-',
      remainingBalance: fromHalalasToDisplay(remainingCents),
      reminderAction: 'SEND_REMINDER',
      sourceDocument: {
        type: 'SALES_INVOICE',
        id: inv.id,
        number: inv.invoiceNumber,
        date: inv.issueDate,
      },
    });
  });

  rows.sort((a, b) => b.daysOverdue - a.daysOverdue);

  return {
    reportType: 'OVERDUE_RECEIVABLES',
    category: 'AR_AP',
    titleAr: 'قائمة المتأخرات مع إجراءات التذكير',
    titleEn: 'Overdue Receivables & Reminder Actions',
    generatedAt: new Date().toISOString(),
    parameters: params,
    summaryCards: [
      {
        id: 'overdue-count',
        labelAr: 'عدد الفواتير المتأخرة',
        labelEn: 'Overdue Invoices Count',
        value: `${rows.length} فاتورة`,
        variant: 'warning',
      },
      {
        id: 'overdue-total',
        labelAr: 'إجمالي المبالغ المتأخرة',
        labelEn: 'Total Overdue Amount',
        value: `${fromHalalasToDisplay(grandTotalOverdue)} ر.س`,
        variant: 'danger',
      },
    ],
    columns: [
      { field: 'invoiceNumber', labelAr: 'رقم الفاتورة', labelEn: 'Invoice #', align: 'start', type: 'link' },
      { field: 'customerName', labelAr: 'اسم العميل', labelEn: 'Customer Name', align: 'start', type: 'text' },
      { field: 'dueDate', labelAr: 'تاريخ الاستحقاق', labelEn: 'Due Date', align: 'start', type: 'date' },
      { field: 'daysOverdue', labelAr: 'أيام التأخير', labelEn: 'Days Overdue', align: 'center', type: 'badge' },
      { field: 'remainingBalance', labelAr: 'المبلغ المتأخر (SAR)', labelEn: 'Overdue (SAR)', align: 'end', type: 'currency' },
      { field: 'customerPhone', labelAr: 'الهاتف / واتساب', labelEn: 'Contact Phone', align: 'start', type: 'text' },
    ],
    rows,
    totals: {
      remainingBalance: fromHalalasToDisplay(grandTotalOverdue),
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

export function executePartiesBalanceSummary(tenantId: string, params: ReportParameterSchema): ReportResult {
  const start = Date.now();
  const customers = centralStore.customers.get(tenantId) || [];
  const suppliers = centralStore.suppliers.get(tenantId) || [];
  const invoices = (centralStore.salesInvoices?.get(tenantId) || []).filter((i) => i.status === 'POSTED');
  const bills = (centralStore.purchaseBills?.get(tenantId) || []).filter((b) => b.status === 'POSTED');
  const receipts = (centralStore as any).receiptVouchers?.get(tenantId) || (centralStore as any).customerReceipts?.get(tenantId) || [];
  const payments = (centralStore as any).paymentVouchers?.get(tenantId) || (centralStore as any).supplierPayments?.get(tenantId) || [];

  const rows: any[] = [];
  let totalAR = 0n;
  let totalAP = 0n;

  // Customers
  customers.forEach((c) => {
    let deb = 0n;
    let cre = 0n;

    invoices.forEach((inv) => {
      const invAny = inv as any;
      if (inv.customerId === c.id) deb += safeBigInt(invAny.totalWithVatCents || invAny.totalCents);
    });

    receipts.forEach((r: any) => {
      if (r.partyId === c.id) cre += safeBigInt(r.amountCents);
    });

    const net = deb - cre;
    totalAR += net;

    const creditLimitVal = (c as any).creditLimitSar || (c as any).creditLimit;
    rows.push({
      id: `cust-${c.id}`,
      partyType: 'CUSTOMER',
      code: c.code,
      name: c.nameAr,
      vatNumber: c.vatNumber || '-',
      creditLimit: creditLimitVal ? `${Number(creditLimitVal).toLocaleString()} ر.س` : '-',
      totalInvoiced: fromHalalasToDisplay(deb),
      totalPaid: fromHalalasToDisplay(cre),
      netBalance: fromHalalasToDisplay(net),
      status: c.status || 'ACTIVE',
    });
  });

  // Suppliers
  suppliers.forEach((s) => {
    let deb = 0n;
    let cre = 0n;

    bills.forEach((b: any) => {
      if (b.supplierId === s.id) cre += safeBigInt(b.totalAmountCents || b.totalAmountSar || 0n);
    });

    payments.forEach((p: any) => {
      if (p.partyId === s.id) deb += safeBigInt(p.amountCents);
    });

    const net = cre - deb;
    totalAP += net;

    rows.push({
      id: `sup-${s.id}`,
      partyType: 'SUPPLIER',
      code: s.code,
      name: s.nameAr,
      vatNumber: s.vatNumber || '-',
      creditLimit: '-',
      totalInvoiced: fromHalalasToDisplay(cre),
      totalPaid: fromHalalasToDisplay(deb),
      netBalance: fromHalalasToDisplay(net),
      status: s.status || 'ACTIVE',
    });
  });

  return {
    reportType: 'PARTIES_BALANCE_SUMMARY',
    category: 'AR_AP',
    titleAr: 'ملخص أرصدة العملاء والموردين',
    titleEn: 'Parties Balance Summary (AR/AP Balances)',
    generatedAt: new Date().toISOString(),
    parameters: params,
    summaryCards: [
      {
        id: 'tot-ar',
        labelAr: 'إجمالي ذمم العملاء (AR)',
        labelEn: 'Total Receivables (AR)',
        value: `${fromHalalasToDisplay(totalAR)} ر.س`,
        variant: 'default',
      },
      {
        id: 'tot-ap',
        labelAr: 'إجمالي التزامات الموردين (AP)',
        labelEn: 'Total Payables (AP)',
        value: `${fromHalalasToDisplay(totalAP)} ر.س`,
        variant: 'default',
      },
      {
        id: 'net-exposure',
        labelAr: 'صافي المركز الائتماني',
        labelEn: 'Net Credit Exposure',
        value: `${fromHalalasToDisplay(totalAR - totalAP)} ر.س`,
        variant: (totalAR - totalAP) >= 0n ? 'info' : 'warning',
      },
    ],
    columns: [
      { field: 'partyType', labelAr: 'الصفة', labelEn: 'Type', align: 'center', type: 'badge' },
      { field: 'code', labelAr: 'الرمز', labelEn: 'Code', align: 'start', type: 'text' },
      { field: 'name', labelAr: 'الاسم', labelEn: 'Party Name', align: 'start', type: 'text' },
      { field: 'vatNumber', labelAr: 'الرقم الضريبي', labelEn: 'VAT Number', align: 'start', type: 'text' },
      { field: 'totalInvoiced', labelAr: 'إجمالي الفواتير (SAR)', labelEn: 'Total Invoiced (SAR)', align: 'end', type: 'currency' },
      { field: 'totalPaid', labelAr: 'إجمالي المسدد (SAR)', labelEn: 'Total Paid (SAR)', align: 'end', type: 'currency' },
      { field: 'netBalance', labelAr: 'صافي الرصيد (SAR)', labelEn: 'Net Balance (SAR)', align: 'end', type: 'currency' },
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

export function executeCustomerProfitability(tenantId: string, params: ReportParameterSchema, canViewCost: boolean): ReportResult {
  const start = Date.now();
  const customers = centralStore.customers.get(tenantId) || [];
  const invoices = (centralStore.salesInvoices?.get(tenantId) || []).filter((i) => i.status === 'POSTED');

  let totalRevenue = 0n;
  let totalCogs = 0n;

  const rows = customers.map((c) => {
    let custRev = 0n;
    let custCogs = 0n;

    invoices.forEach((inv) => {
      if (inv.customerId === c.id) {
        if (params.startDate && inv.issueDate < params.startDate) return;
        if (params.endDate && inv.issueDate > params.endDate) return;

        const invAny = inv as any;
        custRev += safeBigInt(invAny.subtotalCents || invAny.totalCents);
        let cogs = safeBigInt(invAny.totalCogsCents || 0n);
        const lines = invAny.items || invAny.lines;
        if (cogs === 0n && Array.isArray(lines)) {
          lines.forEach((it: any) => {
            const cost = safeBigInt(it.costPriceCents || it.avgCostCents || it.unitCostCents || 0n);
            const qty = BigInt(it.quantity || 1);
            cogs += cost * qty;
          });
        }
        custCogs += cogs;
      }
    });

    const grossMargin = custRev - custCogs;
    const marginPct = custRev > 0n ? Number((grossMargin * 10000n) / custRev) / 100 : 0;

    totalRevenue += custRev;
    totalCogs += custCogs;

    const costDisplay = canViewCost ? fromHalalasToDisplay(custCogs) : '***';
    const grossDisplay = canViewCost ? fromHalalasToDisplay(grossMargin) : '***';
    const marginDisplay = canViewCost ? `${marginPct.toFixed(2)}%` : '***';

    return {
      id: c.id,
      customerCode: c.code,
      customerName: c.nameAr,
      customerNameAr: c.nameAr,
      customerNameEn: c.nameEn,
      revenueSar: fromHalalasToDisplay(custRev),
      cogsSar: costDisplay,
      totalCost: costDisplay,
      grossMarginSar: grossDisplay,
      grossProfit: grossDisplay,
      marginPercentage: marginDisplay,
      marginPct: marginDisplay,
    };
  }).filter((r) => r.revenueSar !== '0.00');

  const totalGrossMargin = totalRevenue - totalCogs;
  const overallMarginPct = totalRevenue > 0n ? Number((totalGrossMargin * 10000n) / totalRevenue) / 100 : 0;

  return {
    reportType: 'CUSTOMER_PROFITABILITY',
    category: 'AR_AP',
    titleAr: 'تحليل ربحية العملاء (Revenue - COGS - Returns)',
    titleEn: 'Customer Profitability Analysis',
    generatedAt: new Date().toISOString(),
    parameters: params,
    summaryCards: [
      {
        id: 'cp-rev',
        labelAr: 'إجمالي إيرادات المبيعات',
        labelEn: 'Total Net Revenue',
        value: `${fromHalalasToDisplay(totalRevenue)} ر.س`,
        variant: 'default',
      },
      {
        id: 'cp-margin',
        labelAr: 'إجمالي هامش الربح المحقق',
        labelEn: 'Total Gross Margin',
        value: canViewCost ? `${fromHalalasToDisplay(totalGrossMargin)} ر.س (${overallMarginPct.toFixed(2)}%)` : '[محجوب لعدم الصلاحية]',
        variant: canViewCost && totalGrossMargin >= 0n ? 'success' : 'danger',
      },
    ],
    columns: [
      { field: 'customerCode', labelAr: 'رمز العميل', labelEn: 'Code', align: 'start', type: 'text' },
      { field: 'customerName', labelAr: 'اسم العميل', labelEn: 'Customer Name', align: 'start', type: 'text' },
      { field: 'revenueSar', labelAr: 'صافي المبيعات (SAR)', labelEn: 'Net Revenue (SAR)', align: 'end', type: 'currency' },
      { field: 'cogsSar', labelAr: 'تكلفة البضاعة المباعة (SAR)', labelEn: 'COGS (SAR)', align: 'end', type: 'currency', isSensitiveCost: true },
      { field: 'grossMarginSar', labelAr: 'هامش الربح (SAR)', labelEn: 'Gross Margin (SAR)', align: 'end', type: 'currency', isSensitiveCost: true },
      { field: 'marginPercentage', labelAr: 'نسبة الهامش %', labelEn: 'Margin %', align: 'end', type: 'text', isSensitiveCost: true },
    ],
    rows,
    totals: {
      revenueSar: fromHalalasToDisplay(totalRevenue),
      cogsSar: canViewCost ? fromHalalasToDisplay(totalCogs) : '[REDACTED]',
      grossMarginSar: canViewCost ? fromHalalasToDisplay(totalGrossMargin) : '[REDACTED]',
      marginPercentage: canViewCost ? `${overallMarginPct.toFixed(2)}%` : '[REDACTED]',
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

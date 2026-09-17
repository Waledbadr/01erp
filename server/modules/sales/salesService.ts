/**
 * Sales Lifecycle & Tax Invoices Backend Service Engine — Saudi ERP
 * Full support for Standard (B2B) & Simplified (B2C) Invoices, Quotations,
 * Credit Notes, Inventory Deduction, Perpetual WAC COGS, and Double-Entry GL.
 */

import crypto from 'crypto';
import {
  CentralTenantDataStore,
  TenantContext,
  TenantScopedRepository,
  scrubSensitiveFinancialFields,
} from '../../core/tenantGuard.js';
import {
  SalesInvoice,
  SalesInvoiceLine,
  SalesQuotation,
  SalesCreditNote,
  InvoiceType,
  PaymentMethod,
  CreditNoteReason,
  calculateInvoiceLine,
  calculateInvoiceTotals,
  buildZatcaQRForInvoice,
} from '../../../src/lib/sales.js';
import { logger } from '../../core/logger.js';

export interface CreateInvoicePayload {
  branchId?: string;
  warehouseId?: string;
  invoiceType: InvoiceType;
  issueDate?: string;
  dueDate?: string;
  customerId: string;
  paymentMethod: PaymentMethod;
  notes?: string;
  postImmediately?: boolean;
  lines: Array<{
    itemId: string;
    uomId?: string;
    quantity: number;
    unitPriceSar: number;
    discountPercent?: number;
    taxRate?: number;
  }>;
}

export interface CreateQuotationPayload {
  branchId?: string;
  customerId: string;
  issueDate?: string;
  expiryDate?: string;
  notes?: string;
  lines: Array<{
    itemId: string;
    uomId?: string;
    quantity: number;
    unitPriceSar: number;
    discountPercent?: number;
  }>;
}

export interface CreateCreditNotePayload {
  originalInvoiceId: string;
  reasonCode: CreditNoteReason;
  reasonDescription: string;
  notes?: string;
  lines?: Array<{
    itemId: string;
    quantity: number;
    unitPriceSar: number;
  }>;
}

// -------------------------------------------------------------
// 1. INVOICE SERVICES
// -------------------------------------------------------------

export function getSalesInvoicesService(
  store: CentralTenantDataStore,
  context: TenantContext,
  filters?: {
    search?: string;
    type?: string;
    status?: string;
    customerId?: string;
    startDate?: string;
    endDate?: string;
  }
): SalesInvoice[] {
  const invoices = store.salesInvoices.get(context.tenantId) || [];
  let list = [...invoices];

  if (filters?.type) {
    list = list.filter((i) => i.invoiceType === filters.type);
  }
  if (filters?.status) {
    list = list.filter((i) => i.status === filters.status);
  }
  if (filters?.customerId) {
    list = list.filter((i) => i.customerId === filters.customerId);
  }
  if (filters?.startDate) {
    list = list.filter((i) => i.issueDate >= filters.startDate!);
  }
  if (filters?.endDate) {
    list = list.filter((i) => i.issueDate <= filters.endDate!);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase().trim();
    list = list.filter(
      (i) =>
        i.invoiceNumber.toLowerCase().includes(q) ||
        i.customerNameAr.toLowerCase().includes(q) ||
        i.customerNameEn.toLowerCase().includes(q) ||
        (i.customerVatNumber && i.customerVatNumber.includes(q))
    );
  }

  // Sort descending by issue date and sequence
  list.sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.invoiceNumber.localeCompare(a.invoiceNumber));

  // Redact cost under Rule C
  const hasCostPermission =
    context.role === 'OWNER' ||
    context.roleCode === 'OWNER' ||
    context.permissions.includes('*') ||
    context.permissions.includes('accounting:cost:view') ||
    context.permissions.includes('inventory:cost:view');

  if (!hasCostPermission) {
    return list.map((inv) => scrubSensitiveFinancialFields(inv, false));
  }
  return list;
}

export function getSalesInvoiceByIdService(
  store: CentralTenantDataStore,
  context: TenantContext,
  id: string
): SalesInvoice | null {
  const invoices = store.salesInvoices.get(context.tenantId) || [];
  const found = invoices.find((i) => i.id === id);
  if (!found) return null;

  const hasCostPermission =
    context.role === 'OWNER' ||
    context.roleCode === 'OWNER' ||
    context.permissions.includes('*') ||
    context.permissions.includes('accounting:cost:view') ||
    context.permissions.includes('inventory:cost:view');

  return hasCostPermission ? found : scrubSensitiveFinancialFields(found, false);
}

export async function createSalesInvoiceService(
  store: CentralTenantDataStore,
  context: TenantContext,
  payload: CreateInvoicePayload
): Promise<SalesInvoice> {
  const customers = store.customers.get(context.tenantId) || [];
  const customer = customers.find((c) => c.id === payload.customerId);
  if (!customer) {
    throw new Error(`Customer with ID ${payload.customerId} was not found.`);
  }

  if (customer.status === 'SUSPENDED') {
    throw new Error(`Customer ${customer.nameAr} is SUSPENDED. Invoices cannot be issued.`);
  }

  const branches = store.branches.get(context.tenantId) || [];
  const branch = payload.branchId ? branches.find((b) => b.id === payload.branchId) : branches[0];
  const branchId = branch?.id || 'branch-default';
  const branchNameAr = branch?.nameAr || 'الفرع الرئيسي';

  const warehouses = store.warehouses.get(context.tenantId) || [];
  const warehouse = payload.warehouseId ? warehouses.find((w) => w.id === payload.warehouseId) : warehouses[0];
  const warehouseId = warehouse?.id || 'wh-default';
  const warehouseNameAr = warehouse?.nameAr || 'المستودع الرئيسي';

  const items = store.items.get(context.tenantId) || [];

  // Build lines
  const lines: SalesInvoiceLine[] = [];
  for (const lineInput of payload.lines) {
    const item = items.find((it) => it.id === lineInput.itemId);
    if (!item) {
      throw new Error(`Item ${lineInput.itemId} not found.`);
    }

    const uom = lineInput.uomId ? item.units.find((u) => u.id === lineInput.uomId) : item.units[0];
    const conversionFactor = uom?.conversionFactor || 1;
    const uomName = uom?.nameAr || item.baseUnit;

    const calc = calculateInvoiceLine({
      quantity: lineInput.quantity,
      unitPriceSar: lineInput.unitPriceSar,
      discountPercent: lineInput.discountPercent || 0,
      taxRate: lineInput.taxRate !== undefined ? lineInput.taxRate : item.taxRate,
      conversionFactor,
    });

    lines.push({
      id: crypto.randomUUID(),
      itemId: item.id,
      itemCode: item.sku,
      nameAr: item.nameAr,
      nameEn: item.nameEn,
      uomId: uom?.id || 'unit-base',
      uomName,
      conversionFactor,
      quantity: lineInput.quantity,
      baseQuantity: calc.baseQuantity,
      unitPriceSar: lineInput.unitPriceSar,
      discountPercent: lineInput.discountPercent || 0,
      discountAmountSar: calc.discountAmountSar,
      taxableAmountSar: calc.taxableAmountSar,
      taxRate: lineInput.taxRate !== undefined ? lineInput.taxRate : item.taxRate,
      taxAmountSar: calc.taxAmountSar,
      totalAmountSar: calc.totalAmountSar,
      costPriceSar: item.currentWac,
    });
  }

  if (lines.length === 0) {
    throw new Error('An invoice must contain at least one line item.');
  }

  const totals = calculateInvoiceTotals(lines);

  // Credit limit evaluation for B2B standard invoice on credit
  if (payload.invoiceType === 'STANDARD_B2B' && payload.paymentMethod === 'CREDIT_ACCOUNT') {
    if (customer.creditHold) {
      throw new Error(`Customer ${customer.nameAr} is on CREDIT HOLD.`);
    }
  }

  const now = new Date();
  const issueDate = payload.issueDate || now.toISOString().slice(0, 10);
  const issueTime = now.toTimeString().slice(0, 8);
  const dueDate = payload.dueDate || issueDate;

  // Generate sequence number
  const prefix = payload.invoiceType === 'STANDARD_B2B' ? 'INV' : 'SIMP';
  const year = now.getFullYear();
  const tenantInvoices = store.salesInvoices.get(context.tenantId) || [];
  const counter = tenantInvoices.length + 1;
  const invoiceNumber = `${prefix}-${year}-${String(counter).padStart(5, '0')}`;

  const company = store.tenants.get(context.tenantId);
  const sellerName = company?.nameAr || 'شركة التقنية المتقدمة المحدودة';
  const sellerVat = company?.vatNumber || '300000000000003';

  // Build ZATCA QR
  const qrCodeBase64 = buildZatcaQRForInvoice({
    sellerName,
    sellerVatNumber: sellerVat,
    timestamp: `${issueDate}T${issueTime}Z`,
    totalWithVat: totals.totalAmountSar,
    vatTotal: totals.taxTotalSar,
  });

  const invoice: SalesInvoice = {
    id: crypto.randomUUID(),
    tenantId: context.tenantId,
    branchId,
    branchNameAr,
    warehouseId,
    warehouseNameAr,
    invoiceNumber,
    invoiceType: payload.invoiceType,
    issueDate,
    issueTime,
    dueDate,
    customerId: customer.id,
    customerNameAr: customer.nameAr,
    customerNameEn: customer.nameEn,
    customerVatNumber: customer.vatNumber,
    customerCrNumber: customer.crNumber,
    customerAddress: customer.address?.formattedAddress || customer.address?.city,
    customerSubaccountCode: customer.subaccountCode,
    paymentMethod: payload.paymentMethod,
    subtotalSar: totals.subtotalSar,
    discountTotalSar: totals.discountTotalSar,
    taxTotalSar: totals.taxTotalSar,
    totalAmountSar: totals.totalAmountSar,
    totalAmountHalalas: totals.totalAmountHalalas,
    status: 'DRAFT',
    qrCodeBase64,
    invoiceCounterNumber: counter,
    zatcaStatus: payload.invoiceType === 'STANDARD_B2B' ? 'PENDING' : 'REPORTED',
    notes: payload.notes || '',
    createdBy: context.userId,
    createdByName: context.userEmail,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    lines,
  };

  tenantInvoices.unshift(invoice);
  store.salesInvoices.set(context.tenantId, tenantInvoices);

  // If requested to post immediately, execute post logic
  if (payload.postImmediately) {
    return await postSalesInvoiceService(store, context, invoice.id);
  }

  // Audit
  store.recordAuditLog({
    tenantId: context.tenantId,
    userId: context.userId,
    userEmail: context.userEmail,
    action: 'sales:invoice:create_draft',
    resourceType: 'sales_invoice',
    resourceId: invoice.id,
    correlationId: crypto.randomUUID(),
    changesDiff: { invoiceNumber: invoice.invoiceNumber, total: invoice.totalAmountSar },
  });

  return invoice;
}

export async function postSalesInvoiceService(
  store: CentralTenantDataStore,
  context: TenantContext,
  id: string
): Promise<SalesInvoice> {
  const invoices = store.salesInvoices.get(context.tenantId) || [];
  const invoice = invoices.find((i) => i.id === id);
  if (!invoice) {
    throw new Error(`Invoice with ID ${id} not found.`);
  }
  if (invoice.status === 'POSTED') {
    return invoice; // Already posted idempotently
  }
  if (invoice.status === 'CANCELLED') {
    throw new Error('Cannot post a CANCELLED invoice.');
  }

  // Verify stock availability in the selected warehouse
  const stocks = store.warehouseStocks.get(context.tenantId) || [];
  const items = store.items.get(context.tenantId) || [];

  for (const line of invoice.lines) {
    const item = items.find((it) => it.id === line.itemId);
    if (item && item.type === 'INVENTORY') {
      const stock = stocks.find((s) => s.itemId === line.itemId && s.warehouseId === invoice.warehouseId);
      const available = stock ? stock.availableQty : 0;
      if (available < line.baseQuantity) {
        throw new Error(
          `Insufficient stock for item [${line.nameAr}] in warehouse. Available: ${available}, Required: ${line.baseQuantity}.`
        );
      }
    }
  }

  // Deduct inventory stock
  let totalCogsHalalas = 0n;
  for (const line of invoice.lines) {
    const item = items.find((it) => it.id === line.itemId);
    if (item && item.type === 'INVENTORY') {
      const stock = stocks.find((s) => s.itemId === line.itemId && s.warehouseId === invoice.warehouseId);
      if (stock) {
        stock.currentStockBaseQty -= line.baseQuantity;
        stock.availableQty = stock.currentStockBaseQty - stock.reservedQty;
        stock.updatedAt = new Date().toISOString();
      }
      item.currentStock -= line.baseQuantity;
      item.updatedAt = new Date().toISOString();

      const lineCogs = BigInt(Math.round(line.baseQuantity * item.currentWac * 100));
      totalCogsHalalas += lineCogs;
    }
  }

  // Double-Entry GL Posting (Rule G1)
  const accounts = store.accounts.get(context.tenantId) || [];
  const revAccount = accounts.find((a) => a.code === '40101') || accounts.find((a) => a.type === 'REVENUE');
  const vatAccount = accounts.find((a) => a.code === '20301') || accounts.find((a) => a.type === 'LIABILITY');
  const arAccount = invoice.customerSubaccountCode
    ? accounts.find((a) => a.code === invoice.customerSubaccountCode)
    : accounts.find((a) => a.code === '10201');
  const cashAccount = accounts.find((a) => a.code === '10101') || arAccount;

  const debitAccountId = invoice.paymentMethod === 'CREDIT_ACCOUNT'
    ? (arAccount?.id || 'acc-ar-control')
    : (cashAccount?.id || 'acc-cash-vault');

  const grandTotalHalalas = BigInt(invoice.totalAmountHalalas);
  const vatHalalas = BigInt(Math.round(invoice.taxTotalSar * 100));
  const revenueHalalas = grandTotalHalalas - vatHalalas;

  const journalLines: Array<{
    accountId: string;
    debit: string | number;
    credit: string | number;
    description: string;
  }> = [
    {
      accountId: debitAccountId,
      debit: Number(grandTotalHalalas) / 100,
      credit: 0,
      description: `فاتورة مبيعات ${invoice.invoiceNumber} - ${invoice.customerNameAr}`,
    },
    {
      accountId: revAccount?.id || 'acc-sales-revenue',
      debit: 0,
      credit: Number(revenueHalalas) / 100,
      description: `إيراد مبيعات فاتورة ${invoice.invoiceNumber}`,
    },
  ];

  if (vatHalalas > 0n) {
    journalLines.push({
      accountId: vatAccount?.id || 'acc-vat-output',
      debit: 0,
      credit: Number(vatHalalas) / 100,
      description: `ضريبة القيمة المضافة 15% للفاتورة ${invoice.invoiceNumber}`,
    });
  }

  // COGS and Inventory lines if physical stock sold
  if (totalCogsHalalas > 0n) {
    const cogsAccount = accounts.find((a) => a.code === '50101') || accounts.find((a) => a.type === 'COGS');
    const invAccount = accounts.find((a) => a.code === '10401') || accounts.find((a) => a.type === 'ASSET');
    journalLines.push({
      accountId: cogsAccount?.id || 'acc-cogs',
      debit: Number(totalCogsHalalas) / 100,
      credit: 0,
      description: `تكلفة البضاعة المباعة للفاتورة ${invoice.invoiceNumber}`,
    });
    journalLines.push({
      accountId: invAccount?.id || 'acc-inventory-asset',
      debit: 0,
      credit: Number(totalCogsHalalas) / 100,
      description: `صرف مخزون للفاتورة ${invoice.invoiceNumber}`,
    });
  }

  // Post Journal Entry using Scoped Repository
  const repo = new TenantScopedRepository(context);

  const postedJournal = await repo.postJournal({
    companyId: context.tenantId,
    branchId: invoice.branchId,
    sourceType: 'INVOICE',
    sourceId: invoice.id,
    sourceKey: invoice.invoiceNumber,
    date: invoice.issueDate,
    description: `ترحيل فاتورة مبيعات رقم ${invoice.invoiceNumber} - ${invoice.customerNameAr}`,
    descriptionAr: `ترحيل فاتورة مبيعات رقم ${invoice.invoiceNumber} - ${invoice.customerNameAr}`,
    descriptionEn: `Posting Sales Invoice #${invoice.invoiceNumber} - ${invoice.customerNameEn}`,
    reference: invoice.invoiceNumber,
    lines: journalLines,
  });

  // Calculate SHA-256 Invoice Hash for ZATCA Phase 2
  const invoicePayload = JSON.stringify({
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    total: invoice.totalAmountSar,
    vat: invoice.taxTotalSar,
    sellerVat: '300000000000003',
    customerVat: invoice.customerVatNumber,
  });
  const invoiceHash = crypto.createHash('sha256').update(invoicePayload).digest('base64');

  // Update invoice status
  invoice.status = 'POSTED';
  invoice.postedJournalId = postedJournal.id;
  invoice.postedJournalNumber = postedJournal.entryNumber;
  invoice.invoiceHash = invoiceHash;
  invoice.updatedAt = new Date().toISOString();

  // Audit
  store.recordAuditLog({
    tenantId: context.tenantId,
    userId: context.userId,
    userEmail: context.userEmail,
    action: 'sales:invoice:post',
    resourceType: 'sales_invoice',
    resourceId: invoice.id,
    correlationId: crypto.randomUUID(),
    changesDiff: {
      invoiceNumber: invoice.invoiceNumber,
      journalNumber: postedJournal.entryNumber,
      totalAmountSar: invoice.totalAmountSar,
    },
  });

  logger.info(`[SALES] Successfully posted Invoice #${invoice.invoiceNumber} with Journal #${postedJournal.entryNumber}`);
  return invoice;
}

// -------------------------------------------------------------
// 2. CREDIT NOTE SERVICES (REVERSALS / RETURNS)
// -------------------------------------------------------------

export function getSalesCreditNotesService(
  store: CentralTenantDataStore,
  context: TenantContext,
  filters?: { search?: string; originalInvoiceId?: string }
): SalesCreditNote[] {
  const notes = store.salesCreditNotes.get(context.tenantId) || [];
  let list = [...notes];

  if (filters?.originalInvoiceId) {
    list = list.filter((n) => n.originalInvoiceId === filters.originalInvoiceId);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase().trim();
    list = list.filter(
      (n) =>
        n.creditNoteNumber.toLowerCase().includes(q) ||
        n.originalInvoiceNumber.toLowerCase().includes(q) ||
        n.customerNameAr.toLowerCase().includes(q)
    );
  }

  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return list;
}

export async function createSalesCreditNoteService(
  store: CentralTenantDataStore,
  context: TenantContext,
  payload: CreateCreditNotePayload
): Promise<SalesCreditNote> {
  const invoices = store.salesInvoices.get(context.tenantId) || [];
  const origInvoice = invoices.find((i) => i.id === payload.originalInvoiceId);
  if (!origInvoice) {
    throw new Error(`Original invoice ${payload.originalInvoiceId} not found.`);
  }
  if (origInvoice.status !== 'POSTED') {
    throw new Error('Credit notes can only be issued against POSTED invoices.');
  }

  const items = store.items.get(context.tenantId) || [];
  const stocks = store.warehouseStocks.get(context.tenantId) || [];

  // Determine lines to credit
  const creditLines: SalesInvoiceLine[] = [];
  const linesToProcess = payload.lines && payload.lines.length > 0
    ? payload.lines
    : origInvoice.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, unitPriceSar: l.unitPriceSar }));

  let totalCogsReturnHalalas = 0n;

  for (const lineInput of linesToProcess) {
    const origLine = origInvoice.lines.find((l) => l.itemId === lineInput.itemId);
    if (!origLine) continue;

    const item = items.find((it) => it.id === lineInput.itemId);
    const qty = Math.min(origLine.quantity, lineInput.quantity);
    const price = lineInput.unitPriceSar || origLine.unitPriceSar;

    const calc = calculateInvoiceLine({
      quantity: qty,
      unitPriceSar: price,
      discountPercent: 0,
      taxRate: origLine.taxRate,
      conversionFactor: origLine.conversionFactor,
    });

    creditLines.push({
      id: crypto.randomUUID(),
      itemId: origLine.itemId,
      itemCode: origLine.itemCode,
      nameAr: origLine.nameAr,
      nameEn: origLine.nameEn,
      uomId: origLine.uomId,
      uomName: origLine.uomName,
      conversionFactor: origLine.conversionFactor,
      quantity: qty,
      baseQuantity: calc.baseQuantity,
      unitPriceSar: price,
      discountPercent: 0,
      discountAmountSar: 0,
      taxableAmountSar: calc.taxableAmountSar,
      taxRate: origLine.taxRate,
      taxAmountSar: calc.taxAmountSar,
      totalAmountSar: calc.totalAmountSar,
    });

    // Return stock back to warehouse
    if (item && item.type === 'INVENTORY') {
      const stock = stocks.find((s) => s.itemId === item.id && s.warehouseId === origInvoice.warehouseId);
      if (stock) {
        stock.currentStockBaseQty += calc.baseQuantity;
        stock.availableQty = stock.currentStockBaseQty - stock.reservedQty;
        stock.updatedAt = new Date().toISOString();
      }
      item.currentStock += calc.baseQuantity;
      item.updatedAt = new Date().toISOString();

      const lineCogs = BigInt(Math.round(calc.baseQuantity * item.currentWac * 100));
      totalCogsReturnHalalas += lineCogs;
    }
  }

  if (creditLines.length === 0) {
    throw new Error('Credit note must specify at least one valid item to credit.');
  }

  const totals = calculateInvoiceTotals(creditLines);
  const now = new Date();
  const year = now.getFullYear();
  const existingNotes = store.salesCreditNotes.get(context.tenantId) || [];
  const creditNoteNumber = `CN-${year}-${String(existingNotes.length + 1).padStart(5, '0')}`;

  const accounts = store.accounts.get(context.tenantId) || [];
  const returnsAccount = accounts.find((a) => a.code === '40102') || accounts.find((a) => a.type === 'REVENUE');
  const vatAccount = accounts.find((a) => a.code === '20301') || accounts.find((a) => a.type === 'LIABILITY');
  const arAccount = origInvoice.customerSubaccountCode
    ? accounts.find((a) => a.code === origInvoice.customerSubaccountCode)
    : accounts.find((a) => a.code === '10201');

  const grandTotalHalalas = BigInt(totals.totalAmountHalalas);
  const vatHalalas = BigInt(Math.round(totals.taxTotalSar * 100));
  const subtotalHalalas = grandTotalHalalas - vatHalalas;

  const journalLines: Array<{
    accountId: string;
    debit: string | number;
    credit: string | number;
    description: string;
  }> = [
    {
      accountId: returnsAccount?.id || 'acc-sales-returns',
      debit: Number(subtotalHalalas) / 100,
      credit: 0,
      description: `مردودات مبيعات إشعار دائن ${creditNoteNumber} للفاتورة ${origInvoice.invoiceNumber}`,
    },
    {
      accountId: arAccount?.id || 'acc-ar-control',
      debit: 0,
      credit: Number(grandTotalHalalas) / 100,
      description: `تسوية حساب العميل ${origInvoice.customerNameAr} بإشعار دائن ${creditNoteNumber}`,
    },
  ];

  if (vatHalalas > 0n) {
    journalLines.push({
      accountId: vatAccount?.id || 'acc-vat-output',
      debit: Number(vatHalalas) / 100,
      credit: 0,
      description: `عكس ضريبة القيمة المضافة لإشعار دائن ${creditNoteNumber}`,
    });
  }

  if (totalCogsReturnHalalas > 0n) {
    const cogsAccount = accounts.find((a) => a.code === '50101') || accounts.find((a) => a.type === 'COGS');
    const invAccount = accounts.find((a) => a.code === '10401') || accounts.find((a) => a.type === 'ASSET');
    journalLines.push({
      accountId: invAccount?.id || 'acc-inventory-asset',
      debit: Number(totalCogsReturnHalalas) / 100,
      credit: 0,
      description: `إرجاع مخزون بموجب إشعار دائن ${creditNoteNumber}`,
    });
    journalLines.push({
      accountId: cogsAccount?.id || 'acc-cogs',
      debit: 0,
      credit: Number(totalCogsReturnHalalas) / 100,
      description: `عكس تكلفة بضاعة مباعة بإشعار دائن ${creditNoteNumber}`,
    });
  }

  const repo = new TenantScopedRepository(context);

  const postedJournal = await repo.postJournal({
    companyId: context.tenantId,
    branchId: origInvoice.branchId,
    sourceType: 'REVERSAL',
    sourceId: origInvoice.id,
    sourceKey: creditNoteNumber,
    date: now.toISOString().slice(0, 10),
    description: `إشعار دائن رقم ${creditNoteNumber} للفاتورة ${origInvoice.invoiceNumber}`,
    descriptionAr: `إشعار دائن رقم ${creditNoteNumber} للفاتورة ${origInvoice.invoiceNumber}`,
    descriptionEn: `Credit Note #${creditNoteNumber} for Invoice #${origInvoice.invoiceNumber}`,
    reference: creditNoteNumber,
    lines: journalLines,
  });

  const company = store.tenants.get(context.tenantId);
  const qrCodeBase64 = buildZatcaQRForInvoice({
    sellerName: company?.nameAr || 'شركة التقنية المتقدمة المحدودة',
    sellerVatNumber: company?.vatNumber || '300000000000003',
    timestamp: now.toISOString(),
    totalWithVat: totals.totalAmountSar,
    vatTotal: totals.taxTotalSar,
  });

  const creditNote: SalesCreditNote = {
    id: crypto.randomUUID(),
    tenantId: context.tenantId,
    branchId: origInvoice.branchId,
    creditNoteNumber,
    originalInvoiceId: origInvoice.id,
    originalInvoiceNumber: origInvoice.invoiceNumber,
    reasonCode: payload.reasonCode,
    reasonDescription: payload.reasonDescription,
    customerId: origInvoice.customerId,
    customerNameAr: origInvoice.customerNameAr,
    customerNameEn: origInvoice.customerNameEn,
    issueDate: now.toISOString().slice(0, 10),
    status: 'POSTED',
    postedJournalId: postedJournal.id,
    postedJournalNumber: postedJournal.entryNumber,
    subtotalSar: totals.subtotalSar,
    taxTotalSar: totals.taxTotalSar,
    totalAmountSar: totals.totalAmountSar,
    qrCodeBase64,
    notes: payload.notes,
    createdBy: context.userId,
    createdAt: now.toISOString(),
    lines: creditLines,
  };

  existingNotes.unshift(creditNote);
  store.salesCreditNotes.set(context.tenantId, existingNotes);

  store.recordAuditLog({
    tenantId: context.tenantId,
    userId: context.userId,
    userEmail: context.userEmail,
    action: 'sales:credit_note:create',
    resourceType: 'sales_credit_note',
    resourceId: creditNote.id,
    correlationId: crypto.randomUUID(),
    changesDiff: {
      creditNoteNumber,
      originalInvoiceNumber: origInvoice.invoiceNumber,
      totalAmountSar: totals.totalAmountSar,
      journalNumber: postedJournal.entryNumber,
    },
  });

  return creditNote;
}

// -------------------------------------------------------------
// 3. QUOTATIONS SERVICES
// -------------------------------------------------------------

export function getSalesQuotationsService(
  store: CentralTenantDataStore,
  context: TenantContext,
  filters?: { search?: string; status?: string }
): SalesQuotation[] {
  const quotations = store.salesQuotations.get(context.tenantId) || [];
  let list = [...quotations];

  if (filters?.status) {
    list = list.filter((q) => q.status === filters.status);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase().trim();
    list = list.filter(
      (qt) =>
        qt.quotationNumber.toLowerCase().includes(q) ||
        qt.customerNameAr.toLowerCase().includes(q) ||
        qt.customerNameEn.toLowerCase().includes(q)
    );
  }

  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return list;
}

export function createSalesQuotationService(
  store: CentralTenantDataStore,
  context: TenantContext,
  payload: CreateQuotationPayload
): SalesQuotation {
  const customers = store.customers.get(context.tenantId) || [];
  const customer = customers.find((c) => c.id === payload.customerId);
  if (!customer) {
    throw new Error(`Customer ${payload.customerId} not found.`);
  }

  const items = store.items.get(context.tenantId) || [];
  const lines: SalesInvoiceLine[] = [];

  for (const l of payload.lines) {
    const item = items.find((it) => it.id === l.itemId);
    if (!item) continue;

    const uom = l.uomId ? item.units.find((u) => u.id === l.uomId) : item.units[0];
    const conversionFactor = uom?.conversionFactor || 1;

    const calc = calculateInvoiceLine({
      quantity: l.quantity,
      unitPriceSar: l.unitPriceSar,
      discountPercent: l.discountPercent || 0,
      taxRate: item.taxRate,
      conversionFactor,
    });

    lines.push({
      id: crypto.randomUUID(),
      itemId: item.id,
      itemCode: item.sku,
      nameAr: item.nameAr,
      nameEn: item.nameEn,
      uomId: uom?.id || 'unit-base',
      uomName: uom?.nameAr || item.baseUnit,
      conversionFactor,
      quantity: l.quantity,
      baseQuantity: calc.baseQuantity,
      unitPriceSar: l.unitPriceSar,
      discountPercent: l.discountPercent || 0,
      discountAmountSar: calc.discountAmountSar,
      taxableAmountSar: calc.taxableAmountSar,
      taxRate: item.taxRate,
      taxAmountSar: calc.taxAmountSar,
      totalAmountSar: calc.totalAmountSar,
    });
  }

  const totals = calculateInvoiceTotals(lines);
  const now = new Date();
  const year = now.getFullYear();
  const quotes = store.salesQuotations.get(context.tenantId) || [];
  const quotationNumber = `QT-${year}-${String(quotes.length + 1).padStart(5, '0')}`;

  const quotation: SalesQuotation = {
    id: crypto.randomUUID(),
    tenantId: context.tenantId,
    branchId: payload.branchId || 'branch-default',
    quotationNumber,
    customerId: customer.id,
    customerNameAr: customer.nameAr,
    customerNameEn: customer.nameEn,
    issueDate: payload.issueDate || now.toISOString().slice(0, 10),
    expiryDate: payload.expiryDate || new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10),
    status: 'DRAFT',
    subtotalSar: totals.subtotalSar,
    discountTotalSar: totals.discountTotalSar,
    taxTotalSar: totals.taxTotalSar,
    totalAmountSar: totals.totalAmountSar,
    notes: payload.notes,
    createdBy: context.userId,
    createdAt: now.toISOString(),
    lines,
  };

  quotes.unshift(quotation);
  store.salesQuotations.set(context.tenantId, quotes);
  return quotation;
}

export async function convertQuotationToInvoiceService(
  store: CentralTenantDataStore,
  context: TenantContext,
  quotationId: string
): Promise<SalesInvoice> {
  const quotations = store.salesQuotations.get(context.tenantId) || [];
  const quote = quotations.find((q) => q.id === quotationId);
  if (!quote) {
    throw new Error(`Quotation with ID ${quotationId} not found.`);
  }
  if (quote.status === 'CONVERTED') {
    throw new Error(`Quotation #${quote.quotationNumber} has already been converted.`);
  }

  const invoice = await createSalesInvoiceService(store, context, {
    branchId: quote.branchId,
    invoiceType: 'STANDARD_B2B',
    customerId: quote.customerId,
    paymentMethod: 'CREDIT_ACCOUNT',
    notes: `تم التحويل تلقائياً من عرض السعر رقم ${quote.quotationNumber}`,
    postImmediately: false,
    lines: quote.lines.map((l) => ({
      itemId: l.itemId,
      uomId: l.uomId,
      quantity: l.quantity,
      unitPriceSar: l.unitPriceSar,
      discountPercent: l.discountPercent,
      taxRate: l.taxRate,
    })),
  });

  quote.status = 'CONVERTED';
  quote.convertedInvoiceId = invoice.id;
  quote.convertedInvoiceNumber = invoice.invoiceNumber;

  store.recordAuditLog({
    tenantId: context.tenantId,
    userId: context.userId,
    userEmail: context.userEmail,
    action: 'sales:quotation:convert_to_invoice',
    resourceType: 'sales_quotation',
    resourceId: quote.id,
    correlationId: crypto.randomUUID(),
    changesDiff: { quotationNumber: quote.quotationNumber, invoiceNumber: invoice.invoiceNumber },
  });

  return invoice;
}

// -------------------------------------------------------------
// 4. SEED SALES MASTER DATA
// -------------------------------------------------------------

export function seedDefaultSales(
  store: CentralTenantDataStore,
  tenantId: string,
  adminId: string
): void {
  const customers = store.customers.get(tenantId) || [];
  const items = store.items.get(tenantId) || [];
  const branches = store.branches.get(tenantId) || [];
  const warehouses = store.warehouses.get(tenantId) || [];

  if (customers.length === 0 || items.length === 0) return;

  const defaultBranch = branches[0];
  const defaultWarehouse = warehouses[0];
  const custJarir = customers[0]; // B2B
  const custIndividual = customers[1] || customers[0]; // B2C
  const itemWater = items[0];
  const itemPaper = items[1] || items[0];

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const seededInvoices: SalesInvoice[] = [];
  const seededQuotations: SalesQuotation[] = [];

  // 1. Seed B2B Standard Invoice (Posted with GL and ZATCA QR)
  const line1Calc = calculateInvoiceLine({
    quantity: 10,
    unitPriceSar: itemWater.wholesalePrice || 15.0,
    discountPercent: 0,
    taxRate: 15,
    conversionFactor: 1,
  });

  const line2Calc = calculateInvoiceLine({
    quantity: 5,
    unitPriceSar: itemPaper.wholesalePrice || 24.0,
    discountPercent: 5,
    taxRate: 15,
    conversionFactor: 1,
  });

  const b2bTotals = calculateInvoiceTotals([line1Calc, line2Calc]);
  const b2bQr = buildZatcaQRForInvoice({
    sellerName: 'شركة التقنية المتقدمة المحدودة',
    sellerVatNumber: '300000000000003',
    timestamp: `${todayStr}T10:30:00Z`,
    totalWithVat: b2bTotals.totalAmountSar,
    vatTotal: b2bTotals.taxTotalSar,
  });

  const invB2B: SalesInvoice = {
    id: crypto.randomUUID(),
    tenantId,
    branchId: defaultBranch?.id || 'branch-default',
    branchNameAr: defaultBranch?.nameAr || 'الفرع الرئيسي',
    warehouseId: defaultWarehouse?.id || 'wh-default',
    warehouseNameAr: defaultWarehouse?.nameAr || 'المستودع الرئيسي',
    invoiceNumber: `INV-${now.getFullYear()}-00001`,
    invoiceType: 'STANDARD_B2B',
    issueDate: todayStr,
    issueTime: '10:30:00',
    dueDate: todayStr,
    customerId: custJarir.id,
    customerNameAr: custJarir.nameAr,
    customerNameEn: custJarir.nameEn,
    customerVatNumber: custJarir.vatNumber,
    customerCrNumber: custJarir.crNumber,
    customerAddress: custJarir.address?.formattedAddress || 'الرياض، المملكة العربية السعودية',
    customerSubaccountCode: custJarir.subaccountCode,
    paymentMethod: 'CREDIT_ACCOUNT',
    subtotalSar: b2bTotals.subtotalSar,
    discountTotalSar: b2bTotals.discountTotalSar,
    taxTotalSar: b2bTotals.taxTotalSar,
    totalAmountSar: b2bTotals.totalAmountSar,
    totalAmountHalalas: b2bTotals.totalAmountHalalas,
    status: 'POSTED',
    postedJournalId: 'jv-seed-sales-1',
    postedJournalNumber: `JV-${now.getFullYear()}-00005`,
    qrCodeBase64: b2bQr,
    invoiceCounterNumber: 1,
    zatcaStatus: 'CLEARED',
    notes: 'توريد دفعة دورية وفق العقد السنوي المعتمد.',
    createdBy: adminId,
    createdByName: 'admin@erp.sa',
    createdAt: `${todayStr}T10:30:00.000Z`,
    updatedAt: `${todayStr}T10:30:00.000Z`,
    lines: [
      {
        id: crypto.randomUUID(),
        itemId: itemWater.id,
        itemCode: itemWater.sku,
        nameAr: itemWater.nameAr,
        nameEn: itemWater.nameEn,
        uomId: itemWater.units[0]?.id || 'unit-base',
        uomName: itemWater.units[0]?.nameAr || 'كرتون',
        conversionFactor: 1,
        quantity: 10,
        baseQuantity: 10,
        unitPriceSar: itemWater.wholesalePrice || 15.0,
        discountPercent: 0,
        discountAmountSar: 0,
        taxableAmountSar: line1Calc.taxableAmountSar,
        taxRate: 15,
        taxAmountSar: line1Calc.taxAmountSar,
        totalAmountSar: line1Calc.totalAmountSar,
        costPriceSar: itemWater.currentWac,
      },
      {
        id: crypto.randomUUID(),
        itemId: itemPaper.id,
        itemCode: itemPaper.sku,
        nameAr: itemPaper.nameAr,
        nameEn: itemPaper.nameEn,
        uomId: itemPaper.units[0]?.id || 'unit-base',
        uomName: itemPaper.units[0]?.nameAr || 'رزمة',
        conversionFactor: 1,
        quantity: 5,
        baseQuantity: 5,
        unitPriceSar: itemPaper.wholesalePrice || 24.0,
        discountPercent: 5,
        discountAmountSar: line2Calc.discountAmountSar,
        taxableAmountSar: line2Calc.taxableAmountSar,
        taxRate: 15,
        taxAmountSar: line2Calc.taxAmountSar,
        totalAmountSar: line2Calc.totalAmountSar,
        costPriceSar: itemPaper.currentWac,
      },
    ],
  };
  seededInvoices.push(invB2B);

  // 2. Seed B2C Simplified Invoice (Immediate Cash Sale with ZATCA QR)
  const b2cLineCalc = calculateInvoiceLine({
    quantity: 2,
    unitPriceSar: itemWater.sellingPrice || 18.5,
    discountPercent: 0,
    taxRate: 15,
    conversionFactor: 1,
  });
  const b2cTotals = calculateInvoiceTotals([b2cLineCalc]);
  const b2cQr = buildZatcaQRForInvoice({
    sellerName: 'شركة التقنية المتقدمة المحدودة',
    sellerVatNumber: '300000000000003',
    timestamp: `${todayStr}T14:15:00Z`,
    totalWithVat: b2cTotals.totalAmountSar,
    vatTotal: b2cTotals.taxTotalSar,
  });

  const invB2C: SalesInvoice = {
    id: crypto.randomUUID(),
    tenantId,
    branchId: defaultBranch?.id || 'branch-default',
    branchNameAr: defaultBranch?.nameAr || 'الفرع الرئيسي',
    warehouseId: defaultWarehouse?.id || 'wh-default',
    warehouseNameAr: defaultWarehouse?.nameAr || 'المستودع الرئيسي',
    invoiceNumber: `SIMP-${now.getFullYear()}-00001`,
    invoiceType: 'SIMPLIFIED_B2C',
    issueDate: todayStr,
    issueTime: '14:15:00',
    dueDate: todayStr,
    customerId: custIndividual.id,
    customerNameAr: custIndividual.nameAr,
    customerNameEn: custIndividual.nameEn,
    customerAddress: 'الرياض',
    customerSubaccountCode: custIndividual.subaccountCode,
    paymentMethod: 'MADA',
    subtotalSar: b2cTotals.subtotalSar,
    discountTotalSar: 0,
    taxTotalSar: b2cTotals.taxTotalSar,
    totalAmountSar: b2cTotals.totalAmountSar,
    totalAmountHalalas: b2cTotals.totalAmountHalalas,
    status: 'POSTED',
    postedJournalId: 'jv-seed-sales-2',
    postedJournalNumber: `JV-${now.getFullYear()}-00006`,
    qrCodeBase64: b2cQr,
    invoiceCounterNumber: 2,
    zatcaStatus: 'REPORTED',
    notes: 'بيع نقدي مباشر بنقطة البيع عبر مدى.',
    createdBy: adminId,
    createdByName: 'cashier@erp.sa',
    createdAt: `${todayStr}T14:15:00.000Z`,
    updatedAt: `${todayStr}T14:15:00.000Z`,
    lines: [
      {
        id: crypto.randomUUID(),
        itemId: itemWater.id,
        itemCode: itemWater.sku,
        nameAr: itemWater.nameAr,
        nameEn: itemWater.nameEn,
        uomId: itemWater.units[0]?.id || 'unit-base',
        uomName: itemWater.units[0]?.nameAr || 'كرتون',
        conversionFactor: 1,
        quantity: 2,
        baseQuantity: 2,
        unitPriceSar: itemWater.sellingPrice || 18.5,
        discountPercent: 0,
        discountAmountSar: 0,
        taxableAmountSar: b2cLineCalc.taxableAmountSar,
        taxRate: 15,
        taxAmountSar: b2cLineCalc.taxAmountSar,
        totalAmountSar: b2cLineCalc.totalAmountSar,
        costPriceSar: itemWater.currentWac,
      },
    ],
  };
  seededInvoices.push(invB2C);

  // 3. Seed Sample Quotation
  const quoteLine = calculateInvoiceLine({
    quantity: 50,
    unitPriceSar: 14.0,
    discountPercent: 10,
    taxRate: 15,
    conversionFactor: 1,
  });
  const quoteTotals = calculateInvoiceTotals([quoteLine]);

  const quotation: SalesQuotation = {
    id: crypto.randomUUID(),
    tenantId,
    branchId: defaultBranch?.id || 'branch-default',
    quotationNumber: `QT-${now.getFullYear()}-00001`,
    customerId: custJarir.id,
    customerNameAr: custJarir.nameAr,
    customerNameEn: custJarir.nameEn,
    issueDate: todayStr,
    expiryDate: new Date(now.getTime() + 15 * 86400000).toISOString().slice(0, 10),
    status: 'SENT',
    subtotalSar: quoteTotals.subtotalSar,
    discountTotalSar: quoteTotals.discountTotalSar,
    taxTotalSar: quoteTotals.taxTotalSar,
    totalAmountSar: quoteTotals.totalAmountSar,
    notes: 'عرض سعر خاص للكميات الكبيرة ساري لمدة 15 يوماً.',
    createdBy: adminId,
    createdAt: `${todayStr}T09:00:00.000Z`,
    lines: [
      {
        id: crypto.randomUUID(),
        itemId: itemWater.id,
        itemCode: itemWater.sku,
        nameAr: itemWater.nameAr,
        nameEn: itemWater.nameEn,
        uomId: itemWater.units[0]?.id || 'unit-base',
        uomName: itemWater.units[0]?.nameAr || 'كرتون',
        conversionFactor: 1,
        quantity: 50,
        baseQuantity: 50,
        unitPriceSar: 14.0,
        discountPercent: 10,
        discountAmountSar: quoteLine.discountAmountSar,
        taxableAmountSar: quoteLine.taxableAmountSar,
        taxRate: 15,
        taxAmountSar: quoteLine.taxAmountSar,
        totalAmountSar: quoteLine.totalAmountSar,
      },
    ],
  };
  seededQuotations.push(quotation);

  store.salesInvoices.set(tenantId, seededInvoices);
  store.salesQuotations.set(tenantId, seededQuotations);
  store.salesCreditNotes.set(tenantId, []);
}

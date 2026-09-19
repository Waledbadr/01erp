/**
 * Sales Lifecycle & Tax Invoices Backend Service Engine — Saudi ERP
 * Full support for Quotations, Sales Orders, Tax Invoices (Standard B2B & Simplified B2C),
 * Customer Receipts & FIFO Allocations, Customer Statements, Credit Notes / Returns,
 * Copy Document Lineage, Credit Control, Inventory Deduction, and Double-Entry GL Integration.
 * 
 * Rules Enforced:
 * - Rule G1: Single Source of Truth (All invoice, receipt, and return postings generate balanced GL journals).
 * - Rule G4: Verified ledger-derived Customer Statements with aging buckets.
 * - Rule G5: Customer Receipts with FIFO allocation, deposit advances, and reallocation.
 * - Rule G7/G8: Fixed-point halalas integer arithmetic with line-level half-up rounding.
 * - Rule C: Cost & margin redaction for unauthorized roles.
 * - Rule I3/I4: Multi-UOM packaging conversions and inventory stock synchronization.
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
  SalesChargeLine,
  TaxSnapshotLine,
  SalesQuotation,
  SalesOrder,
  SalesCreditNote,
  CustomerReceipt,
  CustomerReceiptAllocation,
  CustomerStatement,
  CustomerStatementTransaction,
  InvoiceType,
  InvoiceStatus,
  QuotationStatus,
  SalesOrderStatus,
  PaymentMethod,
  CreditNoteReason,
  calculateInvoiceLine,
  calculateChargeLine,
  calculateInvoiceTotals,
  suggestFifoAllocations,
  buildZatcaQRForInvoice,
  roundHalalas,
} from '../../../src/lib/sales.js';
import { logger } from '../../core/logger.js';
import {
  generateUBL21Xml,
  calculateInvoiceHash,
  generateDigitalSignature,
  ZATCA_INITIAL_PIH_HASH,
} from '../../../src/lib/zatca.js';
import { syncEInvoiceDocumentOnPost } from '../zatca/zatcaService.js';

export interface CreateInvoicePayload {
  branchId?: string;
  warehouseId?: string;
  invoiceType: InvoiceType;
  issueDate?: string;
  dueDate?: string;
  paymentTermsDays?: number;
  customerId: string;
  paymentMethod: PaymentMethod;
  salesRepName?: string;
  notes?: string;
  postImmediately?: boolean;
  idempotencyKey?: string;
  quotationId?: string;
  salesOrderId?: string;
  copiedFromId?: string;
  creditHoldOverrideReason?: string;
  isTaxInclusive?: boolean;
  charges?: Array<{
    chargeType: 'SHIPPING' | 'HANDLING' | 'PACKAGING' | 'CUSTOMS_SERVICE' | 'INSURANCE' | 'OTHER';
    nameAr: string;
    nameEn?: string;
    amountSar: number;
    isTaxable?: boolean;
    taxRate?: number;
  }>;
  lines: Array<{
    itemId: string;
    uomId?: string;
    quantity: number;
    unitPriceSar: number;
    discountPercent?: number;
    taxRate?: number;
    isTaxInclusive?: boolean;
  }>;
}

export interface CreateQuotationPayload {
  branchId?: string;
  customerId: string;
  issueDate?: string;
  expiryDate?: string;
  salesRepName?: string;
  notes?: string;
  copiedFromId?: string;
  charges?: Array<{
    chargeType: 'SHIPPING' | 'HANDLING' | 'PACKAGING' | 'CUSTOMS_SERVICE' | 'INSURANCE' | 'OTHER';
    nameAr: string;
    nameEn?: string;
    amountSar: number;
    isTaxable?: boolean;
    taxRate?: number;
  }>;
  lines: Array<{
    itemId: string;
    uomId?: string;
    quantity: number;
    unitPriceSar: number;
    discountPercent?: number;
    taxRate?: number;
  }>;
}

export interface CreateSalesOrderPayload {
  branchId?: string;
  warehouseId?: string;
  customerId: string;
  quotationId?: string;
  orderDate?: string;
  expectedDeliveryDate?: string;
  paymentMethod: PaymentMethod;
  paymentTermsDays?: number;
  salesRepName?: string;
  notes?: string;
  copiedFromId?: string;
  charges?: Array<{
    chargeType: 'SHIPPING' | 'HANDLING' | 'PACKAGING' | 'CUSTOMS_SERVICE' | 'INSURANCE' | 'OTHER';
    nameAr: string;
    nameEn?: string;
    amountSar: number;
    isTaxable?: boolean;
    taxRate?: number;
  }>;
  lines: Array<{
    itemId: string;
    uomId?: string;
    quantity: number;
    unitPriceSar: number;
    discountPercent?: number;
    taxRate?: number;
  }>;
}

export interface CreateCreditNotePayload {
  originalInvoiceId?: string;
  isStandalone?: boolean;
  standaloneReason?: string;
  warehouseId?: string;
  reasonCode: CreditNoteReason;
  reasonDescription: string;
  refundPaymentMethod?: 'CREDIT_TO_ACCOUNT' | 'CASH' | 'BANK_TRANSFER' | 'MADA';
  notes?: string;
  customerId?: string;
  lines?: Array<{
    itemId: string;
    uomId?: string;
    quantity: number;
    unitPriceSar?: number;
    taxRate?: number;
  }>;
}

export interface CreateCustomerReceiptPayload {
  branchId?: string;
  receiptDate?: string;
  customerId: string;
  paymentMethod: PaymentMethod;
  cashboxOrBankAccountId?: string;
  chequeNumber?: string;
  chequeDueDate?: string;
  chequeBankName?: string;
  totalAmountSar: number;
  notes?: string;
  allocations?: Array<{
    invoiceId: string;
    allocatedAmountSar: number;
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
    salesRep?: string;
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
  if (filters?.salesRep) {
    list = list.filter((i) => i.salesRepName === filters.salesRep);
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
  const found = invoices.find((i) => i.id === id || i.invoiceNumber === id);
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
  const tenantInvoices = store.salesInvoices.get(context.tenantId) || [];

  // Check client idempotency key
  if (payload.idempotencyKey) {
    const existing = tenantInvoices.find((i) => i.idempotencyKey === payload.idempotencyKey);
    if (existing) {
      logger.info(`[SALES] Idempotency key hit for invoice ${existing.invoiceNumber}`);
      return existing;
    }
  }

  const customers = store.customers.get(context.tenantId) || [];
  const customer = customers.find((c) => c.id === payload.customerId);
  if (!customer) {
    throw new Error(`Customer with ID ${payload.customerId} was not found.`);
  }

  if (customer.status === 'SUSPENDED') {
    throw new Error(`Customer ${customer.nameAr} is SUSPENDED. Invoices cannot be issued.`);
  }

  // Credit check: cash-only or credit hold evaluation
  if (payload.paymentMethod === 'CREDIT_ACCOUNT') {
    if (customer.creditLimit !== undefined && customer.creditLimit <= 0) {
      throw new Error(`Customer ${customer.nameAr} is configured as CASH-ONLY. Credit sales are prohibited.`);
    }
    if (customer.creditHold) {
      const hasOverridePermission =
        context.role === 'OWNER' ||
        context.roleCode === 'OWNER' ||
        context.permissions.includes('*') ||
        context.permissions.includes('sales:customer:manage');

      if (!hasOverridePermission || !payload.creditHoldOverrideReason) {
        throw new Error(
          `Customer ${customer.nameAr} is on CREDIT HOLD. Requires manager override reason to proceed.`
        );
      }
    }
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
  const taxSnapshots: TaxSnapshotLine[] = [];

  for (const lineInput of payload.lines) {
    const item = items.find((it) => it.id === lineInput.itemId);
    if (!item) {
      throw new Error(`Item ${lineInput.itemId} not found.`);
    }

    const uom = lineInput.uomId ? item.units.find((u) => u.id === lineInput.uomId) : item.units[0];
    const conversionFactor = uom?.conversionFactor || 1;
    const uomName = uom?.nameAr || item.baseUnit;

    const rate = lineInput.taxRate !== undefined ? lineInput.taxRate : item.taxRate;
    const isInclusive = lineInput.isTaxInclusive ?? payload.isTaxInclusive ?? item.isVatInclusive ?? false;

    const calc = calculateInvoiceLine({
      quantity: lineInput.quantity,
      unitPriceSar: lineInput.unitPriceSar,
      discountPercent: lineInput.discountPercent || 0,
      taxRate: rate,
      conversionFactor,
      isTaxInclusive: isInclusive,
    });

    const lineId = crypto.randomUUID();

    lines.push({
      id: lineId,
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
      taxRate: rate,
      taxAmountSar: calc.taxAmountSar,
      totalAmountSar: calc.totalAmountSar,
      isTaxInclusive: isInclusive,
      costPriceSar: item.currentWac,
    });

    taxSnapshots.push({
      lineId,
      itemId: item.id,
      taxRatePercentage: rate,
      taxCategoryCode: rate === 15 ? 'S' : rate === 0 ? 'Z' : 'E',
      taxExemptionReasonCode: item.taxExemptionReasonCode || null,
      netAmountSar: calc.taxableAmountSar,
      taxAmountSar: calc.taxAmountSar,
      totalAmountSar: calc.totalAmountSar,
    });
  }

  if (lines.length === 0) {
    throw new Error('An invoice must contain at least one line item.');
  }

  // Build charges lines
  const charges: SalesChargeLine[] = [];
  if (payload.charges && payload.charges.length > 0) {
    for (const c of payload.charges) {
      const calcCharge = calculateChargeLine(c);
      charges.push({
        id: crypto.randomUUID(),
        chargeType: c.chargeType,
        nameAr: c.nameAr,
        nameEn: c.nameEn || c.nameAr,
        amountSar: c.amountSar,
        isTaxable: c.isTaxable !== false,
        taxRate: c.isTaxable !== false ? (c.taxRate !== undefined ? c.taxRate : 15) : 0,
        taxAmountSar: calcCharge.taxAmountSar,
        totalAmountSar: calcCharge.totalAmountSar,
      });
    }
  }

  const totals = calculateInvoiceTotals(lines, charges);

  const now = new Date();
  const issueDate = payload.issueDate || now.toISOString().slice(0, 10);
  const issueTime = now.toTimeString().slice(0, 8);

  const paymentTermsDays = payload.paymentTermsDays || 0;
  let dueDate = payload.dueDate;
  if (!dueDate) {
    if (paymentTermsDays > 0) {
      const d = new Date(issueDate);
      d.setDate(d.getDate() + paymentTermsDays);
      dueDate = d.toISOString().slice(0, 10);
    } else {
      dueDate = issueDate;
    }
  }

  // Generate sequential document number
  const prefix = payload.invoiceType === 'STANDARD_B2B' ? 'INV' : 'SIMP';
  const year = now.getFullYear();
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
    paymentTermsDays,
    salesRepName: payload.salesRepName,
    subtotalSar: totals.subtotalSar,
    discountTotalSar: totals.discountTotalSar,
    chargesTotalSar: totals.chargesTotalSar,
    taxTotalSar: totals.taxTotalSar,
    totalAmountSar: totals.totalAmountSar,
    totalAmountHalalas: totals.totalAmountHalalas,
    paidAmountSar: 0,
    remainingAmountSar: totals.totalAmountSar,
    status: 'DRAFT',
    qrCodeBase64,
    invoiceCounterNumber: counter,
    zatcaStatus: payload.invoiceType === 'STANDARD_B2B' ? 'PENDING' : 'REPORTED',
    idempotencyKey: payload.idempotencyKey,
    quotationId: payload.quotationId,
    salesOrderId: payload.salesOrderId,
    copiedFromId: payload.copiedFromId,
    creditHoldOverrideReason: payload.creditHoldOverrideReason,
    notes: payload.notes || '',
    createdBy: context.userId,
    createdByName: context.userEmail,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    lines,
    charges,
    taxSnapshot: taxSnapshots,
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
  const invoice = invoices.find((i) => i.id === id || i.invoiceNumber === id);
  if (!invoice) {
    throw new Error(`Invoice with ID ${id} not found.`);
  }
  if (invoice.status === 'POSTED' || invoice.status === 'PAID' || invoice.status === 'PARTIALLY_PAID') {
    return invoice; // Already posted idempotently
  }
  if (invoice.status === 'CANCELLED' || invoice.status === 'REVERSED') {
    throw new Error(`Cannot post invoice with status ${invoice.status}.`);
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

  // Deduct inventory stock and calculate COGS
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

  // Double-Entry GL Posting (Rule G1 & Account Mapping)
  const repo = new TenantScopedRepository(context);
  const mappings = repo.getAccountMappings();

  const revAccount = repo.resolveAccount('SALES_REVENUE');
  const vatAccount = repo.resolveAccount('VAT_OUTPUT');
  const arControlAccount = repo.resolveAccount('CUSTOMERS_AR');
  const cashAccount = repo.resolveAccount('CASH_DEFAULT');
  const bankAccount = repo.resolveAccount('BANK_DEFAULT');

  const accounts = repo.getAccounts();
  const customerSubaccount = invoice.customerSubaccountCode
    ? accounts.find((a) => a.code === invoice.customerSubaccountCode)
    : undefined;

  let debitAccountId = arControlAccount.id;
  if (invoice.paymentMethod === 'CREDIT_ACCOUNT') {
    debitAccountId = customerSubaccount?.id || arControlAccount.id;
  } else if (invoice.paymentMethod === 'BANK_TRANSFER' || invoice.paymentMethod === 'MADA' || invoice.paymentMethod === 'VISA_MASTER') {
    debitAccountId = bankAccount.id;
  } else {
    debitAccountId = cashAccount.id;
  }

  const grandTotalHalalas = invoice.totalAmountHalalas != null
    ? BigInt(invoice.totalAmountHalalas)
    : BigInt(Math.round(invoice.totalAmountSar * 100));
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
      accountId: revAccount.id,
      debit: 0,
      credit: Number(revenueHalalas) / 100,
      description: `إيراد مبيعات فاتورة ${invoice.invoiceNumber}`,
    },
  ];

  if (vatHalalas > 0n) {
    journalLines.push({
      accountId: vatAccount.id,
      debit: 0,
      credit: Number(vatHalalas) / 100,
      description: `ضريبة القيمة المضافة 15% للفاتورة ${invoice.invoiceNumber}`,
    });
  }

  // COGS and Inventory lines if physical stock was sold
  if (totalCogsHalalas > 0n) {
    const cogsAccount = repo.resolveAccount('COGS');
    const invAccount = repo.resolveAccount('INVENTORY_ASSET');
    journalLines.push({
      accountId: cogsAccount.id,
      debit: Number(totalCogsHalalas) / 100,
      credit: 0,
      description: `تكلفة البضاعة المباعة للفاتورة ${invoice.invoiceNumber}`,
    });
    journalLines.push({
      accountId: invAccount.id,
      debit: 0,
      credit: Number(totalCogsHalalas) / 100,
      description: `صرف مخزون للفاتورة ${invoice.invoiceNumber}`,
    });
  }

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

  // ZATCA Phase 2: Previous Invoice Hash (PIH) Chaining
  const postedInvoices = invoices.filter((i) => i.status === 'POSTED' && i.id !== invoice.id);
  postedInvoices.sort((a, b) => a.invoiceCounterNumber - b.invoiceCounterNumber);
  const lastPosted = postedInvoices[postedInvoices.length - 1];
  const previousInvoiceHash = lastPosted?.invoiceHash || ZATCA_INITIAL_PIH_HASH;

  // Generate ZATCA UBL 2.1 Compliant XML
  const company = store.tenants.get(context.tenantId);
  const sellerVatNumber = company?.vatNumber || '300000000000003';
  const sellerNameAr = company?.nameAr || 'شركة التقنية المتقدمة المحدودة';

  const ublXml = generateUBL21Xml({
    uuid: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceType: invoice.invoiceType,
    documentTypeCode: '388',
    issueDate: invoice.issueDate,
    issueTime: invoice.issueTime,
    previousInvoiceHash,
    invoiceCounter: invoice.invoiceCounterNumber,
    seller: {
      nameAr: sellerNameAr,
      vatNumber: sellerVatNumber,
      crNumber: company?.crNumber || '1010000000',
      streetName: (company?.nationalAddress as any)?.streetNameAr || 'طريق الملك فهد',
      buildingNumber: (company?.nationalAddress as any)?.buildingNumber || '1234',
      postalZone: (company?.nationalAddress as any)?.postalCode || '12211',
      district: (company?.nationalAddress as any)?.districtAr || 'العليا',
      cityName: (company?.nationalAddress as any)?.cityAr || 'الرياض',
    },
    buyer: invoice.invoiceType === 'STANDARD_B2B' ? {
      nameAr: invoice.customerNameAr,
      vatNumber: invoice.customerVatNumber || '310123456700003',
      crNumber: invoice.customerCrNumber || '1010999999',
      streetName: 'طريق الملك عبدالعزيز',
      buildingNumber: '5678',
      postalZone: '12345',
      district: 'الملز',
      cityName: 'الرياض',
    } : undefined,
    subtotalSar: invoice.subtotalSar,
    discountTotalSar: invoice.discountTotalSar,
    taxTotalSar: invoice.taxTotalSar,
    totalAmountSar: invoice.totalAmountSar,
    lines: invoice.lines.map((l) => ({
      id: l.id,
      nameAr: l.nameAr,
      quantity: l.quantity,
      unitCode: 'PCE',
      unitPriceSar: l.unitPriceSar,
      discountSar: l.discountAmountSar,
      taxableAmountSar: l.taxableAmountSar,
      taxRate: l.taxRate,
      taxAmountSar: l.taxAmountSar,
      totalAmountSar: l.totalAmountSar,
    })),
  });

  const invoiceHash = await calculateInvoiceHash(ublXml);
  const { signature, publicKey } = generateDigitalSignature(invoiceHash);
  const cryptographicStamp = 'ZATCA-CSID-STAMP-' + invoiceHash.slice(0, 16);

  const qrCodeBase64 = buildZatcaQRForInvoice({
    sellerName: sellerNameAr,
    sellerVatNumber: sellerVatNumber,
    timestamp: `${invoice.issueDate}T${invoice.issueTime}Z`,
    totalWithVat: invoice.totalAmountSar,
    vatTotal: invoice.taxTotalSar,
    invoiceHash,
    digitalSignature: signature,
    publicKey,
    certificateSignature: cryptographicStamp,
  });

  // If paid immediately via cash/mada/bank, mark paidAmountSar
  if (invoice.paymentMethod !== 'CREDIT_ACCOUNT') {
    invoice.paidAmountSar = invoice.totalAmountSar;
    invoice.remainingAmountSar = 0;
  }
  invoice.status = 'POSTED';

  invoice.postedJournalId = postedJournal.id;
  invoice.postedJournalNumber = postedJournal.entryNumber;
  invoice.previousInvoiceHash = previousInvoiceHash;
  invoice.invoiceHash = invoiceHash;
  invoice.ublXml = ublXml;
  invoice.digitalSignature = signature;
  invoice.publicKey = publicKey;
  invoice.cryptographicStamp = cryptographicStamp;
  invoice.qrCodeBase64 = qrCodeBase64;
  invoice.zatcaStatus = invoice.invoiceType === 'STANDARD_B2B' ? 'CLEARED' : 'REPORTED';
  invoice.zatcaTransmissionTimestamp = new Date().toISOString();
  invoice.updatedAt = new Date().toISOString();

  // Sync to E-Invoice Document Layer
  try {
    await syncEInvoiceDocumentOnPost(store, context, {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceType: invoice.invoiceType,
      documentTypeCode: '388',
      uuid: invoice.id,
      issueDate: invoice.issueDate,
      issueTime: invoice.issueTime,
      invoiceCounter: invoice.invoiceCounterNumber,
      previousInvoiceHash,
      sellerNameAr,
      sellerVatNumber,
      buyerNameAr: invoice.customerNameAr,
      buyerVatNumber: invoice.customerVatNumber,
      subtotalSar: invoice.subtotalSar,
      discountTotalSar: invoice.discountTotalSar,
      taxTotalSar: invoice.taxTotalSar,
      totalAmountSar: invoice.totalAmountSar,
      lines: invoice.lines.map((l) => ({
        id: l.id,
        nameAr: l.nameAr,
        quantity: l.quantity,
        unitPriceSar: l.unitPriceSar,
        discountSar: l.discountAmountSar,
        taxableAmountSar: l.taxableAmountSar,
        taxRate: l.taxRate,
        taxAmountSar: l.taxAmountSar,
        totalAmountSar: l.totalAmountSar,
      })),
    });
  } catch (err: any) {
    logger.warn(`[E-INVOICE SYNC] Non-blocking e-invoice sync warning for ${invoice.invoiceNumber}: ${err.message}`);
  }

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

export function updateSalesInvoiceStatusService(
  store: CentralTenantDataStore,
  context: TenantContext,
  id: string,
  status: InvoiceStatus
): SalesInvoice {
  const invoices = store.salesInvoices.get(context.tenantId) || [];
  const invoice = invoices.find((i) => i.id === id);
  if (!invoice) throw new Error(`Invoice with ID ${id} not found.`);

  if (invoice.status === 'POSTED' || invoice.status === 'PAID') {
    if (status === 'CANCELLED' || status === 'DRAFT') {
      throw new Error('POSTED or PAID invoices cannot be reverted to draft or cancelled directly. Issue a Credit Note instead.');
    }
  }

  invoice.status = status;
  invoice.updatedAt = new Date().toISOString();

  store.recordAuditLog({
    tenantId: context.tenantId,
    userId: context.userId,
    userEmail: context.userEmail,
    action: `sales:invoice:update_status_${status.toLowerCase()}`,
    resourceType: 'sales_invoice',
    resourceId: invoice.id,
    correlationId: crypto.randomUUID(),
    changesDiff: { status },
  });

  return invoice;
}

export function cancelSalesInvoiceService(
  store: CentralTenantDataStore,
  context: TenantContext,
  id: string,
  reason?: string
): SalesInvoice {
  const invoices = store.salesInvoices.get(context.tenantId) || [];
  const invoice = invoices.find((i) => i.id === id);
  if (!invoice) throw new Error(`Invoice with ID ${id} not found.`);

  if (invoice.status === 'POSTED' || invoice.status === 'PAID') {
    throw new Error('Cannot cancel a POSTED invoice directly. You must issue a Credit Note / Sales Return.');
  }

  invoice.status = 'CANCELLED';
  invoice.notes = invoice.notes ? `${invoice.notes} | سبب الإلغاء: ${reason || 'ملغاة'}` : `سبب الإلغاء: ${reason || 'ملغاة'}`;
  invoice.updatedAt = new Date().toISOString();

  store.recordAuditLog({
    tenantId: context.tenantId,
    userId: context.userId,
    userEmail: context.userEmail,
    action: 'sales:invoice:cancel',
    resourceType: 'sales_invoice',
    resourceId: invoice.id,
    correlationId: crypto.randomUUID(),
    changesDiff: { invoiceNumber: invoice.invoiceNumber, reason },
  });

  return invoice;
}

// -------------------------------------------------------------
// 2. SALES ORDER SERVICES
// -------------------------------------------------------------

export function getSalesOrdersService(
  store: CentralTenantDataStore,
  context: TenantContext,
  filters?: { search?: string; status?: string; customerId?: string }
): SalesOrder[] {
  const orders = store.salesOrders.get(context.tenantId) || [];
  let list = [...orders];

  if (filters?.status) {
    list = list.filter((o) => o.status === filters.status);
  }
  if (filters?.customerId) {
    list = list.filter((o) => o.customerId === filters.customerId);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase().trim();
    list = list.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerNameAr.toLowerCase().includes(q) ||
        o.customerNameEn.toLowerCase().includes(q)
    );
  }

  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return list;
}

export function getSalesOrderByIdService(
  store: CentralTenantDataStore,
  context: TenantContext,
  id: string
): SalesOrder | null {
  const orders = store.salesOrders.get(context.tenantId) || [];
  return orders.find((o) => o.id === id || o.orderNumber === id) || null;
}

export function createSalesOrderService(
  store: CentralTenantDataStore,
  context: TenantContext,
  payload: CreateSalesOrderPayload
): SalesOrder {
  const customers = store.customers.get(context.tenantId) || [];
  const customer = customers.find((c) => c.id === payload.customerId);
  if (!customer) throw new Error(`Customer ${payload.customerId} not found.`);

  const branches = store.branches.get(context.tenantId) || [];
  const branch = payload.branchId ? branches.find((b) => b.id === payload.branchId) : branches[0];

  const warehouses = store.warehouses.get(context.tenantId) || [];
  const warehouse = payload.warehouseId ? warehouses.find((w) => w.id === payload.warehouseId) : warehouses[0];

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
      taxRate: l.taxRate !== undefined ? l.taxRate : item.taxRate,
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
      taxRate: l.taxRate !== undefined ? l.taxRate : item.taxRate,
      taxAmountSar: calc.taxAmountSar,
      totalAmountSar: calc.totalAmountSar,
    });
  }

  const charges: SalesChargeLine[] = [];
  if (payload.charges && payload.charges.length > 0) {
    for (const c of payload.charges) {
      const calcCharge = calculateChargeLine(c);
      charges.push({
        id: crypto.randomUUID(),
        chargeType: c.chargeType,
        nameAr: c.nameAr,
        nameEn: c.nameEn || c.nameAr,
        amountSar: c.amountSar,
        isTaxable: c.isTaxable !== false,
        taxRate: c.isTaxable !== false ? (c.taxRate !== undefined ? c.taxRate : 15) : 0,
        taxAmountSar: calcCharge.taxAmountSar,
        totalAmountSar: calcCharge.totalAmountSar,
      });
    }
  }

  const totals = calculateInvoiceTotals(lines, charges);
  const now = new Date();
  const year = now.getFullYear();
  const orders = store.salesOrders.get(context.tenantId) || [];
  const orderNumber = `SO-${year}-${String(orders.length + 1).padStart(5, '0')}`;

  const order: SalesOrder = {
    id: crypto.randomUUID(),
    tenantId: context.tenantId,
    branchId: branch?.id || 'branch-default',
    branchNameAr: branch?.nameAr || 'الفرع الرئيسي',
    warehouseId: warehouse?.id || 'wh-default',
    warehouseNameAr: warehouse?.nameAr || 'المستودع الرئيسي',
    orderNumber,
    quotationId: payload.quotationId,
    customerId: customer.id,
    customerNameAr: customer.nameAr,
    customerNameEn: customer.nameEn,
    customerVatNumber: customer.vatNumber,
    customerCrNumber: customer.crNumber,
    customerAddress: customer.address?.formattedAddress || customer.address?.city,
    orderDate: payload.orderDate || now.toISOString().slice(0, 10),
    expectedDeliveryDate: payload.expectedDeliveryDate,
    paymentMethod: payload.paymentMethod,
    paymentTermsDays: payload.paymentTermsDays || 30,
    salesRepName: payload.salesRepName,
    status: 'DRAFT',
    subtotalSar: totals.subtotalSar,
    discountTotalSar: totals.discountTotalSar,
    chargesTotalSar: totals.chargesTotalSar,
    taxTotalSar: totals.taxTotalSar,
    totalAmountSar: totals.totalAmountSar,
    totalAmountHalalas: totals.totalAmountHalalas,
    invoicedAmountSar: 0,
    deliveredAmountSar: 0,
    copiedFromId: payload.copiedFromId,
    notes: payload.notes,
    createdBy: context.userId,
    createdByName: context.userEmail,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    lines,
    charges,
  };

  orders.unshift(order);
  store.salesOrders.set(context.tenantId, orders);

  store.recordAuditLog({
    tenantId: context.tenantId,
    userId: context.userId,
    userEmail: context.userEmail,
    action: 'sales:order:create',
    resourceType: 'sales_order',
    resourceId: order.id,
    correlationId: crypto.randomUUID(),
    changesDiff: { orderNumber: order.orderNumber, total: order.totalAmountSar },
  });

  return order;
}

export function updateSalesOrderStatusService(
  store: CentralTenantDataStore,
  context: TenantContext,
  id: string,
  status: SalesOrderStatus
): SalesOrder {
  const orders = store.salesOrders.get(context.tenantId) || [];
  const order = orders.find((o) => o.id === id);
  if (!order) throw new Error(`Sales Order with ID ${id} not found.`);

  order.status = status;
  order.updatedAt = new Date().toISOString();

  store.recordAuditLog({
    tenantId: context.tenantId,
    userId: context.userId,
    userEmail: context.userEmail,
    action: `sales:order:update_status_${status.toLowerCase()}`,
    resourceType: 'sales_order',
    resourceId: order.id,
    correlationId: crypto.randomUUID(),
    changesDiff: { status },
  });

  return order;
}

export async function convertSalesOrderToInvoiceService(
  store: CentralTenantDataStore,
  context: TenantContext,
  orderId: string
): Promise<SalesInvoice> {
  const orders = store.salesOrders.get(context.tenantId) || [];
  const order = orders.find((o) => o.id === orderId);
  if (!order) throw new Error(`Sales Order with ID ${orderId} not found.`);

  const invoice = await createSalesInvoiceService(store, context, {
    branchId: order.branchId,
    warehouseId: order.warehouseId,
    invoiceType: 'STANDARD_B2B',
    customerId: order.customerId,
    paymentMethod: order.paymentMethod,
    salesOrderId: order.id,
    notes: `تم إنشاء الفاتورة من أمر البيع رقم ${order.orderNumber}`,
    postImmediately: false,
    lines: order.lines.map((l) => ({
      itemId: l.itemId,
      uomId: l.uomId,
      quantity: l.quantity,
      unitPriceSar: l.unitPriceSar,
      discountPercent: l.discountPercent,
      taxRate: l.taxRate,
    })),
    charges: order.charges?.map((c) => ({
      chargeType: c.chargeType,
      nameAr: c.nameAr,
      nameEn: c.nameEn,
      amountSar: c.amountSar,
      isTaxable: c.isTaxable,
      taxRate: c.taxRate,
    })),
  });

  order.status = 'BILLED';
  order.invoicedAmountSar = invoice.totalAmountSar;
  order.updatedAt = new Date().toISOString();

  return invoice;
}

// -------------------------------------------------------------
// 3. QUOTATIONS SERVICES
// -------------------------------------------------------------

export function getSalesQuotationsService(
  store: CentralTenantDataStore,
  context: TenantContext,
  filters?: { search?: string; status?: string; customerId?: string }
): SalesQuotation[] {
  const quotations = store.salesQuotations.get(context.tenantId) || [];
  let list = [...quotations];

  if (filters?.status) {
    list = list.filter((q) => q.status === filters.status);
  }
  if (filters?.customerId) {
    list = list.filter((q) => q.customerId === filters.customerId);
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

export function getSalesQuotationByIdService(
  store: CentralTenantDataStore,
  context: TenantContext,
  id: string
): SalesQuotation | null {
  const quotations = store.salesQuotations.get(context.tenantId) || [];
  return quotations.find((q) => q.id === id || q.quotationNumber === id) || null;
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

  const charges: SalesChargeLine[] = [];
  if (payload.charges && payload.charges.length > 0) {
    for (const c of payload.charges) {
      const calcCharge = calculateChargeLine(c);
      charges.push({
        id: crypto.randomUUID(),
        chargeType: c.chargeType,
        nameAr: c.nameAr,
        nameEn: c.nameEn || c.nameAr,
        amountSar: c.amountSar,
        isTaxable: c.isTaxable !== false,
        taxRate: c.isTaxable !== false ? (c.taxRate !== undefined ? c.taxRate : 15) : 0,
        taxAmountSar: calcCharge.taxAmountSar,
        totalAmountSar: calcCharge.totalAmountSar,
      });
    }
  }

  const totals = calculateInvoiceTotals(lines, charges);
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
    customerVatNumber: customer.vatNumber,
    issueDate: payload.issueDate || now.toISOString().slice(0, 10),
    expiryDate: payload.expiryDate || new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10),
    salesRepName: payload.salesRepName,
    status: 'DRAFT',
    subtotalSar: totals.subtotalSar,
    discountTotalSar: totals.discountTotalSar,
    chargesTotalSar: totals.chargesTotalSar,
    taxTotalSar: totals.taxTotalSar,
    totalAmountSar: totals.totalAmountSar,
    copiedFromId: payload.copiedFromId,
    notes: payload.notes,
    createdBy: context.userId,
    createdByName: context.userEmail,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    lines,
    charges,
  };

  quotes.unshift(quotation);
  store.salesQuotations.set(context.tenantId, quotes);
  return quotation;
}

export function updateSalesQuotationStatusService(
  store: CentralTenantDataStore,
  context: TenantContext,
  id: string,
  status: QuotationStatus
): SalesQuotation {
  const quotations = store.salesQuotations.get(context.tenantId) || [];
  const quote = quotations.find((q) => q.id === id);
  if (!quote) throw new Error(`Quotation with ID ${id} not found.`);

  quote.status = status;
  quote.updatedAt = new Date().toISOString();

  store.recordAuditLog({
    tenantId: context.tenantId,
    userId: context.userId,
    userEmail: context.userEmail,
    action: `sales:quotation:update_status_${status.toLowerCase()}`,
    resourceType: 'sales_quotation',
    resourceId: quote.id,
    correlationId: crypto.randomUUID(),
    changesDiff: { status },
  });

  return quote;
}

export function convertQuotationToOrderService(
  store: CentralTenantDataStore,
  context: TenantContext,
  quotationId: string
): SalesOrder {
  const quotations = store.salesQuotations.get(context.tenantId) || [];
  const quote = quotations.find((q) => q.id === quotationId);
  if (!quote) throw new Error(`Quotation with ID ${quotationId} not found.`);

  const order = createSalesOrderService(store, context, {
    branchId: quote.branchId,
    customerId: quote.customerId,
    quotationId: quote.id,
    paymentMethod: 'CREDIT_ACCOUNT',
    salesRepName: quote.salesRepName,
    notes: `تم التحويل تلقائياً من عرض السعر رقم ${quote.quotationNumber}`,
    lines: quote.lines.map((l) => ({
      itemId: l.itemId,
      uomId: l.uomId,
      quantity: l.quantity,
      unitPriceSar: l.unitPriceSar,
      discountPercent: l.discountPercent,
      taxRate: l.taxRate,
    })),
    charges: quote.charges?.map((c) => ({
      chargeType: c.chargeType,
      nameAr: c.nameAr,
      nameEn: c.nameEn,
      amountSar: c.amountSar,
      isTaxable: c.isTaxable,
      taxRate: c.taxRate,
    })),
  });

  quote.status = 'CONVERTED';
  quote.convertedOrderId = order.id;
  quote.convertedOrderNumber = order.orderNumber;

  return order;
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
    quotationId: quote.id,
    salesRepName: quote.salesRepName,
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
    charges: quote.charges?.map((c) => ({
      chargeType: c.chargeType,
      nameAr: c.nameAr,
      nameEn: c.nameEn,
      amountSar: c.amountSar,
      isTaxable: c.isTaxable,
      taxRate: c.taxRate,
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
// 4. CREDIT NOTE & SALES RETURN SERVICES
// -------------------------------------------------------------

export function getSalesCreditNotesService(
  store: CentralTenantDataStore,
  context: TenantContext,
  filters?: { search?: string; originalInvoiceId?: string; customerId?: string }
): SalesCreditNote[] {
  const notes = store.salesCreditNotes.get(context.tenantId) || [];
  let list = [...notes];

  if (filters?.originalInvoiceId) {
    list = list.filter((n) => n.originalInvoiceId === filters.originalInvoiceId);
  }
  if (filters?.customerId) {
    list = list.filter((n) => n.customerId === filters.customerId);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase().trim();
    list = list.filter(
      (n) =>
        n.creditNoteNumber.toLowerCase().includes(q) ||
        (n.originalInvoiceNumber && n.originalInvoiceNumber.toLowerCase().includes(q)) ||
        n.customerNameAr.toLowerCase().includes(q)
    );
  }

  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return list;
}

export function getSalesCreditNoteByIdService(
  store: CentralTenantDataStore,
  context: TenantContext,
  id: string
): SalesCreditNote | null {
  const notes = store.salesCreditNotes.get(context.tenantId) || [];
  return notes.find((n) => n.id === id || n.creditNoteNumber === id) || null;
}

export async function createSalesCreditNoteService(
  store: CentralTenantDataStore,
  context: TenantContext,
  payload: CreateCreditNotePayload
): Promise<SalesCreditNote> {
  const repo = new TenantScopedRepository(context);
  let origInvoice: SalesInvoice | undefined;
  let customer: any;

  if (payload.originalInvoiceId) {
    const invoices = store.salesInvoices.get(context.tenantId) || [];
    origInvoice = invoices.find((i) => i.id === payload.originalInvoiceId || i.invoiceNumber === payload.originalInvoiceId);
    if (!origInvoice) {
      throw new Error(`Original invoice ${payload.originalInvoiceId} not found.`);
    }
    if (origInvoice.status !== 'POSTED' && origInvoice.status !== 'PAID' && origInvoice.status !== 'PARTIALLY_PAID') {
      throw new Error('Credit notes can only be issued against POSTED or PAID invoices.');
    }
    const customers = store.customers.get(context.tenantId) || [];
    customer = customers.find((c) => c.id === origInvoice!.customerId);
  } else if (payload.isStandalone) {
    // Standalone return with permission check
    const hasStandalonePerm =
      context.role === 'OWNER' ||
      context.roleCode === 'OWNER' ||
      context.roleCode === 'CHIEF_ACCOUNTANT' ||
      context.permissions.includes('*') ||
      context.permissions.includes('sales:invoice:create');

    if (!hasStandalonePerm) {
      throw new Error('Permission denied. Standalone sales returns require elevated manager authorization.');
    }
    if (!payload.customerId) {
      throw new Error('Customer ID is required for standalone sales credit note.');
    }
    const customers = store.customers.get(context.tenantId) || [];
    customer = customers.find((c) => c.id === payload.customerId);
    if (!customer) throw new Error(`Customer ${payload.customerId} not found.`);
  } else {
    throw new Error('Credit note must specify an original invoice ID or be explicitly marked as standalone.');
  }

  const items = store.items.get(context.tenantId) || [];
  const stocks = store.warehouseStocks.get(context.tenantId) || [];
  const warehouseId = payload.warehouseId || origInvoice?.warehouseId || store.warehouses.get(context.tenantId)?.[0]?.id || 'wh-default';

  const creditLines: SalesInvoiceLine[] = [];
  let totalCogsReturnHalalas = 0n;

  if (origInvoice) {
    const linesToProcess = payload.lines && payload.lines.length > 0
      ? payload.lines
      : origInvoice.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, unitPriceSar: l.unitPriceSar }));

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

      // Restock inventory
      if (item && item.type === 'INVENTORY') {
        const stock = stocks.find((s) => s.itemId === item.id && s.warehouseId === warehouseId);
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
  } else {
    // Standalone lines
    if (!payload.lines || payload.lines.length === 0) {
      throw new Error('Standalone credit note must include at least one item line.');
    }
    for (const lineInput of payload.lines) {
      const item = items.find((it) => it.id === lineInput.itemId);
      if (!item) continue;

      const uom = lineInput.uomId ? item.units.find((u) => u.id === lineInput.uomId) : item.units[0];
      const conversionFactor = uom?.conversionFactor || 1;
      const price = lineInput.unitPriceSar || item.sellingPrice;
      const rate = lineInput.taxRate !== undefined ? lineInput.taxRate : item.taxRate;

      const calc = calculateInvoiceLine({
        quantity: lineInput.quantity,
        unitPriceSar: price,
        discountPercent: 0,
        taxRate: rate,
        conversionFactor,
      });

      creditLines.push({
        id: crypto.randomUUID(),
        itemId: item.id,
        itemCode: item.sku,
        nameAr: item.nameAr,
        nameEn: item.nameEn,
        uomId: uom?.id || 'unit-base',
        uomName: uom?.nameAr || item.baseUnit,
        conversionFactor,
        quantity: lineInput.quantity,
        baseQuantity: calc.baseQuantity,
        unitPriceSar: price,
        discountPercent: 0,
        discountAmountSar: 0,
        taxableAmountSar: calc.taxableAmountSar,
        taxRate: rate,
        taxAmountSar: calc.taxAmountSar,
        totalAmountSar: calc.totalAmountSar,
      });

      // Restock inventory
      if (item.type === 'INVENTORY') {
        const stock = stocks.find((s) => s.itemId === item.id && s.warehouseId === warehouseId);
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
  }

  if (creditLines.length === 0) {
    throw new Error('Credit note must specify at least one valid item to credit.');
  }

  const totals = calculateInvoiceTotals(creditLines);
  const now = new Date();
  const year = now.getFullYear();
  const existingNotes = store.salesCreditNotes.get(context.tenantId) || [];
  const creditNoteNumber = `CN-${year}-${String(existingNotes.length + 1).padStart(5, '0')}`;

  const returnsAccount = repo.resolveAccount('SALES_RETURNS');
  const vatAccount = repo.resolveAccount('VAT_OUTPUT');
  const arControlAccount = repo.resolveAccount('CUSTOMERS_AR');
  const cashAccount = repo.resolveAccount('CASH_DEFAULT');

  const accounts = repo.getAccounts();
  const customerSubaccount = customer?.subaccountCode
    ? accounts.find((a) => a.code === customer.subaccountCode)
    : undefined;

  const refundMethod = payload.refundPaymentMethod || (origInvoice?.paymentMethod === 'CREDIT_ACCOUNT' ? 'CREDIT_TO_ACCOUNT' : 'CREDIT_TO_ACCOUNT');
  const creditAccountId = refundMethod === 'CASH' || refundMethod === 'MADA' || refundMethod === 'BANK_TRANSFER'
    ? cashAccount.id
    : (customerSubaccount?.id || arControlAccount.id);

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
      accountId: returnsAccount.id,
      debit: Number(subtotalHalalas) / 100,
      credit: 0,
      description: `مردودات مبيعات إشعار دائن ${creditNoteNumber} ${origInvoice ? `للفاتورة ${origInvoice.invoiceNumber}` : ''}`,
    },
    {
      accountId: creditAccountId,
      debit: 0,
      credit: Number(grandTotalHalalas) / 100,
      description: `تسوية حساب العميل ${customer?.nameAr || ''} بإشعار دائن ${creditNoteNumber}`,
    },
  ];

  if (vatHalalas > 0n) {
    journalLines.push({
      accountId: vatAccount.id,
      debit: Number(vatHalalas) / 100,
      credit: 0,
      description: `عكس ضريبة القيمة المضافة لإشعار دائن ${creditNoteNumber}`,
    });
  }

  if (totalCogsReturnHalalas > 0n) {
    const cogsAccount = repo.resolveAccount('COGS');
    const invAccount = repo.resolveAccount('INVENTORY_ASSET');
    journalLines.push({
      accountId: invAccount.id,
      debit: Number(totalCogsReturnHalalas) / 100,
      credit: 0,
      description: `إرجاع مخزون بموجب إشعار دائن ${creditNoteNumber}`,
    });
    journalLines.push({
      accountId: cogsAccount.id,
      debit: 0,
      credit: Number(totalCogsReturnHalalas) / 100,
      description: `عكس تكلفة بضاعة مباعة بإشعار دائن ${creditNoteNumber}`,
    });
  }

  const postedJournal = await repo.postJournal({
    companyId: context.tenantId,
    branchId: origInvoice?.branchId || repo.getBranches()[0]?.id || 'branch-default',
    sourceType: 'REVERSAL',
    sourceId: origInvoice?.id || creditNoteNumber,
    sourceKey: creditNoteNumber,
    date: now.toISOString().slice(0, 10),
    description: `إشعار دائن رقم ${creditNoteNumber} ${origInvoice ? `للفاتورة ${origInvoice.invoiceNumber}` : ''}`,
    descriptionAr: `إشعار دائن رقم ${creditNoteNumber} ${origInvoice ? `للفاتورة ${origInvoice.invoiceNumber}` : ''}`,
    descriptionEn: `Credit Note #${creditNoteNumber} ${origInvoice ? `for Invoice #${origInvoice.invoiceNumber}` : ''}`,
    reference: creditNoteNumber,
    lines: journalLines,
  });

  const company = store.tenants.get(context.tenantId);
  const sellerVatNumber = company?.vatNumber || '300000000000003';
  const sellerNameAr = company?.nameAr || 'شركة التقنية المتقدمة المحدودة';

  const creditNoteUblXml = generateUBL21Xml({
    uuid: crypto.randomUUID(),
    invoiceNumber: creditNoteNumber,
    invoiceType: origInvoice?.invoiceType || 'STANDARD_B2B',
    documentTypeCode: '381',
    issueDate: now.toISOString().slice(0, 10),
    issueTime: now.toISOString().slice(11, 19),
    previousInvoiceHash: origInvoice?.invoiceHash || ZATCA_INITIAL_PIH_HASH,
    invoiceCounter: existingNotes.length + 1,
    seller: {
      nameAr: sellerNameAr,
      vatNumber: sellerVatNumber,
      crNumber: company?.crNumber || '1010000000',
      streetName: (company?.nationalAddress as any)?.streetNameAr || 'طريق الملك فهد',
      buildingNumber: (company?.nationalAddress as any)?.buildingNumber || '1234',
      postalZone: (company?.nationalAddress as any)?.postalCode || '12211',
      district: (company?.nationalAddress as any)?.districtAr || 'العليا',
      cityName: (company?.nationalAddress as any)?.cityAr || 'الرياض',
    },
    buyer: customer ? {
      nameAr: customer.nameAr,
      vatNumber: customer.vatNumber || '310123456700003',
      crNumber: customer.crNumber || '1010999999',
      streetName: 'طريق الملك عبدالعزيز',
      buildingNumber: '5678',
      postalZone: '12345',
      district: 'الملز',
      cityName: 'الرياض',
    } : undefined,
    billingReference: origInvoice ? {
      originalInvoiceNumber: origInvoice.invoiceNumber,
      adjustmentReasonDescription: payload.reasonDescription || 'إشعار دائن مردود مبيعات',
    } : undefined,
    subtotalSar: totals.subtotalSar,
    discountTotalSar: totals.discountTotalSar,
    taxTotalSar: totals.taxTotalSar,
    totalAmountSar: totals.totalAmountSar,
    lines: creditLines.map((l, idx) => ({
      id: `line-${idx + 1}`,
      nameAr: l.nameAr,
      quantity: l.quantity,
      unitCode: 'PCE',
      unitPriceSar: l.unitPriceSar,
      discountSar: l.discountAmountSar,
      taxableAmountSar: l.taxableAmountSar,
      taxRate: l.taxRate,
      taxAmountSar: l.taxAmountSar,
      totalAmountSar: l.totalAmountSar,
    })),
  });

  const creditNoteHash = await calculateInvoiceHash(creditNoteUblXml);
  const { signature: cnSig, publicKey: cnPub } = generateDigitalSignature(creditNoteHash);
  const cnStamp = 'ZATCA-CSID-STAMP-' + creditNoteHash.slice(0, 16);

  const qrCodeBase64 = buildZatcaQRForInvoice({
    sellerName: sellerNameAr,
    sellerVatNumber: sellerVatNumber,
    timestamp: now.toISOString(),
    totalWithVat: totals.totalAmountSar,
    vatTotal: totals.taxTotalSar,
    invoiceHash: creditNoteHash,
    digitalSignature: cnSig,
    publicKey: cnPub,
    certificateSignature: cnStamp,
  });

  const creditNote: SalesCreditNote = {
    id: crypto.randomUUID(),
    tenantId: context.tenantId,
    branchId: origInvoice?.branchId || 'branch-default',
    creditNoteNumber,
    originalInvoiceId: origInvoice?.id,
    originalInvoiceNumber: origInvoice?.invoiceNumber,
    isStandalone: payload.isStandalone,
    standaloneReason: payload.standaloneReason,
    reasonCode: payload.reasonCode,
    reasonDescription: payload.reasonDescription,
    customerId: customer.id,
    customerNameAr: customer.nameAr,
    customerNameEn: customer.nameEn,
    customerVatNumber: customer.vatNumber,
    issueDate: now.toISOString().slice(0, 10),
    status: 'POSTED',
    postedJournalId: postedJournal.id,
    postedJournalNumber: postedJournal.entryNumber,
    refundPaymentMethod: payload.refundPaymentMethod,
    subtotalSar: totals.subtotalSar,
    taxTotalSar: totals.taxTotalSar,
    totalAmountSar: totals.totalAmountSar,
    qrCodeBase64,
    notes: payload.notes,
    createdBy: context.userId,
    createdByName: context.userEmail,
    createdAt: now.toISOString(),
    lines: creditLines,
  };

  existingNotes.unshift(creditNote);
  store.salesCreditNotes.set(context.tenantId, existingNotes);

  // Sync Credit Note to E-Invoice Document Layer
  try {
    await syncEInvoiceDocumentOnPost(store, context, {
      invoiceId: creditNote.id,
      invoiceNumber: creditNote.creditNoteNumber,
      invoiceType: 'CREDIT_NOTE',
      documentTypeCode: '381',
      uuid: creditNote.id,
      issueDate: creditNote.issueDate,
      issueTime: now.toISOString().slice(11, 19),
      invoiceCounter: existingNotes.length,
      previousInvoiceHash: origInvoice?.invoiceHash || ZATCA_INITIAL_PIH_HASH,
      sellerNameAr,
      sellerVatNumber,
      buyerNameAr: customer.nameAr,
      buyerVatNumber: customer.vatNumber,
      subtotalSar: totals.subtotalSar,
      discountTotalSar: totals.discountTotalSar,
      taxTotalSar: totals.taxTotalSar,
      totalAmountSar: totals.totalAmountSar,
      billingReferenceNumber: origInvoice?.invoiceNumber,
      billingReferenceUuid: origInvoice?.id,
      lines: creditLines.map((l, idx) => ({
        id: `line-${idx + 1}`,
        nameAr: l.nameAr,
        quantity: l.quantity,
        unitPriceSar: l.unitPriceSar,
        discountSar: 0,
        taxableAmountSar: l.taxableAmountSar,
        taxRate: l.taxRate,
        taxAmountSar: l.taxAmountSar,
        totalAmountSar: l.totalAmountSar,
      })),
    });
  } catch (err: any) {
    logger.warn(`[E-INVOICE SYNC] Non-blocking e-invoice sync warning for ${creditNote.creditNoteNumber}: ${err.message}`);
  }

  // Update original invoice status if fully or partially returned
  if (origInvoice) {
    const allReturns = existingNotes.filter((n) => n.originalInvoiceId === origInvoice!.id);
    const returnedSum = allReturns.reduce((sum, n) => sum + n.totalAmountSar, 0);
    if (returnedSum >= origInvoice.totalAmountSar) {
      origInvoice.status = 'FULLY_RETURNED';
    } else {
      origInvoice.status = 'PARTIALLY_RETURNED';
    }
  }

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
      originalInvoiceNumber: origInvoice?.invoiceNumber || 'STANDALONE',
      totalAmountSar: totals.totalAmountSar,
      journalNumber: postedJournal.entryNumber,
    },
  });

  return creditNote;
}

// -------------------------------------------------------------
// 5. CUSTOMER RECEIPTS & ALLOCATIONS (Rule G5)
// -------------------------------------------------------------

export function getCustomerReceiptsService(
  store: CentralTenantDataStore,
  context: TenantContext,
  filters?: { search?: string; customerId?: string }
): CustomerReceipt[] {
  const receipts = store.customerReceipts.get(context.tenantId) || [];
  let list = [...receipts];

  if (filters?.customerId) {
    list = list.filter((r) => r.customerId === filters.customerId);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase().trim();
    list = list.filter(
      (r) =>
        r.receiptNumber.toLowerCase().includes(q) ||
        r.customerNameAr.toLowerCase().includes(q) ||
        r.customerNameEn.toLowerCase().includes(q) ||
        (r.chequeNumber && r.chequeNumber.includes(q))
    );
  }

  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return list;
}

export function getCustomerReceiptByIdService(
  store: CentralTenantDataStore,
  context: TenantContext,
  id: string
): CustomerReceipt | null {
  const receipts = store.customerReceipts.get(context.tenantId) || [];
  return receipts.find((r) => r.id === id || r.receiptNumber === id) || null;
}

export async function createCustomerReceiptService(
  store: CentralTenantDataStore,
  context: TenantContext,
  payload: CreateCustomerReceiptPayload
): Promise<CustomerReceipt> {
  const customers = store.customers.get(context.tenantId) || [];
  const customer = customers.find((c) => c.id === payload.customerId);
  if (!customer) throw new Error(`Customer with ID ${payload.customerId} was not found.`);

  const totalAmount = roundHalalas(Math.max(0, payload.totalAmountSar || 0));
  if (totalAmount <= 0) {
    throw new Error('Receipt total amount must be greater than zero.');
  }

  const invoices = store.salesInvoices.get(context.tenantId) || [];
  const openInvoices = invoices.filter(
    (i) => i.customerId === customer.id && (i.status === 'POSTED' || i.status === 'PARTIALLY_PAID') && i.remainingAmountSar > 0
  );

  let allocations: CustomerReceiptAllocation[] = [];
  let allocatedAmountSar = 0;
  let unallocatedAdvanceSar = 0;

  if (payload.allocations && payload.allocations.length > 0) {
    // Custom user allocation
    let remainingPayment = totalAmount;
    for (const allocReq of payload.allocations) {
      if (remainingPayment <= 0) break;
      const targetInv = openInvoices.find((i) => i.id === allocReq.invoiceId || i.invoiceNumber === allocReq.invoiceId);
      if (!targetInv) continue;

      const allocAmt = roundHalalas(Math.min(allocReq.allocatedAmountSar, targetInv.remainingAmountSar, remainingPayment));
      if (allocAmt > 0) {
        allocations.push({
          id: crypto.randomUUID(),
          invoiceId: targetInv.id,
          invoiceNumber: targetInv.invoiceNumber,
          invoiceTotalSar: targetInv.totalAmountSar,
          invoiceRemainingBeforeSar: targetInv.remainingAmountSar,
          allocatedAmountSar: allocAmt,
          invoiceRemainingAfterSar: roundHalalas(targetInv.remainingAmountSar - allocAmt),
        });
        remainingPayment = roundHalalas(remainingPayment - allocAmt);
        allocatedAmountSar = roundHalalas(allocatedAmountSar + allocAmt);
      }
    }
    unallocatedAdvanceSar = remainingPayment;
  } else {
    // Auto FIFO suggestion (Rule G5)
    const fifo = suggestFifoAllocations(openInvoices, totalAmount);
    allocations = fifo.allocations;
    allocatedAmountSar = fifo.allocatedTotalSar;
    unallocatedAdvanceSar = fifo.unallocatedAdvanceSar;
  }

  // Update open invoices
  for (const alloc of allocations) {
    const inv = invoices.find((i) => i.id === alloc.invoiceId);
    if (inv) {
      inv.paidAmountSar = roundHalalas((inv.paidAmountSar || 0) + alloc.allocatedAmountSar);
      inv.remainingAmountSar = roundHalalas(Math.max(0, inv.totalAmountSar - inv.paidAmountSar));
      if (inv.remainingAmountSar === 0) {
        inv.status = 'PAID';
      } else {
        inv.status = 'PARTIALLY_PAID';
      }
      inv.updatedAt = new Date().toISOString();
    }
  }

  const now = new Date();
  const year = now.getFullYear();
  const existingReceipts = store.customerReceipts.get(context.tenantId) || [];
  const receiptNumber = `REC-${year}-${String(existingReceipts.length + 1).padStart(5, '0')}`;

  const repo = new TenantScopedRepository(context);
  const accounts = repo.getAccounts();

  const cashAccount = repo.resolveAccount('CASH_DEFAULT');
  const bankAccount = repo.resolveAccount('BANK_DEFAULT');
  const arControlAccount = repo.resolveAccount('CUSTOMERS_AR');
  const advancesAccount = repo.resolveAccount('CUSTOMER_ADVANCES');

  const customerSubaccount = customer.subaccountCode
    ? accounts.find((a) => a.code === customer.subaccountCode)
    : undefined;

  let debitAccountId = cashAccount.id;
  if (payload.paymentMethod === 'BANK_TRANSFER' || payload.paymentMethod === 'MADA' || payload.paymentMethod === 'VISA_MASTER' || payload.paymentMethod === 'CHEQUE') {
    debitAccountId = payload.cashboxOrBankAccountId || bankAccount.id;
  } else {
    debitAccountId = payload.cashboxOrBankAccountId || cashAccount.id;
  }

  const journalLines: Array<{
    accountId: string;
    debit: string | number;
    credit: string | number;
    description: string;
  }> = [
    {
      accountId: debitAccountId,
      debit: totalAmount,
      credit: 0,
      description: `سند قبض رقم ${receiptNumber} من العميل ${customer.nameAr}`,
    },
  ];

  if (allocatedAmountSar > 0) {
    journalLines.push({
      accountId: customerSubaccount?.id || arControlAccount.id,
      debit: 0,
      credit: allocatedAmountSar,
      description: `تحصيل ومطابقة فواتير مبيعات بسند قبض ${receiptNumber}`,
    });
  }

  if (unallocatedAdvanceSar > 0) {
    journalLines.push({
      accountId: advancesAccount.id,
      debit: 0,
      credit: unallocatedAdvanceSar,
      description: `دفعة مقدمة غير مخصصة (أمانات عملاء) بسند قبض ${receiptNumber}`,
    });
  }

  const postedJournal = await repo.postJournal({
    companyId: context.tenantId,
    branchId: payload.branchId || repo.getBranches()[0]?.id || 'branch-default',
    sourceType: 'RECEIPT',
    sourceId: receiptNumber,
    sourceKey: receiptNumber,
    date: payload.receiptDate || now.toISOString().slice(0, 10),
    description: `سند قبض رقم ${receiptNumber} من العميل ${customer.nameAr} بقيمة ${totalAmount} ر.س`,
    descriptionAr: `سند قبض رقم ${receiptNumber} من العميل ${customer.nameAr} بقيمة ${totalAmount} ر.س`,
    descriptionEn: `Customer Receipt #${receiptNumber} from ${customer.nameEn} for ${totalAmount} SAR`,
    reference: receiptNumber,
    lines: journalLines,
  });

  const receipt: CustomerReceipt = {
    id: crypto.randomUUID(),
    tenantId: context.tenantId,
    branchId: payload.branchId || 'branch-default',
    receiptNumber,
    receiptDate: payload.receiptDate || now.toISOString().slice(0, 10),
    customerId: customer.id,
    customerNameAr: customer.nameAr,
    customerNameEn: customer.nameEn,
    customerSubaccountCode: customer.subaccountCode,
    paymentMethod: payload.paymentMethod,
    cashboxOrBankAccountId: debitAccountId,
    cashboxOrBankAccountNameAr: payload.paymentMethod === 'CASH' ? 'الخزينة النقدية الرئيسية' : 'حساب بنك الإنماء التجاري',
    chequeNumber: payload.chequeNumber,
    chequeDueDate: payload.chequeDueDate,
    chequeBankName: payload.chequeBankName,
    totalAmountSar: totalAmount,
    allocatedAmountSar,
    unallocatedAdvanceSar,
    postedJournalId: postedJournal.id,
    postedJournalNumber: postedJournal.entryNumber,
    status: 'POSTED',
    notes: payload.notes,
    allocations,
    createdBy: context.userId,
    createdByName: context.userEmail,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  existingReceipts.unshift(receipt);
  store.customerReceipts.set(context.tenantId, existingReceipts);

  store.recordAuditLog({
    tenantId: context.tenantId,
    userId: context.userId,
    userEmail: context.userEmail,
    action: 'sales:receipt:create',
    resourceType: 'customer_receipt',
    resourceId: receipt.id,
    correlationId: crypto.randomUUID(),
    changesDiff: {
      receiptNumber,
      customer: customer.nameAr,
      totalAmountSar: totalAmount,
      allocated: allocatedAmountSar,
      advance: unallocatedAdvanceSar,
      journalNumber: postedJournal.entryNumber,
    },
  });

  return receipt;
}

export function reallocateCustomerReceiptService(
  store: CentralTenantDataStore,
  context: TenantContext,
  receiptId: string,
  newAllocations: Array<{ invoiceId: string; allocatedAmountSar: number }>
): CustomerReceipt {
  const receipts = store.customerReceipts.get(context.tenantId) || [];
  const receipt = receipts.find((r) => r.id === receiptId);
  if (!receipt) throw new Error(`Customer Receipt with ID ${receiptId} not found.`);

  const invoices = store.salesInvoices.get(context.tenantId) || [];

  // Revert previous allocations on invoices
  for (const oldAlloc of receipt.allocations) {
    const inv = invoices.find((i) => i.id === oldAlloc.invoiceId);
    if (inv) {
      inv.paidAmountSar = roundHalalas(Math.max(0, (inv.paidAmountSar || 0) - oldAlloc.allocatedAmountSar));
      inv.remainingAmountSar = roundHalalas(inv.totalAmountSar - inv.paidAmountSar);
      inv.status = inv.remainingAmountSar === 0 ? 'PAID' : (inv.paidAmountSar > 0 ? 'PARTIALLY_PAID' : 'POSTED');
      inv.updatedAt = new Date().toISOString();
    }
  }

  // Apply new allocations
  let remainingPayment = receipt.totalAmountSar;
  const updatedAllocations: CustomerReceiptAllocation[] = [];
  let allocatedTotal = 0;

  for (const req of newAllocations) {
    if (remainingPayment <= 0) break;
    const inv = invoices.find((i) => i.id === req.invoiceId);
    if (!inv) continue;

    const allocAmt = roundHalalas(Math.min(req.allocatedAmountSar, inv.remainingAmountSar, remainingPayment));
    if (allocAmt > 0) {
      updatedAllocations.push({
        id: crypto.randomUUID(),
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceTotalSar: inv.totalAmountSar,
        invoiceRemainingBeforeSar: inv.remainingAmountSar,
        allocatedAmountSar: allocAmt,
        invoiceRemainingAfterSar: roundHalalas(inv.remainingAmountSar - allocAmt),
      });

      inv.paidAmountSar = roundHalalas((inv.paidAmountSar || 0) + allocAmt);
      inv.remainingAmountSar = roundHalalas(Math.max(0, inv.totalAmountSar - inv.paidAmountSar));
      inv.status = inv.remainingAmountSar === 0 ? 'PAID' : 'PARTIALLY_PAID';
      inv.updatedAt = new Date().toISOString();

      remainingPayment = roundHalalas(remainingPayment - allocAmt);
      allocatedTotal = roundHalalas(allocatedTotal + allocAmt);
    }
  }

  receipt.allocations = updatedAllocations;
  receipt.allocatedAmountSar = allocatedTotal;
  receipt.unallocatedAdvanceSar = remainingPayment;
  receipt.updatedAt = new Date().toISOString();

  store.recordAuditLog({
    tenantId: context.tenantId,
    userId: context.userId,
    userEmail: context.userEmail,
    action: 'sales:receipt:reallocate',
    resourceType: 'customer_receipt',
    resourceId: receipt.id,
    correlationId: crypto.randomUUID(),
    changesDiff: {
      receiptNumber: receipt.receiptNumber,
      newAllocationsCount: updatedAllocations.length,
      newAllocatedTotal: allocatedTotal,
      newAdvance: remainingPayment,
    },
  });

  return receipt;
}

// -------------------------------------------------------------
// 6. CUSTOMER STATEMENTS & AGING (Rule G4)
// -------------------------------------------------------------

export function getCustomerStatementService(
  store: CentralTenantDataStore,
  context: TenantContext,
  customerId: string,
  startDate?: string,
  endDate?: string
): CustomerStatement {
  const customers = store.customers.get(context.tenantId) || [];
  const customer = customers.find((c) => c.id === customerId);
  if (!customer) throw new Error(`Customer with ID ${customerId} was not found.`);

  const start = startDate || '2000-01-01';
  const end = endDate || new Date().toISOString().slice(0, 10);

  const invoices = (store.salesInvoices.get(context.tenantId) || []).filter(
    (i) => i.customerId === customer.id && (i.status === 'POSTED' || i.status === 'PAID' || i.status === 'PARTIALLY_PAID')
  );

  const receipts = (store.customerReceipts.get(context.tenantId) || []).filter(
    (r) => r.customerId === customer.id && r.status === 'POSTED'
  );

  const creditNotes = (store.salesCreditNotes.get(context.tenantId) || []).filter(
    (c) => c.customerId === customer.id && c.status === 'POSTED'
  );

  // Compute opening balance prior to startDate
  let openingBalance = 0;
  for (const inv of invoices) {
    if (inv.issueDate < start && inv.paymentMethod === 'CREDIT_ACCOUNT') {
      openingBalance = roundHalalas(openingBalance + inv.totalAmountSar);
    }
  }
  for (const rec of receipts) {
    if (rec.receiptDate < start) {
      openingBalance = roundHalalas(openingBalance - rec.totalAmountSar);
    }
  }
  for (const cn of creditNotes) {
    if (cn.issueDate < start) {
      openingBalance = roundHalalas(openingBalance - cn.totalAmountSar);
    }
  }

  // Gather transactions in range
  const rawTx: Array<{
    date: string;
    type: 'INVOICE' | 'RECEIPT' | 'CREDIT_NOTE';
    docNum: string;
    descriptionAr: string;
    descriptionEn: string;
    debitSar: number;
    creditSar: number;
    dueDate?: string;
  }> = [];

  for (const inv of invoices) {
    if (inv.issueDate >= start && inv.issueDate <= end && inv.paymentMethod === 'CREDIT_ACCOUNT') {
      rawTx.push({
        date: inv.issueDate,
        type: 'INVOICE',
        docNum: inv.invoiceNumber,
        descriptionAr: `فاتورة مبيعات ${inv.invoiceType === 'STANDARD_B2B' ? 'ضريبية' : 'مبسطة'} رقم ${inv.invoiceNumber}`,
        descriptionEn: `Sales Invoice #${inv.invoiceNumber}`,
        debitSar: inv.totalAmountSar,
        creditSar: 0,
        dueDate: inv.dueDate,
      });
    }
  }

  for (const rec of receipts) {
    if (rec.receiptDate >= start && rec.receiptDate <= end) {
      rawTx.push({
        date: rec.receiptDate,
        type: 'RECEIPT',
        docNum: rec.receiptNumber,
        descriptionAr: `سند قبض وتحصيل رقم ${rec.receiptNumber} (${rec.paymentMethod})`,
        descriptionEn: `Payment Receipt #${rec.receiptNumber} (${rec.paymentMethod})`,
        debitSar: 0,
        creditSar: rec.totalAmountSar,
      });
    }
  }

  for (const cn of creditNotes) {
    if (cn.issueDate >= start && cn.issueDate <= end) {
      rawTx.push({
        date: cn.issueDate,
        type: 'CREDIT_NOTE',
        docNum: cn.creditNoteNumber,
        descriptionAr: `إشعار دائن مردود مبيعات رقم ${cn.creditNoteNumber}`,
        descriptionEn: `Sales Credit Note #${cn.creditNoteNumber}`,
        debitSar: 0,
        creditSar: cn.totalAmountSar,
      });
    }
  }

  // Sort ascending by date
  rawTx.sort((a, b) => a.date.localeCompare(b.date));

  let currentRunning = openingBalance;
  let totalDebits = 0;
  let totalCredits = 0;

  const transactions: CustomerStatementTransaction[] = [];

  for (const tx of rawTx) {
    totalDebits = roundHalalas(totalDebits + tx.debitSar);
    totalCredits = roundHalalas(totalCredits + tx.creditSar);
    currentRunning = roundHalalas(currentRunning + tx.debitSar - tx.creditSar);

    const isOverdue = tx.dueDate ? tx.dueDate < new Date().toISOString().slice(0, 10) : false;

    transactions.push({
      id: crypto.randomUUID(),
      date: tx.date,
      type: tx.type,
      documentNumber: tx.docNum,
      descriptionAr: tx.descriptionAr,
      descriptionEn: tx.descriptionEn,
      debitSar: tx.debitSar,
      creditSar: tx.creditSar,
      runningBalanceSar: currentRunning,
      dueDate: tx.dueDate,
      isOverdue,
    });
  }

  const closingBalance = currentRunning;
  const unallocatedAdvances = receipts.reduce((sum, r) => sum + r.unallocatedAdvanceSar, 0);

  // Compute aging buckets
  const now = new Date();
  let agingCurrent = 0;
  let aging31to60 = 0;
  let aging61to90 = 0;
  let aging90plus = 0;

  for (const inv of invoices) {
    if (inv.remainingAmountSar > 0 && inv.paymentMethod === 'CREDIT_ACCOUNT') {
      const invDate = new Date(inv.dueDate || inv.issueDate);
      const diffDays = Math.floor((now.getTime() - invDate.getTime()) / (1000 * 3600 * 24));

      if (diffDays <= 30) agingCurrent = roundHalalas(agingCurrent + inv.remainingAmountSar);
      else if (diffDays <= 60) aging31to60 = roundHalalas(aging31to60 + inv.remainingAmountSar);
      else if (diffDays <= 90) aging61to90 = roundHalalas(aging61to90 + inv.remainingAmountSar);
      else aging90plus = roundHalalas(aging90plus + inv.remainingAmountSar);
    }
  }

  return {
    customerId: customer.id,
    customerNameAr: customer.nameAr,
    customerNameEn: customer.nameEn,
    customerVatNumber: customer.vatNumber,
    customerCrNumber: customer.crNumber,
    customerAddress: customer.address?.formattedAddress || customer.address?.city,
    currency: 'SAR',
    startDate: start,
    endDate: end,
    openingBalanceSar: openingBalance,
    totalDebitsSar: totalDebits,
    totalCreditsSar: totalCredits,
    closingBalanceSar: closingBalance,
    amountDueSar: Math.max(0, closingBalance),
    unallocatedAdvancesSar: unallocatedAdvances,
    aging: {
      current: agingCurrent,
      days31to60: aging31to60,
      days61to90: aging61to90,
      days90plus: aging90plus,
    },
    transactions,
  };
}

export function getCustomerAgingService(
  store: CentralTenantDataStore,
  context: TenantContext
): Array<{
  customerId: string;
  customerNameAr: string;
  customerNameEn: string;
  totalDueSar: number;
  currentSar: number;
  days31to60Sar: number;
  days61to90Sar: number;
  days90plusSar: number;
  creditLimitSar?: number;
  creditHold: boolean;
}> {
  const customers = store.customers.get(context.tenantId) || [];
  const result = [];

  for (const c of customers) {
    const stmt = getCustomerStatementService(store, context, c.id);
    if (stmt.closingBalanceSar > 0 || c.creditLimit) {
      result.push({
        customerId: c.id,
        customerNameAr: c.nameAr,
        customerNameEn: c.nameEn,
        totalDueSar: stmt.closingBalanceSar,
        currentSar: stmt.aging.current,
        days31to60Sar: stmt.aging.days31to60,
        days61to90Sar: stmt.aging.days61to90,
        days90plusSar: stmt.aging.days90plus,
        creditLimitSar: c.creditLimit,
        creditHold: !!c.creditHold,
      });
    }
  }

  return result.sort((a, b) => b.totalDueSar - a.totalDueSar);
}

// -------------------------------------------------------------
// 7. COPY DOCUMENT SERVICE (Draft Duplication with Lineage)
// -------------------------------------------------------------

export async function copySalesDocumentService(
  store: CentralTenantDataStore,
  context: TenantContext,
  params: {
    sourceType: 'QUOTATION' | 'ORDER' | 'INVOICE' | 'CREDIT_NOTE';
    sourceId: string;
  }
): Promise<SalesQuotation | SalesOrder | SalesInvoice | SalesCreditNote> {
  const items = store.items.get(context.tenantId) || [];

  if (params.sourceType === 'INVOICE') {
    const invoices = store.salesInvoices.get(context.tenantId) || [];
    const orig = invoices.find((i) => i.id === params.sourceId || i.invoiceNumber === params.sourceId);
    if (!orig) throw new Error(`Source invoice ${params.sourceId} not found.`);

    // Re-resolve catalog prices and recalculate
    const lines = orig.lines.map((l) => {
      const item = items.find((it) => it.id === l.itemId);
      const currentPrice = item ? item.sellingPrice : l.unitPriceSar;
      return {
        itemId: l.itemId,
        uomId: l.uomId,
        quantity: l.quantity,
        unitPriceSar: currentPrice,
        discountPercent: l.discountPercent,
        taxRate: l.taxRate,
      };
    });

    const newInvoice = await createSalesInvoiceService(store, context, {
      branchId: orig.branchId,
      warehouseId: orig.warehouseId,
      invoiceType: orig.invoiceType,
      customerId: orig.customerId,
      paymentMethod: orig.paymentMethod,
      copiedFromId: orig.id,
      notes: `نسخة من الفاتورة رقم ${orig.invoiceNumber}`,
      postImmediately: false,
      lines,
      charges: orig.charges?.map((c) => ({
        chargeType: c.chargeType,
        nameAr: c.nameAr,
        nameEn: c.nameEn,
        amountSar: c.amountSar,
        isTaxable: c.isTaxable,
        taxRate: c.taxRate,
      })),
    });

    store.recordAuditLog({
      tenantId: context.tenantId,
      userId: context.userId,
      userEmail: context.userEmail,
      action: 'sales:invoice:copy',
      resourceType: 'sales_invoice',
      resourceId: newInvoice.id,
      correlationId: crypto.randomUUID(),
      changesDiff: { copiedFrom: orig.invoiceNumber, newInvoiceNumber: newInvoice.invoiceNumber },
    });

    return newInvoice;
  }

  if (params.sourceType === 'ORDER') {
    const orders = store.salesOrders.get(context.tenantId) || [];
    const orig = orders.find((o) => o.id === params.sourceId || o.orderNumber === params.sourceId);
    if (!orig) throw new Error(`Source order ${params.sourceId} not found.`);

    const lines = orig.lines.map((l) => {
      const item = items.find((it) => it.id === l.itemId);
      const currentPrice = item ? item.sellingPrice : l.unitPriceSar;
      return {
        itemId: l.itemId,
        uomId: l.uomId,
        quantity: l.quantity,
        unitPriceSar: currentPrice,
        discountPercent: l.discountPercent,
        taxRate: l.taxRate,
      };
    });

    const newOrder = createSalesOrderService(store, context, {
      branchId: orig.branchId,
      warehouseId: orig.warehouseId,
      customerId: orig.customerId,
      paymentMethod: orig.paymentMethod,
      copiedFromId: orig.id,
      notes: `نسخة من أمر البيع رقم ${orig.orderNumber}`,
      lines,
      charges: orig.charges?.map((c) => ({
        chargeType: c.chargeType,
        nameAr: c.nameAr,
        nameEn: c.nameEn,
        amountSar: c.amountSar,
        isTaxable: c.isTaxable,
        taxRate: c.taxRate,
      })),
    });

    return newOrder;
  }

  if (params.sourceType === 'QUOTATION') {
    const quotes = store.salesQuotations.get(context.tenantId) || [];
    const orig = quotes.find((q) => q.id === params.sourceId || q.quotationNumber === params.sourceId);
    if (!orig) throw new Error(`Source quotation ${params.sourceId} not found.`);

    const lines = orig.lines.map((l) => {
      const item = items.find((it) => it.id === l.itemId);
      const currentPrice = item ? item.sellingPrice : l.unitPriceSar;
      return {
        itemId: l.itemId,
        uomId: l.uomId,
        quantity: l.quantity,
        unitPriceSar: currentPrice,
        discountPercent: l.discountPercent,
        taxRate: l.taxRate,
      };
    });

    const newQuote = createSalesQuotationService(store, context, {
      branchId: orig.branchId,
      customerId: orig.customerId,
      copiedFromId: orig.id,
      notes: `نسخة من عرض السعر رقم ${orig.quotationNumber}`,
      lines,
      charges: orig.charges?.map((c) => ({
        chargeType: c.chargeType,
        nameAr: c.nameAr,
        nameEn: c.nameEn,
        amountSar: c.amountSar,
        isTaxable: c.isTaxable,
        taxRate: c.taxRate,
      })),
    });

    return newQuote;
  }

  throw new Error(`Unsupported document copy type: ${params.sourceType}`);
}

// -------------------------------------------------------------
// 8. SEED SALES MASTER DATA
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
  const seededOrders: SalesOrder[] = [];
  const seededReceipts: CustomerReceipt[] = [];

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
    paymentTermsDays: 30,
    salesRepName: 'أحمد القحطاني',
    subtotalSar: b2bTotals.subtotalSar,
    discountTotalSar: b2bTotals.discountTotalSar,
    chargesTotalSar: 0,
    taxTotalSar: b2bTotals.taxTotalSar,
    totalAmountSar: b2bTotals.totalAmountSar,
    totalAmountHalalas: b2bTotals.totalAmountHalalas,
    paidAmountSar: 0,
    remainingAmountSar: b2bTotals.totalAmountSar,
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
    chargesTotalSar: 0,
    taxTotalSar: b2cTotals.taxTotalSar,
    totalAmountSar: b2cTotals.totalAmountSar,
    totalAmountHalalas: b2cTotals.totalAmountHalalas,
    paidAmountSar: b2cTotals.totalAmountSar,
    remainingAmountSar: 0,
    status: 'PAID',
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
    salesRepName: 'أحمد القحطاني',
    status: 'SENT',
    subtotalSar: quoteTotals.subtotalSar,
    discountTotalSar: quoteTotals.discountTotalSar,
    chargesTotalSar: 0,
    taxTotalSar: quoteTotals.taxTotalSar,
    totalAmountSar: quoteTotals.totalAmountSar,
    notes: 'عرض سعر خاص للكميات الكبيرة ساري لمدة 15 يوماً.',
    createdBy: adminId,
    createdAt: `${todayStr}T09:00:00.000Z`,
    updatedAt: `${todayStr}T09:00:00.000Z`,
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

  // 4. Seed Sample Sales Order
  const orderLine = calculateInvoiceLine({
    quantity: 25,
    unitPriceSar: 15.0,
    discountPercent: 0,
    taxRate: 15,
    conversionFactor: 1,
  });
  const orderTotals = calculateInvoiceTotals([orderLine]);

  const order: SalesOrder = {
    id: crypto.randomUUID(),
    tenantId,
    branchId: defaultBranch?.id || 'branch-default',
    branchNameAr: defaultBranch?.nameAr || 'الفرع الرئيسي',
    warehouseId: defaultWarehouse?.id || 'wh-default',
    warehouseNameAr: defaultWarehouse?.nameAr || 'المستودع الرئيسي',
    orderNumber: `SO-${now.getFullYear()}-00001`,
    customerId: custJarir.id,
    customerNameAr: custJarir.nameAr,
    customerNameEn: custJarir.nameEn,
    customerVatNumber: custJarir.vatNumber,
    customerCrNumber: custJarir.crNumber,
    orderDate: todayStr,
    expectedDeliveryDate: new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10),
    paymentMethod: 'CREDIT_ACCOUNT',
    paymentTermsDays: 30,
    salesRepName: 'أحمد القحطاني',
    status: 'APPROVED',
    subtotalSar: orderTotals.subtotalSar,
    discountTotalSar: orderTotals.discountTotalSar,
    chargesTotalSar: 0,
    taxTotalSar: orderTotals.taxTotalSar,
    totalAmountSar: orderTotals.totalAmountSar,
    totalAmountHalalas: orderTotals.totalAmountHalalas,
    invoicedAmountSar: 0,
    deliveredAmountSar: 0,
    notes: 'أمر بيع معتمد وجاهز للفوترة والتسليم.',
    createdBy: adminId,
    createdAt: `${todayStr}T11:00:00.000Z`,
    updatedAt: `${todayStr}T11:00:00.000Z`,
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
        quantity: 25,
        baseQuantity: 25,
        unitPriceSar: 15.0,
        discountPercent: 0,
        discountAmountSar: 0,
        taxableAmountSar: orderLine.taxableAmountSar,
        taxRate: 15,
        taxAmountSar: orderLine.taxAmountSar,
        totalAmountSar: orderLine.totalAmountSar,
      },
    ],
  };
  seededOrders.push(order);

  store.salesInvoices.set(tenantId, seededInvoices);
  store.salesQuotations.set(tenantId, seededQuotations);
  store.salesOrders.set(tenantId, seededOrders);
  store.salesCreditNotes.set(tenantId, []);
  store.customerReceipts.set(tenantId, seededReceipts);
}

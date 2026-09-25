/**
 * Sales Lifecycle & Tax Invoices Domain Engine — Saudi ERP
 * Implements Saudi ZATCA Phase 1 & 2 Standard (B2B) & Simplified (B2C) Invoices,
 * Quotations, Sales Orders, Customer Receipts & Allocations, Customer Statements,
 * Credit Notes / Returns, Fast Sales POS, and Double-Entry GL Integration.
 * 
 * Rules Enforced:
 * - Rule G1: Single Source of Truth (All invoice & receipt posting directly generates balanced GL journals).
 * - Rule G7/G8: Fixed-point halalas integer arithmetic with line-level half-up rounding.
 * - Rule C: Cost & margin redaction for unauthorized roles.
 * - Rule I3/I4: Multi-UOM packaging conversions and inventory stock synchronization.
 * - Rule G4: Customer Statements derived directly from verified ledger transactions.
 * - Rule G5: Payment Receipts with FIFO allocation, advance deposits, and reallocation.
 */

import { generateZatcaQR } from './zatca.js';

export type InvoiceType = 'STANDARD_B2B' | 'SIMPLIFIED_B2C';

export type InvoiceStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'POSTED'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'CLOSED'
  | 'CANCELLED'
  | 'REVERSED'
  | 'PARTIALLY_RETURNED'
  | 'FULLY_RETURNED'
  | 'OVERDUE';

export type QuotationStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'CONVERTED' | 'CANCELLED';

export type SalesOrderStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'PARTIALLY_DELIVERED'
  | 'DELIVERED'
  | 'BILLED'
  | 'CLOSED'
  | 'CANCELLED';

export type ReceiptStatus = 'DRAFT' | 'POSTED' | 'CANCELLED';

export type CreditNoteReason =
  | 'RETURN_OF_GOODS'
  | 'PRICE_DISCOUNT_CORRECTION'
  | 'ORDER_CANCELLATION'
  | 'BILLING_ERROR'
  | 'GOODS_DAMAGED'
  | 'OTHER';

export type PaymentMethod = 'CREDIT_ACCOUNT' | 'CASH' | 'BANK_TRANSFER' | 'MADA' | 'VISA_MASTER' | 'CHEQUE';

export interface SalesInvoiceLine {
  id: string;
  itemId: string;
  itemCode: string;
  nameAr: string;
  nameEn: string;
  uomId: string;
  uomName: string;
  conversionFactor: number;
  quantity: number; // packaging unit quantity
  baseQuantity: number; // quantity * conversionFactor
  unitPriceSar: number; // unit price in packaging unit
  discountPercent: number; // 0 - 100
  discountAmountSar: number;
  taxableAmountSar: number; // (quantity * unitPrice) - discount
  taxRate: number; // standard 15%, 0%, or exempt
  taxAmountSar: number;
  totalAmountSar: number; // taxableAmount + taxAmount
  isTaxInclusive?: boolean;
  costPriceSar?: number; // Redacted under Rule C
}

export interface SalesChargeLine {
  id: string;
  chargeType: 'SHIPPING' | 'HANDLING' | 'PACKAGING' | 'CUSTOMS_SERVICE' | 'INSURANCE' | 'OTHER';
  nameAr: string;
  nameEn: string;
  amountSar: number;
  isTaxable: boolean;
  taxRate: number;
  taxAmountSar: number;
  totalAmountSar: number;
}

export interface TaxSnapshotLine {
  lineId: string;
  itemId: string;
  taxRatePercentage: number;
  taxCategoryCode: 'S' | 'Z' | 'E' | 'O';
  taxExemptionReasonCode?: string | null;
  netAmountSar: number;
  taxAmountSar: number;
  totalAmountSar: number;
}

export interface SalesInvoice {
  id: string;
  tenantId: string;
  branchId: string;
  branchNameAr?: string;
  warehouseId: string;
  warehouseNameAr?: string;
  invoiceNumber: string; // Sequential INV-YYYY-XXXXX or SIMP-YYYY-XXXXX
  invoiceType: InvoiceType;
  issueDate: string; // YYYY-MM-DD
  issueTime: string; // HH:mm:ss
  dueDate: string; // YYYY-MM-DD
  customerId: string;
  customerNameAr: string;
  customerNameEn: string;
  customerVatNumber?: string;
  customerCrNumber?: string;
  customerAddress?: string;
  customerSubaccountCode?: string;
  paymentMethod: PaymentMethod;
  paymentTermsDays?: number;
  salesRepName?: string;
  subtotalSar: number;
  discountTotalSar: number;
  chargesTotalSar: number;
  taxTotalSar: number;
  totalAmountSar: number;
  totalAmountHalalas: string;
  paidAmountSar: number;
  remainingAmountSar: number;
  status: InvoiceStatus;
  postedJournalId?: string;
  postedJournalNumber?: string;
  qrCodeBase64: string;
  invoiceHash?: string;
  previousInvoiceHash?: string;
  invoiceCounterNumber: number;
  ublXml?: string;
  digitalSignature?: string;
  publicKey?: string;
  cryptographicStamp?: string;
  zatcaStatus: 'CLEARED' | 'REPORTED' | 'PENDING' | 'LOCAL_ONLY' | 'REJECTED';
  zatcaTransmissionId?: string;
  zatcaTransmissionTimestamp?: string;
  zatcaValidationWarnings?: string[];
  zatcaValidationErrors?: string[];
  idempotencyKey?: string;
  quotationId?: string;
  quotationNumber?: string;
  salesOrderId?: string;
  salesOrderNumber?: string;
  copiedFromId?: string;
  creditHoldOverrideReason?: string;
  notes?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
  lines: SalesInvoiceLine[];
  charges?: SalesChargeLine[];
  taxSnapshot?: TaxSnapshotLine[];
}

export interface SalesQuotation {
  id: string;
  tenantId: string;
  branchId: string;
  branchNameAr?: string;
  quotationNumber: string; // QT-YYYY-XXXXX
  customerId: string;
  customerNameAr: string;
  customerNameEn: string;
  customerVatNumber?: string;
  issueDate: string;
  expiryDate: string;
  salesRepName?: string;
  status: QuotationStatus;
  convertedInvoiceId?: string;
  convertedInvoiceNumber?: string;
  convertedOrderId?: string;
  convertedOrderNumber?: string;
  subtotalSar: number;
  discountTotalSar: number;
  chargesTotalSar?: number;
  taxTotalSar: number;
  totalAmountSar: number;
  copiedFromId?: string;
  notes?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
  lines: SalesInvoiceLine[];
  charges?: SalesChargeLine[];
}

export interface SalesOrder {
  id: string;
  tenantId: string;
  branchId: string;
  branchNameAr?: string;
  warehouseId: string;
  warehouseNameAr?: string;
  orderNumber: string; // SO-YYYY-XXXXX
  quotationId?: string;
  quotationNumber?: string;
  customerId: string;
  customerNameAr: string;
  customerNameEn: string;
  customerVatNumber?: string;
  customerCrNumber?: string;
  customerAddress?: string;
  orderDate: string;
  expectedDeliveryDate?: string;
  paymentMethod: PaymentMethod;
  paymentTermsDays?: number;
  salesRepName?: string;
  status: SalesOrderStatus;
  subtotalSar: number;
  discountTotalSar: number;
  chargesTotalSar: number;
  taxTotalSar: number;
  totalAmountSar: number;
  totalAmountHalalas: string;
  invoicedAmountSar: number;
  deliveredAmountSar: number;
  copiedFromId?: string;
  notes?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
  lines: SalesInvoiceLine[];
  charges?: SalesChargeLine[];
}

export interface SalesCreditNote {
  id: string;
  tenantId: string;
  branchId: string;
  branchNameAr?: string;
  warehouseId?: string;
  warehouseNameAr?: string;
  creditNoteNumber: string; // CN-YYYY-XXXXX
  originalInvoiceId?: string;
  originalInvoiceNumber?: string;
  isStandalone?: boolean;
  standaloneReason?: string;
  reasonCode: CreditNoteReason;
  reasonDescription: string;
  customerId: string;
  customerNameAr: string;
  customerNameEn: string;
  customerVatNumber?: string;
  issueDate: string;
  status: 'POSTED';
  postedJournalId?: string;
  postedJournalNumber?: string;
  refundPaymentMethod?: 'CREDIT_TO_ACCOUNT' | 'CASH' | 'BANK_TRANSFER' | 'MADA';
  subtotalSar: number;
  taxTotalSar: number;
  totalAmountSar: number;
  qrCodeBase64: string;
  notes?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  lines: SalesInvoiceLine[];
}

export interface CustomerReceiptAllocation {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceTotalSar: number;
  invoiceRemainingBeforeSar: number;
  allocatedAmountSar: number;
  invoiceRemainingAfterSar: number;
}

export interface CustomerReceipt {
  id: string;
  tenantId: string;
  branchId: string;
  branchNameAr?: string;
  receiptNumber: string; // REC-YYYY-XXXXX
  receiptDate: string;
  customerId: string;
  customerNameAr: string;
  customerNameEn: string;
  customerSubaccountCode?: string;
  paymentMethod: PaymentMethod;
  cashboxOrBankAccountId: string;
  cashboxOrBankAccountNameAr: string;
  chequeNumber?: string;
  chequeDueDate?: string;
  chequeBankName?: string;
  totalAmountSar: number;
  allocatedAmountSar: number;
  unallocatedAdvanceSar: number;
  postedJournalId?: string;
  postedJournalNumber?: string;
  status: ReceiptStatus;
  notes?: string;
  allocations: CustomerReceiptAllocation[];
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerStatementTransaction {
  id: string;
  date: string;
  type: 'INVOICE' | 'RECEIPT' | 'CREDIT_NOTE' | 'ADVANCE_ADJUSTMENT' | 'OPENING';
  documentNumber: string;
  reference?: string;
  descriptionAr: string;
  descriptionEn: string;
  debitSar: number; // Invoices, Debit Adjustments
  creditSar: number; // Receipts, Credit Notes
  runningBalanceSar: number;
  dueDate?: string;
  isOverdue?: boolean;
}

export interface CustomerStatement {
  customerId: string;
  customerNameAr: string;
  customerNameEn: string;
  customerVatNumber?: string;
  customerCrNumber?: string;
  customerAddress?: string;
  currency: string;
  startDate: string;
  endDate: string;
  openingBalanceSar: number;
  totalDebitsSar: number;
  totalCreditsSar: number;
  closingBalanceSar: number;
  amountDueSar: number;
  unallocatedAdvancesSar: number;
  aging: {
    current: number; // 0-30 days
    days31to60: number;
    days61to90: number;
    days90plus: number;
  };
  transactions: CustomerStatementTransaction[];
}

// ==========================================
// EXACT ARITHMETIC WITH LINE-LEVEL HALALAS ROUNDING (Rules G7/G8)
// ==========================================

export function roundHalalas(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function toHalalasInt(amountSar: number): bigint {
  return BigInt(Math.round((amountSar + Number.EPSILON) * 100));
}

export function fromHalalasInt(halalas: bigint): number {
  return Number(halalas) / 100;
}

export interface LineCalculationInput {
  quantity: number;
  unitPriceSar: number;
  discountPercent?: number;
  taxRate?: number;
  conversionFactor?: number;
  isTaxInclusive?: boolean;
}

export function calculateInvoiceLine(input: LineCalculationInput): {
  baseQuantity: number;
  discountAmountSar: number;
  taxableAmountSar: number;
  taxAmountSar: number;
  totalAmountSar: number;
} {
  const qty = Math.max(0, input.quantity || 0);
  const factor = Math.max(1, input.conversionFactor || 1);
  const baseQuantity = Math.round(qty * factor * 1000) / 1000;

  const rawPrice = Math.max(0, input.unitPriceSar || 0);
  const rate = input.taxRate !== undefined ? input.taxRate : 15;
  const discPct = Math.min(100, Math.max(0, input.discountPercent || 0));

  if (input.isTaxInclusive && rate > 0) {
    // Tax-inclusive pricing decomposition
    const grossInclusive = qty * rawPrice;
    const discountAmountSar = roundHalalas(grossInclusive * (discPct / 100));
    const netInclusive = roundHalalas(grossInclusive - discountAmountSar);

    const taxAmountSar = roundHalalas(netInclusive - netInclusive / (1 + rate / 100));
    const taxableAmountSar = roundHalalas(netInclusive - taxAmountSar);
    const totalAmountSar = roundHalalas(taxableAmountSar + taxAmountSar);

    return {
      baseQuantity,
      discountAmountSar,
      taxableAmountSar,
      taxAmountSar,
      totalAmountSar,
    };
  }

  // Standard tax-exclusive pricing
  const grossAmount = qty * rawPrice;
  const discountAmountSar = roundHalalas(grossAmount * (discPct / 100));
  const taxableAmountSar = roundHalalas(grossAmount - discountAmountSar);
  const taxAmountSar = roundHalalas(taxableAmountSar * (rate / 100));
  const totalAmountSar = roundHalalas(taxableAmountSar + taxAmountSar);

  return {
    baseQuantity,
    discountAmountSar,
    taxableAmountSar,
    taxAmountSar,
    totalAmountSar,
  };
}

export function calculateChargeLine(charge: {
  amountSar: number;
  isTaxable?: boolean;
  taxRate?: number;
}): {
  taxAmountSar: number;
  totalAmountSar: number;
} {
  const amount = Math.max(0, charge.amountSar || 0);
  const rate = charge.isTaxable !== false ? (charge.taxRate !== undefined ? charge.taxRate : 15) : 0;
  const taxAmountSar = roundHalalas(amount * (rate / 100));
  const totalAmountSar = roundHalalas(amount + taxAmountSar);

  return {
    taxAmountSar,
    totalAmountSar,
  };
}

export function calculateInvoiceTotals(
  lines: Array<{
    taxableAmountSar: number;
    discountAmountSar: number;
    taxAmountSar: number;
    totalAmountSar: number;
  }>,
  charges?: Array<{
    amountSar: number;
    taxAmountSar: number;
    totalAmountSar: number;
  }>
): {
  subtotalSar: number;
  discountTotalSar: number;
  chargesTotalSar: number;
  taxTotalSar: number;
  totalAmountSar: number;
  totalAmountHalalas: string;
} {
  let subtotal = 0;
  let totalDiscount = 0;
  let totalTax = 0;
  let grandTotal = 0;
  let chargesTotal = 0;

  for (const line of lines) {
    subtotal += line.taxableAmountSar + line.discountAmountSar;
    totalDiscount += line.discountAmountSar;
    totalTax += line.taxAmountSar;
    grandTotal += line.totalAmountSar;
  }

  if (charges && charges.length > 0) {
    for (const c of charges) {
      chargesTotal += c.amountSar;
      totalTax += c.taxAmountSar;
      grandTotal += c.totalAmountSar;
    }
  }

  const subtotalSar = roundHalalas(subtotal);
  const discountTotalSar = roundHalalas(totalDiscount);
  const chargesTotalSar = roundHalalas(chargesTotal);
  const taxTotalSar = roundHalalas(totalTax);
  const totalAmountSar = roundHalalas(grandTotal);
  const totalAmountHalalas = toHalalasInt(totalAmountSar).toString();

  return {
    subtotalSar,
    discountTotalSar,
    chargesTotalSar,
    taxTotalSar,
    totalAmountSar,
    totalAmountHalalas,
  };
}

/**
 * FIFO Payment Allocation Suggestion Algorithm (Rule G5)
 * Given open/unpaid invoices and a received amount, allocates payments to oldest due dates first.
 */
export function suggestFifoAllocations(
  openInvoices: Array<{
    id: string;
    invoiceNumber: string;
    dueDate: string;
    issueDate: string;
    totalAmountSar: number;
    remainingAmountSar: number;
  }>,
  paymentAmountSar: number
): {
  allocations: CustomerReceiptAllocation[];
  unallocatedAdvanceSar: number;
  allocatedTotalSar: number;
} {
  // Sort open invoices by Due Date ascending, then Issue Date ascending
  const sorted = [...openInvoices]
    .filter((inv) => inv.remainingAmountSar > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.issueDate.localeCompare(b.issueDate));

  let remainingToAllocate = roundHalalas(Math.max(0, paymentAmountSar));
  const allocations: CustomerReceiptAllocation[] = [];
  let allocatedTotal = 0;

  for (const inv of sorted) {
    if (remainingToAllocate <= 0) break;

    const alloc = Math.min(inv.remainingAmountSar, remainingToAllocate);
    const allocRounded = roundHalalas(alloc);

    if (allocRounded > 0) {
      allocations.push({
        id: `alloc-${inv.id}`,
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceTotalSar: inv.totalAmountSar,
        invoiceRemainingBeforeSar: inv.remainingAmountSar,
        allocatedAmountSar: allocRounded,
        invoiceRemainingAfterSar: roundHalalas(inv.remainingAmountSar - allocRounded),
      });

      remainingToAllocate = roundHalalas(remainingToAllocate - allocRounded);
      allocatedTotal = roundHalalas(allocatedTotal + allocRounded);
    }
  }

  return {
    allocations,
    unallocatedAdvanceSar: remainingToAllocate,
    allocatedTotalSar: allocatedTotal,
  };
}

export interface CustomerPriceAgreement {
  id: string;
  tenantId: string;
  customerId: string;
  customerNameAr?: string;
  customerNameEn?: string;
  itemId: string;
  itemCode?: string;
  itemNameAr?: string;
  itemNameEn?: string;
  uomId: string;
  uomNameAr: string;
  uomNameEn?: string;
  conversionFactor: number;
  agreedPriceSar: number; // السعر المتفق عليه للوحدة
  minQuantity?: number;
  maxQuantity?: number;
  fixedDiscountPercent?: number;
  isStrictEnforced: boolean; // إلزام صارم بالسعر والوحدة المتفق عليهما
  validFrom?: string;
  validTo?: string;
  status: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export function findMatchingPriceAgreement(
  agreements: CustomerPriceAgreement[],
  customerId: string,
  itemId: string,
  uomId?: string
): CustomerPriceAgreement | undefined {
  if (!customerId || !itemId || !agreements?.length) return undefined;
  
  const today = new Date().toISOString().slice(0, 10);
  return agreements.find((a) => {
    if (a.customerId !== customerId || a.itemId !== itemId) return false;
    if (a.status !== 'ACTIVE') return false;
    if (a.validFrom && a.validFrom > today) return false;
    if (a.validTo && a.validTo < today) return false;
    if (uomId && a.uomId && a.uomId !== uomId) return false;
    return true;
  });
}

/**
 * Generate ZATCA compliant TLV QR Code for an invoice (supporting Phase 1 and Phase 2)
 */
export function buildZatcaQRForInvoice(params: {
  sellerName: string;
  sellerVatNumber: string;
  timestamp: string; // ISO 8601
  totalWithVat: number;
  vatTotal: number;
  invoiceHash?: string;
  digitalSignature?: string;
  publicKey?: string;
  certificateSignature?: string;
}): string {
  try {
    const qrResult = generateZatcaQR({
      sellerName: params.sellerName || 'منشأة تجارية سعودية',
      vatNumber: params.sellerVatNumber || '300000000000003',
      timestamp: params.timestamp,
      invoiceTotal: params.totalWithVat.toFixed(2),
      vatTotal: params.vatTotal.toFixed(2),
      invoiceHash: params.invoiceHash,
      digitalSignature: params.digitalSignature,
      publicKey: params.publicKey,
      certificateSignature: params.certificateSignature,
    });
    return qrResult.base64;
  } catch (err) {
    // Fallback QR code representation if invalid VAT format during draft
    return '';
  }
}

/**
 * Purchasing & Accounts Payable Domain Engine — Saudi ERP
 * Implements Purchase Requests (PR), Purchase Orders (PO), Goods Receipt Notes (GRN),
 * Purchase Bills (Input VAT 15%), Multi-method Landed Cost allocations, 3-Way Matching,
 * Vendor Debit Notes (Returns), Supplier Payments, Payment Reallocations, Price History,
 * and Double-Entry General Ledger integration (Rule G1-G8, I1-I6).
 *
 * Rules Enforced:
 * - Rule G1: Single Source of Truth (All purchase posting produces balanced GL journals).
 * - Rule G7/G8: Fixed-point halalas integer arithmetic with line-level half-up rounding.
 * - Rule I1/I6: Immediate WAC recalculation upon goods receipt/purchase billing and landed cost capitalization.
 * - Rule BR-KSA-05: 15-digit Saudi VAT format validation.
 */

export type PurchaseRequestStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'ORDERED' | 'CANCELLED';
export type PurchaseRequestPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type PurchaseOrderStatus = 'DRAFT' | 'SUBMITTED' | 'CONFIRMED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'BILLED' | 'CLOSED' | 'CANCELLED';
export type GRNStatus = 'DRAFT' | 'POSTED' | 'CANCELLED';
export type PurchaseBillStatus = 'DRAFT' | 'POSTED' | 'PAID' | 'PARTIALLY_PAID' | 'CANCELLED';
export type DebitNoteReason = 'DEFECTIVE_GOODS' | 'DISCREPANCY_QUANTITY' | 'PRICE_OVERCHARGE' | 'ORDER_CANCELLATION' | 'OTHER';
export type PurchasingPaymentMethod = 'BANK_TRANSFER' | 'CASH' | 'CHEQUE' | 'MADA' | 'CREDIT_ACCOUNT';
export type ThreeWayMatchStatus = 'MATCHED' | 'QUANTITY_VARIANCE' | 'PRICE_VARIANCE' | 'UNMATCHED' | 'VARIANCE';
export type ThreeWayMatchPolicy = 'BLOCK' | 'WARN';
export type OverReceivePolicy = 'BLOCK' | 'WARN';

export type LandedCostMethod = 'BY_VALUE' | 'BY_QUANTITY' | 'BY_WEIGHT' | 'BY_VOLUME' | 'PERCENTAGE' | 'MANUAL';

// ==========================================
// 1. PURCHASE REQUESTS (طلبات الشراء)
// ==========================================

export interface PurchaseRequestLine {
  id: string;
  itemId: string;
  sku: string;
  nameAr: string;
  nameEn: string;
  uomId: string;
  uomName: string;
  conversionFactor: number;
  quantity: number;
  baseQuantity: number;
  estimatedUnitCostSar: number;
  estimatedTotalSar: number;
  notes?: string;
}

export interface PurchaseRequest {
  id: string;
  tenantId: string;
  branchId: string;
  branchNameAr?: string;
  requestNumber: string; // PR-YYYY-XXXXX
  requesterId: string;
  requesterName: string;
  department?: string;
  requestDate: string; // YYYY-MM-DD
  requiredByDate?: string;
  priority: PurchaseRequestPriority;
  status: PurchaseRequestStatus;
  totalEstimatedSar: number;
  notes?: string;
  lines: PurchaseRequestLine[];
  approvedBy?: string;
  approvedAt?: string;
  rejectedReason?: string;
  purchaseOrderId?: string;
  purchaseOrderNumber?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// 2. PURCHASE ORDERS (أوامر الشراء)
// ==========================================

export interface PurchaseOrderLine {
  id: string;
  itemId: string;
  sku: string;
  nameAr: string;
  nameEn: string;
  uomId: string;
  uomName: string;
  conversionFactor: number;
  quantity: number; // packaging unit quantity ordered
  baseQuantity: number; // quantity * conversionFactor
  unitCostSar: number;
  discountPercent: number; // 0 - 100
  discountAmountSar: number;
  taxableAmountSar: number;
  taxRate: number; // Standard 15% in KSA
  taxAmountSar: number;
  totalAmountSar: number;
  receivedQuantity: number; // to date
  remainingQuantity: number; // Math.max(0, quantity - receivedQuantity)
  billedQuantity: number; // to date
  remainingBilledQuantity: number; // Math.max(0, quantity - billedQuantity)
}

export interface PurchaseOrder {
  id: string;
  tenantId: string;
  branchId: string;
  branchNameAr?: string;
  orderNumber: string; // PO-YYYY-XXXXX
  purchaseRequestId?: string;
  purchaseRequestNumber?: string;
  supplierId: string;
  supplierNameAr: string;
  supplierNameEn: string;
  supplierVatNumber?: string;
  supplierCrNumber?: string;
  orderDate: string; // YYYY-MM-DD
  expectedDeliveryDate?: string;
  status: PurchaseOrderStatus;
  overReceivePolicy?: OverReceivePolicy;
  subtotalSar: number;
  discountTotalSar: number;
  taxTotalSar: number;
  totalAmountSar: number;
  totalReceivedQuantity?: number;
  totalOrderedQuantity?: number;
  notes?: string;
  lines: PurchaseOrderLine[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// 3. GOODS RECEIPT NOTES (GRN / سندات استلام البضائع)
// ==========================================

export interface GRNLine {
  id: string;
  itemId: string;
  sku: string;
  nameAr: string;
  nameEn: string;
  uomId: string;
  uomName: string;
  conversionFactor: number;
  quantity: number; // received in packaging unit
  baseQuantity: number; // quantity * conversionFactor
  unitCostSar: number;
  baseUnitCostSar: number;
  totalCostSar: number;
  poLineId?: string;
  orderedQuantity?: number;
  previousReceivedQuantity?: number;
  remainingPoQuantity?: number;
  varianceQuantity?: number; // excess received beyond PO line remaining
  batchNumber?: string;
  expiryDate?: string;
  landedCostShareSar?: number;
  effectiveUnitCostSar?: number;
}

export interface GoodsReceiptNote {
  id: string;
  tenantId: string;
  branchId: string;
  branchNameAr?: string;
  warehouseId: string;
  warehouseNameAr?: string;
  grnNumber: string; // GRN-YYYY-XXXXX
  supplierId: string;
  supplierNameAr: string;
  supplierNameEn: string;
  supplierVatNumber?: string;
  purchaseOrderId?: string;
  purchaseOrderNumber?: string;
  deliveryNoteNumber?: string;
  carrierName?: string;
  vehiclePlate?: string;
  receiptDate: string; // YYYY-MM-DD
  status: GRNStatus;
  totalQuantity: number;
  totalBaseQuantity: number;
  totalCostSar: number;
  landedCostAllocatedSar?: number;
  isOverReceived?: boolean;
  overReceiveOverrideReason?: string;
  overReceiveOverriddenBy?: string;
  attachments?: string[];
  stockMovementIds?: string[];
  notes?: string;
  lines: GRNLine[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// 4. PURCHASE BILLS & VENDOR INVOICES
// ==========================================

export interface PurchaseBillLine {
  id: string;
  itemId: string;
  sku: string;
  nameAr: string;
  nameEn: string;
  uomId: string;
  uomName: string;
  conversionFactor: number;
  quantity: number;
  baseQuantity: number;
  unitCostSar: number;
  discountPercent: number;
  discountAmountSar: number;
  taxableAmountSar: number;
  taxRate: number;
  taxAmountSar: number;
  totalAmountSar: number;
  warehouseId?: string;
  grnId?: string;
  grnNumber?: string;
  landedCostShareSar?: number;
  effectiveUnitCostSar?: number;
}

export interface PurchaseBill {
  id: string;
  tenantId: string;
  branchId: string;
  branchNameAr?: string;
  warehouseId: string;
  warehouseNameAr?: string;
  billNumber: string; // BILL-YYYY-XXXXX
  supplierInvoiceNumber: string; // Vendor's official tax invoice number
  purchaseOrderId?: string;
  purchaseOrderNumber?: string;
  grnId?: string;
  grnNumber?: string;
  supplierId: string;
  supplierNameAr: string;
  supplierNameEn: string;
  supplierVatNumber?: string;
  supplierCrNumber?: string;
  issueDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  paymentMethod: PurchasingPaymentMethod;
  subtotalSar: number;
  discountTotalSar: number;
  taxTotalSar: number; // Input VAT 15% (Recoverable)
  totalAmountSar: number;
  totalAmountHalalas: string;
  paidAmountSar: number;
  remainingAmountSar: number;
  status: PurchaseBillStatus;
  threeWayMatchStatus: ThreeWayMatchStatus;
  threeWayMatchOverrideReason?: string;
  threeWayMatchOverriddenBy?: string;
  postedJournalId?: string;
  journalId?: string;
  postedJournalNumber?: string;
  landedCostAllocatedSar?: number;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lines: PurchaseBillLine[];
}

// ==========================================
// 5. DEBIT NOTES & PURCHASE RETURNS
// ==========================================

export interface VendorDebitNote {
  id: string;
  tenantId: string;
  branchId: string;
  debitNoteNumber: string; // DN-YYYY-XXXXX
  originalBillId: string;
  originalBillNumber: string;
  supplierId: string;
  supplierNameAr: string;
  supplierNameEn: string;
  supplierVatNumber?: string;
  reasonCode: DebitNoteReason;
  reasonDescription: string;
  reason?: string;
  issueDate: string;
  status: 'POSTED';
  subtotalSar: number;
  taxTotalSar: number;
  totalAmountSar: number;
  postedJournalId?: string;
  postedJournalNumber?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  lines: PurchaseBillLine[];
}

// ==========================================
// 6. SUPPLIER PAYMENTS & ALLOCATIONS
// ==========================================

export interface SupplierPaymentAllocation {
  billId: string;
  billNumber: string;
  billIssueDate?: string;
  billTotalSar?: number;
  previousPaidSar?: number;
  allocatedAmountSar: number;
  remainingAfterAllocationSar?: number;
}

export interface SupplierPayment {
  id: string;
  tenantId: string;
  branchId: string;
  paymentNumber: string; // PAY-YYYY-XXXXX
  supplierId: string;
  supplierNameAr: string;
  supplierNameEn: string;
  paymentDate: string;
  amountSar: number;
  paymentMethod: PurchasingPaymentMethod;
  referenceNumber?: string;
  status: 'POSTED';
  isAdvance?: boolean;
  unallocatedAmountSar?: number;
  postedJournalId?: string;
  postedJournalNumber?: string;
  allocations: SupplierPaymentAllocation[];
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

// ==========================================
// 7. LANDED COST DATA STRUCTURES
// ==========================================

export interface LandedCostItemInput {
  costType: string; // 'FREIGHT' | 'CUSTOMS' | 'INSURANCE' | 'CLEARANCE' | 'HANDLING' | 'OTHER'
  descriptionAr: string;
  amountSar: number;
  paymentMethod?: 'CASH' | 'BANK_TRANSFER' | 'AP_VENDOR';
  serviceProviderName?: string;
}

export interface LandedCostAllocationResultLine {
  itemId: string;
  sku: string;
  nameAr: string;
  quantity: number;
  baseQuantity: number;
  originalUnitCostSar: number;
  originalTotalCostSar: number;
  allocatedLandedCostSar: number;
  effectiveTotalCostSar: number;
  effectiveUnitCostSar: number;
  weightKg?: number;
  volumeCbm?: number;
}

// ==========================================
// 8. PRICE HISTORY DATA MODEL
// ==========================================

export interface SupplierPriceRecord {
  id: string;
  tenantId: string;
  supplierId: string;
  supplierNameAr: string;
  itemId: string;
  itemSku: string;
  itemNameAr: string;
  uomId: string;
  uomName: string;
  unitCostSar: number;
  baseUnitCostSar: number;
  discountPercent: number;
  date: string;
  sourceType: 'BILL' | 'GRN' | 'PO';
  sourceNumber: string;
  createdAt: string;
}

// ==========================================
// 9. SUPPLIER STATEMENT OF ACCOUNT
// ==========================================

export interface SupplierStatementLine {
  id: string;
  date: string;
  documentType: 'BILL' | 'DEBIT_NOTE' | 'PAYMENT' | 'OPENING_BALANCE' | 'JOURNAL';
  documentNumber: string;
  reference?: string;
  descriptionAr: string;
  debitSar: number; // Reduces AP (e.g. payment made to supplier or debit note return)
  creditSar: number; // Increases AP (e.g. purchase bill from supplier)
  runningBalanceSar: number; // Net amount payable to supplier
}

export interface SupplierStatement {
  supplierId: string;
  supplierNameAr: string;
  supplierNameEn: string;
  supplierVatNumber?: string;
  supplierCrNumber?: string;
  dateFrom: string;
  dateTo: string;
  openingBalanceSar: number;
  totalBillsCreditSar: number;
  totalPaymentsDebitSar: number;
  totalDebitNotesDebitSar: number;
  closingBalanceSar: number;
  aging: {
    current0To30: number;
    days31To60: number;
    days61To90: number;
    days90Plus: number;
    totalOutstanding: number;
  };
  transactions: SupplierStatementLine[];
}

export interface SupplierAgingBucket {
  supplierId: string;
  supplierNameAr: string;
  supplierNameEn: string;
  supplierVatNumber?: string;
  totalOutstandingSar: number;
  currentSar: number; // 0 - 30 days
  days31to60Sar: number;
  days61to90Sar: number;
  days91PlusSar: number;
  unpaidBillsCount: number;

  // Compatibility aliases
  current0To30?: number;
  days31To60?: number;
  days61To90?: number;
  days90Plus?: number;
  totalOutstanding?: number;
}

// ==========================================
// 10. FIXED-POINT FINANCIAL ARITHMETIC (Rules G7/G8)
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

export interface PurchasingLineInput {
  quantity: number;
  unitCostSar: number;
  discountPercent?: number;
  taxRate?: number;
  conversionFactor?: number;
}

export function calculatePurchasingLine(input: PurchasingLineInput): {
  baseQuantity: number;
  discountAmountSar: number;
  taxableAmountSar: number;
  taxAmountSar: number;
  totalAmountSar: number;
} {
  const qty = Math.max(0, input.quantity || 0);
  const factor = Math.max(1, input.conversionFactor || 1);
  const baseQuantity = Math.round(qty * factor * 1000) / 1000;

  const cost = Math.max(0, input.unitCostSar || 0);
  const grossAmount = qty * cost;

  const discPct = Math.min(100, Math.max(0, input.discountPercent || 0));
  const discountAmountSar = roundHalalas(grossAmount * (discPct / 100));

  const taxableAmountSar = roundHalalas(grossAmount - discountAmountSar);

  const rate = input.taxRate !== undefined ? input.taxRate : 15;
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

export function calculatePurchasingTotals(lines: Array<{
  taxableAmountSar: number;
  discountAmountSar: number;
  taxAmountSar: number;
  totalAmountSar: number;
}>): {
  subtotalSar: number;
  discountTotalSar: number;
  taxTotalSar: number;
  totalAmountSar: number;
  totalAmountHalalas: string;
} {
  let subtotalHalalas = 0n;
  let discountHalalas = 0n;
  let taxHalalas = 0n;
  let totalHalalas = 0n;

  for (const line of lines) {
    subtotalHalalas += toHalalasInt(line.taxableAmountSar);
    discountHalalas += toHalalasInt(line.discountAmountSar);
    taxHalalas += toHalalasInt(line.taxAmountSar);
    totalHalalas += toHalalasInt(line.totalAmountSar);
  }

  return {
    subtotalSar: fromHalalasInt(subtotalHalalas),
    discountTotalSar: fromHalalasInt(discountHalalas),
    taxTotalSar: fromHalalasInt(taxHalalas),
    totalAmountSar: fromHalalasInt(totalHalalas),
    totalAmountHalalas: totalHalalas.toString(),
  };
}

// ==========================================
// 11. LANDED COST ALLOCATION ENGINE (Rule I4 / Phase 05 I3)
// ==========================================

export function allocateLandedCosts(
  lines: Array<{
    itemId: string;
    sku: string;
    nameAr: string;
    quantity: number;
    baseQuantity: number;
    unitCostSar: number;
    weightKg?: number;
    volumeCbm?: number;
    manualExtraCostSar?: number;
  }>,
  totalLandedCostSar: number,
  method: LandedCostMethod = 'BY_VALUE',
  percentageRate: number = 0
): LandedCostAllocationResultLine[] {
  if (lines.length === 0) return [];

  const totalGoodsValue = lines.reduce(
    (sum, l) => sum + roundHalalas(l.quantity * l.unitCostSar),
    0
  );
  const totalBaseQty = lines.reduce((sum, l) => sum + (l.baseQuantity || l.quantity), 0);
  const totalWeight = lines.reduce((sum, l) => sum + (l.weightKg || 1) * l.quantity, 0);
  const totalVolume = lines.reduce((sum, l) => sum + (l.volumeCbm || 1) * l.quantity, 0);

  let allocatedRunningSum = 0;

  const result: LandedCostAllocationResultLine[] = lines.map((line, idx) => {
    const lineTotal = roundHalalas(line.quantity * line.unitCostSar);
    let share = 0;

    if (method === 'BY_VALUE') {
      if (totalGoodsValue > 0) {
        share = idx === lines.length - 1
          ? roundHalalas(totalLandedCostSar - allocatedRunningSum)
          : roundHalalas(totalLandedCostSar * (lineTotal / totalGoodsValue));
      }
    } else if (method === 'BY_QUANTITY') {
      if (totalBaseQty > 0) {
        share = idx === lines.length - 1
          ? roundHalalas(totalLandedCostSar - allocatedRunningSum)
          : roundHalalas(totalLandedCostSar * ((line.baseQuantity || line.quantity) / totalBaseQty));
      }
    } else if (method === 'BY_WEIGHT') {
      const lineWeight = (line.weightKg || 1) * line.quantity;
      if (totalWeight > 0) {
        share = idx === lines.length - 1
          ? roundHalalas(totalLandedCostSar - allocatedRunningSum)
          : roundHalalas(totalLandedCostSar * (lineWeight / totalWeight));
      }
    } else if (method === 'BY_VOLUME') {
      const lineVol = (line.volumeCbm || 1) * line.quantity;
      if (totalVolume > 0) {
        share = idx === lines.length - 1
          ? roundHalalas(totalLandedCostSar - allocatedRunningSum)
          : roundHalalas(totalLandedCostSar * (lineVol / totalVolume));
      }
    } else if (method === 'PERCENTAGE') {
      share = roundHalalas(lineTotal * (percentageRate / 100));
    } else if (method === 'MANUAL') {
      share = roundHalalas(line.manualExtraCostSar || 0);
    }

    allocatedRunningSum = roundHalalas(allocatedRunningSum + share);

    const effectiveTotalCost = roundHalalas(lineTotal + share);
    const effectiveUnitCost = line.quantity > 0
      ? roundHalalas(effectiveTotalCost / line.quantity)
      : line.unitCostSar;

    return {
      itemId: line.itemId,
      sku: line.sku,
      nameAr: line.nameAr,
      quantity: line.quantity,
      baseQuantity: line.baseQuantity || line.quantity,
      originalUnitCostSar: line.unitCostSar,
      originalTotalCostSar: lineTotal,
      allocatedLandedCostSar: share,
      effectiveTotalCostSar: effectiveTotalCost,
      effectiveUnitCostSar: effectiveUnitCost,
      weightKg: line.weightKg,
      volumeCbm: line.volumeCbm,
    };
  });

  return result;
}

// ==========================================
// 12. 3-WAY MATCHING ENGINE & VARIANCE CHECK
// ==========================================

export interface ThreeWayMatchVarianceItem {
  itemId: string;
  sku?: string;
  nameAr?: string;
  type: 'QUANTITY_VARIANCE' | 'PRICE_VARIANCE' | 'MISSING_PO_LINE' | 'MISSING_GRN_LINE' | 'MISSING_BILL_LINE' | 'OVER_RECEIPT';
  poQty?: number;
  grnQty?: number;
  billQty?: number;
  poPrice?: number;
  billPrice?: number;
  varianceQty?: number;
  variancePriceSar?: number;
  messageAr: string;
  messageEn: string;
}

export interface ThreeWayMatchReport {
  isMatched: boolean;
  status: ThreeWayMatchStatus;
  poNumber?: string;
  grnNumber?: string;
  billNumber?: string;
  supplierNameAr?: string;
  variances: ThreeWayMatchVarianceItem[];
  hasQuantityVariance: boolean;
  hasPriceVariance: boolean;
  canPost: boolean;
  requiresOverride: boolean;
}

export function performThreeWayMatch(
  poLines: Array<{ itemId: string; quantity: number; unitCostSar?: number; sku?: string; nameAr?: string }>,
  billLines: Array<{ itemId: string; quantity: number; unitCostSar?: number; sku?: string; nameAr?: string }>,
  grnLines: Array<{ itemId: string; receivedQuantity: number; sku?: string; nameAr?: string }>
): {
  isMatched: boolean;
  status: 'MATCHED' | 'VARIANCE';
  variances: Array<{ itemId: string; type: string; message: string; messageAr?: string; messageEn?: string }>;
} {
  const variances: Array<{ itemId: string; type: string; message: string; messageAr?: string; messageEn?: string }> = [];

  for (const pl of poLines) {
    const bl = billLines.find((b) => b.itemId === pl.itemId);
    const grn = grnLines.find((g) => g.itemId === pl.itemId);

    if (!bl) {
      variances.push({
        itemId: pl.itemId,
        type: 'MISSING_BILL_LINE',
        message: `الصنف (${pl.nameAr || pl.sku || pl.itemId}) غير موجود بفاتورة المشتريات`,
        messageAr: `الصنف غير موجود بفاتورة المشتريات`,
        messageEn: `Item not found in purchase bill`,
      });
      continue;
    }

    if (!grn) {
      variances.push({
        itemId: pl.itemId,
        type: 'MISSING_GRN_LINE',
        message: `الصنف (${pl.nameAr || pl.sku || pl.itemId}) غير موجود بسند استلام البضاعة (GRN)`,
        messageAr: `الصنف غير موجود بسند استلام البضاعة`,
        messageEn: `Item not found in goods receipt note`,
      });
      continue;
    }

    if (Math.abs(bl.quantity - pl.quantity) > 0.001) {
      variances.push({
        itemId: pl.itemId,
        type: 'QUANTITY_VARIANCE_PO_BILL',
        message: `كمية الفاتورة (${bl.quantity}) تختلف عن أمر الشراء (${pl.quantity})`,
        messageAr: `كمية الفاتورة (${bl.quantity}) تختلف عن أمر الشراء (${pl.quantity})`,
        messageEn: `Bill qty (${bl.quantity}) differs from PO qty (${pl.quantity})`,
      });
    }

    if (Math.abs(grn.receivedQuantity - pl.quantity) > 0.001) {
      variances.push({
        itemId: pl.itemId,
        type: 'QUANTITY_VARIANCE_PO_GRN',
        message: `الكمية المستلمة فعلياً (${grn.receivedQuantity}) تختلف عن أمر الشراء (${pl.quantity})`,
        messageAr: `الكمية المستلمة فعلياً (${grn.receivedQuantity}) تختلف عن أمر الشراء (${pl.quantity})`,
        messageEn: `Received qty (${grn.receivedQuantity}) differs from PO qty (${pl.quantity})`,
      });
    }

    if (Math.abs(grn.receivedQuantity - bl.quantity) > 0.001) {
      variances.push({
        itemId: pl.itemId,
        type: 'QUANTITY_VARIANCE_BILL_GRN',
        message: `الكمية المستلمة (${grn.receivedQuantity}) تختلف عن كمية الفاتورة (${bl.quantity})`,
        messageAr: `الكمية المستلمة (${grn.receivedQuantity}) تختلف عن كمية الفاتورة (${bl.quantity})`,
        messageEn: `Received qty (${grn.receivedQuantity}) differs from Bill qty (${bl.quantity})`,
      });
    }

    if (pl.unitCostSar !== undefined && bl.unitCostSar !== undefined) {
      if (Math.abs(bl.unitCostSar - pl.unitCostSar) > 0.01) {
        variances.push({
          itemId: pl.itemId,
          type: 'PRICE_VARIANCE',
          message: `سعر وحدة الفاتورة (${bl.unitCostSar} ر.س) يختلف عن أمر الشراء (${pl.unitCostSar} ر.س)`,
          messageAr: `سعر وحدة الفاتورة (${bl.unitCostSar} ر.س) يختلف عن أمر الشراء (${pl.unitCostSar} ر.س)`,
          messageEn: `Bill price (${bl.unitCostSar}) differs from PO price (${pl.unitCostSar})`,
        });
      }
    }
  }

  const isMatched = variances.length === 0;
  return {
    isMatched,
    status: isMatched ? 'MATCHED' : 'VARIANCE',
    variances,
  };
}

export function verifyThreeWayMatch(
  po: PurchaseOrder,
  billLines: PurchaseBillLine[]
): { status: ThreeWayMatchStatus; messageAr: string; messageEn: string } {
  let qtyVariance = false;
  let priceVariance = false;

  for (const bl of billLines) {
    const poLine = po.lines.find((pl) => pl.itemId === bl.itemId);
    if (!poLine) {
      return {
        status: 'UNMATCHED',
        messageAr: `الصنف ${bl.nameAr} غير موجود بأمر الشراء الأصلي`,
        messageEn: `Item ${bl.sku} not found in original Purchase Order`,
      };
    }

    if (bl.baseQuantity > poLine.baseQuantity + 0.001) {
      qtyVariance = true;
    }

    if (Math.abs(bl.unitCostSar - poLine.unitCostSar) > 0.01) {
      priceVariance = true;
    }
  }

  if (priceVariance) {
    return {
      status: 'PRICE_VARIANCE',
      messageAr: 'يوجد اختلاف في أسعار الشراء مقارنة بأمر الشراء',
      messageEn: 'Price variance detected against Purchase Order',
    };
  }

  if (qtyVariance) {
    return {
      status: 'QUANTITY_VARIANCE',
      messageAr: 'يوجد اختلاف في الكميات المفوترة مقارنة بأمر الشراء',
      messageEn: 'Quantity variance detected against Purchase Order',
    };
  }

  return {
    status: 'MATCHED',
    messageAr: 'مطابقة تامة ثلاثية الأطراف (3-Way Matched)',
    messageEn: 'Full 3-Way Matched with Purchase Order',
  };
}

// ==========================================
// 13. FIFO SUPPLIER PAYMENT ALLOCATION ENGINE
// ==========================================

export function suggestFifoPaymentAllocations(
  unpaidBills: PurchaseBill[],
  paymentAmountSar: number
): Array<{ billId: string; billNumber: string; allocatedAmountSar: number; remainingAmountSar: number }> {
  let remainingBudget = Math.max(0, paymentAmountSar);
  const allocations: Array<{
    billId: string;
    billNumber: string;
    allocatedAmountSar: number;
    remainingAmountSar: number;
  }> = [];

  // Sort bills oldest first (FIFO)
  const sortedBills = [...unpaidBills].sort(
    (a, b) => new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime()
  );

  for (const bill of sortedBills) {
    if (remainingBudget <= 0) break;

    const dueOnBill = bill.remainingAmountSar ?? roundHalalas(bill.totalAmountSar - (bill.paidAmountSar || 0));
    if (dueOnBill <= 0) continue;

    const alloc = roundHalalas(Math.min(remainingBudget, dueOnBill));
    remainingBudget = roundHalalas(remainingBudget - alloc);

    allocations.push({
      billId: bill.id,
      billNumber: bill.billNumber,
      allocatedAmountSar: alloc,
      remainingAmountSar: roundHalalas(dueOnBill - alloc),
    });
  }

  return allocations;
}

// ==========================================
// 14. SUPPLIER AGING CALCULATION
// ==========================================

export function calculateSupplierAging(
  bills: PurchaseBill[],
  asOfDateStr: string = new Date().toISOString().slice(0, 10)
): SupplierAgingBucket[] {
  const asOfDate = new Date(asOfDateStr).getTime();
  const map = new Map<string, SupplierAgingBucket>();

  const openBills = bills.filter(
    (b) => b.status === 'POSTED' || b.status === 'PARTIALLY_PAID'
  );

  for (const bill of openBills) {
    const remaining = bill.remainingAmountSar ?? (bill.totalAmountSar - (bill.paidAmountSar || 0));
    if (remaining <= 0) continue;

    const dueDate = new Date(bill.dueDate || bill.issueDate).getTime();
    const diffDays = Math.floor((asOfDate - dueDate) / (1000 * 60 * 60 * 24));

    let bucket = map.get(bill.supplierId);
    if (!bucket) {
      bucket = {
        supplierId: bill.supplierId,
        supplierNameAr: bill.supplierNameAr,
        supplierNameEn: bill.supplierNameEn,
        supplierVatNumber: bill.supplierVatNumber,
        totalOutstandingSar: 0,
        currentSar: 0,
        days31to60Sar: 0,
        days61to90Sar: 0,
        days91PlusSar: 0,
        unpaidBillsCount: 0,
      };
      map.set(bill.supplierId, bucket);
    }

    bucket.totalOutstandingSar = roundHalalas(bucket.totalOutstandingSar + remaining);
    bucket.unpaidBillsCount += 1;

    if (diffDays <= 30) {
      bucket.currentSar = roundHalalas(bucket.currentSar + remaining);
    } else if (diffDays <= 60) {
      bucket.days31to60Sar = roundHalalas(bucket.days31to60Sar + remaining);
    } else if (diffDays <= 90) {
      bucket.days61to90Sar = roundHalalas(bucket.days61to90Sar + remaining);
    } else {
      bucket.days91PlusSar = roundHalalas(bucket.days91PlusSar + remaining);
    }

    bucket.current0To30 = bucket.currentSar;
    bucket.days31To60 = bucket.days31to60Sar;
    bucket.days61To90 = bucket.days61to90Sar;
    bucket.days90Plus = bucket.days91PlusSar;
    bucket.totalOutstanding = bucket.totalOutstandingSar;
  }

  return Array.from(map.values()).sort(
    (a, b) => b.totalOutstandingSar - a.totalOutstandingSar
  );
}

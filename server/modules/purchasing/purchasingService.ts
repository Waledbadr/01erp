/**
 * Purchasing & Accounts Payable Backend Service Engine — Saudi ERP
 * Complete implementation of Purchase Requests (PR), Purchase Orders (PO),
 * Goods Receipt Notes (GRN), Multi-method Landed Cost Allocations, 3-Way Matching,
 * Purchase Bills (Input VAT 15%), Vendor Debit Notes (Returns), Supplier Payments,
 * Payment Reallocations, Price History, and General Ledger Double-Entry (Rule G1-G8, I1-I6).
 */

import crypto from 'crypto';
import {
  CentralTenantDataStore,
  TenantContext,
  scrubSensitiveFinancialFields,
} from '../../core/tenantGuard.js';
import {
  PurchaseRequest,
  PurchaseRequestLine,
  PurchaseRequestStatus,
  PurchaseRequestPriority,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderStatus,
  GoodsReceiptNote,
  GRNLine,
  GRNStatus,
  PurchaseBill,
  PurchaseBillLine,
  PurchaseBillStatus,
  VendorDebitNote,
  SupplierPayment,
  SupplierPaymentAllocation,
  PurchasingPaymentMethod,
  DebitNoteReason,
  ThreeWayMatchStatus,
  ThreeWayMatchPolicy,
  OverReceivePolicy,
  LandedCostMethod,
  LandedCostItemInput,
  LandedCostAllocationResultLine,
  SupplierPriceRecord,
  SupplierStatement,
  SupplierStatementLine,
  SupplierAgingBucket,
  ThreeWayMatchReport,
  calculatePurchasingLine,
  calculatePurchasingTotals,
  allocateLandedCosts,
  performThreeWayMatch,
  verifyThreeWayMatch,
  suggestFifoPaymentAllocations,
  calculateSupplierAging,
  roundHalalas,
  toHalalasInt,
  fromHalalasInt,
} from '../../../src/lib/purchasing.js';
import { StockMovement } from '../../../src/lib/inventory.js';
import { logger } from '../../core/logger.js';

// ==========================================
// PAYLOAD INTERFACES
// ==========================================

export interface CreatePurchaseRequestPayload {
  branchId?: string;
  department?: string;
  requiredByDate?: string;
  priority?: PurchaseRequestPriority;
  notes?: string;
  lines: Array<{
    itemId: string;
    uomId?: string;
    quantity: number;
    estimatedUnitCostSar?: number;
    notes?: string;
  }>;
}

export interface CreatePurchaseOrderPayload {
  branchId?: string;
  purchaseRequestId?: string;
  supplierId: string;
  orderDate?: string;
  expectedDeliveryDate?: string;
  overReceivePolicy?: OverReceivePolicy;
  notes?: string;
  lines: Array<{
    itemId: string;
    uomId?: string;
    quantity: number;
    unitCostSar: number;
    discountPercent?: number;
    taxRate?: number;
  }>;
}

export interface CreateGRNPayload {
  branchId?: string;
  warehouseId?: string;
  supplierId?: string;
  purchaseOrderId?: string;
  deliveryNoteNumber?: string;
  carrierName?: string;
  vehiclePlate?: string;
  receiptDate?: string;
  isOverReceiveOverridden?: boolean;
  overReceiveOverrideReason?: string;
  attachments?: string[];
  notes?: string;
  lines: Array<{
    itemId: string;
    uomId?: string;
    quantity: number;
    unitCostSar?: number;
    poLineId?: string;
    batchNumber?: string;
    expiryDate?: string;
  }>;
}

export interface AllocateLandedCostPayload {
  grnId?: string;
  billId?: string;
  warehouseId?: string;
  totalLandedCostSar: number;
  method?: LandedCostMethod;
  percentageRate?: number;
  paymentMethod?: 'CASH' | 'BANK_TRANSFER' | 'AP_VENDOR';
  serviceProviderName?: string;
  descriptionAr?: string;
  costItems?: LandedCostItemInput[];
  manualLineCosts?: Array<{ itemId: string; amountSar: number }>;
}

export interface CreatePurchaseBillPayload {
  branchId?: string;
  warehouseId?: string;
  supplierId: string;
  supplierInvoiceNumber: string;
  purchaseOrderId?: string;
  grnId?: string;
  issueDate?: string;
  dueDate?: string;
  paymentMethod?: PurchasingPaymentMethod;
  notes?: string;
  threeWayMatchOverrideReason?: string;
  lines: Array<{
    itemId: string;
    uomId?: string;
    quantity: number;
    unitCostSar: number;
    discountPercent?: number;
    taxRate?: number;
    warehouseId?: string;
    grnId?: string;
  }>;
}

export interface CreateVendorDebitNotePayload {
  originalBillId: string;
  reasonCode: DebitNoteReason;
  reasonDescription: string;
  issueDate?: string;
  notes?: string;
  lines?: Array<{
    itemId: string;
    uomId?: string;
    quantity: number;
    unitCostSar: number;
    taxRate?: number;
  }>;
}

export interface CreateSupplierPaymentPayload {
  supplierId: string;
  branchId?: string;
  paymentDate?: string;
  amountSar: number;
  paymentMethod: PurchasingPaymentMethod;
  referenceNumber?: string;
  isAdvance?: boolean;
  allocations?: Array<{
    billId: string;
    allocatedAmountSar: number;
  }>;
  notes?: string;
}

// ==========================================
// 1. PURCHASE REQUESTS (PR) SERVICES
// ==========================================

export function getPurchaseRequestsService(
  store: CentralTenantDataStore,
  context: TenantContext,
  filters?: { search?: string; status?: string; priority?: string }
): PurchaseRequest[] {
  const list = store.purchaseRequests.get(context.tenantId) || [];
  let result = [...list];

  if (filters?.status) {
    result = result.filter((r) => r.status === filters.status);
  }
  if (filters?.priority) {
    result = result.filter((r) => r.priority === filters.priority);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (r) =>
        r.requestNumber.toLowerCase().includes(q) ||
        r.requesterName.toLowerCase().includes(q) ||
        (r.department && r.department.toLowerCase().includes(q)) ||
        (r.notes && r.notes.toLowerCase().includes(q))
    );
  }

  return result.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getPurchaseRequestByIdService(
  store: CentralTenantDataStore,
  context: TenantContext,
  id: string
): PurchaseRequest | null {
  const list = store.purchaseRequests.get(context.tenantId) || [];
  return list.find((r) => r.id === id) || null;
}

export function createPurchaseRequestService(
  store: CentralTenantDataStore,
  context: TenantContext,
  payload: CreatePurchaseRequestPayload
): PurchaseRequest {
  if (!payload.lines || payload.lines.length === 0) {
    throw new Error('PURCHASE_REQUEST_EMPTY_LINES: Purchase request must have at least one item line.');
  }

  const items = store.items.get(context.tenantId) || [];
  const branches = store.branches.get(context.tenantId) || [];
  const branch = branches.find((b) => b.id === payload.branchId) || branches[0];

  const now = new Date();
  const year = now.getFullYear();
  const existingRequests = store.purchaseRequests.get(context.tenantId) || [];
  const seqNum = existingRequests.length + 1;
  const requestNumber = `PR-${year}-${seqNum.toString().padStart(5, '0')}`;

  let totalEstimatedHalalas = 0n;

  const lines: PurchaseRequestLine[] = payload.lines.map((l) => {
    const item = items.find((i) => i.id === l.itemId);
    if (!item) {
      throw new Error(`ITEM_NOT_FOUND: Item ${l.itemId} not found.`);
    }

    const uom = item.units.find((u) => u.id === l.uomId) || item.units[0];
    const conversionFactor = uom.conversionFactor || 1;
    const qty = Math.max(0, l.quantity || 0);
    const baseQty = Math.round(qty * conversionFactor * 1000) / 1000;
    const unitCost = l.estimatedUnitCostSar !== undefined ? l.estimatedUnitCostSar : (item.cost || 0);
    const lineTotal = roundHalalas(qty * unitCost);

    totalEstimatedHalalas += toHalalasInt(lineTotal);

    return {
      id: crypto.randomUUID(),
      itemId: item.id,
      sku: item.sku,
      nameAr: item.nameAr,
      nameEn: item.nameEn,
      uomId: uom.id,
      uomName: uom.nameAr,
      conversionFactor,
      quantity: qty,
      baseQuantity: baseQty,
      estimatedUnitCostSar: unitCost,
      estimatedTotalSar: lineTotal,
      notes: l.notes,
    };
  });

  const request: PurchaseRequest = {
    id: crypto.randomUUID(),
    tenantId: context.tenantId,
    branchId: branch ? branch.id : crypto.randomUUID(),
    branchNameAr: branch ? branch.nameAr : 'الفرع الرئيسي',
    requestNumber,
    requesterId: context.userId,
    requesterName: context.userEmail.split('@')[0],
    department: payload.department || 'المشتريات والعمليات',
    requestDate: now.toISOString().slice(0, 10),
    requiredByDate: payload.requiredByDate,
    priority: payload.priority || 'MEDIUM',
    status: 'DRAFT',
    totalEstimatedSar: fromHalalasInt(totalEstimatedHalalas),
    notes: payload.notes,
    lines,
    createdBy: context.userId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  existingRequests.push(request);
  store.purchaseRequests.set(context.tenantId, existingRequests);

  store.recordAuditLog({
    tenantId: context.tenantId,
    userId: context.userId,
    userEmail: context.userEmail,
    action: 'CREATE_PURCHASE_REQUEST',
    resourceType: 'purchase_requests',
    resourceId: request.id,
    correlationId: context.correlationId,
    changesDiff: { requestNumber, totalEstimatedSar: request.totalEstimatedSar },
  });

  return request;
}

export function submitPurchaseRequestService(
  store: CentralTenantDataStore,
  context: TenantContext,
  id: string
): PurchaseRequest {
  const requests = store.purchaseRequests.get(context.tenantId) || [];
  const req = requests.find((r) => r.id === id);
  if (!req) {
    throw new Error(`PURCHASE_REQUEST_NOT_FOUND: Purchase request ${id} not found.`);
  }

  if (req.status !== 'DRAFT') {
    throw new Error(`INVALID_STATUS: Can only submit draft purchase requests.`);
  }

  req.status = 'SUBMITTED';
  req.updatedAt = new Date().toISOString();
  store.purchaseRequests.set(context.tenantId, requests);

  store.recordAuditLog({
    tenantId: context.tenantId,
    userId: context.userId,
    userEmail: context.userEmail,
    action: 'SUBMIT_PURCHASE_REQUEST',
    resourceType: 'purchase_requests',
    resourceId: req.id,
    correlationId: context.correlationId,
  });

  return req;
}

export function approvePurchaseRequestService(
  store: CentralTenantDataStore,
  context: TenantContext,
  id: string
): PurchaseRequest {
  const requests = store.purchaseRequests.get(context.tenantId) || [];
  const req = requests.find((r) => r.id === id);
  if (!req) {
    throw new Error(`PURCHASE_REQUEST_NOT_FOUND: Purchase request ${id} not found.`);
  }

  if (req.status !== 'SUBMITTED' && req.status !== 'DRAFT') {
    throw new Error(`INVALID_STATUS: Can only approve submitted purchase requests.`);
  }

  req.status = 'APPROVED';
  req.approvedBy = context.userEmail;
  req.approvedAt = new Date().toISOString();
  req.updatedAt = new Date().toISOString();
  store.purchaseRequests.set(context.tenantId, requests);

  store.recordAuditLog({
    tenantId: context.tenantId,
    userId: context.userId,
    userEmail: context.userEmail,
    action: 'APPROVE_PURCHASE_REQUEST',
    resourceType: 'purchase_requests',
    resourceId: req.id,
    correlationId: context.correlationId,
  });

  return req;
}

export function rejectPurchaseRequestService(
  store: CentralTenantDataStore,
  context: TenantContext,
  id: string,
  reason: string
): PurchaseRequest {
  const requests = store.purchaseRequests.get(context.tenantId) || [];
  const req = requests.find((r) => r.id === id);
  if (!req) {
    throw new Error(`PURCHASE_REQUEST_NOT_FOUND: Purchase request ${id} not found.`);
  }

  req.status = 'REJECTED';
  req.rejectedReason = reason || 'تم رفض طلب الشراء من قبل الإدارة';
  req.updatedAt = new Date().toISOString();
  store.purchaseRequests.set(context.tenantId, requests);

  store.recordAuditLog({
    tenantId: context.tenantId,
    userId: context.userId,
    userEmail: context.userEmail,
    action: 'REJECT_PURCHASE_REQUEST',
    resourceType: 'purchase_requests',
    resourceId: req.id,
    correlationId: context.correlationId,
    changesDiff: { reason },
  });

  return req;
}

export function convertPRToPOService(
  store: CentralTenantDataStore,
  context: TenantContext,
  prId: string,
  supplierId: string
): PurchaseOrder {
  const req = getPurchaseRequestByIdService(store, context, prId);
  if (!req) {
    throw new Error(`PURCHASE_REQUEST_NOT_FOUND: Purchase request ${prId} not found.`);
  }

  if (req.status !== 'APPROVED') {
    throw new Error(`PR_NOT_APPROVED: Can only convert approved purchase requests to PO.`);
  }

  const po = createPurchaseOrderService(store, context, {
    branchId: req.branchId,
    purchaseRequestId: req.id,
    supplierId,
    notes: `تم إنشاء أمر الشراء بناءً على طلب الشراء المعتمد ${req.requestNumber}`,
    lines: req.lines.map((l) => ({
      itemId: l.itemId,
      uomId: l.uomId,
      quantity: l.quantity,
      unitCostSar: l.estimatedUnitCostSar,
    })),
  });

  req.status = 'ORDERED';
  req.purchaseOrderId = po.id;
  req.purchaseOrderNumber = po.orderNumber;
  req.updatedAt = new Date().toISOString();

  const requests = store.purchaseRequests.get(context.tenantId) || [];
  const idx = requests.findIndex((r) => r.id === req.id);
  if (idx >= 0) {
    requests[idx] = req;
    store.purchaseRequests.set(context.tenantId, requests);
  }

  return po;
}

// ==========================================
// 2. PURCHASE ORDERS (PO) SERVICES
// ==========================================

export function getPurchaseOrdersService(
  store: CentralTenantDataStore,
  context: TenantContext,
  filters?: { search?: string; status?: string; supplierId?: string }
): PurchaseOrder[] {
  const list = store.purchaseOrders.get(context.tenantId) || [];
  let result = [...list];

  if (filters?.status) {
    result = result.filter((po) => po.status === filters.status);
  }
  if (filters?.supplierId) {
    result = result.filter((po) => po.supplierId === filters.supplierId);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (po) =>
        po.orderNumber.toLowerCase().includes(q) ||
        po.supplierNameAr.toLowerCase().includes(q) ||
        po.supplierNameEn.toLowerCase().includes(q) ||
        (po.notes && po.notes.toLowerCase().includes(q))
    );
  }

  return result.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getPurchaseOrderByIdService(
  store: CentralTenantDataStore,
  context: TenantContext,
  id: string
): PurchaseOrder | null {
  const list = store.purchaseOrders.get(context.tenantId) || [];
  return list.find((po) => po.id === id) || null;
}

export function createPurchaseOrderService(
  store: CentralTenantDataStore,
  context: TenantContext,
  payload: CreatePurchaseOrderPayload
): PurchaseOrder {
  if (!payload.supplierId) {
    throw new Error('SUPPLIER_REQUIRED: Supplier ID is required for Purchase Order.');
  }
  if (!payload.lines || payload.lines.length === 0) {
    throw new Error('PO_EMPTY_LINES: Purchase order must have at least one line.');
  }

  const suppliers = store.suppliers.get(context.tenantId) || [];
  const supplier = suppliers.find((s) => s.id === payload.supplierId);
  if (!supplier) {
    throw new Error(`SUPPLIER_NOT_FOUND: Supplier ${payload.supplierId} not found.`);
  }

  if (supplier.status === 'SUSPENDED') {
    throw new Error(`SUPPLIER_SUSPENDED: Cannot create purchase order for suspended supplier ${supplier.nameAr}.`);
  }

  const items = store.items.get(context.tenantId) || [];
  const branches = store.branches.get(context.tenantId) || [];
  const branch = branches.find((b) => b.id === payload.branchId) || branches[0];

  const now = new Date();
  const year = now.getFullYear();
  const existingOrders = store.purchaseOrders.get(context.tenantId) || [];
  const seqNum = existingOrders.length + 1;
  const orderNumber = `PO-${year}-${seqNum.toString().padStart(5, '0')}`;

  const lines: PurchaseOrderLine[] = payload.lines.map((l) => {
    const item = items.find((i) => i.id === l.itemId);
    if (!item) {
      throw new Error(`ITEM_NOT_FOUND: Item ${l.itemId} not found.`);
    }

    const uom = item.units.find((u) => u.id === l.uomId) || item.units[0];
    const conversionFactor = uom.conversionFactor || 1;
    const calc = calculatePurchasingLine({
      quantity: l.quantity,
      unitCostSar: l.unitCostSar,
      discountPercent: l.discountPercent || 0,
      taxRate: l.taxRate !== undefined ? l.taxRate : 15,
      conversionFactor,
    });

    return {
      id: crypto.randomUUID(),
      itemId: item.id,
      sku: item.sku,
      nameAr: item.nameAr,
      nameEn: item.nameEn,
      uomId: uom.id,
      uomName: uom.nameAr,
      conversionFactor,
      quantity: l.quantity,
      baseQuantity: calc.baseQuantity,
      unitCostSar: l.unitCostSar,
      discountPercent: l.discountPercent || 0,
      discountAmountSar: calc.discountAmountSar,
      taxableAmountSar: calc.taxableAmountSar,
      taxRate: l.taxRate !== undefined ? l.taxRate : 15,
      taxAmountSar: calc.taxAmountSar,
      totalAmountSar: calc.totalAmountSar,
      receivedQuantity: 0,
      remainingQuantity: l.quantity,
      billedQuantity: 0,
      remainingBilledQuantity: l.quantity,
    };
  });

  const totals = calculatePurchasingTotals(lines);

  const po: PurchaseOrder = {
    id: crypto.randomUUID(),
    tenantId: context.tenantId,
    branchId: branch ? branch.id : crypto.randomUUID(),
    branchNameAr: branch ? branch.nameAr : 'الفرع الرئيسي',
    orderNumber,
    purchaseRequestId: payload.purchaseRequestId,
    supplierId: supplier.id,
    supplierNameAr: supplier.nameAr,
    supplierNameEn: supplier.nameEn || supplier.nameAr,
    supplierVatNumber: supplier.vatNumber,
    supplierCrNumber: supplier.crNumber,
    orderDate: payload.orderDate || now.toISOString().slice(0, 10),
    expectedDeliveryDate: payload.expectedDeliveryDate,
    status: 'CONFIRMED',
    overReceivePolicy: payload.overReceivePolicy || 'BLOCK',
    subtotalSar: totals.subtotalSar,
    discountTotalSar: totals.discountTotalSar,
    taxTotalSar: totals.taxTotalSar,
    totalAmountSar: totals.totalAmountSar,
    totalOrderedQuantity: lines.reduce((sum, l) => sum + l.quantity, 0),
    totalReceivedQuantity: 0,
    notes: payload.notes,
    lines,
    createdBy: context.userId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  existingOrders.push(po);
  store.purchaseOrders.set(context.tenantId, existingOrders);

  store.recordAuditLog({
    tenantId: context.tenantId,
    userId: context.userId,
    userEmail: context.userEmail,
    action: 'CREATE_PURCHASE_ORDER',
    resourceType: 'purchase_orders',
    resourceId: po.id,
    correlationId: context.correlationId,
    changesDiff: { orderNumber, totalAmountSar: po.totalAmountSar },
  });

  return po;
}

export function confirmPurchaseOrderService(
  store: CentralTenantDataStore,
  context: TenantContext,
  id: string
): PurchaseOrder {
  const orders = store.purchaseOrders.get(context.tenantId) || [];
  const po = orders.find((o) => o.id === id);
  if (!po) {
    throw new Error(`PO_NOT_FOUND: Purchase order ${id} not found.`);
  }

  po.status = 'CONFIRMED';
  po.updatedAt = new Date().toISOString();
  store.purchaseOrders.set(context.tenantId, orders);

  store.recordAuditLog({
    tenantId: context.tenantId,
    userId: context.userId,
    userEmail: context.userEmail,
    action: 'CONFIRM_PURCHASE_ORDER',
    resourceType: 'purchase_orders',
    resourceId: po.id,
    correlationId: context.correlationId,
  });

  return po;
}

export function cancelPurchaseOrderService(
  store: CentralTenantDataStore,
  context: TenantContext,
  id: string,
  reason?: string
): PurchaseOrder {
  const orders = store.purchaseOrders.get(context.tenantId) || [];
  const po = orders.find((o) => o.id === id);
  if (!po) {
    throw new Error(`PO_NOT_FOUND: Purchase order ${id} not found.`);
  }

  if (po.status === 'RECEIVED' || po.status === 'BILLED') {
    throw new Error(`CANNOT_CANCEL: Cannot cancel an already received or billed purchase order.`);
  }

  po.status = 'CANCELLED';
  po.notes = po.notes ? `${po.notes} (Cancelled: ${reason || 'User cancelled'})` : `Cancelled: ${reason || 'User cancelled'}`;
  po.updatedAt = new Date().toISOString();
  store.purchaseOrders.set(context.tenantId, orders);

  return po;
}

// ==========================================
// 3. GOODS RECEIPT NOTES (GRN) & STOCK RECEIPTS
// ==========================================

export function getGoodsReceiptNotesService(
  store: CentralTenantDataStore,
  context: TenantContext,
  filters?: { search?: string; status?: string; supplierId?: string; poId?: string }
): GoodsReceiptNote[] {
  const list = store.goodsReceiptNotes.get(context.tenantId) || [];
  let result = [...list];

  if (filters?.status) {
    result = result.filter((g) => g.status === filters.status);
  }
  if (filters?.supplierId) {
    result = result.filter((g) => g.supplierId === filters.supplierId);
  }
  if (filters?.poId) {
    result = result.filter((g) => g.purchaseOrderId === filters.poId);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (g) =>
        g.grnNumber.toLowerCase().includes(q) ||
        g.supplierNameAr.toLowerCase().includes(q) ||
        (g.deliveryNoteNumber && g.deliveryNoteNumber.toLowerCase().includes(q)) ||
        (g.purchaseOrderNumber && g.purchaseOrderNumber.toLowerCase().includes(q))
    );
  }

  return result.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getGoodsReceiptNoteByIdService(
  store: CentralTenantDataStore,
  context: TenantContext,
  id: string
): GoodsReceiptNote | null {
  const list = store.goodsReceiptNotes.get(context.tenantId) || [];
  return list.find((g) => g.id === id) || null;
}

export function createGoodsReceiptNoteService(
  store: CentralTenantDataStore,
  context: TenantContext,
  payload: CreateGRNPayload
): GoodsReceiptNote {
  if (!payload.lines || payload.lines.length === 0) {
    throw new Error('GRN_EMPTY_LINES: Goods receipt note must have at least one line.');
  }

  const items = store.items.get(context.tenantId) || [];
  const warehouses = store.warehouses.get(context.tenantId) || [];
  const warehouse = warehouses.find((w) => w.id === payload.warehouseId) || warehouses[0];
  if (!warehouse) {
    throw new Error('WAREHOUSE_REQUIRED: Warehouse is required for goods receipt.');
  }

  const branches = store.branches.get(context.tenantId) || [];
  const branch = branches.find((b) => b.id === payload.branchId) || branches[0];

  let po: PurchaseOrder | null = null;
  if (payload.purchaseOrderId) {
    const orders = store.purchaseOrders.get(context.tenantId) || [];
    po = orders.find((o) => o.id === payload.purchaseOrderId) || null;
    if (!po) {
      throw new Error(`PO_NOT_FOUND: Linked Purchase Order ${payload.purchaseOrderId} not found.`);
    }
  }

  const suppliers = store.suppliers.get(context.tenantId) || [];
  const supplierId = payload.supplierId || (po ? po.supplierId : '');
  const supplier = suppliers.find((s) => s.id === supplierId);
  if (!supplier) {
    throw new Error(`SUPPLIER_REQUIRED: Valid supplier required for goods receipt.`);
  }

  const now = new Date();
  const year = now.getFullYear();
  const existingGRNs = store.goodsReceiptNotes.get(context.tenantId) || [];
  const seqNum = existingGRNs.length + 1;
  const grnNumber = `GRN-${year}-${seqNum.toString().padStart(5, '0')}`;

  let isOverReceived = false;
  let totalQty = 0;
  let totalBaseQty = 0;
  let totalCostHalalas = 0n;

  const lines: GRNLine[] = payload.lines.map((l) => {
    const item = items.find((i) => i.id === l.itemId);
    if (!item) {
      throw new Error(`ITEM_NOT_FOUND: Item ${l.itemId} not found.`);
    }

    const uom = item.units.find((u) => u.id === l.uomId) || item.units[0];
    const conversionFactor = uom.conversionFactor || 1;
    const qty = Math.max(0, l.quantity || 0);
    const baseQty = Math.round(qty * conversionFactor * 1000) / 1000;

    let poLine: PurchaseOrderLine | undefined;
    let orderedQty = 0;
    let prevReceivedQty = 0;
    let remainingPoQty = qty;
    let varianceQty = 0;

    if (po) {
      poLine = po.lines.find((pl) => pl.itemId === item.id || pl.id === l.poLineId);
      if (poLine) {
        orderedQty = poLine.quantity;
        prevReceivedQty = poLine.receivedQuantity || 0;
        remainingPoQty = Math.max(0, orderedQty - prevReceivedQty);
        if (qty > remainingPoQty) {
          isOverReceived = true;
          varianceQty = roundHalalas(qty - remainingPoQty);
        }
      }
    }

    const unitCost = l.unitCostSar !== undefined
      ? l.unitCostSar
      : (poLine ? poLine.unitCostSar : (item.cost || 0));
    const baseUnitCost = conversionFactor > 0 ? roundHalalas(unitCost / conversionFactor) : unitCost;
    const lineTotal = roundHalalas(qty * unitCost);

    totalQty += qty;
    totalBaseQty += baseQty;
    totalCostHalalas += toHalalasInt(lineTotal);

    return {
      id: crypto.randomUUID(),
      itemId: item.id,
      sku: item.sku,
      nameAr: item.nameAr,
      nameEn: item.nameEn,
      uomId: uom.id,
      uomName: uom.nameAr,
      conversionFactor,
      quantity: qty,
      baseQuantity: baseQty,
      unitCostSar: unitCost,
      baseUnitCostSar: baseUnitCost,
      totalCostSar: lineTotal,
      poLineId: poLine ? poLine.id : l.poLineId,
      orderedQuantity: orderedQty,
      previousReceivedQuantity: prevReceivedQty,
      remainingPoQuantity: remainingPoQty,
      varianceQuantity: varianceQty,
      batchNumber: l.batchNumber,
      expiryDate: l.expiryDate,
      effectiveUnitCostSar: unitCost,
    };
  });

  // Check Over-Receive Policy
  if (isOverReceived && po && (po.overReceivePolicy === 'BLOCK' || !po.overReceivePolicy)) {
    if (!payload.isOverReceiveOverridden && !payload.overReceiveOverrideReason) {
      throw new Error(
        `OVER_RECEIVE_BLOCKED: The received quantity exceeds the purchase order remaining balance. Over-receive policy is BLOCK. Authorization override reason is required.`
      );
    }
  }

  const stockMovementIds: string[] = [];

  // Update Inventory Balance & WAC (Rule I1 / I6)
  const stockMovements = store.stockMovements.get(context.tenantId) || [];
  for (const line of lines) {
    const item = items.find((i) => i.id === line.itemId);
    if (!item) continue;

    const currentQty = item.currentStock || 0;
    const currentWac = item.currentWac || item.cost || 0;
    const incomingQty = line.baseQuantity;
    const incomingCost = line.baseUnitCostSar;

    const newTotalQty = currentQty + incomingQty;
    let newWac = currentWac;
    if (newTotalQty > 0) {
      const currentTotalVal = currentQty * currentWac;
      const incomingTotalVal = incomingQty * incomingCost;
      newWac = roundHalalas((currentTotalVal + incomingTotalVal) / newTotalQty);
    }

    item.currentStock = newTotalQty;
    item.currentWac = newWac;
    item.cost = newWac;
    item.updatedAt = now.toISOString();

    const mvtId = crypto.randomUUID();
    stockMovementIds.push(mvtId);

    const mvt: StockMovement = {
      id: mvtId,
      tenantId: context.tenantId,
      warehouseId: warehouse.id,
      warehouseNameAr: warehouse.nameAr,
      itemId: item.id,
      sku: item.sku,
      itemNameAr: item.nameAr,
      movementType: 'PURCHASE_RECEIPT',
      quantityDelta: incomingQty,
      unitCostApplied: incomingCost,
      resultingWac: newWac,
      valueDelta: roundHalalas(incomingQty * incomingCost),
      resultingStock: newTotalQty,
      sourceType: 'PURCHASE_RECEIPT',
      sourceId: grnNumber,
      sourceDocumentNumber: grnNumber,
      notes: `استلام بضاعة سند رقم ${grnNumber}`,
      batchNumber: line.batchNumber,
      userId: context.userId,
      userEmail: context.userEmail,
      movementDate: payload.receiptDate || now.toISOString().slice(0, 10),
      createdAt: now.toISOString(),
    };
    stockMovements.push(mvt);

    // Record price history
    recordSupplierPriceService(store, context, {
      supplierId: supplier.id,
      supplierNameAr: supplier.nameAr,
      itemId: item.id,
      itemSku: item.sku,
      itemNameAr: item.nameAr,
      uomId: line.uomId,
      uomName: line.uomName,
      unitCostSar: line.unitCostSar,
      baseUnitCostSar: line.baseUnitCostSar,
      discountPercent: 0,
      sourceType: 'GRN',
      sourceNumber: grnNumber,
    });
  }
  store.items.set(context.tenantId, items);
  store.stockMovements.set(context.tenantId, stockMovements);

  // Update PO lines & status if linked
  if (po) {
    let allReceived = true;
    for (const poLine of po.lines) {
      const grnLine = lines.find((gl) => gl.itemId === poLine.itemId);
      if (grnLine) {
        poLine.receivedQuantity = roundHalalas((poLine.receivedQuantity || 0) + grnLine.quantity);
        poLine.remainingQuantity = Math.max(0, roundHalalas(poLine.quantity - poLine.receivedQuantity));
      }
      if (poLine.remainingQuantity > 0) {
        allReceived = false;
      }
    }

    po.status = allReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
    po.totalReceivedQuantity = po.lines.reduce((sum, l) => sum + (l.receivedQuantity || 0), 0);
    po.updatedAt = now.toISOString();

    const orders = store.purchaseOrders.get(context.tenantId) || [];
    const pIdx = orders.findIndex((o) => o.id === po!.id);
    if (pIdx >= 0) {
      orders[pIdx] = po;
      store.purchaseOrders.set(context.tenantId, orders);
    }
  }

  const grn: GoodsReceiptNote = {
    id: crypto.randomUUID(),
    tenantId: context.tenantId,
    branchId: branch ? branch.id : crypto.randomUUID(),
    branchNameAr: branch ? branch.nameAr : 'الفرع الرئيسي',
    warehouseId: warehouse.id,
    warehouseNameAr: warehouse.nameAr,
    grnNumber,
    supplierId: supplier.id,
    supplierNameAr: supplier.nameAr,
    supplierNameEn: supplier.nameEn || supplier.nameAr,
    supplierVatNumber: supplier.vatNumber,
    purchaseOrderId: po ? po.id : undefined,
    purchaseOrderNumber: po ? po.orderNumber : undefined,
    deliveryNoteNumber: payload.deliveryNoteNumber,
    carrierName: payload.carrierName,
    vehiclePlate: payload.vehiclePlate,
    receiptDate: payload.receiptDate || now.toISOString().slice(0, 10),
    status: 'POSTED',
    totalQuantity: totalQty,
    totalBaseQuantity: totalBaseQty,
    totalCostSar: fromHalalasInt(totalCostHalalas),
    isOverReceived,
    overReceiveOverrideReason: isOverReceived ? payload.overReceiveOverrideReason : undefined,
    overReceiveOverriddenBy: isOverReceived ? context.userEmail : undefined,
    attachments: payload.attachments || [],
    stockMovementIds,
    notes: payload.notes,
    lines,
    createdBy: context.userId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  existingGRNs.push(grn);
  store.goodsReceiptNotes.set(context.tenantId, existingGRNs);

  if (isOverReceived) {
    store.recordAuditLog({
      tenantId: context.tenantId,
      userId: context.userId,
      userEmail: context.userEmail,
      action: 'GRN_OVER_RECEIVE_OVERRIDE',
      resourceType: 'goods_receipt_notes',
      resourceId: grn.id,
      correlationId: context.correlationId,
      changesDiff: {
        grnNumber,
        overrideReason: payload.overReceiveOverrideReason,
      },
    });
  }

  store.recordAuditLog({
    tenantId: context.tenantId,
    userId: context.userId,
    userEmail: context.userEmail,
    action: 'CREATE_GOODS_RECEIPT_NOTE',
    resourceType: 'goods_receipt_notes',
    resourceId: grn.id,
    correlationId: context.correlationId,
    changesDiff: { grnNumber, totalCostSar: grn.totalCostSar },
  });

  return grn;
}

// ==========================================
// 4. LANDED COST ENGINE (Rule I4 / Phase 05 I3)
// ==========================================

export function allocateLandedCostService(
  store: CentralTenantDataStore,
  context: TenantContext,
  payload: AllocateLandedCostPayload
): {
  success: boolean;
  totalLandedCostSar: number;
  method: LandedCostMethod;
  allocatedLines: LandedCostAllocationResultLine[];
  journalId?: string;
  journalNumber?: string;
} {
  if (!payload.totalLandedCostSar || payload.totalLandedCostSar <= 0) {
    throw new Error('LANDED_COST_POSITIVE: Total landed cost must be greater than zero.');
  }

  let grn: GoodsReceiptNote | null = null;
  let bill: PurchaseBill | null = null;

  if (payload.grnId) {
    const grnList = store.goodsReceiptNotes.get(context.tenantId) || [];
    grn = grnList.find((g) => g.id === payload.grnId) || null;
  }
  if (payload.billId) {
    const billList = store.purchaseBills.get(context.tenantId) || [];
    bill = billList.find((b) => b.id === payload.billId) || null;
  }

  if (!grn && !bill) {
    throw new Error('DOCUMENT_REQUIRED: Either GRN ID or Bill ID is required for landed cost allocation.');
  }

  const linesToAllocate = grn ? grn.lines : bill!.lines;
  const method = payload.method || 'BY_VALUE';

  const allocated = allocateLandedCosts(
    linesToAllocate.map((l) => ({
      itemId: l.itemId,
      sku: l.sku,
      nameAr: l.nameAr,
      quantity: l.quantity,
      baseQuantity: l.baseQuantity,
      unitCostSar: l.unitCostSar,
      manualExtraCostSar: payload.manualLineCosts?.find((m) => m.itemId === l.itemId)?.amountSar,
    })),
    payload.totalLandedCostSar,
    method,
    payload.percentageRate
  );

  // Update effective costs in GRN or Bill
  if (grn) {
    grn.landedCostAllocatedSar = roundHalalas(
      (grn.landedCostAllocatedSar || 0) + payload.totalLandedCostSar
    );
    for (const line of grn.lines) {
      const match = allocated.find((a) => a.itemId === line.itemId);
      if (match) {
        line.landedCostShareSar = match.allocatedLandedCostSar;
        line.effectiveUnitCostSar = match.effectiveUnitCostSar;
      }
    }
  }

  if (bill) {
    bill.landedCostAllocatedSar = roundHalalas(
      (bill.landedCostAllocatedSar || 0) + payload.totalLandedCostSar
    );
    for (const line of bill.lines) {
      const match = allocated.find((a) => a.itemId === line.itemId);
      if (match) {
        line.landedCostShareSar = match.allocatedLandedCostSar;
        line.effectiveUnitCostSar = match.effectiveUnitCostSar;
      }
    }
  }

  // Recalculate WAC with landed cost capitalization (Rule I1/I6)
  const items = store.items.get(context.tenantId) || [];
  for (const allocLine of allocated) {
    const item = items.find((i) => i.id === allocLine.itemId);
    if (!item) continue;

    const currentQty = item.currentStock || 0;
    const currentWac = item.currentWac || item.cost || 0;
    const extraLandedSar = allocLine.allocatedLandedCostSar;

    // Capitalize landed cost into total value
    if (currentQty > 0 && extraLandedSar > 0) {
      const currentVal = currentQty * currentWac;
      const newVal = currentVal + extraLandedSar;
      item.currentWac = roundHalalas(newVal / currentQty);
      item.cost = item.currentWac;
      item.updatedAt = new Date().toISOString();
    }
  }
  store.items.set(context.tenantId, items);

  // Create Double-Entry GL Journal for Landed Cost (Rule G1):
  // Dr Inventory Asset (10401)
  // Cr Accounts Payable (20101) or Cash/Bank (10101/10102)
  const branches = store.branches.get(context.tenantId) || [];
  const branch = branches[0];

  const now = new Date();
  const year = now.getFullYear();
  const journals = store.journals.get(context.tenantId) || [];
  const journalNumber = `JV-${year}-${(journals.length + 1).toString().padStart(5, '0')}`;
  const journalId = crypto.randomUUID();

  const creditAccountCode = payload.paymentMethod === 'CASH'
    ? '10101'
    : payload.paymentMethod === 'BANK_TRANSFER'
    ? '10102'
    : '20101'; // Default AP

  const journalLines = [
    {
      id: crypto.randomUUID(),
      journalId,
      accountId: '10401', // المخزون السلعي (Inventory)
      accountCode: '10401',
      accountNameAr: 'المخزون السلعي',
      accountNameEn: 'Merchandise Inventory',
      debit: payload.totalLandedCostSar.toFixed(2),
      credit: '0.00',
      descriptionAr: `رسملة مصاريف إنزال وشحن ${grn ? `لسند ${grn.grnNumber}` : `لفاتورة ${bill?.billNumber}`}`,
      descriptionEn: `Landed cost freight/customs capitalization`,
      costCenterId: undefined,
    },
    {
      id: crypto.randomUUID(),
      journalId,
      accountId: creditAccountCode,
      accountCode: creditAccountCode,
      accountNameAr: creditAccountCode === '20101' ? 'الموردون والمستحقات' : 'النقدية وما في حكمها',
      accountNameEn: creditAccountCode === '20101' ? 'Accounts Payable' : 'Cash & Banks',
      debit: '0.00',
      credit: payload.totalLandedCostSar.toFixed(2),
      descriptionAr: `سداد مصاريف إنزال ومناولة وشحن (${payload.serviceProviderName || 'مقدم الخدمة'})`,
      descriptionEn: `Payment for landed costs and logistics`,
      costCenterId: undefined,
    },
  ];

  const journalEntry: any = {
    id: journalId,
    tenantId: context.tenantId,
    branchId: branch ? branch.id : crypto.randomUUID(),
    entryNumber: journalNumber,
    entryDate: now.toISOString().slice(0, 10),
    sourceDocumentType: 'PURCHASE_RECEIPT',
    sourceDocumentId: grn ? grn.id : (bill ? bill.id : journalId),
    sourceDocumentNumber: grn ? grn.grnNumber : (bill ? bill.billNumber : journalNumber),
    descriptionAr: `قيد رسملة تكاليف الإنزال والشحن - ${grn ? grn.grnNumber : bill?.billNumber}`,
    descriptionEn: `Capitalization of Landed Costs`,
    status: 'POSTED',
    totalDebit: payload.totalLandedCostSar.toFixed(2),
    totalCredit: payload.totalLandedCostSar.toFixed(2),
    lines: journalLines,
    postedBy: context.userId,
    postedAt: now.toISOString(),
    createdAt: now.toISOString(),
  };

  journals.push(journalEntry);
  store.journals.set(context.tenantId, journals);

  store.recordAuditLog({
    tenantId: context.tenantId,
    userId: context.userId,
    userEmail: context.userEmail,
    action: 'ALLOCATE_LANDED_COST',
    resourceType: 'landed_costs',
    resourceId: grn ? grn.id : (bill ? bill.id : journalId),
    correlationId: context.correlationId,
    changesDiff: {
      totalLandedCostSar: payload.totalLandedCostSar,
      method,
      journalNumber,
    },
  });

  return {
    success: true,
    totalLandedCostSar: payload.totalLandedCostSar,
    method,
    allocatedLines: allocated,
    journalId,
    journalNumber,
  };
}

// ==========================================
// 5. 3-WAY MATCHING SERVICE & REPORTS
// ==========================================

export function getThreeWayMatchingReportService(
  store: CentralTenantDataStore,
  context: TenantContext,
  params: { poId?: string; billId?: string; grnId?: string }
): ThreeWayMatchReport {
  let po: PurchaseOrder | null = null;
  let bill: PurchaseBill | null = null;
  let grn: GoodsReceiptNote | null = null;

  if (params.poId) {
    po = getPurchaseOrderByIdService(store, context, params.poId);
  }
  if (params.billId) {
    bill = getPurchaseBillByIdService(store, context, params.billId);
    if (bill && bill.purchaseOrderId && !po) {
      po = getPurchaseOrderByIdService(store, context, bill.purchaseOrderId);
    }
    if (bill && bill.grnId && !grn) {
      grn = getGoodsReceiptNoteByIdService(store, context, bill.grnId);
    }
  }
  if (params.grnId) {
    grn = getGoodsReceiptNoteByIdService(store, context, params.grnId);
    if (grn && grn.purchaseOrderId && !po) {
      po = getPurchaseOrderByIdService(store, context, grn.purchaseOrderId);
    }
  }

  const poLines = po ? po.lines : [];
  const billLines = bill ? bill.lines : [];
  const grnLines = grn ? grn.lines.map((g) => ({ itemId: g.itemId, receivedQuantity: g.quantity, sku: g.sku, nameAr: g.nameAr })) : [];

  const evalResult = performThreeWayMatch(poLines, billLines, grnLines);

  const variances = evalResult.variances.map((v) => ({
    itemId: v.itemId,
    type: v.type as any,
    messageAr: v.messageAr || v.message,
    messageEn: v.messageEn || v.message,
  }));

  const hasQuantityVariance = variances.some((v) => v.type.includes('QUANTITY'));
  const hasPriceVariance = variances.some((v) => v.type.includes('PRICE'));

  const isMatched = variances.length === 0;

  return {
    isMatched,
    status: isMatched ? 'MATCHED' : (hasPriceVariance ? 'PRICE_VARIANCE' : 'QUANTITY_VARIANCE'),
    poNumber: po ? po.orderNumber : undefined,
    grnNumber: grn ? grn.grnNumber : undefined,
    billNumber: bill ? bill.billNumber : undefined,
    supplierNameAr: po ? po.supplierNameAr : (bill ? bill.supplierNameAr : undefined),
    variances,
    hasQuantityVariance,
    hasPriceVariance,
    canPost: isMatched || !!(bill && bill.threeWayMatchOverrideReason),
    requiresOverride: !isMatched && !(bill && bill.threeWayMatchOverrideReason),
  };
}

export function overrideThreeWayMatchService(
  store: CentralTenantDataStore,
  context: TenantContext,
  params: { billId: string; overrideReason: string }
): PurchaseBill {
  const bills = store.purchaseBills.get(context.tenantId) || [];
  const bill = bills.find((b) => b.id === params.billId);
  if (!bill) {
    throw new Error(`BILL_NOT_FOUND: Bill ${params.billId} not found.`);
  }

  if (!params.overrideReason || params.overrideReason.trim().length < 5) {
    throw new Error('OVERRIDE_REASON_REQUIRED: A valid explanation reason is required to override 3-way matching.');
  }

  bill.threeWayMatchOverrideReason = params.overrideReason.trim();
  bill.threeWayMatchOverriddenBy = context.userEmail;
  bill.updatedAt = new Date().toISOString();

  store.recordAuditLog({
    tenantId: context.tenantId,
    userId: context.userId,
    userEmail: context.userEmail,
    action: 'THREE_WAY_MATCH_OVERRIDE',
    resourceType: 'purchase_bills',
    resourceId: bill.id,
    correlationId: context.correlationId,
    changesDiff: {
      billNumber: bill.billNumber,
      overrideReason: params.overrideReason,
      overriddenBy: context.userEmail,
    },
  });

  return bill;
}

// ==========================================
// 6. PURCHASE BILLS & VENDOR INVOICES
// ==========================================

export function getPurchaseBillsService(
  store: CentralTenantDataStore,
  context: TenantContext,
  filters?: { search?: string; status?: string; supplierId?: string }
): PurchaseBill[] {
  const list = store.purchaseBills.get(context.tenantId) || [];
  let result = [...list];

  if (filters?.status) {
    result = result.filter((b) => b.status === filters.status);
  }
  if (filters?.supplierId) {
    result = result.filter((b) => b.supplierId === filters.supplierId);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (b) =>
        b.billNumber.toLowerCase().includes(q) ||
        b.supplierInvoiceNumber.toLowerCase().includes(q) ||
        b.supplierNameAr.toLowerCase().includes(q) ||
        b.supplierNameEn.toLowerCase().includes(q)
    );
  }

  return result.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getPurchaseBillByIdService(
  store: CentralTenantDataStore,
  context: TenantContext,
  id: string
): PurchaseBill | null {
  const list = store.purchaseBills.get(context.tenantId) || [];
  return list.find((b) => b.id === id) || null;
}

export function createPurchaseBillService(
  store: CentralTenantDataStore,
  context: TenantContext,
  payload: CreatePurchaseBillPayload
): PurchaseBill {
  if (!payload.supplierId) {
    throw new Error('SUPPLIER_REQUIRED: Supplier is required for Purchase Bill.');
  }
  if (!payload.supplierInvoiceNumber) {
    throw new Error('SUPPLIER_INVOICE_REQUIRED: Vendor tax invoice number is required.');
  }
  if (!payload.lines || payload.lines.length === 0) {
    throw new Error('BILL_EMPTY_LINES: Purchase bill must have at least one line.');
  }

  const suppliers = store.suppliers.get(context.tenantId) || [];
  const supplier = suppliers.find((s) => s.id === payload.supplierId);
  if (!supplier) {
    throw new Error(`SUPPLIER_NOT_FOUND: Supplier ${payload.supplierId} not found.`);
  }

  const items = store.items.get(context.tenantId) || [];
  const branches = store.branches.get(context.tenantId) || [];
  const branch = branches.find((b) => b.id === payload.branchId) || branches[0];
  const warehouses = store.warehouses.get(context.tenantId) || [];
  const warehouse = warehouses.find((w) => w.id === payload.warehouseId) || warehouses[0];

  const now = new Date();
  const year = now.getFullYear();
  const existingBills = store.purchaseBills.get(context.tenantId) || [];
  const seqNum = existingBills.length + 1;
  const billNumber = `BILL-${year}-${seqNum.toString().padStart(5, '0')}`;

  let po: PurchaseOrder | null = null;
  if (payload.purchaseOrderId) {
    const orders = store.purchaseOrders.get(context.tenantId) || [];
    po = orders.find((o) => o.id === payload.purchaseOrderId) || null;
  }

  const lines: PurchaseBillLine[] = payload.lines.map((l) => {
    const item = items.find((i) => i.id === l.itemId);
    if (!item) {
      throw new Error(`ITEM_NOT_FOUND: Item ${l.itemId} not found.`);
    }

    const uom = item.units.find((u) => u.id === l.uomId) || item.units[0];
    const conversionFactor = uom.conversionFactor || 1;
    const calc = calculatePurchasingLine({
      quantity: l.quantity,
      unitCostSar: l.unitCostSar,
      discountPercent: l.discountPercent || 0,
      taxRate: l.taxRate !== undefined ? l.taxRate : 15,
      conversionFactor,
    });

    return {
      id: crypto.randomUUID(),
      itemId: item.id,
      sku: item.sku,
      nameAr: item.nameAr,
      nameEn: item.nameEn,
      uomId: uom.id,
      uomName: uom.nameAr,
      conversionFactor,
      quantity: l.quantity,
      baseQuantity: calc.baseQuantity,
      unitCostSar: l.unitCostSar,
      discountPercent: l.discountPercent || 0,
      discountAmountSar: calc.discountAmountSar,
      taxableAmountSar: calc.taxableAmountSar,
      taxRate: l.taxRate !== undefined ? l.taxRate : 15,
      taxAmountSar: calc.taxAmountSar,
      totalAmountSar: calc.totalAmountSar,
      warehouseId: warehouse ? warehouse.id : undefined,
      grnId: payload.grnId,
    };
  });

  const totals = calculatePurchasingTotals(lines);

  // Initial 3-way match status
  let threeWayMatchStatus: ThreeWayMatchStatus = 'MATCHED';
  if (po) {
    const matchRes = verifyThreeWayMatch(po, lines);
    threeWayMatchStatus = matchRes.status;
  }

  const bill: PurchaseBill = {
    id: crypto.randomUUID(),
    tenantId: context.tenantId,
    branchId: branch ? branch.id : crypto.randomUUID(),
    branchNameAr: branch ? branch.nameAr : 'الفرع الرئيسي',
    warehouseId: warehouse ? warehouse.id : crypto.randomUUID(),
    warehouseNameAr: warehouse ? warehouse.nameAr : 'المستودع الرئيسي',
    billNumber,
    supplierInvoiceNumber: payload.supplierInvoiceNumber.trim(),
    purchaseOrderId: po ? po.id : undefined,
    purchaseOrderNumber: po ? po.orderNumber : undefined,
    grnId: payload.grnId,
    supplierId: supplier.id,
    supplierNameAr: supplier.nameAr,
    supplierNameEn: supplier.nameEn || supplier.nameAr,
    supplierVatNumber: supplier.vatNumber,
    supplierCrNumber: supplier.crNumber,
    issueDate: payload.issueDate || now.toISOString().slice(0, 10),
    dueDate: payload.dueDate || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    paymentMethod: payload.paymentMethod || 'CREDIT_ACCOUNT',
    subtotalSar: totals.subtotalSar,
    discountTotalSar: totals.discountTotalSar,
    taxTotalSar: totals.taxTotalSar,
    totalAmountSar: totals.totalAmountSar,
    totalAmountHalalas: totals.totalAmountHalalas,
    paidAmountSar: 0,
    remainingAmountSar: totals.totalAmountSar,
    status: 'DRAFT',
    threeWayMatchStatus,
    notes: payload.notes,
    createdBy: context.userId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    lines,
  };

  existingBills.push(bill);
  store.purchaseBills.set(context.tenantId, existingBills);

  store.recordAuditLog({
    tenantId: context.tenantId,
    userId: context.userId,
    userEmail: context.userEmail,
    action: 'CREATE_PURCHASE_BILL',
    resourceType: 'purchase_bills',
    resourceId: bill.id,
    correlationId: context.correlationId,
    changesDiff: { billNumber, totalAmountSar: bill.totalAmountSar },
  });

  return bill;
}

export function postPurchaseBillService(
  store: CentralTenantDataStore,
  context: TenantContext,
  id: string
): { bill: PurchaseBill; journalEntry: any } {
  const bills = store.purchaseBills.get(context.tenantId) || [];
  const bill = bills.find((b) => b.id === id);
  if (!bill) {
    throw new Error(`BILL_NOT_FOUND: Purchase bill ${id} not found.`);
  }

  // Idempotency check: If already posted, return the existing bill and its journal entry without duplicate posting
  if (bill.status === 'POSTED' || bill.status === 'PAID' || bill.status === 'PARTIALLY_PAID') {
    const journals = store.journals.get(context.tenantId) || [];
    const existingJournal = journals.find((j) => j.id === bill.postedJournalId || j.id === bill.journalId);
    return { bill, journalEntry: existingJournal };
  }

  // 3-Way Match Check
  if (bill.threeWayMatchStatus !== 'MATCHED' && !bill.threeWayMatchOverrideReason) {
    // If linked to PO, re-evaluate
    if (bill.purchaseOrderId) {
      const po = getPurchaseOrderByIdService(store, context, bill.purchaseOrderId);
      if (po) {
        const matchRes = verifyThreeWayMatch(po, bill.lines);
        if (matchRes.status !== 'MATCHED' && !bill.threeWayMatchOverrideReason) {
          throw new Error(
            `THREE_WAY_MATCH_FAILED: ${matchRes.messageAr}. Cannot post bill without authorized override reason.`
          );
        }
      }
    }
  }

  const now = new Date();
  const year = now.getFullYear();
  const journals = store.journals.get(context.tenantId) || [];
  const journalNumber = `JV-${year}-${(journals.length + 1).toString().padStart(5, '0')}`;
  const journalId = crypto.randomUUID();

  // Determine Credit Account based on payment method
  const creditAccountCode = bill.paymentMethod === 'CASH'
    ? '10101' // النقدية في الصندوق
    : bill.paymentMethod === 'BANK_TRANSFER' || bill.paymentMethod === 'MADA'
    ? '10102' // البنك
    : '20101'; // ذمم دائنة (الموردون)

  // Construct balanced GL Journal Lines (Rule G1):
  // 1. Dr Inventory (10401) for Subtotal
  // 2. Dr Input VAT Recoverable 15% (10301) for Tax Amount
  // 3. Cr AP (20101) or Bank/Cash for Total Amount
  const journalLines = [
    {
      id: crypto.randomUUID(),
      journalId,
      accountId: '10401', // مخزون البضائع
      accountCode: '10401',
      accountNameAr: 'المخزون السلعي',
      accountNameEn: 'Merchandise Inventory',
      debit: bill.subtotalSar.toFixed(2),
      credit: '0.00',
      descriptionAr: `إثبات مشتريات فاتورة المورد رقم ${bill.supplierInvoiceNumber}`,
      descriptionEn: `Purchase inventory recognition for bill ${bill.billNumber}`,
      costCenterId: undefined,
    },
    {
      id: crypto.randomUUID(),
      journalId,
      accountId: '10301', // ضريبة القيمة المضافة المدخلات (مستردة 15%)
      accountCode: '10301',
      accountNameAr: 'ضريبة القيمة المضافة المدخلات (15%)',
      accountNameEn: 'Input VAT Recoverable (15%)',
      debit: bill.taxTotalSar.toFixed(2),
      credit: '0.00',
      descriptionAr: `ضريبة المدخلات 15% - فاتورة مورد ${bill.supplierInvoiceNumber}`,
      descriptionEn: `Input VAT 15% on bill ${bill.billNumber}`,
      costCenterId: undefined,
    },
    {
      id: crypto.randomUUID(),
      journalId,
      accountId: creditAccountCode,
      accountCode: creditAccountCode,
      accountNameAr: creditAccountCode === '20101' ? 'الموردون والمستحقات الدائنة' : 'النقدية وما في حكمها',
      accountNameEn: creditAccountCode === '20101' ? 'Accounts Payable' : 'Cash/Bank',
      debit: '0.00',
      credit: bill.totalAmountSar.toFixed(2),
      descriptionAr: `مستحقات المورد: ${bill.supplierNameAr}`,
      descriptionEn: `Payable to supplier: ${bill.supplierNameEn}`,
      costCenterId: undefined,
    },
  ];

  const totalDebitHalalas = toHalalasInt(bill.subtotalSar) + toHalalasInt(bill.taxTotalSar);
  const totalCreditHalalas = toHalalasInt(bill.totalAmountSar);

  if (totalDebitHalalas !== totalCreditHalalas) {
    throw new Error(
      `UNBALANCED_JOURNAL_ENTRY: Total Debits (${fromHalalasInt(totalDebitHalalas)}) must equal Total Credits (${fromHalalasInt(totalCreditHalalas)}). Rule G1 violated.`
    );
  }

  const journalEntry: any = {
    id: journalId,
    tenantId: context.tenantId,
    branchId: bill.branchId,
    entryNumber: journalNumber,
    entryDate: bill.issueDate,
    sourceDocumentType: 'PURCHASE_BILL',
    sourceDocumentId: bill.id,
    sourceDocumentNumber: bill.billNumber,
    descriptionAr: `قيد فاتورة مشتريات رقم ${bill.billNumber} - مورد ${bill.supplierNameAr}`,
    descriptionEn: `Purchase Bill posting ${bill.billNumber}`,
    status: 'POSTED',
    totalDebit: bill.totalAmountSar.toFixed(2),
    totalCredit: bill.totalAmountSar.toFixed(2),
    lines: journalLines,
    postedBy: context.userId,
    postedAt: now.toISOString(),
    createdAt: now.toISOString(),
  };

  journals.push(journalEntry);
  store.journals.set(context.tenantId, journals);

  // Update Inventory balance & WAC if not already received via GRN
  if (!bill.grnId) {
    const items = store.items.get(context.tenantId) || [];
    const stockMovements = store.stockMovements.get(context.tenantId) || [];

    for (const line of bill.lines) {
      const item = items.find((i) => i.id === line.itemId);
      if (!item) continue;

      const currentQty = item.currentStock || 0;
      const currentWac = item.currentWac || item.cost || 0;
      const incomingQty = line.baseQuantity;
      const incomingCost = line.unitCostSar / line.conversionFactor;

      const newTotalQty = currentQty + incomingQty;
      let newWac = currentWac;
      if (newTotalQty > 0) {
        const currentTotalVal = currentQty * currentWac;
        const incomingTotalVal = incomingQty * incomingCost;
        newWac = roundHalalas((currentTotalVal + incomingTotalVal) / newTotalQty);
      }

      item.currentStock = newTotalQty;
      item.currentWac = newWac;
      item.cost = newWac;
      item.updatedAt = now.toISOString();

      const mvt: StockMovement = {
        id: crypto.randomUUID(),
        tenantId: context.tenantId,
        warehouseId: bill.warehouseId,
        warehouseNameAr: bill.warehouseNameAr || 'المستودع الرئيسي',
        itemId: item.id,
        sku: item.sku,
        itemNameAr: item.nameAr,
        movementType: 'PURCHASE_RECEIPT',
        quantityDelta: incomingQty,
        unitCostApplied: incomingCost,
        resultingWac: newWac,
        valueDelta: roundHalalas(incomingQty * incomingCost),
        resultingStock: newTotalQty,
        sourceType: 'PURCHASE_RECEIPT',
        sourceId: bill.billNumber,
        sourceDocumentNumber: bill.billNumber,
        notes: `استلام بضاعة بموجب فاتورة المشتريات ${bill.billNumber}`,
        userId: context.userId,
        userEmail: context.userEmail,
        movementDate: bill.issueDate,
        createdAt: now.toISOString(),
      };
      stockMovements.push(mvt);
    }
    store.items.set(context.tenantId, items);
    store.stockMovements.set(context.tenantId, stockMovements);
  }

  // Record price history records
  for (const line of bill.lines) {
    recordSupplierPriceService(store, context, {
      supplierId: bill.supplierId,
      supplierNameAr: bill.supplierNameAr,
      itemId: line.itemId,
      itemSku: line.sku,
      itemNameAr: line.nameAr,
      uomId: line.uomId,
      uomName: line.uomName,
      unitCostSar: line.unitCostSar,
      baseUnitCostSar: roundHalalas(line.unitCostSar / line.conversionFactor),
      discountPercent: line.discountPercent,
      sourceType: 'BILL',
      sourceNumber: bill.billNumber,
    });
  }

  // Update PO billed quantities if linked
  if (bill.purchaseOrderId) {
    const orders = store.purchaseOrders.get(context.tenantId) || [];
    const po = orders.find((o) => o.id === bill.purchaseOrderId);
    if (po) {
      for (const billLine of bill.lines) {
        const poLine = po.lines.find((pl) => pl.itemId === billLine.itemId);
        if (poLine) {
          poLine.billedQuantity = roundHalalas((poLine.billedQuantity || 0) + billLine.quantity);
          poLine.remainingBilledQuantity = Math.max(0, roundHalalas(poLine.quantity - poLine.billedQuantity));
        }
      }
      if (po.lines.every((pl) => pl.remainingBilledQuantity === 0)) {
        po.status = 'BILLED';
      }
      po.updatedAt = now.toISOString();
    }
  }

  bill.status = 'POSTED';
  bill.postedJournalId = journalId;
  bill.journalId = journalId;
  bill.postedJournalNumber = journalNumber;
  bill.updatedAt = now.toISOString();

  store.recordAuditLog({
    tenantId: context.tenantId,
    userId: context.userId,
    userEmail: context.userEmail,
    action: 'POST_PURCHASE_BILL',
    resourceType: 'purchase_bills',
    resourceId: bill.id,
    correlationId: context.correlationId,
    changesDiff: {
      billNumber: bill.billNumber,
      journalNumber,
      totalAmountSar: bill.totalAmountSar,
    },
  });

  return { bill, journalEntry };
}

// ==========================================
// 7. VENDOR DEBIT NOTES (PURCHASE RETURNS)
// ==========================================

export function getVendorDebitNotesService(
  store: CentralTenantDataStore,
  context: TenantContext,
  filters?: { search?: string; supplierId?: string }
): VendorDebitNote[] {
  const list = store.vendorDebitNotes.get(context.tenantId) || [];
  let result = [...list];

  if (filters?.supplierId) {
    result = result.filter((d) => d.supplierId === filters.supplierId);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (d) =>
        d.debitNoteNumber.toLowerCase().includes(q) ||
        d.originalBillNumber.toLowerCase().includes(q) ||
        d.supplierNameAr.toLowerCase().includes(q)
    );
  }

  return result.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getVendorDebitNoteByIdService(
  store: CentralTenantDataStore,
  context: TenantContext,
  id: string
): VendorDebitNote | null {
  const list = store.vendorDebitNotes.get(context.tenantId) || [];
  return list.find((d) => d.id === id) || null;
}

export function createVendorDebitNoteService(
  store: CentralTenantDataStore,
  context: TenantContext,
  payload: CreateVendorDebitNotePayload
): { debitNote: VendorDebitNote; journalEntry: any } {
  const bills = store.purchaseBills.get(context.tenantId) || [];
  const bill = bills.find((b) => b.id === payload.originalBillId);
  if (!bill) {
    throw new Error(`BILL_NOT_FOUND: Original Purchase Bill ${payload.originalBillId} not found.`);
  }

  if (bill.status !== 'POSTED' && bill.status !== 'PAID' && bill.status !== 'PARTIALLY_PAID') {
    throw new Error('BILL_NOT_POSTED: Cannot issue debit note for an unposted purchase bill.');
  }

  const returnLines = payload.lines && payload.lines.length > 0 ? payload.lines : bill.lines;

  const calculatedLines: PurchaseBillLine[] = returnLines.map((l) => {
    const originalLine = bill.lines.find((bl) => bl.itemId === l.itemId) || bill.lines[0];
    const calc = calculatePurchasingLine({
      quantity: l.quantity,
      unitCostSar: l.unitCostSar || originalLine.unitCostSar,
      discountPercent: originalLine.discountPercent || 0,
      taxRate: l.taxRate !== undefined ? l.taxRate : originalLine.taxRate,
      conversionFactor: originalLine.conversionFactor || 1,
    });

    return {
      ...originalLine,
      quantity: l.quantity,
      baseQuantity: calc.baseQuantity,
      unitCostSar: l.unitCostSar || originalLine.unitCostSar,
      discountAmountSar: calc.discountAmountSar,
      taxableAmountSar: calc.taxableAmountSar,
      taxAmountSar: calc.taxAmountSar,
      totalAmountSar: calc.totalAmountSar,
    };
  });

  const totals = calculatePurchasingTotals(calculatedLines);

  const now = new Date();
  const year = now.getFullYear();
  const debitNotes = store.vendorDebitNotes.get(context.tenantId) || [];
  const debitNoteNumber = `DN-${year}-${(debitNotes.length + 1).toString().padStart(5, '0')}`;

  const journals = store.journals.get(context.tenantId) || [];
  const journalNumber = `JV-${year}-${(journals.length + 1).toString().padStart(5, '0')}`;
  const journalId = crypto.randomUUID();

  // Construct reversal GL Journal:
  // 1. Dr Accounts Payable (20101) for Total Amount (reducing AP liability)
  // 2. Cr Merchandise Inventory (10401) for Subtotal
  // 3. Cr Input VAT Recoverable (10301) for Tax Amount (reversing input VAT)
  const journalLines = [
    {
      id: crypto.randomUUID(),
      journalId,
      accountId: '20101', // ذمم دائنة
      accountCode: '20101',
      accountNameAr: 'الموردون والمستحقات الدائنة',
      accountNameEn: 'Accounts Payable',
      debit: totals.totalAmountSar.toFixed(2),
      credit: '0.00',
      descriptionAr: `تخفيض مستحقات المورد بموجب إشعار مدين ${debitNoteNumber}`,
      descriptionEn: `Debit Note AP reduction for ${debitNoteNumber}`,
      costCenterId: undefined,
    },
    {
      id: crypto.randomUUID(),
      journalId,
      accountId: '10401', // المخزون السلعي
      accountCode: '10401',
      accountNameAr: 'المخزون السلعي',
      accountNameEn: 'Merchandise Inventory',
      debit: '0.00',
      credit: totals.subtotalSar.toFixed(2),
      descriptionAr: `إرجاع بضاعة لمورد - إشعار مدين ${debitNoteNumber}`,
      descriptionEn: `Merchandise return stock reduction`,
      costCenterId: undefined,
    },
    {
      id: crypto.randomUUID(),
      journalId,
      accountId: '10301', // ضريبة المدخلات
      accountCode: '10301',
      accountNameAr: 'ضريبة القيمة المضافة المدخلات (15%)',
      accountNameEn: 'Input VAT Recoverable (15%)',
      debit: '0.00',
      credit: totals.taxTotalSar.toFixed(2),
      descriptionAr: `عكس ضريبة مدخلات 15% لإشعار مدين ${debitNoteNumber}`,
      descriptionEn: `Reversal of Input VAT on Debit Note`,
      costCenterId: undefined,
    },
  ];

  const journalEntry: any = {
    id: journalId,
    tenantId: context.tenantId,
    branchId: bill.branchId,
    entryNumber: journalNumber,
    entryDate: payload.issueDate || now.toISOString().slice(0, 10),
    sourceDocumentType: 'DEBIT_NOTE',
    sourceDocumentId: debitNoteNumber,
    sourceDocumentNumber: debitNoteNumber,
    descriptionAr: `قيد إشعار مدين (مردودات مشتريات) رقم ${debitNoteNumber}`,
    descriptionEn: `Debit Note (Purchase Return) ${debitNoteNumber}`,
    status: 'POSTED',
    totalDebit: totals.totalAmountSar.toFixed(2),
    totalCredit: totals.totalAmountSar.toFixed(2),
    lines: journalLines,
    postedBy: context.userId,
    postedAt: now.toISOString(),
    createdAt: now.toISOString(),
  };

  journals.push(journalEntry);
  store.journals.set(context.tenantId, journals);

  // Reduce Stock Balance & Add Movement (Rule I1)
  const items = store.items.get(context.tenantId) || [];
  const stockMovements = store.stockMovements.get(context.tenantId) || [];

  for (const line of calculatedLines) {
    const item = items.find((i) => i.id === line.itemId);
    if (!item) continue;

    const returnQty = line.baseQuantity;
    item.currentStock = Math.max(0, (item.currentStock || 0) - returnQty);
    item.updatedAt = now.toISOString();

    const mvt: StockMovement = {
      id: crypto.randomUUID(),
      tenantId: context.tenantId,
      warehouseId: bill.warehouseId,
      warehouseNameAr: bill.warehouseNameAr || 'المستودع الرئيسي',
      itemId: item.id,
      sku: item.sku,
      itemNameAr: item.nameAr,
      movementType: 'PURCHASE_RETURN',
      quantityDelta: -returnQty,
      unitCostApplied: line.unitCostSar / line.conversionFactor,
      resultingWac: item.currentWac || item.cost || 0,
      valueDelta: -roundHalalas(returnQty * (line.unitCostSar / line.conversionFactor)),
      resultingStock: item.currentStock,
      sourceType: 'PURCHASE_RETURN',
      sourceId: debitNoteNumber,
      sourceDocumentNumber: debitNoteNumber,
      notes: `إرجاع بضاعة بموجب إشعار مدين ${debitNoteNumber}`,
      userId: context.userId,
      userEmail: context.userEmail,
      movementDate: now.toISOString().slice(0, 10),
      createdAt: now.toISOString(),
    };
    stockMovements.push(mvt);
  }
  store.items.set(context.tenantId, items);
  store.stockMovements.set(context.tenantId, stockMovements);

  // Deduct from bill remaining balance if not yet fully paid
  bill.remainingAmountSar = Math.max(0, roundHalalas(bill.remainingAmountSar - totals.totalAmountSar));
  if (bill.remainingAmountSar === 0) {
    bill.status = 'PAID';
  }
  bill.updatedAt = now.toISOString();

  const debitNote: VendorDebitNote = {
    id: crypto.randomUUID(),
    tenantId: context.tenantId,
    branchId: bill.branchId,
    debitNoteNumber,
    originalBillId: bill.id,
    originalBillNumber: bill.billNumber,
    supplierId: bill.supplierId,
    supplierNameAr: bill.supplierNameAr,
    supplierNameEn: bill.supplierNameEn,
    supplierVatNumber: bill.supplierVatNumber,
    reasonCode: payload.reasonCode,
    reasonDescription: payload.reasonDescription,
    reason: payload.reasonDescription,
    issueDate: payload.issueDate || now.toISOString().slice(0, 10),
    status: 'POSTED',
    subtotalSar: totals.subtotalSar,
    taxTotalSar: totals.taxTotalSar,
    totalAmountSar: totals.totalAmountSar,
    postedJournalId: journalId,
    postedJournalNumber: journalNumber,
    notes: payload.notes,
    createdBy: context.userId,
    createdAt: now.toISOString(),
    lines: calculatedLines,
  };

  debitNotes.push(debitNote);
  store.vendorDebitNotes.set(context.tenantId, debitNotes);

  store.recordAuditLog({
    tenantId: context.tenantId,
    userId: context.userId,
    userEmail: context.userEmail,
    action: 'CREATE_VENDOR_DEBIT_NOTE',
    resourceType: 'vendor_debit_notes',
    resourceId: debitNote.id,
    correlationId: context.correlationId,
    changesDiff: {
      debitNoteNumber,
      totalAmountSar: debitNote.totalAmountSar,
      journalNumber,
    },
  });

  return { debitNote, journalEntry };
}

// ==========================================
// 8. SUPPLIER PAYMENTS & ALLOCATIONS
// ==========================================

export function getSupplierPaymentsService(
  store: CentralTenantDataStore,
  context: TenantContext,
  filters?: { search?: string; supplierId?: string }
): SupplierPayment[] {
  const list = store.supplierPayments.get(context.tenantId) || [];
  let result = [...list];

  if (filters?.supplierId) {
    result = result.filter((p) => p.supplierId === filters.supplierId);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (p) =>
        p.paymentNumber.toLowerCase().includes(q) ||
        p.supplierNameAr.toLowerCase().includes(q) ||
        (p.referenceNumber && p.referenceNumber.toLowerCase().includes(q))
    );
  }

  return result.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getSupplierPaymentByIdService(
  store: CentralTenantDataStore,
  context: TenantContext,
  id: string
): SupplierPayment | null {
  const list = store.supplierPayments.get(context.tenantId) || [];
  return list.find((p) => p.id === id) || null;
}

export function createSupplierPaymentService(
  store: CentralTenantDataStore,
  context: TenantContext,
  payload: CreateSupplierPaymentPayload
): { payment: SupplierPayment; journalEntry: any } {
  if (!payload.amountSar || payload.amountSar <= 0) {
    throw new Error('PAYMENT_AMOUNT_POSITIVE: Payment amount must be greater than zero.');
  }

  const suppliers = store.suppliers.get(context.tenantId) || [];
  const supplier = suppliers.find((s) => s.id === payload.supplierId);
  if (!supplier) {
    throw new Error(`SUPPLIER_NOT_FOUND: Supplier ${payload.supplierId} not found.`);
  }

  const bills = store.purchaseBills.get(context.tenantId) || [];
  const branches = store.branches.get(context.tenantId) || [];
  const branch = branches.find((b) => b.id === payload.branchId) || branches[0];

  const now = new Date();
  const year = now.getFullYear();
  const payments = store.supplierPayments.get(context.tenantId) || [];
  const paymentNumber = `PAY-${year}-${(payments.length + 1).toString().padStart(5, '0')}`;

  let totalAllocatedHalalas = 0n;
  const allocations: SupplierPaymentAllocation[] = [];

  // If explicit allocations provided:
  if (payload.allocations && payload.allocations.length > 0) {
    for (const alloc of payload.allocations) {
      const bill = bills.find((b) => b.id === alloc.billId);
      if (!bill) continue;

      const currentDue = bill.remainingAmountSar ?? roundHalalas(bill.totalAmountSar - (bill.paidAmountSar || 0));
      const allocAmt = Math.min(alloc.allocatedAmountSar, currentDue);

      if (allocAmt > 0) {
        bill.paidAmountSar = roundHalalas((bill.paidAmountSar || 0) + allocAmt);
        bill.remainingAmountSar = Math.max(0, roundHalalas(currentDue - allocAmt));
        bill.status = bill.remainingAmountSar === 0 ? 'PAID' : 'PARTIALLY_PAID';
        bill.updatedAt = now.toISOString();

        totalAllocatedHalalas += toHalalasInt(allocAmt);

        allocations.push({
          billId: bill.id,
          billNumber: bill.billNumber,
          billIssueDate: bill.issueDate,
          billTotalSar: bill.totalAmountSar,
          previousPaidSar: roundHalalas(bill.paidAmountSar - allocAmt),
          allocatedAmountSar: allocAmt,
          remainingAfterAllocationSar: bill.remainingAmountSar,
        });
      }
    }
  } else if (!payload.isAdvance) {
    // Automatic FIFO Allocation
    const unpaidBills = bills.filter(
      (b) => b.supplierId === supplier.id && (b.status === 'POSTED' || b.status === 'PARTIALLY_PAID')
    );
    const fifoAllocations = suggestFifoPaymentAllocations(unpaidBills, payload.amountSar);

    for (const fa of fifoAllocations) {
      const bill = bills.find((b) => b.id === fa.billId);
      if (!bill) continue;

      const prevPaid = bill.paidAmountSar || 0;
      bill.paidAmountSar = roundHalalas(prevPaid + fa.allocatedAmountSar);
      bill.remainingAmountSar = fa.remainingAmountSar;
      bill.status = bill.remainingAmountSar === 0 ? 'PAID' : 'PARTIALLY_PAID';
      bill.updatedAt = now.toISOString();

      totalAllocatedHalalas += toHalalasInt(fa.allocatedAmountSar);

      allocations.push({
        billId: bill.id,
        billNumber: bill.billNumber,
        billIssueDate: bill.issueDate,
        billTotalSar: bill.totalAmountSar,
        previousPaidSar: prevPaid,
        allocatedAmountSar: fa.allocatedAmountSar,
        remainingAfterAllocationSar: fa.remainingAmountSar,
      });
    }
  }

  const totalAllocatedSar = fromHalalasInt(totalAllocatedHalalas);
  const unallocatedAmountSar = Math.max(0, roundHalalas(payload.amountSar - totalAllocatedSar));

  // Post Double-Entry GL Journal (Rule G1):
  // 1. Dr Accounts Payable (20101) for Payment Amount (reducing AP liability)
  // 2. Cr Bank (10102) or Cash (10101) for Payment Amount
  const journals = store.journals.get(context.tenantId) || [];
  const journalNumber = `JV-${year}-${(journals.length + 1).toString().padStart(5, '0')}`;
  const journalId = crypto.randomUUID();

  const creditAccountCode = payload.paymentMethod === 'CASH' ? '10101' : '10102';

  const journalLines = [
    {
      id: crypto.randomUUID(),
      journalId,
      accountId: '20101', // ذمم دائنة
      accountCode: '20101',
      accountNameAr: 'الموردون والمستحقات الدائنة',
      accountNameEn: 'Accounts Payable',
      debit: payload.amountSar.toFixed(2),
      credit: '0.00',
      descriptionAr: `سداد مستحقات للمورد ${supplier.nameAr} - سند صرف ${paymentNumber}`,
      descriptionEn: `Payment to supplier ${supplier.nameEn}`,
      costCenterId: undefined,
    },
    {
      id: crypto.randomUUID(),
      journalId,
      accountId: creditAccountCode,
      accountCode: creditAccountCode,
      accountNameAr: creditAccountCode === '10101' ? 'النقدية في الصندوق' : 'البنك والحسابات الجارية',
      accountNameEn: creditAccountCode === '10101' ? 'Petty Cash' : 'Bank Accounts',
      debit: '0.00',
      credit: payload.amountSar.toFixed(2),
      descriptionAr: `صرف بنكي/نقدي للمورد (${payload.referenceNumber || paymentNumber})`,
      descriptionEn: `Cash/Bank payout for supplier payment`,
      costCenterId: undefined,
    },
  ];

  const journalEntry: any = {
    id: journalId,
    tenantId: context.tenantId,
    branchId: branch ? branch.id : crypto.randomUUID(),
    entryNumber: journalNumber,
    entryDate: payload.paymentDate || now.toISOString().slice(0, 10),
    sourceDocumentType: 'SUPPLIER_PAYMENT',
    sourceDocumentId: paymentNumber,
    sourceDocumentNumber: paymentNumber,
    descriptionAr: `سند صرف للمورد ${supplier.nameAr} - ${paymentNumber}`,
    descriptionEn: `Supplier Payment voucher ${paymentNumber}`,
    status: 'POSTED',
    totalDebit: payload.amountSar.toFixed(2),
    totalCredit: payload.amountSar.toFixed(2),
    lines: journalLines,
    postedBy: context.userId,
    postedAt: now.toISOString(),
    createdAt: now.toISOString(),
  };

  journals.push(journalEntry);
  store.journals.set(context.tenantId, journals);

  const payment: SupplierPayment = {
    id: crypto.randomUUID(),
    tenantId: context.tenantId,
    branchId: branch ? branch.id : crypto.randomUUID(),
    paymentNumber,
    supplierId: supplier.id,
    supplierNameAr: supplier.nameAr,
    supplierNameEn: supplier.nameEn || supplier.nameAr,
    paymentDate: payload.paymentDate || now.toISOString().slice(0, 10),
    amountSar: payload.amountSar,
    paymentMethod: payload.paymentMethod,
    referenceNumber: payload.referenceNumber,
    status: 'POSTED',
    isAdvance: payload.isAdvance || unallocatedAmountSar > 0,
    unallocatedAmountSar,
    postedJournalId: journalId,
    postedJournalNumber: journalNumber,
    allocations,
    notes: payload.notes,
    createdBy: context.userId,
    createdAt: now.toISOString(),
  };

  payments.push(payment);
  store.supplierPayments.set(context.tenantId, payments);

  store.recordAuditLog({
    tenantId: context.tenantId,
    userId: context.userId,
    userEmail: context.userEmail,
    action: 'CREATE_SUPPLIER_PAYMENT',
    resourceType: 'supplier_payments',
    resourceId: payment.id,
    correlationId: context.correlationId,
    changesDiff: {
      paymentNumber,
      amountSar: payment.amountSar,
      journalNumber,
    },
  });

  return { payment, journalEntry };
}

export function reallocateSupplierPaymentService(
  store: CentralTenantDataStore,
  context: TenantContext,
  paymentId: string,
  newAllocations: Array<{ billId: string; allocatedAmountSar: number }>
): SupplierPayment {
  const payments = store.supplierPayments.get(context.tenantId) || [];
  const payment = payments.find((p) => p.id === paymentId);
  if (!payment) {
    throw new Error(`PAYMENT_NOT_FOUND: Supplier Payment ${paymentId} not found.`);
  }

  const bills = store.purchaseBills.get(context.tenantId) || [];

  // 1. Revert previous allocations on bills
  for (const prev of payment.allocations) {
    const bill = bills.find((b) => b.id === prev.billId);
    if (bill) {
      bill.paidAmountSar = Math.max(0, roundHalalas((bill.paidAmountSar || 0) - prev.allocatedAmountSar));
      bill.remainingAmountSar = roundHalalas(bill.totalAmountSar - bill.paidAmountSar);
      bill.status = bill.paidAmountSar === 0 ? 'POSTED' : 'PARTIALLY_PAID';
      bill.updatedAt = new Date().toISOString();
    }
  }

  // 2. Apply new allocations
  let totalAllocatedHalalas = 0n;
  const updatedAllocations: SupplierPaymentAllocation[] = [];

  for (const item of newAllocations) {
    const bill = bills.find((b) => b.id === item.billId);
    if (!bill) continue;

    const currentDue = bill.remainingAmountSar;
    const allocAmt = Math.min(item.allocatedAmountSar, currentDue);

    if (allocAmt > 0) {
      const prevPaid = bill.paidAmountSar || 0;
      bill.paidAmountSar = roundHalalas(prevPaid + allocAmt);
      bill.remainingAmountSar = Math.max(0, roundHalalas(currentDue - allocAmt));
      bill.status = bill.remainingAmountSar === 0 ? 'PAID' : 'PARTIALLY_PAID';
      bill.updatedAt = new Date().toISOString();

      totalAllocatedHalalas += toHalalasInt(allocAmt);

      updatedAllocations.push({
        billId: bill.id,
        billNumber: bill.billNumber,
        billIssueDate: bill.issueDate,
        billTotalSar: bill.totalAmountSar,
        previousPaidSar: prevPaid,
        allocatedAmountSar: allocAmt,
        remainingAfterAllocationSar: bill.remainingAmountSar,
      });
    }
  }

  const totalAllocated = fromHalalasInt(totalAllocatedHalalas);
  payment.allocations = updatedAllocations;
  payment.unallocatedAmountSar = Math.max(0, roundHalalas(payment.amountSar - totalAllocated));
  payment.isAdvance = payment.unallocatedAmountSar > 0;
  payment.updatedAt = new Date().toISOString();

  store.recordAuditLog({
    tenantId: context.tenantId,
    userId: context.userId,
    userEmail: context.userEmail,
    action: 'REALLOCATE_SUPPLIER_PAYMENT',
    resourceType: 'supplier_payments',
    resourceId: payment.id,
    correlationId: context.correlationId,
    changesDiff: {
      paymentNumber: payment.paymentNumber,
      allocationsCount: updatedAllocations.length,
      unallocatedAmountSar: payment.unallocatedAmountSar,
    },
  });

  return payment;
}

// ==========================================
// 9. SUPPLIER STATEMENT OF ACCOUNT & AGING
// ==========================================

export function getSupplierStatementService(
  store: CentralTenantDataStore,
  context: TenantContext,
  supplierId: string,
  dateFrom?: string,
  dateTo?: string
): SupplierStatement {
  const suppliers = store.suppliers.get(context.tenantId) || [];
  const supplier = suppliers.find((s) => s.id === supplierId);
  if (!supplier) {
    throw new Error(`SUPPLIER_NOT_FOUND: Supplier ${supplierId} not found.`);
  }

  const bills = (store.purchaseBills.get(context.tenantId) || []).filter(
    (b) => b.supplierId === supplierId && (b.status === 'POSTED' || b.status === 'PAID' || b.status === 'PARTIALLY_PAID')
  );

  const debitNotes = (store.vendorDebitNotes.get(context.tenantId) || []).filter(
    (d) => d.supplierId === supplierId
  );

  const payments = (store.supplierPayments.get(context.tenantId) || []).filter(
    (p) => p.supplierId === supplierId
  );

  // Compile all chronological transactions
  interface RawTx {
    date: string;
    type: 'BILL' | 'DEBIT_NOTE' | 'PAYMENT';
    docNumber: string;
    reference?: string;
    descAr: string;
    debit: number;
    credit: number;
  }

  const rawTxList: RawTx[] = [];

  for (const b of bills) {
    rawTxList.push({
      date: b.issueDate,
      type: 'BILL',
      docNumber: b.billNumber,
      reference: b.supplierInvoiceNumber,
      descAr: `فاتورة مشتريات رقم ${b.billNumber} (فاتورة المورد: ${b.supplierInvoiceNumber})`,
      debit: 0,
      credit: b.totalAmountSar,
    });
  }

  for (const d of debitNotes) {
    rawTxList.push({
      date: d.issueDate,
      type: 'DEBIT_NOTE',
      docNumber: d.debitNoteNumber,
      reference: d.originalBillNumber,
      descAr: `إشعار مدين / مردود مشتريات ${d.debitNoteNumber} (${d.reasonDescription || 'مردود'})`,
      debit: d.totalAmountSar,
      credit: 0,
    });
  }

  for (const p of payments) {
    rawTxList.push({
      date: p.paymentDate,
      type: 'PAYMENT',
      docNumber: p.paymentNumber,
      reference: p.referenceNumber,
      descAr: `سند صرف / سداد دفعات (${p.paymentMethod}) ${p.referenceNumber ? `مرجع: ${p.referenceNumber}` : ''}`,
      debit: p.amountSar,
      credit: 0,
    });
  }

  rawTxList.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let runningBalance = 0;
  let totalBillsCredit = 0;
  let totalPaymentsDebit = 0;
  let totalDebitNotesDebit = 0;

  const transactions: SupplierStatementLine[] = [];

  for (const tx of rawTxList) {
    // Credit increases balance owed to supplier; Debit reduces balance owed
    runningBalance = roundHalalas(runningBalance + tx.credit - tx.debit);

    if (tx.type === 'BILL') totalBillsCredit = roundHalalas(totalBillsCredit + tx.credit);
    if (tx.type === 'PAYMENT') totalPaymentsDebit = roundHalalas(totalPaymentsDebit + tx.debit);
    if (tx.type === 'DEBIT_NOTE') totalDebitNotesDebit = roundHalalas(totalDebitNotesDebit + tx.debit);

    transactions.push({
      id: crypto.randomUUID(),
      date: tx.date,
      documentType: tx.type,
      documentNumber: tx.docNumber,
      reference: tx.reference,
      descriptionAr: tx.descAr,
      debitSar: tx.debit,
      creditSar: tx.credit,
      runningBalanceSar: runningBalance,
    });
  }

  const agingBuckets = calculateSupplierAging(bills);
  const supplierBucket = agingBuckets.find((a) => a.supplierId === supplierId);

  return {
    supplierId: supplier.id,
    supplierNameAr: supplier.nameAr,
    supplierNameEn: supplier.nameEn || supplier.nameAr,
    supplierVatNumber: supplier.vatNumber,
    supplierCrNumber: supplier.crNumber,
    dateFrom: dateFrom || '2026-01-01',
    dateTo: dateTo || new Date().toISOString().slice(0, 10),
    openingBalanceSar: 0,
    totalBillsCreditSar: totalBillsCredit,
    totalPaymentsDebitSar: totalPaymentsDebit,
    totalDebitNotesDebitSar: totalDebitNotesDebit,
    closingBalanceSar: runningBalance,
    aging: {
      current0To30: supplierBucket ? supplierBucket.currentSar : 0,
      days31To60: supplierBucket ? supplierBucket.days31to60Sar : 0,
      days61To90: supplierBucket ? supplierBucket.days61to90Sar : 0,
      days90Plus: supplierBucket ? supplierBucket.days91PlusSar : 0,
      totalOutstanding: runningBalance,
    },
    transactions,
  };
}

export function getSupplierAgingService(
  store: CentralTenantDataStore,
  context: TenantContext
): SupplierAgingBucket[] {
  const bills = store.purchaseBills.get(context.tenantId) || [];
  return calculateSupplierAging(bills);
}

// ==========================================
// 10. PRICE HISTORY & LAST PURCHASE PRICE
// ==========================================

export function recordSupplierPriceService(
  store: CentralTenantDataStore,
  context: TenantContext,
  params: {
    supplierId: string;
    supplierNameAr: string;
    itemId: string;
    itemSku: string;
    itemNameAr: string;
    uomId: string;
    uomName: string;
    unitCostSar: number;
    baseUnitCostSar: number;
    discountPercent?: number;
    sourceType: 'BILL' | 'GRN' | 'PO';
    sourceNumber: string;
  }
): SupplierPriceRecord {
  const records = store.supplierPriceRecords.get(context.tenantId) || [];
  const rec: SupplierPriceRecord = {
    id: crypto.randomUUID(),
    tenantId: context.tenantId,
    supplierId: params.supplierId,
    supplierNameAr: params.supplierNameAr,
    itemId: params.itemId,
    itemSku: params.itemSku,
    itemNameAr: params.itemNameAr,
    uomId: params.uomId,
    uomName: params.uomName,
    unitCostSar: params.unitCostSar,
    baseUnitCostSar: params.baseUnitCostSar,
    discountPercent: params.discountPercent || 0,
    date: new Date().toISOString().slice(0, 10),
    sourceType: params.sourceType,
    sourceNumber: params.sourceNumber,
    createdAt: new Date().toISOString(),
  };

  records.push(rec);
  store.supplierPriceRecords.set(context.tenantId, records);
  return rec;
}

export function getSupplierPriceHistoryService(
  store: CentralTenantDataStore,
  context: TenantContext,
  filters?: { supplierId?: string; itemId?: string }
): SupplierPriceRecord[] {
  const records = store.supplierPriceRecords.get(context.tenantId) || [];
  let list = [...records];

  if (filters?.supplierId) {
    list = list.filter((r) => r.supplierId === filters.supplierId);
  }
  if (filters?.itemId) {
    list = list.filter((r) => r.itemId === filters.itemId);
  }

  return list.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getLastPurchasePriceService(
  store: CentralTenantDataStore,
  context: TenantContext,
  params: { supplierId?: string; itemId: string; uomId?: string }
): SupplierPriceRecord | null {
  const records = store.supplierPriceRecords.get(context.tenantId) || [];
  const matches = records.filter(
    (r) =>
      r.itemId === params.itemId &&
      (!params.supplierId || r.supplierId === params.supplierId) &&
      (!params.uomId || r.uomId === params.uomId)
  );

  if (matches.length === 0) return null;

  matches.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return matches[0];
}

// ==========================================
// 11. SEED DEFAULT PURCHASING RECORDS
// ==========================================

export function seedDefaultPurchasing(
  store: CentralTenantDataStore,
  tenantId: string,
  userId?: string
) {
  const suppliers = store.suppliers.get(tenantId) || [];
  const items = store.items.get(tenantId) || [];
  const branches = store.branches.get(tenantId) || [];
  const warehouses = store.warehouses.get(tenantId) || [];

  if (suppliers.length === 0 || items.length === 0) return;

  const sup1 = suppliers[0];
  const sup2 = suppliers.length > 1 ? suppliers[1] : suppliers[0];
  const item1 = items[0];
  const item2 = items.length > 1 ? items[1] : items[0];
  const branch = branches[0];
  const wh = warehouses[0];

  const adminContext: TenantContext = {
    tenantId,
    userId: (userId as any) || crypto.randomUUID(),
    userEmail: 'admin@al-inma.sa',
    role: 'OWNER',
    roleCode: 'OWNER',
    permissions: ['*'],
    correlationId: crypto.randomUUID(),
  };

  // Seed 1 PR
  const pr = createPurchaseRequestService(store, adminContext, {
    branchId: branch ? branch.id : undefined,
    department: 'قسم التموين والمستودعات',
    requiredByDate: '2026-10-15',
    priority: 'HIGH',
    notes: 'طلب توريد ربع سنوي لأصناف التمور والبن',
    lines: [
      {
        itemId: item1.id,
        quantity: 100,
        estimatedUnitCostSar: 25.0,
      },
    ],
  });
  submitPurchaseRequestService(store, adminContext, pr.id);
  approvePurchaseRequestService(store, adminContext, pr.id);

  // Seed 1 PO
  const po = createPurchaseOrderService(store, adminContext, {
    branchId: branch ? branch.id : undefined,
    purchaseRequestId: pr.id,
    supplierId: sup1.id,
    orderDate: '2026-09-10',
    expectedDeliveryDate: '2026-09-20',
    overReceivePolicy: 'BLOCK',
    notes: 'أمر توريد تجاري رسمي معتمد',
    lines: [
      {
        itemId: item1.id,
        quantity: 100,
        unitCostSar: 25.0,
        discountPercent: 0,
        taxRate: 15,
      },
    ],
  });

  // Seed 1 GRN (Partial 60 units)
  const grn = createGoodsReceiptNoteService(store, adminContext, {
    branchId: branch ? branch.id : undefined,
    warehouseId: wh ? wh.id : undefined,
    purchaseOrderId: po.id,
    deliveryNoteNumber: 'DN-99482',
    carrierName: 'شركة ناقل إكسبريس',
    vehiclePlate: 'أ ب د 1234',
    receiptDate: '2026-09-12',
    notes: 'استلام الدفعة الأولى من التوريد',
    lines: [
      {
        itemId: item1.id,
        quantity: 60,
        unitCostSar: 25.0,
        batchNumber: 'BAT-2026-09A',
        expiryDate: '2027-09-01',
      },
    ],
  });

  // Seed Landed Cost allocation on GRN (200 SAR freight)
  allocateLandedCostService(store, adminContext, {
    grnId: grn.id,
    totalLandedCostSar: 200,
    method: 'BY_VALUE',
    serviceProviderName: 'شركة الشرق للشحن والتخليص',
    paymentMethod: 'CASH',
  });

  // Seed 1 Purchase Bill for 60 units
  const bill = createPurchaseBillService(store, adminContext, {
    branchId: branch ? branch.id : undefined,
    warehouseId: wh ? wh.id : undefined,
    supplierId: sup1.id,
    purchaseOrderId: po.id,
    grnId: grn.id,
    supplierInvoiceNumber: 'INV-SUP-88219',
    issueDate: '2026-09-12',
    dueDate: '2026-10-12',
    paymentMethod: 'CREDIT_ACCOUNT',
    notes: 'فاتورة توريد الدفعة الأولى',
    threeWayMatchOverrideReason: 'اعتماد فوترة الدفعة الجزئية الأولى (60 من أصل 100)',
    lines: [
      {
        itemId: item1.id,
        quantity: 60,
        unitCostSar: 25.0,
        discountPercent: 0,
        taxRate: 15,
      },
    ],
  });
  postPurchaseBillService(store, adminContext, bill.id);

  // Seed 1 Supplier Payment (Partial payment 1,000 SAR)
  createSupplierPaymentService(store, adminContext, {
    supplierId: sup1.id,
    branchId: branch ? branch.id : undefined,
    paymentDate: '2026-09-15',
    amountSar: 1000.0,
    paymentMethod: 'BANK_TRANSFER',
    referenceNumber: 'TX-BNK-771829',
    allocations: [
      {
        billId: bill.id,
        allocatedAmountSar: 1000.0,
      },
    ],
    notes: 'دفعة سداد جزئية من حساب البنك الأهلي',
  });

  logger.info(`[Purchasing] Successfully seeded initial purchasing records for tenant: ${tenantId}`);
}

/**
 * Point of Sale (POS) Engine Types — Saudi ERP Platform
 * Registers, Shifts, Tender Types, Cart Items, X/Z Reports, and Offline Sync.
 */

export type RegisterStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
export type ShiftStatus = 'OPEN' | 'CLOSED';
export type PosTenderType = 'CASH' | 'MADA' | 'CREDIT_CARD' | 'CUSTOMER_CREDIT' | 'GIFT_CARD';

export interface PosRegister {
  id: string;
  tenantId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  branchId: string;
  branchNameAr?: string;
  warehouseId: string;
  cashAccountId: string; // Default cash account in COA (e.g. 1111)
  bankAccountId: string; // Default bank/Mada account (e.g. 1112)
  status: RegisterStatus;
  currentShiftId?: string;
  currentCashierId?: string;
  currentCashierName?: string;
  lastZReportNumber?: number;
  ipAddress?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PosShift {
  id: string;
  tenantId: string;
  registerId: string;
  registerCode: string;
  cashierId: string;
  cashierName: string;
  cashierRole: string;
  status: ShiftStatus;
  openedAt: string;
  closedAt?: string;
  openingFloatSar: number; // Opening cash in drawer
  
  // Accumulated Totals during shift
  grossSalesSar: number;
  returnsSar: number;
  netSalesSar: number;
  totalVatSar: number;
  totalDiscountsSar: number;
  transactionCount: number;

  // Tender Breakdown
  cashSalesSar: number;
  madaSalesSar: number;
  creditCardSalesSar: number;
  customerCreditSalesSar: number;
  giftCardSalesSar: number;

  // Cash In / Out Movements
  totalCashInSar: number;
  totalCashOutSar: number;
  
  // Closing reconciliation
  expectedCashSar: number; // openingFloat + cashSales + cashIn - cashOut
  actualCashCountedSar?: number;
  cashDifferenceSar?: number; // actual - expected (positive = surplus, negative = deficit)
  discrepancyReason?: string;
  supervisorApprovalId?: string;
  supervisorNotes?: string;

  zReportNumber?: number;
  journalEntryId?: string; // Posted GL voucher for shift closing
}

export interface CashMovement {
  id: string;
  tenantId: string;
  shiftId: string;
  registerId: string;
  type: 'CASH_IN' | 'CASH_OUT';
  amountSar: number;
  reason: string;
  performedBy: string;
  performedAt: string;
  receiptNumber: string;
}

export interface PosCartItem {
  itemId: string;
  itemCode: string;
  nameAr: string;
  nameEn: string;
  barcode: string;
  uom: string;
  unitPriceSar: number;
  quantity: number;
  vatRate: number; // 0.15 for KSA standard
  discountAmountSar: number;
  discountPercentage: number;
  subtotalSar: number; // (unitPrice * qty) - discount
  vatAmountSar: number;
  totalSar: number;
  costPriceSar?: number;
  category?: string;
  imageUrl?: string;
}

export interface PosPaymentSplit {
  tenderType: PosTenderType;
  amountSar: number;
  referenceNumber?: string;
  cardLastFour?: string;
  authCode?: string;
}

export interface PosOrder {
  id: string;
  tenantId: string;
  orderNumber: string;
  invoiceNumber: string;
  shiftId: string;
  registerId: string;
  cashierId: string;
  cashierName: string;
  customerId?: string;
  customerName?: string;
  customerVatNumber?: string;
  
  items: PosCartItem[];
  subtotalSar: number;
  discountTotalSar: number;
  vatTotalSar: number;
  grandTotalSar: number;
  roundingSar: number;
  
  payments: PosPaymentSplit[];
  amountPaidSar: number;
  changeDueSar: number;
  
  isOfflineSync: boolean;
  offlineId?: string;
  syncTimestamp?: string;
  
  zatcaQrCodeBase64: string;
  zatcaStatus: 'PENDING' | 'CLEARED' | 'REPORTED' | 'FAILED';
  journalEntryId?: string;
  createdAt: string;
}

export interface HeldCart {
  id: string;
  tenantId: string;
  registerId: string;
  cashierId: string;
  customerName?: string;
  items: PosCartItem[];
  subtotalSar: number;
  vatTotalSar: number;
  grandTotalSar: number;
  note?: string;
  heldAt: string;
}

export interface XReportData {
  register: PosRegister;
  shift: PosShift;
  cashMovements: CashMovement[];
  recentOrdersCount: number;
  generatedAt: string;
}

export interface ZReportData {
  reportNumber: number;
  register: PosRegister;
  shift: PosShift;
  cashMovements: CashMovement[];
  tenderBreakdown: {
    cash: number;
    mada: number;
    creditCard: number;
    customerCredit: number;
    giftCard: number;
    total: number;
  };
  reconciliation: {
    openingFloat: number;
    cashSales: number;
    cashIn: number;
    cashOut: number;
    expectedCash: number;
    actualCash: number;
    difference: number;
    status: 'BALANCED' | 'SHORTAGE' | 'OVERAGE';
  };
  generatedAt: string;
  closedBy: string;
}

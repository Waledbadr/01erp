/**
 * Saudi ERP & Business Management Platform — Treasury Domain Engine (Phase 08)
 * 
 * Compliant with:
 * - Rule G1: General Ledger as single financial source of truth
 * - Rule G7/G8: Decimal-exact Halalas integer fixed-point arithmetic
 * - Saudi Banking Regulations: IBAN verification (SA + 22 alphanumeric digits, checksum verification)
 * - VAT Law: 15% Input/Output VAT segregation on petty cash & expense vouchers
 */

import { toHalalasInt, fromHalalasInt, roundHalalas } from './accounting.js';

// ============================================================================
// 1. TREASURY ACCOUNTS & VAULTS (الخزائن والحسابات البنكية والعهد)
// ============================================================================

export type TreasuryAccountType = 'CASH_DRAWER' | 'BANK_ACCOUNT' | 'PETTY_CASH' | 'POS_TERMINAL';
export type TreasuryAccountStatus = 'ACTIVE' | 'FROZEN' | 'CLOSED';

export interface TreasuryAccount {
  id: string;
  tenantId: string;
  code: string; // e.g. "TREAS-001", "BNK-RAJHI-01"
  nameAr: string;
  nameEn: string;
  type: TreasuryAccountType;
  glAccountId: string; // Linked GL Account (e.g. 10101, 10201)
  glAccountCode: string;
  glAccountNameAr?: string;
  branchId?: string;
  branchNameAr?: string;
  currency: string; // "SAR"
  bankName?: string; // e.g. "مصرف الراجحي", "البنك الأهلي السعودي"
  accountNumber?: string;
  iban?: string; // Saudi IBAN: SA + 22 alphanumeric digits
  swiftBic?: string;
  custodianName?: string; // For PETTY_CASH / Cashier
  custodianEmployeeId?: string;
  posTerminalId?: string; // POS Device Serial Number
  posBankPartner?: string;
  openingBalanceSar: number;
  currentBalanceSar: number;
  status: TreasuryAccountStatus;
  isDefault: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TreasuryOverviewMetrics {
  totalLiquidFundsSar: number;
  bankBalancesSar: number;
  vaultBalancesSar: number;
  custodyBalancesSar: number;
  posBalancesSar: number;
  chequesInHandSar: number;
  totalReceiptsMonthSar: number;
  totalPaymentsMonthSar: number;
  unreconciledStatementsCount: number;
  pendingChequesCount: number;
}

// ============================================================================
// 2. PAYMENT & RECEIPT METHODS (طرق القبض والدفع)
// ============================================================================

export type TreasuryPaymentMethod =
  | 'CASH'
  | 'BANK_TRANSFER'
  | 'CHEQUE'
  | 'MADA'
  | 'VISA_MASTER'
  | 'STC_PAY'
  | 'SADAD';

export type VoucherStatus = 'DRAFT' | 'POSTED' | 'CANCELLED';

// ============================================================================
// 3. RECEIPT VOUCHERS (سندات القبض)
// ============================================================================

export type ReceiptCategory =
  | 'CUSTOMER_PAYMENT'      // سداد عميل (مربوط بفواتير مبيعات أو على الحساب)
  | 'DIRECT_REVENUE'        // إيراد مباشر / نقدي
  | 'CUSTODY_REFUND'         // استرداد متبقي عهدة نقدية
  | 'PARTNER_DEPOSIT'        // إيداع جاري شركاء / رأس مال
  | 'OTHER_INFLOW';          // مقبوضات أخرى متنوعة

export interface ReceiptAllocationLine {
  id: string;
  invoiceId?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  originalAmountSar?: number;
  remainingAmountSar?: number;
  allocatedAmountSar: number;
  notes?: string;
}

export interface TreasuryReceipt {
  id: string;
  tenantId: string;
  receiptNumber: string; // e.g. "RC-2026-0001"
  receiptDate: string; // YYYY-MM-DD
  treasuryAccountId: string;
  treasuryAccountNameAr?: string;
  treasuryAccountType?: TreasuryAccountType;
  category: ReceiptCategory;
  paymentMethod: TreasuryPaymentMethod;
  amountSar: number;
  allocatedAmountSar: number;
  unallocatedAmountSar: number;
  customerId?: string;
  customerNameAr?: string;
  customerNameEn?: string;
  revenueAccountId?: string; // Used when category is DIRECT_REVENUE
  revenueAccountNameAr?: string;
  custodianId?: string; // Used when category is CUSTODY_REFUND
  payerName: string; // اسم المسلّم / المدفوع منه
  referenceNumber?: string; // رقم الحوالة / رقم عملية مدى
  chequeNumber?: string;
  chequeBank?: string;
  chequeDueDate?: string;
  descriptionAr: string;
  descriptionEn?: string;
  allocations: ReceiptAllocationLine[];
  status: VoucherStatus;
  journalId?: string;
  journalNumber?: string;
  branchId?: string;
  costCenterId?: string;
  createdBy: string;
  postedBy?: string;
  postedAt?: string;
  createdAt: string;
}

// ============================================================================
// 4. PAYMENT VOUCHERS (سندات الصرف)
// ============================================================================

export type PaymentCategory =
  | 'SUPPLIER_PAYMENT'      // سداد مورد (مربوط بفواتير مشتريات أو دفعة مقدمة)
  | 'OPERATING_EXPENSE'     // مصروف تشغيلي مباشر مع الضريبة
  | 'CUSTODY_FUNDING'        // صرف / تغذية عهدة نقدية لموظف
  | 'PARTNER_WITHDRAWAL'     // مسحوبات شركاء
  | 'TAX_PAYMENT'           // سداد مستحقات الزكاة والضريبة (ZATCA)
  | 'OTHER_OUTFLOW';         // مدفوعات أخرى

export interface PaymentBillAllocationLine {
  id: string;
  billId?: string;
  billNumber?: string;
  supplierInvoiceNumber?: string;
  originalAmountSar?: number;
  remainingAmountSar?: number;
  allocatedAmountSar: number;
  notes?: string;
}

export interface ExpenseTaxBreakdownLine {
  id: string;
  expenseAccountId: string;
  expenseAccountCode: string;
  expenseAccountNameAr?: string;
  descriptionAr: string;
  taxableAmountSar: number; // المبلغ قبل الضريبة
  taxRatePercent: number;   // 15% standard, 0% zero/exempt
  taxAmountSar: number;      // مبلغ الضريبة
  totalAmountSar: number;    // المبلغ الإجمالي شامل الضريبة
  supplierVatNumber?: string; // للتحقق من فواتير المصروفات الضريبية
  supplierInvoiceRef?: string;
}

export interface TreasuryPayment {
  id: string;
  tenantId: string;
  paymentNumber: string; // e.g. "PV-2026-0001"
  paymentDate: string; // YYYY-MM-DD
  treasuryAccountId: string;
  treasuryAccountNameAr?: string;
  treasuryAccountType?: TreasuryAccountType;
  category: PaymentCategory;
  paymentMethod: TreasuryPaymentMethod;
  amountSar: number;
  allocatedAmountSar: number;
  unallocatedAmountSar: number;
  supplierId?: string;
  supplierNameAr?: string;
  supplierNameEn?: string;
  recipientName: string; // اسم المستلم / المستفيد
  custodianId?: string; // Used when category is CUSTODY_FUNDING
  referenceNumber?: string; // رقم الحوالة البنكية / الشيك
  chequeNumber?: string;
  chequeBank?: string;
  chequeDueDate?: string;
  descriptionAr: string;
  descriptionEn?: string;
  billAllocations: PaymentBillAllocationLine[];
  expenseLines: ExpenseTaxBreakdownLine[];
  status: VoucherStatus;
  journalId?: string;
  journalNumber?: string;
  branchId?: string;
  costCenterId?: string;
  createdBy: string;
  postedBy?: string;
  postedAt?: string;
  createdAt: string;
}

// ============================================================================
// 5. INTER-ACCOUNT TREASURY TRANSFERS (التحويل بين الخزائن والحسابات)
// ============================================================================

export interface TreasuryTransfer {
  id: string;
  tenantId: string;
  transferNumber: string; // e.g. "TRF-2026-0001"
  transferDate: string; // YYYY-MM-DD
  fromAccountId: string;
  fromAccountNameAr?: string;
  toAccountId: string;
  toAccountNameAr?: string;
  amountSar: number;
  transferFeeSar: number; // رسوم التحويل البنكي
  feeExpenseAccountId?: string; // حساب المصاريف البنكية (60401)
  referenceNumber?: string;
  descriptionAr: string;
  descriptionEn?: string;
  status: VoucherStatus;
  journalId?: string;
  journalNumber?: string;
  createdBy: string;
  postedBy?: string;
  postedAt?: string;
  createdAt: string;
}

// ============================================================================
// 6. CUSTODY & PETTY CASH SETTLEMENTS (إدارة وتسوية العهد النقدية)
// ============================================================================

export type CustodySettlementStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'POSTED' | 'REJECTED';

export interface CustodyExpenseItem {
  id: string;
  expenseAccountId: string;
  expenseAccountCode: string;
  expenseAccountNameAr?: string;
  receiptNumber?: string;
  receiptDate: string;
  vendorName: string;
  vendorVatNumber?: string;
  taxableAmountSar: number;
  vatAmountSar: number;
  totalAmountSar: number;
  descriptionAr: string;
  costCenterId?: string;
}

export interface PettyCashSettlement {
  id: string;
  tenantId: string;
  settlementNumber: string; // e.g. "STL-2026-0001"
  settlementDate: string;
  custodyAccountId: string; // TreasuryAccount with type 'PETTY_CASH'
  custodyAccountNameAr?: string;
  custodianName: string;
  custodianEmployeeId?: string;
  custodyStartingBalanceSar: number;
  totalExpensesSar: number;
  totalVatSar: number;
  grossExpensesSar: number; // totalExpenses + totalVat
  refundedAmountSar: number; // Return remaining cash to vault
  refundDestinationAccountId?: string; // Cash drawer to receive refund
  closingBalanceSar: number; // starting - grossExpenses - refunded
  expenseItems: CustodyExpenseItem[];
  status: CustodySettlementStatus;
  journalId?: string;
  journalNumber?: string;
  notes?: string;
  submittedBy: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
}

// ============================================================================
// 7. BANK RECONCILIATION ENGINE (مطابقة كشوف الحسابات البنكية)
// ============================================================================

export type ReconciliationMatchStatus = 'UNMATCHED' | 'AUTO_MATCHED' | 'MANUALLY_MATCHED' | 'EXCLUDED';
export type BankReconciliationSessionStatus = 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface BankStatementLine {
  id: string;
  statementId: string;
  transactionDate: string;
  valueDate?: string;
  referenceNumber: string;
  description: string;
  depositAmountSar: number;   // Inflow / إيداع
  withdrawalAmountSar: number; // Outflow / سحب
  runningBalanceSar: number;
  matchStatus: ReconciliationMatchStatus;
  matchedTransactionId?: string;
  matchedTransactionType?: 'RECEIPT' | 'PAYMENT' | 'TRANSFER' | 'JOURNAL';
  matchNotes?: string;
}

export interface BankStatement {
  id: string;
  tenantId: string;
  treasuryAccountId: string;
  statementNumber: string;
  startDate: string;
  endDate: string;
  openingBalanceSar: number;
  closingBalanceSar: number;
  totalDepositsSar: number;
  totalWithdrawalsSar: number;
  lines: BankStatementLine[];
  uploadedAt: string;
  uploadedBy: string;
}

export interface BankReconciliation {
  id: string;
  tenantId: string;
  reconciliationNumber: string; // e.g. "REC-2026-0001"
  treasuryAccountId: string;
  treasuryAccountNameAr?: string;
  statementId: string;
  asOfDate: string; // YYYY-MM-DD
  bankStatementEndingBalanceSar: number;
  glBookBalanceSar: number;
  unpresentedChequesTotalSar: number; // شيكات صادرة لم تصرف
  depositsInTransitTotalSar: number;    // إيداعات قيد التحصيل
  bankChargesAdjustmentsSar: number;   // مصاريف بنكية غير مسجلة
  adjustedBankBalanceSar: number;
  adjustedBookBalanceSar: number;
  discrepancySar: number; // adjustedBankBalance - adjustedBookBalance (must be 0.00 to complete)
  matchedCount: number;
  unmatchedCount: number;
  status: BankReconciliationSessionStatus;
  completedAt?: string;
  completedBy?: string;
  notes?: string;
  createdAt: string;
}

// ============================================================================
// 8. CHEQUES PORTFOLIO (حافظة الشيكات تحت التحصيل والصادرة)
// ============================================================================

export type ChequeType = 'RECEIVED_IN_HAND' | 'ISSUED_PAYMENT';
export type ChequeStatus =
  | 'UNDER_COLLECTION' // تحت التحصيل بالخزينة
  | 'DEPOSITED_AT_BANK' // أودع بالبنك للتحصيل
  | 'CLEARED'            // تم التحصيل / الصرف بنجاح
  | 'BOUNCED'            // شيك مرتجع / بدون رصيد
  | 'RETURNED_TO_DRAWER' // أعيد للساحب
  | 'CANCELLED';          // ملغى

export interface ChequeRecord {
  id: string;
  tenantId: string;
  type: ChequeType;
  chequeNumber: string;
  bankName: string;
  drawerOrPayeeName: string;
  amountSar: number;
  issueDate: string;
  dueDate: string;
  collectionDate?: string;
  treasuryAccountId: string; // Current treasury or bank holding the cheque
  treasuryAccountNameAr?: string;
  depositBankAccountId?: string; // Bank where cheque was submitted for collection
  customerId?: string;
  supplierId?: string;
  voucherId?: string; // Linked Receipt or Payment Voucher
  voucherNumber?: string;
  status: ChequeStatus;
  bounceReason?: string;
  clearanceJournalId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// 9. VALIDATION & ARITHMETIC UTILITIES
// ============================================================================

/**
 * Generates a compliant Saudi Arabian IBAN with calculated MOD-97 check digits.
 */
export function generateValidSaudiIban(bankCode: string, accountNumber: string): string {
  const bCode = bankCode.replace(/\D/g, '').padStart(2, '0').slice(0, 2);
  const acc = accountNumber.replace(/\D/g, '').padStart(18, '0').slice(0, 18);
  const bban = bCode + acc; // 20 digits
  
  // ISO 7064 MOD 97-10 check digits
  // SA = 28 10
  const checkString = bban + '281000';
  let remainder = 0;
  for (let i = 0; i < checkString.length; i++) {
    remainder = (remainder * 10 + parseInt(checkString[i], 10)) % 97;
  }
  let checkDigits = 98 - remainder;
  if (checkDigits === 97) checkDigits = 0;
  const cdStr = checkDigits.toString().padStart(2, '0');
  return `SA${cdStr}${bban}`;
}

/**
 * Validates a Saudi Arabian IBAN (International Bank Account Number).
 * Format: SA + 2 digits (checksum) + 2 digits (bank code) + 18 digits (account) = 24 chars total.
 */
export function validateSaudiIban(iban: string): { isValid: boolean; normalized: string; error?: string } {
  if (!iban) {
    return { isValid: false, normalized: '', error: 'IBAN is required' };
  }

  const clean = iban.replace(/\s+/g, '').toUpperCase();
  if (!clean.startsWith('SA')) {
    return { isValid: false, normalized: clean, error: 'Saudi IBAN must start with country code "SA"' };
  }

  if (clean.length !== 24) {
    return {
      isValid: false,
      normalized: clean,
      error: `Saudi IBAN must be exactly 24 characters long (received ${clean.length})`,
    };
  }

  const alphanumericRegex = /^SA[0-9]{2}[0-9A-Z]{20}$/;
  if (!alphanumericRegex.test(clean)) {
    return {
      isValid: false,
      normalized: clean,
      error: 'IBAN format is invalid. Must contain valid alphanumeric characters.',
    };
  }

  // MOD-97 Checksum verification
  const rearranged = clean.substring(4) + clean.substring(0, 4);
  let numericString = '';
  for (let i = 0; i < rearranged.length; i++) {
    const code = rearranged.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      numericString += (code - 55).toString(); // A=10, B=11 ... Z=35
    } else {
      numericString += rearranged[i];
    }
  }

  // Modulo 97 on large numeric string
  let remainder = 0;
  for (let i = 0; i < numericString.length; i++) {
    remainder = (remainder * 10 + parseInt(numericString[i], 10)) % 97;
  }

  if (remainder !== 1) {
    return { isValid: false, normalized: clean, error: 'IBAN checksum verification failed (MOD 97 check)' };
  }

  return { isValid: true, normalized: clean };
}

/**
 * Validates Saudi 15-digit Tax Identification Number (VAT/TRN).
 */
export function validateSaudiVat(vat: string): boolean {
  if (!vat) return false;
  const clean = vat.trim();
  return clean.length === 15 && clean.startsWith('3') && clean.endsWith('3') && /^[0-9]{15}$/.test(clean);
}

/**
 * Calculates line-level 15% VAT for expense items in exact Halalas.
 */
export function calculateExpenseVat(
  taxableAmountSar: number,
  ratePercent: number = 15
): {
  taxableHalalas: number;
  vatHalalas: number;
  totalHalalas: number;
  taxableSar: number;
  vatSar: number;
  totalSar: number;
} {
  const taxableHalalas = toHalalasInt(taxableAmountSar);
  const vatHalalas = ratePercent > 0 ? roundHalalas((taxableHalalas * ratePercent) / 100) : 0;
  const totalHalalas = taxableHalalas + vatHalalas;

  return {
    taxableHalalas,
    vatHalalas,
    totalHalalas,
    taxableSar: fromHalalasInt(taxableHalalas),
    vatSar: fromHalalasInt(vatHalalas),
    totalSar: fromHalalasInt(totalHalalas),
  };
}

/**
 * Calculates Bank Reconciliation summary mathematically.
 */
export function computeBankReconciliationSummary(params: {
  bankStatementEndingBalanceSar: number;
  glBookBalanceSar: number;
  unpresentedChequesSar: number;
  depositsInTransitSar: number;
  bankChargesSar: number;
}): {
  adjustedBankBalanceSar: number;
  adjustedBookBalanceSar: number;
  discrepancySar: number;
  isBalanced: boolean;
} {
  const statementHalalas = toHalalasInt(params.bankStatementEndingBalanceSar);
  const bookHalalas = toHalalasInt(params.glBookBalanceSar);
  const unpresentedHalalas = toHalalasInt(params.unpresentedChequesSar);
  const depositsInTransitHalalas = toHalalasInt(params.depositsInTransitSar);
  const bankChargesHalalas = toHalalasInt(params.bankChargesSar);

  // Adjusted Bank = Statement + Deposits in Transit - Unpresented Cheques
  const adjustedBankHalalas = statementHalalas + depositsInTransitHalalas - unpresentedHalalas;

  // Adjusted Book = Book Balance - Bank Charges / Unrecorded debits
  const adjustedBookHalalas = bookHalalas - bankChargesHalalas;

  const discrepancyHalalas = adjustedBankHalalas - adjustedBookHalalas;

  return {
    adjustedBankBalanceSar: fromHalalasInt(adjustedBankHalalas),
    adjustedBookBalanceSar: fromHalalasInt(adjustedBookHalalas),
    discrepancySar: fromHalalasInt(discrepancyHalalas),
    isBalanced: discrepancyHalalas === 0,
  };
}

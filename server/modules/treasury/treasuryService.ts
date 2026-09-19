/**
 * Saudi ERP & Business Management Platform — Treasury Service (Phase 08)
 * 
 * Implements:
 * - Treasury Accounts & Vaults Management (Cash Drawers, Bank Accounts, Petty Cash, POS)
 * - Receipt Vouchers (سندات القبض) with Multi-Invoice & On-Account Allocations
 * - Payment Vouchers (سندات الصرف) with Multi-Bill & Expense 15% VAT Breakdown
 * - Inter-Account Treasury Transfers with Bank Charges
 * - Custody / Petty Cash Expense Settlements & Closures
 * - Bank Reconciliation Matching Engine & Discrepancy Elimination
 * - Cheques In Hand & Issued Cheques Portfolio with Collection Lifecycle
 * - Decimal-Exact Halalas Fixed-Point Arithmetic (Rule G7/G8)
 * - Atomic Double-Entry General Ledger Postings (Rule G1)
 */

import crypto from 'crypto';
import {
  TreasuryAccount,
  TreasuryReceipt,
  TreasuryPayment,
  TreasuryTransfer,
  PettyCashSettlement,
  BankStatement,
  BankReconciliation,
  ChequeRecord,
  validateSaudiIban,
  generateValidSaudiIban,
  calculateExpenseVat,
  computeBankReconciliationSummary,
  TreasuryAccountType,
  ReceiptCategory,
  PaymentCategory,
  TreasuryPaymentMethod,
  VoucherStatus,
} from '../../../src/lib/treasury.js';
import { toHalalasInt, fromHalalasInt, roundHalalas } from '../../../src/lib/accounting.js';
import { CentralTenantDataStore, TenantContext, NotFoundError, ValidationError, ConflictError } from '../../core/tenantGuard.js';
import { logger } from '../../core/logger.js';

// Helper for decimal parsing
function parseAmountToHalalas(amount: number | string | undefined): number {
  if (amount === undefined || amount === null || amount === '') return 0;
  return toHalalasInt(Number(amount));
}

// Generate unique sequential voucher codes
function generateVoucherCode(prefix: string, count: number): string {
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${(count + 1).toString().padStart(4, '0')}`;
}

// ============================================================================
// 1. TREASURY ACCOUNTS & VAULTS SERVICE
// ============================================================================

export function getTreasuryAccountsService(
  store: CentralTenantDataStore,
  tenantId: string,
  filters?: { type?: string; status?: string; search?: string }
): TreasuryAccount[] {
  let accounts = (store as any).treasuryAccounts?.get(tenantId) || [];

  if (filters?.type) {
    accounts = accounts.filter((a: TreasuryAccount) => a.type === filters.type);
  }
  if (filters?.status) {
    accounts = accounts.filter((a: TreasuryAccount) => a.status === filters.status);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    accounts = accounts.filter(
      (a: TreasuryAccount) =>
        a.code.toLowerCase().includes(q) ||
        a.nameAr.toLowerCase().includes(q) ||
        a.nameEn.toLowerCase().includes(q) ||
        a.bankName?.toLowerCase().includes(q) ||
        a.iban?.toLowerCase().includes(q) ||
        a.custodianName?.toLowerCase().includes(q)
    );
  }

  return accounts;
}

export function getTreasuryAccountByIdService(
  store: CentralTenantDataStore,
  tenantId: string,
  id: string
): TreasuryAccount {
  const accounts = (store as any).treasuryAccounts?.get(tenantId) || [];
  const account = accounts.find((a: TreasuryAccount) => a.id === id || a.code === id);
  if (!account) {
    throw new NotFoundError(`Treasury account with ID or code "${id}" not found.`);
  }
  return account;
}

export function createTreasuryAccountService(
  store: CentralTenantDataStore,
  context: TenantContext,
  payload: {
    code?: string;
    nameAr: string;
    nameEn?: string;
    type: TreasuryAccountType;
    glAccountId?: string;
    glAccountCode?: string;
    branchId?: string;
    bankName?: string;
    accountNumber?: string;
    iban?: string;
    swiftBic?: string;
    custodianName?: string;
    custodianEmployeeId?: string;
    posTerminalId?: string;
    posBankPartner?: string;
    openingBalanceSar?: number;
    isDefault?: boolean;
    notes?: string;
  }
): TreasuryAccount {
  if (!payload.nameAr || !payload.nameAr.trim()) {
    throw new ValidationError('Arabic account name is mandatory.');
  }

  const accounts: TreasuryAccount[] = (store as any).treasuryAccounts?.get(context.tenantId) || [];

  // Determine GL Account code based on Treasury Type if not provided
  let glCode = payload.glAccountCode || payload.glAccountId;
  if (!glCode) {
    switch (payload.type) {
      case 'CASH_DRAWER':
        glCode = '10101';
        break;
      case 'BANK_ACCOUNT':
        glCode = '10201';
        break;
      case 'PETTY_CASH':
        glCode = '10102';
        break;
      case 'POS_TERMINAL':
        glCode = '10202';
        break;
      default:
        glCode = '10101';
    }
  }

  // Validate Saudi IBAN if provided for Bank Account
  let normalizedIban: string | undefined = undefined;
  if (payload.type === 'BANK_ACCOUNT' && payload.iban) {
    const ibanResult = validateSaudiIban(payload.iban);
    if (!ibanResult.isValid) {
      throw new ValidationError(`Invalid Saudi IBAN: ${ibanResult.error}`);
    }
    normalizedIban = ibanResult.normalized;

    // Check duplicate IBAN
    const duplicateIban = accounts.find((a) => a.iban === normalizedIban);
    if (duplicateIban) {
      throw new ConflictError(`Bank account with IBAN "${normalizedIban}" already exists.`);
    }
  }

  // Generate unique code if not given
  let code = payload.code?.trim().toUpperCase();
  if (!code) {
    const prefix =
      payload.type === 'CASH_DRAWER'
        ? 'CSH'
        : payload.type === 'BANK_ACCOUNT'
        ? 'BNK'
        : payload.type === 'PETTY_CASH'
        ? 'CUST'
        : 'POS';
    code = `${prefix}-${(accounts.length + 1).toString().padStart(3, '0')}`;
  }

  if (accounts.some((a) => a.code === code)) {
    throw new ConflictError(`Treasury account with code "${code}" already exists.`);
  }

  const openingHalalas = parseAmountToHalalas(payload.openingBalanceSar);
  const isDefault = Boolean(payload.isDefault) || accounts.length === 0;

  if (isDefault) {
    // Demote existing default of same type
    accounts.forEach((a) => {
      if (a.type === payload.type) a.isDefault = false;
    });
  }

  const newAccount: TreasuryAccount = {
    id: crypto.randomUUID(),
    tenantId: context.tenantId,
    code,
    nameAr: payload.nameAr.trim(),
    nameEn: payload.nameEn?.trim() || payload.nameAr.trim(),
    type: payload.type,
    glAccountId: glCode,
    glAccountCode: glCode,
    glAccountNameAr:
      payload.type === 'BANK_ACCOUNT'
        ? 'حسابات البنوك'
        : payload.type === 'PETTY_CASH'
        ? 'العهد النقدية'
        : 'الصندوق الرئيسي',
    branchId: payload.branchId || context.branchId,
    currency: 'SAR',
    bankName: payload.bankName?.trim(),
    accountNumber: payload.accountNumber?.trim(),
    iban: normalizedIban,
    swiftBic: payload.swiftBic?.trim(),
    custodianName: payload.custodianName?.trim(),
    custodianEmployeeId: payload.custodianEmployeeId?.trim(),
    posTerminalId: payload.posTerminalId?.trim(),
    posBankPartner: payload.posBankPartner?.trim(),
    openingBalanceSar: fromHalalasInt(openingHalalas),
    currentBalanceSar: fromHalalasInt(openingHalalas),
    status: 'ACTIVE',
    isDefault,
    notes: payload.notes?.trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  accounts.push(newAccount);
  if (!(store as any).treasuryAccounts) {
    (store as any).treasuryAccounts = new Map<string, TreasuryAccount[]>();
  }
  (store as any).treasuryAccounts.set(context.tenantId, accounts);

  logger.info(`Created Treasury Account ${newAccount.code} (${newAccount.type}) for tenant ${context.tenantId}`);
  return newAccount;
}

export function updateTreasuryAccountService(
  store: CentralTenantDataStore,
  context: TenantContext,
  id: string,
  updates: Partial<TreasuryAccount>
): TreasuryAccount {
  const accounts: TreasuryAccount[] = (store as any).treasuryAccounts?.get(context.tenantId) || [];
  const index = accounts.findIndex((a) => a.id === id);
  if (index === -1) {
    throw new NotFoundError(`Treasury account with ID "${id}" not found.`);
  }

  const existing = accounts[index];

  if (updates.iban && updates.iban !== existing.iban) {
    const ibanResult = validateSaudiIban(updates.iban);
    if (!ibanResult.isValid) {
      throw new ValidationError(`Invalid Saudi IBAN: ${ibanResult.error}`);
    }
    updates.iban = ibanResult.normalized;
  }

  const updated: TreasuryAccount = {
    ...existing,
    ...updates,
    id: existing.id,
    tenantId: existing.tenantId,
    code: existing.code,
    type: existing.type,
    updatedAt: new Date().toISOString(),
  };

  accounts[index] = updated;
  (store as any).treasuryAccounts.set(context.tenantId, accounts);
  return updated;
}

export function setTreasuryAccountStatusService(
  store: CentralTenantDataStore,
  context: TenantContext,
  id: string,
  status: 'ACTIVE' | 'FROZEN' | 'CLOSED'
): TreasuryAccount {
  return updateTreasuryAccountService(store, context, id, { status });
}

// ============================================================================
// 2. RECEIPT VOUCHERS SERVICE (سندات القبض)
// ============================================================================

export function getTreasuryReceiptsService(
  store: CentralTenantDataStore,
  tenantId: string,
  filters?: { category?: string; status?: string; customerId?: string; search?: string }
): TreasuryReceipt[] {
  let receipts: TreasuryReceipt[] = (store as any).treasuryReceipts?.get(tenantId) || [];

  if (filters?.category) {
    receipts = receipts.filter((r) => r.category === filters.category);
  }
  if (filters?.status) {
    receipts = receipts.filter((r) => r.status === filters.status);
  }
  if (filters?.customerId) {
    receipts = receipts.filter((r) => r.customerId === filters.customerId);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    receipts = receipts.filter(
      (r) =>
        r.receiptNumber.toLowerCase().includes(q) ||
        r.payerName.toLowerCase().includes(q) ||
        r.customerNameAr?.toLowerCase().includes(q) ||
        r.referenceNumber?.toLowerCase().includes(q)
    );
  }

  return receipts.sort((a, b) => b.receiptDate.localeCompare(a.receiptDate));
}

export function getTreasuryReceiptByIdService(
  store: CentralTenantDataStore,
  tenantId: string,
  id: string
): TreasuryReceipt {
  const receipts: TreasuryReceipt[] = (store as any).treasuryReceipts?.get(tenantId) || [];
  const receipt = receipts.find((r) => r.id === id || r.receiptNumber === id);
  if (!receipt) {
    throw new NotFoundError(`Receipt voucher with ID "${id}" not found.`);
  }
  return receipt;
}

export function createTreasuryReceiptService(
  store: CentralTenantDataStore,
  context: TenantContext,
  payload: {
    receiptDate?: string;
    treasuryAccountId: string;
    category: ReceiptCategory;
    paymentMethod: TreasuryPaymentMethod;
    amountSar: number;
    customerId?: string;
    customerNameAr?: string;
    revenueAccountId?: string;
    custodianId?: string;
    payerName: string;
    referenceNumber?: string;
    chequeNumber?: string;
    chequeBank?: string;
    chequeDueDate?: string;
    descriptionAr: string;
    descriptionEn?: string;
    allocations?: Array<{
      invoiceId?: string;
      invoiceNumber?: string;
      allocatedAmountSar: number;
      notes?: string;
    }>;
    branchId?: string;
    costCenterId?: string;
  }
): TreasuryReceipt {
  const totalAmountHalalas = parseAmountToHalalas(payload.amountSar);
  if (totalAmountHalalas <= 0) {
    throw new ValidationError('Receipt amount must be strictly greater than 0.00 SAR.');
  }

  const treasuryAccount = getTreasuryAccountByIdService(store, context.tenantId, payload.treasuryAccountId);
  if (treasuryAccount.status === 'FROZEN') {
    throw new ValidationError(`Treasury account "${treasuryAccount.nameAr}" is frozen and cannot receive funds.`);
  }

  let customerNameAr = payload.customerNameAr;
  let customerNameEn: string | undefined = undefined;
  if (payload.customerId) {
    const customers = store.customers.get(context.tenantId) || [];
    const cust = customers.find((c) => c.id === payload.customerId);
    if (cust) {
      customerNameAr = cust.nameAr;
      customerNameEn = cust.nameEn;
    }
  }

  // Calculate allocations
  let totalAllocatedHalalas = 0;
  const sanitizedAllocations: any[] = [];
  if (payload.allocations && payload.allocations.length > 0) {
    for (const alloc of payload.allocations) {
      const allocHalalas = parseAmountToHalalas(alloc.allocatedAmountSar);
      if (allocHalalas <= 0) continue;
      totalAllocatedHalalas += allocHalalas;
      sanitizedAllocations.push({
        id: crypto.randomUUID(),
        invoiceId: alloc.invoiceId,
        invoiceNumber: alloc.invoiceNumber,
        allocatedAmountSar: fromHalalasInt(allocHalalas),
        notes: alloc.notes,
      });
    }
  }

  if (totalAllocatedHalalas > totalAmountHalalas) {
    throw new ValidationError(
      `Allocated amount (${fromHalalasInt(totalAllocatedHalalas)} SAR) exceeds total receipt amount (${fromHalalasInt(totalAmountHalalas)} SAR).`
    );
  }

  const unallocatedHalalas = totalAmountHalalas - totalAllocatedHalalas;

  const receipts: TreasuryReceipt[] = (store as any).treasuryReceipts?.get(context.tenantId) || [];
  const receiptNumber = generateVoucherCode('RC', receipts.length);

  const receipt: TreasuryReceipt = {
    id: crypto.randomUUID(),
    tenantId: context.tenantId,
    receiptNumber,
    receiptDate: payload.receiptDate || new Date().toISOString().split('T')[0],
    treasuryAccountId: treasuryAccount.id,
    treasuryAccountNameAr: treasuryAccount.nameAr,
    treasuryAccountType: treasuryAccount.type,
    category: payload.category,
    paymentMethod: payload.paymentMethod,
    amountSar: fromHalalasInt(totalAmountHalalas),
    allocatedAmountSar: fromHalalasInt(totalAllocatedHalalas),
    unallocatedAmountSar: fromHalalasInt(unallocatedHalalas),
    customerId: payload.customerId,
    customerNameAr,
    customerNameEn,
    revenueAccountId: payload.revenueAccountId,
    custodianId: payload.custodianId,
    payerName: payload.payerName.trim(),
    referenceNumber: payload.referenceNumber?.trim(),
    chequeNumber: payload.chequeNumber?.trim(),
    chequeBank: payload.chequeBank?.trim(),
    chequeDueDate: payload.chequeDueDate,
    descriptionAr: payload.descriptionAr.trim(),
    descriptionEn: payload.descriptionEn?.trim(),
    allocations: sanitizedAllocations,
    status: 'POSTED',
    branchId: payload.branchId || context.branchId,
    costCenterId: payload.costCenterId,
    createdBy: context.userId,
    postedBy: context.userId,
    postedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  // 1. Post Balanced Double-Entry General Ledger Journal (Rule G1)
  const debitAccountCode = treasuryAccount.glAccountCode || '10101';
  let creditAccountCode = '10301'; // Default Accounts Receivable
  let creditAccountNameAr = 'العملاء والمدينون التجاريون';

  if (payload.category === 'DIRECT_REVENUE') {
    creditAccountCode = payload.revenueAccountId || '40101';
    creditAccountNameAr = 'إيرادات المبيعات والخدمات';
  } else if (payload.category === 'CUSTODY_REFUND') {
    creditAccountCode = '10102';
    creditAccountNameAr = 'العهد النقدية والمصروفات النثرية';
  } else if (payload.category === 'PARTNER_DEPOSIT') {
    creditAccountCode = '30201';
    creditAccountNameAr = 'جاري الشركاء / رأس المال';
  }

  const journalId = crypto.randomUUID();
  const journals = store.journals.get(context.tenantId) || [];
  const journalNumber = `JV-RC-${Date.now().toString().slice(-6)}`;

  const journalLines: any[] = [
    {
      id: crypto.randomUUID(),
      journalId,
      accountId: debitAccountCode,
      accountCode: debitAccountCode,
      accountNameAr: treasuryAccount.nameAr,
      accountNameEn: treasuryAccount.nameEn,
      debit: receipt.amountSar.toFixed(2),
      credit: '0.00',
      descriptionAr: `قبض نقدية/بنك - سند رقم ${receipt.receiptNumber}`,
      descriptionEn: `Receipt voucher ${receipt.receiptNumber}`,
    },
    {
      id: crypto.randomUUID(),
      journalId,
      accountId: creditAccountCode,
      accountCode: creditAccountCode,
      accountNameAr: creditAccountNameAr,
      accountNameEn: 'Receivable / Revenue Inflow',
      debit: '0.00',
      credit: receipt.amountSar.toFixed(2),
      descriptionAr: `مقبوضات من ${receipt.payerName} - سند ${receipt.receiptNumber}`,
      descriptionEn: `Inflow from ${receipt.payerName}`,
    },
  ];

  const journalEntry: any = {
    id: journalId,
    tenantId: context.tenantId,
    branchId: receipt.branchId,
    entryNumber: journalNumber,
    entryDate: receipt.receiptDate,
    sourceDocumentType: 'RECEIPT',
    sourceDocumentId: receipt.id,
    sourceDocumentNumber: receipt.receiptNumber,
    descriptionAr: `سند قبض رقم ${receipt.receiptNumber} - ${receipt.payerName}`,
    descriptionEn: `Receipt voucher ${receipt.receiptNumber}`,
    status: 'POSTED',
    totalDebit: receipt.amountSar.toFixed(2),
    totalCredit: receipt.amountSar.toFixed(2),
    totalDebitCents: BigInt(totalAmountHalalas),
    totalCreditCents: BigInt(totalAmountHalalas),
    lines: journalLines,
    postedBy: context.userId,
    postedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  journals.push(journalEntry);
  store.journals.set(context.tenantId, journals);

  receipt.journalId = journalId;
  receipt.journalNumber = journalNumber;

  // 2. Update Treasury Account Balance
  treasuryAccount.currentBalanceSar = fromHalalasInt(
    toHalalasInt(treasuryAccount.currentBalanceSar) + totalAmountHalalas
  );
  treasuryAccount.updatedAt = new Date().toISOString();

  // 3. If Cheque method, record in Cheques In Hand Portfolio
  if (payload.paymentMethod === 'CHEQUE' && payload.chequeNumber) {
    const cheques: ChequeRecord[] = (store as any).cheques?.get(context.tenantId) || [];
    cheques.push({
      id: crypto.randomUUID(),
      tenantId: context.tenantId,
      type: 'RECEIVED_IN_HAND',
      chequeNumber: payload.chequeNumber,
      bankName: payload.chequeBank || 'بنك محلي',
      drawerOrPayeeName: payload.payerName,
      amountSar: receipt.amountSar,
      issueDate: receipt.receiptDate,
      dueDate: payload.chequeDueDate || receipt.receiptDate,
      treasuryAccountId: treasuryAccount.id,
      treasuryAccountNameAr: treasuryAccount.nameAr,
      customerId: payload.customerId,
      voucherId: receipt.id,
      voucherNumber: receipt.receiptNumber,
      status: 'UNDER_COLLECTION',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    if (!(store as any).cheques) {
      (store as any).cheques = new Map<string, ChequeRecord[]>();
    }
    (store as any).cheques.set(context.tenantId, cheques);
  }

  // 4. Update Sales Invoices Remaining Balances if allocated
  if (receipt.allocations.length > 0) {
    const salesInvoices = store.salesInvoices.get(context.tenantId) || [];
    for (const alloc of receipt.allocations) {
      if (!alloc.invoiceId) continue;
      const inv = salesInvoices.find((i) => i.id === alloc.invoiceId);
      if (inv) {
        const invRemainingHalalas = parseAmountToHalalas(inv.remainingAmountSar ?? inv.totalAmountSar);
        const allocHalalas = parseAmountToHalalas(alloc.allocatedAmountSar);
        const newRemaining = Math.max(0, invRemainingHalalas - allocHalalas);
        inv.remainingAmountSar = fromHalalasInt(newRemaining);
        if (newRemaining === 0) {
          (inv as any).paymentStatus = 'PAID';
        } else {
          (inv as any).paymentStatus = 'PARTIALLY_PAID';
        }
      }
    }
  }

  receipts.push(receipt);
  if (!(store as any).treasuryReceipts) {
    (store as any).treasuryReceipts = new Map<string, TreasuryReceipt[]>();
  }
  (store as any).treasuryReceipts.set(context.tenantId, receipts);

  logger.info(`Created and Posted Treasury Receipt ${receipt.receiptNumber} (${receipt.amountSar} SAR)`);
  return receipt;
}

// ============================================================================
// 3. PAYMENT VOUCHERS SERVICE (سندات الصرف)
// ============================================================================

export function getTreasuryPaymentsService(
  store: CentralTenantDataStore,
  tenantId: string,
  filters?: { category?: string; status?: string; supplierId?: string; search?: string }
): TreasuryPayment[] {
  let payments: TreasuryPayment[] = (store as any).treasuryPayments?.get(tenantId) || [];

  if (filters?.category) {
    payments = payments.filter((p) => p.category === filters.category);
  }
  if (filters?.status) {
    payments = payments.filter((p) => p.status === filters.status);
  }
  if (filters?.supplierId) {
    payments = payments.filter((p) => p.supplierId === filters.supplierId);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    payments = payments.filter(
      (p) =>
        p.paymentNumber.toLowerCase().includes(q) ||
        p.recipientName.toLowerCase().includes(q) ||
        p.supplierNameAr?.toLowerCase().includes(q) ||
        p.referenceNumber?.toLowerCase().includes(q)
    );
  }

  return payments.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
}

export function getTreasuryPaymentByIdService(
  store: CentralTenantDataStore,
  tenantId: string,
  id: string
): TreasuryPayment {
  const payments: TreasuryPayment[] = (store as any).treasuryPayments?.get(tenantId) || [];
  const payment = payments.find((p) => p.id === id || p.paymentNumber === id);
  if (!payment) {
    throw new NotFoundError(`Payment voucher with ID "${id}" not found.`);
  }
  return payment;
}

export function createTreasuryPaymentService(
  store: CentralTenantDataStore,
  context: TenantContext,
  payload: {
    paymentDate?: string;
    treasuryAccountId: string;
    category: PaymentCategory;
    paymentMethod: TreasuryPaymentMethod;
    amountSar: number;
    supplierId?: string;
    supplierNameAr?: string;
    recipientName: string;
    custodianId?: string;
    referenceNumber?: string;
    chequeNumber?: string;
    chequeBank?: string;
    chequeDueDate?: string;
    descriptionAr: string;
    descriptionEn?: string;
    billAllocations?: Array<{
      billId?: string;
      billNumber?: string;
      allocatedAmountSar: number;
      notes?: string;
    }>;
    expenseLines?: Array<{
      expenseAccountId: string;
      expenseAccountCode?: string;
      expenseAccountNameAr?: string;
      descriptionAr: string;
      taxableAmountSar: number;
      taxRatePercent?: number;
      supplierVatNumber?: string;
      supplierInvoiceRef?: string;
    }>;
    branchId?: string;
    costCenterId?: string;
  }
): TreasuryPayment {
  const totalAmountHalalas = parseAmountToHalalas(payload.amountSar);
  if (totalAmountHalalas <= 0) {
    throw new ValidationError('Payment amount must be strictly greater than 0.00 SAR.');
  }

  const treasuryAccount = getTreasuryAccountByIdService(store, context.tenantId, payload.treasuryAccountId);
  if (treasuryAccount.status === 'FROZEN') {
    throw new ValidationError(`Treasury account "${treasuryAccount.nameAr}" is frozen and cannot disburse funds.`);
  }

  // Ensure sufficient funds in Cash drawer or Petty Cash
  const currentTreasuryHalalas = toHalalasInt(treasuryAccount.currentBalanceSar);
  if ((treasuryAccount.type === 'CASH_DRAWER' || treasuryAccount.type === 'PETTY_CASH') && currentTreasuryHalalas < totalAmountHalalas) {
    throw new ValidationError(
      `Insufficient balance in treasury account "${treasuryAccount.nameAr}". Available: ${treasuryAccount.currentBalanceSar} SAR, Requested: ${fromHalalasInt(totalAmountHalalas)} SAR.`
    );
  }

  let supplierNameAr = payload.supplierNameAr;
  let supplierNameEn: string | undefined = undefined;
  if (payload.supplierId) {
    const suppliers = store.suppliers.get(context.tenantId) || [];
    const supp = suppliers.find((s) => s.id === payload.supplierId);
    if (supp) {
      supplierNameAr = supp.nameAr;
      supplierNameEn = supp.nameEn;
    }
  }

  // Process Bill Allocations
  let totalAllocatedHalalas = 0;
  const sanitizedBillAllocations: any[] = [];
  if (payload.billAllocations && payload.billAllocations.length > 0) {
    for (const alloc of payload.billAllocations) {
      const allocHalalas = parseAmountToHalalas(alloc.allocatedAmountSar);
      if (allocHalalas <= 0) continue;
      totalAllocatedHalalas += allocHalalas;
      sanitizedBillAllocations.push({
        id: crypto.randomUUID(),
        billId: alloc.billId,
        billNumber: alloc.billNumber,
        allocatedAmountSar: fromHalalasInt(allocHalalas),
        notes: alloc.notes,
      });
    }
  }

  // Process Expense Lines with 15% VAT breakdown
  const sanitizedExpenseLines: any[] = [];
  let totalExpenseTaxableHalalas = 0;
  let totalExpenseVatHalalas = 0;

  if (payload.expenseLines && payload.expenseLines.length > 0) {
    for (const line of payload.expenseLines) {
      const vatCalc = calculateExpenseVat(line.taxableAmountSar, line.taxRatePercent ?? 15);
      totalExpenseTaxableHalalas += vatCalc.taxableHalalas;
      totalExpenseVatHalalas += vatCalc.vatHalalas;

      sanitizedExpenseLines.push({
        id: crypto.randomUUID(),
        expenseAccountId: line.expenseAccountId,
        expenseAccountCode: line.expenseAccountCode || line.expenseAccountId,
        expenseAccountNameAr: line.expenseAccountNameAr || 'مصروفات تشغيلية',
        descriptionAr: line.descriptionAr.trim(),
        taxableAmountSar: vatCalc.taxableSar,
        taxRatePercent: line.taxRatePercent ?? 15,
        taxAmountSar: vatCalc.vatSar,
        totalAmountSar: vatCalc.totalSar,
        supplierVatNumber: line.supplierVatNumber?.trim(),
        supplierInvoiceRef: line.supplierInvoiceRef?.trim(),
      });
    }
  }

  const payments: TreasuryPayment[] = (store as any).treasuryPayments?.get(context.tenantId) || [];
  const paymentNumber = generateVoucherCode('PV', payments.length);

  const payment: TreasuryPayment = {
    id: crypto.randomUUID(),
    tenantId: context.tenantId,
    paymentNumber,
    paymentDate: payload.paymentDate || new Date().toISOString().split('T')[0],
    treasuryAccountId: treasuryAccount.id,
    treasuryAccountNameAr: treasuryAccount.nameAr,
    treasuryAccountType: treasuryAccount.type,
    category: payload.category,
    paymentMethod: payload.paymentMethod,
    amountSar: fromHalalasInt(totalAmountHalalas),
    allocatedAmountSar: fromHalalasInt(totalAllocatedHalalas),
    unallocatedAmountSar: fromHalalasInt(Math.max(0, totalAmountHalalas - totalAllocatedHalalas)),
    supplierId: payload.supplierId,
    supplierNameAr,
    supplierNameEn,
    recipientName: payload.recipientName.trim(),
    custodianId: payload.custodianId,
    referenceNumber: payload.referenceNumber?.trim(),
    chequeNumber: payload.chequeNumber?.trim(),
    chequeBank: payload.chequeBank?.trim(),
    chequeDueDate: payload.chequeDueDate,
    descriptionAr: payload.descriptionAr.trim(),
    descriptionEn: payload.descriptionEn?.trim(),
    billAllocations: sanitizedBillAllocations,
    expenseLines: sanitizedExpenseLines,
    status: 'POSTED',
    branchId: payload.branchId || context.branchId,
    costCenterId: payload.costCenterId,
    createdBy: context.userId,
    postedBy: context.userId,
    postedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  // 1. Post Balanced Double-Entry GL Journal (Rule G1)
  const creditAccountCode = treasuryAccount.glAccountCode || '10201';
  const journalId = crypto.randomUUID();
  const journals = store.journals.get(context.tenantId) || [];
  const journalNumber = `JV-PV-${Date.now().toString().slice(-6)}`;

  const journalLines: any[] = [];

  if (payload.category === 'OPERATING_EXPENSE' && sanitizedExpenseLines.length > 0) {
    // Expense lines debit + Input VAT debit
    for (const exp of sanitizedExpenseLines) {
      journalLines.push({
        id: crypto.randomUUID(),
        journalId,
        accountId: exp.expenseAccountCode,
        accountCode: exp.expenseAccountCode,
        accountNameAr: exp.expenseAccountNameAr,
        accountNameEn: 'Operating Expense',
        debit: exp.taxableAmountSar.toFixed(2),
        credit: '0.00',
        descriptionAr: exp.descriptionAr,
        descriptionEn: 'Expense disbursement',
      });
    }
    if (totalExpenseVatHalalas > 0) {
      journalLines.push({
        id: crypto.randomUUID(),
        journalId,
        accountId: '10301', // ضريبة المدخلات 15%
        accountCode: '10301',
        accountNameAr: 'ضريبة القيمة المضافة المدخلات (15%)',
        accountNameEn: 'Input VAT Recoverable (15%)',
        debit: fromHalalasInt(totalExpenseVatHalalas).toFixed(2),
        credit: '0.00',
        descriptionAr: `ضريبة المدخلات 15% على سند صرف ${payment.paymentNumber}`,
        descriptionEn: `Input VAT 15% on payment ${payment.paymentNumber}`,
      });
    }
  } else {
    // Standard Debit Account
    let debitAccountCode = '20101'; // Default Accounts Payable
    let debitAccountNameAr = 'الموردون والدائنون التجاريون';

    if (payload.category === 'CUSTODY_FUNDING') {
      debitAccountCode = '10102';
      debitAccountNameAr = 'العهد النقدية والمصروفات النثرية';
    } else if (payload.category === 'PARTNER_WITHDRAWAL') {
      debitAccountCode = '30201';
      debitAccountNameAr = 'جاري الشركاء / مسحوبات';
    } else if (payload.category === 'TAX_PAYMENT') {
      debitAccountCode = '20201';
      debitAccountNameAr = 'أمانات ضريبة القيمة المضافة / الزكاة';
    }

    journalLines.push({
      id: crypto.randomUUID(),
      journalId,
      accountId: debitAccountCode,
      accountCode: debitAccountCode,
      accountNameAr: debitAccountNameAr,
      accountNameEn: 'Debit Outflow Target',
      debit: payment.amountSar.toFixed(2),
      credit: '0.00',
      descriptionAr: `صرف إلى ${payment.recipientName} - سند ${payment.paymentNumber}`,
      descriptionEn: `Payment to ${payment.recipientName}`,
    });
  }

  // Credit Treasury Account
  journalLines.push({
    id: crypto.randomUUID(),
    journalId,
    accountId: creditAccountCode,
    accountCode: creditAccountCode,
    accountNameAr: treasuryAccount.nameAr,
    accountNameEn: treasuryAccount.nameEn,
    debit: '0.00',
    credit: payment.amountSar.toFixed(2),
    descriptionAr: `صرف من حساب/خزينة ${treasuryAccount.nameAr} - سند ${payment.paymentNumber}`,
    descriptionEn: `Payment voucher ${payment.paymentNumber}`,
  });

  const journalEntry: any = {
    id: journalId,
    tenantId: context.tenantId,
    branchId: payment.branchId,
    entryNumber: journalNumber,
    entryDate: payment.paymentDate,
    sourceDocumentType: 'PAYMENT',
    sourceDocumentId: payment.id,
    sourceDocumentNumber: payment.paymentNumber,
    descriptionAr: `سند صرف رقم ${payment.paymentNumber} - ${payment.recipientName}`,
    descriptionEn: `Payment voucher ${payment.paymentNumber}`,
    status: 'POSTED',
    totalDebit: payment.amountSar.toFixed(2),
    totalCredit: payment.amountSar.toFixed(2),
    totalDebitCents: BigInt(totalAmountHalalas),
    totalCreditCents: BigInt(totalAmountHalalas),
    lines: journalLines,
    postedBy: context.userId,
    postedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  journals.push(journalEntry);
  store.journals.set(context.tenantId, journals);

  payment.journalId = journalId;
  payment.journalNumber = journalNumber;

  // 2. Decrement Treasury Account Balance
  treasuryAccount.currentBalanceSar = fromHalalasInt(
    toHalalasInt(treasuryAccount.currentBalanceSar) - totalAmountHalalas
  );
  treasuryAccount.updatedAt = new Date().toISOString();

  // 3. If Cheque method, record in Issued Cheques Portfolio
  if (payload.paymentMethod === 'CHEQUE' && payload.chequeNumber) {
    const cheques: ChequeRecord[] = (store as any).cheques?.get(context.tenantId) || [];
    cheques.push({
      id: crypto.randomUUID(),
      tenantId: context.tenantId,
      type: 'ISSUED_PAYMENT',
      chequeNumber: payload.chequeNumber,
      bankName: treasuryAccount.bankName || 'البنك المصرفي',
      drawerOrPayeeName: payload.recipientName,
      amountSar: payment.amountSar,
      issueDate: payment.paymentDate,
      dueDate: payload.chequeDueDate || payment.paymentDate,
      treasuryAccountId: treasuryAccount.id,
      treasuryAccountNameAr: treasuryAccount.nameAr,
      supplierId: payload.supplierId,
      voucherId: payment.id,
      voucherNumber: payment.paymentNumber,
      status: 'UNDER_COLLECTION',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    if (!(store as any).cheques) {
      (store as any).cheques = new Map<string, ChequeRecord[]>();
    }
    (store as any).cheques.set(context.tenantId, cheques);
  }

  // 4. Update Purchase Bills Remaining Balances if allocated
  if (payment.billAllocations.length > 0) {
    const purchaseBills = store.purchaseBills.get(context.tenantId) || [];
    for (const alloc of payment.billAllocations) {
      if (!alloc.billId) continue;
      const bill = purchaseBills.find((b) => b.id === alloc.billId);
      if (bill) {
        const billRemainingHalalas = parseAmountToHalalas(bill.remainingAmountSar ?? bill.totalAmountSar);
        const allocHalalas = parseAmountToHalalas(alloc.allocatedAmountSar);
        const newRemaining = Math.max(0, billRemainingHalalas - allocHalalas);
        bill.remainingAmountSar = fromHalalasInt(newRemaining);
        if (newRemaining === 0) {
          (bill as any).paymentStatus = 'PAID';
        } else {
          (bill as any).paymentStatus = 'PARTIALLY_PAID';
        }
      }
    }
  }

  payments.push(payment);
  if (!(store as any).treasuryPayments) {
    (store as any).treasuryPayments = new Map<string, TreasuryPayment[]>();
  }
  (store as any).treasuryPayments.set(context.tenantId, payments);

  logger.info(`Created and Posted Treasury Payment ${payment.paymentNumber} (${payment.amountSar} SAR)`);
  return payment;
}

// ============================================================================
// 4. INTER-ACCOUNT TREASURY TRANSFERS SERVICE (التحويل بين الخزائن)
// ============================================================================

export function getTreasuryTransfersService(
  store: CentralTenantDataStore,
  tenantId: string
): TreasuryTransfer[] {
  const transfers: TreasuryTransfer[] = (store as any).treasuryTransfers?.get(tenantId) || [];
  return transfers.sort((a, b) => b.transferDate.localeCompare(a.transferDate));
}

export function getTreasuryTransferByIdService(
  store: CentralTenantDataStore,
  tenantId: string,
  id: string
): TreasuryTransfer {
  const transfers: TreasuryTransfer[] = (store as any).treasuryTransfers?.get(tenantId) || [];
  const transfer = transfers.find((t) => t.id === id || t.transferNumber === id);
  if (!transfer) {
    throw new NotFoundError(`Treasury transfer with ID "${id}" not found.`);
  }
  return transfer;
}

export function createTreasuryTransferService(
  store: CentralTenantDataStore,
  context: TenantContext,
  payload: {
    transferDate?: string;
    fromAccountId: string;
    toAccountId: string;
    amountSar: number;
    transferFeeSar?: number;
    feeExpenseAccountId?: string;
    referenceNumber?: string;
    descriptionAr: string;
    descriptionEn?: string;
  }
): TreasuryTransfer {
  if (payload.fromAccountId === payload.toAccountId) {
    throw new ValidationError('Source and destination treasury accounts must be different.');
  }

  const transferHalalas = parseAmountToHalalas(payload.amountSar);
  if (transferHalalas <= 0) {
    throw new ValidationError('Transfer amount must be strictly greater than 0.00 SAR.');
  }

  const feeHalalas = parseAmountToHalalas(payload.transferFeeSar);
  const totalDeductionHalalas = transferHalalas + feeHalalas;

  const fromAccount = getTreasuryAccountByIdService(store, context.tenantId, payload.fromAccountId);
  const toAccount = getTreasuryAccountByIdService(store, context.tenantId, payload.toAccountId);

  if (fromAccount.status === 'FROZEN') {
    throw new ValidationError(`Source treasury account "${fromAccount.nameAr}" is frozen.`);
  }
  if (toAccount.status === 'FROZEN') {
    throw new ValidationError(`Destination treasury account "${toAccount.nameAr}" is frozen.`);
  }

  const fromBalanceHalalas = toHalalasInt(fromAccount.currentBalanceSar);
  if (fromBalanceHalalas < totalDeductionHalalas) {
    throw new ValidationError(
      `Insufficient balance in source account "${fromAccount.nameAr}". Available: ${fromAccount.currentBalanceSar} SAR, Required: ${fromHalalasInt(totalDeductionHalalas)} SAR.`
    );
  }

  const transfers: TreasuryTransfer[] = (store as any).treasuryTransfers?.get(context.tenantId) || [];
  const transferNumber = generateVoucherCode('TRF', transfers.length);

  const transfer: TreasuryTransfer = {
    id: crypto.randomUUID(),
    tenantId: context.tenantId,
    transferNumber,
    transferDate: payload.transferDate || new Date().toISOString().split('T')[0],
    fromAccountId: fromAccount.id,
    fromAccountNameAr: fromAccount.nameAr,
    toAccountId: toAccount.id,
    toAccountNameAr: toAccount.nameAr,
    amountSar: fromHalalasInt(transferHalalas),
    transferFeeSar: fromHalalasInt(feeHalalas),
    feeExpenseAccountId: payload.feeExpenseAccountId || '60401',
    referenceNumber: payload.referenceNumber?.trim(),
    descriptionAr: payload.descriptionAr.trim(),
    descriptionEn: payload.descriptionEn?.trim(),
    status: 'POSTED',
    createdBy: context.userId,
    postedBy: context.userId,
    postedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  // 1. Post Atomic Balanced GL Journal Entry (Rule G1)
  const journalId = crypto.randomUUID();
  const journals = store.journals.get(context.tenantId) || [];
  const journalNumber = `JV-TRF-${Date.now().toString().slice(-6)}`;

  const journalLines: any[] = [
    // Debit Destination Account
    {
      id: crypto.randomUUID(),
      journalId,
      accountId: toAccount.glAccountCode || '10201',
      accountCode: toAccount.glAccountCode || '10201',
      accountNameAr: toAccount.nameAr,
      accountNameEn: toAccount.nameEn,
      debit: transfer.amountSar.toFixed(2),
      credit: '0.00',
      descriptionAr: `تحويل وارد إلى ${toAccount.nameAr} - تحويل ${transfer.transferNumber}`,
      descriptionEn: `Transfer inflow to ${toAccount.nameEn}`,
    },
  ];

  // If Bank Transfer Fee exists, Debit Bank Fees Expense
  if (feeHalalas > 0) {
    journalLines.push({
      id: crypto.randomUUID(),
      journalId,
      accountId: '60401', // مصاريف ورسوم بنكية
      accountCode: '60401',
      accountNameAr: 'مصاريف بنكية ورسوم دفع',
      accountNameEn: 'Bank & Transfer Fees',
      debit: transfer.transferFeeSar.toFixed(2),
      credit: '0.00',
      descriptionAr: `رسوم تحويل بنكي على ${transfer.transferNumber}`,
      descriptionEn: `Bank transfer fee on ${transfer.transferNumber}`,
    });
  }

  // Credit Source Account (Transfer Amount + Fee)
  journalLines.push({
    id: crypto.randomUUID(),
    journalId,
    accountId: fromAccount.glAccountCode || '10101',
    accountCode: fromAccount.glAccountCode || '10101',
    accountNameAr: fromAccount.nameAr,
    accountNameEn: fromAccount.nameEn,
    debit: '0.00',
    credit: fromHalalasInt(totalDeductionHalalas).toFixed(2),
    descriptionAr: `تحويل صادر من ${fromAccount.nameAr} - تحويل ${transfer.transferNumber}`,
    descriptionEn: `Transfer outflow from ${fromAccount.nameEn}`,
  });

  const journalEntry: any = {
    id: journalId,
    tenantId: context.tenantId,
    branchId: fromAccount.branchId,
    entryNumber: journalNumber,
    entryDate: transfer.transferDate,
    sourceDocumentType: 'TRANSFER',
    sourceDocumentId: transfer.id,
    sourceDocumentNumber: transfer.transferNumber,
    descriptionAr: `قيد تحويل خزانة ${transfer.transferNumber} من ${fromAccount.nameAr} إلى ${toAccount.nameAr}`,
    descriptionEn: `Treasury transfer ${transfer.transferNumber}`,
    status: 'POSTED',
    totalDebit: fromHalalasInt(totalDeductionHalalas).toFixed(2),
    totalCredit: fromHalalasInt(totalDeductionHalalas).toFixed(2),
    totalDebitCents: BigInt(totalDeductionHalalas),
    totalCreditCents: BigInt(totalDeductionHalalas),
    lines: journalLines,
    postedBy: context.userId,
    postedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  journals.push(journalEntry);
  store.journals.set(context.tenantId, journals);

  transfer.journalId = journalId;
  transfer.journalNumber = journalNumber;

  // 2. Adjust Account Balances
  fromAccount.currentBalanceSar = fromHalalasInt(fromBalanceHalalas - totalDeductionHalalas);
  fromAccount.updatedAt = new Date().toISOString();

  toAccount.currentBalanceSar = fromHalalasInt(toHalalasInt(toAccount.currentBalanceSar) + transferHalalas);
  toAccount.updatedAt = new Date().toISOString();

  transfers.push(transfer);
  if (!(store as any).treasuryTransfers) {
    (store as any).treasuryTransfers = new Map<string, TreasuryTransfer[]>();
  }
  (store as any).treasuryTransfers.set(context.tenantId, transfers);

  logger.info(`Executed Treasury Transfer ${transfer.transferNumber} from ${fromAccount.code} to ${toAccount.code}`);
  return transfer;
}

// ============================================================================
// 5. CUSTODY & PETTY CASH SETTLEMENTS SERVICE (تسوية العهد النقدية)
// ============================================================================

export function getPettyCashSettlementsService(
  store: CentralTenantDataStore,
  tenantId: string,
  filters?: { custodyAccountId?: string; status?: string }
): PettyCashSettlement[] {
  let settlements: PettyCashSettlement[] = (store as any).pettyCashSettlements?.get(tenantId) || [];

  if (filters?.custodyAccountId) {
    settlements = settlements.filter((s) => s.custodyAccountId === filters.custodyAccountId);
  }
  if (filters?.status) {
    settlements = settlements.filter((s) => s.status === filters.status);
  }

  return settlements.sort((a, b) => b.settlementDate.localeCompare(a.settlementDate));
}

export function getPettyCashSettlementByIdService(
  store: CentralTenantDataStore,
  tenantId: string,
  id: string
): PettyCashSettlement {
  const settlements: PettyCashSettlement[] = (store as any).pettyCashSettlements?.get(tenantId) || [];
  const settlement = settlements.find((s) => s.id === id || s.settlementNumber === id);
  if (!settlement) {
    throw new NotFoundError(`Petty cash settlement with ID "${id}" not found.`);
  }
  return settlement;
}

export function createPettyCashSettlementService(
  store: CentralTenantDataStore,
  context: TenantContext,
  payload: {
    settlementDate?: string;
    custodyAccountId: string;
    custodianName?: string;
    expenseItems: Array<{
      expenseAccountId: string;
      expenseAccountCode?: string;
      expenseAccountNameAr?: string;
      receiptNumber?: string;
      receiptDate?: string;
      vendorName: string;
      vendorVatNumber?: string;
      taxableAmountSar: number;
      vatAmountSar?: number;
      descriptionAr: string;
      costCenterId?: string;
    }>;
    refundedAmountSar?: number;
    refundDestinationAccountId?: string;
    notes?: string;
  }
): PettyCashSettlement {
  const custodyAccount = getTreasuryAccountByIdService(store, context.tenantId, payload.custodyAccountId);
  if (custodyAccount.type !== 'PETTY_CASH') {
    throw new ValidationError(`Selected account "${custodyAccount.nameAr}" is not a Petty Cash / Custody account.`);
  }

  let totalTaxableHalalas = 0;
  let totalVatHalalas = 0;
  const sanitizedItems: any[] = [];

  for (const item of payload.expenseItems) {
    const taxableHalalas = parseAmountToHalalas(item.taxableAmountSar);
    if (taxableHalalas <= 0) continue;

    // Line VAT calculation
    let vatHalalas = 0;
    if (item.vatAmountSar !== undefined) {
      vatHalalas = parseAmountToHalalas(item.vatAmountSar);
    } else {
      vatHalalas = roundHalalas((taxableHalalas * 15) / 100);
    }

    const totalItemHalalas = taxableHalalas + vatHalalas;
    totalTaxableHalalas += taxableHalalas;
    totalVatHalalas += vatHalalas;

    sanitizedItems.push({
      id: crypto.randomUUID(),
      expenseAccountId: item.expenseAccountId,
      expenseAccountCode: item.expenseAccountCode || item.expenseAccountId,
      expenseAccountNameAr: item.expenseAccountNameAr || 'مصروفات نثرية',
      receiptNumber: item.receiptNumber?.trim(),
      receiptDate: item.receiptDate || payload.settlementDate || new Date().toISOString().split('T')[0],
      vendorName: item.vendorName.trim(),
      vendorVatNumber: item.vendorVatNumber?.trim(),
      taxableAmountSar: fromHalalasInt(taxableHalalas),
      vatAmountSar: fromHalalasInt(vatHalalas),
      totalAmountSar: fromHalalasInt(totalItemHalalas),
      descriptionAr: item.descriptionAr.trim(),
      costCenterId: item.costCenterId,
    });
  }

  const grossExpensesHalalas = totalTaxableHalalas + totalVatHalalas;
  const refundHalalas = parseAmountToHalalas(payload.refundedAmountSar);
  const totalOutlayHalalas = grossExpensesHalalas + refundHalalas;

  const startingBalanceHalalas = toHalalasInt(custodyAccount.currentBalanceSar);
  if (totalOutlayHalalas > startingBalanceHalalas) {
    throw new ValidationError(
      `Total settlement outlay (${fromHalalasInt(totalOutlayHalalas)} SAR) exceeds current custody balance (${fromHalalasInt(startingBalanceHalalas)} SAR).`
    );
  }

  const closingBalanceHalalas = startingBalanceHalalas - totalOutlayHalalas;

  const settlements: PettyCashSettlement[] = (store as any).pettyCashSettlements?.get(context.tenantId) || [];
  const settlementNumber = generateVoucherCode('STL', settlements.length);

  const settlement: PettyCashSettlement = {
    id: crypto.randomUUID(),
    tenantId: context.tenantId,
    settlementNumber,
    settlementDate: payload.settlementDate || new Date().toISOString().split('T')[0],
    custodyAccountId: custodyAccount.id,
    custodyAccountNameAr: custodyAccount.nameAr,
    custodianName: payload.custodianName || custodyAccount.custodianName || 'أمين العهدة',
    custodianEmployeeId: custodyAccount.custodianEmployeeId,
    custodyStartingBalanceSar: fromHalalasInt(startingBalanceHalalas),
    totalExpensesSar: fromHalalasInt(totalTaxableHalalas),
    totalVatSar: fromHalalasInt(totalVatHalalas),
    grossExpensesSar: fromHalalasInt(grossExpensesHalalas),
    refundedAmountSar: fromHalalasInt(refundHalalas),
    refundDestinationAccountId: payload.refundDestinationAccountId,
    closingBalanceSar: fromHalalasInt(closingBalanceHalalas),
    expenseItems: sanitizedItems,
    status: 'POSTED',
    notes: payload.notes?.trim(),
    submittedBy: context.userId,
    approvedBy: context.userId,
    approvedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  // Post Balanced GL Settlement Journal Entry (Rule G1)
  const journalId = crypto.randomUUID();
  const journals = store.journals.get(context.tenantId) || [];
  const journalNumber = `JV-STL-${Date.now().toString().slice(-6)}`;

  const journalLines: any[] = [];

  // Debit each expense item
  for (const item of settlement.expenseItems) {
    journalLines.push({
      id: crypto.randomUUID(),
      journalId,
      accountId: item.expenseAccountCode,
      accountCode: item.expenseAccountCode,
      accountNameAr: item.expenseAccountNameAr,
      accountNameEn: 'Petty Cash Expense',
      debit: item.taxableAmountSar.toFixed(2),
      credit: '0.00',
      descriptionAr: `${item.descriptionAr} - مورد: ${item.vendorName}`,
      descriptionEn: `Expense: ${item.descriptionAr}`,
    });
  }

  // Debit Input VAT 15%
  if (totalVatHalalas > 0) {
    journalLines.push({
      id: crypto.randomUUID(),
      journalId,
      accountId: '10301',
      accountCode: '10301',
      accountNameAr: 'ضريبة القيمة المضافة المدخلات (15%)',
      accountNameEn: 'Input VAT Recoverable (15%)',
      debit: fromHalalasInt(totalVatHalalas).toFixed(2),
      credit: '0.00',
      descriptionAr: `ضريبة المدخلات على تسوية العهدة ${settlement.settlementNumber}`,
      descriptionEn: `Input VAT on custody settlement ${settlement.settlementNumber}`,
    });
  }

  // If cash refund returned to vault, Debit the Vault Account
  if (refundHalalas > 0 && payload.refundDestinationAccountId) {
    const refundVault = getTreasuryAccountByIdService(store, context.tenantId, payload.refundDestinationAccountId);
    journalLines.push({
      id: crypto.randomUUID(),
      journalId,
      accountId: refundVault.glAccountCode || '10101',
      accountCode: refundVault.glAccountCode || '10101',
      accountNameAr: refundVault.nameAr,
      accountNameEn: refundVault.nameEn,
      debit: settlement.refundedAmountSar.toFixed(2),
      credit: '0.00',
      descriptionAr: `استرداد متبقي عهدة إلى ${refundVault.nameAr}`,
      descriptionEn: `Custody balance refund`,
    });

    // Increment Refund Vault Balance
    refundVault.currentBalanceSar = fromHalalasInt(toHalalasInt(refundVault.currentBalanceSar) + refundHalalas);
    refundVault.updatedAt = new Date().toISOString();
  }

  // Credit the Custody Account for full outlay
  journalLines.push({
    id: crypto.randomUUID(),
    journalId,
    accountId: custodyAccount.glAccountCode || '10102',
    accountCode: custodyAccount.glAccountCode || '10102',
    accountNameAr: custodyAccount.nameAr,
    accountNameEn: custodyAccount.nameEn,
    debit: '0.00',
    credit: fromHalalasInt(totalOutlayHalalas).toFixed(2),
    descriptionAr: `تسوية عهدة رقم ${settlement.settlementNumber} - ${settlement.custodianName}`,
    descriptionEn: `Custody settlement ${settlement.settlementNumber}`,
  });

  const journalEntry: any = {
    id: journalId,
    tenantId: context.tenantId,
    branchId: custodyAccount.branchId,
    entryNumber: journalNumber,
    entryDate: settlement.settlementDate,
    sourceDocumentType: 'PETTY_CASH_SETTLEMENT',
    sourceDocumentId: settlement.id,
    sourceDocumentNumber: settlement.settlementNumber,
    descriptionAr: `قيد تسوية عهدة ${settlement.settlementNumber} - ${settlement.custodianName}`,
    descriptionEn: `Custody settlement ${settlement.settlementNumber}`,
    status: 'POSTED',
    totalDebit: fromHalalasInt(totalOutlayHalalas).toFixed(2),
    totalCredit: fromHalalasInt(totalOutlayHalalas).toFixed(2),
    totalDebitCents: BigInt(totalOutlayHalalas),
    totalCreditCents: BigInt(totalOutlayHalalas),
    lines: journalLines,
    postedBy: context.userId,
    postedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  journals.push(journalEntry);
  store.journals.set(context.tenantId, journals);

  settlement.journalId = journalId;
  settlement.journalNumber = journalNumber;

  // Deduct from Custody Account Balance
  custodyAccount.currentBalanceSar = fromHalalasInt(closingBalanceHalalas);
  custodyAccount.updatedAt = new Date().toISOString();

  settlements.push(settlement);
  if (!(store as any).pettyCashSettlements) {
    (store as any).pettyCashSettlements = new Map<string, PettyCashSettlement[]>();
  }
  (store as any).pettyCashSettlements.set(context.tenantId, settlements);

  logger.info(`Settled Petty Cash Custody ${settlement.settlementNumber} (${settlement.grossExpensesSar} SAR)`);
  return settlement;
}

// ============================================================================
// 6. BANK RECONCILIATION ENGINE (مطابقة كشوف الحسابات البنكية)
// ============================================================================

export function getBankStatementsService(
  store: CentralTenantDataStore,
  tenantId: string,
  treasuryAccountId?: string
): BankStatement[] {
  let statements: BankStatement[] = (store as any).bankStatements?.get(tenantId) || [];
  if (treasuryAccountId) {
    statements = statements.filter((s) => s.treasuryAccountId === treasuryAccountId);
  }
  return statements;
}

export function uploadBankStatementService(
  store: CentralTenantDataStore,
  context: TenantContext,
  payload: {
    treasuryAccountId: string;
    statementNumber: string;
    startDate: string;
    endDate: string;
    openingBalanceSar: number;
    closingBalanceSar: number;
    lines: Array<{
      transactionDate: string;
      referenceNumber: string;
      description: string;
      depositAmountSar?: number;
      withdrawalAmountSar?: number;
      runningBalanceSar?: number;
    }>;
  }
): BankStatement {
  const bankAccount = getTreasuryAccountByIdService(store, context.tenantId, payload.treasuryAccountId);
  if (bankAccount.type !== 'BANK_ACCOUNT') {
    throw new ValidationError(`Selected account "${bankAccount.nameAr}" is not a Bank Account.`);
  }

  let totalDepositsHalalas = 0;
  let totalWithdrawalsHalalas = 0;
  const sanitizedLines: any[] = [];

  for (const line of payload.lines) {
    const depositHalalas = parseAmountToHalalas(line.depositAmountSar);
    const withdrawalHalalas = parseAmountToHalalas(line.withdrawalAmountSar);
    totalDepositsHalalas += depositHalalas;
    totalWithdrawalsHalalas += withdrawalHalalas;

    sanitizedLines.push({
      id: crypto.randomUUID(),
      statementId: '', // set below
      transactionDate: line.transactionDate,
      referenceNumber: line.referenceNumber.trim(),
      description: line.description.trim(),
      depositAmountSar: fromHalalasInt(depositHalalas),
      withdrawalAmountSar: fromHalalasInt(withdrawalHalalas),
      runningBalanceSar: line.runningBalanceSar ?? 0,
      matchStatus: 'UNMATCHED',
    });
  }

  const statementId = crypto.randomUUID();
  sanitizedLines.forEach((l) => (l.statementId = statementId));

  const statement: BankStatement = {
    id: statementId,
    tenantId: context.tenantId,
    treasuryAccountId: bankAccount.id,
    statementNumber: payload.statementNumber.trim(),
    startDate: payload.startDate,
    endDate: payload.endDate,
    openingBalanceSar: Number(payload.openingBalanceSar),
    closingBalanceSar: Number(payload.closingBalanceSar),
    totalDepositsSar: fromHalalasInt(totalDepositsHalalas),
    totalWithdrawalsSar: fromHalalasInt(totalWithdrawalsHalalas),
    lines: sanitizedLines,
    uploadedAt: new Date().toISOString(),
    uploadedBy: context.userId,
  };

  const statements: BankStatement[] = (store as any).bankStatements?.get(context.tenantId) || [];
  statements.push(statement);
  if (!(store as any).bankStatements) {
    (store as any).bankStatements = new Map<string, BankStatement[]>();
  }
  (store as any).bankStatements.set(context.tenantId, statements);

  logger.info(`Uploaded Bank Statement ${statement.statementNumber} with ${statement.lines.length} lines`);
  return statement;
}

export function getBankReconciliationsService(
  store: CentralTenantDataStore,
  tenantId: string,
  treasuryAccountId?: string
): BankReconciliation[] {
  let reconciliations: BankReconciliation[] = (store as any).bankReconciliations?.get(tenantId) || [];
  if (treasuryAccountId) {
    reconciliations = reconciliations.filter((r) => r.treasuryAccountId === treasuryAccountId);
  }
  return reconciliations;
}

export function createBankReconciliationService(
  store: CentralTenantDataStore,
  context: TenantContext,
  payload: {
    treasuryAccountId: string;
    statementId: string;
    asOfDate?: string;
    unpresentedChequesTotalSar?: number;
    depositsInTransitTotalSar?: number;
    bankChargesAdjustmentsSar?: number;
    notes?: string;
  }
): BankReconciliation {
  const bankAccount = getTreasuryAccountByIdService(store, context.tenantId, payload.treasuryAccountId);
  const statements = getBankStatementsService(store, context.tenantId, bankAccount.id);
  const statement = statements.find((s) => s.id === payload.statementId);
  if (!statement) {
    throw new NotFoundError(`Bank statement with ID "${payload.statementId}" not found.`);
  }

  const unpresentedSar = payload.unpresentedChequesTotalSar || 0;
  const depositsInTransitSar = payload.depositsInTransitTotalSar || 0;
  const bankChargesSar = payload.bankChargesAdjustmentsSar || 0;

  const summary = computeBankReconciliationSummary({
    bankStatementEndingBalanceSar: statement.closingBalanceSar,
    glBookBalanceSar: bankAccount.currentBalanceSar,
    unpresentedChequesSar: unpresentedSar,
    depositsInTransitSar: depositsInTransitSar,
    bankChargesSar: bankChargesSar,
  });

  const reconciliations: BankReconciliation[] = (store as any).bankReconciliations?.get(context.tenantId) || [];
  const reconciliationNumber = generateVoucherCode('REC', reconciliations.length);

  const matchedCount = statement.lines.filter((l) => l.matchStatus !== 'UNMATCHED').length;
  const unmatchedCount = statement.lines.length - matchedCount;

  const reconciliation: BankReconciliation = {
    id: crypto.randomUUID(),
    tenantId: context.tenantId,
    reconciliationNumber,
    treasuryAccountId: bankAccount.id,
    treasuryAccountNameAr: bankAccount.nameAr,
    statementId: statement.id,
    asOfDate: payload.asOfDate || statement.endDate,
    bankStatementEndingBalanceSar: statement.closingBalanceSar,
    glBookBalanceSar: bankAccount.currentBalanceSar,
    unpresentedChequesTotalSar: unpresentedSar,
    depositsInTransitTotalSar: depositsInTransitSar,
    bankChargesAdjustmentsSar: bankChargesSar,
    adjustedBankBalanceSar: summary.adjustedBankBalanceSar,
    adjustedBookBalanceSar: summary.adjustedBookBalanceSar,
    discrepancySar: summary.discrepancySar,
    matchedCount,
    unmatchedCount,
    status: summary.isBalanced ? 'COMPLETED' : 'IN_PROGRESS',
    completedAt: summary.isBalanced ? new Date().toISOString() : undefined,
    completedBy: summary.isBalanced ? context.userId : undefined,
    notes: payload.notes?.trim(),
    createdAt: new Date().toISOString(),
  };

  reconciliations.push(reconciliation);
  if (!(store as any).bankReconciliations) {
    (store as any).bankReconciliations = new Map<string, BankReconciliation[]>();
  }
  (store as any).bankReconciliations.set(context.tenantId, reconciliations);

  logger.info(`Created Bank Reconciliation ${reconciliation.reconciliationNumber} (Discrepancy: ${reconciliation.discrepancySar} SAR)`);
  return reconciliation;
}

// ============================================================================
// 7. CHEQUES PORTFOLIO SERVICE (حافظة الشيكات)
// ============================================================================

export function getChequesService(
  store: CentralTenantDataStore,
  tenantId: string,
  filters?: { type?: string; status?: string; search?: string }
): ChequeRecord[] {
  let cheques: ChequeRecord[] = (store as any).cheques?.get(tenantId) || [];

  if (filters?.type) {
    cheques = cheques.filter((c) => c.type === filters.type);
  }
  if (filters?.status) {
    cheques = cheques.filter((c) => c.status === filters.status);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    cheques = cheques.filter(
      (c) =>
        c.chequeNumber.toLowerCase().includes(q) ||
        c.bankName.toLowerCase().includes(q) ||
        c.drawerOrPayeeName.toLowerCase().includes(q)
    );
  }

  return cheques.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function clearChequeService(
  store: CentralTenantDataStore,
  context: TenantContext,
  chequeId: string,
  depositBankAccountId: string
): ChequeRecord {
  const cheques: ChequeRecord[] = (store as any).cheques?.get(context.tenantId) || [];
  const cheque = cheques.find((c) => c.id === chequeId);
  if (!cheque) {
    throw new NotFoundError(`Cheque with ID "${chequeId}" not found.`);
  }

  if (cheque.status === 'CLEARED') {
    throw new ValidationError(`Cheque ${cheque.chequeNumber} has already been cleared.`);
  }

  const depositBank = getTreasuryAccountByIdService(store, context.tenantId, depositBankAccountId);

  cheque.status = 'CLEARED';
  cheque.depositBankAccountId = depositBank.id;
  cheque.collectionDate = new Date().toISOString().split('T')[0];
  cheque.updatedAt = new Date().toISOString();

  // If received cheque cleared into bank, credit Cheques in Hand (10103) & debit Bank (10201)
  if (cheque.type === 'RECEIVED_IN_HAND') {
    const journalId = crypto.randomUUID();
    const journals = store.journals.get(context.tenantId) || [];
    const journalNumber = `JV-CHQ-${Date.now().toString().slice(-6)}`;

    const journalLines: any[] = [
      {
        id: crypto.randomUUID(),
        journalId,
        accountId: depositBank.glAccountCode || '10201',
        accountCode: depositBank.glAccountCode || '10201',
        accountNameAr: depositBank.nameAr,
        accountNameEn: depositBank.nameEn,
        debit: cheque.amountSar.toFixed(2),
        credit: '0.00',
        descriptionAr: `تحصيل شيك رقم ${cheque.chequeNumber} في حساب ${depositBank.nameAr}`,
        descriptionEn: `Cleared cheque ${cheque.chequeNumber}`,
      },
      {
        id: crypto.randomUUID(),
        journalId,
        accountId: '10101', // صندوق الخزينة / أوراق قبض
        accountCode: '10101',
        accountNameAr: 'أوراق قبض وشيكات برسم التحصيل',
        accountNameEn: 'Cheques in Hand',
        debit: '0.00',
        credit: cheque.amountSar.toFixed(2),
        descriptionAr: `تسوية حافظة الشيكات - شيك رقم ${cheque.chequeNumber}`,
        descriptionEn: `Settled cheque portfolio`,
      },
    ];

    const amountHalalas = toHalalasInt(cheque.amountSar);
    const journalEntry: any = {
      id: journalId,
      tenantId: context.tenantId,
      branchId: depositBank.branchId,
      entryNumber: journalNumber,
      entryDate: cheque.collectionDate,
      sourceDocumentType: 'CHEQUE_CLEARANCE',
      sourceDocumentId: cheque.id,
      sourceDocumentNumber: cheque.chequeNumber,
      descriptionAr: `قيد تحصيل شيك ${cheque.chequeNumber} - ${cheque.drawerOrPayeeName}`,
      descriptionEn: `Cheque clearance ${cheque.chequeNumber}`,
      status: 'POSTED',
      totalDebit: cheque.amountSar.toFixed(2),
      totalCredit: cheque.amountSar.toFixed(2),
      totalDebitCents: BigInt(amountHalalas),
      totalCreditCents: BigInt(amountHalalas),
      lines: journalLines,
      postedBy: context.userId,
      postedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    journals.push(journalEntry);
    store.journals.set(context.tenantId, journals);

    cheque.clearanceJournalId = journalId;
    depositBank.currentBalanceSar = fromHalalasInt(toHalalasInt(depositBank.currentBalanceSar) + amountHalalas);
    depositBank.updatedAt = new Date().toISOString();
  }

  (store as any).cheques.set(context.tenantId, cheques);
  logger.info(`Cleared Cheque ${cheque.chequeNumber} into Bank ${depositBank.code}`);
  return cheque;
}

export function bounceChequeService(
  store: CentralTenantDataStore,
  context: TenantContext,
  chequeId: string,
  reason: string
): ChequeRecord {
  const cheques: ChequeRecord[] = (store as any).cheques?.get(context.tenantId) || [];
  const cheque = cheques.find((c) => c.id === chequeId);
  if (!cheque) {
    throw new NotFoundError(`Cheque with ID "${chequeId}" not found.`);
  }

  cheque.status = 'BOUNCED';
  cheque.bounceReason = reason.trim();
  cheque.updatedAt = new Date().toISOString();

  (store as any).cheques.set(context.tenantId, cheques);
  logger.warn(`Cheque ${cheque.chequeNumber} marked as BOUNCED. Reason: ${reason}`);
  return cheque;
}

// ============================================================================
// 8. TREASURY OVERVIEW KPI METRICS
// ============================================================================

export function getTreasuryOverviewMetricsService(
  store: CentralTenantDataStore,
  tenantId: string
) {
  const accounts: TreasuryAccount[] = (store as any).treasuryAccounts?.get(tenantId) || [];
  const receipts: TreasuryReceipt[] = (store as any).treasuryReceipts?.get(tenantId) || [];
  const payments: TreasuryPayment[] = (store as any).treasuryPayments?.get(tenantId) || [];
  const cheques: ChequeRecord[] = (store as any).cheques?.get(tenantId) || [];
  const settlements: PettyCashSettlement[] = (store as any).pettyCashSettlements?.get(tenantId) || [];

  let totalLiquidFundsHalalas = 0;
  let bankBalancesHalalas = 0;
  let vaultBalancesHalalas = 0;
  let custodyBalancesHalalas = 0;

  for (const acc of accounts) {
    const balHalalas = toHalalasInt(acc.currentBalanceSar);
    totalLiquidFundsHalalas += balHalalas;
    if (acc.type === 'BANK_ACCOUNT' || acc.type === 'POS_TERMINAL') {
      bankBalancesHalalas += balHalalas;
    } else if (acc.type === 'CASH_DRAWER') {
      vaultBalancesHalalas += balHalalas;
    } else if (acc.type === 'PETTY_CASH') {
      custodyBalancesHalalas += balHalalas;
    }
  }

  const chequesUnderCollectionCount = cheques.filter((c) => c.status === 'UNDER_COLLECTION').length;
  const chequesUnderCollectionTotal = cheques
    .filter((c) => c.status === 'UNDER_COLLECTION')
    .reduce((sum, c) => sum + c.amountSar, 0);

  return {
    totalLiquidFundsSar: fromHalalasInt(totalLiquidFundsHalalas),
    bankBalancesSar: fromHalalasInt(bankBalancesHalalas),
    vaultBalancesSar: fromHalalasInt(vaultBalancesHalalas),
    custodyBalancesSar: fromHalalasInt(custodyBalancesHalalas),
    accountsCount: accounts.length,
    receiptsCount: receipts.length,
    paymentsCount: payments.length,
    chequesUnderCollectionCount,
    chequesUnderCollectionTotalSar: Number(chequesUnderCollectionTotal.toFixed(2)),
    settlementsCount: settlements.length,
  };
}

// ============================================================================
// 9. DEFAULT SEEDING FOR TENANT TREASURY ACCOUNTS
// ============================================================================

export function seedDefaultTreasury(store: CentralTenantDataStore, tenantId: string, userId: string) {
  const context: TenantContext = {
    tenantId,
    userId,
    userEmail: 'admin@al-inma.sa',
    role: 'OWNER',
    permissions: ['*'],
  };

  const existing = (store as any).treasuryAccounts?.get(tenantId) || [];
  if (existing.length > 0) return;

  // 1. Seed Main Cash Drawer (الصندوق الرئيسي)
  createTreasuryAccountService(store, context, {
    code: 'CSH-MAIN-01',
    nameAr: 'الصندوق الرئيسي - الإدارة العامة',
    nameEn: 'Main Cash Vault - HQ',
    type: 'CASH_DRAWER',
    glAccountCode: '10101',
    openingBalanceSar: 50000.0,
    isDefault: true,
    notes: 'الخزينة النقدية الرئيسية للمنشأة',
  });

  // 2. Seed Al Rajhi Corporate Bank Account (حساب مصرف الراجحي)
  createTreasuryAccountService(store, context, {
    code: 'BNK-RAJHI-01',
    nameAr: 'حساب مصرف الراجحي - جاري شركات',
    nameEn: 'Al Rajhi Bank - Corporate Current',
    type: 'BANK_ACCOUNT',
    glAccountCode: '10201',
    bankName: 'مصرف الراجحي',
    accountNumber: '88200192837465',
    iban: generateValidSaudiIban('80', '88200192837465'),
    swiftBic: 'RJHISARI',
    openingBalanceSar: 250000.0,
    isDefault: true,
    notes: 'الحساب البنكي الرئيسي للعمليات والحوالات',
  });

  // 3. Seed SNB Operational Bank Account (البنك الأهلي السعودي)
  createTreasuryAccountService(store, context, {
    code: 'BNK-SNB-01',
    nameAr: 'حساب البنك الأهلي السعودي (SNB)',
    nameEn: 'Saudi National Bank (SNB)',
    type: 'BANK_ACCOUNT',
    glAccountCode: '10201',
    bankName: 'البنك الأهلي السعودي',
    accountNumber: '10029384756',
    iban: generateValidSaudiIban('10', '10029384756'),
    swiftBic: 'NCBKSARI',
    openingBalanceSar: 120000.0,
    isDefault: false,
  });

  // 4. Seed Petty Cash Custody (عهدة المشتريات والمصروفات النثرية)
  createTreasuryAccountService(store, context, {
    code: 'CUST-PETTY-01',
    nameAr: 'عهدة المصروفات النثرية - الإدارة',
    nameEn: 'Administration Petty Cash Custody',
    type: 'PETTY_CASH',
    glAccountCode: '10102',
    custodianName: 'فهد السبيعي',
    custodianEmployeeId: 'EMP-014',
    openingBalanceSar: 5000.0,
    isDefault: false,
    notes: 'عهدة نقدية للمصروفات التشغيلية والمشتريات العاجلة',
  });

  // 5. Seed POS Terminal Account (جهاز نقاط بيع مدى)
  createTreasuryAccountService(store, context, {
    code: 'POS-TERM-01',
    nameAr: 'جهاز نقاط بيع مدى - المعرض الرئيسي',
    nameEn: 'MADA POS Terminal - Showroom 1',
    type: 'POS_TERMINAL',
    glAccountCode: '10202',
    posTerminalId: 'POS-SNB-883921',
    posBankPartner: 'البنك الأهلي السعودي',
    openingBalanceSar: 0.0,
    isDefault: false,
  });

  logger.info(`[Treasury] Successfully seeded default treasury accounts for tenant ${tenantId}`);
}

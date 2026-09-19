import { describe, it, expect, beforeEach } from 'vitest';
import { centralStore, TenantScopedRepository, TenantContext } from '../../server/core/tenantGuard';
import {
  validateSaudiIban,
  generateValidSaudiIban,
  calculateExpenseVat,
  computeBankReconciliationSummary,
} from '../lib/treasury';
import { toHalalasInt, fromHalalasInt } from '../lib/accounting';

describe('Phase 08: Treasury & Cash Management System', () => {
  let tenantId: string;
  let userId: string;
  let context: TenantContext;
  let repo: TenantScopedRepository;

  beforeEach(() => {
    centralStore.initDefaultSeed();
    const demoTenant = Array.from(centralStore.tenants.values())[0];
    tenantId = demoTenant.id;
    userId = 'usr-demo-admin';

    context = {
      tenantId,
      userId,
      userEmail: 'admin@al-inma.sa',
      role: 'OWNER',
      permissions: ['*'],
    };

    repo = new TenantScopedRepository(context);
  });

  describe('1. Saudi IBAN & VAT Calculations (Rules G7/G8)', () => {
    it('validates authentic Saudi IBANs correctly', () => {
      // Valid Saudi IBANs (24 chars, starts with SA, correct MOD-97)
      const validIban = generateValidSaudiIban('80', '608010167519');
      const result = validateSaudiIban(validIban);
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe(validIban);
    });

    it('rejects invalid IBANs', () => {
      const shortIban = 'SA038000000060801';
      expect(validateSaudiIban(shortIban).isValid).toBe(false);

      const foreignIban = 'AE070331234567890123456';
      expect(validateSaudiIban(foreignIban).isValid).toBe(false);

      const badChecksum = 'SA9980000000608010167519';
      expect(validateSaudiIban(badChecksum).isValid).toBe(false);
    });

    it('calculates expense 15% VAT exact in Halalas integer arithmetic', () => {
      // 100.00 SAR -> Taxable 10000 halalas, VAT 1500 halalas (15.00 SAR), Total 115.00 SAR
      const res1 = calculateExpenseVat(100.0, 15);
      expect(res1.taxableSar).toBe(100);
      expect(res1.vatSar).toBe(15);
      expect(res1.totalSar).toBe(115);

      // Fractional case: 33.33 SAR -> 3333 halalas -> VAT = round(3333 * 0.15) = 500 halalas (5.00 SAR)
      const res2 = calculateExpenseVat(33.33, 15);
      expect(res2.taxableSar).toBe(33.33);
      expect(res2.vatSar).toBe(5.0);
      expect(res2.totalSar).toBe(38.33);
    });
  });

  describe('2. Treasury Accounts & Vaults Management', () => {
    it('fetches pre-seeded default treasury accounts', () => {
      const accounts = repo.getTreasuryAccounts();
      expect(accounts.length).toBeGreaterThanOrEqual(4);

      const mainVault = accounts.find((a) => a.code === 'CSH-MAIN-01');
      expect(mainVault).toBeDefined();
      expect(mainVault?.type).toBe('CASH_DRAWER');
      expect(mainVault?.currentBalanceSar).toBeGreaterThan(0);

      const rajhiBank = accounts.find((a) => a.code === 'BNK-RAJHI-01');
      expect(rajhiBank).toBeDefined();
      expect(rajhiBank?.type).toBe('BANK_ACCOUNT');
      expect(rajhiBank?.iban).toBeDefined();
      expect(validateSaudiIban(rajhiBank?.iban!).isValid).toBe(true);
    });

    it('creates a new Bank Account and validates unique IBAN', () => {
      const generatedIban = generateValidSaudiIban('20', '445566778899');
      const newBank = repo.createTreasuryAccount({
        code: 'BNK-RIBL-01',
        nameAr: 'بنك الرياض - حساب الرواتب',
        nameEn: 'Riyad Bank - Payroll Account',
        type: 'BANK_ACCOUNT',
        bankName: 'بنك الرياض',
        accountNumber: '445566778899',
        iban: generatedIban,
        openingBalanceSar: 80000.0,
      });

      expect(newBank.id).toBeDefined();
      expect(newBank.code).toBe('BNK-RIBL-01');
      expect(newBank.currentBalanceSar).toBe(80000.0);
      expect(newBank.status).toBe('ACTIVE');
    });

    it('freezes and updates treasury account status', () => {
      const accounts = repo.getTreasuryAccounts();
      const firstAcc = accounts[0];

      const frozen = repo.setTreasuryAccountStatus(firstAcc.id, 'FROZEN');
      expect(frozen.status).toBe('FROZEN');

      // Reactivate
      const reactivated = repo.setTreasuryAccountStatus(firstAcc.id, 'ACTIVE');
      expect(reactivated.status).toBe('ACTIVE');
    });
  });

  describe('3. Receipt Vouchers (سندات القبض) & Double-Entry GL', () => {
    it('creates a posted receipt voucher and generates balanced double-entry GL journal', () => {
      const accounts = repo.getTreasuryAccounts({ type: 'BANK_ACCOUNT' });
      const bank = accounts[0];
      const initialBankBalance = bank.currentBalanceSar;

      const receipt = repo.createTreasuryReceipt({
        receiptDate: '2026-03-01',
        treasuryAccountId: bank.id,
        category: 'CUSTOMER_PAYMENT',
        paymentMethod: 'BANK_TRANSFER',
        amountSar: 15000.0,
        payerName: 'شركة الفنار للمقاولات العامة',
        referenceNumber: 'TRF-FN-88991',
        descriptionAr: 'تحصيل دفعة من العميل شركة الفنار',
      });

      expect(receipt.id).toBeDefined();
      expect(receipt.receiptNumber).toMatch(/^RC-/);
      expect(receipt.status).toBe('POSTED');
      expect(receipt.amountSar).toBe(15000.0);
      expect(receipt.journalId).toBeDefined();

      // Bank account balance increased
      const updatedBank = repo.getTreasuryAccountById(bank.id);
      expect(updatedBank.currentBalanceSar).toBe(initialBankBalance + 15000.0);

      // Verify General Ledger Journal Entry (Rule G1: Debits == Credits)
      const journal = (centralStore.journals.get(tenantId) || []).find((j) => j.id === receipt.journalId);
      expect(journal).toBeDefined();
      expect(Number(journal?.totalDebitCents) / 100).toBe(15000.0);
      expect(Number(journal?.totalCreditCents) / 100).toBe(15000.0);
      expect(journal?.lines.length).toBe(2);
    });

    it('handles Cheque receipt and adds to Cheques Portfolio', () => {
      const accounts = repo.getTreasuryAccounts({ type: 'CASH_DRAWER' });
      const vault = accounts[0];

      const receipt = repo.createTreasuryReceipt({
        receiptDate: '2026-03-05',
        treasuryAccountId: vault.id,
        category: 'CUSTOMER_PAYMENT',
        paymentMethod: 'CHEQUE',
        amountSar: 25000.0,
        payerName: 'مؤسسة البناء الحديث',
        chequeNumber: 'CHQ-883921',
        chequeBank: 'مصرف الإنماء',
        chequeDueDate: '2026-04-01',
        descriptionAr: 'استلام شيك مؤجل لأمر المؤسسة',
      });

      expect(receipt.paymentMethod).toBe('CHEQUE');

      // Verify added to Cheques Portfolio
      const cheques = repo.getCheques({ search: 'CHQ-883921' });
      expect(cheques.length).toBe(1);
      expect(cheques[0].amountSar).toBe(25000.0);
      expect(cheques[0].status).toBe('UNDER_COLLECTION');
    });
  });

  describe('4. Payment Vouchers (سندات الصرف) & Expense 15% VAT', () => {
    it('creates an operating expense payment with 15% VAT breakdown and posts GL', () => {
      const accounts = repo.getTreasuryAccounts({ type: 'BANK_ACCOUNT' });
      const bank = accounts[0];
      const initialBankBalance = bank.currentBalanceSar;

      // 1000 SAR taxable + 150 SAR (15% VAT) = 1150 SAR total
      const payment = repo.createTreasuryPayment({
        paymentDate: '2026-03-02',
        treasuryAccountId: bank.id,
        category: 'OPERATING_EXPENSE',
        paymentMethod: 'BANK_TRANSFER',
        amountSar: 1150.0,
        recipientName: 'شركة الاتصالات السعودية (STC)',
        referenceNumber: 'STC-INV-99281',
        descriptionAr: 'سداد فواتير الاتصالات والإنترنت لشهر فبراير',
        expenseLines: [
          {
            expenseAccountId: '60101',
            expenseAccountCode: '60101',
            expenseAccountNameAr: 'مصاريف الاتصالات والإنترنت',
            descriptionAr: 'اشتراك الألياف البصرية وشبكة الفروع',
            taxableAmountSar: 1000.0,
            taxRatePercent: 15,
            supplierVatNumber: '300012345600003',
            supplierInvoiceRef: 'INV-STC-99281',
          },
        ],
      });

      expect(payment.id).toBeDefined();
      expect(payment.paymentNumber).toMatch(/^PV-/);
      expect(payment.amountSar).toBe(1150.0);
      expect(payment.expenseLines.length).toBe(1);
      expect(payment.expenseLines[0].taxAmountSar).toBe(150.0);

      // Verify Bank Balance Deducted
      const updatedBank = repo.getTreasuryAccountById(bank.id);
      expect(updatedBank.currentBalanceSar).toBe(initialBankBalance - 1150.0);

      // Verify GL Journal has Expense Debit (1000), Input VAT Debit (150), and Bank Credit (1150)
      const journal = (centralStore.journals.get(tenantId) || []).find((j) => j.id === payment.journalId);
      expect(journal).toBeDefined();
      expect(Number(journal?.totalDebitCents) / 100).toBe(1150.0);
      expect(Number(journal?.totalCreditCents) / 100).toBe(1150.0);
      expect(journal?.lines.length).toBe(3);
    });

    it('rejects cash disbursement when vault has insufficient balance', () => {
      const accounts = repo.getTreasuryAccounts({ type: 'CASH_DRAWER' });
      const vault = accounts[0];
      const excessiveAmount = vault.currentBalanceSar + 1000000;

      expect(() => {
        repo.createTreasuryPayment({
          paymentDate: '2026-03-02',
          treasuryAccountId: vault.id,
          category: 'OPERATING_EXPENSE',
          paymentMethod: 'CASH',
          amountSar: excessiveAmount,
          recipientName: 'مورد نقدي',
          descriptionAr: 'محاولة صرف تفوق الرصيد',
        });
      }).toThrow(/Insufficient balance/);
    });
  });

  describe('5. Inter-Account Transfers (التحويل بين الخزائن)', () => {
    it('transfers funds from cash drawer to bank account with transfer fee', () => {
      const vaults = repo.getTreasuryAccounts({ type: 'CASH_DRAWER' });
      const banks = repo.getTreasuryAccounts({ type: 'BANK_ACCOUNT' });
      const vault = vaults[0];
      const bank = banks[0];

      const initialVaultBal = vault.currentBalanceSar;
      const initialBankBal = bank.currentBalanceSar;

      const transfer = repo.createTreasuryTransfer({
        transferDate: '2026-03-03',
        fromAccountId: vault.id,
        toAccountId: bank.id,
        amountSar: 10000.0,
        transferFeeSar: 25.0,
        referenceNumber: 'DEP-CASH-009',
        descriptionAr: 'إيداع إيرادات نقدية في الحساب البنكي',
      });

      expect(transfer.id).toBeDefined();
      expect(transfer.transferNumber).toMatch(/^TRF-/);
      expect(transfer.amountSar).toBe(10000.0);
      expect(transfer.transferFeeSar).toBe(25.0);

      // Verify Vault was deducted (10,000 + 25 = 10,025 SAR)
      const updatedVault = repo.getTreasuryAccountById(vault.id);
      expect(updatedVault.currentBalanceSar).toBe(initialVaultBal - 10025.0);

      // Verify Bank received 10,000 SAR
      const updatedBank = repo.getTreasuryAccountById(bank.id);
      expect(updatedBank.currentBalanceSar).toBe(initialBankBal + 10000.0);

      // Verify Journal is perfectly balanced
      const journal = (centralStore.journals.get(tenantId) || []).find((j) => j.id === transfer.journalId);
      expect(journal).toBeDefined();
      expect(Number(journal?.totalDebitCents) / 100).toBe(10025.0);
      expect(Number(journal?.totalCreditCents) / 100).toBe(10025.0);
    });
  });

  describe('6. Petty Cash Custody Settlement (تسوية العهد النقدية)', () => {
    it('settles a petty cash custody with expense lines and cash refund back to main vault', () => {
      const custodies = repo.getTreasuryAccounts({ type: 'PETTY_CASH' });
      const vaults = repo.getTreasuryAccounts({ type: 'CASH_DRAWER' });
      const custody = custodies[0];
      const vault = vaults[0];

      const initialCustodyBal = custody.currentBalanceSar; // 5000 SAR
      const initialVaultBal = vault.currentBalanceSar;

      const settlement = repo.createPettyCashSettlement({
        settlementDate: '2026-03-04',
        custodyAccountId: custody.id,
        custodianName: 'فهد السبيعي',
        expenseItems: [
          {
            expenseAccountId: '60201',
            expenseAccountCode: '60201',
            expenseAccountNameAr: 'ضيافة وبوفيه',
            vendorName: 'تموينات المروج',
            taxableAmountSar: 400.0,
            vatAmountSar: 60.0,
            descriptionAr: 'مستلزمات ضيافة وبوفيه الإدارة',
          },
          {
            expenseAccountId: '60301',
            expenseAccountCode: '60301',
            expenseAccountNameAr: 'أدوات مكتبية ومطبوعات',
            vendorName: 'مكتبة جرير',
            taxableAmountSar: 800.0,
            vatAmountSar: 120.0,
            descriptionAr: 'شراء أحبار وأوراق طباعة عاجلة',
          },
        ],
        refundedAmountSar: 1000.0,
        refundDestinationAccountId: vault.id,
        notes: 'تسوية دورية للعهدة النقدية وإرجاع الفائض',
      });

      expect(settlement.id).toBeDefined();
      expect(settlement.settlementNumber).toMatch(/^STL-/);
      expect(settlement.totalExpensesSar).toBe(1200.0);
      expect(settlement.totalVatSar).toBe(180.0);
      expect(settlement.grossExpensesSar).toBe(1380.0);
      expect(settlement.refundedAmountSar).toBe(1000.0);

      // Outlay = 1380 + 1000 = 2380 SAR
      // Custody Closing Balance = 5000 - 2380 = 2620 SAR
      const updatedCustody = repo.getTreasuryAccountById(custody.id);
      expect(updatedCustody.currentBalanceSar).toBe(initialCustodyBal - 2380.0);

      // Main Vault received 1000 SAR refund
      const updatedVault = repo.getTreasuryAccountById(vault.id);
      expect(updatedVault.currentBalanceSar).toBe(initialVaultBal + 1000.0);

      // Verify GL Journal
      const journal = (centralStore.journals.get(tenantId) || []).find((j) => j.id === settlement.journalId);
      expect(journal).toBeDefined();
      expect(Number(journal?.totalDebitCents) / 100).toBe(2380.0);
      expect(Number(journal?.totalCreditCents) / 100).toBe(2380.0);
    });
  });

  describe('7. Bank Statements & Reconciliation Engine', () => {
    it('uploads a bank statement and performs mathematical reconciliation', () => {
      const banks = repo.getTreasuryAccounts({ type: 'BANK_ACCOUNT' });
      const bank = banks[0];

      const statement = repo.uploadBankStatement({
        treasuryAccountId: bank.id,
        statementNumber: 'STMT-FEB-2026',
        startDate: '2026-02-01',
        endDate: '2026-02-28',
        openingBalanceSar: 200000.0,
        closingBalanceSar: 250000.0,
        lines: [
          {
            transactionDate: '2026-02-05',
            referenceNumber: 'TX-001',
            description: 'Customer deposit',
            depositAmountSar: 60000.0,
            withdrawalAmountSar: 0.0,
          },
          {
            transactionDate: '2026-02-15',
            referenceNumber: 'TX-002',
            description: 'Supplier payment',
            depositAmountSar: 0.0,
            withdrawalAmountSar: 10000.0,
          },
        ],
      });

      expect(statement.id).toBeDefined();
      expect(statement.lines.length).toBe(2);
      expect(statement.totalDepositsSar).toBe(60000.0);
      expect(statement.totalWithdrawalsSar).toBe(10000.0);

      // Create Bank Reconciliation
      const rec = repo.createBankReconciliation({
        treasuryAccountId: bank.id,
        statementId: statement.id,
        asOfDate: '2026-02-28',
        unpresentedChequesTotalSar: 0.0,
        depositsInTransitTotalSar: 0.0,
        bankChargesAdjustmentsSar: 0.0,
      });

      expect(rec.id).toBeDefined();
      expect(rec.reconciliationNumber).toMatch(/^REC-/);
      expect(rec.bankStatementEndingBalanceSar).toBe(250000.0);
    });

    it('computes bank reconciliation summary with zero discrepancy', () => {
      const summary = computeBankReconciliationSummary({
        bankStatementEndingBalanceSar: 100000.0,
        glBookBalanceSar: 105000.0,
        unpresentedChequesSar: 10000.0, // Bank + Deposits - Unpresented = 100000 + 15000 - 10000 = 105000
        depositsInTransitSar: 15000.0,
        bankChargesSar: 0.0,
      });

      expect(summary.adjustedBankBalanceSar).toBe(105000.0);
      expect(summary.adjustedBookBalanceSar).toBe(105000.0);
      expect(summary.discrepancySar).toBe(0.0);
      expect(summary.isBalanced).toBe(true);
    });
  });

  describe('8. Cheques Lifecycle (Clearance & Bouncing)', () => {
    it('clears an in-hand cheque into a bank account and updates balances', () => {
      const banks = repo.getTreasuryAccounts({ type: 'BANK_ACCOUNT' });
      const bank = banks[0];
      const initialBankBal = bank.currentBalanceSar;

      const cheques = repo.getCheques({ status: 'UNDER_COLLECTION' });
      expect(cheques.length).toBeGreaterThan(0);
      const cheque = cheques[0];

      const cleared = repo.clearCheque(cheque.id, bank.id);
      expect(cleared.status).toBe('CLEARED');
      expect(cleared.collectionDate).toBeDefined();

      // Bank account received the cheque funds
      const updatedBank = repo.getTreasuryAccountById(bank.id);
      expect(updatedBank.currentBalanceSar).toBe(initialBankBal + cheque.amountSar);
    });

    it('bounces an issued or received cheque with recorded reason', () => {
      const vaults = repo.getTreasuryAccounts({ type: 'CASH_DRAWER' });
      // Create a test cheque receipt
      const receipt = repo.createTreasuryReceipt({
        receiptDate: '2026-03-08',
        treasuryAccountId: vaults[0].id,
        category: 'CUSTOMER_PAYMENT',
        paymentMethod: 'CHEQUE',
        amountSar: 5000.0,
        payerName: 'عميل شيك مرتد',
        chequeNumber: 'CHQ-BOUNCE-01',
        descriptionAr: 'شيك سيتم إرجاعه لعدم كفاية الرصيد',
      });

      const cheques = repo.getCheques({ search: 'CHQ-BOUNCE-01' });
      expect(cheques.length).toBe(1);

      const bounced = repo.bounceCheque(cheques[0].id, 'عدم كفاية الرصيد لدى البنك المسحوب عليه (بند 3)');
      expect(bounced.status).toBe('BOUNCED');
      expect(bounced.bounceReason).toContain('عدم كفاية الرصيد');
    });
  });

  describe('9. Treasury Overview KPI Metrics', () => {
    it('returns aggregated metrics for total liquid funds, bank and vault balances', () => {
      const metrics = repo.getTreasuryOverviewMetrics();
      expect(metrics.totalLiquidFundsSar).toBeGreaterThan(0);
      expect(metrics.bankBalancesSar).toBeGreaterThan(0);
      expect(metrics.vaultBalancesSar).toBeGreaterThan(0);
      expect(metrics.accountsCount).toBeGreaterThanOrEqual(4);
      expect(metrics.receiptsCount).toBeGreaterThan(0);
      expect(metrics.paymentsCount).toBeGreaterThan(0);
    });
  });
});

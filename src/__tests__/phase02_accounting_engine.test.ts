import { describe, it, expect, beforeEach } from 'vitest';
import { centralStore, TenantScopedRepository } from '../../server/core/tenantGuard.js';
import { roundHalfUp, toHalalas, fromHalalasToDisplay, validateJournalBalance } from '../lib/accounting.js';

describe('PHASE-02: Chart of Accounts & Core Double-Entry Posting Engine (Rules G1-G8)', () => {
  const testTenantId = 'tenant-p2-test-001';
  let repo: TenantScopedRepository;

  beforeEach(() => {
    centralStore.initDefaultSeed();
    repo = new TenantScopedRepository({
      userId: 'user-cfo-001',
      userEmail: 'cfo@al-inma.sa',
      tenantId: testTenantId,
      role: 'CHIEF_ACCOUNTANT',
      roleCode: 'CHIEF_ACCOUNTANT',
      permissions: [
        'accounting:account:manage',
        'accounting:journal:view',
        'accounting:journal:create',
        'accounting:journal:edit',
        'accounting:journal:post',
        'accounting:journal:reverse',
        'accounting:period:close',
        'accounting:period:reopen',
        'accounting:cost:view',
      ],
    });
  });

  describe('1. Chart of Accounts Management', () => {
    it('initializes default Saudi Standard Chart of Accounts with standard 18 mapped accounts', () => {
      const accounts = repo.getAccounts();
      expect(accounts.length).toBeGreaterThanOrEqual(18);

      // Verify core top-level and essential accounts exist
      const cashAccount = accounts.find((a) => a.code === '10101');
      const salesAccount = accounts.find((a) => a.code === '40101');
      const vatOutput = accounts.find((a) => a.code === '20301');

      expect(cashAccount).toBeDefined();
      expect(cashAccount?.normalBalance).toBe('DEBIT');
      expect(salesAccount).toBeDefined();
      expect(salesAccount?.normalBalance).toBe('CREDIT');
      expect(vatOutput).toBeDefined();
      expect(vatOutput?.normalBalance).toBe('CREDIT');
    });

    it('creates a new postable sub-account under an existing header', () => {
      const parent = repo.getAccounts().find((a) => a.code === '10100'); // Cash and Cash Equivalents
      expect(parent).toBeDefined();

      const newAccount = repo.createAccount({
        code: '10105',
        nameAr: 'صندوق فرع الخبر',
        nameEn: 'Khobar Branch Cash',
        type: 'ASSET',
        normalBalance: 'DEBIT',
        parentId: parent?.id,
        isHeader: false,
      });

      expect(newAccount.code).toBe('10105');
      expect(newAccount.parentId).toBe(parent?.id);
      expect(newAccount.isHeader).toBe(false);

      const accounts = repo.getAccounts();
      expect(accounts.some((a) => a.code === '10105')).toBe(true);
    });

    it('rejects creating an account with duplicate code', () => {
      expect(() => {
        repo.createAccount({
          code: '10101', // already exists
          nameAr: 'حساب مكرر',
          nameEn: 'Duplicate Account',
          type: 'ASSET',
          normalBalance: 'DEBIT',
          isHeader: false,
        });
      }).toThrow(/already exists/i);
    });
  });

  describe('2. Double-Entry Posting Engine (Rule G1 & G7)', () => {
    it('successfully posts a balanced multi-line journal entry', async () => {
      const accounts = repo.getAccounts();
      const cash = accounts.find((a) => a.code === '10101')!;
      const sales = accounts.find((a) => a.code === '40101')!;
      const vatOut = accounts.find((a) => a.code === '20301')!;

      const journal = await repo.postJournal({
        companyId: testTenantId,
        sourceType: 'MANUAL',
        sourceId: 'src-001',
        sourceKey: 'MANUAL:INV-1001',
        date: '2026-09-18',
        description: 'إثبات مبيعات نقدية مع الضريبة 15%',
        descriptionAr: 'إثبات مبيعات نقدية مع الضريبة 15%',
        descriptionEn: 'Cash sales with 15% VAT',
        lines: [
          { accountId: cash.id, debit: '1150.00', credit: '0.00', description: 'قبض نقدي من العميل' },
          { accountId: sales.id, debit: '0.00', credit: '1000.00', description: 'إيراد المبيعات' },
          { accountId: vatOut.id, debit: '0.00', credit: '150.00', description: 'ضريبة مخرجات 15%' },
        ],
      });

      expect(journal.id).toBeDefined();
      expect(journal.status).toBe('POSTED');
      expect(journal.totalDebitCents).toBe(11500000n);
      expect(journal.totalCreditCents).toBe(11500000n);
      expect(fromHalalasToDisplay(journal.totalDebitCents)).toBe('1150.00');
    });

    it('rejects an unbalanced journal entry strictly adhering to Rule G1', async () => {
      const accounts = repo.getAccounts();
      const cash = accounts.find((a) => a.code === '10101')!;
      const sales = accounts.find((a) => a.code === '40101')!;

      await expect(
        repo.postJournal({
          companyId: testTenantId,
          sourceType: 'MANUAL',
          sourceId: 'src-002',
          sourceKey: 'MANUAL:ERR-001',
          date: '2026-09-18',
          description: 'قيد غير متوازن',
          descriptionAr: 'قيد غير متوازن',
          descriptionEn: 'Unbalanced journal',
          lines: [
            { accountId: cash.id, debit: '1000.00', credit: '0.00' },
            { accountId: sales.id, debit: '0.00', credit: '950.00' }, // 50 SAR discrepancy
          ],
        })
      ).rejects.toThrow(/must equal|JOURNAL_UNBALANCED_HALALAS|do not equal|لا يساوي/i);
    });

    it('enforces idempotency on identical sourceKey', async () => {
      const accounts = repo.getAccounts();
      const cash = accounts.find((a) => a.code === '10101')!;
      const sales = accounts.find((a) => a.code === '40101')!;

      const firstJournal = await repo.postJournal({
        companyId: testTenantId,
        sourceType: 'INVOICE',
        sourceId: 'inv-unique-123',
        sourceKey: 'INVOICE:INV-UNIQUE-123',
        date: '2026-09-18',
        description: 'فاتورة مبيعات فريدة',
        descriptionAr: 'فاتورة مبيعات فريدة',
        descriptionEn: 'Unique sales invoice',
        lines: [
          { accountId: cash.id, debit: '500.00', credit: '0.00' },
          { accountId: sales.id, debit: '0.00', credit: '500.00' },
        ],
      });

      // Second identical call must return existing journal without creating duplicate
      const secondJournal = await repo.postJournal({
        companyId: testTenantId,
        sourceType: 'INVOICE',
        sourceId: 'inv-unique-123',
        sourceKey: 'INVOICE:INV-UNIQUE-123',
        date: '2026-09-18',
        description: 'فاتورة مبيعات فريدة مكررة',
        descriptionAr: 'فاتورة مبيعات فريدة مكررة',
        descriptionEn: 'Unique sales invoice duplicate',
        lines: [
          { accountId: cash.id, debit: '500.00', credit: '0.00' },
          { accountId: sales.id, debit: '0.00', credit: '500.00' },
        ],
      });

      expect(secondJournal.id).toBe(firstJournal.id);
      expect(secondJournal.entryNumber).toBe(firstJournal.entryNumber);
    });

    it('creates an immutable reversal journal for a posted entry', async () => {
      const accounts = repo.getAccounts();
      const cash = accounts.find((a) => a.code === '10101')!;
      const exp = accounts.find((a) => a.code === '50301')!; // Rent / General Expense

      const original = await repo.postJournal({
        companyId: testTenantId,
        sourceType: 'MANUAL',
        sourceId: 'exp-001',
        sourceKey: 'MANUAL:EXP-001',
        date: '2026-09-18',
        description: 'إثبات مصروف إيجار',
        descriptionAr: 'إثبات مصروف إيجار',
        descriptionEn: 'Rent expense',
        lines: [
          { accountId: exp.id, debit: '3000.00', credit: '0.00' },
          { accountId: cash.id, debit: '0.00', credit: '3000.00' },
        ],
      });

      const reversal = await repo.reverseJournal(original.id, 'خطأ في قيد المصروف');
      expect(reversal.status).toBe('POSTED');
      expect(reversal.sourceType).toBe('REVERSAL');
      expect(reversal.reversalOfJournalId).toBe(original.id);

      // Check original journal status is updated
      const updatedOriginal = repo.getJournalById(original.id)!;
      expect(updatedOriginal.status).toBe('REVERSED');
      expect(updatedOriginal.reversedByJournalId).toBe(reversal.id);
    });
  });

  describe('3. Financial Periods & Fiscal Year Control', () => {
    it('manages 12 monthly periods per fiscal year with close/reopen capability', () => {
      const fiscalYears = repo.getFiscalYears();
      expect(fiscalYears.length).toBeGreaterThanOrEqual(1);

      const fy2026 = fiscalYears.find((fy) => fy.year === 2026);
      expect(fy2026).toBeDefined();

      const periods = repo.getFinancialPeriods(fy2026?.id);
      expect(periods.length).toBe(12);

      const p1 = periods[0];
      expect(p1.isClosed).toBe(false);

      const closedP1 = repo.closePeriod(p1.id, 'إقفال شهري للمراجعة');
      expect(closedP1.isClosed).toBe(true);

      const reopenedP1 = repo.reopenPeriod(p1.id, 'إعادة فتح لتسوية استثنائية');
      expect(reopenedP1.isClosed).toBe(false);
    });
  });
});

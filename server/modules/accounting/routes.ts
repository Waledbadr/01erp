import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../core/authMiddleware.js';
import { fromHalalasToDisplay } from '../../../src/lib/accounting.js';
import { JournalEntry, OpeningBalanceEntry } from '../../core/tenantGuard.js';

export const accountingRouter = Router();

// Helper to serialize BigInt fields safely for JSON responses
function formatJournalForResponse(j: JournalEntry) {
  return {
    ...j,
    totalDebitCents: j.totalDebitCents.toString(),
    totalCreditCents: j.totalCreditCents.toString(),
    totalDebit: fromHalalasToDisplay(j.totalDebitCents),
    totalCredit: fromHalalasToDisplay(j.totalCreditCents),
    lines: j.lines.map((l) => ({
      ...l,
      debitCents: l.debitCents.toString(),
      creditCents: l.creditCents.toString(),
      debit: fromHalalasToDisplay(l.debitCents),
      credit: fromHalalasToDisplay(l.creditCents),
    })),
  };
}

function formatOpeningBalanceForResponse(b: OpeningBalanceEntry) {
  return {
    ...b,
    debitCents: b.debitCents.toString(),
    creditCents: b.creditCents.toString(),
    debit: fromHalalasToDisplay(b.debitCents),
    credit: fromHalalasToDisplay(b.creditCents),
  };
}

// ==========================================
// 1. STATUS & SYSTEM INFO
// ==========================================
accountingRouter.get('/status', (req: Request, res: Response) => {
  res.json({
    module: 'accounting',
    version: '2.0.0',
    postingEngine: 'DOUBLE_ENTRY_IMMUTABLE',
    balanceInvariant: 'TOTAL_DEBIT == TOTAL_CREDIT',
    currencyUnit: 'HALALAS_CENTS',
    phase02Completed: true,
  });
});

// ==========================================
// 2. CHART OF ACCOUNTS
// ==========================================
accountingRouter.get('/accounts', requireAuth, (req: Request, res: Response) => {
  const repo = req.tenantRepo!;
  const accounts = repo.getAccounts();
  res.json({ accounts, total: accounts.length });
});

accountingRouter.post('/accounts', requireAuth, requirePermission('accounting:account:manage'), (req: Request, res: Response) => {
  try {
    const repo = req.tenantRepo!;
    const newAccount = repo.createAccount(req.body);
    res.status(201).json({ message: 'تم إنشاء الحساب بنجاح', account: newAccount });
  } catch (err: any) {
    res.status(400).json({ error: 'CREATE_ACCOUNT_FAILED', message: err.message });
  }
});

accountingRouter.put('/accounts/:id', requireAuth, requirePermission('accounting:account:manage'), (req: Request, res: Response) => {
  try {
    const repo = req.tenantRepo!;
    const updated = repo.updateAccount(req.params.id, req.body);
    res.json({ message: 'تم تحديث الحساب بنجاح', account: updated });
  } catch (err: any) {
    res.status(400).json({ error: 'UPDATE_ACCOUNT_FAILED', message: err.message });
  }
});

accountingRouter.delete('/accounts/:id', requireAuth, requirePermission('accounting:account:manage'), (req: Request, res: Response) => {
  try {
    const repo = req.tenantRepo!;
    repo.deleteAccount(req.params.id);
    res.json({ message: 'تم حذف الحساب بنجاح' });
  } catch (err: any) {
    res.status(400).json({ error: 'DELETE_ACCOUNT_FAILED', message: err.message });
  }
});

// ==========================================
// 3. ACCOUNT MAPPINGS (18 Mapped Accounts)
// ==========================================
accountingRouter.get('/mappings', requireAuth, (req: Request, res: Response) => {
  const repo = req.tenantRepo!;
  const mappings = repo.getAccountMappings();
  const validation = repo.validateMappingCompleteness();
  res.json({ mappings, validation });
});

accountingRouter.put('/mappings', requireAuth, requirePermission('accounting:account:manage'), (req: Request, res: Response) => {
  try {
    const repo = req.tenantRepo!;
    const updated = repo.updateAccountMappings(req.body);
    const validation = repo.validateMappingCompleteness();
    res.json({ message: 'تم تحديث ربط الحسابات بنجاح', mappings: updated, validation });
  } catch (err: any) {
    res.status(400).json({ error: 'UPDATE_MAPPINGS_FAILED', message: err.message });
  }
});

// ==========================================
// 4. JOURNALS & GENERAL LEDGER POSTING
// ==========================================
accountingRouter.get('/journals', requireAuth, requirePermission('accounting:journal:view'), (req: Request, res: Response) => {
  const repo = req.tenantRepo!;
  const { startDate, endDate, accountId, sourceType, periodId, status, search } = req.query;
  const journals = repo.getJournals({
    startDate: startDate as string,
    endDate: endDate as string,
    accountId: accountId as string,
    sourceType: sourceType as string,
    periodId: periodId as string,
    status: status as string,
    search: search as string,
  });

  res.json({
    journals: journals.map(formatJournalForResponse),
    total: journals.length,
  });
});

accountingRouter.get('/journals/:id', requireAuth, requirePermission('accounting:journal:view'), (req: Request, res: Response) => {
  const repo = req.tenantRepo!;
  const journal = repo.getJournalById(req.params.id);
  if (!journal) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'القيد المحاسبي غير موجود' });
  }
  res.json({ journal: formatJournalForResponse(journal) });
});

accountingRouter.post('/journals', requireAuth, requirePermission('accounting:journal:post'), async (req: Request, res: Response) => {
  try {
    const repo = req.tenantRepo!;
    const journal = await repo.postJournal({
      companyId: repo.tenantId,
      branchId: req.body.branchId,
      sourceType: req.body.sourceType || 'MANUAL',
      sourceId: req.body.sourceId || crypto.randomUUID(),
      sourceKey: req.body.sourceKey || `MANUAL:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
      date: req.body.date,
      description: req.body.description,
      descriptionAr: req.body.descriptionAr || req.body.description,
      descriptionEn: req.body.descriptionEn || req.body.description,
      reference: req.body.reference,
      costCenterId: req.body.costCenterId,
      overrideClosedPeriod: req.body.overrideClosedPeriod,
      closedPeriodOverrideReason: req.body.closedPeriodOverrideReason,
      lines: req.body.lines,
    });

    res.status(201).json({
      message: 'تم ترحيل القيد المحاسبي بنجاح إلى دفتر الأستاذ العام',
      journal: formatJournalForResponse(journal),
    });
  } catch (err: any) {
    res.status(400).json({ error: 'POST_JOURNAL_FAILED', message: err.message });
  }
});

accountingRouter.post('/journals/:id/reverse', requireAuth, requirePermission('accounting:journal:reverse'), async (req: Request, res: Response) => {
  try {
    const repo = req.tenantRepo!;
    const { reason } = req.body;
    const reversal = await repo.reverseJournal(req.params.id, reason);
    res.json({
      message: 'تم عكس القيد المحاسبي بنجاح وإنشاء قيد عكسي مرتبط',
      reversalJournal: formatJournalForResponse(reversal),
    });
  } catch (err: any) {
    res.status(400).json({ error: 'REVERSE_JOURNAL_FAILED', message: err.message });
  }
});

// ==========================================
// 5. FISCAL YEARS & FINANCIAL PERIODS
// ==========================================
accountingRouter.get('/fiscal-years', requireAuth, (req: Request, res: Response) => {
  const repo = req.tenantRepo!;
  const years = repo.getFiscalYears();
  res.json({ fiscalYears: years });
});

accountingRouter.post('/fiscal-years', requireAuth, requirePermission('accounting:period:close'), (req: Request, res: Response) => {
  try {
    const repo = req.tenantRepo!;
    const { year, startDate, endDate } = req.body;
    const newYear = repo.createFiscalYear(Number(year), startDate, endDate);
    res.status(201).json({ message: 'تم إنشاء السنة المالية وتهيئة الفترات بنجاح', fiscalYear: newYear });
  } catch (err: any) {
    res.status(400).json({ error: 'CREATE_FISCAL_YEAR_FAILED', message: err.message });
  }
});

accountingRouter.post('/fiscal-years/:id/close', requireAuth, requirePermission('accounting:period:close'), async (req: Request, res: Response) => {
  try {
    const repo = req.tenantRepo!;
    const { retainedEarningsAccountId } = req.body;
    const result = await repo.closeFiscalYear(req.params.id, retainedEarningsAccountId);
    res.json({
      message: 'تم إقفال السنة المالية وترحيل الأرباح/الخسائر بنجاح',
      closingJournal: formatJournalForResponse(result.closingJournal),
      netIncome: fromHalalasToDisplay(result.netIncomeHalalas),
    });
  } catch (err: any) {
    res.status(400).json({ error: 'CLOSE_FISCAL_YEAR_FAILED', message: err.message });
  }
});

accountingRouter.get('/periods', requireAuth, (req: Request, res: Response) => {
  const repo = req.tenantRepo!;
  const { fiscalYearId } = req.query;
  const periods = repo.getFinancialPeriods(fiscalYearId as string);
  res.json({ periods });
});

accountingRouter.post('/periods/:id/close', requireAuth, requirePermission('accounting:period:close'), (req: Request, res: Response) => {
  try {
    const repo = req.tenantRepo!;
    const { reason } = req.body;
    const closed = repo.closePeriod(req.params.id, reason);
    res.json({ message: 'تم إقفال الفترة المالية بنجاح', period: closed });
  } catch (err: any) {
    res.status(400).json({ error: 'CLOSE_PERIOD_FAILED', message: err.message });
  }
});

accountingRouter.post('/periods/:id/reopen', requireAuth, requirePermission('accounting:period:reopen'), (req: Request, res: Response) => {
  try {
    const repo = req.tenantRepo!;
    const { reason } = req.body;
    const reopened = repo.reopenPeriod(req.params.id, reason);
    res.json({ message: 'تمت إعادة فتح الفترة المالية بنجاح', period: reopened });
  } catch (err: any) {
    res.status(400).json({ error: 'REOPEN_PERIOD_FAILED', message: err.message });
  }
});

// ==========================================
// 6. COST CENTERS
// ==========================================
accountingRouter.get('/cost-centers', requireAuth, requirePermission('accounting:cost:view'), (req: Request, res: Response) => {
  const repo = req.tenantRepo!;
  const costCenters = repo.getCostCenters();
  res.json({ costCenters });
});

accountingRouter.post('/cost-centers', requireAuth, requirePermission('accounting:cost:view'), (req: Request, res: Response) => {
  try {
    const repo = req.tenantRepo!;
    const created = repo.createCostCenter(req.body);
    res.status(201).json({ message: 'تم إنشاء مركز التكلفة بنجاح', costCenter: created });
  } catch (err: any) {
    res.status(400).json({ error: 'CREATE_COST_CENTER_FAILED', message: err.message });
  }
});

// ==========================================
// 7. OPENING BALANCES
// ==========================================
accountingRouter.get('/opening-balances', requireAuth, requirePermission('accounting:journal:view'), (req: Request, res: Response) => {
  const repo = req.tenantRepo!;
  const balances = repo.getOpeningBalances();
  res.json({
    openingBalances: balances.map(formatOpeningBalanceForResponse),
    totalCount: balances.length,
  });
});

accountingRouter.post('/opening-balances', requireAuth, requirePermission('accounting:journal:post'), (req: Request, res: Response) => {
  try {
    const repo = req.tenantRepo!;
    const entry = repo.saveOpeningBalanceEntry(req.body);
    res.status(201).json({ message: 'تم حفظ الرصيد الافتتاحي بنجاح', entry: formatOpeningBalanceForResponse(entry) });
  } catch (err: any) {
    res.status(400).json({ error: 'SAVE_OPENING_BALANCE_FAILED', message: err.message });
  }
});

accountingRouter.post('/opening-balances/import', requireAuth, requirePermission('accounting:journal:post'), (req: Request, res: Response) => {
  try {
    const repo = req.tenantRepo!;
    const { entries } = req.body;
    if (!Array.isArray(entries)) {
      return res.status(400).json({ error: 'INVALID_DATA', message: 'مصفوفة البيانات مطلوبة' });
    }
    const result = repo.importOpeningBalances(entries);
    res.json({ message: `تم استيراد ${result.imported} بند بنجاح`, result });
  } catch (err: any) {
    res.status(400).json({ error: 'IMPORT_FAILED', message: err.message });
  }
});

accountingRouter.delete('/opening-balances/:id', requireAuth, requirePermission('accounting:journal:post'), (req: Request, res: Response) => {
  try {
    const repo = req.tenantRepo!;
    repo.deleteOpeningBalanceEntry(req.params.id);
    res.json({ message: 'تم حذف بند الرصيد الافتتاحي بنجاح' });
  } catch (err: any) {
    res.status(400).json({ error: 'DELETE_FAILED', message: err.message });
  }
});

accountingRouter.post('/opening-balances/finalize', requireAuth, requirePermission('accounting:journal:post'), async (req: Request, res: Response) => {
  try {
    const repo = req.tenantRepo!;
    const journal = await repo.finalizeOpeningBalances();
    res.json({
      message: 'تم اعتماد وترحيل الأرصدة الافتتاحية بنجاح إلى دفتر الأستاذ العام',
      journal: formatJournalForResponse(journal),
    });
  } catch (err: any) {
    res.status(400).json({ error: 'FINALIZE_OPENING_BALANCES_FAILED', message: err.message });
  }
});

// ==========================================
// 8. DRAFT MANUAL JOURNALS
// ==========================================
accountingRouter.get('/draft-journals', requireAuth, requirePermission('accounting:journal:view'), (req: Request, res: Response) => {
  const repo = req.tenantRepo!;
  const drafts = repo.getDraftJournals();
  res.json({ drafts });
});

accountingRouter.post('/draft-journals', requireAuth, requirePermission('accounting:journal:create'), (req: Request, res: Response) => {
  try {
    const repo = req.tenantRepo!;
    const draft = repo.createDraftJournal(req.body);
    res.status(201).json({ message: 'تم حفظ مسودة القيد بنجاح', draft });
  } catch (err: any) {
    res.status(400).json({ error: 'CREATE_DRAFT_FAILED', message: err.message });
  }
});

accountingRouter.put('/draft-journals/:id', requireAuth, requirePermission('accounting:journal:edit'), (req: Request, res: Response) => {
  try {
    const repo = req.tenantRepo!;
    const updated = repo.updateDraftJournal(req.params.id, req.body);
    res.json({ message: 'تم تحديث مسودة القيد بنجاح', draft: updated });
  } catch (err: any) {
    res.status(400).json({ error: 'UPDATE_DRAFT_FAILED', message: err.message });
  }
});

accountingRouter.delete('/draft-journals/:id', requireAuth, requirePermission('accounting:journal:edit'), (req: Request, res: Response) => {
  try {
    const repo = req.tenantRepo!;
    repo.deleteDraftJournal(req.params.id);
    res.json({ message: 'تم حذف مسودة القيد بنجاح' });
  } catch (err: any) {
    res.status(400).json({ error: 'DELETE_DRAFT_FAILED', message: err.message });
  }
});

accountingRouter.post('/draft-journals/:id/post', requireAuth, requirePermission('accounting:journal:post'), async (req: Request, res: Response) => {
  try {
    const repo = req.tenantRepo!;
    const journal = await repo.postDraftJournal(req.params.id);
    res.status(201).json({
      message: 'تم ترحيل مسودة القيد بنجاح إلى دفتر الأستاذ العام',
      journal: formatJournalForResponse(journal),
    });
  } catch (err: any) {
    res.status(400).json({ error: 'POST_DRAFT_FAILED', message: err.message });
  }
});

// ==========================================
// 9. TRIAL BALANCE REPORT (GOLDEN RULES G1, G7)
// ==========================================
accountingRouter.get('/trial-balance', requireAuth, requirePermission('accounting:journal:view'), (req: Request, res: Response) => {
  const repo = req.tenantRepo!;
  const { startDate, endDate } = req.query;

  const accounts = repo.getAccounts();
  const journals = repo.getJournals({
    startDate: startDate as string,
    endDate: endDate as string,
    status: 'POSTED',
  });

  let grandTotalDebits = 0n;
  let grandTotalCredits = 0n;

  const rows = accounts.map((acc) => {
    let accDebit = 0n;
    let accCredit = 0n;

    journals.forEach((j) => {
      j.lines.forEach((l) => {
        if (l.accountId === acc.id || l.accountCode === acc.code) {
          accDebit += l.debitCents;
          accCredit += l.creditCents;
        }
      });
    });

    grandTotalDebits += accDebit;
    grandTotalCredits += accCredit;

    const netDebit = accDebit > accCredit ? accDebit - accCredit : 0n;
    const netCredit = accCredit > accDebit ? accCredit - accDebit : 0n;

    return {
      accountId: acc.id,
      code: acc.code,
      nameAr: acc.nameAr,
      nameEn: acc.nameEn,
      type: acc.type,
      normalBalance: acc.normalBalance,
      isHeader: acc.isHeader,
      totalDebit: fromHalalasToDisplay(accDebit),
      totalCredit: fromHalalasToDisplay(accCredit),
      netDebit: fromHalalasToDisplay(netDebit),
      netCredit: fromHalalasToDisplay(netCredit),
      movementCount: journals.filter((j) => j.lines.some((l) => l.accountId === acc.id || l.accountCode === acc.code)).length,
    };
  });

  const isBalanced = grandTotalDebits === grandTotalCredits;
  const discrepancy = grandTotalDebits > grandTotalCredits ? grandTotalDebits - grandTotalCredits : grandTotalCredits - grandTotalDebits;

  res.json({
    isBalanced,
    discrepancy: fromHalalasToDisplay(discrepancy),
    grandTotalDebits: fromHalalasToDisplay(grandTotalDebits),
    grandTotalCredits: fromHalalasToDisplay(grandTotalCredits),
    rows,
    journalsCount: journals.length,
    generatedAt: new Date().toISOString(),
  });
});


/**
 * Authoritative Financial Reports Service — Saudi ERP Backend
 * Reads strictly from centralStore.journals (Rules G1, G7, G8)
 */

import { centralStore, JournalEntry } from '../../core/tenantGuard.js';
import { fromHalalasToDisplay } from '../../../src/lib/accounting.js';
import { ReportParameterSchema, ReportResult } from '../../../src/lib/reports.js';

function safeBigInt(val: any): bigint {
  if (val === undefined || val === null) return 0n;
  if (typeof val === 'bigint') return val;
  try {
    return BigInt(val);
  } catch {
    return 0n;
  }
}

function getJournalDate(j: any): string {
  return j.date || j.entryDate || (j.createdAt ? j.createdAt.slice(0, 10) : '');
}

function getJournalNumber(j: any): string {
  return j.journalNumber || j.entryNumber || j.id || '';
}

function getJournalDesc(j: any, l?: any): string {
  return (l && (l.description || l.descriptionAr || l.descriptionEn)) || j.description || j.descriptionAr || j.descriptionEn || '-';
}

function getJournalSourceNumber(j: any): string {
  return j.sourceNumber || j.reference || j.journalNumber || j.entryNumber || '-';
}

export function executeTrialBalance(tenantId: string, params: ReportParameterSchema): ReportResult {
  const start = Date.now();
  const accounts = centralStore.accounts.get(tenantId) || [];
  const allJournals = centralStore.journals.get(tenantId) || [];
  const postedJournals = allJournals.filter((j) => j.status === 'POSTED');

  const startDate = params.startDate;
  const endDate = params.endDate;

  let grandOpeningDebit = 0n;
  let grandOpeningCredit = 0n;
  let grandMovementDebit = 0n;
  let grandMovementCredit = 0n;
  let grandClosingDebit = 0n;
  let grandClosingCredit = 0n;

  const rows = accounts
    .filter((acc) => {
      const accLevel = (acc as any).level;
      if (params.accountHierarchyLevel && accLevel && accLevel > params.accountHierarchyLevel) {
        return false;
      }
      return true;
    })
    .map((acc) => {
      let openDebit = 0n;
      let openCredit = 0n;
      let movDebit = 0n;
      let movCredit = 0n;

      postedJournals.forEach((j) => {
        const jDate = getJournalDate(j);
        const isBefore = startDate ? jDate < startDate : false;
        const isInPeriod = (!startDate || jDate >= startDate) && (!endDate || jDate <= endDate);

        (j.lines || []).forEach((l) => {
          if (l.accountId === acc.id || l.accountCode === acc.code) {
            const deb = safeBigInt(l.debitCents);
            const cre = safeBigInt(l.creditCents);
            if (isBefore) {
              openDebit += deb;
              openCredit += cre;
            } else if (isInPeriod) {
              movDebit += deb;
              movCredit += cre;
            }
          }
        });
      });

      // Opening net
      const netOpen = openDebit - openCredit;
      const openingDebitNet = netOpen > 0n ? netOpen : 0n;
      const openingCreditNet = netOpen < 0n ? -netOpen : 0n;

      // Closing net
      const totalDeb = openDebit + movDebit;
      const totalCre = openCredit + movCredit;
      const netClose = totalDeb - totalCre;
      const closingDebitNet = netClose > 0n ? netClose : 0n;
      const closingCreditNet = netClose < 0n ? -netClose : 0n;

      grandOpeningDebit += openingDebitNet;
      grandOpeningCredit += openingCreditNet;
      grandMovementDebit += movDebit;
      grandMovementCredit += movCredit;
      grandClosingDebit += closingDebitNet;
      grandClosingCredit += closingCreditNet;

      return {
        id: acc.id,
        code: acc.code,
        nameAr: acc.nameAr,
        nameEn: acc.nameEn,
        type: acc.type,
        openingDebit: fromHalalasToDisplay(openingDebitNet),
        openingCredit: fromHalalasToDisplay(openingCreditNet),
        movementDebit: fromHalalasToDisplay(movDebit),
        movementCredit: fromHalalasToDisplay(movCredit),
        closingDebit: fromHalalasToDisplay(closingDebitNet),
        closingCredit: fromHalalasToDisplay(closingCreditNet),
        rawClosingDebit: closingDebitNet,
        rawClosingCredit: closingCreditNet,
      };
    })
    .filter((row) => {
      if (params.includeZeroBalances) return true;
      return (
        row.openingDebit !== '0.00' ||
        row.openingCredit !== '0.00' ||
        row.movementDebit !== '0.00' ||
        row.movementCredit !== '0.00' ||
        row.closingDebit !== '0.00' ||
        row.closingCredit !== '0.00'
      );
    });

  const isBalanced = grandMovementDebit === grandMovementCredit && grandClosingDebit === grandClosingCredit;
  const discrepancy = grandMovementDebit > grandMovementCredit ? grandMovementDebit - grandMovementCredit : grandMovementCredit - grandMovementDebit;

  return {
    reportType: 'TRIAL_BALANCE',
    category: 'FINANCIAL',
    titleAr: 'ميزان المراجعة بالمجاميع والأرصدة',
    titleEn: 'Trial Balance with Opening, Movements & Closing',
    generatedAt: new Date().toISOString(),
    parameters: params,
    summaryCards: [
      {
        id: 'tb-balance-status',
        labelAr: 'حالة التوازن المحاسبي (Rule G1)',
        labelEn: 'Balance Invariant Status',
        value: isBalanced ? 'متوازن 100% (صفر فروقات)' : 'غير متوازن',
        variant: isBalanced ? 'success' : 'danger',
        subtitleAr: `الفارق: ${fromHalalasToDisplay(discrepancy)} ر.س`,
        subtitleEn: `Discrepancy: ${fromHalalasToDisplay(discrepancy)} SAR`,
      },
      {
        id: 'tb-movement-debits',
        labelAr: 'إجمالي الحركات المدينة',
        labelEn: 'Total Period Debits',
        value: `${fromHalalasToDisplay(grandMovementDebit)} ر.س`,
        variant: 'default',
      },
      {
        id: 'tb-movement-credits',
        labelAr: 'إجمالي الحركات الدائنة',
        labelEn: 'Total Period Credits',
        value: `${fromHalalasToDisplay(grandMovementCredit)} ر.س`,
        variant: 'default',
      },
      {
        id: 'tb-closing-debits',
        labelAr: 'إجمالي الأرصدة الختامية',
        labelEn: 'Total Closing Balances',
        value: `${fromHalalasToDisplay(grandClosingDebit)} ر.س`,
        variant: 'info',
      },
    ],
    columns: [
      { field: 'code', labelAr: 'رمز الحساب', labelEn: 'Account Code', align: 'start', type: 'text' },
      { field: 'nameAr', labelAr: 'اسم الحساب', labelEn: 'Account Name', align: 'start', type: 'text' },
      { field: 'openingDebit', labelAr: 'افتتاحي مدين', labelEn: 'Opening Debit', align: 'end', type: 'currency' },
      { field: 'openingCredit', labelAr: 'افتتاحي دائن', labelEn: 'Opening Credit', align: 'end', type: 'currency' },
      { field: 'movementDebit', labelAr: 'حركة مدينة', labelEn: 'Period Debit', align: 'end', type: 'currency' },
      { field: 'movementCredit', labelAr: 'حركة دائنة', labelEn: 'Period Credit', align: 'end', type: 'currency' },
      { field: 'closingDebit', labelAr: 'ختامي مدين', labelEn: 'Closing Debit', align: 'end', type: 'currency' },
      { field: 'closingCredit', labelAr: 'ختامي دائن', labelEn: 'Closing Credit', align: 'end', type: 'currency' },
    ],
    rows,
    totals: {
      openingDebit: fromHalalasToDisplay(grandOpeningDebit),
      openingCredit: fromHalalasToDisplay(grandOpeningCredit),
      movementDebit: fromHalalasToDisplay(grandMovementDebit),
      movementCredit: fromHalalasToDisplay(grandMovementCredit),
      closingDebit: fromHalalasToDisplay(grandClosingDebit),
      closingCredit: fromHalalasToDisplay(grandClosingCredit),
    },
    pagination: {
      page: 1,
      pageSize: rows.length || 1,
      totalRows: rows.length,
      totalPages: 1,
    },
    isBalanced,
    discrepancyHalalas: discrepancy.toString(),
    executionTimeMs: Date.now() - start,
  };
}

export function executeGeneralLedger(tenantId: string, params: ReportParameterSchema): ReportResult {
  const start = Date.now();
  const accounts = centralStore.accounts.get(tenantId) || [];
  const allJournals = centralStore.journals.get(tenantId) || [];
  const postedJournals = allJournals
    .filter((j) => j.status === 'POSTED')
    .sort((a, b) => new Date(getJournalDate(a)).getTime() - new Date(getJournalDate(b)).getTime());

  const targetAccountId = params.accountId;
  const targetAccount = accounts.find((a) => a.id === targetAccountId || a.code === targetAccountId) || accounts[0];

  let runningBalance = 0n;
  let totalDebit = 0n;
  let totalCredit = 0n;

  // Opening balance before start date
  if (params.startDate && targetAccount) {
    postedJournals.forEach((j) => {
      if (getJournalDate(j) < params.startDate!) {
        (j.lines || []).forEach((l) => {
          if (l.accountId === targetAccount.id || l.accountCode === targetAccount.code) {
            const deb = safeBigInt(l.debitCents);
            const cre = safeBigInt(l.creditCents);
            runningBalance += (deb - cre);
          }
        });
      }
    });
  }

  const rows: any[] = [];

  // If there is an opening balance, add opening balance row
  if (runningBalance !== 0n && targetAccount) {
    rows.push({
      id: 'row-opening',
      date: params.startDate || '-',
      journalNumber: 'افتتاحي / Opening',
      description: 'الرصيد الافتتاحي ما قبل الفترة',
      sourceType: 'OPENING',
      debit: runningBalance > 0n ? fromHalalasToDisplay(runningBalance) : '0.00',
      credit: runningBalance < 0n ? fromHalalasToDisplay(-runningBalance) : '0.00',
      runningBalance: fromHalalasToDisplay(runningBalance),
    });
  }

  postedJournals.forEach((j) => {
    const jDate = getJournalDate(j);
    if (params.startDate && jDate < params.startDate) return;
    if (params.endDate && jDate > params.endDate) return;

    (j.lines || []).forEach((l, idx) => {
      const matchAccount = !targetAccount || l.accountId === targetAccount.id || l.accountCode === targetAccount.code;
      if (!matchAccount) return;

      const deb = safeBigInt(l.debitCents);
      const cre = safeBigInt(l.creditCents);
      runningBalance += (deb - cre);
      totalDebit += deb;
      totalCredit += cre;

      rows.push({
        id: `${j.id}-line-${idx}`,
        date: jDate,
        journalNumber: getJournalNumber(j),
        accountCode: l.accountCode,
        accountName: l.accountNameAr,
        description: getJournalDesc(j, l),
        sourceType: j.sourceType || 'MANUAL',
        debit: fromHalalasToDisplay(deb),
        credit: fromHalalasToDisplay(cre),
        runningBalance: fromHalalasToDisplay(runningBalance),
        sourceDocument: {
          type: (j.sourceType as any) || 'JOURNAL',
          id: j.sourceId || j.id,
          number: getJournalSourceNumber(j),
          date: jDate,
        },
      });
    });
  });

  return {
    reportType: 'GENERAL_LEDGER',
    category: 'FINANCIAL',
    titleAr: `دفتر الأستاذ العام — ${targetAccount ? targetAccount.nameAr + ' (' + targetAccount.code + ')' : 'كافة الحسابات'}`,
    titleEn: `General Ledger — ${targetAccount ? targetAccount.nameEn + ' (' + targetAccount.code + ')' : 'All Accounts'}`,
    generatedAt: new Date().toISOString(),
    parameters: params,
    summaryCards: [
      {
        id: 'gl-total-debit',
        labelAr: 'إجمالي الحركات المدينة',
        labelEn: 'Total Debits',
        value: `${fromHalalasToDisplay(totalDebit)} ر.س`,
        variant: 'default',
      },
      {
        id: 'gl-total-credit',
        labelAr: 'إجمالي الحركات الدائنة',
        labelEn: 'Total Credits',
        value: `${fromHalalasToDisplay(totalCredit)} ر.س`,
        variant: 'default',
      },
      {
        id: 'gl-net-balance',
        labelAr: 'الرصيد النهائي الجاري',
        labelEn: 'Final Running Balance',
        value: `${fromHalalasToDisplay(runningBalance)} ر.س`,
        variant: runningBalance >= 0n ? 'info' : 'warning',
      },
    ],
    columns: [
      { field: 'date', labelAr: 'التاريخ', labelEn: 'Date', align: 'start', type: 'date' },
      { field: 'journalNumber', labelAr: 'رقم القيد', labelEn: 'Journal #', align: 'start', type: 'link' },
      { field: 'sourceType', labelAr: 'نوع المصدر', labelEn: 'Source Type', align: 'center', type: 'badge' },
      { field: 'description', labelAr: 'البيان والتفاصيل', labelEn: 'Description', align: 'start', type: 'text' },
      { field: 'debit', labelAr: 'مدين (SAR)', labelEn: 'Debit (SAR)', align: 'end', type: 'currency' },
      { field: 'credit', labelAr: 'دائن (SAR)', labelEn: 'Credit (SAR)', align: 'end', type: 'currency' },
      { field: 'runningBalance', labelAr: 'الرصيد التراكمي', labelEn: 'Running Balance', align: 'end', type: 'currency' },
    ],
    rows,
    totals: {
      debit: fromHalalasToDisplay(totalDebit),
      credit: fromHalalasToDisplay(totalCredit),
      runningBalance: fromHalalasToDisplay(runningBalance),
    },
    pagination: {
      page: 1,
      pageSize: rows.length || 1,
      totalRows: rows.length,
      totalPages: 1,
    },
    executionTimeMs: Date.now() - start,
  };
}

export function executeProfitLoss(tenantId: string, params: ReportParameterSchema): ReportResult {
  const start = Date.now();
  const accounts = centralStore.accounts.get(tenantId) || [];
  const allJournals = centralStore.journals.get(tenantId) || [];
  const postedJournals = allJournals.filter((j) => j.status === 'POSTED');

  const calcPeriod = (startDate?: string, endDate?: string) => {
    let revenueCents = 0n;
    let cogsCents = 0n;
    let opexCents = 0n;
    const accountLines: Record<string, { code: string; nameAr: string; nameEn: string; type: string; amountCents: bigint }> = {};

    postedJournals.forEach((j) => {
      const jDate = getJournalDate(j);
      if (startDate && jDate < startDate) return;
      if (endDate && jDate > endDate) return;
      if (params.costCenterId && j.costCenterId && j.costCenterId !== params.costCenterId) return;

      (j.lines || []).forEach((l) => {
        const acc = accounts.find((a) => a.id === l.accountId || a.code === l.accountCode);
        if (!acc) return;

        const deb = safeBigInt(l.debitCents);
        const cre = safeBigInt(l.creditCents);

        // Revenue (Class 4): Normal balance is Credit (Cre - Deb)
        if (acc.type === 'REVENUE' || acc.code.startsWith('4')) {
          const net = cre - deb;
          revenueCents += net;
          if (!accountLines[acc.code]) {
            accountLines[acc.code] = { code: acc.code, nameAr: acc.nameAr, nameEn: acc.nameEn, type: 'REVENUE', amountCents: 0n };
          }
          accountLines[acc.code].amountCents += net;
        }

        // COGS (Account 50101 / Class 501): Normal balance is Debit (Deb - Cre)
        else if (acc.code.startsWith('501') || acc.nameEn?.toLowerCase().includes('cost of goods sold')) {
          const net = deb - cre;
          cogsCents += net;
          if (!accountLines[acc.code]) {
            accountLines[acc.code] = { code: acc.code, nameAr: acc.nameAr, nameEn: acc.nameEn, type: 'COGS', amountCents: 0n };
          }
          accountLines[acc.code].amountCents += net;
        }

        // Operating Expenses (Class 5 other): Normal balance is Debit (Deb - Cre)
        else if (acc.type === 'EXPENSE' || acc.code.startsWith('5')) {
          const net = deb - cre;
          opexCents += net;
          if (!accountLines[acc.code]) {
            accountLines[acc.code] = { code: acc.code, nameAr: acc.nameAr, nameEn: acc.nameEn, type: 'EXPENSE', amountCents: 0n };
          }
          accountLines[acc.code].amountCents += net;
        }
      });
    });

    const grossProfitCents = revenueCents - cogsCents;
    const netIncomeCents = grossProfitCents - opexCents;

    return {
      revenueCents,
      cogsCents,
      grossProfitCents,
      opexCents,
      netIncomeCents,
      accountLines,
    };
  };

  const current = calcPeriod(params.startDate, params.endDate);
  const comparison = params.comparisonStartDate ? calcPeriod(params.comparisonStartDate, params.comparisonEndDate) : null;

  const rows: any[] = [];

  // Group 1: Revenues
  rows.push({ id: 'hdr-rev', code: '40000', nameAr: '--- الإيرادات التجارية ---', nameEn: '--- Commercial Revenues ---', isHeader: true });
  Object.values(current.accountLines)
    .filter((a) => a.type === 'REVENUE')
    .forEach((a) => {
      const compVal = comparison?.accountLines[a.code]?.amountCents || 0n;
      rows.push({
        id: `acc-${a.code}`,
        code: a.code,
        nameAr: a.nameAr,
        nameEn: a.nameEn,
        amount: fromHalalasToDisplay(a.amountCents),
        comparisonAmount: comparison ? fromHalalasToDisplay(compVal) : '-',
      });
    });
  rows.push({
    id: 'tot-rev',
    code: 'TOTAL_REV',
    nameAr: 'إجمالي الإيرادات',
    nameEn: 'Total Revenues',
    isSubtotal: true,
    amount: fromHalalasToDisplay(current.revenueCents),
    comparisonAmount: comparison ? fromHalalasToDisplay(comparison.revenueCents) : '-',
  });

  // Group 2: COGS
  rows.push({ id: 'hdr-cogs', code: '50100', nameAr: '--- تكلفة البضاعة المباعة ---', nameEn: '--- Cost of Goods Sold ---', isHeader: true });
  Object.values(current.accountLines)
    .filter((a) => a.type === 'COGS')
    .forEach((a) => {
      const compVal = comparison?.accountLines[a.code]?.amountCents || 0n;
      rows.push({
        id: `acc-${a.code}`,
        code: a.code,
        nameAr: a.nameAr,
        nameEn: a.nameEn,
        amount: fromHalalasToDisplay(a.amountCents),
        comparisonAmount: comparison ? fromHalalasToDisplay(compVal) : '-',
      });
    });
  rows.push({
    id: 'tot-cogs',
    code: 'TOTAL_COGS',
    nameAr: 'إجمالي تكلفة المبيعات',
    nameEn: 'Total COGS',
    isSubtotal: true,
    amount: fromHalalasToDisplay(current.cogsCents),
    comparisonAmount: comparison ? fromHalalasToDisplay(comparison.cogsCents) : '-',
  });

  // Gross Profit
  rows.push({
    id: 'tot-gross',
    code: 'GROSS_PROFIT',
    nameAr: 'مجمل الربح (الهامش الإجمالي)',
    nameEn: 'Gross Profit',
    isHighlight: true,
    amount: fromHalalasToDisplay(current.grossProfitCents),
    comparisonAmount: comparison ? fromHalalasToDisplay(comparison.grossProfitCents) : '-',
  });

  // Group 3: Operating Expenses
  rows.push({ id: 'hdr-opex', code: '50200', nameAr: '--- المصروفات التشغيلية والإدارية ---', nameEn: '--- Operating & Admin Expenses ---', isHeader: true });
  Object.values(current.accountLines)
    .filter((a) => a.type === 'EXPENSE')
    .forEach((a) => {
      const compVal = comparison?.accountLines[a.code]?.amountCents || 0n;
      rows.push({
        id: `acc-${a.code}`,
        code: a.code,
        nameAr: a.nameAr,
        nameEn: a.nameEn,
        amount: fromHalalasToDisplay(a.amountCents),
        comparisonAmount: comparison ? fromHalalasToDisplay(compVal) : '-',
      });
    });
  rows.push({
    id: 'tot-opex',
    code: 'TOTAL_OPEX',
    nameAr: 'إجمالي المصروفات التشغيلية',
    nameEn: 'Total Operating Expenses',
    isSubtotal: true,
    amount: fromHalalasToDisplay(current.opexCents),
    comparisonAmount: comparison ? fromHalalasToDisplay(comparison.opexCents) : '-',
  });

  // Net Profit / Loss
  rows.push({
    id: 'tot-net',
    code: 'NET_INCOME',
    nameAr: 'صافي الربح / (الخسارة)',
    nameEn: 'Net Profit / (Loss)',
    isHighlight: true,
    amount: fromHalalasToDisplay(current.netIncomeCents),
    comparisonAmount: comparison ? fromHalalasToDisplay(comparison.netIncomeCents) : '-',
  });

  return {
    reportType: 'PROFIT_LOSS',
    category: 'FINANCIAL',
    titleAr: 'قائمة الدخل (الأرباح والخسائر)',
    titleEn: 'Profit & Loss Statement',
    generatedAt: new Date().toISOString(),
    parameters: params,
    summaryCards: [
      {
        id: 'pl-rev',
        labelAr: 'إجمالي الإيرادات',
        labelEn: 'Total Revenue',
        value: `${fromHalalasToDisplay(current.revenueCents)} ر.س`,
        variant: 'default',
      },
      {
        id: 'pl-gross',
        labelAr: 'مجمل الربح',
        labelEn: 'Gross Profit',
        value: `${fromHalalasToDisplay(current.grossProfitCents)} ر.س`,
        variant: current.grossProfitCents >= 0n ? 'success' : 'danger',
      },
      {
        id: 'pl-net',
        labelAr: 'صافي الربح للفترة',
        labelEn: 'Net Income',
        value: `${fromHalalasToDisplay(current.netIncomeCents)} ر.س`,
        variant: current.netIncomeCents >= 0n ? 'success' : 'danger',
      },
    ],
    columns: [
      { field: 'code', labelAr: 'الرمز', labelEn: 'Code', align: 'start', type: 'text' },
      { field: 'nameAr', labelAr: 'البند المحاسبي', labelEn: 'Account Line', align: 'start', type: 'text' },
      { field: 'amount', labelAr: 'الفترة الحالية (SAR)', labelEn: 'Current Period (SAR)', align: 'end', type: 'currency' },
      { field: 'comparisonAmount', labelAr: 'فترة المقارنة (SAR)', labelEn: 'Comparison Period (SAR)', align: 'end', type: 'currency' },
    ],
    rows,
    totals: {
      amount: fromHalalasToDisplay(current.netIncomeCents),
    },
    pagination: {
      page: 1,
      pageSize: rows.length || 1,
      totalRows: rows.length,
      totalPages: 1,
    },
    executionTimeMs: Date.now() - start,
  };
}

export function executeBalanceSheet(tenantId: string, params: ReportParameterSchema): ReportResult {
  const start = Date.now();
  const accounts = centralStore.accounts.get(tenantId) || [];
  const allJournals = centralStore.journals.get(tenantId) || [];
  const postedJournals = allJournals.filter((j) => j.status === 'POSTED');

  const asOfDate = params.asOfDate || params.endDate || new Date().toISOString().slice(0, 10);

  let totalAssets = 0n;
  let totalLiabilities = 0n;
  let totalEquity = 0n;
  let currentPeriodNetIncome = 0n;

  const rows: any[] = [];

  // 1. Calculate P&L net income up to asOfDate to compute dynamic retained earnings
  postedJournals.forEach((j) => {
    if (getJournalDate(j) > asOfDate) return;
    (j.lines || []).forEach((l) => {
      const acc = accounts.find((a) => a.id === l.accountId || a.code === l.accountCode);
      if (!acc) return;
      const deb = safeBigInt(l.debitCents);
      const cre = safeBigInt(l.creditCents);
      if (acc.type === 'REVENUE' || acc.code.startsWith('4')) {
        currentPeriodNetIncome += (cre - deb);
      } else if (acc.type === 'EXPENSE' || acc.code.startsWith('5')) {
        currentPeriodNetIncome -= (deb - cre);
      }
    });
  });

  // Calculate balances per balance sheet account
  const accountBalances: Record<string, { code: string; nameAr: string; nameEn: string; type: string; balanceCents: bigint }> = {};

  accounts.forEach((acc) => {
    if (acc.type === 'REVENUE' || acc.type === 'EXPENSE' || acc.code.startsWith('4') || acc.code.startsWith('5')) {
      return; // Handled in retained earnings
    }

    let deb = 0n;
    let cre = 0n;

    postedJournals.forEach((j) => {
      if (getJournalDate(j) > asOfDate) return;
      (j.lines || []).forEach((l) => {
        if (l.accountId === acc.id || l.accountCode === acc.code) {
          deb += safeBigInt(l.debitCents);
          cre += safeBigInt(l.creditCents);
        }
      });
    });

    let bal = 0n;
    if (acc.type === 'ASSET' || acc.code.startsWith('1')) {
      bal = deb - cre;
      totalAssets += bal;
    } else if (acc.type === 'LIABILITY' || acc.code.startsWith('2')) {
      bal = cre - deb;
      totalLiabilities += bal;
    } else if (acc.type === 'EQUITY' || acc.code.startsWith('3')) {
      bal = cre - deb;
      totalEquity += bal;
    }

    if (bal !== 0n) {
      accountBalances[acc.code] = {
        code: acc.code,
        nameAr: acc.nameAr,
        nameEn: acc.nameEn,
        type: acc.type,
        balanceCents: bal,
      };
    }
  });

  // Add Dynamic Retained Earnings to Equity
  totalEquity += currentPeriodNetIncome;

  // Build structured rows
  // Assets section
  rows.push({ id: 'hdr-assets', code: '10000', nameAr: '=== الأصول (الموجودات) ===', nameEn: '=== Total Assets ===', isHeader: true });
  Object.values(accountBalances)
    .filter((a) => a.type === 'ASSET' || a.code.startsWith('1'))
    .forEach((a) => {
      rows.push({
        id: `acc-${a.code}`,
        code: a.code,
        nameAr: a.nameAr,
        nameEn: a.nameEn,
        amount: fromHalalasToDisplay(a.balanceCents),
      });
    });
  rows.push({
    id: 'tot-assets',
    code: 'TOTAL_ASSETS',
    nameAr: 'مجموع الأصول',
    nameEn: 'Total Assets',
    isHighlight: true,
    amount: fromHalalasToDisplay(totalAssets),
  });

  // Liabilities section
  rows.push({ id: 'hdr-liab', code: '20000', nameAr: '=== الالتزامات (المطلوبات) ===', nameEn: '=== Total Liabilities ===', isHeader: true });
  Object.values(accountBalances)
    .filter((a) => a.type === 'LIABILITY' || a.code.startsWith('2'))
    .forEach((a) => {
      rows.push({
        id: `acc-${a.code}`,
        code: a.code,
        nameAr: a.nameAr,
        nameEn: a.nameEn,
        amount: fromHalalasToDisplay(a.balanceCents),
      });
    });
  rows.push({
    id: 'tot-liab',
    code: 'TOTAL_LIABILITIES',
    nameAr: 'مجموع الالتزامات',
    nameEn: 'Total Liabilities',
    isSubtotal: true,
    amount: fromHalalasToDisplay(totalLiabilities),
  });

  // Equity section
  rows.push({ id: 'hdr-eq', code: '30000', nameAr: '=== حقوق الملكية ===', nameEn: '=== Owners Equity ===', isHeader: true });
  Object.values(accountBalances)
    .filter((a) => a.type === 'EQUITY' || a.code.startsWith('3'))
    .forEach((a) => {
      rows.push({
        id: `acc-${a.code}`,
        code: a.code,
        nameAr: a.nameAr,
        nameEn: a.nameEn,
        amount: fromHalalasToDisplay(a.balanceCents),
      });
    });

  // Add line for unclosed net income
  rows.push({
    id: 'acc-retained-earnings',
    code: '30301',
    nameAr: 'صافي أرباح الفترة الجارية (غير المقفلة)',
    nameEn: 'Current Period Net Income (Unclosed)',
    amount: fromHalalasToDisplay(currentPeriodNetIncome),
  });

  rows.push({
    id: 'tot-eq',
    code: 'TOTAL_EQUITY',
    nameAr: 'مجموع حقوق الملكية',
    nameEn: 'Total Equity',
    isSubtotal: true,
    amount: fromHalalasToDisplay(totalEquity),
  });

  // Total Liabilities + Equity
  const totalLiabAndEquity = totalLiabilities + totalEquity;
  const isBalanced = totalAssets === totalLiabAndEquity;
  const discrepancy = totalAssets > totalLiabAndEquity ? totalAssets - totalLiabAndEquity : totalLiabAndEquity - totalAssets;

  rows.push({
    id: 'tot-liab-eq',
    code: 'TOTAL_LIAB_EQUITY',
    nameAr: 'مجموع الالتزامات وحقوق الملكية',
    nameEn: 'Total Liabilities & Equity',
    isHighlight: true,
    amount: fromHalalasToDisplay(totalLiabAndEquity),
  });

  return {
    reportType: 'BALANCE_SHEET',
    category: 'FINANCIAL',
    titleAr: `الميزانية العمومية كما في ${asOfDate}`,
    titleEn: `Balance Sheet As Of ${asOfDate}`,
    generatedAt: new Date().toISOString(),
    parameters: params,
    summaryCards: [
      {
        id: 'bs-balance-status',
        labelAr: 'معادلة الميزانية (الأصول = الخصوم + الملكية)',
        labelEn: 'Balance Equation Check',
        value: isBalanced ? 'متوازنة تماماً (صفر فرق)' : 'غير متوازنة',
        variant: isBalanced ? 'success' : 'danger',
        subtitleAr: `الفارق: ${fromHalalasToDisplay(discrepancy)} ر.س`,
        subtitleEn: `Discrepancy: ${fromHalalasToDisplay(discrepancy)} SAR`,
      },
      {
        id: 'bs-total-assets',
        labelAr: 'إجمالي الأصول',
        labelEn: 'Total Assets',
        value: `${fromHalalasToDisplay(totalAssets)} ر.س`,
        variant: 'default',
      },
      {
        id: 'bs-total-liabilities',
        labelAr: 'إجمالي الالتزامات',
        labelEn: 'Total Liabilities',
        value: `${fromHalalasToDisplay(totalLiabilities)} ر.س`,
        variant: 'default',
      },
      {
        id: 'bs-total-equity',
        labelAr: 'إجمالي حقوق الملكية',
        labelEn: 'Total Equity',
        value: `${fromHalalasToDisplay(totalEquity)} ر.س`,
        variant: 'info',
      },
    ],
    columns: [
      { field: 'code', labelAr: 'رمز الحساب', labelEn: 'Account Code', align: 'start', type: 'text' },
      { field: 'nameAr', labelAr: 'البند المالي', labelEn: 'Financial Item', align: 'start', type: 'text' },
      { field: 'amount', labelAr: 'المبلغ (SAR)', labelEn: 'Amount (SAR)', align: 'end', type: 'currency' },
    ],
    rows,
    totals: {
      amount: fromHalalasToDisplay(totalAssets),
    },
    pagination: {
      page: 1,
      pageSize: rows.length || 1,
      totalRows: rows.length,
      totalPages: 1,
    },
    isBalanced,
    discrepancyHalalas: discrepancy.toString(),
    executionTimeMs: Date.now() - start,
  };
}

export function executeCashFlow(tenantId: string, params: ReportParameterSchema): ReportResult {
  const start = Date.now();
  const accounts = centralStore.accounts.get(tenantId) || [];
  const allJournals = centralStore.journals.get(tenantId) || [];
  const postedJournals = allJournals.filter((j) => j.status === 'POSTED');

  const startDate = params.startDate;
  const endDate = params.endDate;

  // 1. Net Income for the period
  let netIncome = 0n;
  let depreciation = 0n;
  let changeInAR = 0n;
  let changeInInventory = 0n;
  let changeInAP = 0n;
  let changeInVat = 0n;
  let capExPurchases = 0n;
  let ownerCapitalChanges = 0n;

  postedJournals.forEach((j) => {
    const jDate = getJournalDate(j);
    if (startDate && jDate < startDate) return;
    if (endDate && jDate > endDate) return;

    (j.lines || []).forEach((l) => {
      const acc = accounts.find((a) => a.id === l.accountId || a.code === l.accountCode);
      if (!acc) return;
      const deb = safeBigInt(l.debitCents);
      const cre = safeBigInt(l.creditCents);

      // P&L Net income
      if (acc.type === 'REVENUE' || acc.code.startsWith('4')) {
        netIncome += (cre - deb);
      } else if (acc.type === 'EXPENSE' || acc.code.startsWith('5')) {
        netIncome -= (deb - cre);
        if (acc.code.startsWith('505') || acc.nameEn?.toLowerCase().includes('depreciation')) {
          depreciation += (deb - cre);
        }
      }

      // Working capital items
      // AR (Account 10201) - Increase in AR is a cash outflow
      if (acc.code.startsWith('10201') || acc.code === '10201') {
        changeInAR -= (deb - cre);
      }
      // Inventory (Account 10401) - Increase in inventory is cash outflow
      if (acc.code.startsWith('10401') || acc.code === '10401') {
        changeInInventory -= (deb - cre);
      }
      // AP (Account 20101) - Increase in AP is cash inflow
      if (acc.code.startsWith('20101') || acc.code === '20101') {
        changeInAP += (cre - deb);
      }
      // VAT Payable (Account 20301 / 10301)
      if (acc.code.startsWith('20301') || acc.code.startsWith('10301')) {
        changeInVat += (cre - deb);
      }

      // Investing - Fixed Assets (10501)
      if (acc.code.startsWith('10501') || acc.code === '10501') {
        capExPurchases -= (deb - cre);
      }

      // Financing - Capital (30101)
      if (acc.code.startsWith('30101') || acc.code === '30101') {
        ownerCapitalChanges += (cre - deb);
      }
    });
  });

  const cashFromOps = netIncome + depreciation + changeInAR + changeInInventory + changeInAP + changeInVat;
  const cashFromInvesting = capExPurchases;
  const cashFromFinancing = ownerCapitalChanges;
  const netChangeInCash = cashFromOps + cashFromInvesting + cashFromFinancing;

  const rows = [
    { id: 'cf-sec1', section: 'الأنشطة التشغيلية', labelAr: 'صافي الدخل / (الخسارة) للفترة', labelEn: 'Net Income', amount: fromHalalasToDisplay(netIncome) },
    { id: 'cf-dep', section: 'الأنشطة التشغيلية', labelAr: 'إهلاك الأصول الثابتة (بند غير نقدي)', labelEn: 'Depreciation Expense (Non-Cash)', amount: fromHalalasToDisplay(depreciation) },
    { id: 'cf-ar', section: 'التغير في رأس المال العامل', labelAr: 'التغير في الذمم المدينة (العملاء)', labelEn: 'Change in Accounts Receivable', amount: fromHalalasToDisplay(changeInAR) },
    { id: 'cf-inv', section: 'التغير في رأس المال العامل', labelAr: 'التغير في المخزون السلعي', labelEn: 'Change in Merchandise Inventory', amount: fromHalalasToDisplay(changeInInventory) },
    { id: 'cf-ap', section: 'التغير في رأس المال العامل', labelAr: 'التغير في الذمم الدائنة (الموردين)', labelEn: 'Change in Accounts Payable', amount: fromHalalasToDisplay(changeInAP) },
    { id: 'cf-vat', section: 'التغير في رأس المال العامل', labelAr: 'التغير في مستحقات ضريبة القيمة المضافة', labelEn: 'Change in VAT Payable/Receivable', amount: fromHalalasToDisplay(changeInVat) },
    { id: 'cf-tot-ops', section: 'الأنشطة التشغيلية', labelAr: 'صافي التدفقات النقدية من الأنشطة التشغيلية', labelEn: 'Net Cash from Operating Activities', isHighlight: true, amount: fromHalalasToDisplay(cashFromOps) },
    { id: 'cf-invest', section: 'الأنشطة الاستثمارية', labelAr: 'الإضافات الرأسمالية للأصول الثابتة', labelEn: 'Capital Expenditures (Fixed Assets)', amount: fromHalalasToDisplay(cashFromInvesting) },
    { id: 'cf-tot-invest', section: 'الأنشطة الاستثمارية', labelAr: 'صافي التدفقات النقدية من الأنشطة الاستثمارية', labelEn: 'Net Cash from Investing Activities', isHighlight: true, amount: fromHalalasToDisplay(cashFromInvesting) },
    { id: 'cf-fin', section: 'الأنشطة التمويلية', labelAr: 'التغير في رأس المال والتمويل', labelEn: 'Capital Injections / Financing', amount: fromHalalasToDisplay(cashFromFinancing) },
    { id: 'cf-tot-fin', section: 'الأنشطة التمويلية', labelAr: 'صافي التدفقات النقدية من الأنشطة التمويلية', labelEn: 'Net Cash from Financing Activities', isHighlight: true, amount: fromHalalasToDisplay(cashFromFinancing) },
    { id: 'cf-net-change', section: 'المحصلة', labelAr: 'صافي التغير في النقدية وما في حكمها', labelEn: 'Net Change in Cash & Cash Equivalents', isHighlight: true, amount: fromHalalasToDisplay(netChangeInCash) },
  ];

  return {
    reportType: 'CASH_FLOW',
    category: 'FINANCIAL',
    titleAr: 'قائمة التدفقات النقدية (الطريقة غير المباشرة)',
    titleEn: 'Cash Flow Statement (Indirect Method)',
    generatedAt: new Date().toISOString(),
    parameters: params,
    summaryCards: [
      {
        id: 'cf-ops',
        labelAr: 'التدفقات التشغيلية',
        labelEn: 'Operating Cash Flow',
        value: `${fromHalalasToDisplay(cashFromOps)} ر.س`,
        variant: cashFromOps >= 0n ? 'success' : 'danger',
      },
      {
        id: 'cf-investing',
        labelAr: 'التدفقات الاستثمارية',
        labelEn: 'Investing Cash Flow',
        value: `${fromHalalasToDisplay(cashFromInvesting)} ر.س`,
        variant: 'default',
      },
      {
        id: 'cf-net',
        labelAr: 'صافي التغير في النقدية',
        labelEn: 'Net Cash Flow',
        value: `${fromHalalasToDisplay(netChangeInCash)} ر.س`,
        variant: netChangeInCash >= 0n ? 'info' : 'warning',
      },
    ],
    columns: [
      { field: 'section', labelAr: 'القسم', labelEn: 'Section', align: 'start', type: 'text' },
      { field: 'labelAr', labelAr: 'البند النقدي', labelEn: 'Cash Flow Item', align: 'start', type: 'text' },
      { field: 'amount', labelAr: 'القيمة (SAR)', labelEn: 'Amount (SAR)', align: 'end', type: 'currency' },
    ],
    rows,
    totals: {
      amount: fromHalalasToDisplay(netChangeInCash),
    },
    pagination: {
      page: 1,
      pageSize: rows.length,
      totalRows: rows.length,
      totalPages: 1,
    },
    executionTimeMs: Date.now() - start,
  };
}

export function executeJournalReport(tenantId: string, params: ReportParameterSchema): ReportResult {
  const start = Date.now();
  const allJournals = centralStore.journals.get(tenantId) || [];

  let filtered = allJournals.filter((j) => {
    const jDate = getJournalDate(j);
    if (params.startDate && jDate < params.startDate) return false;
    if (params.endDate && jDate > params.endDate) return false;
    return true;
  });

  const rows = filtered.map((j) => {
    const deb = safeBigInt(j.totalDebitCents);
    const cre = safeBigInt(j.totalCreditCents);
    const isBalanced = deb === cre;
    const jDate = getJournalDate(j);

    return {
      id: j.id,
      date: jDate,
      journalNumber: getJournalNumber(j),
      sourceType: j.sourceType || 'MANUAL',
      sourceNumber: getJournalSourceNumber(j),
      description: getJournalDesc(j),
      totalDebit: fromHalalasToDisplay(deb),
      totalCredit: fromHalalasToDisplay(cre),
      linesCount: j.lines?.length || 0,
      status: j.status,
      isBalanced,
      sourceDocument: {
        type: (j.sourceType as any) || 'JOURNAL',
        id: j.sourceId || j.id,
        number: getJournalSourceNumber(j),
        date: jDate,
      },
    };
  });

  const totalDebits = rows.reduce((sum, r) => sum + safeBigInt(allJournals.find((j) => j.id === r.id)?.totalDebitCents), 0n);
  const totalCredits = rows.reduce((sum, r) => sum + safeBigInt(allJournals.find((j) => j.id === r.id)?.totalCreditCents), 0n);

  return {
    reportType: 'JOURNAL_REPORT',
    category: 'FINANCIAL',
    titleAr: 'سجل القيود اليومية وتحليل المصادر',
    titleEn: 'Journal Entries & Source Breakdown Report',
    generatedAt: new Date().toISOString(),
    parameters: params,
    summaryCards: [
      {
        id: 'jr-count',
        labelAr: 'عدد القيود المصدرة',
        labelEn: 'Total Journals Count',
        value: `${rows.length} قيد`,
        variant: 'default',
      },
      {
        id: 'jr-debits',
        labelAr: 'إجمالي القيود المدينة',
        labelEn: 'Total Debit Volume',
        value: `${fromHalalasToDisplay(totalDebits)} ر.س`,
        variant: 'default',
      },
      {
        id: 'jr-credits',
        labelAr: 'إجمالي القيود الدائنة',
        labelEn: 'Total Credit Volume',
        value: `${fromHalalasToDisplay(totalCredits)} ر.س`,
        variant: 'default',
      },
    ],
    columns: [
      { field: 'date', labelAr: 'التاريخ', labelEn: 'Date', align: 'start', type: 'date' },
      { field: 'journalNumber', labelAr: 'رقم القيد', labelEn: 'Journal #', align: 'start', type: 'link' },
      { field: 'sourceType', labelAr: 'نوع المصدر', labelEn: 'Source Type', align: 'center', type: 'badge' },
      { field: 'sourceNumber', labelAr: 'رقم الوثيقة الأصلية', labelEn: 'Source Doc #', align: 'start', type: 'text' },
      { field: 'description', labelAr: 'البيان', labelEn: 'Description', align: 'start', type: 'text' },
      { field: 'totalDebit', labelAr: 'إجمالي المدين (SAR)', labelEn: 'Total Debit (SAR)', align: 'end', type: 'currency' },
      { field: 'totalCredit', labelAr: 'إجمالي الدائن (SAR)', labelEn: 'Total Credit (SAR)', align: 'end', type: 'currency' },
      { field: 'status', labelAr: 'الحالة', labelEn: 'Status', align: 'center', type: 'badge' },
    ],
    rows,
    totals: {
      totalDebit: fromHalalasToDisplay(totalDebits),
      totalCredit: fromHalalasToDisplay(totalCredits),
    },
    pagination: {
      page: 1,
      pageSize: rows.length || 1,
      totalRows: rows.length,
      totalPages: 1,
    },
    isBalanced: totalDebits === totalCredits,
    executionTimeMs: Date.now() - start,
  };
}

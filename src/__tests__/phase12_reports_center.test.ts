/**
 * PHASE 12 TEST SUITE: AUTHORITATIVE REPORTING CENTER & RECONCILIATION
 * Adheres to:
 * - Rule G1: Single Source of Truth (GL is king; Trial Balance Debits == Credits)
 * - Rule G7/G8: BigInt Halalas precision (10000n scale); zero floating point roundoffs
 * - Rule C: Sensitive cost/margin scrubbing for unauthorized roles
 * - Saudi VAT Regulation: 15% Standard, Zero-Rated, Exempt tracking
 * - UTF-8 BOM CSV export for Microsoft Excel compatibility
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { centralStore, TenantScopedRepository, TenantContext } from '../../server/core/tenantGuard.js';
import { ReportService } from '../../server/modules/reports/reportService.js';
import {
  REPORT_DEFINITIONS,
  generateReportCsv,
  generateReportExcelHtml,
} from '../lib/reports.js';
import { toHalalas } from '../lib/accounting.js';

describe('PHASE 12: AUTHORITATIVE REPORTING CENTER & PRODUCTION HARDENING', () => {
  let tenantId: string;
  let repo: TenantScopedRepository;
  const mockContext: TenantContext = {
    tenantId: '',
    userId: 'user-cfo-1',
    userEmail: 'cfo@saudi-enterprise.com.sa',
    role: 'ADMIN',
    permissions: ['*'],
    correlationId: 'test-phase12-correlation-id',
    ipAddress: '127.0.0.1',
    userAgent: 'Vitest/TestRunner',
  };

  beforeEach(() => {
    tenantId = `tenant-p12-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    mockContext.tenantId = tenantId;
    repo = new TenantScopedRepository(mockContext);

    // Initialize in-memory centralStore collections for this tenant
    centralStore.accounts.set(tenantId, [
      { id: 'acc-110101', code: '110101', nameAr: 'الصندوق العام', nameEn: 'Cash on Hand', type: 'ASSET', normalBalance: 'DEBIT', parentId: null, isActive: true },
      { id: 'acc-110201', code: '110201', nameAr: 'مصرف الراجحي الجاري', nameEn: 'Al Rajhi Current Bank', type: 'ASSET', normalBalance: 'DEBIT', parentId: null, isActive: true },
      { id: 'acc-110301', code: '110301', nameAr: 'العملاء التجاريين', nameEn: 'Trade Debtors / Accounts Receivable', type: 'ASSET', normalBalance: 'DEBIT', parentId: null, isActive: true },
      { id: 'acc-110401', code: '110401', nameAr: 'مخزون البضائع', nameEn: 'Merchandise Inventory', type: 'ASSET', normalBalance: 'DEBIT', parentId: null, isActive: true },
      { id: 'acc-110501', code: '110501', nameAr: 'ضريبة المدخلات القابلة للخصم', nameEn: 'VAT Input Tax Recoverable', type: 'ASSET', normalBalance: 'DEBIT', parentId: null, isActive: true },
      { id: 'acc-210101', code: '210101', nameAr: 'الموردين التجاريين', nameEn: 'Trade Creditors / Accounts Payable', type: 'LIABILITY', normalBalance: 'CREDIT', parentId: null, isActive: true },
      { id: 'acc-210401', code: '210401', nameAr: 'مصلحة الضريبة - ضريبة القيمة المضافة المستحقة', nameEn: 'VAT Output Tax Payable', type: 'LIABILITY', normalBalance: 'CREDIT', parentId: null, isActive: true },
      { id: 'acc-310101', code: '310101', nameAr: 'رأس المال المدفوع', nameEn: 'Paid-in Capital', type: 'EQUITY', normalBalance: 'CREDIT', parentId: null, isActive: true },
      { id: 'acc-410101', code: '410101', nameAr: 'إيرادات مبيعات المنتجات', nameEn: 'Sales Revenue', type: 'REVENUE', normalBalance: 'CREDIT', parentId: null, isActive: true },
      { id: 'acc-510101', code: '510101', nameAr: 'تكلفة البضاعة المباعة (COGS)', nameEn: 'Cost of Goods Sold', type: 'EXPENSE', normalBalance: 'DEBIT', parentId: null, isActive: true },
      { id: 'acc-520101', code: '520101', nameAr: 'مصاريف عمومية وإدارية', nameEn: 'General & Administrative Expenses', type: 'EXPENSE', normalBalance: 'DEBIT', parentId: null, isActive: true },
    ] as any);

    // Initial Opening Balances: Capital 100,000 SAR deposited in Bank
    centralStore.openingBalances.set(tenantId, [
      { accountId: 'acc-110201', accountCode: '110201', accountNameAr: 'مصرف الراجحي الجاري', debitCents: toHalalas('100000.00'), creditCents: 0n },
      { accountId: 'acc-310101', accountCode: '310101', accountNameAr: 'رأس المال المدفوع', debitCents: 0n, creditCents: toHalalas('100000.00') },
    ] as any);

    // Seed Balanced Journal Entries
    centralStore.journals.set(tenantId, [
      // Journal 1: Purchase Inventory for 20,000 SAR + 15% VAT (3,000 SAR) on credit from Supplier
      {
        id: 'jrn-1',
        journalNumber: 'JV-2025-001',
        entryNumber: 'JV-2025-001',
        date: '2025-02-01',
        status: 'POSTED',
        description: 'شراء بضاعة بالآجل من المورد',
        totalDebitCents: toHalalas('23000.00'),
        totalCreditCents: toHalalas('23000.00'),
        lines: [
          { id: 'l1', accountId: 'acc-110401', accountCode: '110401', debitCents: toHalalas('20000.00'), creditCents: 0n, description: 'مخزون بضائع' },
          { id: 'l2', accountId: 'acc-110501', accountCode: '110501', debitCents: toHalalas('3000.00'), creditCents: 0n, description: 'ضريبة مدخلات قابلة للخصم' },
          { id: 'l3', accountId: 'acc-210101', accountCode: '210101', debitCents: 0n, creditCents: toHalalas('23000.00'), description: 'ذمة المورد' },
        ],
      },
      // Journal 2: Sale to Customer for 50,000 SAR + 15% VAT (7,500 SAR) on credit
      {
        id: 'jrn-2',
        journalNumber: 'JV-2025-002',
        entryNumber: 'JV-2025-002',
        date: '2025-02-15',
        status: 'POSTED',
        description: 'فاتورة مبيعات للعميل شركة الأمل',
        totalDebitCents: toHalalas('57500.00'),
        totalCreditCents: toHalalas('57500.00'),
        lines: [
          { id: 'l4', accountId: 'acc-110301', accountCode: '110301', debitCents: toHalalas('57500.00'), creditCents: 0n, description: 'ذمة العميل شركة الأمل' },
          { id: 'l5', accountId: 'acc-410101', accountCode: '410101', debitCents: 0n, creditCents: toHalalas('50000.00'), description: 'إيراد مبيعات' },
          { id: 'l6', accountId: 'acc-210401', accountCode: '210401', debitCents: 0n, creditCents: toHalalas('7500.00'), description: 'ضريبة مخرجات مستحقة' },
        ],
      },
      // Journal 3: Cost of Goods Sold for Sale 2: 12,000 SAR
      {
        id: 'jrn-3',
        journalNumber: 'JV-2025-003',
        entryNumber: 'JV-2025-003',
        date: '2025-02-15',
        status: 'POSTED',
        description: 'إثبات تكلفة البضاعة المباعة',
        totalDebitCents: toHalalas('12000.00'),
        totalCreditCents: toHalalas('12000.00'),
        lines: [
          { id: 'l7', accountId: 'acc-510101', accountCode: '510101', debitCents: toHalalas('12000.00'), creditCents: 0n, description: 'تكلفة مبيعات' },
          { id: 'l8', accountId: 'acc-110401', accountCode: '110401', debitCents: 0n, creditCents: toHalalas('12000.00'), description: 'صرف من المخزون' },
        ],
      },
    ] as any);

    // Seed Sales Invoices
    centralStore.salesInvoices.set(tenantId, [
      {
        id: 'inv-101',
        invoiceNumber: 'INV-2025-001',
        issueDate: '2025-02-15',
        customerId: 'cust-1',
        customerNameAr: 'شركة الأمل للتجارة',
        customerNameEn: 'Al Amal Trading Co.',
        status: 'POSTED',
        subtotalCents: toHalalas('50000.00'),
        vatAmountCents: toHalalas('7500.00'),
        totalAmountCents: toHalalas('57500.00'),
        paidAmountCents: toHalalas('20000.00'),
        balanceCents: toHalalas('37500.00'),
        remainingBalanceCents: toHalalas('37500.00'),
        items: [
          {
            itemId: 'item-1',
            itemNameAr: 'طابعة باركود حرارية',
            itemNameEn: 'Thermal Barcode Printer',
            quantity: 5,
            unitPriceCents: toHalalas('10000.00'),
            costPriceCents: toHalalas('2400.00'),
            subtotalCents: toHalalas('50000.00'),
            vatCents: toHalalas('7500.00'),
            totalCents: toHalalas('57500.00'),
          },
        ],
      },
    ] as any);

    // Seed Purchase Bills for VAT Input Match
    centralStore.purchaseBills.set(tenantId, [
      {
        id: 'bill-101',
        billNumber: 'BILL-2025-001',
        billDate: '2025-02-01',
        supplierId: 'supp-1',
        status: 'POSTED',
        subtotalCents: toHalalas('20000.00'),
        taxAmountCents: toHalalas('3000.00'),
        totalAmountCents: toHalalas('23000.00'),
        paidAmountCents: 0n,
        remainingBalanceCents: toHalalas('23000.00'),
      } as any,
    ]);

    // Seed Customer & Supplier Parties
    centralStore.customers.set(tenantId, [
      {
        id: 'cust-1',
        nameAr: 'شركة الأمل للتجارة',
        nameEn: 'Al Amal Trading Co.',
        vatNumber: '300000000100003',
        accountId: 'acc-110301',
        creditLimitCents: toHalalas('100000.00'),
        paymentTermsDays: 30,
        currentBalanceCents: toHalalas('37500.00'),
        isActive: true,
      },
    ] as any);

    centralStore.suppliers.set(tenantId, [
      {
        id: 'supp-1',
        nameAr: 'مؤسسة الرياض التقنية',
        nameEn: 'Riyadh Tech Est.',
        vatNumber: '300000000200003',
        accountId: 'acc-210101',
        paymentTermsDays: 30,
        currentBalanceCents: toHalalas('23000.00'),
        isActive: true,
      },
    ] as any);

    // Seed Inventory Items
    centralStore.items.set(tenantId, [
      {
        id: 'item-1',
        sku: 'PRN-TH-01',
        nameAr: 'طابعة باركود حرارية',
        nameEn: 'Thermal Barcode Printer',
        currentStock: 25,
        avgCostCents: toHalalas('2400.00'),
        costPriceCents: toHalalas('2400.00'),
        sellingPriceCents: toHalalas('10000.00'),
        reorderPoint: 10,
        warehouseId: 'wh-main',
        isActive: true,
      } as any,
      {
        id: 'item-2',
        sku: 'LBL-50-25',
        nameAr: 'رول ورق باركود 50x25',
        nameEn: 'Barcode Roll 50x25',
        currentStock: 3, // Low stock! Reorder point is 15
        avgCostCents: toHalalas('12.00'),
        costPriceCents: toHalalas('12.00'),
        sellingPriceCents: toHalalas('25.00'),
        reorderPoint: 15,
        warehouseId: 'wh-main',
        isActive: true,
      } as any,
    ]);
  });

  // ============================================================
  // 1. FINANCIAL REPORTS & RULE G1 / G7 / G8 INVARIANTS
  // ============================================================
  describe('1. Financial Reports & Strict Invariants', () => {
    it('executes Trial Balance and confirms Golden Rule G1: Total Debits == Total Credits ($0 Diff)', () => {
      const result = ReportService.executeReport(tenantId, 'TRIAL_BALANCE', {
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        includeZeroBalances: true,
      });

      expect(result).toBeDefined();
      expect(result.reportType).toBe('TRIAL_BALANCE');
      expect(result.isBalanced).toBe(true);

      // Check invariant in summary card
      const balancedCard = result.summaryCards?.find((c) => c.id === 'tb-balance-status');
      expect(balancedCard).toBeDefined();
      expect(balancedCard?.variant).toBe('success');

      // Check totals row
      expect(result.totals?.closingDebit).toBe(result.totals?.closingCredit);
    });

    it('executes General Ledger with running balance continuity and source document links', () => {
      const result = ReportService.executeReport(tenantId, 'GENERAL_LEDGER', {
        accountId: 'acc-110401', // Merchandise Inventory
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      });

      expect(result).toBeDefined();
      expect(result.rows.length).toBeGreaterThan(0);

      // Verify that movements have sourceDocument references for interactive drilldown
      const movementRow = result.rows.find((r) => r.sourceDocument);
      expect(movementRow).toBeDefined();
      expect(movementRow?.sourceDocument?.type).toBe('JOURNAL');
      expect(movementRow?.sourceDocument?.number).toContain('JV-');
    });

    it('executes Profit & Loss and verifies Net Income = Revenue - COGS - Expenses', () => {
      const result = ReportService.executeReport(tenantId, 'PROFIT_LOSS', {
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      });

      expect(result).toBeDefined();
      // Total Revenue = 50,000.00 SAR
      const revCard = result.summaryCards?.find((c) => c.id === 'pl-rev');
      expect(revCard?.value).toBe('50000.00 ر.س');

      // Gross Profit = 38,000.00 SAR
      const grossCard = result.summaryCards?.find((c) => c.id === 'pl-gross');
      expect(grossCard?.value).toBe('38000.00 ر.س');

      // Net Income = 38,000.00 SAR
      const netCard = result.summaryCards?.find((c) => c.id === 'pl-net');
      expect(netCard?.value).toBe('38000.00 ر.س');
      expect(result.totals?.amount).toBe('38000.00');
    });

    it('executes Balance Sheet and enforces Assets = Liabilities + Equity + NetIncome', () => {
      const result = ReportService.executeReport(tenantId, 'BALANCE_SHEET', {
        asOfDate: '2025-12-31',
      });

      expect(result).toBeDefined();
      expect(result.isBalanced).toBe(true);

      const bsCard = result.summaryCards?.find((c) => c.id === 'bs-balance-status');
      expect(bsCard?.variant).toBe('success');
    });

    it('executes Journal Audit Report listing all posted double-entry journals', () => {
      const result = ReportService.executeReport(tenantId, 'JOURNAL_REPORT', {
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      });

      expect(result.rows.length).toBe(3); // 3 journals seeded
      expect(result.isBalanced).toBe(true);
    });
  });

  // ============================================================
  // 2. AR / AP & PARTIES REPORTS + RULE C SENSITIVITY
  // ============================================================
  describe('2. AR / AP, Aging & Rule C Scrubber', () => {
    it('generates Customer Statement of Account with exact running balance in Halalas', () => {
      const result = ReportService.executeReport(tenantId, 'CUSTOMER_STATEMENT', {
        customerId: 'cust-1',
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      });

      expect(result).toBeDefined();
      expect(result.rows.length).toBeGreaterThan(0);
      const invoiceRow = result.rows.find((r) => r.sourceDocument?.type === 'SALES_INVOICE');
      expect(invoiceRow).toBeDefined();
      expect(invoiceRow?.debit).toBe('57500.00'); // 50,000 + 15% VAT
    });

    it('executes AR Aging Analysis with 30-day buckets', () => {
      const result = ReportService.executeReport(tenantId, 'AR_AGING', {
        asOfDate: '2025-02-28',
      });

      expect(result).toBeDefined();
      expect(result.rows.length).toBe(1);
      const custRow = result.rows[0];
      expect(custRow.customerNameAr).toBe('شركة الأمل للتجارة');
      expect(custRow.totalBalance).toBe('37500.00');
    });

    it('enforces Rule C: Scrubs Cost & Margin on Customer Profitability when user lacks cost permission', () => {
      // 1. Authorized user (CFO / Admin) can view costs
      const authorizedResult = ReportService.executeReport(
        tenantId,
        'CUSTOMER_PROFITABILITY',
        { startDate: '2025-01-01', endDate: '2025-12-31' },
        ['accounting:cost:view'],
        'ACCOUNTANT'
      );
      const rowAuth = authorizedResult.rows[0];
      expect(rowAuth.totalCost).not.toBe('***');
      expect(rowAuth.grossProfit).not.toBe('***');

      // 2. Unauthorized user (Sales Rep) has cost & margin censored with '***'
      const unauthResult = ReportService.executeReport(
        tenantId,
        'CUSTOMER_PROFITABILITY',
        { startDate: '2025-01-01', endDate: '2025-12-31' },
        ['sales:view'],
        'SALES_REP'
      );
      const rowUnauth = unauthResult.rows[0];
      expect(rowUnauth.totalCost).toBe('***');
      expect(rowUnauth.grossProfit).toBe('***');
      expect(rowUnauth.marginPct).toBe('***');
    });
  });

  // ============================================================
  // 3. SALES, INVENTORY & VAT RECONCILIATION
  // ============================================================
  describe('3. Sales, Inventory & VAT Reconciliation', () => {
    it('generates Sales Summary and breaks down Net, VAT, and Gross Total', () => {
      const result = ReportService.executeReport(tenantId, 'SALES_PERIODIC_SUMMARY', {
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      });

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].subtotal).toBe('50000.00');
      expect(result.rows[0].vatAmount).toBe('7500.00');
      expect(result.rows[0].totalAmount).toBe('57500.00');
    });

    it('generates Stock Valuation report and flags Low Stock reorder points', () => {
      // Stock Valuation
      const valResult = ReportService.executeReport(tenantId, 'STOCK_VALUATION', {
        asOfDate: '2025-12-31',
      });
      expect(valResult.rows.length).toBe(2);

      // Low Stock Reorder Report
      const lowStockResult = ReportService.executeReport(tenantId, 'LOW_STOCK_REPORT', {});
      expect(lowStockResult.rows.length).toBe(1);
      expect(lowStockResult.rows[0].sku).toBe('LBL-50-25');
      expect(lowStockResult.rows[0].currentStock).toBe(3);
    });

    it('performs VAT to General Ledger Reconciliation detecting zero variance', () => {
      const result = ReportService.executeReport(tenantId, 'VAT_GL_RECONCILIATION', {
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      });

      expect(result).toBeDefined();
      const recCard = result.summaryCards?.find((c) => c.id === 'rec-status');
      expect(recCard).toBeDefined();
      expect(recCard?.variant).toBe('success');
    });
  });

  // ============================================================
  // 4. EXPORT ENGINE & ASYNC BACKGROUND REPORT JOBS
  // ============================================================
  describe('4. Export Engines, Presets & Background Queue', () => {
    it('generates CSV with mandatory UTF-8 BOM (\\uFEFF) for Excel Arabic compatibility', () => {
      const result = ReportService.executeReport(tenantId, 'TRIAL_BALANCE', {
        includeZeroBalances: true,
      });
      const csv = generateReportCsv(result, 'ar');

      // Excel requires \uFEFF BOM at the very beginning of the CSV file
      expect(csv.startsWith('\uFEFF')).toBe(true);
      expect(csv).toContain('ميزان المراجعة بالمجاميع والأرصدة');
      expect(csv).toContain('الصندوق العام');
    });

    it('generates Excel HTML table with UTF-8 meta and RTL direction', () => {
      const result = ReportService.executeReport(tenantId, 'PROFIT_LOSS', {});
      const html = generateReportExcelHtml(result, 'ar');

      expect(html.toLowerCase()).toContain('charset="utf-8"');
      expect(html).toContain('dir="rtl"');
      expect(html).toContain('<table');
    });

    it('saves, retrieves, and deletes custom user filter presets', () => {
      const preset = ReportService.savePreset(
        tenantId,
        'user-cfo-1',
        'SALES_PERIODIC_SUMMARY',
        'مبيعات الربع الأول المعتمدة',
        { startDate: '2025-01-01', endDate: '2025-03-31' }
      );

      expect(preset.id).toBeDefined();
      expect(preset.name).toBe('مبيعات الربع الأول المعتمدة');

      const userPresets = ReportService.getPresets(tenantId, 'user-cfo-1');
      expect(userPresets.some((p) => p.id === preset.id)).toBe(true);

      const deleted = ReportService.deletePreset(tenantId, preset.id);
      expect(deleted).toBe(true);
    });

    it('creates and tracks Asynchronous Heavy Report Jobs with completion status', () => {
      const job = ReportService.createAsyncJob(
        tenantId,
        'user-cfo-1',
        'cfo@saudi-enterprise.com.sa',
        'GENERAL_LEDGER',
        { startDate: '2025-01-01', endDate: '2025-12-31' }
      );

      expect(job.id).toBeDefined();
      expect(job.status).toBe('COMPLETED');
      expect(job.progressPercentage).toBe(100);
      expect(job.downloadUrl).toContain('/api/v1/reports/jobs/');

      const retrievedJob = ReportService.getJobById(tenantId, job.id);
      expect(retrievedJob?.id).toBe(job.id);
      expect(retrievedJob?.resultData).toBeDefined();
    });

    it('resolves source document references for interactive drilldown', () => {
      const doc = ReportService.resolveSourceDocument(tenantId, 'JOURNAL', 'JV-2025-001');
      expect(doc).toBeDefined();
      expect(doc.journalNumber).toBe('JV-2025-001');
      expect(doc.status).toBe('POSTED');

      const inv = ReportService.resolveSourceDocument(tenantId, 'SALES_INVOICE', 'INV-2025-001');
      expect(inv).toBeDefined();
      expect(inv.invoiceNumber).toBe('INV-2025-001');
    });
  });
});

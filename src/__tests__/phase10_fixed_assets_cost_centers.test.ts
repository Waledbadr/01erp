import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { centralStore, TenantScopedRepository, TenantContext } from '../../server/core/tenantGuard.js';
import {
  calculateMonthlyDepreciation,
  generateDepreciationSchedule,
  calculateDisposalGainOrLoss,
  DEFAULT_ASSET_CATEGORIES,
} from '../lib/fixedAssets.js';
import {
  seedDefaultAssetData,
  getAssetCategoriesService,
  getFixedAssetsService,
  getFixedAssetByIdService,
  registerFixedAssetService,
  previewMonthlyDepreciationService,
  executeMonthlyDepreciationService,
  disposeFixedAssetService,
  getCostCentersService,
  createCostCenterService,
  getCostCenterProfitLossReportService,
} from '../../server/modules/assets/assetService.js';

describe('PHASE 10: FIXED ASSETS & COST CENTERS (Rules G1, G7, G8, ADR-003, ADR-010)', () => {
  let tenantId: string;
  let adminUserId: string;
  let adminEmail: string;
  let context: TenantContext;
  let repo: TenantScopedRepository;

  beforeEach(() => {
    tenantId = `tenant-p10-test-${crypto.randomUUID().slice(0, 8)}`;
    adminUserId = `user-admin-${crypto.randomUUID().slice(0, 8)}`;
    adminEmail = 'cfo@saudi-erp.sa';

    // Initialize tenant in centralStore
    centralStore.createTenant({
      nameAr: 'شركة الابتكار المتقدم للتجارة والمقاولات',
      nameEn: 'Advanced Innovation Trading & Contracting Co.',
      vatNumber: '310000000000003',
      crNumber: '1010000001',
      adminUserId,
    });

    // Override the newly created tenant's ID for our test context
    const tenant = Array.from(centralStore.tenants.values()).pop()!;
    tenantId = tenant.id;

    context = {
      tenantId,
      userId: adminUserId,
      userEmail: adminEmail,
      role: 'OWNER',
      permissions: ['ALL'],
      correlationId: 'test-p10-corr-id',
      ipAddress: '127.0.0.1',
      userAgent: 'Vitest-Test-Agent',
    };

    repo = new TenantScopedRepository(context);
    seedDefaultAssetData(tenantId, adminUserId);
  });

  // ==========================================================================
  // TEST 1: Asset 120,000, 5y life, no residual -> monthly 2,000 exact; 12 months -> accumulated 24,000; book value correct
  // ==========================================================================
  describe('1. Straight-Line Depreciation Formula & Schedule (Test 1)', () => {
    it('calculates monthly depreciation of exactly 2,000 SAR for 120,000 SAR asset with 5y life and 0 residual', () => {
      const purchaseCost = 120000.0;
      const residualValue = 0.0;
      const usefulLifeMonths = 60; // 5 years

      const monthly = calculateMonthlyDepreciation(purchaseCost, residualValue, usefulLifeMonths);
      expect(monthly).toBe(2000.0);
    });

    it('generates accurate 60-month schedule where 12 months accumulated is 24,000 and book value is 96,000', () => {
      const purchaseCost = 120000.0;
      const residualValue = 0.0;
      const usefulLifeMonths = 60;
      const startDate = '2025-01-01';

      const schedule = generateDepreciationSchedule(purchaseCost, residualValue, usefulLifeMonths, startDate);

      expect(schedule.length).toBe(60);

      // Month 1
      expect(schedule[0].periodNumber).toBe(1);
      expect(schedule[0].depreciationAmountSar).toBe(2000.0);
      expect(schedule[0].accumulatedDepreciationSar).toBe(2000.0);
      expect(schedule[0].closingBookValueSar).toBe(118000.0);

      // Month 12
      const month12 = schedule[11];
      expect(month12.periodNumber).toBe(12);
      expect(month12.depreciationAmountSar).toBe(2000.0);
      expect(month12.accumulatedDepreciationSar).toBe(24000.0);
      expect(month12.closingBookValueSar).toBe(96000.0); // Book value correct!

      // Month 60 (End of useful life)
      const month60 = schedule[59];
      expect(month60.periodNumber).toBe(60);
      expect(month60.accumulatedDepreciationSar).toBe(120000.0);
      expect(month60.closingBookValueSar).toBe(0.0); // Completely depreciated
    });

    it('handles residual salvage value correctly (never depreciates below residual)', () => {
      const purchaseCost = 50000.0;
      const residualValue = 5000.0; // Salvage value
      const usefulLifeMonths = 24; // 2 years -> (50,000 - 5,000) / 24 = 45,000 / 24 = 1,875 SAR / month

      const monthly = calculateMonthlyDepreciation(purchaseCost, residualValue, usefulLifeMonths);
      expect(monthly).toBe(1875.0);

      const schedule = generateDepreciationSchedule(purchaseCost, residualValue, usefulLifeMonths, '2025-01-01');
      expect(schedule.length).toBe(24);

      // Final month closing book value must equal residual value exactly
      const finalMonth = schedule[23];
      expect(finalMonth.accumulatedDepreciationSar).toBe(45000.0);
      expect(finalMonth.closingBookValueSar).toBe(5000.0);
    });
  });

  // ==========================================================================
  // TEST 2: Depreciation run journaled per asset; re-run same period idempotent/blocked
  // ==========================================================================
  describe('2. Monthly Depreciation Execution & Idempotency Lock (Test 2)', () => {
    it('executes a balanced double-entry depreciation run journal and updates asset balances', async () => {
      // Find active assets in test tenant
      const initialAssets = getFixedAssetsService(tenantId, adminUserId);
      expect(initialAssets.length).toBeGreaterThan(0);

      const periodKey = '2026-01';
      const preview = previewMonthlyDepreciationService(tenantId, periodKey, adminUserId);
      expect(preview.totalDepreciationSar).toBeGreaterThan(0);
      expect(preview.previewItems.length).toBeGreaterThan(0);

      // Execute depreciation run
      const result = await executeMonthlyDepreciationService(repo, periodKey, adminUserId, adminEmail);
      expect(result.periodKey).toBe(periodKey);
      expect(result.journalNumber).toBeDefined();
      expect(result.totalDepreciationSar).toBe(preview.totalDepreciationSar);

      // Verify posted journal in centralStore
      const journals = centralStore.journals.get(tenantId) || [];
      const postedJournal = journals.find((j) => j.id === result.journalId);
      expect(postedJournal).toBeDefined();
      expect(postedJournal?.status).toBe('POSTED');

      // Rule G1 invariant: Total debits == Total credits exact Halalas
      expect(postedJournal?.totalDebitCents).toBe(postedJournal?.totalCreditCents);
      expect(postedJournal?.totalDebitCents).toBeGreaterThan(0n);

      // Verify asset accumulated depreciation has been updated in the register
      const updatedAssets = getFixedAssetsService(tenantId, adminUserId);
      const updatedAsset1 = updatedAssets.find((a) => a.assetNumber === 'AST-2026-00001')!;
      expect(updatedAsset1.accumulatedDepreciationSar).toBe(26000.0); // was 24,000 + 2,000
      expect(updatedAsset1.bookValueSar).toBe(94000.0); // was 96,000 - 2,000
      expect(updatedAsset1.lastDepreciationPeriod).toBe('2026-01');
    });

    it('strictly blocks duplicate depreciation run for the same period (Idempotency Guard)', async () => {
      const periodKey = '2026-02';

      // First run succeeds
      await executeMonthlyDepreciationService(repo, periodKey, adminUserId, adminEmail);

      // Second run for same period MUST throw error
      await expect(
        executeMonthlyDepreciationService(repo, periodKey, adminUserId, adminEmail)
      ).rejects.toThrow(/يُحظر الترحيل المزدوج لنفس الفترة/);
    });
  });

  // ==========================================================================
  // TEST 3: Sale above book value -> gain journal exact; below -> loss; scrapping -> loss
  // ==========================================================================
  describe('3. Asset Disposal: Sale (Gain/Loss) & Scrapping (Test 3)', () => {
    it('Case A: Sale above book value recognizes capital gain and balanced journal', async () => {
      // Register a dedicated asset: Cost 100,000, Useful life 50 months, 0 residual -> 2,000/mo
      const categories = getAssetCategoriesService(tenantId, adminUserId);
      const asset = await registerFixedAssetService(
        repo,
        {
          nameAr: 'شاحنة توزيع بضائع ميتسوبيشي',
          categoryId: categories[0].id,
          purchaseDate: '2025-01-01',
          purchaseCostSar: 100000.0,
          residualValueSar: 0.0,
          usefulLifeMonths: 50,
          acquisitionType: 'STANDALONE_JOURNAL',
          settlementAccountId: '10102',
        },
        adminUserId,
        adminEmail
      );

      // Simulate accumulated depreciation of 40,000 SAR -> Book Value = 60,000 SAR
      asset.accumulatedDepreciationSar = 40000.0;
      asset.bookValueSar = 60000.0;

      // Dispose via Sale for 75,000 SAR (Proceeds > Book Value: Gain = 15,000 SAR)
      const disposalResult = await disposeFixedAssetService(
        repo,
        asset.id,
        {
          type: 'SALE',
          date: '2026-02-15',
          saleProceedsSar: 75000.0,
          settlementAccountId: '10102',
          buyerName: 'مؤسسة الوفاق لخدمات النقل',
        },
        adminUserId,
        adminEmail
      );

      expect(disposalResult.asset.status).toBe('DISPOSED');
      expect(disposalResult.asset.bookValueSar).toBe(0);
      expect(disposalResult.disposalInfo.gainOrLossSar).toBe(15000.0);
      expect(disposalResult.disposalInfo.gainLossAccountCode).toBe('40301'); // Gain account

      // Check Journal
      const journals = centralStore.journals.get(tenantId) || [];
      const journal = journals.find((j) => j.id === disposalResult.disposalInfo.journalId);
      expect(journal).toBeDefined();
      expect(journal?.totalDebitCents).toBe(journal?.totalCreditCents);

      // Debits: Bank (75,000) + Acc Depr (40,000) = 115,000
      // Credits: Asset Cost (100,000) + Gain (15,000) = 115,000
      expect(journal?.totalDebitCents).toBe(1150000000n);
      expect(journal?.totalCreditCents).toBe(1150000000n);
    });

    it('Case B: Sale below book value recognizes capital loss and balanced journal', async () => {
      const categories = getAssetCategoriesService(tenantId, adminUserId);
      const asset = await registerFixedAssetService(
        repo,
        {
          nameAr: 'معدات ورشة تصنيع',
          categoryId: categories[0].id,
          purchaseDate: '2025-01-01',
          purchaseCostSar: 80000.0,
          residualValueSar: 0.0,
          usefulLifeMonths: 40,
          acquisitionType: 'STANDALONE_JOURNAL',
          settlementAccountId: '10102',
        },
        adminUserId,
        adminEmail
      );

      // Book Value = 80,000 - 30,000 = 50,000 SAR
      asset.accumulatedDepreciationSar = 30000.0;
      asset.bookValueSar = 50000.0;

      // Dispose via Sale for 38,000 SAR (Proceeds < Book Value: Loss = 12,000 SAR)
      const disposalResult = await disposeFixedAssetService(
        repo,
        asset.id,
        {
          type: 'SALE',
          date: '2026-02-20',
          saleProceedsSar: 38000.0,
          settlementAccountId: '10102',
        },
        adminUserId,
        adminEmail
      );

      expect(disposalResult.disposalInfo.gainOrLossSar).toBe(-12000.0);
      expect(disposalResult.disposalInfo.gainLossAccountCode).toBe('50403'); // Loss account

      // Check Journal
      const journals = centralStore.journals.get(tenantId) || [];
      const journal = journals.find((j) => j.id === disposalResult.disposalInfo.journalId);
      expect(journal).toBeDefined();
      expect(journal?.totalDebitCents).toBe(journal?.totalCreditCents);

      // Debits: Bank (38,000) + Acc Depr (30,000) + Loss (12,000) = 80,000
      // Credits: Asset Cost (80,000) = 80,000
      expect(journal?.totalDebitCents).toBe(800000000n);
      expect(journal?.totalCreditCents).toBe(800000000n);
    });

    it('Case C: Scrapping an asset recognizes full book value as loss', async () => {
      const categories = getAssetCategoriesService(tenantId, adminUserId);
      const asset = await registerFixedAssetService(
        repo,
        {
          nameAr: 'أجهزة حاسوب مكتبية تالفة',
          categoryId: categories[1].id,
          purchaseDate: '2024-01-01',
          purchaseCostSar: 20000.0,
          residualValueSar: 0.0,
          usefulLifeMonths: 24,
          acquisitionType: 'STANDALONE_JOURNAL',
          settlementAccountId: '10102',
        },
        adminUserId,
        adminEmail
      );

      // Book value = 20,000 - 15,000 = 5,000 SAR
      asset.accumulatedDepreciationSar = 15000.0;
      asset.bookValueSar = 5000.0;

      // Scrapping -> 0 proceeds, Loss = 5,000 SAR
      const disposalResult = await disposeFixedAssetService(
        repo,
        asset.id,
        {
          type: 'SCRAP',
          date: '2026-02-25',
          reason: 'تلف اللوحة الأم لجميع الأجهزة وخروجها عن الخدمة',
        },
        adminUserId,
        adminEmail
      );

      expect(disposalResult.disposalInfo.type).toBe('SCRAP');
      expect(disposalResult.disposalInfo.saleProceedsSar).toBe(0);
      expect(disposalResult.disposalInfo.gainOrLossSar).toBe(-5000.0);

      // Check Journal
      const journals = centralStore.journals.get(tenantId) || [];
      const journal = journals.find((j) => j.id === disposalResult.disposalInfo.journalId);
      expect(journal).toBeDefined();
      expect(journal?.totalDebitCents).toBe(journal?.totalCreditCents);

      // Debits: Acc Depr (15,000) + Scrap Loss (5,000) = 20,000
      // Credits: Asset Cost (20,000) = 20,000
      expect(journal?.totalDebitCents).toBe(200000000n);
      expect(journal?.totalCreditCents).toBe(200000000n);
    });
  });

  // ==========================================================================
  // TEST 4: Asset linked from purchase flow gets correct acquisition journal
  // ==========================================================================
  describe('4. Acquisition Flow Integration (Test 4)', () => {
    it('posts accurate acquisition journal Dr Fixed Asset Cost / Cr Settlement Account', async () => {
      const categories = getAssetCategoriesService(tenantId, adminUserId);
      const vehicleCategory = categories.find((c) => c.code === 'CAT-VEHICLES')!;

      const assetCost = 95000.0;
      const asset = await registerFixedAssetService(
        repo,
        {
          nameAr: 'سيارة إسعاف ونقل طبي مجهزة',
          nameEn: 'Equipped Medical Transport Vehicle',
          categoryId: vehicleCategory.id,
          purchaseDate: '2026-02-01',
          purchaseCostSar: assetCost,
          residualValueSar: 5000.0,
          usefulLifeMonths: 60,
          acquisitionType: 'STANDALONE_JOURNAL',
          settlementAccountId: '10102', // Al Rajhi Bank
          locationNotes: 'مستودع الأصول الطبية',
        },
        adminUserId,
        adminEmail
      );

      expect(asset.assetNumber).toMatch(/^AST-\d{4}-\d{5}$/);
      expect(asset.acquisitionJournalId).toBeDefined();
      expect(asset.acquisitionJournalNumber).toBeDefined();

      const journals = centralStore.journals.get(tenantId) || [];
      const acqJournal = journals.find((j) => j.id === asset.acquisitionJournalId);
      expect(acqJournal).toBeDefined();

      // Invariant: Dr Fixed Asset (10501) == Cr Bank (10102) == 95,000 SAR
      expect(acqJournal?.totalDebitCents).toBe(BigInt(assetCost * 10000));
      expect(acqJournal?.totalCreditCents).toBe(BigInt(assetCost * 10000));

      const debitLine = acqJournal?.lines.find((l) => l.debitCents > 0n);
      const creditLine = acqJournal?.lines.find((l) => l.creditCents > 0n);
      expect(debitLine?.accountCode).toBe(vehicleCategory.assetAccountCode);
      expect(creditLine?.accountCode).toBe('10102');
    });
  });

  // ==========================================================================
  // TEST 5: Cost center P&L slices sum to company P&L (Property Test)
  // ==========================================================================
  describe('5. Cost Center Profit & Loss Slicing & Reconciliation (Test 5)', () => {
    it('satisfies the property that sum of all cost center net incomes + unallocated === total company net income', async () => {
      // 1. Create 3 distinct Cost Centers
      const ccSales = createCostCenterService(
        tenantId,
        { code: 'CC-SALES', nameAr: 'مركز مبيعات التجزئة والجملة' },
        adminUserId,
        adminEmail
      );
      const ccOps = createCostCenterService(
        tenantId,
        { code: 'CC-OPS', nameAr: 'مركز العمليات والمستودعات' },
        adminUserId,
        adminEmail
      );
      const ccIT = createCostCenterService(
        tenantId,
        { code: 'CC-TECH', nameAr: 'مركز التقنية والحلول السحابية' },
        adminUserId,
        adminEmail
      );

      // 2. Post multi-slice P&L transactions
      // Transaction 1: Sales Center earns 50,000 revenue with 20,000 COGS
      await repo.postJournal({
        companyId: tenantId,
        sourceType: 'MANUAL',
        sourceId: 'TX-P5-01',
        sourceKey: 'TEST_P5_01',
        date: '2026-03-01',
        description: 'إثبات مبيعات وتكلفة مركز المبيعات',
        costCenterId: ccSales.id,
        lines: [
          { accountId: '10102', debit: 50000, credit: 0, costCenterId: ccSales.id },
          { accountId: '40101', debit: 0, credit: 50000, costCenterId: ccSales.id }, // Revenue
          { accountId: '50101', debit: 20000, credit: 0, costCenterId: ccSales.id }, // COGS
          { accountId: '10301', debit: 0, credit: 20000, costCenterId: ccSales.id }, // Inventory
        ],
      });

      // Transaction 2: Operations Center incurs 12,000 operating expense
      await repo.postJournal({
        companyId: tenantId,
        sourceType: 'MANUAL',
        sourceId: 'TX-P5-02',
        sourceKey: 'TEST_P5_02',
        date: '2026-03-05',
        description: 'مصاريف تشغيل ومستودعات',
        costCenterId: ccOps.id,
        lines: [
          { accountId: '50201', debit: 12000, credit: 0, costCenterId: ccOps.id }, // Operating Expense
          { accountId: '10101', debit: 0, credit: 12000, costCenterId: ccOps.id },
        ],
      });

      // Transaction 3: IT Center incurs 6,000 expense
      await repo.postJournal({
        companyId: tenantId,
        sourceType: 'MANUAL',
        sourceId: 'TX-P5-03',
        sourceKey: 'TEST_P5_03',
        date: '2026-03-10',
        description: 'اشتراكات سحابية ورخص برمجيات',
        costCenterId: ccIT.id,
        lines: [
          { accountId: '50201', debit: 6000, credit: 0, costCenterId: ccIT.id },
          { accountId: '10102', debit: 0, credit: 6000, costCenterId: ccIT.id },
        ],
      });

      // Transaction 4: General Company Unallocated Overhead (e.g. 5,000 General Expense)
      await repo.postJournal({
        companyId: tenantId,
        sourceType: 'MANUAL',
        sourceId: 'TX-P5-04',
        sourceKey: 'TEST_P5_04',
        date: '2026-03-12',
        description: 'مصاريف عمومية وإدارية غير موزعة',
        lines: [
          { accountId: '50201', debit: 5000, credit: 0 },
          { accountId: '10102', debit: 0, credit: 5000 },
        ],
      });

      // 3. Generate Cost Center P&L Report
      const report = getCostCenterProfitLossReportService(tenantId);

      expect(report.isReconciled).toBe(true);
      expect(report.discrepancySar).toBe(0.0);

      // Verify specific slices
      const salesSlice = report.lines.find((l) => l.costCenterId === ccSales.id)!;
      expect(salesSlice.revenueSar).toBe(50000.0);
      expect(salesSlice.cogsSar).toBe(20000.0);
      expect(salesSlice.netIncomeSar).toBe(30000.0); // 50,000 - 20,000

      const opsSlice = report.lines.find((l) => l.costCenterId === ccOps.id)!;
      expect(opsSlice.operatingExpensesSar).toBe(12000.0);
      expect(opsSlice.netIncomeSar).toBe(-12000.0);

      const itSlice = report.lines.find((l) => l.costCenterId === ccIT.id)!;
      expect(itSlice.operatingExpensesSar).toBe(6000.0);
      expect(itSlice.netIncomeSar).toBe(-6000.0);

      expect(report.unallocated.operatingExpensesSar).toBe(5000.0);
      expect(report.unallocated.netIncomeSar).toBe(-5000.0);

      // Property invariant: Sum of slices == Total Company Net Income
      // 30,000 - 12,000 - 6,000 - 5,000 = +7,000 SAR
      const sumOfSlices = report.lines.reduce((acc, l) => acc + l.netIncomeSar, 0) + report.unallocated.netIncomeSar;
      expect(sumOfSlices).toBe(report.totalCompany.netIncomeSar);
      expect(report.totalCompany.netIncomeSar).toBe(7000.0);
    });
  });
});

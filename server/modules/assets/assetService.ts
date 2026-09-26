/**
 * Fixed Assets & Cost Centers Service — Saudi ERP Backend
 * Enforces Golden Rules G1, G7, G8, ADR-003, ADR-004, and ADR-010.
 */

import crypto from 'crypto';
import { centralStore, TenantScopedRepository, TenantContext, CostCenter } from '../../core/tenantGuard.js';
import { logger } from '../../core/logger.js';
import {
  AssetCategory,
  FixedAsset,
  AssetDisposalInfo,
  MonthlyDepreciationPreviewItem,
  DepreciationRunHistory,
  CostCenterProfitLossReport,
  CostCenterProfitLossLine,
  DEFAULT_ASSET_CATEGORIES,
  calculateMonthlyDepreciation,
  generateDepreciationSchedule,
  calculateDisposalGainOrLoss,
} from '../../../src/lib/fixedAssets.js';
import { roundSar, toHalalas, fromHalalasToDisplay } from '../../../src/lib/accounting.js';
import { registerTenantState } from '../../db/tenantStateRegistry.js';
import { env } from '../../core/env.js';

// In-memory tenant stores
const tenantAssetCategoriesMap = new Map<string, AssetCategory[]>();
registerTenantState('assets.assetService.tenantAssetCategoriesMap', tenantAssetCategoriesMap);
const tenantFixedAssetsMap = new Map<string, FixedAsset[]>();
registerTenantState('assets.assetService.tenantFixedAssetsMap', tenantFixedAssetsMap);
const tenantDepreciationRunsMap = new Map<string, DepreciationRunHistory[]>();

registerTenantState('assets.assetService.tenantDepreciationRunsMap', tenantDepreciationRunsMap);
export function setFixedAssetsForTenant(tenantId: string, assets: FixedAsset[]) {
  tenantFixedAssetsMap.set(tenantId, assets);
}

/**
 * Initializes default asset categories and sample fixed assets for a tenant
 */
export function seedDefaultAssetData(tenantId: string, adminUserId: string) {
  // 1. Categories
  if (!tenantAssetCategoriesMap.has(tenantId)) {
    const categories: AssetCategory[] = DEFAULT_ASSET_CATEGORIES.map((c) => ({
      ...c,
      id: crypto.randomUUID(),
      tenantId,
    }));
    tenantAssetCategoriesMap.set(tenantId, categories);
  }

  // 2. Sample Assets (demo deployments only; a real company starts with no assets)
  if (!env.SEED_DEMO_DATA) {
    if (!tenantFixedAssetsMap.has(tenantId)) tenantFixedAssetsMap.set(tenantId, []);
  } else if (!tenantFixedAssetsMap.has(tenantId)) {
    const categories = tenantAssetCategoriesMap.get(tenantId)!;
    const catVehicle = categories.find((c) => c.code === 'CAT-VEHICLES') || categories[0];
    const catIT = categories.find((c) => c.code === 'CAT-IT') || categories[1];
    const catFurniture = categories.find((c) => c.code === 'CAT-FURNITURE') || categories[2];

    const costCenters = centralStore.costCenters.get(tenantId) || [];
    const defaultCC = costCenters[0];
    const branches = centralStore.branches.get(tenantId) || [];
    const mainBranch = branches[0];

    const sampleAssets: FixedAsset[] = [
      {
        id: crypto.randomUUID(),
        tenantId,
        assetNumber: 'AST-2026-00001',
        nameAr: 'سيارة تويوتا هايلوكس غمارتين - نقل بضائع',
        nameEn: 'Toyota Hilux Double Cab - Goods Transport',
        categoryId: catVehicle.id,
        categoryCode: catVehicle.code,
        categoryNameAr: catVehicle.nameAr,
        categoryNameEn: catVehicle.nameEn,
        purchaseDate: '2025-01-01',
        purchaseCostSar: 120000.0,
        residualValueSar: 0.0,
        usefulLifeMonths: 60, // 5 years -> 2,000 SAR / month
        depreciationMethod: 'STRAIGHT_LINE',
        branchId: mainBranch?.id,
        branchNameAr: mainBranch?.nameAr,
        costCenterId: defaultCC?.id,
        costCenterCode: defaultCC?.code,
        costCenterNameAr: defaultCC?.nameAr,
        locationNotes: 'مواقف الفرع الرئيسي - الرياض',
        status: 'ACTIVE',
        acquisitionType: 'STANDALONE_JOURNAL',
        assetAccountId: catVehicle.assetAccountId,
        assetAccountCode: catVehicle.assetAccountCode,
        accumulatedDepreciationAccountId: catVehicle.accumulatedDepreciationAccountId,
        accumulatedDepreciationAccountCode: catVehicle.accumulatedDepreciationAccountCode,
        depreciationExpenseAccountId: catVehicle.depreciationExpenseAccountId,
        depreciationExpenseAccountCode: catVehicle.depreciationExpenseAccountCode,
        accumulatedDepreciationSar: 24000.0, // 12 months * 2,000
        bookValueSar: 96000.0, // 120,000 - 24,000
        lastDepreciationPeriod: '2025-12',
        attachments: [
          {
            id: crypto.randomUUID(),
            name: 'فاتورة_شراء_سيارة_هايلوكس.pdf',
            type: 'INVOICE',
            size: 245000,
            uploadedAt: '2025-01-01T10:00:00Z',
          },
          {
            id: crypto.randomUUID(),
            name: 'شهادة_الضمان_عبداللطيف_جميل.pdf',
            type: 'WARRANTY',
            size: 180000,
            uploadedAt: '2025-01-01T10:05:00Z',
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        tenantId,
        assetNumber: 'AST-2026-00002',
        nameAr: 'خادم شبكة مركزي Dell PowerEdge R750',
        nameEn: 'Dell PowerEdge R750 Enterprise Server',
        categoryId: catIT.id,
        categoryCode: catIT.code,
        categoryNameAr: catIT.nameAr,
        categoryNameEn: catIT.nameEn,
        purchaseDate: '2025-06-01',
        purchaseCostSar: 36000.0,
        residualValueSar: 0.0,
        usefulLifeMonths: 36, // 3 years -> 1,000 SAR / month
        depreciationMethod: 'STRAIGHT_LINE',
        branchId: mainBranch?.id,
        branchNameAr: mainBranch?.nameAr,
        costCenterId: defaultCC?.id,
        costCenterCode: defaultCC?.code,
        costCenterNameAr: defaultCC?.nameAr,
        locationNotes: 'غرفة الخوادم الرئيسية (Data Center)',
        status: 'ACTIVE',
        acquisitionType: 'PURCHASE_BILL',
        assetAccountId: catIT.assetAccountId,
        assetAccountCode: catIT.assetAccountCode,
        accumulatedDepreciationAccountId: catIT.accumulatedDepreciationAccountId,
        accumulatedDepreciationAccountCode: catIT.accumulatedDepreciationAccountCode,
        depreciationExpenseAccountId: catIT.depreciationExpenseAccountId,
        depreciationExpenseAccountCode: catIT.depreciationExpenseAccountCode,
        accumulatedDepreciationSar: 6000.0, // 6 months * 1,000
        bookValueSar: 30000.0,
        lastDepreciationPeriod: '2025-12',
        attachments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        tenantId,
        assetNumber: 'AST-2026-00003',
        nameAr: 'مجموعة أثاث مكتبي ومحطات عمل للموظفين (10 مكاتب)',
        nameEn: 'Office Furniture & Workstations (10 Desks)',
        categoryId: catFurniture.id,
        categoryCode: catFurniture.code,
        categoryNameAr: catFurniture.nameAr,
        categoryNameEn: catFurniture.nameEn,
        purchaseDate: '2025-03-01',
        purchaseCostSar: 25000.0,
        residualValueSar: 1000.0,
        usefulLifeMonths: 48, // 4 years -> (25000-1000)/48 = 500 SAR / month
        depreciationMethod: 'STRAIGHT_LINE',
        branchId: mainBranch?.id,
        branchNameAr: mainBranch?.nameAr,
        costCenterId: defaultCC?.id,
        costCenterCode: defaultCC?.code,
        costCenterNameAr: defaultCC?.nameAr,
        locationNotes: 'صالة الموظفين المفتوحة',
        status: 'ACTIVE',
        acquisitionType: 'STANDALONE_JOURNAL',
        assetAccountId: catFurniture.assetAccountId,
        assetAccountCode: catFurniture.assetAccountCode,
        accumulatedDepreciationAccountId: catFurniture.accumulatedDepreciationAccountId,
        accumulatedDepreciationAccountCode: catFurniture.accumulatedDepreciationAccountCode,
        depreciationExpenseAccountId: catFurniture.depreciationExpenseAccountId,
        depreciationExpenseAccountCode: catFurniture.depreciationExpenseAccountCode,
        accumulatedDepreciationSar: 5000.0, // 10 months * 500
        bookValueSar: 20000.0,
        lastDepreciationPeriod: '2025-12',
        attachments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    tenantFixedAssetsMap.set(tenantId, sampleAssets);
  }

  // 3. Runs Map
  if (!tenantDepreciationRunsMap.has(tenantId)) {
    tenantDepreciationRunsMap.set(tenantId, []);
  }

  // 4. Also ensure standard Cost Centers are present
  const existingCC = centralStore.costCenters.get(tenantId) || [];
  if (existingCC.length < 3) {
    const defaultCenters: CostCenter[] = [
      {
        id: crypto.randomUUID(),
        tenantId,
        code: 'CC-100',
        nameAr: 'الإدارة العامة والتنفيذية',
        nameEn: 'General & Executive Administration',
        isActive: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        tenantId,
        code: 'CC-200',
        nameAr: 'قسم المبيعات والتسويق',
        nameEn: 'Sales & Marketing Division',
        isActive: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        tenantId,
        code: 'CC-300',
        nameAr: 'قسم العمليات واللوجستيات والمستودعات',
        nameEn: 'Operations & Logistics Division',
        isActive: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        tenantId,
        code: 'CC-400',
        nameAr: 'تقنية المعلومات والتحول الرقمي',
        nameEn: 'IT & Digital Transformation',
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    ];
    centralStore.costCenters.set(tenantId, defaultCenters);
  }
}

/**
 * Concurrency-safe atomic Asset Number sequence generator
 */
export function generateNextAssetNumber(tenantId: string, year: number = new Date().getFullYear()): string {
  const existing = tenantFixedAssetsMap.get(tenantId) || [];
  const nextIdx = existing.length + 1;
  return `AST-${year}-${String(nextIdx).padStart(5, '0')}`;
}

// ============================================================================
// 1. ASSET CATEGORIES CRUD
// ============================================================================
export function getAssetCategoriesService(tenantId: string, adminUserId: string): AssetCategory[] {
  seedDefaultAssetData(tenantId, adminUserId);
  return tenantAssetCategoriesMap.get(tenantId) || [];
}

export function createAssetCategoryService(
  tenantId: string,
  data: Partial<AssetCategory>,
  adminUserId: string
): AssetCategory {
  seedDefaultAssetData(tenantId, adminUserId);
  const categories = tenantAssetCategoriesMap.get(tenantId)!;

  const newCat: AssetCategory = {
    id: crypto.randomUUID(),
    tenantId,
    code: data.code || `CAT-${categories.length + 1}`,
    nameAr: data.nameAr || 'تصنيف أصول جديد',
    nameEn: data.nameEn || 'New Asset Category',
    assetAccountId: data.assetAccountId || 'acc-10501',
    assetAccountCode: data.assetAccountCode || '10501',
    accumulatedDepreciationAccountId: data.accumulatedDepreciationAccountId || 'acc-10502',
    accumulatedDepreciationAccountCode: data.accumulatedDepreciationAccountCode || '10502',
    depreciationExpenseAccountId: data.depreciationExpenseAccountId || 'acc-50501',
    depreciationExpenseAccountCode: data.depreciationExpenseAccountCode || '50501',
    defaultUsefulLifeMonths: Number(data.defaultUsefulLifeMonths) || 60,
    defaultResidualValuePercentage: Number(data.defaultResidualValuePercentage) || 0,
    isActive: data.isActive !== false,
  };

  categories.push(newCat);
  return newCat;
}

// ============================================================================
// 2. FIXED ASSETS REGISTER CRUD & DETAILS
// ============================================================================
export function getFixedAssetsService(
  tenantId: string,
  adminUserId: string,
  filters?: {
    status?: string;
    categoryId?: string;
    costCenterId?: string;
    branchId?: string;
    search?: string;
  }
): FixedAsset[] {
  seedDefaultAssetData(tenantId, adminUserId);
  let assets = tenantFixedAssetsMap.get(tenantId) || [];

  if (filters?.status && filters.status !== 'ALL') {
    assets = assets.filter((a) => a.status === filters.status);
  }
  if (filters?.categoryId && filters.categoryId !== 'ALL') {
    assets = assets.filter((a) => a.categoryId === filters.categoryId);
  }
  if (filters?.costCenterId && filters.costCenterId !== 'ALL') {
    assets = assets.filter((a) => a.costCenterId === filters.costCenterId);
  }
  if (filters?.branchId && filters.branchId !== 'ALL') {
    assets = assets.filter((a) => a.branchId === filters.branchId);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    assets = assets.filter(
      (a) =>
        a.assetNumber.toLowerCase().includes(q) ||
        a.nameAr.toLowerCase().includes(q) ||
        a.nameEn.toLowerCase().includes(q) ||
        (a.locationNotes && a.locationNotes.toLowerCase().includes(q))
    );
  }

  return assets;
}

export function getFixedAssetByIdService(
  tenantId: string,
  assetId: string,
  adminUserId: string
): {
  asset: FixedAsset;
  schedule: ReturnType<typeof generateDepreciationSchedule>;
} | null {
  seedDefaultAssetData(tenantId, adminUserId);
  const assets = tenantFixedAssetsMap.get(tenantId) || [];
  const asset = assets.find((a) => a.id === assetId);
  if (!asset) return null;

  // Build posted periods set
  const postedPeriods = new Set<string>();
  const runs = tenantDepreciationRunsMap.get(tenantId) || [];
  runs.forEach((r) => {
    if (r.assetDetails.some((d) => d.assetId === asset.id)) {
      postedPeriods.add(r.periodKey);
    }
  });

  const schedule = generateDepreciationSchedule(
    asset.purchaseCostSar,
    asset.residualValueSar,
    asset.usefulLifeMonths,
    asset.purchaseDate,
    postedPeriods
  );

  return { asset, schedule };
}

/**
 * Registers an asset with acquisition journal (Rule G1).
 * Supports standalone acquisition journal:
 * Dr Asset Account (Cost)
 * Cr Settlement Account (Bank / Cash / AP)
 */
export async function registerFixedAssetService(
  repo: TenantScopedRepository,
  data: {
    nameAr: string;
    nameEn?: string;
    categoryId: string;
    purchaseDate: string;
    purchaseCostSar: number;
    residualValueSar?: number;
    usefulLifeMonths: number;
    branchId?: string;
    costCenterId?: string;
    locationNotes?: string;
    acquisitionType?: 'STANDALONE_JOURNAL' | 'PURCHASE_BILL' | 'EXPENSE_VOUCHER' | 'OPENING_BALANCE';
    settlementAccountId?: string; // 10101, 10102, 20101
    acquisitionReferenceId?: string;
    attachments?: Array<{ name: string; type: 'INVOICE' | 'WARRANTY' | 'CONTRACT' | 'OTHER'; url?: string; size?: number }>;
  },
  userId: string,
  userEmail: string
): Promise<FixedAsset> {
  seedDefaultAssetData(repo.tenantId, userId);
  const categories = tenantAssetCategoriesMap.get(repo.tenantId)!;
  const category = categories.find((c) => c.id === data.categoryId) || categories[0];
  if (!category) {
    throw new Error('تصنيف الأصل غير صحيح أو غير موجود');
  }

  const cost = roundSar(Number(data.purchaseCostSar));
  if (cost <= 0) {
    throw new Error('تكلفة شراء الأصل يجب أن تكون أكبر من الصفر');
  }

  const residual = roundSar(Number(data.residualValueSar || 0));
  if (residual < 0 || residual >= cost) {
    throw new Error('قيمة الخردة / القيمة المتبقية غير صحيحة (يجب أن تكون أقل من تكلفة الشراء)');
  }

  const usefulLife = Number(data.usefulLifeMonths);
  if (usefulLife <= 0) {
    throw new Error('العمر الإنتاجي بالشهور يجب أن يكون أكبر من الصفر');
  }

  const assetNumber = generateNextAssetNumber(repo.tenantId, new Date(data.purchaseDate).getFullYear() || new Date().getFullYear());
  const assetId = crypto.randomUUID();

  // Resolve branch and cost center names
  const branches = centralStore.branches.get(repo.tenantId) || [];
  const branch = branches.find((b) => b.id === data.branchId) || branches[0];
  const costCenters = centralStore.costCenters.get(repo.tenantId) || [];
  const costCenter = costCenters.find((cc) => cc.id === data.costCenterId);

  let postedJournalId: string | undefined;
  let postedJournalNumber: string | undefined;

  // If standalone acquisition is requested, post double-entry GL acquisition journal
  const acquisitionType = data.acquisitionType || 'STANDALONE_JOURNAL';
  if (acquisitionType === 'STANDALONE_JOURNAL') {
    const settlementAcc = data.settlementAccountId || '10102'; // Default to Operating Bank
    const journal = await repo.postJournal({
      companyId: repo.tenantId,
      branchId: branch?.id,
      sourceType: 'MANUAL',
      sourceId: assetId,
      sourceKey: `ASSET_ACQ:${repo.tenantId}:${assetId}`,
      date: data.purchaseDate,
      description: `شراء وحيازة أصل ثابت: ${data.nameAr} (${assetNumber})`,
      descriptionAr: `شراء وحيازة أصل ثابت: ${data.nameAr} (${assetNumber})`,
      descriptionEn: `Fixed Asset Acquisition: ${data.nameEn || data.nameAr} (${assetNumber})`,
      costCenterId: costCenter?.id,
      lines: [
        {
          accountId: category.assetAccountCode,
          debit: cost,
          credit: 0,
          descriptionAr: `إثبات تكلفة الأصل: ${data.nameAr}`,
          costCenterId: costCenter?.id,
          branchId: branch?.id,
        },
        {
          accountId: settlementAcc,
          debit: 0,
          credit: cost,
          descriptionAr: `سداد قيمة حيازة الأصل: ${data.nameAr}`,
          costCenterId: costCenter?.id,
          branchId: branch?.id,
        },
      ],
    });
    postedJournalId = journal.id;
    postedJournalNumber = journal.entryNumber;
  }

  const newAsset: FixedAsset = {
    id: assetId,
    tenantId: repo.tenantId,
    assetNumber,
    nameAr: data.nameAr,
    nameEn: data.nameEn || data.nameAr,
    categoryId: category.id,
    categoryCode: category.code,
    categoryNameAr: category.nameAr,
    categoryNameEn: category.nameEn,
    purchaseDate: data.purchaseDate,
    purchaseCostSar: cost,
    residualValueSar: residual,
    usefulLifeMonths: usefulLife,
    depreciationMethod: 'STRAIGHT_LINE',
    branchId: branch?.id,
    branchNameAr: branch?.nameAr,
    costCenterId: costCenter?.id,
    costCenterCode: costCenter?.code,
    costCenterNameAr: costCenter?.nameAr,
    locationNotes: data.locationNotes || '',
    status: 'ACTIVE',
    acquisitionType,
    acquisitionReferenceId: data.acquisitionReferenceId,
    acquisitionJournalId: postedJournalId,
    acquisitionJournalNumber: postedJournalNumber,
    assetAccountId: category.assetAccountId,
    assetAccountCode: category.assetAccountCode,
    accumulatedDepreciationAccountId: category.accumulatedDepreciationAccountId,
    accumulatedDepreciationAccountCode: category.accumulatedDepreciationAccountCode,
    depreciationExpenseAccountId: category.depreciationExpenseAccountId,
    depreciationExpenseAccountCode: category.depreciationExpenseAccountCode,
    accumulatedDepreciationSar: 0,
    bookValueSar: cost,
    attachments: (data.attachments || []).map((att) => ({
      ...att,
      id: crypto.randomUUID(),
      uploadedAt: new Date().toISOString(),
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const assets = tenantFixedAssetsMap.get(repo.tenantId)!;
  assets.unshift(newAsset);

  centralStore.recordAuditLog({
    tenantId: repo.tenantId,
    userId,
    userEmail,
    action: 'REGISTER_FIXED_ASSET',
    resourceType: 'fixed_assets',
    resourceId: assetId,
    correlationId: crypto.randomUUID(),
    changesDiff: { assetNumber, nameAr: newAsset.nameAr, cost, residual, usefulLife },
  });

  return newAsset;
}

// ============================================================================
// 3. MONTHLY DEPRECIATION RUN ENGINE (STRAIGHT-LINE)
// ============================================================================
/**
 * Previews the monthly depreciation calculation and journal entries before execution
 */
export function previewMonthlyDepreciationService(
  tenantId: string,
  periodKey: string, // YYYY-MM
  adminUserId: string
): {
  periodKey: string;
  isAlreadyPosted: boolean;
  totalDepreciationSar: number;
  assetsCount: number;
  previewItems: MonthlyDepreciationPreviewItem[];
  previewJournalLines: Array<{
    accountCode: string;
    accountNameAr: string;
    debitSar: number;
    creditSar: number;
    costCenterId?: string;
    costCenterNameAr?: string;
    description: string;
  }>;
} {
  seedDefaultAssetData(tenantId, adminUserId);
  const assets = tenantFixedAssetsMap.get(tenantId) || [];
  const runs = tenantDepreciationRunsMap.get(tenantId) || [];

  const isAlreadyPosted = runs.some((r) => r.periodKey === periodKey);

  const previewItems: MonthlyDepreciationPreviewItem[] = [];
  let grandTotalDepreciation = 0;

  assets.forEach((asset) => {
    // Only active assets that were acquired on or before this period
    if (asset.status !== 'ACTIVE') return;

    // Compare periodKey with purchaseDate
    const purchasePeriodKey = asset.purchaseDate.slice(0, 7);
    if (purchasePeriodKey > periodKey) return; // Not yet acquired in this period

    // Check if asset is already fully depreciated
    const maxDepreciable = roundSar(asset.purchaseCostSar - asset.residualValueSar);
    const remainingToDepreciate = roundSar(maxDepreciable - asset.accumulatedDepreciationSar);
    if (remainingToDepreciate <= 0) return;

    // Monthly depreciation rate
    const normalMonthly = calculateMonthlyDepreciation(
      asset.purchaseCostSar,
      asset.residualValueSar,
      asset.usefulLifeMonths
    );
    const amountToDepreciate = roundSar(Math.min(normalMonthly, remainingToDepreciate));

    if (amountToDepreciate <= 0) return;

    const accumulatedAfter = roundSar(asset.accumulatedDepreciationSar + amountToDepreciate);
    const bookValueAfter = roundSar(asset.purchaseCostSar - accumulatedAfter);

    previewItems.push({
      assetId: asset.id,
      assetNumber: asset.assetNumber,
      assetNameAr: asset.nameAr,
      categoryNameAr: asset.categoryNameAr || 'أصل ثابت',
      purchaseCostSar: asset.purchaseCostSar,
      residualValueSar: asset.residualValueSar,
      usefulLifeMonths: asset.usefulLifeMonths,
      accumulatedBeforeSar: asset.accumulatedDepreciationSar,
      depreciationAmountSar: amountToDepreciate,
      accumulatedAfterSar: accumulatedAfter,
      bookValueAfterSar: bookValueAfter,
      costCenterId: asset.costCenterId,
      costCenterNameAr: asset.costCenterNameAr,
      depreciationExpenseAccountId: asset.depreciationExpenseAccountId,
      depreciationExpenseAccountCode: asset.depreciationExpenseAccountCode,
      accumulatedDepreciationAccountId: asset.accumulatedDepreciationAccountId,
      accumulatedDepreciationAccountCode: asset.accumulatedDepreciationAccountCode,
    });

    grandTotalDepreciation = roundSar(grandTotalDepreciation + amountToDepreciate);
  });

  // Build simulated balanced journal lines
  // Group Debits by (ExpenseAccount, CostCenter)
  const debitMap = new Map<string, { accountCode: string; costCenterId?: string; costCenterNameAr?: string; amount: number }>();
  // Group Credits by AccumulatedAccount
  const creditMap = new Map<string, { accountCode: string; amount: number }>();

  previewItems.forEach((item) => {
    const dKey = `${item.depreciationExpenseAccountCode}__${item.costCenterId || 'NONE'}`;
    const curDebit = debitMap.get(dKey) || {
      accountCode: item.depreciationExpenseAccountCode,
      costCenterId: item.costCenterId,
      costCenterNameAr: item.costCenterNameAr,
      amount: 0,
    };
    curDebit.amount = roundSar(curDebit.amount + item.depreciationAmountSar);
    debitMap.set(dKey, curDebit);

    const cKey = item.accumulatedDepreciationAccountCode;
    const curCredit = creditMap.get(cKey) || {
      accountCode: item.accumulatedDepreciationAccountCode,
      amount: 0,
    };
    curCredit.amount = roundSar(curCredit.amount + item.depreciationAmountSar);
    creditMap.set(cKey, curCredit);
  });

  const previewJournalLines: Array<{
    accountCode: string;
    accountNameAr: string;
    debitSar: number;
    creditSar: number;
    costCenterId?: string;
    costCenterNameAr?: string;
    description: string;
  }> = [];

  debitMap.forEach((val) => {
    previewJournalLines.push({
      accountCode: val.accountCode,
      accountNameAr: 'مصروف إهلاك الأصول الثابتة',
      debitSar: val.amount,
      creditSar: 0,
      costCenterId: val.costCenterId,
      costCenterNameAr: val.costCenterNameAr,
      description: `إثبات قسط إهلاك الأصول الثابتة لفترة ${periodKey}`,
    });
  });

  creditMap.forEach((val) => {
    previewJournalLines.push({
      accountCode: val.accountCode,
      accountNameAr: 'مجمع إهلاك الأصول الثابتة',
      debitSar: 0,
      creditSar: val.amount,
      description: `إثبات مجمع إهلاك الأصول الثابتة لفترة ${periodKey}`,
    });
  });

  return {
    periodKey,
    isAlreadyPosted,
    totalDepreciationSar: grandTotalDepreciation,
    assetsCount: previewItems.length,
    previewItems,
    previewJournalLines,
  };
}

/**
 * Executes the monthly straight-line depreciation run with strict idempotency (Rule G1, ADR-010).
 * Re-running for the same period is strictly blocked.
 */
export async function executeMonthlyDepreciationService(
  repo: TenantScopedRepository,
  periodKey: string, // YYYY-MM
  userId: string,
  userEmail: string
): Promise<{
  periodKey: string;
  journalId: string;
  journalNumber: string;
  totalDepreciationSar: number;
  assetsCount: number;
  runRecord: DepreciationRunHistory;
}> {
  seedDefaultAssetData(repo.tenantId, userId);
  const runs = tenantDepreciationRunsMap.get(repo.tenantId)!;

  // 1. Idempotency Guard (no double depreciation allowed for the same period)
  const existingRun = runs.find((r) => r.periodKey === periodKey);
  if (existingRun) {
    throw new Error(`تم تشغيل وترحيل إهلاك الفترة (${periodKey}) مسبقاً برقم قيد (${existingRun.journalNumber}). يُحظر الترحيل المزدوج لنفس الفترة.`);
  }

  // 2. Generate Preview / Calculation
  const preview = previewMonthlyDepreciationService(repo.tenantId, periodKey, userId);
  if (preview.previewItems.length === 0 || preview.totalDepreciationSar <= 0) {
    throw new Error(`لا توجد أصول نشطة مؤهلة للإهلاك في فترة (${periodKey}) أو أن جميع الأصول مهلكة دفترياً بالكامل.`);
  }

  // 3. Prepare Journal Lines
  const journalLines: Array<{
    accountId: string;
    debit: number;
    credit: number;
    descriptionAr: string;
    costCenterId?: string;
  }> = [];

  preview.previewJournalLines.forEach((line) => {
    journalLines.push({
      accountId: line.accountCode,
      debit: line.debitSar,
      credit: line.creditSar,
      descriptionAr: line.description,
      costCenterId: line.costCenterId,
    });
  });

  // Calculate month-end date for the period
  const [yearStr, monthStr] = periodKey.split('-');
  const y = Number(yearStr);
  const m = Number(monthStr);
  const lastDay = new Date(y, m, 0).getDate();
  const entryDate = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

  // 4. Post Double-Entry Journal to General Ledger
  const journal = await repo.postJournal({
    companyId: repo.tenantId,
    sourceType: 'MANUAL',
    sourceId: `DEPR-${periodKey}`,
    sourceKey: `ASSET_DEPRECIATION:${repo.tenantId}:${periodKey}`,
    date: entryDate,
    description: `تشغيل إهلاك الأصول الثابتة الشهري لفترة ${periodKey}`,
    descriptionAr: `تشغيل إهلاك الأصول الثابتة الشهري لفترة ${periodKey} (${preview.assetsCount} أصل)`,
    descriptionEn: `Monthly Straight-Line Depreciation Run for Period ${periodKey} (${preview.assetsCount} Assets)`,
    lines: journalLines,
  });

  // 5. Update Assets in State
  const assets = tenantFixedAssetsMap.get(repo.tenantId)!;
  const assetDetailsForHistory: Array<{
    assetId: string;
    assetNumber: string;
    assetNameAr: string;
    depreciationAmountSar: number;
    costCenterId?: string;
  }> = [];

  preview.previewItems.forEach((item) => {
    const asset = assets.find((a) => a.id === item.assetId);
    if (asset) {
      asset.accumulatedDepreciationSar = item.accumulatedAfterSar;
      asset.bookValueSar = item.bookValueAfterSar;
      asset.lastDepreciationPeriod = periodKey;

      // Check if now fully depreciated
      const maxDepreciable = roundSar(asset.purchaseCostSar - asset.residualValueSar);
      if (asset.accumulatedDepreciationSar >= maxDepreciable) {
        asset.status = 'FULLY_DEPRECIATED';
      }
      asset.updatedAt = new Date().toISOString();

      assetDetailsForHistory.push({
        assetId: asset.id,
        assetNumber: asset.assetNumber,
        assetNameAr: asset.nameAr,
        depreciationAmountSar: item.depreciationAmountSar,
        costCenterId: asset.costCenterId,
      });
    }
  });

  // 6. Save Run Record
  const runRecord: DepreciationRunHistory = {
    id: crypto.randomUUID(),
    tenantId: repo.tenantId,
    periodKey,
    runDate: entryDate,
    executedBy: userEmail,
    executedAt: new Date().toISOString(),
    totalDepreciationSar: preview.totalDepreciationSar,
    assetsCount: preview.assetsCount,
    journalId: journal.id,
    journalNumber: journal.entryNumber,
    assetDetails: assetDetailsForHistory,
  };

  runs.unshift(runRecord);

  centralStore.recordAuditLog({
    tenantId: repo.tenantId,
    userId,
    userEmail,
    action: 'RUN_MONTHLY_DEPRECIATION',
    resourceType: 'depreciation_runs',
    resourceId: runRecord.id,
    correlationId: crypto.randomUUID(),
    changesDiff: { periodKey, totalDepreciation: preview.totalDepreciationSar, assetsCount: preview.assetsCount, journalNumber: journal.entryNumber },
  });

  return {
    periodKey,
    journalId: journal.id,
    journalNumber: journal.entryNumber,
    totalDepreciationSar: preview.totalDepreciationSar,
    assetsCount: preview.assetsCount,
    runRecord,
  };
}

export function getDepreciationHistoryService(tenantId: string, adminUserId: string): DepreciationRunHistory[] {
  seedDefaultAssetData(tenantId, adminUserId);
  return tenantDepreciationRunsMap.get(tenantId) || [];
}

// ============================================================================
// 4. ASSET DISPOSAL ENGINE (SALE & SCRAP)
// ============================================================================
/**
 * Disposes of a fixed asset through sale or scrapping.
 * Generates an immutable, balanced GL journal:
 * - Dr Cash/Bank with sale proceeds (if Sale)
 * - Dr Accumulated Depreciation with total accumulated depreciation
 * - Cr Asset Account with original purchase cost
 * - Cr Gain on Disposal (if Proceeds > Book Value) OR Dr Loss on Disposal (if Proceeds < Book Value or Scrap)
 * Invariant: Total Debits == Total Credits exact Halalas (Rule G1).
 */
export async function disposeFixedAssetService(
  repo: TenantScopedRepository,
  assetId: string,
  data: {
    type: 'SALE' | 'SCRAP';
    date: string; // YYYY-MM-DD
    saleProceedsSar?: number;
    settlementAccountId?: string; // 10101, 10102
    reason?: string;
    buyerName?: string;
  },
  userId: string,
  userEmail: string
): Promise<{
  asset: FixedAsset;
  disposalInfo: AssetDisposalInfo;
}> {
  seedDefaultAssetData(repo.tenantId, userId);
  const assets = tenantFixedAssetsMap.get(repo.tenantId)!;
  const asset = assets.find((a) => a.id === assetId);

  if (!asset) {
    throw new Error('الأصل الثابت غير موجود');
  }

  if (asset.status === 'DISPOSED') {
    throw new Error('الأصل تم استبعاده وتصفيته دفترياً مسبقاً');
  }

  const disposalDate = data.date || new Date().toISOString().slice(0, 10);
  const proceeds = data.type === 'SCRAP' ? 0 : roundSar(Number(data.saleProceedsSar || 0));
  if (data.type === 'SALE' && proceeds < 0) {
    throw new Error('عائد بيع الأصل لا يمكن أن يكون سالباً');
  }

  const cost = asset.purchaseCostSar;
  const accumulated = asset.accumulatedDepreciationSar;
  const bookValue = roundSar(cost - accumulated);

  const gainLossCalc = calculateDisposalGainOrLoss(bookValue, proceeds, data.type);
  const gainOrLoss = gainLossCalc.gainOrLossSar;

  // Account codes
  const gainAccountCode = '40301'; // Gain on Asset Disposal (أرباح بيع واستبعاد أصول ثابتة)
  const lossAccountCode = '50403'; // Loss on Asset Disposal / Scrapping (خسائر بيع واستبعاد أصول ثابتة)
  const settlementAccountCode = data.settlementAccountId || '10102'; // Operating Bank

  const journalLines: Array<{
    accountId: string;
    debit: number;
    credit: number;
    descriptionAr: string;
    costCenterId?: string;
    branchId?: string;
  }> = [];

  // 1. Dr Proceeds (Bank / Cash) if Sale and proceeds > 0
  if (data.type === 'SALE' && proceeds > 0) {
    journalLines.push({
      accountId: settlementAccountCode,
      debit: proceeds,
      credit: 0,
      descriptionAr: `متحصلات بيع الأصل: ${asset.nameAr} (${asset.assetNumber})`,
      costCenterId: asset.costCenterId,
      branchId: asset.branchId,
    });
  }

  // 2. Dr Accumulated Depreciation (Reversing accumulated balance)
  if (accumulated > 0) {
    journalLines.push({
      accountId: asset.accumulatedDepreciationAccountCode,
      debit: accumulated,
      credit: 0,
      descriptionAr: `إقفال مجمع إهلاك الأصل: ${asset.nameAr}`,
      costCenterId: asset.costCenterId,
      branchId: asset.branchId,
    });
  }

  // 3. Cr Asset Cost Account (Removing asset at historical cost)
  journalLines.push({
    accountId: asset.assetAccountCode,
    debit: 0,
    credit: cost,
    descriptionAr: `استبعاد الأصل من سجل الأصول بالتكلفة التاريخية: ${asset.nameAr}`,
    costCenterId: asset.costCenterId,
    branchId: asset.branchId,
  });

  // 4. Gain or Loss recognition
  if (gainLossCalc.isGain) {
    // Credit Gain
    journalLines.push({
      accountId: gainAccountCode,
      debit: 0,
      credit: gainOrLoss,
      descriptionAr: `أرباح رأسمالية ناتجة عن بيع الأصل: ${asset.nameAr}`,
      costCenterId: asset.costCenterId,
      branchId: asset.branchId,
    });
  } else if (gainLossCalc.isLoss) {
    // Debit Loss (amount is positive for debit)
    journalLines.push({
      accountId: lossAccountCode,
      debit: Math.abs(gainOrLoss),
      credit: 0,
      descriptionAr: data.type === 'SCRAP'
        ? `خسارة تخريد وشطب الأصل بالكامل: ${asset.nameAr}`
        : `خسائر رأسمالية ناتجة عن بيع الأصل بأقل من قيمته الدفترية: ${asset.nameAr}`,
      costCenterId: asset.costCenterId,
      branchId: asset.branchId,
    });
  }

  // 5. Post Journal to General Ledger
  const actionDesc = data.type === 'SALE' ? 'بيع واستبعاد' : 'تخريد وشطب';
  const journal = await repo.postJournal({
    companyId: repo.tenantId,
    branchId: asset.branchId,
    sourceType: 'MANUAL',
    sourceId: asset.id,
    sourceKey: `ASSET_DISPOSAL:${repo.tenantId}:${asset.id}`,
    date: disposalDate,
    description: `${actionDesc} أصل ثابت: ${asset.nameAr} (${asset.assetNumber})`,
    descriptionAr: `${actionDesc} أصل ثابت: ${asset.nameAr} (${asset.assetNumber})`,
    descriptionEn: `Asset Disposal (${data.type}): ${asset.nameEn} (${asset.assetNumber})`,
    costCenterId: asset.costCenterId,
    lines: journalLines,
  });

  // 6. Update Asset Status and store Disposal Metadata
  const disposalInfo: AssetDisposalInfo = {
    date: disposalDate,
    type: data.type,
    saleProceedsSar: proceeds,
    bookValueAtDisposalSar: bookValue,
    gainOrLossSar: gainOrLoss,
    settlementAccountId: data.type === 'SALE' ? settlementAccountCode : undefined,
    settlementAccountCode: data.type === 'SALE' ? settlementAccountCode : undefined,
    gainLossAccountId: gainLossCalc.isGain ? gainAccountCode : lossAccountCode,
    gainLossAccountCode: gainLossCalc.isGain ? gainAccountCode : lossAccountCode,
    journalId: journal.id,
    journalNumber: journal.entryNumber,
    reason: data.reason || (data.type === 'SALE' ? 'بيع الأصل' : 'تخريد الأصل لانتهاء الجدوى'),
    buyerName: data.buyerName,
    disposedBy: userEmail,
    disposedAt: new Date().toISOString(),
  };

  asset.status = 'DISPOSED';
  asset.bookValueSar = 0;
  asset.disposal = disposalInfo;
  asset.updatedAt = new Date().toISOString();

  centralStore.recordAuditLog({
    tenantId: repo.tenantId,
    userId,
    userEmail,
    action: `DISPOSE_ASSET_${data.type}`,
    resourceType: 'fixed_assets',
    resourceId: assetId,
    correlationId: crypto.randomUUID(),
    changesDiff: { disposalType: data.type, proceeds, bookValue, gainOrLoss, journalNumber: journal.entryNumber },
  });

  return { asset, disposalInfo };
}

// ============================================================================
// 5. COST CENTERS CRUD & P&L REPORT
// ============================================================================
export function getCostCentersService(tenantId: string, adminUserId: string): CostCenter[] {
  seedDefaultAssetData(tenantId, adminUserId);
  return centralStore.costCenters.get(tenantId) || [];
}

export function createCostCenterService(
  tenantId: string,
  data: Partial<CostCenter>,
  userId: string,
  userEmail: string
): CostCenter {
  seedDefaultAssetData(tenantId, userId);
  const centers = centralStore.costCenters.get(tenantId)!;

  const code = data.code || `CC-${(centers.length + 1) * 100}`;
  const existingWithCode = centers.find((c) => c.code.trim().toUpperCase() === code.trim().toUpperCase());
  if (existingWithCode) {
    throw new Error(`رمز مركز التكلفة (${code}) مستخدم مسبقاً`);
  }

  const newCenter: CostCenter = {
    id: crypto.randomUUID(),
    tenantId,
    code,
    nameAr: data.nameAr || 'مركز تكلفة جديد',
    nameEn: data.nameEn || data.nameAr || 'New Cost Center',
    parentId: data.parentId || null,
    isActive: data.isActive !== false,
    createdAt: new Date().toISOString(),
  };

  centers.push(newCenter);
  return newCenter;
}

export function updateCostCenterService(
  tenantId: string,
  centerId: string,
  data: Partial<CostCenter>
): CostCenter {
  const centers = centralStore.costCenters.get(tenantId) || [];
  const center = centers.find((c) => c.id === centerId);
  if (!center) {
    throw new Error('مركز التكلفة غير موجود');
  }

  if (data.nameAr) center.nameAr = data.nameAr;
  if (data.nameEn) center.nameEn = data.nameEn;
  if (data.parentId !== undefined) center.parentId = data.parentId;
  if (data.isActive !== undefined) center.isActive = data.isActive;

  return center;
}

export function deleteCostCenterService(tenantId: string, centerId: string): boolean {
  const centers = centralStore.costCenters.get(tenantId) || [];
  const idx = centers.findIndex((c) => c.id === centerId);
  if (idx === -1) {
    throw new Error('مركز التكلفة غير موجود');
  }

  // Check if any asset or journal uses this cost center
  const assets = tenantFixedAssetsMap.get(tenantId) || [];
  if (assets.some((a) => a.costCenterId === centerId)) {
    throw new Error('لا يمكن حذف مركز التكلفة لأنه مرتبط بأصول ثابتة مسجلة');
  }

  const journals = centralStore.journals.get(tenantId) || [];
  const usedInJournals = journals.some(
    (j) => j.costCenterId === centerId || (j.lines || []).some((l) => l.costCenterId === centerId)
  );
  if (usedInJournals) {
    throw new Error('لا يمكن حذف مركز التكلفة لأنه مستخدم في قيود محاسبية مرحلة');
  }

  centers.splice(idx, 1);
  return true;
}

/**
 * Generates the Cost Center Profit & Loss Report.
 * Enforces the mathematical invariant:
 * Sum of all cost center net incomes + Unallocated net income === Total Company Net Income (Test 5).
 */
export function getCostCenterProfitLossReportService(
  tenantId: string,
  options?: {
    startDate?: string;
    endDate?: string;
  }
): CostCenterProfitLossReport {
  const costCenters = centralStore.costCenters.get(tenantId) || [];
  const accounts = centralStore.accounts.get(tenantId) || [];
  const journals = (centralStore.journals.get(tenantId) || []).filter((j) => {
    if (j.status !== 'POSTED') return false;
    if (options?.startDate && j.entryDate < options.startDate) return false;
    if (options?.endDate && j.entryDate > options.endDate) return false;
    return true;
  });

  const accountMap = new Map<string, { type: string; code: string }>();
  accounts.forEach((acc) => {
    accountMap.set(acc.id, { type: acc.type, code: acc.code });
    accountMap.set(acc.code, { type: acc.type, code: acc.code });
  });

  // Track aggregations per cost center
  interface AggBucket {
    revenueHalalas: bigint;
    cogsHalalas: bigint;
    operatingExpensesHalalas: bigint;
    depreciationExpensesHalalas: bigint;
    otherExpensesHalalas: bigint;
    journalLinesCount: number;
  }

  const createBucket = (): AggBucket => ({
    revenueHalalas: 0n,
    cogsHalalas: 0n,
    operatingExpensesHalalas: 0n,
    depreciationExpensesHalalas: 0n,
    otherExpensesHalalas: 0n,
    journalLinesCount: 0,
  });

  const centerBuckets = new Map<string, AggBucket>();
  costCenters.forEach((cc) => {
    centerBuckets.set(cc.id, createBucket());
  });
  const unallocatedBucket = createBucket();
  const totalCompanyBucket = createBucket();

  // Process all lines of all posted journals
  journals.forEach((j) => {
    (j.lines || []).forEach((line) => {
      const accInfo = accountMap.get(line.accountId) || accountMap.get(line.accountCode);
      if (!accInfo) return;

      const d = BigInt(line.debitCents || 0n);
      const c = BigInt(line.creditCents || 0n);

      // Determine which bucket
      const targetCCId = line.costCenterId || j.costCenterId;
      const targetBucket = targetCCId && centerBuckets.has(targetCCId)
        ? centerBuckets.get(targetCCId)!
        : unallocatedBucket;

      const recordLine = (bucket: AggBucket) => {
        bucket.journalLinesCount += 1;

        if (accInfo.type === 'REVENUE') {
          // Normal balance: Credit. Net Revenue = Credits - Debits
          bucket.revenueHalalas += (c - d);
        } else if (accInfo.type === 'COGS') {
          // Normal balance: Debit. Net COGS = Debits - Credits
          bucket.cogsHalalas += (d - c);
        } else if (accInfo.type === 'EXPENSE') {
          // Check if depreciation expense
          if (accInfo.code === '50501' || accInfo.code.startsWith('505')) {
            bucket.depreciationExpensesHalalas += (d - c);
          } else if (accInfo.code.startsWith('504')) {
            // Other / financial / disposal expense
            bucket.otherExpensesHalalas += (d - c);
          } else {
            bucket.operatingExpensesHalalas += (d - c);
          }
        }
      };

      // Only count P&L accounts (Revenue, COGS, Expense)
      if (accInfo.type === 'REVENUE' || accInfo.type === 'COGS' || accInfo.type === 'EXPENSE') {
        recordLine(targetBucket);
        recordLine(totalCompanyBucket);
      }
    });
  });

  // Helper to convert bucket to SAR
  const bucketToLine = (b: AggBucket) => {
    const revenue = Number(fromHalalasToDisplay(b.revenueHalalas, 2));
    const cogs = Number(fromHalalasToDisplay(b.cogsHalalas, 2));
    const grossProfit = roundSar(revenue - cogs);
    const opExp = Number(fromHalalasToDisplay(b.operatingExpensesHalalas, 2));
    const deprExp = Number(fromHalalasToDisplay(b.depreciationExpensesHalalas, 2));
    const otherExp = Number(fromHalalasToDisplay(b.otherExpensesHalalas, 2));
    const totalExpenses = roundSar(opExp + deprExp + otherExp);
    const netIncome = roundSar(grossProfit - totalExpenses);

    return {
      revenueSar: revenue,
      cogsSar: cogs,
      grossProfitSar: grossProfit,
      operatingExpensesSar: opExp,
      depreciationExpensesSar: deprExp,
      otherExpensesSar: otherExp,
      netIncomeSar: netIncome,
      journalLinesCount: b.journalLinesCount,
    };
  };

  const lines: CostCenterProfitLossLine[] = costCenters.map((cc) => {
    const b = centerBuckets.get(cc.id)!;
    const calc = bucketToLine(b);
    return {
      costCenterId: cc.id,
      costCenterCode: cc.code,
      costCenterNameAr: cc.nameAr,
      costCenterNameEn: cc.nameEn,
      ...calc,
    };
  });

  const unallocated = bucketToLine(unallocatedBucket);
  const totalCompany = bucketToLine(totalCompanyBucket);

  // Property Invariant Check: Sum of all Cost Centers Net Income + Unallocated Net Income === Total Company Net Income
  const sumOfCentersNet = lines.reduce((acc, l) => roundSar(acc + l.netIncomeSar), 0);
  const sumOfAllSlices = roundSar(sumOfCentersNet + unallocated.netIncomeSar);
  const discrepancy = roundSar(Math.abs(sumOfAllSlices - totalCompany.netIncomeSar));
  const isReconciled = discrepancy === 0;

  return {
    periodStart: options?.startDate,
    periodEnd: options?.endDate,
    lines,
    unallocated,
    totalCompany,
    isReconciled,
    discrepancySar: discrepancy,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Fixed Assets & Cost Centers Domain Library — Saudi ERP
 * Enforces Golden Rules G1, G7, G8 and Straight-Line Depreciation.
 */

import { roundSar, toHalalasInt, fromHalalasInt } from './accounting.js';

export interface AssetCategory {
  id: string;
  tenantId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  assetAccountId: string; // e.g. 10501 Vehicles
  assetAccountCode: string;
  accumulatedDepreciationAccountId: string; // e.g. 10502 Acc Depr Vehicles
  accumulatedDepreciationAccountCode: string;
  depreciationExpenseAccountId: string; // e.g. 50501 Depreciation Expense
  depreciationExpenseAccountCode: string;
  defaultUsefulLifeMonths: number;
  defaultResidualValuePercentage: number; // e.g. 0% or 5%
  isActive: boolean;
}

export type AssetStatus = 'ACTIVE' | 'DISPOSED' | 'FULLY_DEPRECIATED';
export type AcquisitionType = 'PURCHASE_BILL' | 'EXPENSE_VOUCHER' | 'STANDALONE_JOURNAL' | 'OPENING_BALANCE';
export type DisposalType = 'SALE' | 'SCRAP';

export interface AssetAttachment {
  id: string;
  name: string;
  type: 'INVOICE' | 'WARRANTY' | 'CONTRACT' | 'OTHER';
  url?: string;
  size?: number;
  uploadedAt: string;
}

export interface AssetDisposalInfo {
  date: string; // YYYY-MM-DD
  type: DisposalType;
  saleProceedsSar: number;
  bookValueAtDisposalSar: number;
  gainOrLossSar: number; // Positive = Gain, Negative = Loss
  settlementAccountId?: string; // e.g. Bank 10102 or Cash 10101
  settlementAccountCode?: string;
  gainLossAccountId: string; // 40301 (Gain) or 50403 (Loss)
  gainLossAccountCode: string;
  journalId: string;
  journalNumber: string;
  reason?: string;
  buyerName?: string;
  disposedBy: string;
  disposedAt: string;
}

export interface FixedAsset {
  id: string;
  tenantId: string;
  assetNumber: string; // AST-YYYY-XXXXX
  nameAr: string;
  nameEn: string;
  categoryId: string;
  categoryCode?: string;
  categoryNameAr?: string;
  categoryNameEn?: string;
  purchaseDate: string; // YYYY-MM-DD
  purchaseCostSar: number; // Exact SAR (never negative)
  residualValueSar: number; // Salvage value, never negative, <= purchaseCost
  usefulLifeMonths: number; // Total useful life in months (> 0)
  depreciationMethod: 'STRAIGHT_LINE';
  branchId?: string;
  branchNameAr?: string;
  costCenterId?: string;
  costCenterCode?: string;
  costCenterNameAr?: string;
  locationNotes?: string;
  status: AssetStatus;
  acquisitionType: AcquisitionType;
  acquisitionReferenceId?: string; // e.g. Bill ID or Expense ID
  acquisitionJournalId?: string;
  acquisitionJournalNumber?: string;
  assetAccountId: string;
  assetAccountCode: string;
  accumulatedDepreciationAccountId: string;
  accumulatedDepreciationAccountCode: string;
  depreciationExpenseAccountId: string;
  depreciationExpenseAccountCode: string;
  accumulatedDepreciationSar: number; // Total accumulated so far
  bookValueSar: number; // purchaseCostSar - accumulatedDepreciationSar
  lastDepreciationPeriod?: string; // YYYY-MM of the last executed depreciation
  attachments: AssetAttachment[];
  disposal?: AssetDisposalInfo;
  createdAt: string;
  updatedAt: string;
}

export interface DepreciationScheduleItem {
  periodNumber: number; // 1 .. usefulLifeMonths
  periodKey: string; // YYYY-MM
  periodDate: string; // YYYY-MM-DD (e.g. month-end)
  openingBookValueSar: number;
  depreciationAmountSar: number;
  accumulatedDepreciationSar: number;
  closingBookValueSar: number;
  isPosted: boolean;
  journalId?: string;
  journalNumber?: string;
}

export interface MonthlyDepreciationPreviewItem {
  assetId: string;
  assetNumber: string;
  assetNameAr: string;
  categoryNameAr: string;
  purchaseCostSar: number;
  residualValueSar: number;
  usefulLifeMonths: number;
  accumulatedBeforeSar: number;
  depreciationAmountSar: number;
  accumulatedAfterSar: number;
  bookValueAfterSar: number;
  costCenterId?: string;
  costCenterNameAr?: string;
  depreciationExpenseAccountId: string;
  depreciationExpenseAccountCode: string;
  accumulatedDepreciationAccountId: string;
  accumulatedDepreciationAccountCode: string;
}

export interface DepreciationRunHistory {
  id: string;
  tenantId: string;
  periodKey: string; // YYYY-MM
  runDate: string;
  executedBy: string;
  executedAt: string;
  totalDepreciationSar: number;
  assetsCount: number;
  journalId: string;
  journalNumber: string;
  assetDetails: Array<{
    assetId: string;
    assetNumber: string;
    assetNameAr: string;
    depreciationAmountSar: number;
    costCenterId?: string;
  }>;
}

export interface CostCenterProfitLossLine {
  costCenterId: string;
  costCenterCode: string;
  costCenterNameAr: string;
  costCenterNameEn: string;
  revenueSar: number;
  cogsSar: number;
  grossProfitSar: number;
  operatingExpensesSar: number;
  depreciationExpensesSar: number;
  otherExpensesSar: number;
  netIncomeSar: number;
  journalLinesCount: number;
}

export interface CostCenterProfitLossReport {
  periodStart?: string;
  periodEnd?: string;
  lines: CostCenterProfitLossLine[];
  unallocated: {
    revenueSar: number;
    cogsSar: number;
    grossProfitSar: number;
    operatingExpensesSar: number;
    depreciationExpensesSar: number;
    otherExpensesSar: number;
    netIncomeSar: number;
    journalLinesCount: number;
  };
  totalCompany: {
    revenueSar: number;
    cogsSar: number;
    grossProfitSar: number;
    operatingExpensesSar: number;
    depreciationExpensesSar: number;
    otherExpensesSar: number;
    netIncomeSar: number;
    journalLinesCount: number;
  };
  isReconciled: boolean;
  discrepancySar: number;
  generatedAt: string;
}

/**
 * Standard default fixed asset categories for Saudi enterprises
 */
export const DEFAULT_ASSET_CATEGORIES: Omit<AssetCategory, 'id' | 'tenantId'>[] = [
  {
    code: 'CAT-VEHICLES',
    nameAr: 'السيارات والشاحنات ووسائل النقل',
    nameEn: 'Motor Vehicles & Fleet',
    assetAccountId: 'acc-10501',
    assetAccountCode: '10501',
    accumulatedDepreciationAccountId: 'acc-10502',
    accumulatedDepreciationAccountCode: '10502',
    depreciationExpenseAccountId: 'acc-50501',
    depreciationExpenseAccountCode: '50501',
    defaultUsefulLifeMonths: 60, // 5 years
    defaultResidualValuePercentage: 5, // 5% residual
    isActive: true,
  },
  {
    code: 'CAT-IT',
    nameAr: 'أجهزة الحاسب الآلي والشبكات والتقنية',
    nameEn: 'IT Hardware & Office Technology',
    assetAccountId: 'acc-10503',
    assetAccountCode: '10503',
    accumulatedDepreciationAccountId: 'acc-10504',
    accumulatedDepreciationAccountCode: '10504',
    depreciationExpenseAccountId: 'acc-50501',
    depreciationExpenseAccountCode: '50501',
    defaultUsefulLifeMonths: 36, // 3 years
    defaultResidualValuePercentage: 0,
    isActive: true,
  },
  {
    code: 'CAT-FURNITURE',
    nameAr: 'الأثاث والتجهيزات المكتبية والديكور',
    nameEn: 'Office Furniture & Fixtures',
    assetAccountId: 'acc-10505',
    assetAccountCode: '10505',
    accumulatedDepreciationAccountId: 'acc-10506',
    accumulatedDepreciationAccountCode: '10506',
    depreciationExpenseAccountId: 'acc-50501',
    depreciationExpenseAccountCode: '50501',
    defaultUsefulLifeMonths: 60, // 5 years
    defaultResidualValuePercentage: 0,
    isActive: true,
  },
  {
    code: 'CAT-MACHINERY',
    nameAr: 'الآلات والمعدات التشغيلية والمصانع',
    nameEn: 'Machinery & Industrial Equipment',
    assetAccountId: 'acc-10507',
    assetAccountCode: '10507',
    accumulatedDepreciationAccountId: 'acc-10508',
    accumulatedDepreciationAccountCode: '10508',
    depreciationExpenseAccountId: 'acc-50501',
    depreciationExpenseAccountCode: '50501',
    defaultUsefulLifeMonths: 120, // 10 years
    defaultResidualValuePercentage: 10,
    isActive: true,
  },
  {
    code: 'CAT-BUILDINGS',
    nameAr: 'المباني والمنشآت العقارية المستأجرة والمملوكة',
    nameEn: 'Buildings & Leasehold Improvements',
    assetAccountId: 'acc-10509',
    assetAccountCode: '10509',
    accumulatedDepreciationAccountId: 'acc-10510',
    accumulatedDepreciationAccountCode: '10510',
    depreciationExpenseAccountId: 'acc-50501',
    depreciationExpenseAccountCode: '50501',
    defaultUsefulLifeMonths: 240, // 20 years
    defaultResidualValuePercentage: 10,
    isActive: true,
  },
];

/**
 * Straight-line monthly depreciation calculation:
 * Monthly = (Cost - Residual Value) / Useful Life (Months)
 * Uses exact Halalas arithmetic and rounds half-up.
 */
export function calculateMonthlyDepreciation(
  purchaseCostSar: number,
  residualValueSar: number = 0,
  usefulLifeMonths: number
): number {
  if (usefulLifeMonths <= 0 || purchaseCostSar <= 0) return 0;
  const depreciableAmount = Math.max(0, purchaseCostSar - residualValueSar);
  if (depreciableAmount <= 0) return 0;
  const monthly = depreciableAmount / usefulLifeMonths;
  return roundSar(monthly);
}

/**
 * Calculates a full straight-line depreciation schedule for an asset.
 * Guarantees that total accumulated depreciation over all months matches (Cost - Residual) exactly.
 */
export function generateDepreciationSchedule(
  purchaseCostSar: number,
  residualValueSar: number = 0,
  usefulLifeMonths: number,
  startDateStr: string,
  postedPeriods: Set<string> = new Set()
): DepreciationScheduleItem[] {
  if (usefulLifeMonths <= 0 || purchaseCostSar <= 0) return [];

  const depreciableAmount = roundSar(Math.max(0, purchaseCostSar - residualValueSar));
  const baseMonthly = calculateMonthlyDepreciation(purchaseCostSar, residualValueSar, usefulLifeMonths);

  const schedule: DepreciationScheduleItem[] = [];
  let accumulated = 0;
  let currentBookValue = purchaseCostSar;

  const startDate = new Date(startDateStr);
  const startYear = isNaN(startDate.getFullYear()) ? 2026 : startDate.getFullYear();
  const startMonth = isNaN(startDate.getMonth()) ? 0 : startDate.getMonth(); // 0-indexed

  for (let m = 1; m <= usefulLifeMonths; m++) {
    // Calculate target date for period m
    const periodDateObj = new Date(startYear, startMonth + m, 0); // Last day of month
    const yyyy = periodDateObj.getFullYear();
    const mm = String(periodDateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(periodDateObj.getDate()).padStart(2, '0');
    const periodKey = `${yyyy}-${mm}`;
    const periodDate = `${yyyy}-${mm}-${dd}`;

    let monthlyDepr: number;
    if (m === usefulLifeMonths) {
      // Final month absorbs any rounding difference to ensure exact depreciable amount
      monthlyDepr = roundSar(depreciableAmount - accumulated);
    } else {
      // Regular month, but make sure we don't exceed depreciableAmount
      monthlyDepr = Math.min(baseMonthly, roundSar(depreciableAmount - accumulated));
    }

    if (monthlyDepr < 0) monthlyDepr = 0;

    const openingBookValue = currentBookValue;
    accumulated = roundSar(accumulated + monthlyDepr);
    currentBookValue = roundSar(purchaseCostSar - accumulated);

    schedule.push({
      periodNumber: m,
      periodKey,
      periodDate,
      openingBookValueSar: openingBookValue,
      depreciationAmountSar: monthlyDepr,
      accumulatedDepreciationSar: accumulated,
      closingBookValueSar: currentBookValue,
      isPosted: postedPeriods.has(periodKey),
    });
  }

  return schedule;
}

/**
 * Calculates gain or loss upon asset disposal.
 * - Sale: Gain/Loss = Proceeds - Book Value
 * - Scrapping: Proceeds = 0, Loss = -Book Value
 */
export function calculateDisposalGainOrLoss(
  bookValueSar: number,
  saleProceedsSar: number = 0,
  type: DisposalType = 'SALE'
): {
  gainOrLossSar: number;
  isGain: boolean;
  isLoss: boolean;
  isBreakEven: boolean;
} {
  const proceeds = type === 'SCRAP' ? 0 : roundSar(saleProceedsSar);
  const diff = roundSar(proceeds - bookValueSar);

  return {
    gainOrLossSar: diff,
    isGain: diff > 0,
    isLoss: diff < 0,
    isBreakEven: diff === 0,
  };
}

/**
 * Saudi VAT & Tax Engine Domain Library — Saudi ERP
 * Enforces:
 * - Statutory Saudi VAT Rates (15% Standard, 5% Reduced, 0% Zero-Rated, Exempt, Out of Scope)
 * - UN/ECE 5305 Tax Category Codes: 'S' (Standard), 'Z' (Zero-Rated), 'E' (Exempt), 'O' (Out of Scope)
 * - Exact Price Decomposition (Inclusive & Exclusive) per Rules G7/G8
 * - Line-Level Half-Up Halalas Rounding with sum-of-lines totals
 * - Immutable Tax Snapshots for posted documents
 * - Tax Determination Precedence Resolution
 * - Tax Ledger & GL Tax Reconciliation Invariant (Output VAT 20301, Input VAT 10301, Rounding 50402)
 */

import { toHalalasInt, fromHalalasInt, roundHalalas, roundSar } from './accounting.js';

export type TaxCategoryCode = 'S' | 'Z' | 'E' | 'O';

export type TaxRateCode =
  | 'VAT_15'
  | 'VAT_5'
  | 'VAT_0'
  | 'EXEMPT'
  | 'OUT_OF_SCOPE'
  | 'CUSTOM';

export interface TaxRateDefinition {
  id: string;
  tenantId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  ratePercentage: number; // e.g. 15, 5, 0
  taxCategoryCode: TaxCategoryCode;
  exemptionReasonCode?: string | null;
  exemptionReasonAr?: string | null;
  exemptionReasonEn?: string | null;
  effectiveFrom?: string; // YYYY-MM-DD
  effectiveTo?: string | null; // YYYY-MM-DD
  isSystemDefault: boolean;
  isActive: boolean;
  isCustom?: boolean;
  descriptionAr?: string;
  descriptionEn?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaxSettings {
  tenantId: string;
  defaultTaxRateCode: string;
  defaultTaxRatePercentage: number;
  defaultPricingPreference: 'EXCLUSIVE' | 'INCLUSIVE';
  roundingMethod: 'HALF_UP_LINE';
  roundingAccountId: string;
  roundingAccountCode: string;
  vatOutputAccountId: string;
  vatOutputAccountCode: string;
  vatInputAccountId: string;
  vatInputAccountCode: string;
  enforceTaxSnapshot: boolean;
  allowTaxExemptionWithoutReason: boolean;
  updatedAt: string;
  updatedBy: string;
}

export interface TaxDeterminationInput {
  itemTaxCategory?: string | null; // e.g. STANDARD, ZERO_RATED, EXEMPT, OUT_OF_SCOPE, 15, 5
  itemTaxRateOverride?: number | null;
  partyTaxCategory?: string | null; // e.g. STANDARD_15, ZERO_RATED (Export), EXEMPT, OUT_OF_SCOPE
  transactionType?: 'DOMESTIC_SALE' | 'EXPORT_SALE' | 'DOMESTIC_PURCHASE' | 'IMPORT_PURCHASE' | 'GOVERNMENT_FEE' | 'STANDARD';
  effectiveDate?: string; // YYYY-MM-DD
}

export interface TaxDeterminationResult {
  taxRatePercentage: number;
  taxCategoryCode: TaxCategoryCode;
  resolvedSource: 'ITEM_OVERRIDE' | 'PARTY_CATEGORY' | 'TRANSACTION_TYPE' | 'COMPANY_DEFAULT';
  exemptionReasonCode?: string | null;
  descriptionAr: string;
  descriptionEn: string;
}

export interface CalculatedLineVat {
  lineId: string;
  itemId?: string;
  quantity: number;
  unitPriceSar: number;
  discountPercent: number;
  discountAmountSar: number;
  grossAmountSar: number;
  taxableAmountSar: number;
  taxRatePercentage: number;
  taxCategoryCode: TaxCategoryCode;
  taxExemptionReasonCode?: string | null;
  taxAmountSar: number;
  totalAmountSar: number;
  isTaxInclusive: boolean;
}

export interface TaxSnapshotLine {
  lineId: string;
  itemId: string;
  taxRatePercentage: number;
  taxCategoryCode: TaxCategoryCode;
  taxExemptionReasonCode?: string | null;
  netAmountSar: number;
  taxAmountSar: number;
  totalAmountSar: number;
  isTaxInclusive?: boolean;
}

export interface VatLedgerEntry {
  id: string;
  tenantId: string;
  branchId?: string;
  branchNameAr?: string;
  documentType: 'SALES_INVOICE' | 'SALES_CREDIT_NOTE' | 'PURCHASE_BILL' | 'VENDOR_DEBIT_NOTE' | 'EXPENSE_PAYMENT' | 'LANDED_COST';
  documentId: string;
  documentNumber: string;
  transactionDate: string; // YYYY-MM-DD
  partyId?: string;
  partyNameAr: string;
  partyNameEn?: string;
  partyVatNumber?: string;
  vatType: 'OUTPUT' | 'INPUT';
  taxCategoryCode: TaxCategoryCode;
  taxRatePercentage: number;
  taxableAmountSar: number;
  taxAmountSar: number;
  totalAmountSar: number;
  postedJournalId?: string;
  postedJournalNumber?: string;
  taxSnapshot: TaxSnapshotLine[];
  createdAt: string;
}

export interface VatPeriodSummary {
  tenantId: string;
  periodId?: string;
  startDate: string;
  endDate: string;
  
  // Output Tax (Sales & Credits)
  salesStandard15TaxableSar: number;
  salesStandard15TaxSar: number;
  salesReduced5TaxableSar: number;
  salesReduced5TaxSar: number;
  salesZeroRatedTaxableSar: number;
  salesExemptTaxableSar: number;
  salesOutOfScopeTaxableSar: number;
  salesCreditNotesTaxReversedSar: number;
  totalOutputTaxSar: number;
  totalSalesNetSar: number;
  totalSalesGrossSar: number;

  // Input Tax (Purchases, Landed Cost & Expenses)
  purchasesStandard15TaxableSar: number;
  purchasesStandard15TaxSar: number;
  purchasesReduced5TaxableSar: number;
  purchasesReduced5TaxSar: number;
  purchasesZeroRatedTaxableSar: number;
  purchasesExemptTaxableSar: number;
  purchasesLandedCostTaxSar: number;
  purchasesDebitNotesTaxReversedSar: number;
  totalInputTaxRecoverableSar: number;
  totalPurchasesNetSar: number;
  totalPurchasesGrossSar: number;

  // Net Tax Position
  netTaxPayableOrRefundableSar: number; // Positive = Payable to ZATCA, Negative = Refundable
  isRefundable: boolean;
}

export interface VatReconciliationReport {
  tenantId: string;
  asOfDate: string;
  
  // Tax Ledger Balances
  taxLedgerOutputVatSar: number;
  taxLedgerInputVatSar: number;
  taxLedgerNetPositionSar: number;

  // GL Accounts Balances
  glOutputVatAccountCode: string; // 20301
  glOutputVatAccountBalanceSar: number;
  glInputVatAccountCode: string; // 10301
  glInputVatAccountBalanceSar: number;
  glNetPositionSar: number;

  // Differences
  outputVatDiscrepancySar: number;
  inputVatDiscrepancySar: number;
  netDiscrepancySar: number;
  isFullyReconciled: boolean;
  reconciliationStatus: 'PERFECT_MATCH' | 'DISCREPANCY_DETECTED';
  reconciliationNotes: string[];
}

// ============================================================================
// SYSTEM DEFAULT TAX RATES (STATUTORY SAUDI ARABIA)
// ============================================================================
export const SYSTEM_DEFAULT_TAX_RATES: TaxRateDefinition[] = [
  {
    id: 'tax-rate-vat15',
    tenantId: 'system',
    code: 'VAT_15',
    nameAr: 'ضريبة القيمة المضافة القياسية (15%)',
    nameEn: 'Standard Value Added Tax (15%)',
    ratePercentage: 15,
    taxCategoryCode: 'S',
    isSystemDefault: true,
    isActive: true,
    descriptionAr: 'النسبة القياسية العامة المطبقة على معظم السلع والخدمات في المملكة',
    descriptionEn: 'General standard rate applied to most goods and services in Saudi Arabia',
    createdAt: '2020-07-01T00:00:00.000Z',
    updatedAt: '2020-07-01T00:00:00.000Z',
  },
  {
    id: 'tax-rate-vat5',
    tenantId: 'system',
    code: 'VAT_5',
    nameAr: 'ضريبة القيمة المضافة المخفضة (5%)',
    nameEn: 'Reduced Value Added Tax (5%)',
    ratePercentage: 5,
    taxCategoryCode: 'S',
    isSystemDefault: false,
    isActive: true,
    descriptionAr: 'النسبة التاريخية / المخفضة المطبقة في بعض الحالات الخاصة',
    descriptionEn: 'Reduced or legacy rate for specific transactions',
    createdAt: '2018-01-01T00:00:00.000Z',
    updatedAt: '2020-07-01T00:00:00.000Z',
  },
  {
    id: 'tax-rate-vat0',
    tenantId: 'system',
    code: 'VAT_0',
    nameAr: 'ضريبة بنسبة الصفر (0%)',
    nameEn: 'Zero-Rated Value Added Tax (0%)',
    ratePercentage: 0,
    taxCategoryCode: 'Z',
    isSystemDefault: false,
    isActive: true,
    descriptionAr: 'الصادرات المؤهلة خارج دول مجلس التعاون، النقل الدولي، والأدوية والمعدات الطبية المؤهلة',
    descriptionEn: 'Qualifying exports, international transport, qualifying medicines and medical equipment',
    createdAt: '2018-01-01T00:00:00.000Z',
    updatedAt: '2020-07-01T00:00:00.000Z',
  },
  {
    id: 'tax-rate-exempt',
    tenantId: 'system',
    code: 'EXEMPT',
    nameAr: 'معفى من الضريبة (Exempt)',
    nameEn: 'VAT Exempt',
    ratePercentage: 0,
    taxCategoryCode: 'E',
    exemptionReasonCode: 'VATEX-SA-32',
    exemptionReasonAr: 'تأجير العقارات السكنية والخدمات المالية الهامشية والتأمين على الحياة',
    exemptionReasonEn: 'Residential real estate leases, margin-based financial services, life insurance',
    isSystemDefault: false,
    isActive: true,
    descriptionAr: 'معفى بموجب اللائحة التنفيذية لضريبة القيمة المضافة',
    descriptionEn: 'Exempt under Saudi VAT Executive Regulations',
    createdAt: '2018-01-01T00:00:00.000Z',
    updatedAt: '2020-07-01T00:00:00.000Z',
  },
  {
    id: 'tax-rate-outofscope',
    tenantId: 'system',
    code: 'OUT_OF_SCOPE',
    nameAr: 'خارج نطاق الضريبة (Out of Scope)',
    nameEn: 'Out of Scope',
    ratePercentage: 0,
    taxCategoryCode: 'O',
    exemptionReasonCode: 'VATEX-SA-OOS',
    exemptionReasonAr: 'الرسوم الحكومية والسيادية والتعويضات',
    exemptionReasonEn: 'Sovereign statutory government fees and compensations',
    isSystemDefault: false,
    isActive: true,
    descriptionAr: 'معاملات خارج النطاق الضريبي للنظام',
    descriptionEn: 'Transactions strictly outside the statutory VAT scope',
    createdAt: '2018-01-01T00:00:00.000Z',
    updatedAt: '2020-07-01T00:00:00.000Z',
  },
];

// ============================================================================
// 1. TAX DETERMINATION RESOLUTION ENGINE
// ============================================================================
/**
 * Resolves the applicable VAT rate and UN/ECE Category based on statutory precedence:
 * Order of Precedence:
 * 1. Line / Item Tax Category Override (e.g. EXEMPT, ZERO_RATED, 5%, 15%)
 * 2. Party Tax Category (Customer/Supplier: EXEMPT, ZERO_RATED for export, OUT_OF_SCOPE)
 * 3. Transaction Type (EXPORT -> ZERO_RATED, GOVERNMENT -> OUT_OF_SCOPE)
 * 4. Company Default Tax Rate (Default: 15% STANDARD)
 */
export function determineTaxRate(input: TaxDeterminationInput): TaxDeterminationResult {
  // 1. Line/Item Override
  if (input.itemTaxRateOverride !== undefined && input.itemTaxRateOverride !== null) {
    const rate = input.itemTaxRateOverride;
    if (rate === 15) {
      return {
        taxRatePercentage: 15,
        taxCategoryCode: 'S',
        resolvedSource: 'ITEM_OVERRIDE',
        descriptionAr: 'تطبيق النسبة 15% بناءً على تخصيص الصنف',
        descriptionEn: 'Standard 15% applied via item specification',
      };
    } else if (rate === 5) {
      return {
        taxRatePercentage: 5,
        taxCategoryCode: 'S',
        resolvedSource: 'ITEM_OVERRIDE',
        descriptionAr: 'تطبيق النسبة المخفضة 5% بناءً على تخصيص الصنف',
        descriptionEn: 'Reduced 5% applied via item specification',
      };
    } else if (rate === 0) {
      const isExempt = input.itemTaxCategory === 'EXEMPT';
      const isOos = input.itemTaxCategory === 'OUT_OF_SCOPE';
      return {
        taxRatePercentage: 0,
        taxCategoryCode: isExempt ? 'E' : isOos ? 'O' : 'Z',
        resolvedSource: 'ITEM_OVERRIDE',
        descriptionAr: isExempt ? 'معفى بناءً على تصنيف الصنف' : isOos ? 'خارج النطاق بناءً على الصنف' : 'نسبة الصفر 0% بناءً على الصنف',
        descriptionEn: isExempt ? 'Exempt via item override' : isOos ? 'Out of scope via item override' : 'Zero-rated via item override',
      };
    }
  }

  if (input.itemTaxCategory) {
    const cat = input.itemTaxCategory.toUpperCase();
    if (cat === 'EXEMPT' || cat === 'E') {
      return {
        taxRatePercentage: 0,
        taxCategoryCode: 'E',
        resolvedSource: 'ITEM_OVERRIDE',
        exemptionReasonCode: 'VATEX-SA-32',
        descriptionAr: 'معفى من الضريبة بناءً على تصنيف الصنف (كود E)',
        descriptionEn: 'Exempt based on item tax category (Code E)',
      };
    }
    if (cat === 'ZERO_RATED' || cat === 'Z' || cat === 'ZERO') {
      return {
        taxRatePercentage: 0,
        taxCategoryCode: 'Z',
        resolvedSource: 'ITEM_OVERRIDE',
        descriptionAr: 'خاضع لنسبة الصفر بناءً على تصنيف الصنف (كود Z)',
        descriptionEn: 'Zero-rated based on item tax category (Code Z)',
      };
    }
    if (cat === 'OUT_OF_SCOPE' || cat === 'O' || cat === 'OOS') {
      return {
        taxRatePercentage: 0,
        taxCategoryCode: 'O',
        resolvedSource: 'ITEM_OVERRIDE',
        descriptionAr: 'خارج نطاق الضريبة بناءً على تصنيف الصنف (كود O)',
        descriptionEn: 'Out of scope based on item tax category (Code O)',
      };
    }
    if (cat === 'REDUCED_5' || cat === '5') {
      return {
        taxRatePercentage: 5,
        taxCategoryCode: 'S',
        resolvedSource: 'ITEM_OVERRIDE',
        descriptionAr: 'نسبة مخفضة 5% بناءً على تصنيف الصنف',
        descriptionEn: 'Reduced 5% based on item tax category',
      };
    }
  }

  // 2. Party Tax Category (Customer / Supplier)
  if (input.partyTaxCategory) {
    const pCat = input.partyTaxCategory.toUpperCase();
    if (pCat === 'EXEMPT' || pCat === 'E') {
      return {
        taxRatePercentage: 0,
        taxCategoryCode: 'E',
        resolvedSource: 'PARTY_CATEGORY',
        exemptionReasonCode: 'VATEX-SA-32',
        descriptionAr: 'إعفاء ضريبي بناءً على تصنيف العميل/المورد',
        descriptionEn: 'Exempt based on party tax classification',
      };
    }
    if (pCat === 'ZERO_RATED' || pCat === 'Z' || pCat === 'EXPORT') {
      return {
        taxRatePercentage: 0,
        taxCategoryCode: 'Z',
        resolvedSource: 'PARTY_CATEGORY',
        descriptionAr: 'نسبة الصفر 0% بناءً على تصنيف الطرف (تصدير/دولي)',
        descriptionEn: 'Zero-rated based on party tax classification',
      };
    }
    if (pCat === 'OUT_OF_SCOPE' || pCat === 'O') {
      return {
        taxRatePercentage: 0,
        taxCategoryCode: 'O',
        resolvedSource: 'PARTY_CATEGORY',
        descriptionAr: 'خارج نطاق الضريبة بناءً على تصنيف الطرف',
        descriptionEn: 'Out of scope based on party tax classification',
      };
    }
  }

  // 3. Transaction Type
  if (input.transactionType === 'EXPORT_SALE') {
    return {
      taxRatePercentage: 0,
      taxCategoryCode: 'Z',
      resolvedSource: 'TRANSACTION_TYPE',
      descriptionAr: 'نسبة الصفر 0% لمعاملات التصدير الدولي',
      descriptionEn: 'Zero-rated 0% for international export sales',
    };
  }
  if (input.transactionType === 'GOVERNMENT_FEE') {
    return {
      taxRatePercentage: 0,
      taxCategoryCode: 'O',
      resolvedSource: 'TRANSACTION_TYPE',
      descriptionAr: 'خارج النطاق للرسوم والمدفوعات الحكومية',
      descriptionEn: 'Out of scope for statutory government fees',
    };
  }

  // 4. Company Default (Standard 15%)
  return {
    taxRatePercentage: 15,
    taxCategoryCode: 'S',
    resolvedSource: 'COMPANY_DEFAULT',
    descriptionAr: 'النسبة القياسية الافتراضية للمنشأة (15%)',
    descriptionEn: 'Company standard default VAT rate (15%)',
  };
}

// ============================================================================
// 2. EXACT PRICE DECOMPOSITION & LINE CALCULATION (Rules G7/G8)
// ============================================================================
export interface LineInput {
  lineId?: string;
  itemId?: string;
  quantity: number;
  unitPriceSar: number;
  discountPercent?: number;
  taxRatePercentage?: number;
  taxCategoryCode?: TaxCategoryCode;
  taxExemptionReasonCode?: string | null;
  isTaxInclusive?: boolean;
}

/**
 * Calculates a single line item with half-up halalas rounding (Rules G7/G8).
 */
export function calculateLineVat(input: LineInput): CalculatedLineVat {
  const lineId = input.lineId || `line-${Math.random().toString(36).substring(2, 9)}`;
  const qty = Math.max(0, input.quantity || 0);
  const rawPrice = Math.max(0, input.unitPriceSar || 0);
  const discPct = Math.min(100, Math.max(0, input.discountPercent || 0));
  const rate = input.taxRatePercentage !== undefined ? input.taxRatePercentage : 15;
  const category: TaxCategoryCode = input.taxCategoryCode || (rate === 15 || rate === 5 ? 'S' : rate === 0 ? 'Z' : 'S');
  const isInclusive = Boolean(input.isTaxInclusive);

  if (isInclusive && rate > 0) {
    // Tax-Inclusive Decomposition:
    // Gross = Qty * Price
    // Discount = roundHalfUp(Gross * discPct / 100)
    // Net Inclusive = Gross - Discount
    // Tax = roundHalfUp(Net Inclusive - (Net Inclusive / (1 + rate / 100)))
    // Taxable Net = Net Inclusive - Tax
    // Total = Taxable Net + Tax = Net Inclusive
    const grossInclusive = qty * rawPrice;
    const discountAmountSar = roundSar(grossInclusive * (discPct / 100));
    const netInclusive = roundSar(grossInclusive - discountAmountSar);

    const exactDivisor = 1 + rate / 100;
    const exactNet = netInclusive / exactDivisor;
    const rawTax = netInclusive - exactNet;
    const taxAmountSar = roundSar(rawTax);
    const taxableAmountSar = roundSar(netInclusive - taxAmountSar);
    const totalAmountSar = roundSar(taxableAmountSar + taxAmountSar);

    return {
      lineId,
      itemId: input.itemId,
      quantity: qty,
      unitPriceSar: rawPrice,
      discountPercent: discPct,
      discountAmountSar,
      grossAmountSar: roundSar(grossInclusive),
      taxableAmountSar,
      taxRatePercentage: rate,
      taxCategoryCode: category,
      taxExemptionReasonCode: input.taxExemptionReasonCode || null,
      taxAmountSar,
      totalAmountSar,
      isTaxInclusive: true,
    };
  }

  // Tax-Exclusive Decomposition:
  // Gross = Qty * Price
  // Discount = roundHalfUp(Gross * discPct / 100)
  // Taxable Net = Gross - Discount
  // Tax = roundHalfUp(Taxable Net * rate / 100)
  // Total = Taxable Net + Tax
  const grossAmount = qty * rawPrice;
  const discountAmountSar = roundSar(grossAmount * (discPct / 100));
  const taxableAmountSar = roundSar(grossAmount - discountAmountSar);
  const taxAmountSar = rate > 0 ? roundSar(taxableAmountSar * (rate / 100)) : 0;
  const totalAmountSar = roundSar(taxableAmountSar + taxAmountSar);

  return {
    lineId,
    itemId: input.itemId,
    quantity: qty,
    unitPriceSar: rawPrice,
    discountPercent: discPct,
    discountAmountSar,
    grossAmountSar: roundSar(grossAmount),
    taxableAmountSar,
    taxRatePercentage: rate,
    taxCategoryCode: category,
    taxExemptionReasonCode: input.taxExemptionReasonCode || null,
    taxAmountSar,
    totalAmountSar,
    isTaxInclusive: false,
  };
}

/**
 * Calculates document-level totals by summing rounded line amounts (no silent redistribution).
 */
export function calculateDocumentVatTotals(lines: CalculatedLineVat[]): {
  subtotalTaxableSar: number;
  totalDiscountSar: number;
  totalTaxSar: number;
  grandTotalSar: number;
  taxBreakdownByRate: Record<string, { taxableSar: number; taxSar: number; count: number }>;
  taxBreakdownByCategory: Record<TaxCategoryCode, { taxableSar: number; taxSar: number }>;
} {
  let subtotalTaxable = 0;
  let totalDiscount = 0;
  let totalTax = 0;
  let grandTotal = 0;

  const taxBreakdownByRate: Record<string, { taxableSar: number; taxSar: number; count: number }> = {};
  const taxBreakdownByCategory: Record<TaxCategoryCode, { taxableSar: number; taxSar: number }> = {
    S: { taxableSar: 0, taxSar: 0 },
    Z: { taxableSar: 0, taxSar: 0 },
    E: { taxableSar: 0, taxSar: 0 },
    O: { taxableSar: 0, taxSar: 0 },
  };

  for (const line of lines) {
    subtotalTaxable += line.taxableAmountSar;
    totalDiscount += line.discountAmountSar;
    totalTax += line.taxAmountSar;
    grandTotal += line.totalAmountSar;

    // Rate breakdown key (e.g. "15", "5", "0")
    const rateKey = `${line.taxRatePercentage}%`;
    if (!taxBreakdownByRate[rateKey]) {
      taxBreakdownByRate[rateKey] = { taxableSar: 0, taxSar: 0, count: 0 };
    }
    taxBreakdownByRate[rateKey].taxableSar = roundSar(taxBreakdownByRate[rateKey].taxableSar + line.taxableAmountSar);
    taxBreakdownByRate[rateKey].taxSar = roundSar(taxBreakdownByRate[rateKey].taxSar + line.taxAmountSar);
    taxBreakdownByRate[rateKey].count += 1;

    // Category breakdown
    const cat = line.taxCategoryCode || 'S';
    if (!taxBreakdownByCategory[cat]) {
      taxBreakdownByCategory[cat] = { taxableSar: 0, taxSar: 0 };
    }
    taxBreakdownByCategory[cat].taxableSar = roundSar(taxBreakdownByCategory[cat].taxableSar + line.taxableAmountSar);
    taxBreakdownByCategory[cat].taxSar = roundSar(taxBreakdownByCategory[cat].taxSar + line.taxAmountSar);
  }

  return {
    subtotalTaxableSar: roundSar(subtotalTaxable),
    totalDiscountSar: roundSar(totalDiscount),
    totalTaxSar: roundSar(totalTax),
    grandTotalSar: roundSar(grandTotal),
    taxBreakdownByRate,
    taxBreakdownByCategory,
  };
}

// ============================================================================
// 3. IMMUTABLE TAX SNAPSHOT CREATOR
// ============================================================================
/**
 * Freezes resolved tax parameters into an immutable snapshot on document confirmation.
 */
export function createTaxSnapshot(lines: CalculatedLineVat[]): TaxSnapshotLine[] {
  return lines.map((line) => ({
    lineId: line.lineId,
    itemId: line.itemId || 'custom-item',
    taxRatePercentage: line.taxRatePercentage,
    taxCategoryCode: line.taxCategoryCode,
    taxExemptionReasonCode: line.taxExemptionReasonCode || null,
    netAmountSar: line.taxableAmountSar,
    taxAmountSar: line.taxAmountSar,
    totalAmountSar: line.totalAmountSar,
    isTaxInclusive: line.isTaxInclusive,
  }));
}

/**
 * Creates reversed tax snapshot for a Credit Note or Debit Note matching the original document's snapshot.
 */
export function createCreditNoteTaxSnapshot(
  originalSnapshot: TaxSnapshotLine[],
  returnLines: Array<{ lineId: string; returnedQuantity: number; originalQuantity: number }>
): TaxSnapshotLine[] {
  const result: TaxSnapshotLine[] = [];

  for (const ret of returnLines) {
    const orig = originalSnapshot.find((s) => s.lineId === ret.lineId);
    if (!orig) continue;

    const ratio = ret.originalQuantity > 0 ? ret.returnedQuantity / ret.originalQuantity : 1;
    const netAmountSar = roundSar(orig.netAmountSar * ratio);
    const taxAmountSar = roundSar(orig.taxAmountSar * ratio);
    const totalAmountSar = roundSar(netAmountSar + taxAmountSar);

    result.push({
      lineId: `cn-${orig.lineId}`,
      itemId: orig.itemId,
      taxRatePercentage: orig.taxRatePercentage,
      taxCategoryCode: orig.taxCategoryCode,
      taxExemptionReasonCode: orig.taxExemptionReasonCode,
      netAmountSar,
      taxAmountSar,
      totalAmountSar,
      isTaxInclusive: orig.isTaxInclusive,
    });
  }

  return result;
}

// ============================================================================
// 4. VAT PERIOD SUMMARY & GL RECONCILIATION
// ============================================================================
/**
 * Aggregates a list of VAT ledger entries into a comprehensive Period VAT Return summary.
 */
export function buildVatPeriodSummary(
  entries: VatLedgerEntry[],
  tenantId: string,
  startDate: string,
  endDate: string
): VatPeriodSummary {
  let salesStandard15Taxable = 0;
  let salesStandard15Tax = 0;
  let salesReduced5Taxable = 0;
  let salesReduced5Tax = 0;
  let salesZeroRatedTaxable = 0;
  let salesExemptTaxable = 0;
  let salesOutOfScopeTaxable = 0;
  let salesCreditNotesTaxReversed = 0;
  let totalOutputTax = 0;
  let totalSalesNet = 0;
  let totalSalesGross = 0;

  let purchasesStandard15Taxable = 0;
  let purchasesStandard15Tax = 0;
  let purchasesReduced5Taxable = 0;
  let purchasesReduced5Tax = 0;
  let purchasesZeroRatedTaxable = 0;
  let purchasesExemptTaxable = 0;
  let purchasesLandedCostTax = 0;
  let purchasesDebitNotesTaxReversed = 0;
  let totalInputTaxRecoverable = 0;
  let totalPurchasesNet = 0;
  let totalPurchasesGross = 0;

  for (const entry of entries) {
    if (entry.vatType === 'OUTPUT') {
      if (entry.documentType === 'SALES_CREDIT_NOTE') {
        // Credit note reverses output tax
        salesCreditNotesTaxReversed += entry.taxAmountSar;
        totalOutputTax -= entry.taxAmountSar;
        totalSalesNet -= entry.taxableAmountSar;
        totalSalesGross -= entry.totalAmountSar;
      } else {
        totalOutputTax += entry.taxAmountSar;
        totalSalesNet += entry.taxableAmountSar;
        totalSalesGross += entry.totalAmountSar;

        if (entry.taxRatePercentage === 15) {
          salesStandard15Taxable += entry.taxableAmountSar;
          salesStandard15Tax += entry.taxAmountSar;
        } else if (entry.taxRatePercentage === 5) {
          salesReduced5Taxable += entry.taxableAmountSar;
          salesReduced5Tax += entry.taxAmountSar;
        } else if (entry.taxCategoryCode === 'Z') {
          salesZeroRatedTaxable += entry.taxableAmountSar;
        } else if (entry.taxCategoryCode === 'E') {
          salesExemptTaxable += entry.taxableAmountSar;
        } else if (entry.taxCategoryCode === 'O') {
          salesOutOfScopeTaxable += entry.taxableAmountSar;
        }
      }
    } else if (entry.vatType === 'INPUT') {
      if (entry.documentType === 'VENDOR_DEBIT_NOTE') {
        // Debit note reverses input tax
        purchasesDebitNotesTaxReversed += entry.taxAmountSar;
        totalInputTaxRecoverable -= entry.taxAmountSar;
        totalPurchasesNet -= entry.taxableAmountSar;
        totalPurchasesGross -= entry.totalAmountSar;
      } else {
        totalInputTaxRecoverable += entry.taxAmountSar;
        totalPurchasesNet += entry.taxableAmountSar;
        totalPurchasesGross += entry.totalAmountSar;

        if (entry.documentType === 'LANDED_COST') {
          purchasesLandedCostTax += entry.taxAmountSar;
        } else if (entry.taxRatePercentage === 15) {
          purchasesStandard15Taxable += entry.taxableAmountSar;
          purchasesStandard15Tax += entry.taxAmountSar;
        } else if (entry.taxRatePercentage === 5) {
          purchasesReduced5Taxable += entry.taxableAmountSar;
          purchasesReduced5Tax += entry.taxAmountSar;
        } else if (entry.taxCategoryCode === 'Z') {
          purchasesZeroRatedTaxable += entry.taxableAmountSar;
        } else if (entry.taxCategoryCode === 'E') {
          purchasesExemptTaxable += entry.taxableAmountSar;
        }
      }
    }
  }

  const roundedOutputTax = roundSar(totalOutputTax);
  const roundedInputTax = roundSar(totalInputTaxRecoverable);
  const netPosition = roundSar(roundedOutputTax - roundedInputTax);

  return {
    tenantId,
    startDate,
    endDate,
    salesStandard15TaxableSar: roundSar(salesStandard15Taxable),
    salesStandard15TaxSar: roundSar(salesStandard15Tax),
    salesReduced5TaxableSar: roundSar(salesReduced5Taxable),
    salesReduced5TaxSar: roundSar(salesReduced5Tax),
    salesZeroRatedTaxableSar: roundSar(salesZeroRatedTaxable),
    salesExemptTaxableSar: roundSar(salesExemptTaxable),
    salesOutOfScopeTaxableSar: roundSar(salesOutOfScopeTaxable),
    salesCreditNotesTaxReversedSar: roundSar(salesCreditNotesTaxReversed),
    totalOutputTaxSar: roundedOutputTax,
    totalSalesNetSar: roundSar(totalSalesNet),
    totalSalesGrossSar: roundSar(totalSalesGross),

    purchasesStandard15TaxableSar: roundSar(purchasesStandard15Taxable),
    purchasesStandard15TaxSar: roundSar(purchasesStandard15Tax),
    purchasesReduced5TaxableSar: roundSar(purchasesReduced5Taxable),
    purchasesReduced5TaxSar: roundSar(purchasesReduced5Tax),
    purchasesZeroRatedTaxableSar: roundSar(purchasesZeroRatedTaxable),
    purchasesExemptTaxableSar: roundSar(purchasesExemptTaxable),
    purchasesLandedCostTaxSar: roundSar(purchasesLandedCostTax),
    purchasesDebitNotesTaxReversedSar: roundSar(purchasesDebitNotesTaxReversed),
    totalInputTaxRecoverableSar: roundedInputTax,
    totalPurchasesNetSar: roundSar(totalPurchasesNet),
    totalPurchasesGrossSar: roundSar(totalPurchasesGross),

    netTaxPayableOrRefundableSar: netPosition,
    isRefundable: netPosition < 0,
  };
}

/**
 * Validates zero discrepancy between the Tax Ledger and General Ledger tax accounts (Rule G3).
 */
export function reconcileVatWithGl(params: {
  tenantId: string;
  asOfDate: string;
  taxLedgerOutputVatSar: number;
  taxLedgerInputVatSar: number;
  glOutputVatAccountBalanceSar: number; // Normal Credit -> Positive representation
  glInputVatAccountBalanceSar: number; // Normal Debit -> Positive representation
  glOutputVatAccountCode?: string;
  glInputVatAccountCode?: string;
}): VatReconciliationReport {
  const outputDiscrepancy = roundSar(
    Math.abs(params.taxLedgerOutputVatSar - params.glOutputVatAccountBalanceSar)
  );
  const inputDiscrepancy = roundSar(
    Math.abs(params.taxLedgerInputVatSar - params.glInputVatAccountBalanceSar)
  );

  const taxLedgerNet = roundSar(params.taxLedgerOutputVatSar - params.taxLedgerInputVatSar);
  const glNet = roundSar(params.glOutputVatAccountBalanceSar - params.glInputVatAccountBalanceSar);
  const netDiscrepancy = roundSar(Math.abs(taxLedgerNet - glNet));

  const isFullyReconciled = outputDiscrepancy === 0 && inputDiscrepancy === 0 && netDiscrepancy === 0;

  const notes: string[] = [];
  if (isFullyReconciled) {
    notes.push('مطابقة تامة 100%: تطابق كامل بين سجل ضريبة القيمة المضافة وحسابات الأستاذ العام بدون أي فروقات سنتية.');
    notes.push('Zero-discrepancy invariant verified: VAT Ledger matches GL tax control accounts to the exact Halala.');
  } else {
    if (outputDiscrepancy > 0) {
      notes.push(`توجد فجوة في ضريبة المخرجات قدرها ${outputDiscrepancy} ﷼.`);
    }
    if (inputDiscrepancy > 0) {
      notes.push(`توجد فجوة في ضريبة المدخلات قدرها ${inputDiscrepancy} ﷼.`);
    }
  }

  return {
    tenantId: params.tenantId,
    asOfDate: params.asOfDate,
    taxLedgerOutputVatSar: params.taxLedgerOutputVatSar,
    taxLedgerInputVatSar: params.taxLedgerInputVatSar,
    taxLedgerNetPositionSar: taxLedgerNet,
    glOutputVatAccountCode: params.glOutputVatAccountCode || '20301',
    glOutputVatAccountBalanceSar: params.glOutputVatAccountBalanceSar,
    glInputVatAccountCode: params.glInputVatAccountCode || '10301',
    glInputVatAccountBalanceSar: params.glInputVatAccountBalanceSar,
    glNetPositionSar: glNet,
    outputVatDiscrepancySar: outputDiscrepancy,
    inputVatDiscrepancySar: inputDiscrepancy,
    netDiscrepancySar: netDiscrepancy,
    isFullyReconciled,
    reconciliationStatus: isFullyReconciled ? 'PERFECT_MATCH' : 'DISCREPANCY_DETECTED',
    reconciliationNotes: notes,
  };
}

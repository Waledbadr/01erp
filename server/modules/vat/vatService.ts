/**
 * VAT & Tax Engine Service — Saudi ERP Backend
 * Implements business logic for:
 * - Rate registry (15%, 5%, 0%, Exempt, Out of Scope, Custom rates)
 * - Tax Determination Engine
 * - Tax Snapshot & Immutability validation
 * - VAT Ledger aggregation from posted sales, bills, expenses, landed cost, and credit/debit notes
 * - GL Tax reconciliation (Zero-discrepancy invariant)
 * - By-dimension tax analytics
 */

import { centralStore, TenantScopedRepository, TenantContext } from '../../core/tenantGuard.js';
import { logger } from '../../core/logger.js';
import {
  TaxRateDefinition,
  TaxSettings,
  TaxDeterminationInput,
  TaxDeterminationResult,
  CalculatedLineVat,
  TaxSnapshotLine,
  VatLedgerEntry,
  VatPeriodSummary,
  VatReconciliationReport,
  SYSTEM_DEFAULT_TAX_RATES,
  determineTaxRate,
  calculateLineVat,
  calculateDocumentVatTotals,
  createTaxSnapshot,
  buildVatPeriodSummary,
  reconcileVatWithGl,
} from '../../../src/lib/vat.js';
import { roundHalalas } from '../../../src/lib/accounting.js';

// In-memory tenant tax stores
const tenantTaxRatesMap = new Map<string, TaxRateDefinition[]>();
const tenantTaxSettingsMap = new Map<string, TaxSettings>();

/**
 * Ensures default tax rates and settings exist for a tenant.
 */
export function seedDefaultVatData(tenantId: string) {
  if (!tenantTaxRatesMap.has(tenantId)) {
    const rates: TaxRateDefinition[] = SYSTEM_DEFAULT_TAX_RATES.map((r) => ({
      ...r,
      id: `${tenantId}-${r.code}`,
      tenantId,
    }));
    tenantTaxRatesMap.set(tenantId, rates);
  }

  if (!tenantTaxSettingsMap.has(tenantId)) {
    const defaultSettings: TaxSettings = {
      tenantId,
      defaultTaxRateCode: 'VAT_15',
      defaultTaxRatePercentage: 15,
      defaultPricingPreference: 'EXCLUSIVE',
      roundingMethod: 'HALF_UP_LINE',
      roundingAccountId: 'acc-50402',
      roundingAccountCode: '50402',
      vatOutputAccountId: 'acc-20301',
      vatOutputAccountCode: '20301',
      vatInputAccountId: 'acc-10301',
      vatInputAccountCode: '10301',
      enforceTaxSnapshot: true,
      allowTaxExemptionWithoutReason: false,
      updatedAt: new Date().toISOString(),
      updatedBy: 'SYSTEM_SEED',
    };
    tenantTaxSettingsMap.set(tenantId, defaultSettings);
  }
}

// ============================================================================
// 1. TAX RATES REGISTRY CRUD
// ============================================================================
export function getTaxRatesService(tenantId: string): TaxRateDefinition[] {
  seedDefaultVatData(tenantId);
  return tenantTaxRatesMap.get(tenantId) || [];
}

export function getTaxRateByIdService(tenantId: string, rateId: string): TaxRateDefinition | undefined {
  const rates = getTaxRatesService(tenantId);
  return rates.find((r) => r.id === rateId || r.code === rateId);
}

export function createTaxRateService(
  tenantId: string,
  payload: Partial<TaxRateDefinition>,
  context: TenantContext
): TaxRateDefinition {
  const rates = getTaxRatesService(tenantId);

  if (!payload.code || !payload.nameAr || payload.ratePercentage === undefined) {
    throw new Error('Code, nameAr, and ratePercentage are required');
  }

  const existing = rates.find((r) => r.code.toUpperCase() === payload.code?.toUpperCase());
  if (existing) {
    throw new Error(`Tax rate code ${payload.code} already exists for this tenant`);
  }

  const newRate: TaxRateDefinition = {
    id: `tax-rate-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    tenantId,
    code: payload.code.toUpperCase(),
    nameAr: payload.nameAr,
    nameEn: payload.nameEn || payload.nameAr,
    ratePercentage: Number(payload.ratePercentage),
    taxCategoryCode: payload.taxCategoryCode || 'S',
    exemptionReasonCode: payload.exemptionReasonCode || null,
    exemptionReasonAr: payload.exemptionReasonAr || null,
    exemptionReasonEn: payload.exemptionReasonEn || null,
    effectiveFrom: payload.effectiveFrom || new Date().toISOString().split('T')[0],
    effectiveTo: payload.effectiveTo || null,
    isSystemDefault: false,
    isActive: payload.isActive !== false,
    isCustom: true,
    descriptionAr: payload.descriptionAr,
    descriptionEn: payload.descriptionEn,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  rates.push(newRate);
  tenantTaxRatesMap.set(tenantId, rates);

  logger.info(`[VAT] Created custom tax rate ${newRate.code} (${newRate.ratePercentage}%) for tenant ${tenantId}`, {
    tenantId,
    userEmail: context.userEmail,
  });

  return newRate;
}

export function updateTaxRateService(
  tenantId: string,
  rateId: string,
  payload: Partial<TaxRateDefinition>,
  context: TenantContext
): TaxRateDefinition {
  const rates = getTaxRatesService(tenantId);
  const index = rates.findIndex((r) => r.id === rateId || r.code === rateId);

  if (index === -1) {
    throw new Error(`Tax rate ${rateId} not found`);
  }

  const current = rates[index];
  const updated: TaxRateDefinition = {
    ...current,
    ...payload,
    id: current.id,
    tenantId: current.tenantId,
    updatedAt: new Date().toISOString(),
  };

  rates[index] = updated;
  tenantTaxRatesMap.set(tenantId, rates);

  logger.info(`[VAT] Updated tax rate ${updated.code} for tenant ${tenantId}`, {
    tenantId,
    userEmail: context.userEmail,
  });

  return updated;
}

export function deleteTaxRateService(
  tenantId: string,
  rateId: string,
  context: TenantContext
): boolean {
  const rates = getTaxRatesService(tenantId);
  const target = rates.find((r) => r.id === rateId || r.code === rateId);

  if (!target) {
    throw new Error(`Tax rate ${rateId} not found`);
  }

  if (target.isSystemDefault) {
    throw new Error('System default tax rates cannot be deleted. You may deactivate them instead.');
  }

  const filtered = rates.filter((r) => r.id !== target.id);
  tenantTaxRatesMap.set(tenantId, filtered);

  logger.info(`[VAT] Deleted custom tax rate ${target.code} for tenant ${tenantId}`, {
    tenantId,
    userEmail: context.userEmail,
  });

  return true;
}

// ============================================================================
// 2. VAT SETTINGS SERVICE
// ============================================================================
export function getVatSettingsService(tenantId: string): TaxSettings {
  seedDefaultVatData(tenantId);
  return tenantTaxSettingsMap.get(tenantId)!;
}

export function updateVatSettingsService(
  tenantId: string,
  payload: Partial<TaxSettings>,
  context: TenantContext
): TaxSettings {
  const current = getVatSettingsService(tenantId);
  const updated: TaxSettings = {
    ...current,
    ...payload,
    tenantId,
    updatedAt: new Date().toISOString(),
    updatedBy: context.userEmail,
  };

  tenantTaxSettingsMap.set(tenantId, updated);

  logger.info(`[VAT] Updated VAT settings for tenant ${tenantId}`, {
    tenantId,
    userEmail: context.userEmail,
    changes: payload,
  });

  return updated;
}

// ============================================================================
// 3. DETERMINATION & CALCULATION ENGINE
// ============================================================================
export function determineTaxService(
  tenantId: string,
  input: TaxDeterminationInput
): TaxDeterminationResult {
  return determineTaxRate(input);
}

export function calculateDocumentTaxService(
  tenantId: string,
  lines: Array<{
    lineId?: string;
    itemId?: string;
    quantity: number;
    unitPriceSar: number;
    discountPercent?: number;
    taxRatePercentage?: number;
    taxCategoryCode?: string;
    taxExemptionReasonCode?: string | null;
    isTaxInclusive?: boolean;
  }>,
  pricingPreference?: 'EXCLUSIVE' | 'INCLUSIVE'
) {
  const settings = getVatSettingsService(tenantId);
  const defaultInclusive = pricingPreference ? pricingPreference === 'INCLUSIVE' : settings.defaultPricingPreference === 'INCLUSIVE';

  const calculatedLines: CalculatedLineVat[] = lines.map((line) => {
    const isInclusive = line.isTaxInclusive !== undefined ? line.isTaxInclusive : defaultInclusive;
    return calculateLineVat({
      lineId: line.lineId,
      itemId: line.itemId,
      quantity: line.quantity,
      unitPriceSar: line.unitPriceSar,
      discountPercent: line.discountPercent,
      taxRatePercentage: line.taxRatePercentage !== undefined ? line.taxRatePercentage : settings.defaultTaxRatePercentage,
      taxCategoryCode: (line.taxCategoryCode as any) || 'S',
      taxExemptionReasonCode: line.taxExemptionReasonCode,
      isTaxInclusive: isInclusive,
    });
  });

  const totals = calculateDocumentVatTotals(calculatedLines);
  const snapshot = createTaxSnapshot(calculatedLines);

  return {
    lines: calculatedLines,
    totals,
    snapshot,
  };
}

// ============================================================================
// 4. VAT LEDGER AGGREGATION & DERIVATION
// ============================================================================
export function getVatLedgerService(
  tenantId: string,
  filters?: {
    startDate?: string;
    endDate?: string;
    vatType?: 'OUTPUT' | 'INPUT';
    taxCategoryCode?: string;
    documentType?: string;
  }
): VatLedgerEntry[] {
  seedDefaultVatData(tenantId);
  const entries: VatLedgerEntry[] = [];

  // 1. Output VAT from Sales Invoices (POSTED, PAID, PARTIALLY_PAID)
  const salesInvoices = centralStore.salesInvoices.get(tenantId) || [];
  for (const inv of salesInvoices) {
    if (inv.status === 'POSTED' || inv.status === 'PAID' || inv.status === 'PARTIALLY_PAID') {
      const snapshot = inv.taxSnapshot || inv.lines.map((l) => ({
        lineId: l.id,
        itemId: l.itemId,
        taxRatePercentage: l.taxRate,
        taxCategoryCode: (l.taxRate === 15 ? 'S' : l.taxRate === 5 ? 'S' : l.taxRate === 0 ? 'Z' : 'S') as any,
        netAmountSar: l.taxableAmountSar,
        taxAmountSar: l.taxAmountSar,
        totalAmountSar: l.totalAmountSar,
        isTaxInclusive: l.isTaxInclusive,
      }));

      entries.push({
        id: `vat-out-${inv.id}`,
        tenantId,
        branchId: inv.branchId,
        branchNameAr: inv.branchNameAr || 'الفرع الرئيسي',
        documentType: 'SALES_INVOICE',
        documentId: inv.id,
        documentNumber: inv.invoiceNumber,
        transactionDate: inv.issueDate,
        partyId: inv.customerId,
        partyNameAr: inv.customerNameAr,
        partyNameEn: inv.customerNameEn,
        partyVatNumber: inv.customerVatNumber,
        vatType: 'OUTPUT',
        taxCategoryCode: snapshot[0]?.taxCategoryCode || 'S',
        taxRatePercentage: snapshot[0]?.taxRatePercentage ?? 15,
        taxableAmountSar: inv.subtotalSar - inv.discountTotalSar,
        taxAmountSar: inv.taxTotalSar,
        totalAmountSar: inv.totalAmountSar,
        postedJournalId: inv.postedJournalId,
        postedJournalNumber: inv.postedJournalNumber,
        taxSnapshot: snapshot,
        createdAt: inv.createdAt,
      });
    }
  }

  // 2. Output VAT Reversal from Sales Credit Notes (POSTED)
  const salesCreditNotes = centralStore.salesCreditNotes.get(tenantId) || [];
  for (const cn of salesCreditNotes) {
    if (cn.status === 'POSTED') {
      const snapshot: TaxSnapshotLine[] = cn.lines.map((l) => ({
        lineId: l.id,
        itemId: l.itemId,
        taxRatePercentage: l.taxRate,
        taxCategoryCode: (l.taxRate === 15 ? 'S' : l.taxRate === 5 ? 'S' : 'Z') as any,
        netAmountSar: l.taxableAmountSar,
        taxAmountSar: l.taxAmountSar,
        totalAmountSar: l.totalAmountSar,
      }));

      entries.push({
        id: `vat-out-rev-${cn.id}`,
        tenantId,
        branchId: cn.branchId,
        branchNameAr: cn.branchNameAr || 'الفرع الرئيسي',
        documentType: 'SALES_CREDIT_NOTE',
        documentId: cn.id,
        documentNumber: cn.creditNoteNumber,
        transactionDate: cn.issueDate,
        partyId: cn.customerId,
        partyNameAr: cn.customerNameAr,
        partyNameEn: cn.customerNameEn,
        partyVatNumber: cn.customerVatNumber,
        vatType: 'OUTPUT', // Recorded as output reversal
        taxCategoryCode: snapshot[0]?.taxCategoryCode || 'S',
        taxRatePercentage: snapshot[0]?.taxRatePercentage ?? 15,
        taxableAmountSar: cn.subtotalSar,
        taxAmountSar: cn.taxTotalSar,
        totalAmountSar: cn.totalAmountSar,
        postedJournalId: cn.postedJournalId,
        postedJournalNumber: cn.postedJournalNumber,
        taxSnapshot: snapshot,
        createdAt: cn.createdAt,
      });
    }
  }

  // 3. Input VAT from Purchase Bills (POSTED, PAID, PARTIALLY_PAID)
  const purchaseBills = centralStore.purchaseBills.get(tenantId) || [];
  for (const bill of purchaseBills) {
    if (bill.status === 'POSTED' || bill.status === 'PAID' || bill.status === 'PARTIALLY_PAID') {
      const snapshot: TaxSnapshotLine[] = bill.lines.map((l) => ({
        lineId: l.id,
        itemId: l.itemId,
        taxRatePercentage: l.taxRate,
        taxCategoryCode: (l.taxRate === 15 ? 'S' : l.taxRate === 5 ? 'S' : 'Z') as any,
        netAmountSar: l.taxableAmountSar,
        taxAmountSar: l.taxAmountSar,
        totalAmountSar: l.totalAmountSar,
      }));

      entries.push({
        id: `vat-in-${bill.id}`,
        tenantId,
        branchId: bill.branchId,
        branchNameAr: bill.branchNameAr || 'الفرع الرئيسي',
        documentType: 'PURCHASE_BILL',
        documentId: bill.id,
        documentNumber: bill.billNumber,
        transactionDate: bill.issueDate,
        partyId: bill.supplierId,
        partyNameAr: bill.supplierNameAr,
        partyNameEn: bill.supplierNameEn,
        partyVatNumber: bill.supplierVatNumber,
        vatType: 'INPUT',
        taxCategoryCode: snapshot[0]?.taxCategoryCode || 'S',
        taxRatePercentage: snapshot[0]?.taxRatePercentage ?? 15,
        taxableAmountSar: bill.subtotalSar,
        taxAmountSar: bill.taxTotalSar,
        totalAmountSar: bill.totalAmountSar,
        postedJournalId: bill.postedJournalId,
        postedJournalNumber: bill.postedJournalNumber,
        taxSnapshot: snapshot,
        createdAt: bill.createdAt,
      });
    }
  }

  // 4. Input VAT Reversals from Vendor Debit Notes (POSTED)
  const vendorDebitNotes = centralStore.vendorDebitNotes.get(tenantId) || [];
  for (const dn of vendorDebitNotes) {
    if (dn.status === 'POSTED') {
      const snapshot: TaxSnapshotLine[] = dn.lines.map((l) => ({
        lineId: l.id,
        itemId: l.itemId,
        taxRatePercentage: l.taxRate,
        taxCategoryCode: (l.taxRate === 15 ? 'S' : l.taxRate === 5 ? 'S' : 'Z') as any,
        netAmountSar: l.taxableAmountSar,
        taxAmountSar: l.taxAmountSar,
        totalAmountSar: l.totalAmountSar,
      }));

      entries.push({
        id: `vat-in-rev-${dn.id}`,
        tenantId,
        branchId: dn.branchId,
        branchNameAr: (dn as any).branchNameAr || 'الفرع الرئيسي',
        documentType: 'VENDOR_DEBIT_NOTE',
        documentId: dn.id,
        documentNumber: dn.debitNoteNumber,
        transactionDate: dn.issueDate,
        partyId: dn.supplierId,
        partyNameAr: dn.supplierNameAr,
        partyNameEn: dn.supplierNameEn,
        partyVatNumber: dn.supplierVatNumber,
        vatType: 'INPUT',
        taxCategoryCode: snapshot[0]?.taxCategoryCode || 'S',
        taxRatePercentage: snapshot[0]?.taxRatePercentage ?? 15,
        taxableAmountSar: dn.subtotalSar,
        taxAmountSar: dn.taxTotalSar,
        totalAmountSar: dn.totalAmountSar,
        postedJournalId: dn.postedJournalId,
        postedJournalNumber: dn.postedJournalNumber,
        taxSnapshot: snapshot,
        createdAt: dn.createdAt,
      });
    }
  }

  // 5. Input VAT from Landed Costs Documents
  const landedCosts = centralStore.landedCostDocuments.get(tenantId) || [];
  for (const lc of landedCosts) {
    if (lc.status === 'POSTED') {
      const lcTaxSar = roundHalalas(lc.totalLandedCostSar * 0.15);
      entries.push({
        id: `vat-in-lc-${lc.id}`,
        tenantId,
        documentType: 'LANDED_COST',
        documentId: lc.id,
        documentNumber: lc.documentNumber,
        transactionDate: lc.createdAt.split('T')[0],
        partyNameAr: 'هيئة الزكاة والضريبة والجمارك / مخلص جمركي',
        partyNameEn: 'ZATCA / Customs Clearance',
        vatType: 'INPUT',
        taxCategoryCode: 'S',
        taxRatePercentage: 15,
        taxableAmountSar: lc.totalLandedCostSar,
        taxAmountSar: lcTaxSar,
        totalAmountSar: lc.totalLandedCostSar + lcTaxSar,
        postedJournalId: lc.journalId,
        taxSnapshot: [
          {
            lineId: `lc-line-${lc.id}`,
            itemId: 'landed-cost-service',
            taxRatePercentage: 15,
            taxCategoryCode: 'S',
            netAmountSar: lc.totalLandedCostSar,
            taxAmountSar: lcTaxSar,
            totalAmountSar: lc.totalLandedCostSar + lcTaxSar,
          },
        ],
        createdAt: lc.createdAt,
      });
    }
  }

  // Apply filters
  let filtered = entries;
  if (filters?.startDate) {
    filtered = filtered.filter((e) => e.transactionDate >= filters.startDate!);
  }
  if (filters?.endDate) {
    filtered = filtered.filter((e) => e.transactionDate <= filters.endDate!);
  }
  if (filters?.vatType) {
    filtered = filtered.filter((e) => e.vatType === filters.vatType);
  }
  if (filters?.taxCategoryCode) {
    filtered = filtered.filter((e) => e.taxCategoryCode === filters.taxCategoryCode);
  }
  if (filters?.documentType) {
    filtered = filtered.filter((e) => e.documentType === filters.documentType);
  }

  // Sort by date descending
  return filtered.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate) || b.createdAt.localeCompare(a.createdAt));
}

// ============================================================================
// 5. PERIOD SUMMARY & RECONCILIATION
// ============================================================================
export function getVatPeriodSummaryService(
  tenantId: string,
  startDate?: string,
  endDate?: string
): VatPeriodSummary {
  const start = startDate || '2026-01-01';
  const end = endDate || '2026-12-31';
  const entries = getVatLedgerService(tenantId, { startDate: start, endDate: end });

  return buildVatPeriodSummary(entries, tenantId, start, end);
}

export function getVatReconciliationService(
  tenantId: string,
  asOfDate?: string
): VatReconciliationReport {
  const cutoff = asOfDate || new Date().toISOString().split('T')[0];
  const summary = getVatPeriodSummaryService(tenantId, '2020-01-01', cutoff);

  // Compute GL balances directly from General Ledger journal entries
  const journals = centralStore.journals.get(tenantId) || [];
  let glOutputVatDebitCents = 0n;
  let glOutputVatCreditCents = 0n;
  let glInputVatDebitCents = 0n;
  let glInputVatCreditCents = 0n;

  for (const j of journals) {
    if (j.status === 'POSTED' && j.entryDate <= cutoff) {
      for (const l of j.lines) {
        if (l.accountCode === '20301' || l.accountCode === '210201' || l.accountNameAr?.includes('مخرجات') || l.accountNameEn?.toLowerCase().includes('output vat')) {
          glOutputVatDebitCents += l.debitCents;
          glOutputVatCreditCents += l.creditCents;
        }
        if (l.accountCode === '10301' || l.accountCode === '210202' || l.accountNameAr?.includes('مدخلات') || l.accountNameEn?.toLowerCase().includes('input vat')) {
          glInputVatDebitCents += l.debitCents;
          glInputVatCreditCents += l.creditCents;
        }
      }
    }
  }

  // Output VAT has normal CREDIT balance: Net Credit = Credit - Debit
  const glOutputVatNetCents = glOutputVatCreditCents - glOutputVatDebitCents;
  const glOutputVatBalanceSar = roundHalalas(Number(glOutputVatNetCents) / 100);

  // Input VAT has normal DEBIT balance: Net Debit = Debit - Credit
  const glInputVatNetCents = glInputVatDebitCents - glInputVatCreditCents;
  const glInputVatBalanceSar = roundHalalas(Number(glInputVatNetCents) / 100);

  return reconcileVatWithGl({
    tenantId,
    asOfDate: cutoff,
    taxLedgerOutputVatSar: summary.totalOutputTaxSar,
    taxLedgerInputVatSar: summary.totalInputTaxRecoverableSar,
    glOutputVatAccountBalanceSar: glOutputVatBalanceSar,
    glInputVatAccountBalanceSar: glInputVatBalanceSar,
    glOutputVatAccountCode: '20301',
    glInputVatAccountCode: '10301',
  });
}

// ============================================================================
// 6. BY-DIMENSION TAX ANALYTICS
// ============================================================================
export function getVatDimensionBreakdownService(
  tenantId: string,
  dimension: 'RATE' | 'CATEGORY' | 'CUSTOMER' | 'SUPPLIER' | 'BRANCH' | 'INVOICE',
  startDate?: string,
  endDate?: string
) {
  const entries = getVatLedgerService(tenantId, { startDate, endDate });
  const groups = new Map<string, { key: string; nameAr: string; taxableSar: number; taxSar: number; count: number; vatType: 'OUTPUT' | 'INPUT' }>();

  for (const e of entries) {
    let groupKey = '';
    let nameAr = '';

    if (dimension === 'RATE') {
      groupKey = `${e.vatType}_${e.taxRatePercentage}%`;
      nameAr = `${e.vatType === 'OUTPUT' ? 'مبيعات' : 'مشتريات'} - نسبة ${e.taxRatePercentage}%`;
    } else if (dimension === 'CATEGORY') {
      groupKey = `${e.vatType}_${e.taxCategoryCode}`;
      nameAr = `${e.vatType === 'OUTPUT' ? 'مخرجات' : 'مدخلات'} - فئة ${e.taxCategoryCode}`;
    } else if (dimension === 'CUSTOMER') {
      if (e.vatType !== 'OUTPUT') continue;
      groupKey = e.partyId || e.partyNameAr;
      nameAr = e.partyNameAr;
    } else if (dimension === 'SUPPLIER') {
      if (e.vatType !== 'INPUT') continue;
      groupKey = e.partyId || e.partyNameAr;
      nameAr = e.partyNameAr;
    } else if (dimension === 'BRANCH') {
      groupKey = e.branchId || 'main-branch';
      nameAr = e.branchNameAr || 'الفرع الرئيسي';
    } else if (dimension === 'INVOICE') {
      groupKey = e.documentNumber;
      nameAr = `${e.documentType}: ${e.documentNumber}`;
    }

    const existing = groups.get(groupKey) || {
      key: groupKey,
      nameAr,
      taxableSar: 0,
      taxSar: 0,
      count: 0,
      vatType: e.vatType,
    };

    const multiplier = (e.documentType === 'SALES_CREDIT_NOTE' || e.documentType === 'VENDOR_DEBIT_NOTE') ? -1 : 1;
    existing.taxableSar = roundHalalas(existing.taxableSar + e.taxableAmountSar * multiplier);
    existing.taxSar = roundHalalas(existing.taxSar + e.taxAmountSar * multiplier);
    existing.count += 1;

    groups.set(groupKey, existing);
  }

  return Array.from(groups.values());
}

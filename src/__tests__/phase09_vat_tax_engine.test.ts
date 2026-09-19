import { describe, it, expect, beforeEach } from 'vitest';
import { centralStore, TenantScopedRepository, TenantContext } from '../../server/core/tenantGuard.js';
import {
  determineTaxRate,
  calculateLineVat,
  calculateDocumentVatTotals,
  createTaxSnapshot,
  createCreditNoteTaxSnapshot,
  buildVatPeriodSummary,
  reconcileVatWithGl,
  SYSTEM_DEFAULT_TAX_RATES,
  VatLedgerEntry,
} from '../lib/vat.js';
import { toHalalasInt, fromHalalasInt, roundHalalas, roundSar } from '../lib/accounting.js';
import {
  getTaxRatesService,
  createTaxRateService,
  updateTaxRateService,
  getVatSettingsService,
  updateVatSettingsService,
  getVatLedgerService,
  getVatPeriodSummaryService,
  getVatReconciliationService,
} from '../../server/modules/vat/vatService.js';

describe('Phase 09: Saudi VAT & Tax Engine (Statutory System of Truth)', () => {
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

  // ==========================================================================
  // 1. Tax Determination Precedence Resolution (Order of Precedence)
  // ==========================================================================
  describe('1. Tax Determination Order of Precedence', () => {
    it('precedence 1: line/item override takes absolute priority over customer category and defaults', () => {
      const res = determineTaxRate({
        itemTaxCategory: 'EXEMPT',
        partyTaxCategory: 'STANDARD_15',
        transactionType: 'DOMESTIC_SALE',
      });

      expect(res.resolvedSource).toBe('ITEM_OVERRIDE');
      expect(res.taxCategoryCode).toBe('E');
      expect(res.taxRatePercentage).toBe(0);
    });

    it('precedence 1: item 5% reduced rate overrides standard customer', () => {
      const res = determineTaxRate({
        itemTaxRateOverride: 5,
        partyTaxCategory: 'STANDARD_15',
      });

      expect(res.resolvedSource).toBe('ITEM_OVERRIDE');
      expect(res.taxCategoryCode).toBe('S');
      expect(res.taxRatePercentage).toBe(5);
    });

    it('precedence 2: party tax category takes priority over transaction type when item has no override', () => {
      const res = determineTaxRate({
        itemTaxCategory: null,
        partyTaxCategory: 'ZERO_RATED', // e.g. international diplomatic or free zone
        transactionType: 'DOMESTIC_SALE',
      });

      expect(res.resolvedSource).toBe('PARTY_CATEGORY');
      expect(res.taxCategoryCode).toBe('Z');
      expect(res.taxRatePercentage).toBe(0);
    });

    it('precedence 3: transaction type (e.g. Export sale) applies zero rating if party has no override', () => {
      const res = determineTaxRate({
        itemTaxCategory: null,
        partyTaxCategory: null,
        transactionType: 'EXPORT_SALE',
      });

      expect(res.resolvedSource).toBe('TRANSACTION_TYPE');
      expect(res.taxCategoryCode).toBe('Z');
      expect(res.taxRatePercentage).toBe(0);
    });

    it('precedence 4: falls back to company standard default 15% when no overrides exist', () => {
      const res = determineTaxRate({
        itemTaxCategory: null,
        partyTaxCategory: null,
        transactionType: 'DOMESTIC_SALE',
      });

      expect(res.resolvedSource).toBe('COMPANY_DEFAULT');
      expect(res.taxCategoryCode).toBe('S');
      expect(res.taxRatePercentage).toBe(15);
    });
  });

  // ==========================================================================
  // 2. Exact Price Decomposition (Inclusive vs Exclusive) (Rules G7/G8)
  // ==========================================================================
  describe('2. Exact Price Decomposition & Line Calculations', () => {
    it('calculates standard 15% exclusive pricing exactly', () => {
      // 3 units @ 100.00 SAR each, 10% discount
      // Gross = 300.00, Discount = 30.00, Taxable = 270.00, Tax = 40.50, Total = 310.50
      const line = calculateLineVat({
        quantity: 3,
        unitPriceSar: 100,
        discountPercent: 10,
        taxRatePercentage: 15,
        isTaxInclusive: false,
      });

      expect(line.grossAmountSar).toBe(300);
      expect(line.discountAmountSar).toBe(30);
      expect(line.taxableAmountSar).toBe(270);
      expect(line.taxAmountSar).toBe(40.5);
      expect(line.totalAmountSar).toBe(310.5);
    });

    it('decomposes tax-inclusive pricing with exact half-up halalas math', () => {
      // 1 unit @ 115.00 SAR inclusive
      // Tax = 115 - (115 / 1.15) = 15.00 SAR, Taxable = 100.00 SAR, Total = 115.00 SAR
      const line = calculateLineVat({
        quantity: 1,
        unitPriceSar: 115,
        taxRatePercentage: 15,
        isTaxInclusive: true,
      });

      expect(line.taxAmountSar).toBe(15);
      expect(line.taxableAmountSar).toBe(100);
      expect(line.totalAmountSar).toBe(115);
    });

    it('handles tricky fractional inclusive amounts with zero drift', () => {
      // 1 unit @ 10.00 SAR inclusive at 15%
      // Divisor = 1.15
      // Raw Tax = 10 - (10 / 1.15) = 10 - 8.695652... = 1.304347... -> Half-Up: 1.30 SAR
      // Taxable = 10.00 - 1.30 = 8.70 SAR
      // Total = 8.70 + 1.30 = 10.00 SAR
      const line = calculateLineVat({
        quantity: 1,
        unitPriceSar: 10,
        taxRatePercentage: 15,
        isTaxInclusive: true,
      });

      expect(line.taxAmountSar).toBe(1.3);
      expect(line.taxableAmountSar).toBe(8.7);
      expect(line.totalAmountSar).toBe(10);
    });
  });

  // ==========================================================================
  // 3. Mixed Rates on One Document & Sum of Rounded Lines
  // ==========================================================================
  describe('3. Mixed Rates on Single Invoice (15% + 5% + 0% + Exempt)', () => {
    it('sums mixed rate lines without redistribution or drift', () => {
      const line1 = calculateLineVat({
        lineId: 'l1',
        quantity: 1,
        unitPriceSar: 100, // 15% standard -> 15.00 tax
        taxRatePercentage: 15,
        taxCategoryCode: 'S',
      });

      const line2 = calculateLineVat({
        lineId: 'l2',
        quantity: 1,
        unitPriceSar: 200, // 5% reduced -> 10.00 tax
        taxRatePercentage: 5,
        taxCategoryCode: 'S',
      });

      const line3 = calculateLineVat({
        lineId: 'l3',
        quantity: 1,
        unitPriceSar: 300, // 0% zero rated -> 0.00 tax
        taxRatePercentage: 0,
        taxCategoryCode: 'Z',
      });

      const line4 = calculateLineVat({
        lineId: 'l4',
        quantity: 1,
        unitPriceSar: 400, // Exempt -> 0.00 tax
        taxRatePercentage: 0,
        taxCategoryCode: 'E',
      });

      const totals = calculateDocumentVatTotals([line1, line2, line3, line4]);

      expect(totals.subtotalTaxableSar).toBe(1000);
      expect(totals.totalTaxSar).toBe(25); // 15.00 + 10.00 + 0 + 0
      expect(totals.grandTotalSar).toBe(1025);

      // Verify category breakdown
      expect(totals.taxBreakdownByCategory.S.taxSar).toBe(25);
      expect(totals.taxBreakdownByCategory.S.taxableSar).toBe(300);
      expect(totals.taxBreakdownByCategory.Z.taxableSar).toBe(300);
      expect(totals.taxBreakdownByCategory.E.taxableSar).toBe(400);
    });
  });

  // ==========================================================================
  // 4. Deterministic Half-Cent Rounding Cases (Rules G7/G8)
  // ==========================================================================
  describe('4. Deterministic Half-Cent Rounding Cases', () => {
    it('rounds 0.005 half-up to 0.01 and 0.0049 down to 0.00', () => {
      // Half-up rounding test on SAR amounts
      const testVal1 = roundSar(0.005);
      expect(testVal1).toBe(0.01);

      const testVal2 = roundSar(0.0049);
      expect(testVal2).toBe(0.0);

      const testVal3 = roundSar(1.505);
      expect(testVal3).toBe(1.51);
    });
  });

  // ==========================================================================
  // 5. Immutability of Document Tax Snapshots
  // ==========================================================================
  describe('5. Immutable Tax Snapshots Post-Posting', () => {
    it('freezes tax snapshot on document and config changes do not alter posted document', () => {
      const line = calculateLineVat({
        lineId: 'line-post-1',
        itemId: 'item-frozen-1',
        quantity: 2,
        unitPriceSar: 100,
        taxRatePercentage: 15,
        taxCategoryCode: 'S',
      });

      const snapshot = createTaxSnapshot([line]);
      expect(snapshot[0].taxRatePercentage).toBe(15);
      expect(snapshot[0].taxAmountSar).toBe(30);

      // Simulate system tax rate modification in settings
      updateVatSettingsService(
        tenantId,
        { defaultTaxRatePercentage: 20 },
        context
      );

      // The document's frozen snapshot must remain 15% and 30 SAR
      expect(snapshot[0].taxRatePercentage).toBe(15);
      expect(snapshot[0].taxAmountSar).toBe(30);
      expect(snapshot[0].totalAmountSar).toBe(230);
    });
  });

  // ==========================================================================
  // 6. Credit Note / Debit Note Proportional Reversal
  // ==========================================================================
  describe('6. Credit Note / Debit Note Tax Snapshot Reversals', () => {
    it('creates exact proportional credit note tax reversal from original snapshot', () => {
      const originalLines = [
        calculateLineVat({
          lineId: 'line-orig-1',
          itemId: 'item-1',
          quantity: 10,
          unitPriceSar: 100,
          taxRatePercentage: 15,
        }),
      ];
      const origSnapshot = createTaxSnapshot(originalLines);

      // Return 3 out of 10 items
      const cnSnapshot = createCreditNoteTaxSnapshot(origSnapshot, [
        { lineId: 'line-orig-1', returnedQuantity: 3, originalQuantity: 10 },
      ]);

      expect(cnSnapshot).toHaveLength(1);
      expect(cnSnapshot[0].netAmountSar).toBe(300);
      expect(cnSnapshot[0].taxAmountSar).toBe(45);
      expect(cnSnapshot[0].totalAmountSar).toBe(345);
    });
  });

  // ==========================================================================
  // 7. VAT Ledger Reconciliation with GL (Zero Discrepancy Invariant)
  // ==========================================================================
  describe('7. VAT Ledger Reconciliation & GL Invariant (Rule G3)', () => {
    it('reports perfect match when Tax Ledger equals GL tax accounts', () => {
      const recon = reconcileVatWithGl({
        tenantId,
        asOfDate: '2026-12-31',
        taxLedgerOutputVatSar: 1500,
        taxLedgerInputVatSar: 600,
        glOutputVatAccountBalanceSar: 1500,
        glInputVatAccountBalanceSar: 600,
      });

      expect(recon.isFullyReconciled).toBe(true);
      expect(recon.outputVatDiscrepancySar).toBe(0);
      expect(recon.inputVatDiscrepancySar).toBe(0);
      expect(recon.netDiscrepancySar).toBe(0);
      expect(recon.reconciliationStatus).toBe('PERFECT_MATCH');
    });

    it('detects and flags discrepancies if GL balances differ from Tax Ledger', () => {
      const recon = reconcileVatWithGl({
        tenantId,
        asOfDate: '2026-12-31',
        taxLedgerOutputVatSar: 1500,
        taxLedgerInputVatSar: 600,
        glOutputVatAccountBalanceSar: 1490, // 10 SAR gap
        glInputVatAccountBalanceSar: 600,
      });

      expect(recon.isFullyReconciled).toBe(false);
      expect(recon.outputVatDiscrepancySar).toBe(10);
      expect(recon.reconciliationStatus).toBe('DISCREPANCY_DETECTED');
    });
  });

  // ==========================================================================
  // 8. Re-run Phase 06/07 Purchasing & Landed Cost Tax Invariants
  // ==========================================================================
  describe('8. Purchasing & Landed Cost Tax Invariants', () => {
    it('verifies 15% VAT on merchandise purchase bill', () => {
      const billLine = calculateLineVat({
        quantity: 50,
        unitPriceSar: 80, // Subtotal 4000.00
        taxRatePercentage: 15,
      });

      expect(billLine.taxableAmountSar).toBe(4000);
      expect(billLine.taxAmountSar).toBe(600);
      expect(billLine.totalAmountSar).toBe(4600);
    });

    it('verifies 15% recoverable input VAT on landed cost customs clearance', () => {
      const lcTaxable = 1200.0;
      const lcTax = roundHalalas(lcTaxable * 0.15);
      expect(lcTax).toBe(180.0);
    });
  });
});

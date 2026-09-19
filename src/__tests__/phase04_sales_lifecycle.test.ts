import { describe, it, expect, beforeEach } from 'vitest';
import {
  centralStore,
  TenantScopedRepository,
} from '../../server/core/tenantGuard.js';
import {
  calculateInvoiceLine,
  calculateInvoiceTotals,
  buildZatcaQRForInvoice,
  roundHalalas,
  toHalalasInt,
} from '../lib/sales.js';
import { decodeZatcaQR } from '../lib/zatca.js';

describe('PHASE-04 & PHASE-05: Sales Lifecycle, Tax Invoices & ZATCA Phase 2 E-Invoicing Engine', () => {
  let tenantId: string;
  let adminRepo: TenantScopedRepository;
  let cashierRepo: TenantScopedRepository;

  beforeEach(() => {
    centralStore.initDefaultSeed();

    const demoTenant = Array.from(centralStore.tenants.values())[0];
    tenantId = demoTenant.id;

    adminRepo = new TenantScopedRepository({
      userId: 'user-admin-01',
      tenantId,
      userEmail: 'admin@al-inma.sa',
      role: 'OWNER',
      roleCode: 'OWNER',
      permissions: ['*'],
      ipAddress: '127.0.0.1',
      userAgent: 'Vitest Test Agent',
    });

    cashierRepo = new TenantScopedRepository({
      userId: 'user-cashier-01',
      tenantId,
      userEmail: 'cashier@al-inma.sa',
      role: 'CASHIER',
      roleCode: 'CASHIER',
      permissions: ['sales:invoice:view', 'sales:invoice:create', 'sales:invoice:post', 'pos:order:create'],
      ipAddress: '127.0.0.1',
      userAgent: 'Vitest Test Agent',
    });
  });

  // ====================================================
  // 1. FIXED-POINT FINANCIAL ARITHMETIC (Rules G7/G8)
  // ====================================================
  describe('Financial Arithmetic & Line Halalas Rounding', () => {
    it('calculates invoice line taxable amount, 15% VAT, and line total with half-up halalas rounding', () => {
      // 3 items @ 33.33 SAR each = 99.99 SAR gross
      // 10% discount = 10.00 SAR discount -> taxable = 89.99 SAR
      // 15% VAT on 89.99 SAR = 13.4985 SAR -> rounds half-up to 13.50 SAR
      // Total = 89.99 + 13.50 = 103.49 SAR
      const calc = calculateInvoiceLine({
        quantity: 3,
        unitPriceSar: 33.33,
        discountPercent: 10,
        taxRate: 15,
        conversionFactor: 1,
      });

      expect(calc.discountAmountSar).toBe(10.00);
      expect(calc.taxableAmountSar).toBe(89.99);
      expect(calc.taxAmountSar).toBe(13.50);
      expect(calc.totalAmountSar).toBe(103.49);
      expect(calc.baseQuantity).toBe(3);
    });

    it('calculates multi-UOM conversion correctly (carton of 24 units)', () => {
      // 5 cartons with conversion factor 24 = 120 base units
      const calc = calculateInvoiceLine({
        quantity: 5,
        unitPriceSar: 48.00,
        discountPercent: 0,
        taxRate: 15,
        conversionFactor: 24,
      });

      expect(calc.baseQuantity).toBe(120);
      expect(calc.taxableAmountSar).toBe(240.00);
      expect(calc.taxAmountSar).toBe(36.00);
      expect(calc.totalAmountSar).toBe(276.00);
    });

    it('calculates invoice grand totals and Halalas integer representation', () => {
      const line1 = calculateInvoiceLine({ quantity: 10, unitPriceSar: 15.00, discountPercent: 0, taxRate: 15 });
      const line2 = calculateInvoiceLine({ quantity: 2, unitPriceSar: 50.00, discountPercent: 5, taxRate: 15 });

      const totals = calculateInvoiceTotals([line1, line2]);

      expect(totals.subtotalSar).toBe(250.00);
      expect(totals.discountTotalSar).toBe(5.00);
      expect(totals.taxTotalSar).toBe(36.75);
      expect(totals.totalAmountSar).toBe(281.75);
      expect(totals.totalAmountHalalas).toBe('28175');
    });
  });

  // ====================================================
  // 2. ZATCA PHASE 1 & 2 TLV QR CODE ENCODING
  // ====================================================
  describe('ZATCA TLV Base64 QR Code Generator', () => {
    it('generates a valid TLV QR Code with seller name, VAT number, timestamp, total, and VAT', () => {
      const qrBase64 = buildZatcaQRForInvoice({
        sellerName: 'شركة التقنية المتقدمة المحدودة',
        sellerVatNumber: '300000000000003',
        timestamp: '2026-09-17T12:00:00Z',
        totalWithVat: 115.00,
        vatTotal: 15.00,
      });

      expect(qrBase64).toBeDefined();
      expect(qrBase64.length).toBeGreaterThan(20);

      // Decode and verify the 5 mandatory TLV tags
      const decoded = decodeZatcaQR(qrBase64);
      expect(decoded.sellerName).toBe('شركة التقنية المتقدمة المحدودة');
      expect(decoded.vatNumber).toBe('300000000000003');
      expect(decoded.timestamp).toBe('2026-09-17T12:00:00Z');
      expect(decoded.invoiceTotal).toBe('115.00');
      expect(decoded.vatTotal).toBe('15.00');
    });
  });

  // ====================================================
  // 3. INVOICE CREATION & GL JOURNAL POSTING (Rule G1)
  // ====================================================
  describe('Standard & Simplified Invoices Creation & GL Posting', () => {
    it('creates a standard B2B invoice as draft and posts to GL with exact debits=credits balance', async () => {
      const customers = centralStore.customers.get(tenantId)!;
      const b2bCust = customers.find((c) => c.type === 'COMPANY' || c.type === 'ESTABLISHMENT') || customers[0];
      const items = centralStore.items.get(tenantId)!;
      const item = items[0];

      const inv = await adminRepo.createSalesInvoice({
        invoiceType: 'STANDARD_B2B',
        customerId: b2bCust.id,
        paymentMethod: 'CREDIT_ACCOUNT',
        postImmediately: false,
        lines: [
          {
            itemId: item.id,
            quantity: 5,
            unitPriceSar: 20.00,
            discountPercent: 0,
            taxRate: 15,
          },
        ],
      });

      expect(inv.status).toBe('DRAFT');
      expect(inv.invoiceNumber).toMatch(/^INV-\d{4}-\d{5}$/);
      expect(inv.totalAmountSar).toBe(115.00); // 100 + 15 VAT

      // Stock has not been deducted yet
      const initialStock = item.currentStock;

      // Post the invoice
      const posted = await adminRepo.postSalesInvoice(inv.id);
      expect(posted.status).toBe('POSTED');
      expect(posted.postedJournalNumber).toBeDefined();
      expect(posted.invoiceHash).toBeDefined();

      // Verify stock was deducted by baseQuantity
      const updatedItem = centralStore.items.get(tenantId)!.find((i) => i.id === item.id)!;
      expect(updatedItem.currentStock).toBe(initialStock - 5);

      // Verify GL Journal was generated and balances
      const journals = centralStore.journals.get(tenantId)!;
      const jv = journals.find((j) => j.id === posted.postedJournalId);
      expect(jv).toBeDefined();

      let debits = 0n;
      let credits = 0n;
      for (const line of jv!.lines) {
        debits += line.debitCents;
        credits += line.creditCents;
      }
      expect(debits).toBe(credits);
      expect(debits > 0n).toBe(true);
    });

    it('creates a simplified B2C invoice and posts immediately with Mada payment', async () => {
      const customers = centralStore.customers.get(tenantId)!;
      const b2cCust = customers.find((c) => c.type === 'INDIVIDUAL') || customers[0];
      const items = centralStore.items.get(tenantId)!;
      const item = items[0];

      const inv = await adminRepo.createSalesInvoice({
        invoiceType: 'SIMPLIFIED_B2C',
        customerId: b2cCust.id,
        paymentMethod: 'MADA',
        postImmediately: true,
        lines: [
          {
            itemId: item.id,
            quantity: 2,
            unitPriceSar: 18.50,
            discountPercent: 0,
            taxRate: 15,
          },
        ],
      });

      expect(inv.status).toBe('POSTED');
      expect(inv.invoiceNumber).toMatch(/^SIMP-\d{4}-\d{5}$/);
      expect(inv.postedJournalNumber).toBeDefined();
    });
  });

  // ====================================================
  // 4. CREDIT NOTES & SALES RETURNS (Reversal & Stock Restoral)
  // ====================================================
  describe('Sales Credit Notes (Returns & Reversals)', () => {
    it('issues a credit note against a posted invoice, returns stock, and posts reversal journal', async () => {
      const customers = centralStore.customers.get(tenantId)!;
      const items = centralStore.items.get(tenantId)!;
      const item = items[0];

      // 1. Create and post original invoice for 10 units
      const inv = await adminRepo.createSalesInvoice({
        invoiceType: 'STANDARD_B2B',
        customerId: customers[0].id,
        paymentMethod: 'CREDIT_ACCOUNT',
        postImmediately: true,
        lines: [
          {
            itemId: item.id,
            quantity: 10,
            unitPriceSar: 25.00,
            taxRate: 15,
          },
        ],
      });

      const stockAfterSale = item.currentStock;

      // 2. Issue Credit Note for 3 units return
      const creditNote = await adminRepo.createSalesCreditNote({
        originalInvoiceId: inv.id,
        reasonCode: 'RETURN_OF_GOODS',
        reasonDescription: 'استرجاع ٣ وحدات تالفة',
        lines: [
          {
            itemId: item.id,
            quantity: 3,
            unitPriceSar: 25.00,
          },
        ],
      });

      expect(creditNote.creditNoteNumber).toMatch(/^CN-\d{4}-\d{5}$/);
      expect(creditNote.status).toBe('POSTED');
      expect(creditNote.subtotalSar).toBe(75.00);
      expect(creditNote.taxTotalSar).toBe(11.25);
      expect(creditNote.totalAmountSar).toBe(86.25);

      // Verify stock was returned (+3)
      const stockAfterReturn = centralStore.items.get(tenantId)!.find((i) => i.id === item.id)!.currentStock;
      expect(stockAfterReturn).toBe(stockAfterSale + 3);

      // Verify reversal GL journal is balanced
      const journals = centralStore.journals.get(tenantId)!;
      const jv = journals.find((j) => j.id === creditNote.postedJournalId);
      expect(jv).toBeDefined();

      let debits = 0n;
      let credits = 0n;
      for (const line of jv!.lines) {
        debits += line.debitCents;
        credits += line.creditCents;
      }
      expect(debits).toBe(credits);
      expect(debits > 0n).toBe(true);
    });
  });

  // ====================================================
  // 5. SALES QUOTATIONS & CONVERSION TO INVOICE
  // ====================================================
  describe('Sales Quotations & Conversion Workflow', () => {
    it('creates a quotation and converts it to a standard tax invoice', async () => {
      const customers = centralStore.customers.get(tenantId)!;
      const items = centralStore.items.get(tenantId)!;

      const quote = adminRepo.createSalesQuotation({
        customerId: customers[0].id,
        notes: 'عرض سعر خاص ساري 15 يوماً',
        lines: [
          {
            itemId: items[0].id,
            quantity: 20,
            unitPriceSar: 12.50,
            discountPercent: 10,
          },
        ],
      });

      expect(quote.quotationNumber).toMatch(/^QT-\d{4}-\d{5}$/);
      expect(quote.status).toBe('DRAFT');

      // Convert to invoice
      const invoice = await adminRepo.convertQuotationToInvoice(quote.id);
      expect(invoice).toBeDefined();
      expect(invoice.invoiceNumber).toMatch(/^INV-\d{4}-\d{5}$/);

      // Verify quotation status transitioned to CONVERTED
      const updatedQuote = adminRepo.getSalesQuotations().find((q) => q.id === quote.id)!;
      expect(updatedQuote.status).toBe('CONVERTED');
      expect(updatedQuote.convertedInvoiceId).toBe(invoice.id);
    });
  });

  // ====================================================
  // 6. SECURITY & RULE C (Cost Price Redaction)
  // ====================================================
  describe('Security & Sensitive Cost Redaction (Rule C)', () => {
    it('strips cost price for users lacking accounting:cost:view permission', () => {
      const cashierInvoices = cashierRepo.getSalesInvoices();
      expect(cashierInvoices.length).toBeGreaterThan(0);

      // Lines must NOT have costPriceSar exposed to cashier
      for (const inv of cashierInvoices) {
        for (const line of inv.lines) {
          expect(line.costPriceSar).toBeUndefined();
        }
      }

      // Admin CAN view costPriceSar
      const adminInvoices = adminRepo.getSalesInvoices();
      const lineWithCost = adminInvoices[0].lines[0];
      expect(lineWithCost.costPriceSar).toBeDefined();
    });
  });
});

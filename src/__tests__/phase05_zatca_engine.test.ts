import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateZatcaQR,
  decodeZatcaQR,
  validateSaudiVatNumber,
  generateUBL21Xml,
  canonicalizeInvoiceXml,
  calculateInvoiceHash,
  generateDigitalSignature,
  validateZatcaCompliance,
  ZATCA_INITIAL_PIH_HASH,
} from '../lib/zatca';
import { centralStore, TenantContext } from '../../server/core/tenantGuard';
import {
  getZatcaConfigService,
  generateZatcaCsrService,
  onboardComplianceCsidService,
  onboardProductionCsidService,
  switchZatcaEnvironmentService,
  transmitInvoiceToZatcaService,
  getZatcaQueueService,
  retryZatcaQueueJobService,
  decodeZatcaQrService,
} from '../../server/modules/zatca/zatcaService';
import {
  createSalesInvoiceService,
  postSalesInvoiceService,
} from '../../server/modules/sales/salesService';
import { createCustomerService } from '../../server/modules/parties/partyService';

describe('PHASE 05: ZATCA Phase 2 E-Invoicing Engine & TLV Verification', () => {
  let demoTenantId: string;
  const mockUserId = 'usr-admin-01';
  let mockContext: TenantContext;

  beforeEach(() => {
    centralStore.initDefaultSeed();
    const demoTenant = Array.from(centralStore.tenants.values())[0];
    demoTenantId = demoTenant.id;
    mockContext = {
      tenantId: demoTenantId,
      userId: mockUserId,
      userEmail: 'admin@sauditech.com.sa',
      role: 'OWNER',
      permissions: [
        'sales:invoice:create',
        'sales:invoice:view',
        'sales:invoice:post',
        'sales:customer:manage',
        'accounting:journal:post',
        'settings:zatca:manage',
        'settings:zatca:production_switch',
      ],
    };
  });

  describe('1. ZATCA TLV 9-Tag Encoding, Decoding & VAT Validation', () => {
    it('validates 15-digit Saudi VAT numbers starting and ending with 3 (BR-KSA-05)', () => {
      expect(validateSaudiVatNumber('300000000000003').isValid).toBe(true);
      expect(validateSaudiVatNumber('310123456700003').isValid).toBe(true);
      
      // Invalid formats
      expect(validateSaudiVatNumber('100000000000003').isValid).toBe(false); // Does not start with 3
      expect(validateSaudiVatNumber('300000000000001').isValid).toBe(false); // Does not end with 3
      expect(validateSaudiVatNumber('30000000003').isValid).toBe(false); // Not 15 digits
      expect(validateSaudiVatNumber('30000000000000A').isValid).toBe(false); // Non-digit
    });

    it('encodes and decodes full 9-Tag Phase 2 TLV QR Code without data loss', () => {
      const input = {
        sellerName: 'شركة التقنية المتقدمة المحدودة',
        vatNumber: '300000000000003',
        timestamp: '2026-09-18T12:00:00Z',
        invoiceTotal: '1150.00',
        vatTotal: '150.00',
        invoiceHash: 'i9G8K3+8X9vWz4A5P8Lq4v1+xW7t5L==',
        digitalSignature: 'MEQCIA1234567890abcdef...',
        publicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...',
        certificateSignature: 'ZATCA-CERT-STAMP-TEST-001',
      };

      const qr = generateZatcaQR(input);
      expect(qr.base64).toBeDefined();
      expect(qr.tags.length).toBe(9);

      // Verify all 9 tag numbers exist
      for (let t = 1; t <= 9; t++) {
        expect(qr.tags.some((tag) => tag.tag === t)).toBe(true);
      }

      // Decode QR
      const decoded = decodeZatcaQR(qr.base64);
      expect(decoded.isValid).toBe(true);
      expect(decoded.sellerName).toBe(input.sellerName);
      expect(decoded.vatNumber).toBe(input.vatNumber);
      expect(decoded.timestamp).toBe(input.timestamp);
      expect(decoded.invoiceTotal).toBe(input.invoiceTotal);
      expect(decoded.vatTotal).toBe(input.vatTotal);
      expect(decoded.invoiceHash).toBe(input.invoiceHash);
      expect(decoded.digitalSignature).toBe(input.digitalSignature);
      expect(decoded.publicKey).toBe(input.publicKey);
      expect(decoded.certificateSignature).toBe(input.certificateSignature);
    });

    it('fails gracefully on corrupted or malformed base64 TLV strings', () => {
      const result = decodeZatcaQrService('Invalid-Not-Base64!@#');
      expect(result.isValid).toBe(false);
      expect(result.validationErrors.length).toBeGreaterThan(0);
    });
  });

  describe('2. UBL 2.1 XML Generation, Canonicalization & SHA-256 Hashing', () => {
    it('generates standard B2B UBL 2.1 XML with seller, buyer, line items, and VAT breakdown', async () => {
      const xml = generateUBL21Xml({
        uuid: 'inv-uuid-001',
        invoiceNumber: 'INV-2026-00001',
        invoiceType: 'STANDARD_B2B',
        documentTypeCode: '388',
        issueDate: '2026-09-18',
        issueTime: '12:30:00',
        previousInvoiceHash: ZATCA_INITIAL_PIH_HASH,
        invoiceCounter: 1,
        seller: {
          nameAr: 'شركة التقنية المتقدمة المحدودة',
          vatNumber: '300000000000003',
          crNumber: '1010000000',
          streetName: 'طريق الملك فهد',
          buildingNumber: '1234',
          postalZone: '12211',
          district: 'العليا',
          cityName: 'الرياض',
        },
        buyer: {
          nameAr: 'شركة المقاولات العامة',
          vatNumber: '310123456700003',
          crNumber: '1010999999',
          streetName: 'شارع الملك عبدالعزيز',
          buildingNumber: '5678',
          postalZone: '12345',
          district: 'الملز',
          cityName: 'الرياض',
        },
        subtotalSar: 1000,
        discountTotalSar: 0,
        taxTotalSar: 150,
        totalAmountSar: 1150,
        lines: [
          {
            id: 'line-1',
            nameAr: 'خادم سحابي مخصص',
            quantity: 1,
            unitCode: 'PCE',
            unitPriceSar: 1000,
            taxableAmountSar: 1000,
            taxRate: 15,
            taxAmountSar: 150,
            totalAmountSar: 1150,
          },
        ],
      });

      expect(xml).toContain('<cbc:ProfileID>reporting:1.0</cbc:ProfileID>');
      expect(xml).toContain('<cbc:ID>INV-2026-00001</cbc:ID>');
      expect(xml).toContain('<cbc:InvoiceTypeCode name="0100000">388</cbc:InvoiceTypeCode>');
      expect(xml).toContain(ZATCA_INITIAL_PIH_HASH);
      expect(xml).toContain('<cbc:CompanyID>300000000000003</cbc:CompanyID>');
      expect(xml).toContain('<cbc:CompanyID>310123456700003</cbc:CompanyID>');

      // Canonicalization & Hashing
      const canonical = canonicalizeInvoiceXml(xml);
      expect(canonical).not.toContain('<?xml');
      
      const hash = await calculateInvoiceHash(xml);
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(20);
    });

    it('generates credit note UBL 2.1 XML (TypeCode 381) with BillingReference', () => {
      const xml = generateUBL21Xml({
        uuid: 'cn-uuid-001',
        invoiceNumber: 'CN-2026-00001',
        invoiceType: 'STANDARD_B2B',
        documentTypeCode: '381',
        issueDate: '2026-09-18',
        issueTime: '14:00:00',
        previousInvoiceHash: 'some-prev-hash',
        invoiceCounter: 2,
        seller: {
          nameAr: 'شركة التقنية المتقدمة المحدودة',
          vatNumber: '300000000000003',
          streetName: 'طريق الملك فهد',
          buildingNumber: '1234',
          postalZone: '12211',
          district: 'العليا',
          cityName: 'الرياض',
        },
        billingReference: {
          originalInvoiceNumber: 'INV-2026-00001',
          adjustmentReasonDescription: 'مردودات مبيعات جزئية',
        },
        subtotalSar: 200,
        discountTotalSar: 0,
        taxTotalSar: 30,
        totalAmountSar: 230,
        lines: [
          {
            id: 'line-1',
            nameAr: 'خدمة مسترجعة',
            quantity: 1,
            unitPriceSar: 200,
            taxableAmountSar: 200,
            taxRate: 15,
            taxAmountSar: 30,
            totalAmountSar: 230,
          },
        ],
      });

      expect(xml).toContain('<cbc:InvoiceTypeCode name="0100000">381</cbc:InvoiceTypeCode>');
      expect(xml).toContain('<cac:BillingReference>');
      expect(xml).toContain('<cbc:ID>INV-2026-00001</cbc:ID>');
      expect(xml).toContain('مردودات مبيعات جزئية');
    });
  });

  describe('3. BR-KSA Compliance Validation Engine', () => {
    it('passes compliant invoice with 100% compliance score', () => {
      const compliance = validateZatcaCompliance({
        invoiceNumber: 'INV-2026-00001',
        invoiceType: 'STANDARD_B2B',
        issueDate: '2026-09-18',
        sellerVatNumber: '300000000000003',
        buyerVatNumber: '310123456700003',
        subtotalSar: 1000,
        taxTotalSar: 150,
        totalAmountSar: 1150,
        previousInvoiceHash: ZATCA_INITIAL_PIH_HASH,
        qrCodeBase64: 'valid-base64-qr-code-placeholder-for-testing-purposes-1234567890',
        lines: [
          {
            quantity: 1,
            unitPriceSar: 1000,
            taxableAmountSar: 1000,
            taxRate: 15,
            taxAmountSar: 150,
            totalAmountSar: 1150,
          },
        ],
      });

      expect(compliance.isCompliant).toBe(true);
      expect(compliance.scorePercentage).toBe(100);
      expect(compliance.failedCount).toBe(0);
    });

    it('fails BR-KSA-09 when buyer VAT is missing or invalid on Standard B2B invoice', () => {
      const compliance = validateZatcaCompliance({
        invoiceNumber: 'INV-2026-00001',
        invoiceType: 'STANDARD_B2B',
        issueDate: '2026-09-18',
        sellerVatNumber: '300000000000003',
        buyerVatNumber: undefined, // Missing on B2B
        subtotalSar: 1000,
        taxTotalSar: 150,
        totalAmountSar: 1150,
        previousInvoiceHash: ZATCA_INITIAL_PIH_HASH,
        qrCodeBase64: 'valid-base64-qr-code-placeholder-for-testing-purposes-1234567890',
        lines: [
          {
            quantity: 1,
            unitPriceSar: 1000,
            taxableAmountSar: 1000,
            taxRate: 15,
            taxAmountSar: 150,
            totalAmountSar: 1150,
          },
        ],
      });

      expect(compliance.isCompliant).toBe(false);
      const failedRule = compliance.rules.find((r) => r.ruleCode === 'BR-KSA-09');
      expect(failedRule?.status).toBe('FAILED');
    });

    it('fails BR-KSA-25 when grand total does not balance with subtotal + tax', () => {
      const compliance = validateZatcaCompliance({
        invoiceNumber: 'INV-2026-00001',
        invoiceType: 'SIMPLIFIED_B2C',
        issueDate: '2026-09-18',
        sellerVatNumber: '300000000000003',
        subtotalSar: 1000,
        taxTotalSar: 150,
        totalAmountSar: 1200, // Discrepancy (expected 1150)
        previousInvoiceHash: ZATCA_INITIAL_PIH_HASH,
        qrCodeBase64: 'valid-base64-qr-code-placeholder-for-testing-purposes-1234567890',
        lines: [
          {
            quantity: 1,
            unitPriceSar: 1000,
            taxableAmountSar: 1000,
            taxRate: 15,
            taxAmountSar: 150,
            totalAmountSar: 1150,
          },
        ],
      });

      expect(compliance.isCompliant).toBe(false);
      const failedRule = compliance.rules.find((r) => r.ruleCode === 'BR-KSA-25');
      expect(failedRule?.status).toBe('FAILED');
    });
  });

  describe('4. CSID Onboarding & Lifecycle Management', () => {
    it('generates PKCS#10 CSR with standard X.509 subject attributes', () => {
      const config = generateZatcaCsrService(
        centralStore,
        demoTenantId,
        mockUserId,
        'admin@sauditech.com.sa',
        {
          egsSerialNumber: 'EGS1-SAUDI-ERP-001',
          organizationUnit: 'الفرع الرئيسي',
        }
      );

      expect(config.status).toBe('CSR_GENERATED');
      expect(config.csr).toContain('-----BEGIN CERTIFICATE REQUEST-----');
      expect(config.csr).toContain('-----END CERTIFICATE REQUEST-----');
    });

    it('completes Compliance CSID (CCSID) onboarding with OTP', () => {
      // 1. Generate CSR first
      generateZatcaCsrService(centralStore, demoTenantId, mockUserId, 'admin@sauditech.com.sa', {});

      // 2. Onboard CCSID
      const config = onboardComplianceCsidService(
        centralStore,
        demoTenantId,
        mockUserId,
        'admin@sauditech.com.sa',
        '123456'
      );

      expect(config.status).toBe('COMPLIANCE_ACTIVE');
      expect(config.complianceCsid).toBeDefined();
      expect(config.complianceSecret).toBeDefined();
      expect(config.complianceRequestId).toBeDefined();
    });

    it('onboards Production CSID (PCSID) after compliance is active', () => {
      const config = onboardProductionCsidService(
        centralStore,
        demoTenantId,
        mockUserId,
        'admin@sauditech.com.sa'
      );

      expect(config.status).toBe('PRODUCTION_ACTIVE');
      expect(config.productionCsid).toBeDefined();
      expect(config.productionSecret).toBeDefined();
    });

    it('protects environment switching with sensitive permission check', () => {
      // Denies switch to PRODUCTION without permission
      expect(() => {
        switchZatcaEnvironmentService(
          centralStore,
          demoTenantId,
          mockUserId,
          'admin@sauditech.com.sa',
          'PRODUCTION',
          false
        );
      }).toThrowError(/Permission denied/);

      // Allows switch to PRODUCTION with permission
      const switched = switchZatcaEnvironmentService(
        centralStore,
        demoTenantId,
        mockUserId,
        'admin@sauditech.com.sa',
        'PRODUCTION',
        true
      );
      expect(switched.environment).toBe('PRODUCTION');
    });
  });

  describe('5. End-to-End Invoice Cryptographic Chaining & ZATCA Transmission', () => {
    it('chains PIH from first invoice to second invoice seamlessly upon posting', async () => {
      // 1. Create a B2B Customer
      const customer = createCustomerService(
        centralStore,
        demoTenantId,
        mockUserId,
        'admin@sauditech.com.sa',
        {
          nameAr: 'مؤسسة الحلول المتقدمة للتجارة',
          nameEn: 'Advanced Solutions Trading Est.',
          type: 'COMPANY',
          vatNumber: '310987654300003',
          mobile: '+966509998877',
          address: {
            city: 'الرياض',
            street: 'طريق الملك فهد',
            buildingNumber: '1234',
            postalCode: '12345',
            district: 'العليا',
          },
        }
      );

      const items = centralStore.items.get(demoTenantId) || [];
      const item = items[0];

      // 2. Create Invoice #1 (Standard B2B)
      const inv1 = await createSalesInvoiceService(centralStore, mockContext, {
        customerId: customer.id,
        invoiceType: 'STANDARD_B2B',
        paymentMethod: 'CASH',
        lines: [
          {
            itemId: item.id,
            quantity: 1,
            unitPriceSar: 100,
          },
        ],
      });

      // Post Invoice #1
      const posted1 = await postSalesInvoiceService(centralStore, mockContext, inv1.id);
      expect(posted1.status).toBe('POSTED');
      expect(posted1.previousInvoiceHash).toBe(ZATCA_INITIAL_PIH_HASH);
      expect(posted1.invoiceHash).toBeDefined();
      expect(posted1.ublXml).toBeDefined();
      expect(posted1.digitalSignature).toBeDefined();
      expect(posted1.publicKey).toBeDefined();
      expect(posted1.qrCodeBase64).toBeDefined();

      // Verify decoded QR code of Invoice #1 contains all Phase 2 tags
      const qr1Decoded = decodeZatcaQR(posted1.qrCodeBase64);
      expect(qr1Decoded.isValid).toBe(true);
      expect(qr1Decoded.invoiceHash).toBe(posted1.invoiceHash);
      expect(qr1Decoded.digitalSignature).toBe(posted1.digitalSignature);
      expect(qr1Decoded.publicKey).toBe(posted1.publicKey);

      // 3. Create Invoice #2 (Standard B2B)
      const inv2 = await createSalesInvoiceService(centralStore, mockContext, {
        customerId: customer.id,
        invoiceType: 'STANDARD_B2B',
        paymentMethod: 'CASH',
        lines: [
          {
            itemId: item.id,
            quantity: 2,
            unitPriceSar: 100,
          },
        ],
      });

      // Post Invoice #2
      const posted2 = await postSalesInvoiceService(centralStore, mockContext, inv2.id);
      expect(posted2.status).toBe('POSTED');

      // CRITICAL: Invoice #2 PIH must equal Invoice #1 hash!
      expect(posted2.previousInvoiceHash).toBe(posted1.invoiceHash);
      expect(posted2.invoiceHash).not.toBe(posted1.invoiceHash);

      // 4. Transmit Invoice #1 to ZATCA via Clearance API
      const job1 = await transmitInvoiceToZatcaService(centralStore, mockContext, posted1.id);
      expect(job1.transmissionType).toBe('CLEARANCE');
      expect(job1.status).toBe('CLEARED');
      expect(job1.clearanceStatus).toBe('CLEARED');
      expect(job1.responseStatusCode).toBe(200);

      // Verify queue records job
      const queue = getZatcaQueueService(demoTenantId);
      expect(queue.length).toBeGreaterThan(0);
      expect(queue.some((j) => j.id === job1.id)).toBe(true);
    });
  });
});

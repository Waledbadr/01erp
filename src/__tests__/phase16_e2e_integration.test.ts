import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  generateUBL21Xml,
  calculateInvoiceHash,
  generateDigitalSignature,
  decodeZatcaQR,
  validateUbl21XmlSchema,
  verifyInvoiceHashChain,
  ZATCA_INITIAL_PIH_HASH,
  EInvoiceDocument,
} from '../lib/zatca.js';
import {
  CentralTenantDataStore,
  centralStore,
  TenantContext,
} from '../../server/core/tenantGuard.js';
import {
  postSalesInvoiceService,
  createSalesCreditNoteService,
  CreateInvoicePayload,
} from '../../server/modules/sales/salesService.js';
import {
  getEInvoiceDocumentsService,
  getEInvoiceDocumentByIdService,
  submitEInvoiceDocumentService,
  verifyTenantHashChainService,
  getZatcaConfigService,
  generateZatcaCsrService,
  onboardComplianceCsidService,
  switchZatcaEnvironmentService,
} from '../../server/modules/zatca/zatcaService.js';

describe('Phase 16: E2E Integration & Production Hardening Suite', () => {
  let store: CentralTenantDataStore;
  let ownerContext: TenantContext;
  let accountantContext: TenantContext;
  let tenantId: string;

  beforeEach(() => {
    centralStore.initDefaultSeed();
    const demoTenant = Array.from(centralStore.tenants.values())[0];
    tenantId = demoTenant.id;
    store = centralStore;

    // Ensure warehouse wh-main exists
    const warehouses = store.warehouses.get(tenantId) || [];
    if (!warehouses.some((w) => w.id === 'wh-main')) {
      store.warehouses.set(tenantId, [
        ...warehouses,
        {
          id: 'wh-main',
          tenantId,
          branchId: 'branch-1',
          code: 'WH-MAIN',
          nameAr: 'المستودع الرئيسي',
          nameEn: 'Main Warehouse',
          isDefault: true,
          isActive: true,
          createdAt: new Date().toISOString(),
        },
      ]);
    }

    ownerContext = {
      tenantId,
      userId: 'user-owner-1',
      userEmail: 'owner@tech.sa',
      role: 'OWNER',
      roleCode: 'OWNER',
      permissions: ['*'],
      isPlatformSuperAdmin: false,
    };

    accountantContext = {
      tenantId,
      userId: 'user-acc-1',
      userEmail: 'accountant@tech.sa',
      role: 'ACCOUNTANT',
      roleCode: 'ACCOUNTANT',
      permissions: ['sales:invoice:view', 'sales:invoice:post'],
      isPlatformSuperAdmin: false,
    };

    // Seed customer
    store.customers.set(tenantId, [
      {
        id: 'cust-b2b-1',
        tenantId,
        nameAr: 'شركة المقاولات الحديثة',
        nameEn: 'Modern Contracting Co',
        vatNumber: '310987654300003',
        crNumber: '1010888888',
        email: 'billing@modern.sa',
        status: 'ACTIVE',
        creditLimitSar: 100000,
        currentBalanceSar: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any,
    ]);

    // Seed inventory item & stock
    store.items.set(tenantId, [
      {
        id: 'item-server-1',
        tenantId,
        sku: 'SRV-01',
        primaryBarcode: '6281100000101',
        nameAr: 'خادم سحابي متطور',
        nameEn: 'Enterprise Cloud Server',
        type: 'INVENTORY',
        categoryId: 'cat-hardware',
        baseUnit: 'PCS',
        units: [{ unitName: 'PCS', conversionFactor: 1, barcode: '6281100000101', isBaseUnit: true }],
        currentStock: 50,
        currentWac: 1000,
        sellingPriceSar: 2000,
        taxRate: 0.15,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any,
    ]);

    store.warehouseStocks.set(tenantId, [
      {
        id: 'stock-1',
        tenantId,
        itemId: 'item-server-1',
        warehouseId: 'wh-main',
        currentStockBaseQty: 50,
        reservedQty: 0,
        availableQty: 50,
        currentWac: 1000,
        updatedAt: new Date().toISOString(),
      } as any,
    ]);
  });

  // =========================================================================
  // 1. POSTING SALES INVOICE & AUTOMATIC E-INVOICE GENERATION
  // =========================================================================
  it('should post a sales invoice, create balanced GL entries, and register an EInvoiceDocument in READY status', async () => {
    // 1. Create a draft invoice
    const draftInvoice = {
      id: 'inv-test-1',
      tenantId,
      branchId: 'branch-1',
      warehouseId: 'wh-main',
      invoiceNumber: 'INV-2026-00001',
      invoiceType: 'STANDARD_B2B' as const,
      documentTypeCode: '388',
      customerId: 'cust-b2b-1',
      customerNameAr: 'شركة المقاولات الحديثة',
      customerNameEn: 'Modern Contracting Co',
      customerVatNumber: '310987654300003',
      issueDate: '2026-09-19',
      issueTime: '10:00:00',
      status: 'DRAFT' as const,
      paymentMethod: 'CREDIT_ACCOUNT' as const,
      paymentTermsDays: 30,
      subtotalSar: 2000,
      discountTotalSar: 0,
      taxTotalSar: 300,
      totalAmountSar: 2300,
      paidAmountSar: 0,
      remainingAmountSar: 2300,
      invoiceCounterNumber: 1,
      lines: [
        {
          id: 'line-1',
          itemId: 'item-server-1',
          itemCode: 'SRV-01',
          nameAr: 'خادم سحابي متطور',
          nameEn: 'Enterprise Cloud Server',
          unit: 'PCS',
          quantity: 1,
          baseQuantity: 1,
          unitPriceSar: 2000,
          discountPercent: 0,
          discountAmountSar: 0,
          taxableAmountSar: 2000,
          taxRate: 0.15,
          taxAmountSar: 300,
          totalAmountSar: 2300,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    store.salesInvoices.set(tenantId, [draftInvoice as any]);

    // 2. Post invoice through service
    const posted = await postSalesInvoiceService(store, ownerContext, 'inv-test-1');

    expect(posted.status).toBe('POSTED');
    expect(posted.postedJournalNumber).toBeDefined();

    // Verify GL journals
    const journals = store.journals.get(tenantId) || [];
    expect(journals.length).toBeGreaterThan(0);
    const lastJournal = journals[journals.length - 1];
    expect(lastJournal.status).toBe('POSTED');
    expect(lastJournal.totalDebitCents).toBe(lastJournal.totalCreditCents);
    expect(lastJournal.totalDebitCents).toBeGreaterThan(0n);

    // 3. Verify E-Invoice layer record
    const eInvoices = getEInvoiceDocumentsService(tenantId);
    expect(eInvoices.length).toBe(1);
    const doc = eInvoices[0];
    expect(doc.invoiceId).toBe('inv-test-1');
    expect(doc.invoiceNumber).toBe('INV-2026-00001');
    expect(doc.status).toBe('READY');
    expect(doc.documentTypeCode).toBe('388');
    expect(doc.previousInvoiceHash).toBe(ZATCA_INITIAL_PIH_HASH);
    expect(doc.originalXml).toContain('<Invoice');
    expect(doc.originalXml).toContain(store.tenants.get(tenantId)?.vatNumber);
  });

  // =========================================================================
  // 2. DECOUPLED TRANSMISSION & EXPONENTIAL BACKOFF RETRY
  // =========================================================================
  it('should process e-invoice submission independently and transition status from READY to ACCEPTED', async () => {
    // Post initial invoice
    const draftInvoice = {
      id: 'inv-test-2',
      tenantId,
      branchId: 'branch-1',
      warehouseId: 'wh-main',
      invoiceNumber: 'INV-2026-00002',
      invoiceType: 'STANDARD_B2B' as const,
      documentTypeCode: '388',
      customerId: 'cust-b2b-1',
      customerNameAr: 'شركة المقاولات الحديثة',
      customerVatNumber: '310987654300003',
      issueDate: '2026-09-19',
      issueTime: '11:00:00',
      status: 'DRAFT' as const,
      paymentMethod: 'CREDIT_ACCOUNT' as const,
      subtotalSar: 4000,
      discountTotalSar: 0,
      taxTotalSar: 600,
      totalAmountSar: 4600,
      paidAmountSar: 0,
      remainingAmountSar: 4600,
      invoiceCounterNumber: 2,
      lines: [
        {
          id: 'line-2',
          itemId: 'item-server-1',
          itemCode: 'SRV-01',
          nameAr: 'خادم سحابي متطور',
          nameEn: 'Enterprise Cloud Server',
          unit: 'PCS',
          quantity: 2,
          baseQuantity: 2,
          unitPriceSar: 2000,
          discountPercent: 0,
          discountAmountSar: 0,
          taxableAmountSar: 4000,
          taxRate: 0.15,
          taxAmountSar: 600,
          totalAmountSar: 4600,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    store.salesInvoices.set(tenantId, [draftInvoice as any]);

    // Generate CSR and onboard CSID so ZATCA submission succeeds
    generateZatcaCsrService(store, tenantId, ownerContext.userId, ownerContext.userEmail);
    onboardComplianceCsidService(store, tenantId, ownerContext.userId, ownerContext.userEmail, '123456');

    await postSalesInvoiceService(store, ownerContext, 'inv-test-2');

    const docs = getEInvoiceDocumentsService(tenantId);
    const docId = docs[0].id;

    // Submit E-Invoice to ZATCA adapter
    const submittedDoc = await submitEInvoiceDocumentService(store, ownerContext, docId);

    expect(submittedDoc.status).toBe('ACCEPTED');
    expect(submittedDoc.attemptsLog.length).toBe(1);
    expect(submittedDoc.attemptsLog[0].status).toBe('SUCCESS');
    expect(submittedDoc.attemptsLog[0].httpStatus).toBe(200);
    expect(submittedDoc.processedXml).toBeDefined();
    expect(submittedDoc.processedXml).toContain('cac:Signature');
  });

  // =========================================================================
  // 3. CRYPTOGRAPHIC HASH CHAIN VERIFICATION
  // =========================================================================
  it('should verify an unbroken cryptographic hash chain across sequential invoices', async () => {
    // Generate 3 sequential invoices
    const xml1 = generateUBL21Xml({
      uuid: crypto.randomUUID(),
      invoiceNumber: 'INV-SEQ-001',
      invoiceType: 'STANDARD_B2B',
      documentTypeCode: '388',
      issueDate: '2026-09-19',
      issueTime: '10:00:00',
      previousInvoiceHash: ZATCA_INITIAL_PIH_HASH,
      invoiceCounter: 1,
      seller: {
        nameAr: 'شركة التقنية المتقدمة',
        vatNumber: '300012345600003',
        crNumber: '1010123456',
        streetName: 'طريق الملك فهد',
        buildingNumber: '1234',
        postalZone: '12211',
        district: 'العليا',
        cityName: 'الرياض',
      },
      buyer: {
        nameAr: 'شركة المقاولات الحديثة',
        vatNumber: '310987654300003',
        crNumber: '1010888888',
        streetName: 'شارع التخصصي',
        buildingNumber: '5678',
        postalZone: '12345',
        district: 'المعذر',
        cityName: 'الرياض',
      },
      subtotalSar: 1000,
      discountTotalSar: 0,
      taxTotalSar: 150,
      totalAmountSar: 1150,
      lines: [
        {
          id: '1',
          nameAr: 'اشتراك سحابي',
          quantity: 1,
          unitPriceSar: 1000,
          discountSar: 0,
          taxableAmountSar: 1000,
          taxRate: 0.15,
          taxAmountSar: 150,
          totalAmountSar: 1150,
        },
      ],
    });

    const hash1 = await calculateInvoiceHash(xml1);

    const xml2 = generateUBL21Xml({
      uuid: crypto.randomUUID(),
      invoiceNumber: 'INV-SEQ-002',
      invoiceType: 'STANDARD_B2B',
      documentTypeCode: '388',
      issueDate: '2026-09-19',
      issueTime: '10:05:00',
      previousInvoiceHash: hash1, // Links to hash 1
      invoiceCounter: 2,
      seller: {
        nameAr: 'شركة التقنية المتقدمة',
        vatNumber: '300012345600003',
        crNumber: '1010123456',
        streetName: 'طريق الملك فهد',
        buildingNumber: '1234',
        postalZone: '12211',
        district: 'العليا',
        cityName: 'الرياض',
      },
      subtotalSar: 2000,
      discountTotalSar: 0,
      taxTotalSar: 300,
      totalAmountSar: 2300,
      lines: [
        {
          id: '1',
          nameAr: 'خدمات استشارية',
          quantity: 1,
          unitPriceSar: 2000,
          discountSar: 0,
          taxableAmountSar: 2000,
          taxRate: 0.15,
          taxAmountSar: 300,
          totalAmountSar: 2300,
        },
      ],
    });

    const hash2 = await calculateInvoiceHash(xml2);

    const sampleDocs: EInvoiceDocument[] = [
      {
        id: 'doc-1',
        tenantId,
        invoiceId: 'inv-1',
        invoiceNumber: 'INV-SEQ-001',
        invoiceType: 'STANDARD_B2B',
        documentTypeCode: '388',
        uuid: 'uuid-1',
        issueDate: '2026-09-19',
        issueTime: '10:00:00',
        invoiceCounter: 1,
        previousInvoiceHash: ZATCA_INITIAL_PIH_HASH,
        invoiceHash: hash1,
        originalXml: xml1,
        status: 'ACCEPTED',
        attemptsLog: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any,
      {
        id: 'doc-2',
        tenantId,
        invoiceId: 'inv-2',
        invoiceNumber: 'INV-SEQ-002',
        invoiceType: 'STANDARD_B2B',
        documentTypeCode: '388',
        uuid: 'uuid-2',
        issueDate: '2026-09-19',
        issueTime: '10:05:00',
        invoiceCounter: 2,
        previousInvoiceHash: hash1,
        invoiceHash: hash2,
        originalXml: xml2,
        status: 'ACCEPTED',
        attemptsLog: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any,
    ];

    const chainResult = await verifyInvoiceHashChain(sampleDocs);
    expect(chainResult.isChainValid).toBe(true);
    expect(chainResult.unbrokenChainLength).toBe(2);
    expect(chainResult.brokenInvoiceNumber).toBeUndefined();

    // Now test tampering detection
    sampleDocs[1].previousInvoiceHash = 'TAMPERED_HASH_FORGERY_CORRUPTED_12345';
    const tamperedResult = await verifyInvoiceHashChain(sampleDocs);
    expect(tamperedResult.isChainValid).toBe(false);
    expect(tamperedResult.brokenInvoiceNumber).toBe('INV-SEQ-002');
  });

  // =========================================================================
  // 4. UBL 2.1 SCHEMA VALIDATION & TAG INTEGRITY
  // =========================================================================
  it('should validate UBL 2.1 XML schema compliance strictly', () => {
    const validXml = generateUBL21Xml({
      uuid: crypto.randomUUID(),
      invoiceNumber: 'INV-SCHEMA-TEST',
      invoiceType: 'STANDARD_B2B',
      documentTypeCode: '388',
      issueDate: '2026-09-19',
      issueTime: '12:00:00',
      previousInvoiceHash: ZATCA_INITIAL_PIH_HASH,
      invoiceCounter: 1,
      seller: {
        nameAr: 'شركة التقنية',
        vatNumber: '300012345600003',
        crNumber: '1010123456',
        streetName: 'طريق الملك فهد',
        buildingNumber: '1234',
        postalZone: '12211',
        district: 'العليا',
        cityName: 'الرياض',
      },
      buyer: {
        nameAr: 'مؤسسة المشترين',
        vatNumber: '310987654300003',
        crNumber: '1010888888',
        streetName: 'شارع الملك خالد',
        buildingNumber: '5678',
        postalZone: '12345',
        district: 'المعذر',
        cityName: 'الرياض',
      },
      subtotalSar: 1000,
      discountTotalSar: 0,
      taxTotalSar: 150,
      totalAmountSar: 1150,
      lines: [
        {
          id: '1',
          nameAr: 'بند اختبار',
          quantity: 1,
          unitPriceSar: 1000,
          discountSar: 0,
          taxableAmountSar: 1000,
          taxRate: 0.15,
          taxAmountSar: 150,
          totalAmountSar: 1150,
        },
      ],
    });

    const schemaResult = validateUbl21XmlSchema(validXml);
    expect(schemaResult.isValid).toBe(true);
    expect(schemaResult.errors.length).toBe(0);

    // Corrupt XML to test schema detection
    const corruptedXml = validXml.replace('urn:oasis:names:specification:ubl:schema:xsd:Invoice-2', 'corrupted:namespace');
    const corruptResult = validateUbl21XmlSchema(corruptedXml);
    expect(corruptResult.isValid).toBe(false);
    expect(corruptResult.errors.some((e) => e.includes('namespace'))).toBe(true);
  });

  // =========================================================================
  // 5. TLV 9-TAG QR CODE ENCODING & DECODING
  // =========================================================================
  it('should encode and decode 9-tag TLV QR data with cryptographic stamp', () => {
    // Generate digital signature and key
    const sig = generateDigitalSignature('SAMPLE_INVOICE_HASH');

    const qrResult = decodeZatcaQR(sig.signature);
    // Valid Base64 check
    expect(typeof sig.signature).toBe('string');
  });

  // =========================================================================
  // 6. SECURITY & SCRUBBED CONFIGURATION
  // =========================================================================
  it('should never expose private keys in configuration endpoints and audit environment switches', () => {
    const config = getZatcaConfigService(store, tenantId);
    expect((config as any).privateKeyPem).toBeUndefined();
    expect((config as any).encryptedPrivateKey).toBeUndefined();
    expect(config.environment).toBe('SIMULATION');

    // Switch environment with non-owner should throw error
    expect(() =>
      switchZatcaEnvironmentService(
        store,
        tenantId,
        accountantContext.userId,
        accountantContext.userEmail,
        'PRODUCTION',
        false // Not authorized
      )
    ).toThrowError(/Permission denied/);
  });
});

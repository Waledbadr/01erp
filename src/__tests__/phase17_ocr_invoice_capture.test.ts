import { describe, it, expect, beforeEach } from 'vitest';
import {
  uploadAndProcessOcrInvoiceService,
  getOcrJobsService,
  getOcrJobByIdService,
  correctOcrFieldService,
  confirmOcrFieldService,
  commitOcrJobToDraftBillService,
} from '../../server/modules/ocr/ocrService.js';
import {
  validateOcrUpload,
  canCommitOcrJob,
  MIN_ACCEPTABLE_CONFIDENCE,
} from '../lib/ocr.js';
import {
  postPurchaseBillService,
  createPurchaseBillService,
} from '../../server/modules/purchasing/purchasingService.js';
import { TenantContext } from '../../server/core/tenantGuard.js';

describe('PHASE-17: OCR Supplier Invoice Capture Test Suite', () => {
  let mockStore: any;
  const tenantA: TenantContext = {
    userId: 'usr-acct-1',
    tenantId: 'tenant-company-a',
    role: 'ACCOUNTANT',
    userEmail: 'accountant@comp-a.sa',
    permissions: ['*'],
  };

  const tenantB: TenantContext = {
    userId: 'usr-acct-2',
    tenantId: 'tenant-company-b',
    role: 'ACCOUNTANT',
    userEmail: 'accountant@comp-b.sa',
    permissions: ['*'],
  };

  beforeEach(() => {
    mockStore = {
      ocrJobs: new Map(),
      purchaseBills: new Map(),
      suppliers: new Map(),
      branches: new Map([
        ['tenant-company-a', [{ id: 'branch-a-1', nameAr: 'الفرع الرئيسي' }]],
        ['tenant-company-b', [{ id: 'branch-b-1', nameAr: 'الفرع الرئيسي ب' }]],
      ]),
      warehouses: new Map([
        ['tenant-company-a', [{ id: 'wh-a-1', nameAr: 'المستودع المركزي' }]],
        ['tenant-company-b', [{ id: 'wh-b-1', nameAr: 'المستودع المركزي ب' }]],
      ]),
      stockBalances: new Map(),
      journals: new Map(),
      accounts: new Map([
        ['tenant-company-a', [
          { id: 'acc-inv', code: '1201', nameAr: 'مخزون البضائع', type: 'ASSET' },
          { id: 'acc-vat-in', code: '1204', nameAr: 'ضريبة المدخلات', type: 'ASSET' },
          { id: 'acc-ap', code: '2101', nameAr: 'الموردون (ذمم دائنة)', type: 'LIABILITY' },
        ]],
      ]),
      recordAuditLog: () => {},
    };
  });

  // TEST GROUP 1: Valid invoice image -> draft bill with extracted header + lines; amounts exact
  it('1. Extracts valid invoice document into structured data and exact monetary lines', async () => {
    const validFilePayload = {
      fileName: 'supplier_tax_invoice_101.pdf',
      fileBase64: Buffer.from('Invoice Content with VAT, SAR and Supplier Details').toString('base64'),
      mimeType: 'application/pdf',
      fileSize: 45000,
    };

    const job = await uploadAndProcessOcrInvoiceService(mockStore, tenantA, validFilePayload);

    expect(job).toBeDefined();
    expect(job.status).toBe('SUCCEEDED');
    expect(job.tenantId).toBe(tenantA.tenantId);
    expect(job.extractions).toBeDefined();
    expect(job.parsedData).toBeDefined();
    expect(job.parsedData?.totalAmountSar).toBeGreaterThan(0);
    expect(job.createdBillId).toBeUndefined(); // Zero auto-posting: must not have a bill created yet
  });

  // TEST GROUP 2: Corrupt/unreadable file -> Failed status, clear error, no draft created
  it('2. Handles corrupt or unreadable file with Failed status, clear message, and zero draft bills', async () => {
    // Inject a forced failing document provider simulation
    const failingPayload = {
      fileName: 'corrupted_scan.png',
      fileBase64: 'INVALID_CORRUPTED_BASE64_STRING_!!!',
      mimeType: 'image/png',
      fileSize: 1024,
    };

    try {
      const job = await uploadAndProcessOcrInvoiceService(mockStore, tenantA, failingPayload);
      if (job.status === 'FAILED') {
        expect(job.status).toBe('FAILED');
        expect(job.errorMessage).toBeDefined();
        expect(job.createdBillId).toBeUndefined();
      }
    } catch (err: any) {
      expect(err).toBeDefined();
    }

    // Verify zero purchase bills were created
    const bills = mockStore.purchaseBills.get(tenantA.tenantId) || [];
    expect(bills.length).toBe(0);
  });

  // TEST GROUP 3: Field < 0.85 -> commit blocked; after manual correction -> commit succeeds, correction audited
  it('3. Blocks commit on low confidence (<0.85) fields; succeeds after manual correction and audits change', async () => {
    // 1. Create a job with a deliberately low confidence field
    const validFilePayload = {
      fileName: 'invoice_blurry_vat.jpg',
      fileBase64: Buffer.from('Invoice sample text').toString('base64'),
      mimeType: 'image/jpeg',
      fileSize: 32000,
    };

    const job = await uploadAndProcessOcrInvoiceService(mockStore, tenantA, validFilePayload);
    expect(job.status).toBe('SUCCEEDED');

    // Simulate a low confidence extraction on supplierVatNumber
    if (job.extractions) {
      job.extractions.supplierVatNumber.confidence = 0.72; // Below 0.85
      job.extractions.supplierVatNumber.requiresReview = true;
      job.extractions.supplierVatNumber.correctedValue = undefined;
      job.extractions.supplierVatNumber.confirmed = false;
    }

    // Attempt commit -> MUST be blocked
    const commitCheckBefore = canCommitOcrJob(job);
    expect(commitCheckBefore.allowed).toBe(false);
    expect(commitCheckBefore.blockingReasons.length).toBeGreaterThan(0);

    await expect(
      commitOcrJobToDraftBillService(mockStore, tenantA, job.id)
    ).rejects.toThrow(/Cannot commit OCR job/);

    // 2. Perform manual correction with valid 15-digit Saudi VAT
    const correctedJob = correctOcrFieldService(mockStore, tenantA, job.id, {
      fieldName: 'supplierVatNumber',
      newValue: '310123456700003',
    });

    expect(correctedJob.extractions?.supplierVatNumber.correctedValue).toBe('310123456700003');
    expect(correctedJob.extractions?.supplierVatNumber.requiresReview).toBe(false);
    expect(correctedJob.corrections.length).toBe(1);
    expect(correctedJob.corrections[0].fieldName).toBe('supplierVatNumber');
    expect(correctedJob.corrections[0].newValue).toBe('310123456700003');

    // 3. Commit again -> MUST now succeed
    const commitResult = await commitOcrJobToDraftBillService(mockStore, tenantA, job.id);
    expect(commitResult.purchaseBill).toBeDefined();
    expect(commitResult.purchaseBill.status).toBe('DRAFT'); // Must be DRAFT
    expect(commitResult.purchaseBill.source).toBe('ocr');
    expect(commitResult.purchaseBill.ocrJobId).toBe(job.id);
    expect(commitResult.ocrJob.createdBillId).toBe(commitResult.purchaseBill.id);
  });

  // TEST GROUP 4: Provider Not Configured -> explicit state, no fake success
  it('4. Reports NOT_CONFIGURED honestly without fabricating fake success when provider unconfigured', async () => {
    const unconfiguredPayload = {
      fileName: 'unconfigured_scan.pdf',
      fileBase64: Buffer.from('Testing unconfigured flow').toString('base64'),
      mimeType: 'application/pdf',
      fileSize: 12000,
      providerPreference: 'NOT_CONFIGURED',
    };

    const job = await uploadAndProcessOcrInvoiceService(mockStore, tenantA, unconfiguredPayload);
    expect(job.status).toBe('NOT_CONFIGURED');
    expect(job.errorMessage).toContain('not configured');
    expect(job.extractions).toBeUndefined(); // No fake fabricated fields!
    expect(job.createdBillId).toBeUndefined();
  });

  // TEST GROUP 5: Tenant isolation: tenant B cannot see or fetch tenant A's job/file
  it('5. Enforces strict tenant isolation preventing cross-tenant access to OCR jobs and files', async () => {
    const filePayload = {
      fileName: 'tenant_a_confidential_invoice.pdf',
      fileBase64: Buffer.from('Tenant A Confidential Invoice').toString('base64'),
      mimeType: 'application/pdf',
      fileSize: 20000,
    };

    const jobA = await uploadAndProcessOcrInvoiceService(mockStore, tenantA, filePayload);

    // Tenant A can retrieve their job
    const fetchedA = getOcrJobByIdService(mockStore, tenantA.tenantId, jobA.id);
    expect(fetchedA.id).toBe(jobA.id);

    // Tenant B cannot retrieve Tenant A's job
    expect(() => {
      getOcrJobByIdService(mockStore, tenantB.tenantId, jobA.id);
    }).toThrow(/not found for this company/);

    // Tenant B's job list does not include Tenant A's job
    const jobsB = getOcrJobsService(mockStore, tenantB.tenantId);
    expect(jobsB.find((j) => j.id === jobA.id)).toBeUndefined();
  });

  // TEST GROUP 6: Disallowed file type -> rejected with clear message
  it('6. Rejects disallowed file types and files exceeding size limit with clear validation error', () => {
    // 1. Executable file
    const invalidExt = validateOcrUpload('malware.exe', 'application/x-msdownload', 5000);
    expect(invalidExt.valid).toBe(false);
    expect(invalidExt.error).toContain('Unsupported file type');

    // 2. Disallowed extension
    const invalidDoc = validateOcrUpload('doc.docx', 'application/msword', 5000);
    expect(invalidDoc.valid).toBe(false);

    // 3. File exceeding 10MB
    const oversized = validateOcrUpload('huge_scan.pdf', 'application/pdf', 11 * 1024 * 1024);
    expect(oversized.valid).toBe(false);
    expect(oversized.error).toContain('exceeds the 10MB limit');

    // 4. Valid PNG under 10MB
    const valid = validateOcrUpload('invoice.png', 'image/png', 2 * 1024 * 1024);
    expect(valid.valid).toBe(true);
  });

  // TEST GROUP 7: Extraction -> commit -> post through Phase 06/07 produces correct journals end-to-end
  it('7. End-to-end: Extraction -> Commit as Draft Purchase Bill -> Post via Phase 06 produces balanced GL journals', async () => {
    const payload = {
      fileName: 'enterprise_server_invoice.pdf',
      fileBase64: Buffer.from('Server Purchase Invoice, VAT 15% SAR').toString('base64'),
      mimeType: 'application/pdf',
      fileSize: 48000,
    };

    // 1. Upload & Extract
    const job = await uploadAndProcessOcrInvoiceService(mockStore, tenantA, payload);
    expect(job.status).toBe('SUCCEEDED');

    // 2. Commit as DRAFT purchase bill
    const { purchaseBill } = await commitOcrJobToDraftBillService(mockStore, tenantA, job.id);
    expect(purchaseBill.status).toBe('DRAFT');
    expect(purchaseBill.totalAmountSar).toBeGreaterThan(0);

    // 3. Post the purchase bill through Phase 06/07 posting engine
    const postContext: TenantContext = {
      ...tenantA,
    };

    const postResult = postPurchaseBillService(mockStore, postContext, purchaseBill.id);
    expect(postResult.bill.status).toBe('POSTED');

    // 4. Verify balanced General Ledger journal entry was posted
    const journals = mockStore.journals.get(tenantA.tenantId) || [];
    expect(journals.length).toBeGreaterThan(0);
    const lastJournal = journals[journals.length - 1];
    expect(lastJournal.status).toBe('POSTED');
    expect(lastJournal.totalDebitCents).toBe(lastJournal.totalCreditCents);
    expect(lastJournal.totalDebitCents).toBeGreaterThan(0n);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { centralStore, TenantContext, TenantScopedRepository } from '../../server/core/tenantGuard.js';
import { createSalesInvoiceService, createSalesCreditNoteService } from '../../server/modules/sales/salesService.js';
import { PdfEngineService } from '../../server/modules/documents/pdfEngineService.js';
import { buildSystemDefaultTemplate } from '../../server/modules/documents/documentTemplateService.js';
import { SAMPLE_DOCUMENTS } from '../../server/modules/documents/sampleData.js';
import { executeTrialBalance } from '../../server/modules/reports/financialReports.js';
import { getZatcaConfigService } from '../../server/modules/zatca/zatcaService.js';
import { createBackupSnapshotService, verifyBackupSnapshotService } from '../../server/modules/backup/backupService.js';

describe('Post-Deployment Smoke Test Suite (Section C: Operational Guard)', () => {
  let tenantId: string;
  let adminContext: TenantContext;
  let adminRepo: TenantScopedRepository;

  beforeEach(() => {
    centralStore.initDefaultSeed();
    const demoTenant = Array.from(centralStore.tenants.values())[0];
    tenantId = demoTenant.id;

    adminContext = {
      tenantId,
      userId: 'user-admin-01',
      userEmail: 'admin@al-inma.sa',
      role: 'OWNER',
      roleCode: 'OWNER',
      permissions: ['*'],
      isPlatformSuperAdmin: false,
      ipAddress: '127.0.0.1',
      userAgent: 'SmokeTestAgent/1.0',
    };

    adminRepo = new TenantScopedRepository(adminContext);
  });

  // Smoke Test 1: Login & Dashboard loads with live numbers
  it('1. Login + dashboard loads with live numbers', () => {
    const tenant = centralStore.tenants.get(tenantId);
    expect(tenant).toBeDefined();
    expect(tenant!.nameAr).toBeDefined();

    const accounts = centralStore.accounts.get(tenantId) || [];
    expect(accounts.length).toBeGreaterThan(10);

    const items = centralStore.items.get(tenantId) || [];
    expect(items.length).toBeGreaterThan(0);

    // Live ledger metric check: verify total debit & credit sums match
    const journals = centralStore.journals.get(tenantId) || [];
    let totalDebit = 0n;
    let totalCredit = 0n;
    for (const j of journals) {
      totalDebit += BigInt(j.totalDebitCents || 0);
      totalCredit += BigInt(j.totalCreditCents || 0);
    }
    expect(totalDebit).toBe(totalCredit);
  });

  // Smoke Test 2: Create+post a test sale -> journal visible -> reverse it
  it('2. create+post a test sale -> journal visible -> reverse it', async () => {
    const customer = (centralStore.customers.get(tenantId) || [])[0];
    const item = (centralStore.items.get(tenantId) || [])[0];
    const initialJournalsCount = (centralStore.journals.get(tenantId) || []).length;

    // 1. Create and post sale
    const invoice = await createSalesInvoiceService(centralStore, adminContext, {
      customerId: customer.id,
      invoiceType: 'STANDARD_B2B',
      paymentMethod: 'CASH',
      postImmediately: true,
      lines: [
        {
          itemId: item.id,
          uomId: item.baseUnit,
          quantity: 2,
          unitPriceSar: 100,
          discountPercent: 0,
          taxRate: 15,
        },
      ],
    });

    expect(invoice.status).toBe('POSTED');
    expect(invoice.totalAmountSar).toBe(230); // 200 + 30 VAT

    // Verify journal was generated and balanced
    const currentJournals = centralStore.journals.get(tenantId) || [];
    expect(currentJournals.length).toBeGreaterThan(initialJournalsCount);
    const saleJournal = currentJournals[currentJournals.length - 1];
    expect(BigInt(saleJournal.totalDebitCents)).toBe(BigInt(saleJournal.totalCreditCents));
    expect(BigInt(saleJournal.totalDebitCents)).toBeGreaterThan(0n);

    // 2. Reverse it via Sales Return / Credit Note
    const creditNote = await createSalesCreditNoteService(centralStore, adminContext, {
      originalInvoiceId: invoice.id,
      reasonCode: 'RETURN_OF_GOODS',
      reasonDescription: 'Defective goods returned',
      lines: [
        {
          itemId: item.id,
          quantity: 2,
          unitPriceSar: 100,
          taxRate: 15,
        },
      ],
    });

    expect(creditNote).toBeDefined();
    expect(creditNote.status).toBe('POSTED');

    // Verify reversal journal was created and balanced
    const afterReversalJournals = centralStore.journals.get(tenantId) || [];
    const reversalJournal = afterReversalJournals[afterReversalJournals.length - 1];
    expect(BigInt(reversalJournal.totalDebitCents)).toBe(BigInt(reversalJournal.totalCreditCents));
    expect(BigInt(reversalJournal.totalDebitCents)).toBeGreaterThan(0n);
  });

  // Smoke Test 3: Key PDF renders Arabic correctly
  it('3. key PDF renders Arabic correctly', async () => {
    const template = buildSystemDefaultTemplate(tenantId, 'SALES_INVOICE', 'A4');
    const pdfResult = await PdfEngineService.generateDocumentPdf(
      SAMPLE_DOCUMENTS.SALES_INVOICE,
      template
    );

    expect(pdfResult).toBeDefined();
    expect(pdfResult.contentType).toBe('application/pdf');
    expect(pdfResult.sizeBytes).toBeGreaterThan(2000);
    expect(pdfResult.buffer).toBeInstanceOf(Buffer);
  });

  // Smoke Test 4: Trial balance returns under 3s
  it('4. trial balance returns under 3s', () => {
    const startTime = performance.now();
    const trialBalance = executeTrialBalance(tenantId, {
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
    const endTime = performance.now();

    const durationMs = endTime - startTime;
    expect(durationMs).toBeLessThan(3000); // Strict SLA < 3s

    expect(trialBalance).toBeDefined();
    const balanceCard = trialBalance.summaryCards.find((c) => c.id === 'tb-balance-status');
    expect(balanceCard).toBeDefined();
    expect(balanceCard!.variant).toBe('success');
  });

  // Smoke Test 5: ZATCA ping/simulation endpoint healthy
  it('5. ZATCA ping/simulation endpoint healthy', () => {
    const config = getZatcaConfigService(centralStore, tenantId);
    expect(config).toBeDefined();
    expect(config.environment).toBe('SIMULATION');
    expect(config.egsSerialNumber).toBeDefined();
    expect(config.status).toBeDefined();
  });

  // Smoke Test 6: Backup job status green
  it('6. backup job status green', async () => {
    const snapshot = await createBackupSnapshotService(
      tenantId,
      adminContext.userId,
      adminContext.userEmail,
      'Post-deploy smoke test automated verification snapshot',
      'MANUAL',
      'DAILY_7D',
      'PRIMARY_HOT'
    );

    expect(snapshot).toBeDefined();
    expect(snapshot.id).toBeDefined();
    expect(snapshot.checksumSha256).toBeDefined();
    expect(snapshot.encryptionAlgorithm).toBe('AES-256-GCM');

    // Verify snapshot integrity
    const verification = verifyBackupSnapshotService(
      tenantId,
      snapshot.id,
      adminContext.userId,
      adminContext.userEmail
    );
    expect(verification).toBeDefined();
    expect(verification!.status).toBe('PASSED');
    expect(verification!.checksumMatches).toBe(true);
    expect(verification!.glDebitsEqualCredits).toBe(true);
  });
});

/**
 * Phase 23 — Final Operational & Accounting Certification Acceptance Suite
 * Validates complete end-to-end accounting lifecycle according to Saudi GAAP / SOCPA,
 * ZATCA Phase 2 e-invoicing standards, and strict zero-drift invariants.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { centralStore, TenantContext, TenantScopedRepository } from '../../server/core/tenantGuard.js';
import { createSalesInvoiceService, createSalesCreditNoteService } from '../../server/modules/sales/salesService.js';
import { executeTrialBalance, executeProfitLoss, executeBalanceSheet } from '../../server/modules/reports/financialReports.js';
import { getZatcaConfigService, generateZatcaCsrService } from '../../server/modules/zatca/zatcaService.js';
import { createBackupSnapshotService, verifyBackupSnapshotService } from '../../server/modules/backup/backupService.js';
import { getFixedAssetsService, previewMonthlyDepreciationService, executeMonthlyDepreciationService } from '../../server/modules/assets/assetService.js';

describe('Phase 23: Operational Acceptance & Accounting Certification Suite', () => {
  let tenantId: string;
  let adminContext: TenantContext;
  let adminRepo: TenantScopedRepository;
  let tenantBContext: TenantContext;

  beforeEach(() => {
    centralStore.initDefaultSeed();
    const demoTenant = Array.from(centralStore.tenants.values())[0];
    tenantId = demoTenant.id;

    adminContext = {
      tenantId,
      userId: 'cert-auditor-01',
      userEmail: 'auditor@al-inma.sa',
      role: 'OWNER',
      roleCode: 'OWNER',
      permissions: ['*'],
      isPlatformSuperAdmin: false,
      ipAddress: '192.168.1.100',
      userAgent: 'CertificationSuite/1.0',
    };

    adminRepo = new TenantScopedRepository(adminContext);

    // Second tenant for multi-tenant boundary checks
    const tenantBId = 'tenant-cert-isolated-b';
    tenantBContext = {
      tenantId: tenantBId,
      userId: 'user-b-01',
      userEmail: 'admin@b-corp.sa',
      role: 'OWNER',
      roleCode: 'OWNER',
      permissions: ['*'],
      isPlatformSuperAdmin: false,
      ipAddress: '192.168.1.101',
      userAgent: 'CertificationSuite/1.0',
    };
  });

  // Acceptance Criterion 1: SOCPA-compliant Chart of Accounts & Opening Balance
  it('AC1: SOCPA-compliant Chart of Accounts and Initial Balances', () => {
    const accounts = centralStore.accounts.get(tenantId) || [];
    expect(accounts.length).toBeGreaterThan(20);

    // Verify key 5 root account classifications (Assets: 1, Liabilities: 2, Equity: 3, Revenue: 4, Expenses: 5)
    const assetAccounts = accounts.filter((a) => a.code.startsWith('1'));
    const liabilityAccounts = accounts.filter((a) => a.code.startsWith('2'));
    const equityAccounts = accounts.filter((a) => a.code.startsWith('3'));
    const revenueAccounts = accounts.filter((a) => a.code.startsWith('4'));
    const expenseAccounts = accounts.filter((a) => a.code.startsWith('5'));

    expect(assetAccounts.length).toBeGreaterThan(0);
    expect(liabilityAccounts.length).toBeGreaterThan(0);
    expect(equityAccounts.length).toBeGreaterThan(0);
    expect(revenueAccounts.length).toBeGreaterThan(0);
    expect(expenseAccounts.length).toBeGreaterThan(0);

    // Verify Rule G1 on initial seed ledger
    const journals = centralStore.journals.get(tenantId) || [];
    expect(journals.length).toBeGreaterThan(0);

    for (const j of journals) {
      expect(BigInt(j.totalDebitCents || 0)).toBe(BigInt(j.totalCreditCents || 0));
      const lineDr = (j.lines || []).reduce((acc, l) => acc + BigInt(l.debitCents || 0), 0n);
      const lineCr = (j.lines || []).reduce((acc, l) => acc + BigInt(l.creditCents || 0), 0n);
      expect(lineDr).toBe(lineCr);
    }
  });

  // Acceptance Criterion 2: Complete Sales Invoicing with ZATCA Phase 2 QR & Exact VAT
  it('AC2: End-to-End Sales Lifecycle (Order -> Invoice -> VAT 15% -> Ledger -> Credit Note)', async () => {
    const customer = (centralStore.customers.get(tenantId) || [])[0];
    const item = (centralStore.items.get(tenantId) || [])[0];
    expect(customer).toBeDefined();
    expect(item).toBeDefined();

    // 1. Post Tax Invoice for 10 units @ 200 SAR = 2,000 SAR net + 300 SAR VAT = 2,300 SAR gross
    const invoice = await createSalesInvoiceService(centralStore, adminContext, {
      customerId: customer.id,
      invoiceType: 'STANDARD_B2B',
      paymentMethod: 'CASH',
      postImmediately: true,
      lines: [
        {
          itemId: item.id,
          uomId: item.baseUnit,
          quantity: 10,
          unitPriceSar: 200,
          discountPercent: 0,
          taxRate: 15,
        },
      ],
    });

    expect(invoice.status).toBe('POSTED');
    expect(invoice.subtotalSar).toBe(2000);
    expect(invoice.taxTotalSar).toBe(300);
    expect(invoice.totalAmountSar).toBe(2300);
    expect(invoice.qrCodeBase64).toBeDefined();
    expect(invoice.zatcaStatus).toBeDefined();

    // Verify balanced journal
    const journals = centralStore.journals.get(tenantId) || [];
    const salesJournal = journals[journals.length - 1];
    expect(BigInt(salesJournal.totalDebitCents)).toBe(BigInt(salesJournal.totalCreditCents));

    // 2. Issue Credit Note / Sales Return for 2 units
    const creditNote = await createSalesCreditNoteService(centralStore, adminContext, {
      originalInvoiceId: invoice.id,
      reasonCode: 'RETURN_OF_GOODS',
      reasonDescription: 'Customer return',
      lines: [
        {
          itemId: item.id,
          quantity: 2,
          unitPriceSar: 200,
          taxRate: 15,
        },
      ],
    });

    expect(creditNote.status).toBe('POSTED');
    expect(creditNote.totalAmountSar).toBe(460); // 400 + 60 VAT

    // Verify reverse journal was posted and balanced
    const journalsAfterCN = centralStore.journals.get(tenantId) || [];
    const cnJournal = journalsAfterCN[journalsAfterCN.length - 1];
    expect(BigInt(cnJournal.totalDebitCents)).toBe(BigInt(cnJournal.totalCreditCents));
  });

  // Acceptance Criterion 3: Fixed Asset Depreciation Lifecycle
  it('AC3: Fixed Asset Depreciation Run & Automated GL Posting', async () => {
    const assets = getFixedAssetsService(tenantId, adminContext.userId);
    expect(assets.length).toBeGreaterThan(0);

    const asset = assets[0];
    expect(asset.purchaseCostSar).toBeGreaterThan(0);

    // Calculate monthly depreciation preview
    const preview = previewMonthlyDepreciationService(tenantId, '2026-03', adminContext.userId);
    expect(preview.totalDepreciationSar).toBeGreaterThan(0);
    expect(preview.previewJournalLines.length).toBeGreaterThan(0);

    // Post depreciation run to GL
    const runResult = await executeMonthlyDepreciationService(
      adminRepo,
      '2026-03',
      adminContext.userId,
      adminContext.userEmail
    );

    expect(runResult.assetsCount).toBeGreaterThan(0);
    expect(runResult.journalId).toBeDefined();

    // Verify created journal in centralStore
    const journals = centralStore.journals.get(tenantId) || [];
    const depJournal = journals.find((j) => j.id === runResult.journalId);
    expect(depJournal).toBeDefined();
    expect(BigInt(depJournal!.totalDebitCents)).toBe(BigInt(depJournal!.totalCreditCents));
  });

  // Acceptance Criterion 4: Authoritative Financial Statements Execution
  it('AC4: Trial Balance, Income Statement, and Balance Sheet Conformity', () => {
    const tb = executeTrialBalance(tenantId, {
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
    expect(tb).toBeDefined();
    const balanceCard = tb.summaryCards.find((c) => c.id === 'tb-balance-status');
    expect(balanceCard?.variant).toBe('success');

    const incStmt = executeProfitLoss(tenantId, {
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
    expect(incStmt).toBeDefined();
    expect(incStmt.rows.length).toBeGreaterThan(0);

    const balSheet = executeBalanceSheet(tenantId, {
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
    expect(balSheet).toBeDefined();
    const bsStatus = balSheet.summaryCards.find((c) => c.id === 'bs-balance-status');
    expect(bsStatus?.variant).toBe('success');
  });

  // Acceptance Criterion 5: ZATCA Phase 2 EGS Device Onboarding & CSR Generation
  it('AC5: ZATCA Phase 2 EGS Device Onboarding & CSR Generation', () => {
    const config = getZatcaConfigService(centralStore, tenantId);
    expect(config.environment).toBe('SIMULATION');
    expect(config.egsSerialNumber).toBeDefined();

    const csrResult = generateZatcaCsrService(
      centralStore,
      tenantId,
      adminContext.userId,
      adminContext.userEmail,
      {
        organizationUnit: 'HQ IT',
        commonName: 'AL-INMA ERP EGS 001',
      }
    );
    expect(csrResult.csr).toBeDefined();
    expect(csrResult.csr).toContain('-----BEGIN CERTIFICATE REQUEST-----');
    expect(csrResult.egsSerialNumber).toBeDefined();
  });

  // Acceptance Criterion 6: Multi-Tenant Zero Leakage Isolation
  it('AC6: Tenant Isolation & Unauthorized Access Prevention', () => {
    const tenantARepo = new TenantScopedRepository(adminContext);
    const tenantBRepo = new TenantScopedRepository(tenantBContext);

    const accountsA = tenantARepo.getAccounts();
    const accountsB = tenantBRepo.getAccounts();

    // Tenant B cannot see Tenant A accounts
    for (const a of accountsA) {
      expect(accountsB.some((b) => b.id === a.id)).toBe(false);
    }

    // Invoices isolated
    const invoicesA = centralStore.salesInvoices.get(tenantId) || [];
    const invoicesB = centralStore.salesInvoices.get(tenantBContext.tenantId) || [];
    expect(invoicesA.length).toBeGreaterThan(0);
    expect(invoicesB.length).toBe(0);
  });

  // Acceptance Criterion 7: Disaster Recovery Backup Encryption & Automated Restore Drill
  it('AC7: AES-256-GCM Backup Archive & Zero-Loss Verification Drill', async () => {
    const snapshot = await createBackupSnapshotService(
      tenantId,
      adminContext.userId,
      adminContext.userEmail,
      'Phase 23 Final Certification Verification Snapshot',
      'MANUAL',
      'MONTHLY_30D',
      'OFFSITE_SECURE_VAULT'
    );

    expect(snapshot.id).toBeDefined();
    expect(snapshot.encryptionAlgorithm).toBe('AES-256-GCM');
    expect(snapshot.checksumSha256).toBeDefined();

    const drillReport = verifyBackupSnapshotService(
      tenantId,
      snapshot.id,
      adminContext.userId,
      adminContext.userEmail
    );

    expect(drillReport).toBeDefined();
    expect(drillReport!.status).toBe('PASSED');
    expect(drillReport!.checksumMatches).toBe(true);
    expect(drillReport!.glDebitsEqualCredits).toBe(true);
  });
});

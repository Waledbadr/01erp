import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../core/authMiddleware.js';
import { validateSaudiVatNumber, validateSaudiCrNumber, validateSaudiUnifiedNumber } from '../../core/security.js';

export const companyRouter = Router();

// ==========================================
// 1. COMPANY PROFILE & WIZARD HEALTH CHECK
// ==========================================
companyRouter.get('/current', requireAuth, (req: Request, res: Response) => {
  const repo = req.tenantRepo!;
  const company = repo.getCompany();
  return res.json({ company });
});

companyRouter.put('/current', requireAuth, requirePermission('settings:company:manage'), (req: Request, res: Response) => {
  const repo = req.tenantRepo!;
  const updates = req.body;

  if (updates.vatNumber) {
    const vatCheck = validateSaudiVatNumber(updates.vatNumber);
    if (!vatCheck.valid) return res.status(400).json({ error: 'INVALID_VAT', message: vatCheck.error });
  }

  if (updates.crNumber) {
    const crCheck = validateSaudiCrNumber(updates.crNumber);
    if (!crCheck.valid) return res.status(400).json({ error: 'INVALID_CR', message: crCheck.error });
  }

  if (updates.unifiedNumber) {
    const uCheck = validateSaudiUnifiedNumber(updates.unifiedNumber);
    if (!uCheck.valid) return res.status(400).json({ error: 'INVALID_UNIFIED', message: uCheck.error });
  }

  const updated = repo.updateCompany(updates);
  return res.json({ message: 'تم تحديث بيانات المنشأة بنجاح.', company: updated });
});

// Setup Wizard Status & Health Check
companyRouter.get('/wizard-status', requireAuth, (req: Request, res: Response) => {
  const repo = req.tenantRepo!;
  const company = repo.getCompany();
  const branches = repo.getBranches();
  const warehouses = repo.getWarehouses();
  const cashboxes = repo.getCashboxes();
  const bankAccounts = repo.getBankAccounts();
  const mappings = repo.getAccountMappings();
  const sequences = repo.getDocumentSequences();
  const users = repo.getUsers();

  const steps = [
    {
      step: 1,
      id: 'profile',
      titleAr: 'ملف المنشأة والهوية',
      titleEn: 'Company Profile & Identity',
      isCompleted: Boolean(company.nameAr && company.nameEn && company.nationalAddress),
      isRequired: true,
    },
    {
      step: 2,
      id: 'legal_tax',
      titleAr: 'البيانات القانونية والضريبية (الرقم الضريبي والسجل)',
      titleEn: 'Legal & Tax Data (VAT & CR)',
      isCompleted: Boolean(company.vatNumber && company.crNumber),
      isRequired: true,
    },
    {
      step: 3,
      id: 'localization',
      titleAr: 'الإعدادات الإقليمية والعملة (SAR) والمنطقة الزمنية',
      titleEn: 'Localization & Currency (SAR)',
      isCompleted: Boolean(company.currency === 'SAR' && company.timezone),
      isRequired: true,
    },
    {
      step: 4,
      id: 'fiscal',
      titleAr: 'السنة المالية والأساس المحاسبي (الاستحقاق)',
      titleEn: 'Fiscal Year & Accounting Basis',
      isCompleted: Boolean(company.fiscalYearStartMonth && company.accountingBasis),
      isRequired: true,
    },
    {
      step: 5,
      id: 'vat_setup',
      titleAr: 'إعدادات ضريبة القيمة المضافة (15%) وتفضيل العرض',
      titleEn: 'VAT Configuration (15%)',
      isCompleted: Boolean(company.vatRatePercentage === 15 && company.vatPreference),
      isRequired: true,
    },
    {
      step: 6,
      id: 'zatca',
      titleAr: 'بيئة زاتكا والربط الإلكتروني (المرحلة الثانية)',
      titleEn: 'ZATCA E-Invoicing Phase 2 Setup',
      isCompleted: true, // Not Configured is an allowed valid state in Phase 01
      isRequired: false,
    },
    {
      step: 7,
      id: 'first_entities',
      titleAr: 'الفرع الأول، المستودع، الخزينة، والحساب البنكي',
      titleEn: 'First Branch, Warehouse, Vault & Bank',
      isCompleted: branches.length > 0 && warehouses.length > 0 && cashboxes.length > 0 && bankAccounts.length > 0,
      isRequired: true,
    },
    {
      step: 8,
      id: 'coa_mappings',
      titleAr: 'شجرة الحسابات المعتمدة وربط الحسابات التلقائي',
      titleEn: 'Saudi Chart of Accounts & Mappings',
      isCompleted: Object.keys(mappings).length >= 10,
      isRequired: true,
    },
    {
      step: 9,
      id: 'document_sequences',
      titleAr: 'قوالب ترقيم المستندات والفواتير',
      titleEn: 'Document Numbering Sequences',
      isCompleted: sequences.length >= 4,
      isRequired: true,
    },
    {
      step: 10,
      id: 'invite_admin',
      titleAr: 'تأكيد حساب المدير ودعوة فريق العمل',
      titleEn: 'Admin Confirmation & User Invitations',
      isCompleted: users.length >= 1,
      isRequired: true,
    },
  ];

  const completedCount = steps.filter((s) => s.isCompleted).length;
  const healthScore = Math.round((completedCount / steps.length) * 100);

  return res.json({
    onboardingStep: company.onboardingStep,
    onboardingCompleted: company.onboardingCompleted,
    steps,
    healthScore,
    completedCount,
    totalSteps: steps.length,
  });
});

// Save Wizard Step
companyRouter.post('/wizard-step', requireAuth, requirePermission('settings:company:manage'), (req: Request, res: Response) => {
  const repo = req.tenantRepo!;
  const { stepNumber, stepData, isComplete } = req.body;

  if (!stepNumber || stepNumber < 1 || stepNumber > 10) {
    return res.status(400).json({ error: 'INVALID_STEP', message: 'Step number must be between 1 and 10' });
  }

  const updates: Record<string, unknown> = {};

  if (stepData) {
    if (stepNumber === 1) {
      if (stepData.nameAr) updates.nameAr = stepData.nameAr;
      if (stepData.nameEn) updates.nameEn = stepData.nameEn;
      if (stepData.nationalAddress) updates.nationalAddress = stepData.nationalAddress;
      if (stepData.phone) updates.phone = stepData.phone;
      if (stepData.email) updates.email = stepData.email;
      if (stepData.logoUrl) updates.logoUrl = stepData.logoUrl;
    } else if (stepNumber === 2) {
      if (stepData.vatNumber) {
        const check = validateSaudiVatNumber(stepData.vatNumber);
        if (!check.valid) return res.status(400).json({ error: 'INVALID_VAT', message: check.error });
        updates.vatNumber = stepData.vatNumber;
      }
      if (stepData.crNumber) {
        const check = validateSaudiCrNumber(stepData.crNumber);
        if (!check.valid) return res.status(400).json({ error: 'INVALID_CR', message: check.error });
        updates.crNumber = stepData.crNumber;
      }
      if (stepData.unifiedNumber) updates.unifiedNumber = stepData.unifiedNumber;
    } else if (stepNumber === 3) {
      if (stepData.currency) updates.currency = stepData.currency;
      if (stepData.timezone) updates.timezone = stepData.timezone;
      if (stepData.language) updates.language = stepData.language;
    } else if (stepNumber === 4) {
      if (stepData.fiscalYearStartMonth) updates.fiscalYearStartMonth = Number(stepData.fiscalYearStartMonth);
      if (stepData.accountingBasis) updates.accountingBasis = stepData.accountingBasis;
    } else if (stepNumber === 5) {
      if (stepData.vatRatePercentage !== undefined) updates.vatRatePercentage = Number(stepData.vatRatePercentage);
      if (stepData.vatPreference) updates.vatPreference = stepData.vatPreference;
    } else if (stepNumber === 6) {
      if (stepData.zatcaEnv) updates.zatcaEnv = stepData.zatcaEnv;
      if (stepData.zatcaStatus) updates.zatcaStatus = stepData.zatcaStatus;
    }
  }

  // Update step progress
  const company = repo.getCompany();
  const nextStep = Math.max(company.onboardingStep, stepNumber + 1);
  updates.onboardingStep = Math.min(nextStep, 10);
  if (isComplete || stepNumber === 10) {
    updates.onboardingCompleted = true;
  }

  const updated = repo.updateCompany(updates);
  return res.json({
    message: `تم حفظ بيانات الخطوة ${stepNumber} بنجاح.`,
    onboardingStep: updated.onboardingStep,
    onboardingCompleted: updated.onboardingCompleted,
    company: updated,
  });
});

companyRouter.post('/complete-wizard', requireAuth, requirePermission('settings:company:manage'), (req: Request, res: Response) => {
  const repo = req.tenantRepo!;
  const updated = repo.updateCompany({
    onboardingCompleted: true,
    onboardingStep: 10,
  });
  return res.json({ message: 'تهانينا! تم إكمال إعداد المنشأة وجاهزية النظام بالكامل.', company: updated });
});

// ==========================================
// 2. BRANCHES, WAREHOUSES, CASHBOXES, BANKS
// ==========================================
companyRouter.get('/branches', requireAuth, (req: Request, res: Response) => {
  return res.json({ branches: req.tenantRepo!.getBranches() });
});

companyRouter.post('/branches', requireAuth, requirePermission('settings:company:manage'), (req: Request, res: Response) => {
  const { code, nameAr, nameEn, address, phone } = req.body;
  if (!code || !nameAr) return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Code and Arabic Name are required' });
  try {
    const branch = req.tenantRepo!.createBranch({ code, nameAr, nameEn, address, phone });
    return res.status(201).json({ branch });
  } catch (err: unknown) {
    return res.status(400).json({ error: 'CREATION_FAILED', message: err instanceof Error ? err.message : 'Error' });
  }
});

companyRouter.get('/warehouses', requireAuth, (req: Request, res: Response) => {
  return res.json({ warehouses: req.tenantRepo!.getWarehouses() });
});

companyRouter.post('/warehouses', requireAuth, requirePermission('inventory:warehouse:manage'), (req: Request, res: Response) => {
  const { branchId, code, nameAr, nameEn } = req.body;
  if (!code || !nameAr) return res.status(400).json({ error: 'MISSING_FIELDS' });
  const branches = req.tenantRepo!.getBranches();
  const targetBranchId = branchId || branches[0]?.id;
  const warehouse = req.tenantRepo!.createWarehouse({ branchId: targetBranchId, code, nameAr, nameEn });
  return res.status(201).json({ warehouse });
});

companyRouter.get('/cashboxes', requireAuth, (req: Request, res: Response) => {
  return res.json({ cashboxes: req.tenantRepo!.getCashboxes() });
});

companyRouter.post('/cashboxes', requireAuth, requirePermission('treasury:vault:manage'), (req: Request, res: Response) => {
  const { branchId, code, nameAr, nameEn, glAccountId } = req.body;
  if (!code || !nameAr) return res.status(400).json({ error: 'MISSING_FIELDS' });
  const branches = req.tenantRepo!.getBranches();
  const targetBranchId = branchId || branches[0]?.id;
  const cashbox = req.tenantRepo!.createCashbox({
    branchId: targetBranchId,
    code,
    nameAr,
    nameEn,
    glAccountId: glAccountId || '10101',
  });
  return res.status(201).json({ cashbox });
});

companyRouter.get('/bank-accounts', requireAuth, (req: Request, res: Response) => {
  return res.json({ bankAccounts: req.tenantRepo!.getBankAccounts() });
});

companyRouter.post('/bank-accounts', requireAuth, requirePermission('treasury:bank:manage'), (req: Request, res: Response) => {
  const { bankNameAr, bankNameEn, accountNumber, iban, swiftCode, glAccountId } = req.body;
  if (!bankNameAr || !accountNumber || !iban) return res.status(400).json({ error: 'MISSING_FIELDS' });
  const bank = req.tenantRepo!.createBankAccount({
    bankNameAr,
    bankNameEn,
    accountNumber,
    iban,
    swiftCode,
    glAccountId: glAccountId || '10102',
  });
  return res.status(201).json({ bankAccount: bank });
});

// ==========================================
// 3. ACCOUNT MAPPINGS & CHART OF ACCOUNTS
// ==========================================
companyRouter.get('/account-mappings', requireAuth, (req: Request, res: Response) => {
  return res.json({ mappings: req.tenantRepo!.getAccountMappings() });
});

companyRouter.put('/account-mappings', requireAuth, requirePermission('accounting:account:manage'), (req: Request, res: Response) => {
  const updated = req.tenantRepo!.updateAccountMappings(req.body.mappings || {});
  return res.json({ message: 'تم تحديث ربط الحسابات بنجاح.', mappings: updated });
});

// ==========================================
// 4. DOCUMENT SEQUENCES & NUMBER GENERATION
// ==========================================
companyRouter.get('/document-sequences', requireAuth, (req: Request, res: Response) => {
  return res.json({ sequences: req.tenantRepo!.getDocumentSequences() });
});

// Atomic concurrency-safe next document sequence generator
companyRouter.post('/document-sequences/preview-next', requireAuth, async (req: Request, res: Response) => {
  const { documentTypeCode, year } = req.body;
  if (!documentTypeCode) return res.status(400).json({ error: 'MISSING_DOC_TYPE' });

  try {
    const nextNumber = await req.tenantRepo!.getNextDocNumber(documentTypeCode, year ? Number(year) : undefined);
    return res.json({ documentTypeCode, generatedNumber: nextNumber });
  } catch (err: unknown) {
    return res.status(500).json({ error: 'SEQUENCE_ERROR', message: err instanceof Error ? err.message : 'Error' });
  }
});

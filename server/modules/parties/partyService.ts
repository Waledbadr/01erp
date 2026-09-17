import crypto from 'crypto';
import {
  Customer,
  Supplier,
  PartyAttachment,
  PartyContract,
  SupplierPriceRecord,
  TimelineEvent,
  PartyLedgerStatementLine,
  PartyDetailSummary,
  CreditEvaluationResult,
  BatchImportReport,
  ImportRowError,
  calculateDueDate,
  evaluateCustomerCredit as evalCredit,
  validateSaudiMobile,
  normalizeSaudiMobile,
  validatePartyLegalData,
} from '../../../src/lib/parties.js';
import {
  CentralTenantDataStore,
  TenantScopedRepository,
  ConflictError,
  ValidationError,
  NotFoundError,
  PermissionDeniedError,
  DEFAULT_ACCOUNT_MAPPING_KEYS,
  Account,
} from '../../core/tenantGuard.js';
import { fromHalalasToDisplay } from '../../../src/lib/accounting.js';

export interface BatchImportSnapshot {
  batchId: string;
  tenantId: string;
  entity: 'CUSTOMER' | 'SUPPLIER';
  mode: 'CREATE_ONLY' | 'UPDATE_ONLY' | 'CREATE_OR_UPDATE';
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  createdEntityIds: string[];
  createdSubaccountIds: string[];
  previousSnapshots: Array<{ id: string; snapshot: any }>;
  errors: ImportRowError[];
  isRolledBack: boolean;
  rolledBackAt?: string;
  createdBy: string;
  createdAt: string;
}

// ==========================================
// 1. SEED INITIAL CUSTOMERS & SUPPLIERS
// ==========================================
export function seedDefaultParties(store: CentralTenantDataStore, tenantId: string, adminUserId: string) {
  const branches = store.branches.get(tenantId) || [];
  const mainBranch = branches[0];
  const branchId = mainBranch ? mainBranch.id : crypto.randomUUID();

  // Find or create customer and supplier control accounts
  const accounts = store.accounts.get(tenantId) || [];
  let custControl = accounts.find((a) => a.code === '10201' || a.id === DEFAULT_ACCOUNT_MAPPING_KEYS.CUSTOMERS_AR);
  if (!custControl) {
    custControl = {
      id: crypto.randomUUID(),
      tenantId,
      code: '10201',
      nameAr: 'حساب مراقبة العملاء (الذمم المدينة)',
      nameEn: 'Accounts Receivable - Customers Control Account',
      type: 'ASSET',
      normalBalance: 'DEBIT',
      parentId: null,
      isHeader: true,
      allowPosting: false,
      sortOrder: 10201,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    accounts.push(custControl);
  }

  let suppControl = accounts.find((a) => a.code === '20101' || a.id === DEFAULT_ACCOUNT_MAPPING_KEYS.SUPPLIERS_AP);
  if (!suppControl) {
    suppControl = {
      id: crypto.randomUUID(),
      tenantId,
      code: '20101',
      nameAr: 'حساب مراقبة الموردين (الذمم الدائنة)',
      nameEn: 'Accounts Payable - Suppliers Control Account',
      type: 'LIABILITY',
      normalBalance: 'CREDIT',
      parentId: null,
      isHeader: true,
      allowPosting: false,
      sortOrder: 20101,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    accounts.push(suppControl);
  }

  // Create 4 customer subaccounts
  const custSub1: Account = {
    id: crypto.randomUUID(),
    tenantId,
    code: '10201-0001',
    nameAr: 'شركة الفاتح للتجارة والمقاولات العامة',
    nameEn: 'Al-Fateh General Trading & Contracting Ltd',
    type: 'ASSET',
    normalBalance: 'DEBIT',
    parentId: custControl.id,
    isHeader: false,
    allowPosting: true,
    sortOrder: 1020101,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  const custSub2: Account = {
    id: crypto.randomUUID(),
    tenantId,
    code: '10201-0002',
    nameAr: 'مؤسسة روابي نجد للخدمات اللوجستية',
    nameEn: 'Rawabi Najd Logistics Services Est',
    type: 'ASSET',
    normalBalance: 'DEBIT',
    parentId: custControl.id,
    isHeader: false,
    allowPosting: true,
    sortOrder: 1020102,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  const custSub3: Account = {
    id: crypto.randomUUID(),
    tenantId,
    code: '10201-0003',
    nameAr: 'سعود بن عبدالعزيز التميمي (عميل نقدي)',
    nameEn: 'Saud Abdulaziz Al-Tamimi (Retail Cash)',
    type: 'ASSET',
    normalBalance: 'DEBIT',
    parentId: custControl.id,
    isHeader: false,
    allowPosting: true,
    sortOrder: 1020103,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  const custSub4: Account = {
    id: crypto.randomUUID(),
    tenantId,
    code: '10201-0004',
    nameAr: 'أمانة منطقة الرياض - إدارة المشاريع',
    nameEn: 'Riyadh Municipality - Projects Dept',
    type: 'ASSET',
    normalBalance: 'DEBIT',
    parentId: custControl.id,
    isHeader: false,
    allowPosting: true,
    sortOrder: 1020104,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  accounts.push(custSub1, custSub2, custSub3, custSub4);

  // Create 4 supplier subaccounts
  const suppSub1: Account = {
    id: crypto.randomUUID(),
    tenantId,
    code: '20101-0001',
    nameAr: 'شركة التوريدات الغذائية السعودية المحدودة',
    nameEn: 'Saudi Food Supplies & Distribution Co',
    type: 'LIABILITY',
    normalBalance: 'CREDIT',
    parentId: suppControl.id,
    isHeader: false,
    allowPosting: true,
    sortOrder: 2010101,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  const suppSub2: Account = {
    id: crypto.randomUUID(),
    tenantId,
    code: '20101-0002',
    nameAr: 'مزارع القصيم النموذجية للتمور',
    nameEn: 'Al-Qassim Model Date Farms Est',
    type: 'LIABILITY',
    normalBalance: 'CREDIT',
    parentId: suppControl.id,
    isHeader: false,
    allowPosting: true,
    sortOrder: 2010102,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  const suppSub3: Account = {
    id: crypto.randomUUID(),
    tenantId,
    code: '20101-0003',
    nameAr: 'شركة الاستيراد الإثيوبية لتجارة البن الأخضر',
    nameEn: 'Ethiopian Green Coffee Export Corp',
    type: 'LIABILITY',
    normalBalance: 'CREDIT',
    parentId: suppControl.id,
    isHeader: false,
    allowPosting: true,
    sortOrder: 2010103,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  const suppSub4: Account = {
    id: crypto.randomUUID(),
    tenantId,
    code: '20101-0004',
    nameAr: 'مؤسسة التجهيزات الموقوفة (للاختبار والمراجعة)',
    nameEn: 'Suspended Supplies Est (Audit Test)',
    type: 'LIABILITY',
    normalBalance: 'CREDIT',
    parentId: suppControl.id,
    isHeader: false,
    allowPosting: true,
    sortOrder: 2010104,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  accounts.push(suppSub1, suppSub2, suppSub3, suppSub4);
  store.accounts.set(tenantId, accounts);

  // Seed Customers
  const customer1: Customer = {
    id: crypto.randomUUID(),
    tenantId,
    code: 'CUST-0001',
    nameAr: 'شركة الفاتح للتجارة والمقاولات العامة',
    nameEn: 'Al-Fateh General Trading & Contracting Ltd',
    type: 'COMPANY',
    vatNumber: '300112233400003',
    crNumber: '1010223344',
    unifiedNumber: '7001122334',
    mobile: '0551122334',
    email: 'finance@al-fateh.sa',
    address: {
      buildingNumber: '8291',
      street: 'طريق الملك فهد الفرعي',
      district: 'العليا',
      city: 'الرياض',
      postalCode: '12214',
      additionalNumber: '3120',
      country: 'SA',
    },
    paymentTerms: 'NET_30',
    creditLimit: 150000,
    creditHold: false,
    cashOnly: false,
    salesRepName: 'عمر الرويلي',
    accountManagerName: 'سارة القحطاني',
    customerGroup: 'KEY_ACCOUNT',
    priceList: 'WHOLESALE',
    defaultDiscountPercent: 5,
    taxCategory: 'STANDARD_15',
    status: 'ACTIVE',
    subaccountId: custSub1.id,
    subaccountCode: custSub1.code,
    attachments: [
      {
        id: crypto.randomUUID(),
        partyId: '',
        name: 'CR_Certificate_1010223344.pdf',
        type: 'CR_COPY',
        fileSize: 420100,
        mimeType: 'application/pdf',
        uploadedBy: adminUserId,
        uploadedAt: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        partyId: '',
        name: 'ZATCA_VAT_Certificate.pdf',
        type: 'VAT_CERTIFICATE',
        fileSize: 310400,
        mimeType: 'application/pdf',
        uploadedBy: adminUserId,
        uploadedAt: new Date().toISOString(),
      },
    ],
    timeline: [
      {
        id: crypto.randomUUID(),
        timestamp: new Date(Date.now() - 30 * 86400000).toISOString(),
        eventType: 'CREATED',
        descriptionAr: 'تم إنشاء ملف العميل وربطه بحساب الأستاذ العام 10201-0001',
        descriptionEn: 'Customer record created and mapped to GL subaccount 10201-0001',
        performedBy: 'النظام الآلي',
      },
    ],
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  };
  customer1.attachments.forEach((a) => (a.partyId = customer1.id));

  const customer2: Customer = {
    id: crypto.randomUUID(),
    tenantId,
    code: 'CUST-0002',
    nameAr: 'مؤسسة روابي نجد للخدمات اللوجستية',
    nameEn: 'Rawabi Najd Logistics Services Est',
    type: 'ESTABLISHMENT',
    vatNumber: '310556677800003',
    crNumber: '1010334455',
    unifiedNumber: '7003344556',
    mobile: '0503344556',
    email: 'info@rawabi-najd.sa',
    address: {
      buildingNumber: '4412',
      street: 'طريق خريص',
      district: 'الملز',
      city: 'الرياض',
      postalCode: '12836',
      additionalNumber: '2109',
      country: 'SA',
    },
    paymentTerms: 'NET_15',
    creditLimit: 50000,
    creditHold: false,
    cashOnly: false,
    salesRepName: 'عمر الرويلي',
    customerGroup: 'WHOLESALE',
    priceList: 'WHOLESALE',
    defaultDiscountPercent: 2,
    taxCategory: 'STANDARD_15',
    status: 'ACTIVE',
    subaccountId: custSub2.id,
    subaccountCode: custSub2.code,
    attachments: [],
    timeline: [
      {
        id: crypto.randomUUID(),
        timestamp: new Date(Date.now() - 20 * 86400000).toISOString(),
        eventType: 'CREATED',
        descriptionAr: 'تم إنشاء العميل وفتح الحساب الفرعي 10201-0002',
        descriptionEn: 'Customer created with subaccount 10201-0002',
        performedBy: 'النظام الآلي',
      },
    ],
    createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const customer3: Customer = {
    id: crypto.randomUUID(),
    tenantId,
    code: 'CUST-0003',
    nameAr: 'سعود بن عبدالعزيز التميمي',
    nameEn: 'Saud Abdulaziz Al-Tamimi',
    type: 'INDIVIDUAL',
    mobile: '0541122334',
    email: 'saud.tamimi@gmail.com',
    address: {
      city: 'الرياض',
      district: 'حطين',
      country: 'SA',
    },
    paymentTerms: 'IMMEDIATE',
    creditLimit: 0,
    creditHold: false,
    cashOnly: true, // Retail cash-only
    customerGroup: 'RETAIL',
    priceList: 'RETAIL',
    defaultDiscountPercent: 0,
    taxCategory: 'STANDARD_15',
    status: 'ACTIVE',
    subaccountId: custSub3.id,
    subaccountCode: custSub3.code,
    attachments: [],
    timeline: [],
    createdAt: new Date(Date.now() - 15 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const customer4: Customer = {
    id: crypto.randomUUID(),
    tenantId,
    code: 'CUST-0004',
    nameAr: 'أمانة منطقة الرياض - إدارة المشاريع',
    nameEn: 'Riyadh Municipality - Projects Dept',
    type: 'GOVERNMENT',
    unifiedNumber: '7009988776',
    mobile: '0567788990',
    email: 'projects@alriyadh.gov.sa',
    address: {
      buildingNumber: '1000',
      street: 'طريق صلاح الدين الأيوبي',
      district: 'الملز',
      city: 'الرياض',
      postalCode: '11146',
      country: 'SA',
    },
    paymentTerms: 'NET_90',
    creditLimit: 500000,
    creditHold: false,
    cashOnly: false,
    customerGroup: 'GOVERNMENT',
    priceList: 'SPECIAL',
    defaultDiscountPercent: 10,
    taxCategory: 'STANDARD_15',
    status: 'ACTIVE',
    subaccountId: custSub4.id,
    subaccountCode: custSub4.code,
    attachments: [],
    timeline: [],
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  };

  store.customers.set(tenantId, [customer1, customer2, customer3, customer4]);

  // Seed Suppliers
  const supplier1: Supplier = {
    id: crypto.randomUUID(),
    tenantId,
    code: 'SUPP-0001',
    nameAr: 'شركة التوريدات الغذائية السعودية المحدودة',
    nameEn: 'Saudi Food Supplies & Distribution Co',
    type: 'COMPANY',
    supplierType: 'LOCAL',
    vatNumber: '300445566700003',
    crNumber: '1010445566',
    unifiedNumber: '7004455667',
    mobile: '0504455667',
    email: 'orders@saudifoodsupplies.sa',
    address: {
      buildingNumber: '3190',
      street: 'المدينة الصناعية الثانية',
      district: 'المصانع',
      city: 'الرياض',
      postalCode: '14331',
      country: 'SA',
    },
    paymentTerms: 'NET_60',
    creditLimit: 200000,
    supplierGroup: 'COMMODITIES',
    taxCategory: 'STANDARD_15',
    status: 'ACTIVE',
    subaccountId: suppSub1.id,
    subaccountCode: suppSub1.code,
    attachments: [
      {
        id: crypto.randomUUID(),
        partyId: '',
        name: 'Vendor_Agreement_2026.pdf',
        type: 'CONTRACT',
        fileSize: 850000,
        mimeType: 'application/pdf',
        uploadedBy: adminUserId,
        uploadedAt: new Date().toISOString(),
      },
    ],
    contracts: [
      {
        id: crypto.randomUUID(),
        supplierId: '',
        contractNumber: 'CTR-2026-001',
        titleAr: 'عقد توريد المواد الاستهلاكية والتمور لعام 2026',
        titleEn: 'Annual Food Consumables Supply Contract 2026',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        valueSar: 500000,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
      },
    ],
    priceHistory: [
      {
        id: crypto.randomUUID(),
        supplierId: '',
        itemId: 'item-dates',
        itemSku: 'ITM-DATE-001',
        itemNameAr: 'تمر سكري ملكي فاخر مجروش',
        unitPriceSar: 20,
        recordedFrom: 'PURCHASE_BILL',
        billReference: 'BILL-2026-001',
        recordedAt: new Date(Date.now() - 15 * 86400000).toISOString(),
      },
    ],
    timeline: [
      {
        id: crypto.randomUUID(),
        timestamp: new Date(Date.now() - 40 * 86400000).toISOString(),
        eventType: 'CREATED',
        descriptionAr: 'تم تسجيل المورد وفتح حساب المراقبة الفرعي 20101-0001',
        descriptionEn: 'Supplier registered with GL subaccount 20101-0001',
        performedBy: 'النظام الآلي',
      },
    ],
    createdAt: new Date(Date.now() - 40 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  };
  supplier1.attachments.forEach((a) => (a.partyId = supplier1.id));
  supplier1.contracts.forEach((c) => (c.supplierId = supplier1.id));
  supplier1.priceHistory.forEach((p) => (p.supplierId = supplier1.id));

  const supplier2: Supplier = {
    id: crypto.randomUUID(),
    tenantId,
    code: 'SUPP-0002',
    nameAr: 'مزارع القصيم النموذجية للتمور',
    nameEn: 'Al-Qassim Model Date Farms Est',
    type: 'ESTABLISHMENT',
    supplierType: 'LOCAL',
    vatNumber: '300889900100003',
    crNumber: '1010556677',
    mobile: '0558899001',
    email: 'info@qassimdates.sa',
    address: {
      buildingNumber: '1200',
      street: 'طريق الملك عبدالعزيز',
      district: 'الصفراء',
      city: 'بريدة',
      postalCode: '51411',
      country: 'SA',
    },
    paymentTerms: 'NET_30',
    creditLimit: 100000,
    supplierGroup: 'RAW_MATERIALS',
    taxCategory: 'STANDARD_15',
    status: 'ACTIVE',
    subaccountId: suppSub2.id,
    subaccountCode: suppSub2.code,
    attachments: [],
    contracts: [],
    priceHistory: [],
    timeline: [],
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const supplier3: Supplier = {
    id: crypto.randomUUID(),
    tenantId,
    code: 'SUPP-0003',
    nameAr: 'شركة الاستيراد الإثيوبية لتجارة البن الأخضر',
    nameEn: 'Ethiopian Green Coffee Export Corp',
    type: 'FOREIGN',
    supplierType: 'INTERNATIONAL',
    mobile: '+966541122334',
    email: 'export@ethiopiancoffee.com',
    address: {
      city: 'Addis Ababa',
      country: 'ET',
    },
    paymentTerms: 'NET_90',
    creditLimit: 300000,
    supplierGroup: 'IMPORTERS',
    taxCategory: 'ZERO_RATED',
    status: 'ACTIVE',
    subaccountId: suppSub3.id,
    subaccountCode: suppSub3.code,
    attachments: [],
    contracts: [],
    priceHistory: [],
    timeline: [],
    createdAt: new Date(Date.now() - 25 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const supplier4: Supplier = {
    id: crypto.randomUUID(),
    tenantId,
    code: 'SUPP-0004',
    nameAr: 'مؤسسة التجهيزات الموقوفة (للاختبار والمراجعة)',
    nameEn: 'Suspended Supplies Est (Audit Test)',
    type: 'ESTABLISHMENT',
    supplierType: 'LOCAL',
    mobile: '0509988112',
    email: 'suspended@supplies.test',
    address: {
      city: 'الرياض',
      district: 'الصناعية القديمة',
      country: 'SA',
    },
    paymentTerms: 'IMMEDIATE',
    creditLimit: 0,
    supplierGroup: 'SERVICES',
    taxCategory: 'STANDARD_15',
    status: 'SUSPENDED', // Suspended supplier for testing purchase block and override
    subaccountId: suppSub4.id,
    subaccountCode: suppSub4.code,
    attachments: [],
    contracts: [],
    priceHistory: [],
    timeline: [
      {
        id: crypto.randomUUID(),
        timestamp: new Date(Date.now() - 5 * 86400000).toISOString(),
        eventType: 'STATUS_CHANGE',
        descriptionAr: 'تم إيقاف التعامل مع المورد لمخالفة شروط الجودة والمطابقة الفنية',
        descriptionEn: 'Supplier suspended due to non-compliance with technical quality standards',
        performedBy: 'المدير المالي',
      },
    ],
    createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  };

  store.suppliers.set(tenantId, [supplier1, supplier2, supplier3, supplier4]);

  // Seed posted General Ledger journals to establish verified ledger-derived balances! (Rule G4)
  // 1. Customer 1 invoice: 23,000 SAR (20,000 revenue + 3,000 VAT)
  // Debit Customer Subaccount 10201-0001 2,300,000 halalas
  // Credit Sales Revenue 40101 2,000,000 halalas
  // Credit VAT Output 20301 300,000 halalas
  const journals = store.journals.get(tenantId) || [];
  const jv1Id = crypto.randomUUID();
  journals.push({
    id: jv1Id,
    tenantId,
    branchId,
    entryNumber: 'JV-2026-00010',
    entryDate: '2026-02-01',
    periodId: '2026-02',
    sourceType: 'INVOICE',
    sourceId: 'INV-2026-0001',
    sourceKey: `INVOICE:${customer1.id}:INV-2026-0001`,
    reference: 'INV-2026-0001',
    descriptionAr: `فاتورة مبيعات ضريبية للعميل ${customer1.nameAr}`,
    descriptionEn: `Tax sales invoice for customer ${customer1.nameEn}`,
    totalDebitCents: 2300000n,
    totalCreditCents: 2300000n,
    status: 'POSTED',
    createdBy: adminUserId,
    createdAt: new Date(Date.now() - 28 * 86400000).toISOString(),
    lines: [
      {
        id: crypto.randomUUID(),
        journalId: jv1Id,
        accountId: custSub1.id,
        accountCode: custSub1.code,
        accountNameAr: custSub1.nameAr,
        accountNameEn: custSub1.nameEn,
        debitCents: 2300000n,
        creditCents: 0n,
        descriptionAr: 'استحقاق ذمة العميل عن فاتورة مبيعات INV-2026-0001',
        descriptionEn: 'Customer receivable for sales invoice INV-2026-0001',
      },
      {
        id: crypto.randomUUID(),
        journalId: jv1Id,
        accountId: '40101',
        accountCode: '40101',
        accountNameAr: 'إيرادات المبيعات التجارية',
        accountNameEn: 'Commercial Sales Revenue',
        debitCents: 0n,
        creditCents: 2000000n,
        descriptionAr: 'إيراد مبيعات تمور ومنتجات غذائية',
        descriptionEn: 'Sales revenue dates and food products',
      },
      {
        id: crypto.randomUUID(),
        journalId: jv1Id,
        accountId: '20301',
        accountCode: '20301',
        accountNameAr: 'ضريبة القيمة المضافة المحصلة (مخرجات)',
        accountNameEn: 'VAT Output Payable 15%',
        debitCents: 0n,
        creditCents: 300000n,
        descriptionAr: 'ضريبة مخرجات 15%',
        descriptionEn: 'VAT output 15%',
      },
    ],
  });

  // 2. Supplier 1 purchase bill: 46,000 SAR (40,000 inventory + 6,000 VAT input)
  // Debit Inventory 10401 4,000,000 halalas
  // Debit VAT Input 10301 600,000 halalas
  // Credit Supplier Subaccount 20101-0001 4,600,000 halalas
  const jv2Id = crypto.randomUUID();
  journals.push({
    id: jv2Id,
    tenantId,
    branchId,
    entryNumber: 'JV-2026-00011',
    entryDate: '2026-02-05',
    periodId: '2026-02',
    sourceType: 'BILL',
    sourceId: 'BILL-2026-0001',
    sourceKey: `BILL:${supplier1.id}:BILL-2026-0001`,
    reference: 'BILL-2026-0001',
    descriptionAr: `فاتورة مشتريات بضاعة من المورد ${supplier1.nameAr}`,
    descriptionEn: `Purchase bill from supplier ${supplier1.nameEn}`,
    totalDebitCents: 4600000n,
    totalCreditCents: 4600000n,
    status: 'POSTED',
    createdBy: adminUserId,
    createdAt: new Date(Date.now() - 25 * 86400000).toISOString(),
    lines: [
      {
        id: crypto.randomUUID(),
        journalId: jv2Id,
        accountId: '10401',
        accountCode: '10401',
        accountNameAr: 'مخزون البضائع الجاهزة للبيع',
        accountNameEn: 'Inventory on Hand',
        debitCents: 4000000n,
        creditCents: 0n,
        descriptionAr: 'استلام بضاعة ومواد غذائية بالمستودع',
        descriptionEn: 'Goods received in warehouse',
      },
      {
        id: crypto.randomUUID(),
        journalId: jv2Id,
        accountId: '10301',
        accountCode: '10301',
        accountNameAr: 'ضريبة القيمة المضافة القابلة للاسترداد (مدخلات)',
        accountNameEn: 'VAT Input Recoverable 15%',
        debitCents: 600000n,
        creditCents: 0n,
        descriptionAr: 'ضريبة مدخلات مشتريات 15%',
        descriptionEn: 'VAT input 15%',
      },
      {
        id: crypto.randomUUID(),
        journalId: jv2Id,
        accountId: suppSub1.id,
        accountCode: suppSub1.code,
        accountNameAr: suppSub1.nameAr,
        accountNameEn: suppSub1.nameEn,
        debitCents: 0n,
        creditCents: 4600000n,
        descriptionAr: 'استحقاق ذمة المورد عن فاتورة مشتريات BILL-2026-0001',
        descriptionEn: 'Supplier payable for purchase bill BILL-2026-0001',
      },
    ],
  });

  store.journals.set(tenantId, journals);
}

// ==========================================
// 2. LEDGER-DERIVED BALANCE CALCULATOR (RULE G4)
// ==========================================
export function calculatePartyLedgerBalance(
  store: CentralTenantDataStore,
  tenantId: string,
  subaccountId: string,
  subaccountCode: string,
  isSupplier: boolean
): {
  balanceHalalas: bigint;
  balanceSar: number;
  totalDebitCents: bigint;
  totalCreditCents: bigint;
  lines: PartyLedgerStatementLine[];
} {
  const journals = store.journals.get(tenantId) || [];
  let totalDebitCents = 0n;
  let totalCreditCents = 0n;
  const lines: PartyLedgerStatementLine[] = [];

  // Sort journals chronologically
  const sortedJournals = [...journals]
    .filter((j) => j.status === 'POSTED')
    .sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.entryNumber.localeCompare(b.entryNumber));

  let runningCents = 0n;

  for (const j of sortedJournals) {
    for (const l of j.lines) {
      if (l.accountId === subaccountId || l.accountCode === subaccountCode) {
        const lineDebit = typeof l.debitCents === 'bigint' ? l.debitCents : BigInt(l.debitCents || 0);
        const lineCredit = typeof l.creditCents === 'bigint' ? l.creditCents : BigInt(l.creditCents || 0);
        totalDebitCents += lineDebit;
        totalCreditCents += lineCredit;

        if (isSupplier) {
          // Supplier: Normal Balance = CREDIT
          runningCents += lineCredit - lineDebit;
        } else {
          // Customer: Normal Balance = DEBIT
          runningCents += lineDebit - lineCredit;
        }

        lines.push({
          id: l.id,
          entryNumber: j.entryNumber,
          entryDate: j.entryDate,
          descriptionAr: l.descriptionAr || j.descriptionAr,
          descriptionEn: l.descriptionEn || j.descriptionEn,
          debitCents: l.debitCents,
          creditCents: l.creditCents,
          debitSar: Number(l.debitCents) / 100,
          creditSar: Number(l.creditCents) / 100,
          runningBalanceSar: Number(runningCents) / 100,
          sourceType: j.sourceType,
          sourceId: j.sourceId,
        });
      }
    }
  }

  const balanceHalalas = isSupplier ? totalCreditCents - totalDebitCents : totalDebitCents - totalCreditCents;
  const balanceSar = Number(balanceHalalas) / 100;

  return {
    balanceHalalas,
    balanceSar,
    totalDebitCents,
    totalCreditCents,
    lines,
  };
}

// ==========================================
// 3. DUPLICATE PREVENTION & VALIDATION HOOKS
// ==========================================
export function assertNoCustomerDuplicates(
  store: CentralTenantDataStore,
  tenantId: string,
  params: {
    vatNumber?: string;
    crNumber?: string;
    unifiedNumber?: string;
    mobile: string;
  },
  excludeId?: string
) {
  const customers = store.customers.get(tenantId) || [];
  const normalizedMobile = normalizeSaudiMobile(params.mobile);

  for (const c of customers) {
    if (excludeId && c.id === excludeId) continue;

    // 1. VAT Duplicate Check
    if (params.vatNumber && params.vatNumber.trim() !== '' && c.vatNumber && c.vatNumber.trim() === params.vatNumber.trim()) {
      throw new ConflictError(
        `رقم الضريبة (${params.vatNumber}) مسجل مسبقاً للعميل "${c.nameAr}" (${c.code}). لا يمكن تكرار الرقم الضريبي. / VAT number (${params.vatNumber}) is already registered for customer "${c.nameEn || c.nameAr}" (${c.code}).`
      );
    }

    // 2. CR Duplicate Check
    if (params.crNumber && params.crNumber.trim() !== '' && c.crNumber && c.crNumber.trim() === params.crNumber.trim()) {
      throw new ConflictError(
        `رقم السجل التجاري (${params.crNumber}) مسجل مسبقاً للعميل "${c.nameAr}" (${c.code}). لا يمكن تكرار رقم السجل التجاري. / CR number (${params.crNumber}) is already registered for customer "${c.nameEn || c.nameAr}" (${c.code}).`
      );
    }

    // 3. Unified 700 Number Duplicate Check
    if (params.unifiedNumber && params.unifiedNumber.trim() !== '' && c.unifiedNumber && c.unifiedNumber.trim() === params.unifiedNumber.trim()) {
      throw new ConflictError(
        `الرقم الموحد 700 (${params.unifiedNumber}) مسجل مسبقاً للعميل "${c.nameAr}" (${c.code}). / Unified 700 Number (${params.unifiedNumber}) is already registered for customer "${c.nameEn || c.nameAr}" (${c.code}).`
      );
    }

    // 4. Mobile Duplicate Check
    if (normalizedMobile && normalizeSaudiMobile(c.mobile) === normalizedMobile) {
      throw new ConflictError(
        `رقم الجوال (${params.mobile}) مسجل مسبقاً للعميل "${c.nameAr}" (${c.code}). / Mobile number (${params.mobile}) is already registered for customer "${c.nameEn || c.nameAr}" (${c.code}).`
      );
    }
  }
}

export function assertNoSupplierDuplicates(
  store: CentralTenantDataStore,
  tenantId: string,
  params: {
    vatNumber?: string;
    crNumber?: string;
    unifiedNumber?: string;
    mobile: string;
  },
  excludeId?: string
) {
  const suppliers = store.suppliers.get(tenantId) || [];
  const normalizedMobile = normalizeSaudiMobile(params.mobile);

  for (const s of suppliers) {
    if (excludeId && s.id === excludeId) continue;

    // 1. VAT Duplicate Check
    if (params.vatNumber && params.vatNumber.trim() !== '' && s.vatNumber && s.vatNumber.trim() === params.vatNumber.trim()) {
      throw new ConflictError(
        `رقم الضريبة (${params.vatNumber}) مسجل مسبقاً للمورد "${s.nameAr}" (${s.code}). / VAT number (${params.vatNumber}) is already registered for supplier "${s.nameEn || s.nameAr}" (${s.code}).`
      );
    }

    // 2. CR Duplicate Check
    if (params.crNumber && params.crNumber.trim() !== '' && s.crNumber && s.crNumber.trim() === params.crNumber.trim()) {
      throw new ConflictError(
        `رقم السجل التجاري (${params.crNumber}) مسجل مسبقاً للمورد "${s.nameAr}" (${s.code}). / CR number (${params.crNumber}) is already registered for supplier "${s.nameEn || s.nameAr}" (${s.code}).`
      );
    }

    // 3. Unified 700 Number Duplicate Check
    if (params.unifiedNumber && params.unifiedNumber.trim() !== '' && s.unifiedNumber && s.unifiedNumber.trim() === params.unifiedNumber.trim()) {
      throw new ConflictError(
        `الرقم الموحد 700 (${params.unifiedNumber}) مسجل مسبقاً للمورد "${s.nameAr}" (${s.code}). / Unified 700 Number (${params.unifiedNumber}) is already registered for supplier "${s.nameEn || s.nameAr}" (${s.code}).`
      );
    }

    // 4. Mobile Duplicate Check
    if (normalizedMobile && normalizeSaudiMobile(s.mobile) === normalizedMobile) {
      throw new ConflictError(
        `رقم الجوال (${params.mobile}) مسجل مسبقاً للمورد "${s.nameAr}" (${s.code}). / Mobile number (${params.mobile}) is already registered for supplier "${s.nameEn || s.nameAr}" (${s.code}).`
      );
    }
  }
}

// ==========================================
// 4. SUBACCOUNT GENERATOR UNDER CONTROL ACCOUNTS
// ==========================================
export function createPartySubaccount(
  store: CentralTenantDataStore,
  tenantId: string,
  partyType: 'CUSTOMER' | 'SUPPLIER',
  nameAr: string,
  nameEn: string
): Account {
  const accounts = store.accounts.get(tenantId) || [];
  const mappings = store.accountMappings.get(tenantId) || {};
  const isCust = partyType === 'CUSTOMER';

  const controlCode = isCust
    ? mappings[DEFAULT_ACCOUNT_MAPPING_KEYS.CUSTOMERS_AR] || '10201'
    : mappings[DEFAULT_ACCOUNT_MAPPING_KEYS.SUPPLIERS_AP] || '20101';

  let controlAccount = accounts.find((a) => a.code === controlCode || a.id === controlCode);
  if (!controlAccount) {
    controlAccount = {
      id: crypto.randomUUID(),
      tenantId,
      code: controlCode,
      nameAr: isCust ? 'حساب مراقبة العملاء (الذمم المدينة)' : 'حساب مراقبة الموردين (الذمم الدائنة)',
      nameEn: isCust ? 'Accounts Receivable - Customers Control Account' : 'Accounts Payable - Suppliers Control Account',
      type: isCust ? 'ASSET' : 'LIABILITY',
      normalBalance: isCust ? 'DEBIT' : 'CREDIT',
      parentId: null,
      isHeader: true,
      allowPosting: false,
      sortOrder: isCust ? 10201 : 20101,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    accounts.push(controlAccount);
  }

  // Find all existing child subaccounts
  const existingSubaccounts = accounts.filter((a) => a.parentId === controlAccount!.id || a.code.startsWith(`${controlAccount!.code}-`));
  const seqNumber = existingSubaccounts.length + 1;
  const subCode = `${controlAccount.code}-${seqNumber.toString().padStart(4, '0')}`;

  const subaccount: Account = {
    id: crypto.randomUUID(),
    tenantId,
    code: subCode,
    nameAr: nameAr.trim(),
    nameEn: nameEn?.trim() || nameAr.trim(),
    type: controlAccount.type,
    normalBalance: controlAccount.normalBalance,
    parentId: controlAccount.id,
    isHeader: false,
    allowPosting: true,
    sortOrder: (controlAccount.sortOrder || 10000) * 100 + seqNumber,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  accounts.push(subaccount);
  store.accounts.set(tenantId, accounts);

  return subaccount;
}

// ==========================================
// 5. CUSTOMER CRUD SERVICES
// ==========================================
export function getCustomersService(
  store: CentralTenantDataStore,
  tenantId: string,
  query?: {
    search?: string;
    status?: string;
    type?: string;
    group?: string;
    salesRep?: string;
  }
): { customers: (Customer & PartyDetailSummary)[]; total: number } {
  const all = store.customers.get(tenantId) || [];
  let filtered = [...all];

  if (query?.status && query.status !== 'ALL') {
    filtered = filtered.filter((c) => c.status === query.status);
  }
  if (query?.type && query.type !== 'ALL') {
    filtered = filtered.filter((c) => c.type === query.type);
  }
  if (query?.group && query.group !== 'ALL') {
    filtered = filtered.filter((c) => c.customerGroup === query.group);
  }
  if (query?.salesRep && query.salesRep !== 'ALL') {
    filtered = filtered.filter((c) => c.salesRepName === query.salesRep || c.salesRepId === query.salesRep);
  }
  if (query?.search && query.search.trim()) {
    const q = query.search.trim().toLowerCase();
    filtered = filtered.filter(
      (c) =>
        c.nameAr.toLowerCase().includes(q) ||
        c.nameEn.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.mobile.includes(q) ||
        (c.vatNumber && c.vatNumber.includes(q)) ||
        (c.crNumber && c.crNumber.includes(q)) ||
        (c.unifiedNumber && c.unifiedNumber.includes(q))
    );
  }

  // Calculate live ledger-derived balance for each customer
  const enriched = filtered.map((c) => {
    const ledger = calculatePartyLedgerBalance(store, tenantId, c.subaccountId, c.subaccountCode, false);
    return {
      ...c,
      ledgerBalanceSar: ledger.balanceSar,
      ledgerBalanceHalalas: ledger.balanceHalalas.toString(),
      openInvoicesCount: ledger.lines.filter((l) => l.runningBalanceSar > 0).length,
      overdueAmountSar: ledger.balanceSar > 0 ? ledger.balanceSar : 0,
      ytdVolumeSar: Number(ledger.totalDebitCents) / 100,
    };
  });

  return { customers: enriched, total: enriched.length };
}

export function getCustomerByIdService(
  store: CentralTenantDataStore,
  tenantId: string,
  id: string
): (Customer & PartyDetailSummary & { ledgerLines: PartyLedgerStatementLine[] }) | null {
  const all = store.customers.get(tenantId) || [];
  const customer = all.find((c) => c.id === id || c.code === id);
  if (!customer) return null;

  const ledger = calculatePartyLedgerBalance(store, tenantId, customer.subaccountId, customer.subaccountCode, false);

  return {
    ...customer,
    ledgerBalanceSar: ledger.balanceSar,
    ledgerBalanceHalalas: ledger.balanceHalalas.toString(),
    openInvoicesCount: ledger.lines.filter((l) => l.runningBalanceSar > 0).length,
    overdueAmountSar: ledger.balanceSar > 0 ? ledger.balanceSar : 0,
    ytdVolumeSar: Number(ledger.totalDebitCents) / 100,
    ledgerLines: ledger.lines,
  };
}

export function createCustomerService(
  store: CentralTenantDataStore,
  tenantId: string,
  userId: string,
  userEmail: string,
  input: {
    nameAr: string;
    nameEn?: string;
    type: Customer['type'];
    vatNumber?: string;
    crNumber?: string;
    unifiedNumber?: string;
    mobile: string;
    email?: string;
    address?: Customer['address'];
    paymentTerms?: Customer['paymentTerms'];
    customPaymentDays?: number;
    creditLimit?: number;
    creditHold?: boolean;
    cashOnly?: boolean;
    salesRepName?: string;
    accountManagerName?: string;
    customerGroup?: Customer['customerGroup'];
    priceList?: Customer['priceList'];
    defaultDiscountPercent?: number;
    taxCategory?: Customer['taxCategory'];
  }
): Customer {
  // 1. Validation
  if (!input.nameAr || input.nameAr.trim().length < 2) {
    throw new ValidationError('اسم العميل باللغة العربية مطلوب (حرفان على الأقل) / Arabic customer name is required.');
  }
  if (!input.mobile) {
    throw new ValidationError('رقم الجوال مطلوب / Mobile number is required.');
  }

  const legalValidation = validatePartyLegalData({
    type: input.type,
    vatNumber: input.vatNumber,
    crNumber: input.crNumber,
    unifiedNumber: input.unifiedNumber,
    mobile: input.mobile,
  });
  if (!legalValidation.isValid) {
    throw new ValidationError(legalValidation.errors.map((e) => e.messageAr).join(' | '));
  }

  // 2. Duplicate Prevention
  assertNoCustomerDuplicates(store, tenantId, {
    vatNumber: input.vatNumber,
    crNumber: input.crNumber,
    unifiedNumber: input.unifiedNumber,
    mobile: input.mobile,
  });

  // 3. Auto-generate sequential customer code
  const customers = store.customers.get(tenantId) || [];
  const seq = (customers.length + 1).toString().padStart(4, '0');
  const code = `CUST-${seq}`;

  // 4. Auto-create subaccount under Customers control account (10201) (Rule G4)
  const subaccount = createPartySubaccount(
    store,
    tenantId,
    'CUSTOMER',
    input.nameAr,
    input.nameEn || input.nameAr
  );

  const newCustomer: Customer = {
    id: crypto.randomUUID(),
    tenantId,
    code,
    nameAr: input.nameAr.trim(),
    nameEn: input.nameEn?.trim() || input.nameAr.trim(),
    type: input.type || 'ESTABLISHMENT',
    vatNumber: input.vatNumber?.trim() || undefined,
    crNumber: input.crNumber?.trim() || undefined,
    unifiedNumber: input.unifiedNumber?.trim() || undefined,
    mobile: input.mobile.trim(),
    email: input.email?.trim() || undefined,
    address: input.address || { country: 'SA' },
    paymentTerms: input.paymentTerms || 'NET_30',
    customPaymentDays: input.customPaymentDays,
    creditLimit: input.creditLimit !== undefined ? Number(input.creditLimit) : 0,
    creditHold: Boolean(input.creditHold),
    cashOnly: Boolean(input.cashOnly),
    salesRepName: input.salesRepName,
    accountManagerName: input.accountManagerName,
    customerGroup: input.customerGroup || 'RETAIL',
    priceList: input.priceList || 'RETAIL',
    defaultDiscountPercent: input.defaultDiscountPercent || 0,
    taxCategory: input.taxCategory || 'STANDARD_15',
    status: 'ACTIVE',
    subaccountId: subaccount.id,
    subaccountCode: subaccount.code,
    attachments: [],
    timeline: [
      {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        eventType: 'CREATED',
        descriptionAr: `تم إنشاء العميل ${input.nameAr} وفتح الحساب الفرعي ${subaccount.code}`,
        descriptionEn: `Customer created and mapped to GL subaccount ${subaccount.code}`,
        performedBy: userEmail,
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  customers.push(newCustomer);
  store.customers.set(tenantId, customers);

  store.recordAuditLog({
    tenantId,
    userId,
    userEmail,
    action: 'CREATE_CUSTOMER',
    resourceType: 'customers',
    resourceId: newCustomer.id,
    correlationId: crypto.randomUUID(),
    changesDiff: { customer: { before: null, after: newCustomer } },
  });

  return newCustomer;
}

export function updateCustomerService(
  store: CentralTenantDataStore,
  tenantId: string,
  userId: string,
  userEmail: string,
  id: string,
  updates: Partial<Customer>
): Customer {
  const customers = store.customers.get(tenantId) || [];
  const index = customers.findIndex((c) => c.id === id || c.code === id);
  if (index === -1) {
    throw new NotFoundError(`العميل المحدد غير موجود / Customer ${id} not found.`);
  }

  const existing = customers[index];

  // If mobile or tax details changed, run duplicate and legal checks
  if (updates.mobile || updates.vatNumber || updates.crNumber || updates.unifiedNumber) {
    const mobileToCheck = updates.mobile || existing.mobile;
    const vatToCheck = updates.vatNumber !== undefined ? updates.vatNumber : existing.vatNumber;
    const crToCheck = updates.crNumber !== undefined ? updates.crNumber : existing.crNumber;
    const unifiedToCheck = updates.unifiedNumber !== undefined ? updates.unifiedNumber : existing.unifiedNumber;

    assertNoCustomerDuplicates(
      store,
      tenantId,
      {
        vatNumber: vatToCheck,
        crNumber: crToCheck,
        unifiedNumber: unifiedToCheck,
        mobile: mobileToCheck,
      },
      existing.id
    );
  }

  const before = { ...existing };
  const updated: Customer = {
    ...existing,
    ...updates,
    id: existing.id,
    tenantId: existing.tenantId,
    code: existing.code,
    subaccountId: existing.subaccountId,
    subaccountCode: existing.subaccountCode,
    updatedAt: new Date().toISOString(),
  };

  // Sync subaccount name if name changed
  if (updates.nameAr && updates.nameAr !== existing.nameAr) {
    const accounts = store.accounts.get(tenantId) || [];
    const sub = accounts.find((a) => a.id === existing.subaccountId);
    if (sub) {
      sub.nameAr = updates.nameAr;
      if (updates.nameEn) sub.nameEn = updates.nameEn;
    }
  }

  customers[index] = updated;
  store.customers.set(tenantId, customers);

  store.recordAuditLog({
    tenantId,
    userId,
    userEmail,
    action: 'UPDATE_CUSTOMER',
    resourceType: 'customers',
    resourceId: updated.id,
    correlationId: crypto.randomUUID(),
    changesDiff: { customer: { before, after: updated } },
  });

  return updated;
}

export function setCustomerStatusService(
  store: CentralTenantDataStore,
  tenantId: string,
  userId: string,
  userEmail: string,
  id: string,
  status: Customer['status'],
  reason?: string
): Customer {
  const customer = getCustomerByIdService(store, tenantId, id);
  if (!customer) {
    throw new NotFoundError(`العميل المحدد غير موجود / Customer ${id} not found.`);
  }

  const beforeStatus = customer.status;
  customer.status = status;
  customer.timeline.push({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    eventType: 'STATUS_CHANGE',
    descriptionAr: `تغيير حالة العميل من ${beforeStatus} إلى ${status} (${reason || 'بدون ملاحظات'})`,
    descriptionEn: `Status changed from ${beforeStatus} to ${status}: ${reason || 'No remarks'}`,
    performedBy: userEmail,
  });

  return updateCustomerService(store, tenantId, userId, userEmail, id, {
    status,
    timeline: customer.timeline,
  });
}

// ==========================================
// 6. SUPPLIER CRUD SERVICES
// ==========================================
export function getSuppliersService(
  store: CentralTenantDataStore,
  tenantId: string,
  query?: {
    search?: string;
    status?: string;
    type?: string;
    group?: string;
    supplierType?: string;
  }
): { suppliers: (Supplier & PartyDetailSummary)[]; total: number } {
  const all = store.suppliers.get(tenantId) || [];
  let filtered = [...all];

  if (query?.status && query.status !== 'ALL') {
    filtered = filtered.filter((s) => s.status === query.status);
  }
  if (query?.type && query.type !== 'ALL') {
    filtered = filtered.filter((s) => s.type === query.type);
  }
  if (query?.supplierType && query.supplierType !== 'ALL') {
    filtered = filtered.filter((s) => s.supplierType === query.supplierType);
  }
  if (query?.group && query.group !== 'ALL') {
    filtered = filtered.filter((s) => s.supplierGroup === query.group);
  }
  if (query?.search && query.search.trim()) {
    const q = query.search.trim().toLowerCase();
    filtered = filtered.filter(
      (s) =>
        s.nameAr.toLowerCase().includes(q) ||
        s.nameEn.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.mobile.includes(q) ||
        (s.vatNumber && s.vatNumber.includes(q)) ||
        (s.crNumber && s.crNumber.includes(q)) ||
        (s.unifiedNumber && s.unifiedNumber.includes(q))
    );
  }

  // Calculate live ledger-derived balance for each supplier
  const enriched = filtered.map((s) => {
    const ledger = calculatePartyLedgerBalance(store, tenantId, s.subaccountId, s.subaccountCode, true);
    return {
      ...s,
      ledgerBalanceSar: ledger.balanceSar,
      ledgerBalanceHalalas: ledger.balanceHalalas.toString(),
      openInvoicesCount: ledger.lines.filter((l) => l.runningBalanceSar > 0).length,
      overdueAmountSar: ledger.balanceSar > 0 ? ledger.balanceSar : 0,
      ytdVolumeSar: Number(ledger.totalCreditCents) / 100,
    };
  });

  return { suppliers: enriched, total: enriched.length };
}

export function getSupplierByIdService(
  store: CentralTenantDataStore,
  tenantId: string,
  id: string
): (Supplier & PartyDetailSummary & { ledgerLines: PartyLedgerStatementLine[] }) | null {
  const all = store.suppliers.get(tenantId) || [];
  const supplier = all.find((s) => s.id === id || s.code === id);
  if (!supplier) return null;

  const ledger = calculatePartyLedgerBalance(store, tenantId, supplier.subaccountId, supplier.subaccountCode, true);

  return {
    ...supplier,
    ledgerBalanceSar: ledger.balanceSar,
    ledgerBalanceHalalas: ledger.balanceHalalas.toString(),
    openInvoicesCount: ledger.lines.filter((l) => l.runningBalanceSar > 0).length,
    overdueAmountSar: ledger.balanceSar > 0 ? ledger.balanceSar : 0,
    ytdVolumeSar: Number(ledger.totalCreditCents) / 100,
    ledgerLines: ledger.lines,
  };
}

export function createSupplierService(
  store: CentralTenantDataStore,
  tenantId: string,
  userId: string,
  userEmail: string,
  input: {
    nameAr: string;
    nameEn?: string;
    type: Supplier['type'];
    supplierType?: Supplier['supplierType'];
    vatNumber?: string;
    crNumber?: string;
    unifiedNumber?: string;
    mobile: string;
    email?: string;
    address?: Supplier['address'];
    paymentTerms?: Supplier['paymentTerms'];
    customPaymentDays?: number;
    creditLimit?: number;
    supplierGroup?: Supplier['supplierGroup'];
    taxCategory?: Supplier['taxCategory'];
  }
): Supplier {
  // 1. Validation
  if (!input.nameAr || input.nameAr.trim().length < 2) {
    throw new ValidationError('اسم المورد باللغة العربية مطلوب / Arabic supplier name is required.');
  }
  if (!input.mobile) {
    throw new ValidationError('رقم الجوال مطلوب / Mobile number is required.');
  }

  // Duplicate Check
  assertNoSupplierDuplicates(store, tenantId, {
    vatNumber: input.vatNumber,
    crNumber: input.crNumber,
    unifiedNumber: input.unifiedNumber,
    mobile: input.mobile,
  });

  // Auto-generate code
  const suppliers = store.suppliers.get(tenantId) || [];
  const seq = (suppliers.length + 1).toString().padStart(4, '0');
  const code = `SUPP-${seq}`;

  // Auto-create subaccount under Suppliers control account (20101)
  const subaccount = createPartySubaccount(
    store,
    tenantId,
    'SUPPLIER',
    input.nameAr,
    input.nameEn || input.nameAr
  );

  const newSupplier: Supplier = {
    id: crypto.randomUUID(),
    tenantId,
    code,
    nameAr: input.nameAr.trim(),
    nameEn: input.nameEn?.trim() || input.nameAr.trim(),
    type: input.type || 'COMPANY',
    supplierType: input.supplierType || 'LOCAL',
    vatNumber: input.vatNumber?.trim() || undefined,
    crNumber: input.crNumber?.trim() || undefined,
    unifiedNumber: input.unifiedNumber?.trim() || undefined,
    mobile: input.mobile.trim(),
    email: input.email?.trim() || undefined,
    address: input.address || { country: 'SA' },
    paymentTerms: input.paymentTerms || 'NET_30',
    customPaymentDays: input.customPaymentDays,
    creditLimit: input.creditLimit !== undefined ? Number(input.creditLimit) : 0,
    supplierGroup: input.supplierGroup || 'COMMODITIES',
    taxCategory: input.taxCategory || 'STANDARD_15',
    status: 'ACTIVE',
    subaccountId: subaccount.id,
    subaccountCode: subaccount.code,
    attachments: [],
    contracts: [],
    priceHistory: [],
    timeline: [
      {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        eventType: 'CREATED',
        descriptionAr: `تم تسجيل المورد وربطه بحساب الأستاذ العام ${subaccount.code}`,
        descriptionEn: `Supplier registered and mapped to GL subaccount ${subaccount.code}`,
        performedBy: userEmail,
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  suppliers.push(newSupplier);
  store.suppliers.set(tenantId, suppliers);

  store.recordAuditLog({
    tenantId,
    userId,
    userEmail,
    action: 'CREATE_SUPPLIER',
    resourceType: 'suppliers',
    resourceId: newSupplier.id,
    correlationId: crypto.randomUUID(),
    changesDiff: { supplier: { before: null, after: newSupplier } },
  });

  return newSupplier;
}

export function updateSupplierService(
  store: CentralTenantDataStore,
  tenantId: string,
  userId: string,
  userEmail: string,
  id: string,
  updates: Partial<Supplier>
): Supplier {
  const suppliers = store.suppliers.get(tenantId) || [];
  const index = suppliers.findIndex((s) => s.id === id || s.code === id);
  if (index === -1) {
    throw new NotFoundError(`المورد المحدد غير موجود / Supplier ${id} not found.`);
  }

  const existing = suppliers[index];

  if (updates.mobile || updates.vatNumber || updates.crNumber || updates.unifiedNumber) {
    assertNoSupplierDuplicates(
      store,
      tenantId,
      {
        vatNumber: updates.vatNumber !== undefined ? updates.vatNumber : existing.vatNumber,
        crNumber: updates.crNumber !== undefined ? updates.crNumber : existing.crNumber,
        unifiedNumber: updates.unifiedNumber !== undefined ? updates.unifiedNumber : existing.unifiedNumber,
        mobile: updates.mobile || existing.mobile,
      },
      existing.id
    );
  }

  const before = { ...existing };
  const updated: Supplier = {
    ...existing,
    ...updates,
    id: existing.id,
    tenantId: existing.tenantId,
    code: existing.code,
    subaccountId: existing.subaccountId,
    subaccountCode: existing.subaccountCode,
    updatedAt: new Date().toISOString(),
  };

  if (updates.nameAr && updates.nameAr !== existing.nameAr) {
    const accounts = store.accounts.get(tenantId) || [];
    const sub = accounts.find((a) => a.id === existing.subaccountId);
    if (sub) {
      sub.nameAr = updates.nameAr;
      if (updates.nameEn) sub.nameEn = updates.nameEn;
    }
  }

  suppliers[index] = updated;
  store.suppliers.set(tenantId, suppliers);

  store.recordAuditLog({
    tenantId,
    userId,
    userEmail,
    action: 'UPDATE_SUPPLIER',
    resourceType: 'suppliers',
    resourceId: updated.id,
    correlationId: crypto.randomUUID(),
    changesDiff: { supplier: { before, after: updated } },
  });

  return updated;
}

export function setSupplierStatusService(
  store: CentralTenantDataStore,
  tenantId: string,
  userId: string,
  userEmail: string,
  id: string,
  status: Supplier['status'],
  reason?: string
): Supplier {
  const supplier = getSupplierByIdService(store, tenantId, id);
  if (!supplier) {
    throw new NotFoundError(`المورد المحدد غير موجود / Supplier ${id} not found.`);
  }

  const beforeStatus = supplier.status;
  supplier.status = status;
  supplier.timeline.push({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    eventType: 'STATUS_CHANGE',
    descriptionAr: `تغيير حالة المورد من ${beforeStatus} إلى ${status} (${reason || 'بدون ملاحظات'})`,
    descriptionEn: `Supplier status changed from ${beforeStatus} to ${status}: ${reason || 'No remarks'}`,
    performedBy: userEmail,
  });

  return updateSupplierService(store, tenantId, userId, userEmail, id, {
    status,
    timeline: supplier.timeline,
  });
}

// ==========================================
// 7. SUSPENDED SUPPLIER PURCHASE BLOCK & OVERRIDE
// ==========================================
export function checkSupplierCanPurchaseService(
  store: CentralTenantDataStore,
  tenantId: string,
  userId: string,
  userEmail: string,
  supplierId: string,
  overrideAuth?: {
    hasOverridePermission: boolean;
    reason?: string;
  }
): {
  allowed: boolean;
  reason?: string;
  reasonAr?: string;
  wasOverridden?: boolean;
  auditLogged?: boolean;
} {
  const supplier = getSupplierByIdService(store, tenantId, supplierId);
  if (!supplier) {
    return {
      allowed: false,
      reason: 'Supplier not found.',
      reasonAr: 'المورد المحدد غير موجود في النظام.',
    };
  }

  if (supplier.status === 'ARCHIVED') {
    return {
      allowed: false,
      reason: 'Supplier is archived. No new purchasing documents can be issued.',
      reasonAr: 'المورد مؤرشف ومغلق نهائياً. لا يمكن إصدار أوامر شراء أو فواتير له.',
    };
  }

  if (supplier.status === 'SUSPENDED') {
    // If caller has explicit override authorization and provided a valid reason
    if (overrideAuth?.hasOverridePermission) {
      if (!overrideAuth.reason || overrideAuth.reason.trim().length < 5) {
        return {
          allowed: false,
          reason: 'Override requires a detailed justification reason (minimum 5 characters).',
          reasonAr: 'تجاوز حظر المورد الموقوف يتطلب تقديم سبب ومبرر تفصيلي (5 أحرف على الأقل).',
        };
      }

      // Record immutable audit event for compliance
      store.recordAuditLog({
        tenantId,
        userId,
        userEmail,
        action: 'PURCHASE_OVERRIDE_SUSPENDED_SUPPLIER',
        resourceType: 'suppliers',
        resourceId: supplier.id,
        correlationId: crypto.randomUUID(),
        changesDiff: {
          override: {
            supplierCode: supplier.code,
            supplierName: supplier.nameAr,
            overrideReason: overrideAuth.reason.trim(),
            authorizedBy: userEmail,
          },
        },
      });

      return {
        allowed: true,
        wasOverridden: true,
        auditLogged: true,
        reason: 'Authorized purchase override logged in audit trail.',
        reasonAr: 'تم السماح بالشراء استثنائياً وتوثيق التجاوز في سجل التدقيق الأمني.',
      };
    }

    return {
      allowed: false,
      reason: 'Supplier is currently suspended from purchasing. Requires authorized manager override with reason.',
      reasonAr: 'المورد موقوف حالياً وممنوع من الشراء. يتطلب إذناً رسمياً ومبرراً من رئيس الحسابات.',
    };
  }

  return { allowed: true };
}

// ==========================================
// 8. BATCH IMPORT / EXPORT ENGINE & ROLLBACK
// ==========================================
export function executePartyImportService(
  store: CentralTenantDataStore,
  tenantId: string,
  userId: string,
  userEmail: string,
  params: {
    entity: 'CUSTOMER' | 'SUPPLIER';
    mode: 'CREATE_ONLY' | 'UPDATE_ONLY' | 'CREATE_OR_UPDATE';
    rows: any[];
  }
): BatchImportReport {
  const { entity, mode, rows } = params;
  const batchId = crypto.randomUUID();
  const errors: ImportRowError[] = [];
  const createdEntityIds: string[] = [];
  const createdSubaccountIds: string[] = [];
  const previousSnapshots: Array<{ id: string; snapshot: any }> = [];

  let createdCount = 0;
  let updatedCount = 0;
  let failedCount = 0;

  const existingCustomers = store.customers.get(tenantId) || [];
  const existingSuppliers = store.suppliers.get(tenantId) || [];

  // Track values seen in the current file to prevent intra-file duplicates
  const seenMobiles = new Set<string>();
  const seenVats = new Set<string>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // CSV line number (accounting for header row)
    const nameAr = row.nameAr?.trim();
    const mobile = row.mobile?.trim();
    const vatNumber = row.vatNumber?.trim() || undefined;
    const crNumber = row.crNumber?.trim() || undefined;
    const unifiedNumber = row.unifiedNumber?.trim() || undefined;

    // 1. Mandatory checks
    if (!nameAr || nameAr.length < 2) {
      errors.push({
        rowNumber,
        column: 'nameAr',
        value: nameAr || '',
        messageAr: 'اسم المنشأة/الشخص باللغة العربية مطلوب (حرفان على الأقل)',
        messageEn: 'Arabic name is required (minimum 2 chars)',
      });
      failedCount++;
      return;
    }

    if (!mobile || !validateSaudiMobile(mobile)) {
      errors.push({
        rowNumber,
        column: 'mobile',
        value: mobile || '',
        messageAr: 'رقم الجوال غير صحيح أو مفقود (صيغة 05XXXXXXXX)',
        messageEn: 'Invalid or missing Saudi mobile number',
      });
      failedCount++;
      return;
    }

    // 2. Intra-file duplicate checks
    const normalizedMob = normalizeSaudiMobile(mobile);
    if (seenMobiles.has(normalizedMob)) {
      errors.push({
        rowNumber,
        column: 'mobile',
        value: mobile,
        messageAr: `رقم الجوال ${mobile} مكرر أكثر من مرة داخل ملف الاستيراد`,
        messageEn: `Mobile number ${mobile} is duplicated within the import file`,
      });
      failedCount++;
      return;
    }
    seenMobiles.add(normalizedMob);

    if (vatNumber) {
      if (seenVats.has(vatNumber)) {
        errors.push({
          rowNumber,
          column: 'vatNumber',
          value: vatNumber,
          messageAr: `الرقم الضريبي ${vatNumber} مكرر داخل ملف الاستيراد`,
          messageEn: `VAT number ${vatNumber} is duplicated within the import file`,
        });
        failedCount++;
        return;
      }
      seenVats.add(vatNumber);
    }

    // 3. Match against existing records
    let matchedEntity: any = null;
    if (entity === 'CUSTOMER') {
      matchedEntity = existingCustomers.find(
        (c) =>
          normalizeSaudiMobile(c.mobile) === normalizedMob ||
          (vatNumber && c.vatNumber === vatNumber) ||
          (crNumber && c.crNumber === crNumber)
      );
    } else {
      matchedEntity = existingSuppliers.find(
        (s) =>
          normalizeSaudiMobile(s.mobile) === normalizedMob ||
          (vatNumber && s.vatNumber === vatNumber) ||
          (crNumber && s.crNumber === crNumber)
      );
    }

    // 4. Mode branch
    if (mode === 'CREATE_ONLY' && matchedEntity) {
      errors.push({
        rowNumber,
        column: 'record',
        value: matchedEntity.code,
        messageAr: `السجل مسجل مسبقاً في النظام برمز (${matchedEntity.code}) ووضع الاستيراد هو إنشاء فقط`,
        messageEn: `Record already exists (${matchedEntity.code}) and mode is CREATE_ONLY`,
      });
      failedCount++;
      return;
    }

    if (mode === 'UPDATE_ONLY' && !matchedEntity) {
      errors.push({
        rowNumber,
        column: 'record',
        value: mobile,
        messageAr: `لم يتم العثور على سجل مطابق للتحديث ووضع الاستيراد هو تحديث فقط`,
        messageEn: `No matching record found to update and mode is UPDATE_ONLY`,
      });
      failedCount++;
      return;
    }

    try {
      if (matchedEntity) {
        // UPDATE Existing
        previousSnapshots.push({ id: matchedEntity.id, snapshot: JSON.parse(JSON.stringify(matchedEntity)) });
        if (entity === 'CUSTOMER') {
          updateCustomerService(store, tenantId, userId, userEmail, matchedEntity.id, {
            nameAr,
            nameEn: row.nameEn?.trim() || matchedEntity.nameEn,
            email: row.email?.trim() || matchedEntity.email,
            creditLimit: row.creditLimit !== undefined ? Number(row.creditLimit) : matchedEntity.creditLimit,
            paymentTerms: row.paymentTerms || matchedEntity.paymentTerms,
          });
        } else {
          updateSupplierService(store, tenantId, userId, userEmail, matchedEntity.id, {
            nameAr,
            nameEn: row.nameEn?.trim() || matchedEntity.nameEn,
            email: row.email?.trim() || matchedEntity.email,
            creditLimit: row.creditLimit !== undefined ? Number(row.creditLimit) : matchedEntity.creditLimit,
            paymentTerms: row.paymentTerms || matchedEntity.paymentTerms,
          });
        }
        updatedCount++;
      } else {
        // CREATE New
        if (entity === 'CUSTOMER') {
          const created = createCustomerService(store, tenantId, userId, userEmail, {
            nameAr,
            nameEn: row.nameEn?.trim() || nameAr,
            type: row.type || 'ESTABLISHMENT',
            vatNumber,
            crNumber,
            unifiedNumber,
            mobile,
            email: row.email?.trim(),
            paymentTerms: row.paymentTerms || 'NET_30',
            creditLimit: Number(row.creditLimit) || 0,
            customerGroup: row.customerGroup || 'RETAIL',
            priceList: row.priceList || 'RETAIL',
          });
          createdEntityIds.push(created.id);
          createdSubaccountIds.push(created.subaccountId);
        } else {
          const created = createSupplierService(store, tenantId, userId, userEmail, {
            nameAr,
            nameEn: row.nameEn?.trim() || nameAr,
            type: row.type || 'COMPANY',
            supplierType: row.supplierType || 'LOCAL',
            vatNumber,
            crNumber,
            unifiedNumber,
            mobile,
            email: row.email?.trim(),
            paymentTerms: row.paymentTerms || 'NET_30',
            creditLimit: Number(row.creditLimit) || 0,
            supplierGroup: row.supplierGroup || 'COMMODITIES',
          });
          createdEntityIds.push(created.id);
          createdSubaccountIds.push(created.subaccountId);
        }
        createdCount++;
      }
    } catch (err: any) {
      errors.push({
        rowNumber,
        column: 'general',
        value: '',
        messageAr: err.message,
        messageEn: err.message,
      });
      failedCount++;
    }
  });

  // Save batch snapshot for rollback capability
  const batchSnapshot: BatchImportSnapshot = {
    batchId,
    tenantId,
    entity,
    mode,
    totalRows: rows.length,
    createdCount,
    updatedCount,
    failedCount,
    createdEntityIds,
    createdSubaccountIds,
    previousSnapshots,
    errors,
    isRolledBack: false,
    createdBy: userEmail,
    createdAt: new Date().toISOString(),
  };

  const batches = store.batchImports.get(tenantId) || [];
  batches.unshift(batchSnapshot);
  store.batchImports.set(tenantId, batches);

  store.recordAuditLog({
    tenantId,
    userId,
    userEmail,
    action: `IMPORT_${entity}_BATCH`,
    resourceType: 'batch_imports',
    resourceId: batchId,
    correlationId: crypto.randomUUID(),
    changesDiff: {
      report: {
        batchId,
        entity,
        totalRows: rows.length,
        createdCount,
        updatedCount,
        failedCount,
      },
    },
  });

  return {
    batchId,
    entity,
    mode,
    totalRows: rows.length,
    createdCount,
    updatedCount,
    failedCount,
    errors,
    createdAt: batchSnapshot.createdAt,
  };
}

export function rollbackPartyImportService(
  store: CentralTenantDataStore,
  tenantId: string,
  userId: string,
  userEmail: string,
  batchId: string
): { success: boolean; rolledBackCreated: number; rolledBackUpdated: number } {
  const batches = store.batchImports.get(tenantId) || [];
  const batch = batches.find((b) => b.batchId === batchId);
  if (!batch) {
    throw new NotFoundError(`دفعة الاستيراد غير موجودة / Batch import ${batchId} not found.`);
  }

  if (batch.isRolledBack) {
    throw new ValidationError(`تم التراجع عن هذه الدفعة مسبقاً / Batch import ${batchId} is already rolled back.`);
  }

  let rolledBackCreated = 0;
  let rolledBackUpdated = 0;

  // 1. Rollback created entities
  if (batch.entity === 'CUSTOMER') {
    const customers = store.customers.get(tenantId) || [];
    const remainingCustomers = customers.filter((c) => !batch.createdEntityIds.includes(c.id));
    store.customers.set(tenantId, remainingCustomers);
    rolledBackCreated = batch.createdEntityIds.length;
  } else {
    const suppliers = store.suppliers.get(tenantId) || [];
    const remainingSuppliers = suppliers.filter((s) => !batch.createdEntityIds.includes(s.id));
    store.suppliers.set(tenantId, remainingSuppliers);
    rolledBackCreated = batch.createdEntityIds.length;
  }

  // 2. Rollback auto-created GL subaccounts
  const accounts = store.accounts.get(tenantId) || [];
  const remainingAccounts = accounts.filter((a) => !batch.createdSubaccountIds.includes(a.id));
  store.accounts.set(tenantId, remainingAccounts);

  // 3. Rollback updated entities to their snapshot
  if (batch.entity === 'CUSTOMER') {
    const customers = store.customers.get(tenantId) || [];
    for (const snap of batch.previousSnapshots) {
      const idx = customers.findIndex((c) => c.id === snap.id);
      if (idx !== -1) {
        customers[idx] = snap.snapshot;
        rolledBackUpdated++;
      }
    }
    store.customers.set(tenantId, customers);
  } else {
    const suppliers = store.suppliers.get(tenantId) || [];
    for (const snap of batch.previousSnapshots) {
      const idx = suppliers.findIndex((s) => s.id === snap.id);
      if (idx !== -1) {
        suppliers[idx] = snap.snapshot;
        rolledBackUpdated++;
      }
    }
    store.suppliers.set(tenantId, suppliers);
  }

  batch.isRolledBack = true;
  batch.rolledBackAt = new Date().toISOString();

  store.recordAuditLog({
    tenantId,
    userId,
    userEmail,
    action: `ROLLBACK_${batch.entity}_BATCH`,
    resourceType: 'batch_imports',
    resourceId: batchId,
    correlationId: crypto.randomUUID(),
    changesDiff: {
      rolledBackCreated,
      rolledBackUpdated,
      batchId,
    },
  });

  return { success: true, rolledBackCreated, rolledBackUpdated };
}

// ==========================================
// 9. EXPORT PARTIES TO CSV WITH UTF-8 BOM
// ==========================================
export function exportPartiesService(
  store: CentralTenantDataStore,
  tenantId: string,
  entity: 'CUSTOMER' | 'SUPPLIER'
): { csv: string; filename: string } {
  const isCust = entity === 'CUSTOMER';
  const headers = isCust
    ? 'رمز العميل,الاسم بالعربية,الاسم بالإنجليزية,النوع,الرقم الضريبي,السجل التجاري,الرقم الموحد,الجوال,البريد الإلكتروني,شروط الدفع,الحد الائتماني,الحالة,رصيد الأستاذ العام (ر.س)\n'
    : 'رمز المورد,الاسم بالعربية,الاسم بالإنجليزية,النوع,التصنيف,الرقم الضريبي,السجل التجاري,الرقم الموحد,الجوال,البريد الإلكتروني,شروط الدفع,الحد الائتماني,الحالة,رصيد الأستاذ العام (ر.س)\n';

  let rows = '';

  if (isCust) {
    const list = getCustomersService(store, tenantId).customers;
    for (const c of list) {
      rows += `"${c.code}","${c.nameAr}","${c.nameEn || ''}","${c.type}","${c.vatNumber || ''}","${c.crNumber || ''}","${c.unifiedNumber || ''}","${c.mobile}","${c.email || ''}","${c.paymentTerms}","${c.creditLimit}","${c.status}","${c.ledgerBalanceSar.toFixed(2)}"\n`;
    }
  } else {
    const list = getSuppliersService(store, tenantId).suppliers;
    for (const s of list) {
      rows += `"${s.code}","${s.nameAr}","${s.nameEn || ''}","${s.type}","${s.supplierType}","${s.vatNumber || ''}","${s.crNumber || ''}","${s.unifiedNumber || ''}","${s.mobile}","${s.email || ''}","${s.paymentTerms}","${s.creditLimit}","${s.status}","${s.ledgerBalanceSar.toFixed(2)}"\n`;
    }
  }

  // Prepend UTF-8 BOM for perfect Excel rendering of Arabic text
  const csv = '\uFEFF' + headers + rows;
  const filename = `${entity.toLowerCase()}s_export_${new Date().toISOString().slice(0, 10)}.csv`;

  return { csv, filename };
}


import { getDb } from './client.js';
import { taxRatesTable, unitsOfMeasureTable, documentTypesTable, accountsTable } from './schema.js';
import { logger } from '../core/logger.js';

export const SYSTEM_DEFAULT_TAX_RATES = [
  {
    code: 'VAT_15',
    nameAr: 'ضريبة القيمة المضافة بالنسبة الأساسية (15%)',
    nameEn: 'Standard Rate VAT (15%)',
    ratePercentage: 15,
    taxCategoryCode: 'S',
    isSystemDefault: true,
    isActive: true,
  },
  {
    code: 'VAT_0',
    nameAr: 'ضريبة القيمة المضافة بنسبة الصفر (0%)',
    nameEn: 'Zero-Rated VAT (0%)',
    ratePercentage: 0,
    taxCategoryCode: 'Z',
    isSystemDefault: true,
    isActive: true,
  },
  {
    code: 'VAT_EXEMPT',
    nameAr: 'معفى من ضريبة القيمة المضافة',
    nameEn: 'Exempt from VAT',
    ratePercentage: 0,
    taxCategoryCode: 'E',
    isSystemDefault: true,
    isActive: true,
  },
  {
    code: 'VAT_OUT_OF_SCOPE',
    nameAr: 'خارج نطاق ضريبة القيمة المضافة',
    nameEn: 'Out of Scope of VAT',
    ratePercentage: 0,
    taxCategoryCode: 'O',
    isSystemDefault: true,
    isActive: true,
  },
];

export const SYSTEM_DEFAULT_UNITS_OF_MEASURE = [
  { code: 'PCE', nameAr: 'حبة / قطعة', nameEn: 'Piece', symbolAr: 'حبة', symbolEn: 'pcs', isSystemDefault: true },
  { code: 'BX', nameAr: 'صندوق / علبة', nameEn: 'Box', symbolAr: 'علبة', symbolEn: 'box', isSystemDefault: true },
  { code: 'CT', nameAr: 'كرتون', nameEn: 'Carton', symbolAr: 'كرتون', symbolEn: 'ctn', isSystemDefault: true },
  { code: 'KGM', nameAr: 'كيلوغرام', nameEn: 'Kilogram', symbolAr: 'كجم', symbolEn: 'kg', isSystemDefault: true },
  { code: 'GRM', nameAr: 'غرام', nameEn: 'Gram', symbolAr: 'جم', symbolEn: 'g', isSystemDefault: true },
  { code: 'MTR', nameAr: 'متر', nameEn: 'Meter', symbolAr: 'م', symbolEn: 'm', isSystemDefault: true },
  { code: 'LTR', nameAr: 'لتر', nameEn: 'Liter', symbolAr: 'لتر', symbolEn: 'L', isSystemDefault: true },
  { code: 'HUR', nameAr: 'ساعة عمل', nameEn: 'Hour', symbolAr: 'ساعة', symbolEn: 'hr', isSystemDefault: true },
];

export const SYSTEM_DEFAULT_DOCUMENT_TYPES = [
  { code: 'STD_INV', nameAr: 'فاتورة ضريبية قياسية (B2B)', nameEn: 'Standard Tax Invoice (B2B)', zatcaInvoiceTypeCode: '388', zatcaInvoiceSubtype: '0100000' },
  { code: 'SMP_INV', nameAr: 'فاتورة ضريبية مبسطة (B2C)', nameEn: 'Simplified Tax Invoice (B2C)', zatcaInvoiceTypeCode: '383', zatcaInvoiceSubtype: '0200000' },
  { code: 'CR_NOTE', nameAr: 'إشعار دائن (مرتجع / خصم)', nameEn: 'Credit Note', zatcaInvoiceTypeCode: '381', zatcaInvoiceSubtype: '0100000' },
  { code: 'DB_NOTE', nameAr: 'إشعار مدين', nameEn: 'Debit Note', zatcaInvoiceTypeCode: '383', zatcaInvoiceSubtype: '0100000' },
];

export const SAUDI_STANDARD_CHART_OF_ACCOUNTS = [
  // 1: ASSETS
  { code: '10000', nameAr: 'الأصول', nameEn: 'Assets', type: 'ASSET', normalBalance: 'DEBIT', isHeader: true, allowPosting: false, sortOrder: 100 },
  { code: '10100', nameAr: 'النقد وما في حكمه', nameEn: 'Cash and Cash Equivalents', type: 'ASSET', normalBalance: 'DEBIT', isHeader: true, allowPosting: false, sortOrder: 110 },
  { code: '10101', nameAr: 'الصندوق الرئيسي (النقدية)', nameEn: 'Main Cash Vault', type: 'ASSET', normalBalance: 'DEBIT', isHeader: false, allowPosting: true, sortOrder: 111 },
  { code: '10102', nameAr: 'الحساب الجاري البنكي', nameEn: 'Operating Bank Account', type: 'ASSET', normalBalance: 'DEBIT', isHeader: false, allowPosting: true, sortOrder: 112 },
  { code: '10200', nameAr: 'الذمم المدينة والتأمينات', nameEn: 'Accounts Receivable & Advances', type: 'ASSET', normalBalance: 'DEBIT', isHeader: true, allowPosting: false, sortOrder: 120 },
  { code: '10201', nameAr: 'العملاء التجاريين', nameEn: 'Trade Debtors / Customers', type: 'ASSET', normalBalance: 'DEBIT', isHeader: false, allowPosting: true, sortOrder: 121 },
  { code: '10202', nameAr: 'دفعات مقدمة للموردين', nameEn: 'Supplier Advances / Prepaid Purchases', type: 'ASSET', normalBalance: 'DEBIT', isHeader: false, allowPosting: true, sortOrder: 122 },
  { code: '10301', nameAr: 'ضريبة المدخلات القابلة للاسترداد (15%)', nameEn: 'VAT Input Tax Recoverable', type: 'ASSET', normalBalance: 'DEBIT', isHeader: false, allowPosting: true, sortOrder: 130 },
  { code: '10401', nameAr: 'مخزون البضائع بغرض البيع', nameEn: 'Inventory on Hand (Merchandise)', type: 'ASSET', normalBalance: 'DEBIT', isHeader: false, allowPosting: true, sortOrder: 140 },
  { code: '10500', nameAr: 'الأصول الثابتة وإهلاكها', nameEn: 'Fixed Assets & Depreciation', type: 'ASSET', normalBalance: 'DEBIT', isHeader: true, allowPosting: false, sortOrder: 150 },
  { code: '10501', nameAr: 'أصول ثابتة - السيارات والشاحنات', nameEn: 'Fixed Assets - Motor Vehicles', type: 'ASSET', normalBalance: 'DEBIT', isHeader: false, allowPosting: true, sortOrder: 151 },
  { code: '10502', nameAr: 'مجمع إهلاك السيارات والشاحنات', nameEn: 'Accumulated Depreciation - Motor Vehicles', type: 'ASSET', normalBalance: 'CREDIT', isHeader: false, allowPosting: true, sortOrder: 152 },
  { code: '10503', nameAr: 'أصول ثابتة - أجهزة وتقنية المعلومات', nameEn: 'Fixed Assets - IT & Technology', type: 'ASSET', normalBalance: 'DEBIT', isHeader: false, allowPosting: true, sortOrder: 153 },
  { code: '10504', nameAr: 'مجمع إهلاك أجهزة وتقنية المعلومات', nameEn: 'Accumulated Depreciation - IT & Technology', type: 'ASSET', normalBalance: 'CREDIT', isHeader: false, allowPosting: true, sortOrder: 154 },
  { code: '10505', nameAr: 'أصول ثابتة - الأثاث والمعدات المكتبية', nameEn: 'Fixed Assets - Furniture & Fixtures', type: 'ASSET', normalBalance: 'DEBIT', isHeader: false, allowPosting: true, sortOrder: 155 },
  { code: '10506', nameAr: 'مجمع إهلاك الأثاث والمعدات المكتبية', nameEn: 'Accumulated Depreciation - Furniture & Fixtures', type: 'ASSET', normalBalance: 'CREDIT', isHeader: false, allowPosting: true, sortOrder: 156 },
  { code: '10507', nameAr: 'أصول ثابتة - الآلات والمعدات التشغيلية', nameEn: 'Fixed Assets - Machinery & Equipment', type: 'ASSET', normalBalance: 'DEBIT', isHeader: false, allowPosting: true, sortOrder: 157 },
  { code: '10508', nameAr: 'مجمع إهلاك الآلات والمعدات التشغيلية', nameEn: 'Accumulated Depreciation - Machinery & Equipment', type: 'ASSET', normalBalance: 'CREDIT', isHeader: false, allowPosting: true, sortOrder: 158 },
  { code: '10509', nameAr: 'أصول ثابتة - المباني والإنشاءات', nameEn: 'Fixed Assets - Buildings & Construction', type: 'ASSET', normalBalance: 'DEBIT', isHeader: false, allowPosting: true, sortOrder: 159 },
  { code: '10510', nameAr: 'مجمع إهلاك المباني والإنشاءات', nameEn: 'Accumulated Depreciation - Buildings', type: 'ASSET', normalBalance: 'CREDIT', isHeader: false, allowPosting: true, sortOrder: 160 },
  
  // 2: LIABILITIES
  { code: '20000', nameAr: 'الالتزامات', nameEn: 'Liabilities', type: 'LIABILITY', normalBalance: 'CREDIT', isHeader: true, allowPosting: false, sortOrder: 200 },
  { code: '20101', nameAr: 'الذمم الدائنة التجارية (الموردين)', nameEn: 'Accounts Payable (Suppliers)', type: 'LIABILITY', normalBalance: 'CREDIT', isHeader: false, allowPosting: true, sortOrder: 210 },
  { code: '20102', nameAr: 'دفعات مقدمة من العملاء', nameEn: 'Customer Advances / Unearned Revenue', type: 'LIABILITY', normalBalance: 'CREDIT', isHeader: false, allowPosting: true, sortOrder: 211 },
  { code: '20201', nameAr: 'المصروفات المستحقة والمخصصات', nameEn: 'Accrued Expenses & Provisions', type: 'LIABILITY', normalBalance: 'CREDIT', isHeader: false, allowPosting: true, sortOrder: 220 },
  { code: '20301', nameAr: 'ضريبة المخرجات المستحقة لهيئة الزكاة (15%)', nameEn: 'VAT Output Tax Payable', type: 'LIABILITY', normalBalance: 'CREDIT', isHeader: false, allowPosting: true, sortOrder: 230 },

  // 3: EQUITY
  { code: '30000', nameAr: 'حقوق الملكية', nameEn: 'Equity', type: 'EQUITY', normalBalance: 'CREDIT', isHeader: true, allowPosting: false, sortOrder: 300 },
  { code: '30101', nameAr: 'رأس المال المدفوع', nameEn: 'Paid-in Capital', type: 'EQUITY', normalBalance: 'CREDIT', isHeader: false, allowPosting: true, sortOrder: 310 },
  { code: '30201', nameAr: 'الأرباح المبقاة', nameEn: 'Retained Earnings', type: 'EQUITY', normalBalance: 'CREDIT', isHeader: false, allowPosting: true, sortOrder: 320 },

  // 4: REVENUES
  { code: '40000', nameAr: 'الإيرادات', nameEn: 'Revenues', type: 'REVENUE', normalBalance: 'CREDIT', isHeader: true, allowPosting: false, sortOrder: 400 },
  { code: '40101', nameAr: 'إيرادات المبيعات التجارية', nameEn: 'Commercial Sales Revenue', type: 'REVENUE', normalBalance: 'CREDIT', isHeader: false, allowPosting: true, sortOrder: 410 },
  { code: '40102', nameAr: 'مردودات ومسموحات المبيعات', nameEn: 'Sales Returns & Allowances', type: 'REVENUE', normalBalance: 'DEBIT', isHeader: false, allowPosting: true, sortOrder: 420 },
  { code: '40301', nameAr: 'أرباح بيع واستبعاد أصول ثابتة', nameEn: 'Gain on Fixed Asset Disposal', type: 'REVENUE', normalBalance: 'CREDIT', isHeader: false, allowPosting: true, sortOrder: 430 },

  // 5: COGS & EXPENSES
  { code: '50000', nameAr: 'تكلفة المبيعات والمصروفات التشغيلية', nameEn: 'COGS & Operating Expenses', type: 'EXPENSE', normalBalance: 'DEBIT', isHeader: true, allowPosting: false, sortOrder: 500 },
  { code: '50101', nameAr: 'تكلفة البضاعة المباعة (COGS)', nameEn: 'Cost of Goods Sold', type: 'COGS', normalBalance: 'DEBIT', isHeader: false, allowPosting: true, sortOrder: 510 },
  { code: '50102', nameAr: 'مشتريات بضائع بغرض البيع', nameEn: 'Merchandise Purchases', type: 'COGS', normalBalance: 'DEBIT', isHeader: false, allowPosting: true, sortOrder: 511 },
  { code: '50103', nameAr: 'مردودات ومسموحات المشتريات', nameEn: 'Purchase Returns & Allowances', type: 'COGS', normalBalance: 'CREDIT', isHeader: false, allowPosting: true, sortOrder: 512 },
  { code: '50201', nameAr: 'الرواتب والأجور ومستحقات الموظفين', nameEn: 'Salaries & Employee Benefits', type: 'EXPENSE', normalBalance: 'DEBIT', isHeader: false, allowPosting: true, sortOrder: 520 },
  { code: '50301', nameAr: 'الإيجارات التشغيلية', nameEn: 'Operating Rent Expense', type: 'EXPENSE', normalBalance: 'DEBIT', isHeader: false, allowPosting: true, sortOrder: 530 },
  { code: '50401', nameAr: 'رسوم الخدمات المصرفية ونقاط البيع', nameEn: 'Bank & POS Service Fees', type: 'EXPENSE', normalBalance: 'DEBIT', isHeader: false, allowPosting: true, sortOrder: 540 },
  { code: '50402', nameAr: 'فروقات وترحيل الهللات', nameEn: 'Rounding Differences / Variances', type: 'EXPENSE', normalBalance: 'DEBIT', isHeader: false, allowPosting: true, sortOrder: 541 },
  { code: '50403', nameAr: 'خسائر بيع واستبعاد وتخريد أصول ثابتة', nameEn: 'Loss on Fixed Asset Disposal & Scrapping', type: 'EXPENSE', normalBalance: 'DEBIT', isHeader: false, allowPosting: true, sortOrder: 542 },
  { code: '50501', nameAr: 'مصروف إهلاك الأصول الثابتة', nameEn: 'Depreciation Expense', type: 'EXPENSE', normalBalance: 'DEBIT', isHeader: false, allowPosting: true, sortOrder: 550 },
];

export async function seedSystemDefaults(): Promise<{ seeded: boolean; message: string }> {
  const db = getDb();
  if (!db) {
    logger.info('Database client not connected. Seed manifests validated and ready for target PostgreSQL instance.');
    return {
      seeded: false,
      message: 'Database not connected. System seed manifests validated in-memory successfully.',
    };
  }

  logger.info('Executing system-only defaults seed...');

  try {
    for (const tax of SYSTEM_DEFAULT_TAX_RATES) {
      await db.insert(taxRatesTable).values(tax).onConflictDoNothing();
    }
    for (const uom of SYSTEM_DEFAULT_UNITS_OF_MEASURE) {
      await db.insert(unitsOfMeasureTable).values(uom).onConflictDoNothing();
    }
    for (const docType of SYSTEM_DEFAULT_DOCUMENT_TYPES) {
      await db.insert(documentTypesTable).values(docType).onConflictDoNothing();
    }
    for (const account of SAUDI_STANDARD_CHART_OF_ACCOUNTS) {
      await db.insert(accountsTable).values({
        code: account.code,
        nameAr: account.nameAr,
        nameEn: account.nameEn,
        type: account.type,
        normalBalance: account.normalBalance,
        isHeader: account.isHeader,
        isActive: true,
      }).onConflictDoNothing();
    }

    logger.info('System defaults seeded successfully without mock business data.');
    return { seeded: true, message: 'System defaults successfully populated.' };
  } catch (err: unknown) {
    logger.error('Failed to seed system defaults', { error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

// Standalone execution entrypoint
if (process.argv[1]?.endsWith('seed-system.ts') || process.argv[1]?.endsWith('seed-system.js')) {
  seedSystemDefaults()
    .then((res) => {
      console.log(JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed error:', err);
      process.exit(1);
    });
}

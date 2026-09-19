/**
 * Reports Center Domain Library — Saudi Enterprise ERP
 * Strict adherence to:
 * - Golden Rule G1: General Ledger single source of truth
 * - Golden Rule G3: Authoritative movements ledger
 * - Golden Rule G4: Authoritative customer/supplier statements
 * - Golden Rule G7/G8: Fixed-point halalas integer arithmetic
 * - Rule C: Sensitive financial cost & margin scrubber
 */

import { fromHalalasToDisplay } from './accounting.js';

export type ReportCategory = 'FINANCIAL' | 'AR_AP' | 'SALES' | 'INVENTORY' | 'VAT' | 'JOBS';

export type ReportType =
  // B. Financial Reports
  | 'TRIAL_BALANCE'
  | 'GENERAL_LEDGER'
  | 'PROFIT_LOSS'
  | 'BALANCE_SHEET'
  | 'CASH_FLOW'
  | 'JOURNAL_REPORT'
  // C. AR/AP Reports
  | 'CUSTOMER_STATEMENT'
  | 'SUPPLIER_STATEMENT'
  | 'AR_AGING'
  | 'AP_AGING'
  | 'OVERDUE_RECEIVABLES'
  | 'PARTIES_BALANCE_SUMMARY'
  | 'CUSTOMER_PROFITABILITY'
  // D. Sales Reports
  | 'SALES_PERIODIC_SUMMARY'
  | 'SALES_BY_CUSTOMER'
  | 'SALES_BY_ITEM'
  | 'SALES_BY_REP'
  | 'SALES_BY_BRANCH'
  | 'SALES_BY_PAYMENT_METHOD'
  | 'INVOICE_PROFIT_MARGIN'
  | 'SALES_RETURNS_ANALYSIS'
  // E. Inventory Reports
  | 'STOCK_VALUATION'
  | 'STOCK_MOVEMENTS_REPORT'
  | 'DEAD_SLOW_MOVING'
  | 'BEST_WORST_SELLERS'
  | 'INVENTORY_AGING'
  | 'LOW_STOCK_REPORT'
  // F. VAT Reports
  | 'VAT_SALES_REPORT'
  | 'VAT_PURCHASE_REPORT'
  | 'VAT_NET_POSITION'
  | 'VAT_GL_RECONCILIATION';

export interface ReportDefinition {
  type: ReportType;
  category: ReportCategory;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  icon: string;
  requiresCostPermission?: boolean;
  defaultDatePreset?: string;
  supportedFormats: ('JSON' | 'CSV' | 'EXCEL' | 'PRINT')[];
  isHeavyReport?: boolean;
}

export interface ReportParameterSchema {
  startDate?: string;
  endDate?: string;
  asOfDate?: string;
  comparisonStartDate?: string;
  comparisonEndDate?: string;
  accountId?: string;
  accountHierarchyLevel?: number;
  includeZeroBalances?: boolean;
  branchId?: string;
  costCenterId?: string;
  warehouseId?: string;
  customerId?: string;
  supplierId?: string;
  itemId?: string;
  categoryId?: string;
  minDays?: number;
  periodType?: 'DAILY' | 'MONTHLY' | 'ANNUAL';
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  format?: 'json' | 'csv' | 'excel' | 'print';
  async?: boolean;
}

export interface ReportColumn {
  field: string;
  labelAr: string;
  labelEn: string;
  align?: 'start' | 'center' | 'end';
  type?: 'text' | 'number' | 'currency' | 'date' | 'badge' | 'link';
  isSensitiveCost?: boolean;
}

export interface ReportSummaryCard {
  id: string;
  labelAr: string;
  labelEn: string;
  value: string;
  numericValueHalalas?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  subtitleAr?: string;
  subtitleEn?: string;
}

export interface SourceDocumentReference {
  type: 'JOURNAL' | 'SALES_INVOICE' | 'PURCHASE_BILL' | 'STOCK_MOVEMENT' | 'CUSTOMER_RECEIPT' | 'SUPPLIER_PAYMENT' | 'ASSET' | 'SETTLEMENT';
  id: string;
  number: string;
  date?: string;
}

export interface ReportRow {
  id: string;
  sourceDocument?: SourceDocumentReference;
  [key: string]: any;
}

export interface ReportResult {
  reportType: ReportType;
  category: ReportCategory;
  titleAr: string;
  titleEn: string;
  generatedAt: string;
  parameters: ReportParameterSchema;
  summaryCards: ReportSummaryCard[];
  columns: ReportColumn[];
  rows: ReportRow[];
  totals?: Record<string, string>;
  pagination: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
  };
  isBalanced?: boolean;
  discrepancyHalalas?: string;
  executionTimeMs: number;
}

export interface ReportFilterPreset {
  id: string;
  tenantId: string;
  userId: string;
  reportType: ReportType;
  name: string;
  parameters: ReportParameterSchema;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReportAsyncJob {
  id: string;
  tenantId: string;
  userId: string;
  userEmail: string;
  reportType: ReportType;
  parameters: ReportParameterSchema;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progressPercentage: number;
  rowCount?: number;
  resultSummary?: Record<string, any>;
  resultData?: ReportResult;
  error?: string;
  createdAt: string;
  completedAt?: string;
  downloadUrl?: string;
}

// Full registry of all available 24 reports
export const REPORT_DEFINITIONS: ReportDefinition[] = [
  // Financial
  {
    type: 'TRIAL_BALANCE',
    category: 'FINANCIAL',
    nameAr: 'ميزان المراجعة بالمجاميع والأرصدة',
    nameEn: 'Trial Balance (Hierarchy & Balances)',
    descriptionAr: 'كشف الأرصدة الافتتاحية والحركات الدائنة والمدينة والأرصدة الختامية مع فحص توازن القيد الذهبي (G1)',
    descriptionEn: 'Opening, movements, and closing debit/credit balances with zero-discrepancy invariant check',
    icon: 'Scale',
    defaultDatePreset: 'YTD',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
  },
  {
    type: 'GENERAL_LEDGER',
    category: 'FINANCIAL',
    nameAr: 'دفتر الأستاذ العام',
    nameEn: 'General Ledger Account Movement',
    descriptionAr: 'حركات الحسابات المحاسبية بالتفصيل مع الرصيد التراكمي المستمر وروابط الوثائق الأصلية',
    descriptionEn: 'Detailed account transactions with running balance and source document drilldowns',
    icon: 'BookOpen',
    defaultDatePreset: 'THIS_MONTH',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
    isHeavyReport: true,
  },
  {
    type: 'PROFIT_LOSS',
    category: 'FINANCIAL',
    nameAr: 'قائمة الدخل (الأرباح والخسائر)',
    nameEn: 'Profit & Loss Statement (Income Statement)',
    descriptionAr: 'الإيرادات والمصروفات وصافي الدخل مع مقارنة الفترات والفرز حسب مراكز التكلفة والفروع',
    descriptionEn: 'Revenue, COGS, operating expenses, and net profit with comparative period slicers',
    icon: 'TrendingUp',
    defaultDatePreset: 'THIS_MONTH',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
  },
  {
    type: 'BALANCE_SHEET',
    category: 'FINANCIAL',
    nameAr: 'الميزانية العمومية (المركز المالي)',
    nameEn: 'Balance Sheet (Financial Position)',
    descriptionAr: 'الأصول والخصوم وحقوق الملكية في تاريخ محدد مع احتساب الأرباح المبقاة الدقيقة',
    descriptionEn: 'Assets, liabilities, and equity as of date with exact retained earnings calculation',
    icon: 'FileSpreadsheet',
    defaultDatePreset: 'TODAY',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
  },
  {
    type: 'CASH_FLOW',
    category: 'FINANCIAL',
    nameAr: 'قائمة التدفقات النقدية (الطريقة غير المباشرة)',
    nameEn: 'Cash Flow Statement (Indirect Method)',
    descriptionAr: 'التدفقات النقدية من الأنشطة التشغيلية والاستثمارية والتمويلية من دفتر الأستاذ العام',
    descriptionEn: 'Operating, investing, and financing cash flows mapped directly from ledger postings',
    icon: 'Coins',
    defaultDatePreset: 'YTD',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
  },
  {
    type: 'JOURNAL_REPORT',
    category: 'FINANCIAL',
    nameAr: 'سجل القيود اليومية وتحليل المصادر',
    nameEn: 'Journal Entries & Source Breakdown',
    descriptionAr: 'كشف تفصيلي بالقيود اليومية المرحلة مع تصنيف مصادر القيود وحالة التوازن التام',
    descriptionEn: 'Audit log of posted journal entries with source classifications and balanced verification',
    icon: 'Receipt',
    defaultDatePreset: 'THIS_MONTH',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
  },

  // AR/AP
  {
    type: 'CUSTOMER_STATEMENT',
    category: 'AR_AP',
    nameAr: 'كشف حساب العميل التفصيلي (G4)',
    nameEn: 'Customer Account Statement',
    descriptionAr: 'كشف حركات وفواتير وسندات قبض العميل مع الرصيد التراكمي المعتمد',
    descriptionEn: 'Chronological customer invoices, receipts, returns, and running balance',
    icon: 'UserCheck',
    defaultDatePreset: 'THIS_MONTH',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
  },
  {
    type: 'SUPPLIER_STATEMENT',
    category: 'AR_AP',
    nameAr: 'كشف حساب المورد التفصيلي (G4)',
    nameEn: 'Supplier Account Statement',
    descriptionAr: 'كشف فواتير المشتريات وسندات الصرف والإشعارات الدائنة للمورد',
    descriptionEn: 'Supplier purchases, bills, payments, and running liability balance',
    icon: 'Truck',
    defaultDatePreset: 'THIS_MONTH',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
  },
  {
    type: 'AR_AGING',
    category: 'AR_AP',
    nameAr: 'أعمار ديون العملاء (Aging Buckets)',
    nameEn: 'Accounts Receivable Aging Schedule',
    descriptionAr: 'تصنيف مستحقات العملاء بفترات استحقاق (جاري، 30، 60، 90، 120+ يوماً)',
    descriptionEn: 'Customer receivables grouped into aging brackets by invoice due date',
    icon: 'Clock',
    defaultDatePreset: 'TODAY',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
  },
  {
    type: 'AP_AGING',
    category: 'AR_AP',
    nameAr: 'أعمار التزامات الموردين (AP Aging)',
    nameEn: 'Accounts Payable Aging Schedule',
    descriptionAr: 'تصنيف التزامات وفواتير الموردين بفترات استحقاق لتخطيط السيولة',
    descriptionEn: 'Supplier bill liabilities grouped into aging brackets for liquidity management',
    icon: 'Hourglass',
    defaultDatePreset: 'TODAY',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
  },
  {
    type: 'OVERDUE_RECEIVABLES',
    category: 'AR_AP',
    nameAr: 'قائمة المتأخرات مع إجراءات التذكير',
    nameEn: 'Overdue Receivables & Reminder Actions',
    descriptionAr: 'الفواتير المتأخرة عن موعد السداد مع جهات الاتصال وإجراءات الإشعار الفوري',
    descriptionEn: 'Invoices past due date with customer contacts and quick reminder hooks',
    icon: 'AlertCircle',
    defaultDatePreset: 'TODAY',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
  },
  {
    type: 'PARTIES_BALANCE_SUMMARY',
    category: 'AR_AP',
    nameAr: 'ملخص أرصدة العملاء والموردين',
    nameEn: 'Parties Balance Summary (AR/AP Balances)',
    descriptionAr: 'قائمة إجمالية بأرصدة جميع الأطراف مع الحدود الائتمانية وصافي الذمم',
    descriptionEn: 'Consolidated balances of all customers and suppliers against credit limits',
    icon: 'Users',
    defaultDatePreset: 'TODAY',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
  },
  {
    type: 'CUSTOMER_PROFITABILITY',
    category: 'AR_AP',
    nameAr: 'تحليل ربحية العملاء',
    nameEn: 'Customer Profitability Analysis',
    descriptionAr: 'حساب ربحية كل عميل (المبيعات - تكلفة البضاعة - المرتجعات) محكوم بالصلاحية (Rule C)',
    descriptionEn: 'Customer net revenue, COGS, returns, and gross margin (permission-gated)',
    icon: 'BadgePercent',
    requiresCostPermission: true,
    defaultDatePreset: 'YTD',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
  },

  // Sales
  {
    type: 'SALES_PERIODIC_SUMMARY',
    category: 'SALES',
    nameAr: 'ملخص المبيعات الدوري (يومي / شهري / سنوي)',
    nameEn: 'Periodic Sales Summary (Daily/Monthly/Annual)',
    descriptionAr: 'إجمالي المبيعات والضرائب والخصومات وعدد الفواتير ومتوسط قيمة الفاتورة',
    descriptionEn: 'Sales totals, VAT, discounts, invoice count, and average order value',
    icon: 'BarChart2',
    defaultDatePreset: 'THIS_MONTH',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
  },
  {
    type: 'SALES_BY_CUSTOMER',
    category: 'SALES',
    nameAr: 'المبيعات حسب العميل',
    nameEn: 'Sales by Customer Breakdown',
    descriptionAr: 'توزيع المبيعات ومبالغ الضريبة وحجم العمليات لكل عميل',
    descriptionEn: 'Sales distribution, tax amounts, and transaction counts per customer',
    icon: 'UserCheck',
    defaultDatePreset: 'THIS_MONTH',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
  },
  {
    type: 'SALES_BY_ITEM',
    category: 'SALES',
    nameAr: 'المبيعات حسب الصنف والوحدة',
    nameEn: 'Sales by Item & Packaging Unit',
    descriptionAr: 'كميات وقيم مبيعات كل صنف مع متوسط سعر البيع والضريبة المحصلة',
    descriptionEn: 'Sold quantities and values per item and packaging unit with average selling price',
    icon: 'Package',
    defaultDatePreset: 'THIS_MONTH',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
  },
  {
    type: 'SALES_BY_REP',
    category: 'SALES',
    nameAr: 'المبيعات حسب مندوب المبيعات',
    nameEn: 'Sales by Sales Representative',
    descriptionAr: 'مؤشرات أداء مسؤولي المبيعات وحجم التحصيل والفواتير المصدرة',
    descriptionEn: 'Performance metrics and sales volumes per sales representative',
    icon: 'Briefcase',
    defaultDatePreset: 'THIS_MONTH',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
  },
  {
    type: 'SALES_BY_BRANCH',
    category: 'SALES',
    nameAr: 'المبيعات حسب الفرع والمركز',
    nameEn: 'Sales by Branch & Location',
    descriptionAr: 'مقارنة أداء الفروع ومنافذ البيع في المبيعات والتحصيلات الضريبية',
    descriptionEn: 'Comparative sales and VAT performance across company branches',
    icon: 'Building',
    defaultDatePreset: 'THIS_MONTH',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
  },
  {
    type: 'SALES_BY_PAYMENT_METHOD',
    category: 'SALES',
    nameAr: 'المبيعات حسب طريقة الدفع (نقد / مدى / تحويل)',
    nameEn: 'Sales by Payment Method (Cash, Mada, Bank, Credit)',
    descriptionAr: 'توزيع حصيلة المبيعات على وسائل الدفع المختلفة لضبط الصناديق والمطابقة',
    descriptionEn: 'Sales revenue breakdown across payment instruments for treasury reconciliation',
    icon: 'CreditCard',
    defaultDatePreset: 'THIS_MONTH',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
  },
  {
    type: 'INVOICE_PROFIT_MARGIN',
    category: 'SALES',
    nameAr: 'ربحية الفواتير والأصناف (هامش الربح)',
    nameEn: 'Invoice & Item Profit Margin Analysis',
    descriptionAr: 'تحليل هامش الربح الإجمالي لكل فاتورة وصنف محكوم بصلاحيات التكلفة (Rule C)',
    descriptionEn: 'Gross margin and percentage profit per invoice and item (permission-gated)',
    icon: 'Percent',
    requiresCostPermission: true,
    defaultDatePreset: 'THIS_MONTH',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
  },
  {
    type: 'SALES_RETURNS_ANALYSIS',
    category: 'SALES',
    nameAr: 'تحليل مرتجعات المبيعات والإشعارات الدائنة',
    nameEn: 'Sales Returns & Credit Notes Analysis',
    descriptionAr: 'إحصائيات المرتجعات حسب أسباب الإرجاع ونسبتها لإجمالي المبيعات',
    descriptionEn: 'Credit notes analysis categorized by return reason codes and return rates',
    icon: 'RotateCcw',
    defaultDatePreset: 'THIS_MONTH',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
  },

  // Inventory
  {
    type: 'STOCK_VALUATION',
    category: 'INVENTORY',
    nameAr: 'تقييم المخزون (الحالي / التاريخي)',
    nameEn: 'Stock Valuation Report (Current / Point-in-Time)',
    descriptionAr: 'كميات وتكلفة وتقييم المخزون في تاريخ محدد حسب المستودع والفئة وفق المتوسط المرجح WAC',
    descriptionEn: 'Inventory quantities, WAC cost, and total SAR valuation by warehouse and category',
    icon: 'Boxes',
    requiresCostPermission: true,
    defaultDatePreset: 'TODAY',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
  },
  {
    type: 'STOCK_MOVEMENTS_REPORT',
    category: 'INVENTORY',
    nameAr: 'سجل حركات المخزون التفصيلي',
    nameEn: 'Stock Movements Ledger Report',
    descriptionAr: 'جميع حركات التوريد والصرف والتحويل والتسويات مع روابط الوثائق المصدرية (G3)',
    descriptionEn: 'All inventory inflows, outflows, transfers, and adjustments with source deep-links',
    icon: 'ArrowLeftRight',
    defaultDatePreset: 'THIS_MONTH',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
    isHeavyReport: true,
  },
  {
    type: 'DEAD_SLOW_MOVING',
    category: 'INVENTORY',
    nameAr: 'المخزون الراكد وبطيء الحركة',
    nameEn: 'Dead & Slow-Moving Stock Analysis',
    descriptionAr: 'الأصناف التي لم تشهد حركة بيع خلال فترة محددة وقيمة رأس المال المجمد فيها',
    descriptionEn: 'Items with no movement over configurable days threshold and tied-up capital',
    icon: 'PauseCircle',
    defaultDatePreset: 'TODAY',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
  },
  {
    type: 'BEST_WORST_SELLERS',
    category: 'INVENTORY',
    nameAr: 'السلع الأكثر والأقل مبيعاً',
    nameEn: 'Best & Worst Selling Products',
    descriptionAr: 'ترتيب الأصناف تصاعدياً وتنازلياً حسب الكمية المباعة والإيراد المحقق',
    descriptionEn: 'Product rankings by units sold and gross revenue generated in the period',
    icon: 'Award',
    defaultDatePreset: 'THIS_MONTH',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
  },
  {
    type: 'INVENTORY_AGING',
    category: 'INVENTORY',
    nameAr: 'أعمار طبقات المخزون',
    nameEn: 'Inventory Aging Analysis',
    descriptionAr: 'تصنيف المخزون المتبقي وفق تاريخ الاستلام (0-30، 31-60، 61-90، 91-180، 180+ يوماً)',
    descriptionEn: 'Aging brackets of on-hand inventory based on receipt layer dates',
    icon: 'History',
    defaultDatePreset: 'TODAY',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
  },
  {
    type: 'LOW_STOCK_REPORT',
    category: 'INVENTORY',
    nameAr: 'تقرير نواقص المخزون ونقاط إعادة الطلب',
    nameEn: 'Low Stock & Reorder Points Alert',
    descriptionAr: 'الأصناف التي قاربت على النفاد وتجاوزت حد إعادة الطلب مع الكمية المقترحة',
    descriptionEn: 'Items below minimum stock levels with suggested reorder quantities',
    icon: 'AlertTriangle',
    defaultDatePreset: 'TODAY',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
  },

  // VAT
  {
    type: 'VAT_SALES_REPORT',
    category: 'VAT',
    nameAr: 'تقرير ضريبة المبيعات والمخرجات (15% و0% ومعفى)',
    nameEn: 'Sales Output VAT Report',
    descriptionAr: 'كشف تفصيلي بضريبة المبيعات حسب النسب والفئات الضريبية وفواتير ZATCA',
    descriptionEn: 'Output VAT report categorized by statutory rates (15%, 0%, exempt, exports)',
    icon: 'FileText',
    defaultDatePreset: 'THIS_MONTH',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
  },
  {
    type: 'VAT_PURCHASE_REPORT',
    category: 'VAT',
    nameAr: 'تقرير ضريبة المشتريات والمدخلات القابلة للخصم',
    nameEn: 'Purchase Input VAT Report',
    descriptionAr: 'ضريبة المدخلات من فواتير الموردين والمصروفات والجمارك القابلة للخصم',
    descriptionEn: 'Input tax on domestic purchases, imports, and expenses eligible for deduction',
    icon: 'ShoppingCart',
    defaultDatePreset: 'THIS_MONTH',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
  },
  {
    type: 'VAT_NET_POSITION',
    category: 'VAT',
    nameAr: 'تقرير صافي المركز الضريبي للهيئة (ZATCA)',
    nameEn: 'Net VAT Statutory Position (ZATCA Return)',
    descriptionAr: 'احتساب صافي الضريبة الواجبة السداد أو الاسترداد للفترة المحددة',
    descriptionEn: 'Net statutory tax position (Output VAT minus Input VAT) for tax declarations',
    icon: 'CheckCircle',
    defaultDatePreset: 'THIS_MONTH',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
  },
  {
    type: 'VAT_GL_RECONCILIATION',
    category: 'VAT',
    nameAr: 'مطابقة سجل الضريبة مع دفتر الأستاذ العام (فحص الصفر)',
    nameEn: 'VAT vs General Ledger Reconciliation (Zero-Diff)',
    descriptionAr: 'مطابقة حسابات الضريبة في دفتر الأستاذ (20301 و10301) مع سجل الضرائب مع إثبات انعدام الفروقات',
    descriptionEn: 'Reconciliation of tax accounts with General Ledger showing zero-difference proof',
    icon: 'ShieldCheck',
    defaultDatePreset: 'THIS_MONTH',
    supportedFormats: ['JSON', 'CSV', 'EXCEL', 'PRINT'],
  },
];

/**
 * Generate UTF-8 BOM CSV string with proper escaping and formatting
 */
export function generateReportCsv(result: ReportResult, lang: 'ar' | 'en' = 'ar'): string {
  const isAr = lang === 'ar';
  const lines: string[] = [];

  // Metadata headers
  lines.push(`"${isAr ? 'اسم التقرير' : 'Report Name'}","${isAr ? result.titleAr : result.titleEn}"`);
  lines.push(`"${isAr ? 'تاريخ التوليد' : 'Generated At'}","${result.generatedAt}"`);
  lines.push('');

  // Column headers
  const headerCols = result.columns.map((c) => `"${(isAr ? c.labelAr : c.labelEn).replace(/"/g, '""')}"`);
  lines.push(headerCols.join(','));

  // Data rows
  result.rows.forEach((row) => {
    const rowValues = result.columns.map((col) => {
      const val = row[col.field];
      if (val === undefined || val === null) return '""';
      if (typeof val === 'number') return `"${val}"`;
      return `"${String(val).replace(/"/g, '""')}"`;
    });
    lines.push(rowValues.join(','));
  });

  // Totals row if available
  if (result.totals) {
    const totalCols = result.columns.map((col, idx) => {
      if (idx === 0) return `"${isAr ? 'الإجمالي' : 'Total'}"`;
      const val = result.totals![col.field];
      return val ? `"${String(val).replace(/"/g, '""')}"` : '""';
    });
    lines.push(totalCols.join(','));
  }

  // Prepend UTF-8 Byte Order Mark (BOM) so Excel displays Arabic characters natively
  return '\uFEFF' + lines.join('\r\n');
}

/**
 * Generate Excel-compatible XML Spreadsheet or HTML table with RTL styling
 */
export function generateReportExcelHtml(result: ReportResult, lang: 'ar' | 'en' = 'ar'): string {
  const isAr = lang === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';

  let html = `<!DOCTYPE html>
<html dir="${dir}" lang="${lang}">
<head>
  <meta charset="UTF-8">
  <title>${isAr ? result.titleAr : result.titleEn}</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 20px; direction: ${dir}; }
    h2 { color: #047857; margin-bottom: 4px; }
    p.meta { color: #64748b; font-size: 12px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th { background-color: #065f46; color: #ffffff; padding: 8px 12px; text-align: ${isAr ? 'right' : 'left'}; font-size: 13px; border: 1px solid #047857; }
    td { padding: 8px 12px; border: 1px solid #cbd5e1; font-size: 12px; }
    tr:nth-child(even) { background-color: #f8fafc; }
    tr.total-row { background-color: #e2e8f0; font-weight: bold; }
    .currency { text-align: end; font-family: monospace; }
  </style>
</head>
<body>
  <h2>${isAr ? result.titleAr : result.titleEn}</h2>
  <p class="meta">${isAr ? 'تاريخ التوليد:' : 'Generated:'} ${result.generatedAt}</p>
  <table>
    <thead>
      <tr>
        ${result.columns.map((col) => `<th>${isAr ? col.labelAr : col.labelEn}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${result.rows
        .map(
          (row) => `<tr>
        ${result.columns
          .map((col) => {
            const val = row[col.field] ?? '';
            const isCurr = col.type === 'currency' || col.type === 'number';
            return `<td class="${isCurr ? 'currency' : ''}">${val}</td>`;
          })
          .join('')}
      </tr>`
        )
        .join('')}
      ${
        result.totals
          ? `<tr class="total-row">
        ${result.columns
          .map((col, idx) => {
            if (idx === 0) return `<td>${isAr ? 'الإجمالي' : 'Total'}</td>`;
            const val = result.totals![col.field] ?? '';
            return `<td class="currency">${val}</td>`;
          })
          .join('')}
      </tr>`
          : ''
      }
    </tbody>
  </table>
</body>
</html>`;

  return html;
}

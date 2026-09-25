import crypto from 'crypto';
import { logger } from './logger.js';
import { env } from './env.js';
import { hashPassword } from './security.js';
import { SAUDI_STANDARD_CHART_OF_ACCOUNTS, SYSTEM_DEFAULT_DOCUMENT_TYPES } from '../db/seed-system.js';
import { toHalalas, fromHalalasToDisplay } from '../../src/lib/accounting.js';
import {
  seedDefaultParties,
  getCustomersService,
  getCustomerByIdService,
  createCustomerService,
  updateCustomerService,
  setCustomerStatusService,
  getSuppliersService,
  getSupplierByIdService,
  createSupplierService,
  updateSupplierService,
  setSupplierStatusService,
  checkSupplierCanPurchaseService,
  executePartyImportService,
  rollbackPartyImportService,
  exportPartiesService,
} from '../modules/parties/partyService.js';
import {
  seedDefaultSales,
  getSalesInvoicesService,
  getSalesInvoiceByIdService,
  createSalesInvoiceService,
  postSalesInvoiceService,
  updateSalesInvoiceStatusService,
  cancelSalesInvoiceService,
  getSalesOrdersService,
  getSalesOrderByIdService,
  createSalesOrderService,
  updateSalesOrderStatusService,
  convertSalesOrderToInvoiceService,
  getSalesQuotationsService,
  getSalesQuotationByIdService,
  createSalesQuotationService,
  updateSalesQuotationStatusService,
  convertQuotationToOrderService,
  convertQuotationToInvoiceService,
  getCustomerPriceAgreementsService,
  getCustomerPriceAgreementByIdService,
  createCustomerPriceAgreementService,
  updateCustomerPriceAgreementService,
  deleteCustomerPriceAgreementService,
  getSalesCreditNotesService,
  getSalesCreditNoteByIdService,
  createSalesCreditNoteService,
  getCustomerReceiptsService,
  getCustomerReceiptByIdService,
  createCustomerReceiptService,
  reallocateCustomerReceiptService,
  getCustomerStatementService,
  getCustomerAgingService,
  copySalesDocumentService,
} from '../modules/sales/salesService.js';
import {
  SalesInvoice,
  SalesQuotation,
  SalesOrder,
  SalesCreditNote,
  CustomerReceipt,
  CustomerStatement,
  CustomerPriceAgreement,
} from '../../src/lib/sales.js';
import {
  StockMovement,
  StockTransfer,
  StockAdjustment,
  Stocktake,
  LandedCostDocument,
} from '../../src/lib/inventory.js';
import {
  PurchaseRequest,
  PurchaseOrder,
  GoodsReceiptNote,
  PurchaseBill,
  VendorDebitNote,
  SupplierPayment,
  SupplierPriceRecord as PurchasingPriceRecord,
} from '../../src/lib/purchasing.js';
import {
  seedDefaultPurchasing,
  getPurchaseRequestsService,
  getPurchaseRequestByIdService,
  createPurchaseRequestService,
  submitPurchaseRequestService,
  approvePurchaseRequestService,
  rejectPurchaseRequestService,
  convertPRToPOService,
  getPurchaseOrdersService,
  getPurchaseOrderByIdService,
  createPurchaseOrderService,
  confirmPurchaseOrderService,
  cancelPurchaseOrderService,
  getGoodsReceiptNotesService,
  getGoodsReceiptNoteByIdService,
  createGoodsReceiptNoteService,
  allocateLandedCostService,
  getThreeWayMatchingReportService,
  overrideThreeWayMatchService,
  getPurchaseBillsService,
  getPurchaseBillByIdService,
  createPurchaseBillService,
  postPurchaseBillService,
  getVendorDebitNotesService,
  getVendorDebitNoteByIdService,
  createVendorDebitNoteService,
  getSupplierPaymentsService,
  getSupplierPaymentByIdService,
  createSupplierPaymentService,
  reallocateSupplierPaymentService,
  getSupplierStatementService,
  getSupplierAgingService,
  getSupplierPriceHistoryService,
  getLastPurchasePriceService,
} from '../modules/purchasing/purchasingService.js';
import {
  recordStockMovementService,
  getStockMovementsService,
  createOpeningStockBatchService,
  createStockTransferService,
  getStockTransfersService,
  createStockAdjustmentService,
  getStockAdjustmentsService,
  createStocktakeService,
  enterStocktakeCountsService,
  approveStocktakeService,
  getStocktakesService,
  createLandedCostDocumentService,
  getLandedCostDocumentsService,
  getStockAsOfDateService,
  getLowStockAlertsService,
  seedDefaultInventoryMovements,
} from '../modules/inventory/inventoryService.js';
import {
  seedDefaultTreasury,
  getTreasuryAccountsService,
  getTreasuryAccountByIdService,
  createTreasuryAccountService,
  updateTreasuryAccountService,
  setTreasuryAccountStatusService,
  getTreasuryReceiptsService,
  getTreasuryReceiptByIdService,
  createTreasuryReceiptService,
  getTreasuryPaymentsService,
  getTreasuryPaymentByIdService,
  createTreasuryPaymentService,
  getTreasuryTransfersService,
  getTreasuryTransferByIdService,
  createTreasuryTransferService,
  getPettyCashSettlementsService,
  getPettyCashSettlementByIdService,
  createPettyCashSettlementService,
  getBankStatementsService,
  uploadBankStatementService,
  getBankReconciliationsService,
  createBankReconciliationService,
  getChequesService,
  clearChequeService,
  bounceChequeService,
  getTreasuryOverviewMetricsService,
} from '../modules/treasury/treasuryService.js';
import {
  Customer,
  Supplier,
  PartyAttachment,
  PartyContract,
  SupplierPriceRecord,
  PartyDetailSummary,
  CreditEvaluationResult,
  BatchImportReport,
  PartyLedgerStatementLine,
  evaluateCustomerCredit,
} from '../../src/lib/parties.js';

// ==========================================
// 1. TENANT CONTEXT & PERMISSIONS DEFINITION
// ==========================================
export interface TenantContext {
  tenantId: string;
  userId: string;
  userEmail: string;
  role: string;
  roleCode?: string;
  permissions: string[];
  branchId?: string;
  isPlatformSuperAdmin?: boolean;
  correlationId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export class TenantIsolationViolationError extends Error {
  public statusCode = 403;
  constructor(message: string, public attemptedTenantId?: string, public currentTenantId?: string) {
    super(message);
    this.name = 'TenantIsolationViolationError';
  }
}

export class PermissionDeniedError extends Error {
  public statusCode = 403;
  constructor(public requiredPermission: string) {
    super(`Permission denied. Action requires privilege: ${requiredPermission}`);
    this.name = 'PermissionDeniedError';
  }
}

export class NotFoundError extends Error {
  public statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  public statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends Error {
  public statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// ==========================================
// 2. STANDARD ROLES & PERMISSION MATRIX
// ==========================================
export const ALL_SYSTEM_PERMISSIONS = [
  // Accounting
  'accounting:account:view',
  'accounting:account:manage',
  'accounting:journal:view',
  'accounting:journal:create',
  'accounting:journal:edit',
  'accounting:journal:post',
  'accounting:journal:reverse',
  'accounting:journal:post_closed_override',
  'accounting:period:close',
  'accounting:period:reopen',
  'accounting:cost:view', // Sensitive: cost & margin visibility
  // Sales
  'sales:invoice:view',
  'sales:invoice:create',
  'sales:invoice:edit',
  'sales:invoice:post',
  'sales:invoice:print',
  'sales:invoice:export',
  'sales:customer:view',
  'sales:customer:manage',
  // Purchasing
  'purchasing:order:view',
  'purchasing:order:create',
  'purchasing:bill:view',
  'purchasing:bill:create',
  'purchasing:bill:post',
  'purchasing:payment:view',
  'purchasing:payment:create',
  'purchasing:supplier:view',
  'purchasing:supplier:manage',
  'purchasing:supplier:override_suspended',
  // Inventory
  'inventory:item:view',
  'inventory:item:manage',
  'inventory:unit:manage',
  'inventory:stock:view',
  'inventory:movement:view',
  'inventory:movement:create',
  'inventory:opening_stock:manage',
  'inventory:transfer:create',
  'inventory:transfer:approve',
  'inventory:adjustment:create',
  'inventory:adjustment:approve',
  'inventory:stocktake:create',
  'inventory:stocktake:count',
  'inventory:stocktake:approve',
  'inventory:landed_cost:create',
  'inventory:negative_stock:override',
  'inventory:warehouse:manage',
  // Pricing Foundation
  'pricing:rule:view',
  'pricing:rule:manage',
  'pricing:override:apply',
  // Treasury
  'treasury:vault:view',
  'treasury:vault:manage',
  'treasury:bank:view',
  'treasury:bank:manage',
  'treasury:payment:create',
  'treasury:receipt:create',
  // Settings & Tenant Management
  'settings:company:view',
  'settings:company:manage',
  'settings:users:view',
  'settings:users:manage',
  'settings:roles:manage',
  'settings:zatca:manage',
  'settings:zatca:production_switch', // Sensitive
  'settings:backup:restore', // Sensitive
  // Reports & Audit
  'reports:financial:view',
  'reports:financial:export',
  'reports:audit:view',
] as const;

export type SystemPermission = (typeof ALL_SYSTEM_PERMISSIONS)[number];

export interface RoleDefinition {
  code: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  isSystem: boolean;
  permissions: string[];
}

export const SYSTEM_DEFAULT_ROLES: RoleDefinition[] = [
  {
    code: 'OWNER',
    nameAr: 'مالك المنشأة / المسؤول العام',
    nameEn: 'Owner / Company Admin',
    descriptionAr: 'صلاحيات كاملة وغير مقيدة على جميع وحدات وإعدادات المنشأة',
    descriptionEn: 'Full and unrestricted access to all modules and configurations',
    isSystem: true,
    permissions: [...ALL_SYSTEM_PERMISSIONS],
  },
  {
    code: 'CHIEF_ACCOUNTANT',
    nameAr: 'رئيس الحسابات / المدير المالي',
    nameEn: 'Chief Accountant / Financial Controller',
    descriptionAr: 'ترحيل القيود، إقفال الفترات، عرض التكاليف والتقارير المالية والضريبية',
    descriptionEn: 'Full GL posting, period closing, financial statements, cost/margin visibility',
    isSystem: true,
    permissions: [
      'accounting:account:view',
      'accounting:account:manage',
      'accounting:journal:view',
      'accounting:journal:create',
      'accounting:journal:edit',
      'accounting:journal:post',
      'accounting:journal:reverse',
      'accounting:journal:post_closed_override',
      'accounting:period:close',
      'accounting:period:reopen',
      'accounting:cost:view',
      'sales:invoice:view',
      'sales:invoice:print',
      'sales:invoice:export',
      'sales:customer:view',
      'purchasing:order:view',
      'purchasing:order:create',
      'purchasing:bill:view',
      'purchasing:bill:create',
      'purchasing:bill:post',
      'purchasing:payment:view',
      'purchasing:payment:create',
      'purchasing:supplier:view',
      'purchasing:supplier:manage',
      'inventory:item:view',
      'inventory:item:manage',
      'inventory:stock:view',
      'inventory:movement:view',
      'inventory:movement:create',
      'inventory:opening_stock:manage',
      'inventory:transfer:create',
      'inventory:transfer:approve',
      'inventory:adjustment:create',
      'inventory:adjustment:approve',
      'inventory:stocktake:create',
      'inventory:stocktake:count',
      'inventory:stocktake:approve',
      'inventory:landed_cost:create',
      'inventory:negative_stock:override',
      'inventory:warehouse:manage',
      'inventory:unit:manage',
      'pricing:rule:view',
      'pricing:rule:manage',
      'pricing:override:apply',
      'treasury:vault:view',
      'treasury:bank:view',
      'treasury:payment:create',
      'treasury:receipt:create',
      'settings:company:view',
      'reports:financial:view',
      'reports:financial:export',
      'reports:audit:view',
    ],
  },
  {
    code: 'ACCOUNTANT',
    nameAr: 'محاسب عام',
    nameEn: 'General Accountant',
    descriptionAr: 'إعداد مسودات القيود وفواتير المشتريات والمبيعات ومتابعة الذمم',
    descriptionEn: 'Journal drafting, AP/AR entries, bank reconciliation, and cost viewing',
    isSystem: true,
    permissions: [
      'accounting:account:view',
      'accounting:journal:view',
      'accounting:journal:create',
      'accounting:journal:edit',
      'accounting:cost:view',
      'sales:invoice:view',
      'sales:invoice:print',
      'sales:customer:view',
      'purchasing:bill:view',
      'purchasing:bill:create',
      'purchasing:supplier:view',
      'inventory:item:view',
      'inventory:stock:view',
      'inventory:unit:manage',
      'pricing:rule:view',
      'treasury:vault:view',
      'treasury:bank:view',
      'reports:financial:view',
    ],
  },
  {
    code: 'SALES_MGR',
    nameAr: 'مسؤول مبيعات',
    nameEn: 'Sales Manager',
    descriptionAr: 'إنشاء الفواتير وعروض الأسعار وإدارة العملاء (دون صلاحية الاطلاع على التكاليف والهوامش)',
    descriptionEn: 'Quotations, orders, standard invoice creation. Strictly NO cost/margin access.',
    isSystem: true,
    permissions: [
      'sales:invoice:view',
      'sales:invoice:create',
      'sales:invoice:edit',
      'sales:invoice:print',
      'sales:customer:view',
      'sales:customer:manage',
      'inventory:item:view',
      'inventory:stock:view',
      'pricing:rule:view',
      'pricing:rule:manage',
      'pricing:override:apply',
    ],
  },
  {
    code: 'PURCHASES_MGR',
    nameAr: 'مسؤول المشتريات',
    nameEn: 'Purchasing Manager',
    descriptionAr: 'إدارة الموردين وأوامر الشراء وفواتير الموردين والاطلاع على تكلفة البضائع',
    descriptionEn: 'Vendor management, purchase orders, vendor bills, cost viewing',
    isSystem: true,
    permissions: [
      'purchasing:bill:view',
      'purchasing:bill:create',
      'purchasing:bill:post',
      'purchasing:supplier:view',
      'purchasing:supplier:manage',
      'inventory:item:view',
      'inventory:stock:view',
      'accounting:cost:view',
    ],
  },
  {
    code: 'WAREHOUSE_KEEPER',
    nameAr: 'أمين مستودع',
    nameEn: 'Warehouse Keeper',
    descriptionAr: 'تسجيل حركات المخزون، التحويلات، الجرد، والتسويات',
    descriptionEn: 'Stock movements, transfers, cycle counts, adjustments',
    isSystem: true,
    permissions: [
      'inventory:item:view',
      'inventory:stock:view',
      'inventory:movement:view',
      'inventory:movement:create',
      'inventory:transfer:create',
      'inventory:adjustment:create',
      'inventory:stocktake:create',
      'inventory:stocktake:count',
    ],
  },
  {
    code: 'CASHIER',
    nameAr: 'كاشير / أمين صندوق',
    nameEn: 'Cashier / POS Operator',
    descriptionAr: 'إصدار الفواتير المبسطة وسندات القبض (محجوب عن التكاليف)',
    descriptionEn: 'Simplified B2C invoices and cash register shifts. Strictly NO cost/margin access.',
    isSystem: true,
    permissions: [
      'sales:invoice:view',
      'sales:invoice:create',
      'sales:invoice:print',
      'treasury:receipt:create',
      'inventory:item:view',
    ],
  },
  {
    code: 'AUDITOR',
    nameAr: 'مراجع خارجي / مشاهد',
    nameEn: 'Auditor / Read-Only',
    descriptionAr: 'اطلاع وقراءة على التقارير وقيود اليومية وسجلات التدقيق دون تعديل (محجوب عن التكاليف الحساسة افتراضياً)',
    descriptionEn: 'Read-only access to general ledger and audit trails.',
    isSystem: true,
    permissions: [
      'accounting:account:view',
      'accounting:journal:view',
      'sales:invoice:view',
      'sales:invoice:print',
      'sales:invoice:export',
      'purchasing:bill:view',
      'reports:financial:view',
      'reports:financial:export',
      'reports:audit:view',
    ],
  },
];

// ==========================================
// 3. SENSITIVE DATA SCRUBBER (COST & MARGIN)
// ==========================================
const SENSITIVE_FINANCIAL_FIELDS = new Set([
  'cost',
  'unitcost',
  'costprice',
  'costpricesar',
  'margin',
  'profit',
  'marginpercentage',
  'costcents',
  'purchasecost',
  'waccents',
  'totalcost',
  'currentwac',
  'standardcost',
  'totalvaluationsar',
  'totalvaluation',
  'valuation',
  'inventoryvaluation',
  'cogs',
  'linecogs',
]);

export function scrubSensitiveFinancialFields<T>(data: T, canViewCostMargin: boolean): T {
  if (canViewCostMargin) return data;
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map((item) => scrubSensitiveFinancialFields(item, canViewCostMargin)) as unknown as T;
  }

  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_FINANCIAL_FIELDS.has(lower)) {
      continue; // Strip field completely from server response
    }
    if (typeof value === 'object' && value !== null) {
      cleaned[key] = scrubSensitiveFinancialFields(value, canViewCostMargin);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned as T;
}

// ==========================================
// 4. IN-MEMORY DATA STORE TYPES
// ==========================================
export interface CompanyTenant {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  vatNumber: string;
  crNumber: string;
  unifiedNumber?: string;
  nationalAddress: string;
  phone?: string;
  email?: string;
  website?: string;
  logoUrl?: string;
  currency: string;
  timezone: string;
  language: string;
  fiscalYearStartMonth: number;
  accountingBasis: 'ACCRUAL' | 'CASH';
  vatPreference: 'EXCLUSIVE' | 'INCLUSIVE';
  vatRatePercentage: number;
  zatcaEnv: 'sandbox' | 'simulation' | 'production';
  zatcaStatus: 'NOT_CONFIGURED' | 'CONFIGURED' | 'ONBOARDED';
  isSuspended: boolean;
  onboardingCompleted: boolean;
  onboardingStep: number;
  createdAt: string;
  updatedAt: string;
}

export interface Branch {
  id: string;
  tenantId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  isMainBranch: boolean;
  address?: string;
  phone?: string;
  createdAt: string;
}

export interface WarehouseBin {
  id: string;
  code: string; // e.g. "A1-R01-S01"
  aisle?: string;
  rack?: string;
  shelf?: string;
}

export interface Warehouse {
  id: string;
  tenantId: string;
  branchId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  address?: string;
  managerName?: string;
  contactPhone?: string;
  isDefault: boolean;
  isActive: boolean;
  bins?: WarehouseBin[];
  createdAt: string;
}

export interface ItemCategory {
  id: string;
  tenantId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  parentId?: string | null;
  defaultTaxRate: number; // 15
  defaultSalesAccountId?: string;
  defaultCogsAccountId?: string;
  defaultInventoryAccountId?: string;
  isActive: boolean;
  createdAt: string;
}

export interface ItemBrand {
  id: string;
  tenantId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  countryOfOrigin?: string;
  isActive: boolean;
  createdAt: string;
}

export interface GlobalUnit {
  id: string;
  tenantId: string;
  code: string; // PCE, BOX, CTN, KG, GRM, LTR, MTR, PCK, DZN, PLT
  nameAr: string;
  nameEn: string;
  symbolAr: string;
  symbolEn: string;
  category: 'COUNT' | 'WEIGHT' | 'VOLUME' | 'LENGTH' | 'AREA' | 'OTHER';
  isSystem?: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface CustomerPriceRule {
  id: string;
  tenantId: string;
  customerId: string;
  customerNameAr?: string;
  itemId: string;
  itemSku?: string;
  itemNameAr?: string;
  unitId?: string;
  unitNameAr?: string;
  unitPrice: number;
  discountPercentage?: number;
  minQuantity?: number;
  startDate?: string;
  endDate?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PriceHistoryRecord {
  id: string;
  tenantId: string;
  itemId: string;
  unitId?: string;
  unitNameAr?: string;
  oldPrice: number;
  newPrice: number;
  changeType: 'DEFAULT_UNIT_PRICE' | 'CUSTOMER_PRICE' | 'MANUAL_OVERRIDE' | 'PROMOTION';
  reason?: string;
  userId: string;
  userEmail: string;
  changedBy?: string;
  timestamp: string;
}

export interface ItemUOM {
  id: string;
  unitCatalogId?: string;
  nameAr: string; // e.g. "حبة", "كرتون", "طبلية"
  nameEn: string; // e.g. "Piece", "Carton", "Pallet"
  symbol: string; // e.g. "حبة", "كرتون"
  conversionFactor: number; // Multiplier relative to base unit (Base Unit = 1.0)
  barcode: string; // Unique barcode bound to this (Item, Unit) tuple (Rule I4)
  aliasBarcodes?: string[]; // Multiple alias barcodes pointing to this unit
  isBaseUnit: boolean;
  salePrice: number;
  wholesalePrice?: number;
  minimumSalePrice?: number;
  cost?: number;
}

export interface Item {
  id: string;
  tenantId: string;
  sku: string; // Unique within tenant
  primaryBarcode: string;
  barcodeAliases?: string[]; // Multiple alias barcodes pointing to this item (base unit)
  nameAr: string;
  nameEn: string;
  descriptionAr?: string;
  descriptionEn?: string;
  type: 'INVENTORY' | 'SERVICE' | 'RAW_MATERIAL' | 'CONSUMABLE' | 'FIXED_ASSET';
  categoryId?: string;
  categoryNameAr?: string;
  brandId?: string;
  brandName?: string;
  baseUnit: string; // e.g. 'حبة' or 'كيلوجرام'
  units: ItemUOM[]; // Includes base unit and secondary units (Rule I3)
  taxRate: number; // 15 (Standard), 0 (Zero-Rated), or -1 (Exempt)
  taxCategory?: 'STANDARD' | 'ZERO_RATED' | 'EXEMPT' | 'OUT_OF_SCOPE';
  taxExemptionReasonCode?: string;
  isVatInclusive: boolean;
  sellingPrice: number; // Base unit retail sale price in SAR
  wholesalePrice?: number;
  cost: number; // Standard/Purchase cost in SAR
  currentWac: number; // Weighted Average Cost per base unit in SAR (Rule I2)
  trackBatches: boolean;
  trackSerialNumbers: boolean;
  trackExpiry: boolean;
  minStockLevel: number;
  maxStockLevel: number;
  reorderPoint: number;
  reorderQuantity: number;
  image?: string;
  originCountry?: string;
  defaultSalesUnitId?: string;
  defaultPurchaseUnitId?: string;
  defaultInventoryUnitId?: string;
  salesAccountId?: string;
  cogsAccountId?: string;
  inventoryAccountId?: string;
  isActive: boolean;
  currentStock: number; // Total base unit stock on hand across all warehouses
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseStock {
  id: string;
  tenantId: string;
  warehouseId: string;
  itemId: string;
  currentStockBaseQty: number; // Stored strictly in Base Unit (Rule I3)
  reservedQty: number; // Committed to pending orders
  availableQty: number; // currentStockBaseQty - reservedQty
  binLocation?: string; // Specific location in warehouse
  currentWac: number; // WAC in SAR for this location
  lastReceiptDate?: string;
  updatedAt: string;
}

export interface Cashbox {
  id: string;
  tenantId: string;
  branchId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  glAccountId: string;
  isDefault: boolean;
  createdAt: string;
}

export interface BankAccount {
  id: string;
  tenantId: string;
  bankNameAr: string;
  bankNameEn: string;
  accountNumber: string;
  iban: string;
  swiftCode?: string;
  glAccountId: string;
  currency: string;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  fullNameAr: string;
  fullNameEn: string;
  phone?: string;
  isPlatformSuperAdmin: boolean;
  isActive: boolean;
  mfaEnabled: boolean;
  mfaSecret?: string;
  mfaRecoveryCodes?: string[];
  failedLoginAttempts: number;
  lockoutUntil?: number;
  lastLoginAt?: string;
  lastLoginIp?: string;
  createdAt: string;
}

export interface UserMembership {
  id: string;
  tenantId: string;
  userId: string;
  roleCode: string;
  branchId?: string;
  isActive: boolean;
  createdAt: string;
}

export interface UserSession {
  id?: string;
  sessionToken?: string;
  userId: string;
  tenantId: string;
  email?: string;
  role?: string;
  permissions?: string[];
  branchId?: string;
  deviceFingerprint?: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: number;
  lastActiveAt?: number;
  lastAccessedAt?: string;
  createdAt: string;
}

export interface DocumentSequence {
  id: string;
  tenantId: string;
  documentTypeCode: string;
  prefix: string;
  year: number;
  nextNumber: number;
  padding: number;
  postfix?: string;
  createdAt: string;
}

export interface AccountMapping {
  tenantId: string;
  mappings: Record<string, string>; // e.g. CUSTOMERS_AR: accountId
}

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  userId?: string;
  userEmail: string;
  ipAddress?: string;
  userAgent?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  correlationId: string;
  changesDiff?: Record<string, any>;
  reason?: string;
  chainedHash?: string;
  previousHash?: string;
  createdAt: string;
}

export interface LoginHistoryEntry {
  id: string;
  userId?: string;
  email: string;
  tenantId?: string;
  ipAddress: string;
  userAgent: string;
  deviceFingerprint: string;
  status: 'SUCCESS' | 'FAILED' | 'LOCKED_OUT' | 'MFA_REQUIRED';
  failureReason?: string;
  timestamp: string;
}

export interface UserInvite {
  id: string;
  tenantId: string;
  email: string;
  roleCode: string;
  branchId?: string;
  token: string;
  invitedBy: string;
  expiresAt: number;
  acceptedAt?: string;
  createdAt: string;
}

// Default standard account mappings (18 standard accounts per requirements)
export const DEFAULT_ACCOUNT_MAPPING_KEYS = {
  CUSTOMERS_AR: '10201', // Customers control account
  SUPPLIERS_AP: '20101', // Suppliers control account
  VAT_INPUT: '10301', // VAT Input Recoverable
  VAT_OUTPUT: '20301', // VAT Output Payable
  SALES_REVENUE: '40101', // Commercial Sales Revenue
  SALES_RETURNS: '40102', // Sales Returns & Allowances
  PURCHASES_EXPENSE: '50102', // Merchandise Purchases
  PURCHASE_RETURNS: '50103', // Purchase Returns & Allowances
  INVENTORY_ASSET: '10401', // Inventory on Hand
  COGS: '50101', // Cost of Goods Sold
  CASH_DEFAULT: '10101', // Main Cash Vault
  BANK_DEFAULT: '10102', // Operating Bank Account
  CUSTOMER_ADVANCES: '20102', // Customer Advances / Deposits
  SUPPLIER_ADVANCES: '10202', // Supplier Advances / Prepayments
  ROUNDING_DIFFERENCES: '50402', // Rounding Differences / Variances
  RETAINED_EARNINGS: '30201', // Retained Earnings
  DEPRECIATION_EXPENSE: '50501', // Depreciation Expense
  ACCUMULATED_DEPRECIATION: '10501', // Accumulated Depreciation
} as const;

export type AccountMappingKey = keyof typeof DEFAULT_ACCOUNT_MAPPING_KEYS;

export interface Account {
  id: string;
  tenantId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'COGS' | 'EXPENSE';
  normalBalance: 'DEBIT' | 'CREDIT';
  parentId?: string | null;
  isHeader: boolean;
  allowPosting: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface JournalLine {
  id: string;
  journalId: string;
  accountId: string;
  accountCode: string;
  accountNameAr: string;
  accountNameEn: string;
  debitCents: bigint;
  creditCents: bigint;
  descriptionAr?: string;
  descriptionEn?: string;
  costCenterId?: string | null;
  branchId?: string;
}

export interface JournalEntry {
  id: string;
  tenantId: string;
  branchId: string;
  entryNumber: string; // Sequential JV-YYYY-XXXXX
  entryDate: string; // YYYY-MM-DD
  periodId: string;
  sourceType: 'INVOICE' | 'PAYMENT' | 'RECEIPT' | 'BILL' | 'INVENTORY_ADJUSTMENT' | 'EXPENSE' | 'MANUAL' | 'OPENING' | 'CLOSING' | 'REVERSAL';
  sourceId: string;
  sourceKey: string;
  reference?: string;
  descriptionAr: string;
  descriptionEn: string;
  totalDebitCents: bigint;
  totalCreditCents: bigint;
  status: 'POSTED' | 'REVERSED';
  reversalOfJournalId?: string | null;
  reversedByJournalId?: string | null;
  reversalReason?: string | null;
  costCenterId?: string | null;
  lines: JournalLine[];
  createdBy: string;
  createdAt: string;
}

export interface PostJournalCommand {
  companyId: string;
  branchId?: string;
  sourceType: 'INVOICE' | 'PAYMENT' | 'RECEIPT' | 'BILL' | 'INVENTORY_ADJUSTMENT' | 'EXPENSE' | 'MANUAL' | 'OPENING' | 'CLOSING' | 'REVERSAL';
  sourceId: string;
  sourceKey: string;
  date: string; // YYYY-MM-DD
  description: string;
  descriptionAr?: string;
  descriptionEn?: string;
  reference?: string;
  costCenterId?: string;
  overrideClosedPeriod?: boolean;
  closedPeriodOverrideReason?: string;
  lines: Array<{
    accountId: string; // Can be ID or Code
    debit: string | number;
    credit: string | number;
    description?: string;
    descriptionAr?: string;
    descriptionEn?: string;
    costCenterId?: string;
    branchId?: string;
  }>;
}

export interface FiscalYear {
  id: string;
  tenantId: string;
  year: number;
  nameAr: string;
  nameEn: string;
  startDate: string;
  endDate: string;
  isClosed: boolean;
  closedAt?: string;
  closedBy?: string;
  createdAt: string;
}

export interface FinancialPeriod {
  id: string;
  tenantId: string;
  fiscalYearId: string;
  periodNumber: number;
  nameAr: string;
  nameEn: string;
  startDate: string;
  endDate: string;
  isClosed: boolean;
  closedAt?: string;
  closedBy?: string;
  closedReason?: string;
  createdAt: string;
}

export interface CostCenter {
  id: string;
  tenantId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  parentId?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface OpeningBalanceEntry {
  id: string;
  tenantId: string;
  sourceType: 'CUSTOMER' | 'SUPPLIER' | 'CASHBOX' | 'BANK' | 'INVENTORY' | 'GL';
  sourceId: string;
  sourceNameAr: string;
  sourceNameEn: string;
  accountId: string;
  accountCode: string;
  debitCents: bigint;
  creditCents: bigint;
  itemizedReference?: string;
  notes?: string;
  status: 'DRAFT' | 'POSTED';
  postedJournalId?: string;
  createdAt: string;
}

export interface DraftJournal {
  id: string;
  tenantId: string;
  branchId: string;
  entryDate: string;
  descriptionAr: string;
  descriptionEn: string;
  reference?: string;
  lines: Array<{
    accountId: string;
    accountCode?: string;
    debit: string;
    credit: string;
    description?: string;
    costCenterId?: string;
  }>;
  attachments?: Array<{ name: string; size: number; url?: string }>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// 5. THE CENTRAL TENANT STORE & ENGINE
// ==========================================
export class CentralTenantDataStore {
  public tenants = new Map<string, CompanyTenant>();
  public branches = new Map<string, Branch[]>(); // tenantId -> branches
  public warehouses = new Map<string, Warehouse[]>(); // tenantId -> warehouses
  public cashboxes = new Map<string, Cashbox[]>(); // tenantId -> cashboxes
  public bankAccounts = new Map<string, BankAccount[]>(); // tenantId -> bank accounts
  public accounts = new Map<string, Account[]>(); // tenantId -> Account[]
  public accountMappings = new Map<string, Record<string, string>>(); // tenantId -> mappings
  public documentSequences = new Map<string, Map<string, DocumentSequence>>(); // tenantId -> (docType+year -> seq)
  public journals = new Map<string, JournalEntry[]>(); // tenantId -> JournalEntry[]
  public journalLines = new Map<string, JournalLine[]>(); // journalId -> JournalLine[]
  public fiscalYears = new Map<string, FiscalYear[]>(); // tenantId -> FiscalYear[]
  public financialPeriods = new Map<string, FinancialPeriod[]>(); // tenantId -> FinancialPeriod[]
  public costCenters = new Map<string, CostCenter[]>(); // tenantId -> CostCenter[]
  public openingBalances = new Map<string, OpeningBalanceEntry[]>(); // tenantId -> OpeningBalanceEntry[]
  public draftJournals = new Map<string, DraftJournal[]>(); // tenantId -> DraftJournal[]
  public itemCategories = new Map<string, ItemCategory[]>(); // tenantId -> ItemCategory[]
  public itemBrands = new Map<string, ItemBrand[]>(); // tenantId -> ItemBrand[]
  public unitsCatalog = new Map<string, GlobalUnit[]>(); // tenantId -> GlobalUnit[]
  public items = new Map<string, Item[]>(); // tenantId -> Item[]
  public warehouseStocks = new Map<string, WarehouseStock[]>(); // tenantId -> WarehouseStock[]
  public customerPriceRules = new Map<string, CustomerPriceRule[]>(); // tenantId -> CustomerPriceRule[]
  public itemPriceHistory = new Map<string, PriceHistoryRecord[]>(); // itemId -> PriceHistoryRecord[]
  public customers = new Map<string, Customer[]>(); // tenantId -> Customer[]
  public suppliers = new Map<string, Supplier[]>(); // tenantId -> Supplier[]
  public partyAttachments = new Map<string, PartyAttachment[]>(); // partyId -> PartyAttachment[]
  public partyContracts = new Map<string, PartyContract[]>(); // supplierId -> PartyContract[]
  public supplierPriceHistory = new Map<string, SupplierPriceRecord[]>(); // supplierId -> SupplierPriceRecord[]
  public batchImports = new Map<string, any[]>(); // tenantId -> BatchImportSnapshot[]
  public salesInvoices = new Map<string, SalesInvoice[]>(); // tenantId -> SalesInvoice[]
  public salesQuotations = new Map<string, SalesQuotation[]>(); // tenantId -> SalesQuotation[]
  public salesOrders = new Map<string, SalesOrder[]>(); // tenantId -> SalesOrder[]
  public salesCreditNotes = new Map<string, SalesCreditNote[]>(); // tenantId -> SalesCreditNote[]
  public customerPriceAgreements = new Map<string, CustomerPriceAgreement[]>(); // tenantId -> CustomerPriceAgreement[]
  public customerReceipts = new Map<string, CustomerReceipt[]>(); // tenantId -> CustomerReceipt[]
  public stockMovements = new Map<string, StockMovement[]>(); // tenantId -> StockMovement[]
  public stockTransfers = new Map<string, StockTransfer[]>(); // tenantId -> StockTransfer[]
  public stockAdjustments = new Map<string, StockAdjustment[]>(); // tenantId -> StockAdjustment[]
  public stocktakes = new Map<string, Stocktake[]>(); // tenantId -> Stocktake[]
  public landedCostDocuments = new Map<string, LandedCostDocument[]>(); // tenantId -> LandedCostDocument[]
  public purchaseRequests = new Map<string, PurchaseRequest[]>(); // tenantId -> PurchaseRequest[]
  public purchaseOrders = new Map<string, PurchaseOrder[]>(); // tenantId -> PurchaseOrder[]
  public goodsReceiptNotes = new Map<string, GoodsReceiptNote[]>(); // tenantId -> GoodsReceiptNote[]
  public purchaseBills = new Map<string, PurchaseBill[]>(); // tenantId -> PurchaseBill[]
  public vendorDebitNotes = new Map<string, VendorDebitNote[]>(); // tenantId -> VendorDebitNote[]
  public supplierPayments = new Map<string, SupplierPayment[]>(); // tenantId -> SupplierPayment[]
  public supplierPriceRecords = new Map<string, PurchasingPriceRecord[]>(); // tenantId -> PurchasingPriceRecord[]
  public users = new Map<string, User>(); // userId -> user
  public userByEmail = new Map<string, string>(); // email.toLowerCase() -> userId
  public memberships = new Map<string, UserMembership[]>(); // tenantId -> memberships
  public roles = new Map<string, RoleDefinition[]>(); // tenantId -> custom + default roles
  public sessions = new Map<string, UserSession>(); // sessionToken -> session
  public invites = new Map<string, UserInvite[]>(); // tenantId -> invites
  public auditLogs: AuditLogEntry[] = [];
  public loginHistory: LoginHistoryEntry[] = [];
  public passwordResetTokens = new Map<string, { email: string; expiresAt: number }>();

  // Mutex locks for atomic document sequence generation
  private sequenceLocks = new Map<string, Promise<void>>();

  constructor() {
    // Demo company/users (published password) are only seeded when enabled; see env.SEED_DEMO_DATA.
    if (!env.SEED_DEMO_DATA) return;
    try {
      this.initDefaultSeed();
    } catch {
      // Safe fallback if cyclic module imports are resolving
      setTimeout(() => {
        try {
          this.initDefaultSeed();
        } catch {}
      }, 0);
    }
  }

  public initDefaultSeed() {
    // Seed Platform Superadmin (pre-configured)
    const defaultPasswordHash = hashPassword('SuperSecret2026!');
    const superAdminId = crypto.randomUUID();
    const superAdminEmail = 'superadmin@saudi-erp.com';
    this.users.set(superAdminId, {
      id: superAdminId,
      email: superAdminEmail,
      passwordHash: defaultPasswordHash,
      fullNameAr: 'مدير المنصة العام',
      fullNameEn: 'Platform Super Administrator',
      phone: '+966500000000',
      isPlatformSuperAdmin: true,
      isActive: true,
      mfaEnabled: false,
      failedLoginAttempts: 0,
      createdAt: new Date().toISOString(),
    });
    this.userByEmail.set(superAdminEmail, superAdminId);

    // Seed Standard Demo Company & Owner for instant access and verification
    const demoAdminId = crypto.randomUUID();
    const demoAdminEmail = 'admin@al-inma.sa';
    this.users.set(demoAdminId, {
      id: demoAdminId,
      email: demoAdminEmail,
      passwordHash: defaultPasswordHash,
      fullNameAr: 'عبدالله بن فهد المنصور',
      fullNameEn: 'Abdullah Al-Mansoor',
      phone: '+966551234567',
      isPlatformSuperAdmin: false,
      isActive: true,
      mfaEnabled: false,
      failedLoginAttempts: 0,
      createdAt: new Date().toISOString(),
    });
    this.userByEmail.set(demoAdminEmail, demoAdminId);

    // Also register admin@company.com.sa
    const companyAdminId = crypto.randomUUID();
    const companyAdminEmail = 'admin@company.com.sa';
    this.users.set(companyAdminId, {
      id: companyAdminId,
      email: companyAdminEmail,
      passwordHash: defaultPasswordHash,
      fullNameAr: 'عبدالرحمن الشمري (المدير التنفيذي)',
      fullNameEn: 'Abdulrahman Al-Shammari (CEO)',
      phone: '+966559876543',
      isPlatformSuperAdmin: false,
      isActive: true,
      mfaEnabled: false,
      failedLoginAttempts: 0,
      createdAt: new Date().toISOString(),
    });
    this.userByEmail.set(companyAdminEmail, companyAdminId);

    const demoTenant = this.createTenant({
      nameAr: 'شركة الإنماء للحلول التجارية والتقنية',
      nameEn: 'Al-Inma Commercial & Technology Solutions',
      vatNumber: '300000000000003',
      crNumber: '1010000000',
      unifiedNumber: '7000000001',
      nationalAddress: 'المملكة العربية السعودية، الرياض، طريق الملك فهد',
      phone: '+966112345678',
      email: 'info@al-inma.sa',
      adminUserId: demoAdminId,
    });

    const tenantId = demoTenant.id;
    const branches = this.branches.get(tenantId) || [];
    const mainBranch = branches[0];
    const branchId = mainBranch ? mainBranch.id : crypto.randomUUID();

    // Additional Role Users for Demo & Functional Testing
    const demoRolesSeed = [
      { email: 'cfo@company.com.sa', nameAr: 'فيصل الخالدي', nameEn: 'Faisal Al-Khaldi', role: 'CHIEF_ACCOUNTANT' },
      { email: 'accountant@company.com.sa', nameAr: 'محمد السبيعي', nameEn: 'Mohammed Al-Subaie', role: 'ACCOUNTANT' },
      { email: 'sales@company.com.sa', nameAr: 'خالد الحربي', nameEn: 'Khaled Al-Harbi', role: 'SALES_MGR' },
      { email: 'purchases@company.com.sa', nameAr: 'طارق الدوسري', nameEn: 'Tariq Al-Dossari', role: 'PURCHASES_MGR' },
      { email: 'warehouse@company.com.sa', nameAr: 'سعد القحطاني', nameEn: 'Saad Al-Qahtani', role: 'WAREHOUSE_KEEPER' },
      { email: 'cashier@company.com.sa', nameAr: 'عمر الغامدي', nameEn: 'Omar Al-Ghamdi', role: 'CASHIER' },
      { email: 'auditor@company.com.sa', nameAr: 'سليمان العتيبي', nameEn: 'Sulaiman Al-Otaibi', role: 'AUDITOR' },
    ];

    const currentMemberships = this.memberships.get(tenantId) || [];
    currentMemberships.push({
      id: crypto.randomUUID(),
      tenantId,
      userId: companyAdminId,
      roleCode: 'OWNER',
      branchId,
      isActive: true,
      createdAt: new Date().toISOString(),
    });

    for (const rUser of demoRolesSeed) {
      const uId = crypto.randomUUID();
      this.users.set(uId, {
        id: uId,
        email: rUser.email,
        passwordHash: defaultPasswordHash,
        fullNameAr: rUser.nameAr,
        fullNameEn: rUser.nameEn,
        phone: '+96650000' + Math.floor(1000 + Math.random() * 9000),
        isPlatformSuperAdmin: false,
        isActive: true,
        mfaEnabled: false,
        failedLoginAttempts: 0,
        createdAt: new Date().toISOString(),
      });
      this.userByEmail.set(rUser.email, uId);

      currentMemberships.push({
        id: crypto.randomUUID(),
        tenantId,
        userId: uId,
        roleCode: rUser.role,
        branchId,
        isActive: true,
        createdAt: new Date().toISOString(),
      });
    }
    this.memberships.set(tenantId, currentMemberships);
    const warehouses = this.warehouses.get(tenantId) || [];
    const wh1 = warehouses[0];

    const wh2: Warehouse = {
      id: crypto.randomUUID(),
      tenantId,
      branchId: mainBranch ? mainBranch.id : crypto.randomUUID(),
      code: 'WH-02',
      nameAr: 'مستودع المعرض والتوزيع السريع',
      nameEn: 'Showroom & Fast Fulfillment Warehouse',
      address: 'الرياض - طريق خريص',
      managerName: 'سعد القحطاني',
      contactPhone: '+966504445566',
      isDefault: false,
      isActive: true,
      bins: [
        { id: crypto.randomUUID(), code: 'SH-01-A', aisle: 'SH', rack: '01', shelf: 'A' },
      ],
      createdAt: new Date().toISOString(),
    };
    warehouses.push(wh2);
    this.warehouses.set(tenantId, warehouses);

    // Seed Product Categories
    const catFood: ItemCategory = {
      id: crypto.randomUUID(),
      tenantId,
      code: 'CAT-FOOD',
      nameAr: 'المواد الغذائية والتمور',
      nameEn: 'Food & Dates',
      defaultTaxRate: 15,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    const catCoffee: ItemCategory = {
      id: crypto.randomUUID(),
      tenantId,
      code: 'CAT-COFFEE',
      nameAr: 'البن والقهوة المختصة',
      nameEn: 'Specialty Coffee',
      defaultTaxRate: 15,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    const catBeverages: ItemCategory = {
      id: crypto.randomUUID(),
      tenantId,
      code: 'CAT-BEV',
      nameAr: 'المرطبات والمياه',
      nameEn: 'Beverages & Bottled Water',
      defaultTaxRate: 15,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    const catOffice: ItemCategory = {
      id: crypto.randomUUID(),
      tenantId,
      code: 'CAT-OFFICE',
      nameAr: 'القرطاسية والمستلزمات المكتبية',
      nameEn: 'Office Supplies & Paper',
      defaultTaxRate: 15,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    const catElectronics: ItemCategory = {
      id: crypto.randomUUID(),
      tenantId,
      code: 'CAT-ELEC',
      nameAr: 'الأجهزة والإلكترونيات',
      nameEn: 'Electronics & Hardware',
      defaultTaxRate: 15,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    const catServices: ItemCategory = {
      id: crypto.randomUUID(),
      tenantId,
      code: 'CAT-SVC',
      nameAr: 'الخدمات المهنية والتقنية',
      nameEn: 'Professional & Tech Services',
      defaultTaxRate: 15,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    this.itemCategories.set(tenantId, [catFood, catCoffee, catBeverages, catOffice, catElectronics, catServices]);

    // Seed Brands
    const brandQassim: ItemBrand = {
      id: crypto.randomUUID(),
      tenantId,
      code: 'BRD-QASSIM',
      nameAr: 'مزارع القصيم للتمور',
      nameEn: 'Al-Qassim Royal Dates',
      countryOfOrigin: 'المملكة العربية السعودية',
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    const brandHarari: ItemBrand = {
      id: crypto.randomUUID(),
      tenantId,
      code: 'BRD-HARAR',
      nameAr: 'بن هرري الأصيل',
      nameEn: 'Harari Heritage Coffee',
      countryOfOrigin: 'إثيوبيا',
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    const brandNaqi: ItemBrand = {
      id: crypto.randomUUID(),
      tenantId,
      code: 'BRD-NAQI',
      nameAr: 'مياه نقي',
      nameEn: 'Naqi Pure Water',
      countryOfOrigin: 'المملكة العربية السعودية',
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    const brandDoubleA: ItemBrand = {
      id: crypto.randomUUID(),
      tenantId,
      code: 'BRD-DOUBLEA',
      nameAr: 'دبل إيه',
      nameEn: 'Double A',
      countryOfOrigin: 'تايلاند',
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    const brandSamsung: ItemBrand = {
      id: crypto.randomUUID(),
      tenantId,
      code: 'BRD-SAMSUNG',
      nameAr: 'سامسونج',
      nameEn: 'Samsung',
      countryOfOrigin: 'كوريا الجنوبية',
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    this.itemBrands.set(tenantId, [brandQassim, brandHarari, brandNaqi, brandDoubleA, brandSamsung]);

    // Seed 6 Standard Items with Multi-UOM and Barcodes (Rule I3, Rule I4)
    const itemDatesId = crypto.randomUUID();
    const itemCoffeeId = crypto.randomUUID();
    const itemWaterId = crypto.randomUUID();
    const itemPaperId = crypto.randomUUID();
    const itemMonitorId = crypto.randomUUID();
    const itemServiceId = crypto.randomUUID();

    const items: Item[] = [
      {
        id: itemDatesId,
        tenantId,
        sku: 'ITM-DATE-001',
        primaryBarcode: '628100100101',
        nameAr: 'تمر سكري ملكي فاخر مجروش',
        nameEn: 'Saudi Royal Sukari Dates 1KG',
        descriptionAr: 'تمر سكري فاخر من مزارع القصيم معبأ بأعلى معايير الجودة، رطب وحلو المذاق.',
        descriptionEn: 'Premium Grade Royal Sukari Dates from Al-Qassim farms, 1KG vacuum box.',
        type: 'INVENTORY',
        categoryId: catFood.id,
        categoryNameAr: catFood.nameAr,
        brandId: brandQassim.id,
        brandName: brandQassim.nameAr,
        baseUnit: 'كرتون 1 كجم',
        taxRate: 15,
        isVatInclusive: false,
        sellingPrice: 35.0,
        wholesalePrice: 28.0,
        cost: 20.0,
        currentWac: 20.0,
        trackBatches: true,
        trackSerialNumbers: false,
        trackExpiry: true,
        minStockLevel: 50,
        maxStockLevel: 1000,
        reorderPoint: 100,
        reorderQuantity: 200,
        isActive: true,
        currentStock: 350, // base units
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        units: [
          {
            id: crypto.randomUUID(),
            nameAr: 'كرتون 1 كجم',
            nameEn: 'Carton 1KG',
            symbol: 'كجم',
            conversionFactor: 1.0,
            barcode: '628100100101',
            isBaseUnit: true,
            salePrice: 35.0,
            wholesalePrice: 28.0,
            cost: 20.0,
          },
          {
            id: crypto.randomUUID(),
            nameAr: 'كرتون مجمع 12 كجم',
            nameEn: 'Master Box 12x1KG',
            symbol: 'صندوق',
            conversionFactor: 12.0,
            barcode: '628100100112',
            isBaseUnit: false,
            salePrice: 390.0,
            wholesalePrice: 320.0,
            cost: 240.0,
          },
          {
            id: crypto.randomUUID(),
            nameAr: 'طبلية 40 كرتون مجمع',
            nameEn: 'Pallet 40 Master Boxes',
            symbol: 'طبلية',
            conversionFactor: 480.0,
            barcode: '628100100140',
            isBaseUnit: false,
            salePrice: 14800.0,
            wholesalePrice: 12500.0,
            cost: 9600.0,
          },
        ],
      },
      {
        id: itemCoffeeId,
        tenantId,
        sku: 'ITM-COFF-001',
        primaryBarcode: '628100200201',
        nameAr: 'بن هرري إثيوبي محمص درجة أولى',
        nameEn: 'Ethiopian Harari Premium Roast Coffee 1KG',
        descriptionAr: 'حبوب بن هرري خولاني فاخر محمص بعناية لنكهة أصيلة وقوام متزن.',
        descriptionEn: 'Premium Grade roasted Harari coffee beans with rich aroma and balanced body.',
        type: 'INVENTORY',
        categoryId: catCoffee.id,
        categoryNameAr: catCoffee.nameAr,
        brandId: brandHarari.id,
        brandName: brandHarari.nameAr,
        baseUnit: 'كيس 1 كجم',
        taxRate: 15,
        isVatInclusive: false,
        sellingPrice: 65.0,
        wholesalePrice: 52.0,
        cost: 40.0,
        currentWac: 40.0,
        trackBatches: true,
        trackSerialNumbers: false,
        trackExpiry: true,
        minStockLevel: 25,
        maxStockLevel: 500,
        reorderPoint: 50,
        reorderQuantity: 100,
        isActive: true,
        currentStock: 220,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        units: [
          {
            id: crypto.randomUUID(),
            nameAr: 'كيس 1 كجم',
            nameEn: 'Bag 1KG',
            symbol: 'كيس',
            conversionFactor: 1.0,
            barcode: '628100200201',
            isBaseUnit: true,
            salePrice: 65.0,
            wholesalePrice: 52.0,
            cost: 40.0,
          },
          {
            id: crypto.randomUUID(),
            nameAr: 'خيشة 25 كجم',
            nameEn: 'Sack 25KG',
            symbol: 'خيشة',
            conversionFactor: 25.0,
            barcode: '628100200225',
            isBaseUnit: false,
            salePrice: 1500.0,
            wholesalePrice: 1250.0,
            cost: 1000.0,
          },
        ],
      },
      {
        id: itemWaterId,
        tenantId,
        sku: 'ITM-WATR-001',
        primaryBarcode: '628100300301',
        nameAr: 'كرتون مياه شرب نقي 40 قارورة 330 مل',
        nameEn: 'Naqi Pure Bottled Water 40x330ml Box',
        descriptionAr: 'مياه شرب نقية وصحية معبأة ومفلترة طبقا للمواصفات القياسية السعودية.',
        descriptionEn: 'Pure and balanced drinking water, 40 bottles carton of 330ml.',
        type: 'INVENTORY',
        categoryId: catBeverages.id,
        categoryNameAr: catBeverages.nameAr,
        brandId: brandNaqi.id,
        brandName: brandNaqi.nameAr,
        baseUnit: 'كرتون 40 قارورة',
        taxRate: 15,
        isVatInclusive: false,
        sellingPrice: 18.5,
        wholesalePrice: 15.0,
        cost: 11.5,
        currentWac: 11.5,
        trackBatches: true,
        trackSerialNumbers: false,
        trackExpiry: true,
        minStockLevel: 100,
        maxStockLevel: 2000,
        reorderPoint: 200,
        reorderQuantity: 500,
        isActive: true,
        currentStock: 650,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        units: [
          {
            id: crypto.randomUUID(),
            nameAr: 'كرتون 40 قارورة',
            nameEn: 'Box 40 Bottles',
            symbol: 'كرتون',
            conversionFactor: 1.0,
            barcode: '628100300301',
            isBaseUnit: true,
            salePrice: 18.5,
            wholesalePrice: 15.0,
            cost: 11.5,
          },
          {
            id: crypto.randomUUID(),
            nameAr: 'طبلية 72 كرتون',
            nameEn: 'Pallet 72 Boxes',
            symbol: 'طبلية',
            conversionFactor: 72.0,
            barcode: '628100300372',
            isBaseUnit: false,
            salePrice: 1260.0,
            wholesalePrice: 1050.0,
            cost: 828.0,
          },
        ],
      },
      {
        id: itemPaperId,
        tenantId,
        sku: 'ITM-PAPR-001',
        primaryBarcode: '885100400401',
        nameAr: 'ورق تصوير وطباعة دبل إيه A4 80 جرام',
        nameEn: 'Double A Copy & Printing Paper A4 80gsm',
        descriptionAr: 'ورق طباعة أبيض ناصع خالي من الأحماض ومقاوم للانحشار لأعلى جودة طباعة.',
        descriptionEn: 'High brightness premium office paper, 500 sheets per ream.',
        type: 'INVENTORY',
        categoryId: catOffice.id,
        categoryNameAr: catOffice.nameAr,
        brandId: brandDoubleA.id,
        brandName: brandDoubleA.nameAr,
        baseUnit: 'ماعون 500 ورقة',
        taxRate: 15,
        isVatInclusive: false,
        sellingPrice: 22.0,
        wholesalePrice: 18.5,
        cost: 14.0,
        currentWac: 14.0,
        trackBatches: false,
        trackSerialNumbers: false,
        trackExpiry: false,
        minStockLevel: 50,
        maxStockLevel: 1000,
        reorderPoint: 100,
        reorderQuantity: 250,
        isActive: true,
        currentStock: 480,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        units: [
          {
            id: crypto.randomUUID(),
            nameAr: 'ماعون 500 ورقة',
            nameEn: 'Ream 500 Sheets',
            symbol: 'ماعون',
            conversionFactor: 1.0,
            barcode: '885100400401',
            isBaseUnit: true,
            salePrice: 22.0,
            wholesalePrice: 18.5,
            cost: 14.0,
          },
          {
            id: crypto.randomUUID(),
            nameAr: 'كرتون 5 مواعين',
            nameEn: 'Box 5 Reams',
            symbol: 'كرتون',
            conversionFactor: 5.0,
            barcode: '885100400405',
            isBaseUnit: false,
            salePrice: 105.0,
            wholesalePrice: 90.0,
            cost: 70.0,
          },
        ],
      },
      {
        id: itemMonitorId,
        tenantId,
        sku: 'ITM-ELEC-001',
        primaryBarcode: '880100500501',
        nameAr: 'شاشة عرض سامسونج 27 بوصة UHD 4K',
        nameEn: 'Samsung 27" UHD 4K Professional Monitor',
        descriptionAr: 'شاشة احترافية بدقة 4K فائقة الوضوح مع دعم HDR ومنافذ HDMI/DisplayPort.',
        descriptionEn: '27-inch 4K UHD professional IPS display with ultra-thin bezels.',
        type: 'INVENTORY',
        categoryId: catElectronics.id,
        categoryNameAr: catElectronics.nameAr,
        brandId: brandSamsung.id,
        brandName: brandSamsung.nameAr,
        baseUnit: 'قطعة',
        taxRate: 15,
        isVatInclusive: false,
        sellingPrice: 1450.0,
        wholesalePrice: 1280.0,
        cost: 1080.0,
        currentWac: 1080.0,
        trackBatches: false,
        trackSerialNumbers: true,
        trackExpiry: false,
        minStockLevel: 5,
        maxStockLevel: 50,
        reorderPoint: 10,
        reorderQuantity: 20,
        isActive: true,
        currentStock: 35,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        units: [
          {
            id: crypto.randomUUID(),
            nameAr: 'قطعة',
            nameEn: 'Piece',
            symbol: 'قطعة',
            conversionFactor: 1.0,
            barcode: '880100500501',
            isBaseUnit: true,
            salePrice: 1450.0,
            wholesalePrice: 1280.0,
            cost: 1080.0,
          },
        ],
      },
      {
        id: itemServiceId,
        tenantId,
        sku: 'SVC-SUPP-001',
        primaryBarcode: '628100600601',
        nameAr: 'عقد استشارات ودعم فني وصيانة سنوي',
        nameEn: 'Annual IT Support & Maintenance Service Contract',
        descriptionAr: 'خدمة دعم فني مؤسسي شاملة مع تغطية سريعة واستشارات تقنية شهرية.',
        descriptionEn: 'Enterprise SLA support contract including on-site and remote assistance.',
        type: 'SERVICE',
        categoryId: catServices.id,
        categoryNameAr: catServices.nameAr,
        baseUnit: 'عقد سنوي',
        taxRate: 15,
        isVatInclusive: false,
        sellingPrice: 5000.0,
        wholesalePrice: 4500.0,
        cost: 0.0,
        currentWac: 0.0,
        trackBatches: false,
        trackSerialNumbers: false,
        trackExpiry: false,
        minStockLevel: 0,
        maxStockLevel: 0,
        reorderPoint: 0,
        reorderQuantity: 0,
        isActive: true,
        currentStock: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        units: [
          {
            id: crypto.randomUUID(),
            nameAr: 'عقد سنوي',
            nameEn: 'Annual Contract',
            symbol: 'عقد',
            conversionFactor: 1.0,
            barcode: '628100600601',
            isBaseUnit: true,
            salePrice: 5000.0,
            wholesalePrice: 4500.0,
            cost: 0.0,
          },
        ],
      },
    ];
    this.items.set(tenantId, items);

    // Seed Multi-Warehouse Stock Distributions
    const stocks: WarehouseStock[] = [
      // Dates (350 total: 250 in WH1, 100 in WH2)
      {
        id: crypto.randomUUID(),
        tenantId,
        warehouseId: wh1.id,
        itemId: itemDatesId,
        currentStockBaseQty: 250,
        reservedQty: 10,
        availableQty: 240,
        binLocation: 'A1-R01-S01',
        currentWac: 20.0,
        lastReceiptDate: '2026-01-15',
        updatedAt: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        tenantId,
        warehouseId: wh2.id,
        itemId: itemDatesId,
        currentStockBaseQty: 100,
        reservedQty: 0,
        availableQty: 100,
        binLocation: 'SH-01-A',
        currentWac: 20.0,
        lastReceiptDate: '2026-02-01',
        updatedAt: new Date().toISOString(),
      },
      // Coffee (220 total: 170 in WH1, 50 in WH2)
      {
        id: crypto.randomUUID(),
        tenantId,
        warehouseId: wh1.id,
        itemId: itemCoffeeId,
        currentStockBaseQty: 170,
        reservedQty: 0,
        availableQty: 170,
        binLocation: 'A1-R01-S02',
        currentWac: 40.0,
        lastReceiptDate: '2026-01-20',
        updatedAt: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        tenantId,
        warehouseId: wh2.id,
        itemId: itemCoffeeId,
        currentStockBaseQty: 50,
        reservedQty: 0,
        availableQty: 50,
        binLocation: 'SH-01-A',
        currentWac: 40.0,
        lastReceiptDate: '2026-02-10',
        updatedAt: new Date().toISOString(),
      },
      // Water (650 total: 450 in WH1, 200 in WH2)
      {
        id: crypto.randomUUID(),
        tenantId,
        warehouseId: wh1.id,
        itemId: itemWaterId,
        currentStockBaseQty: 450,
        reservedQty: 20,
        availableQty: 430,
        binLocation: 'B1-R01-S01',
        currentWac: 11.5,
        lastReceiptDate: '2026-02-15',
        updatedAt: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        tenantId,
        warehouseId: wh2.id,
        itemId: itemWaterId,
        currentStockBaseQty: 200,
        reservedQty: 0,
        availableQty: 200,
        binLocation: 'SH-01-A',
        currentWac: 11.5,
        lastReceiptDate: '2026-02-18',
        updatedAt: new Date().toISOString(),
      },
      // Paper (480 total: 350 in WH1, 130 in WH2)
      {
        id: crypto.randomUUID(),
        tenantId,
        warehouseId: wh1.id,
        itemId: itemPaperId,
        currentStockBaseQty: 350,
        reservedQty: 0,
        availableQty: 350,
        binLocation: 'A1-R01-S02',
        currentWac: 14.0,
        lastReceiptDate: '2026-01-05',
        updatedAt: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        tenantId,
        warehouseId: wh2.id,
        itemId: itemPaperId,
        currentStockBaseQty: 130,
        reservedQty: 0,
        availableQty: 130,
        binLocation: 'SH-01-A',
        currentWac: 14.0,
        lastReceiptDate: '2026-01-28',
        updatedAt: new Date().toISOString(),
      },
      // Monitor (35 total: 25 in WH1, 10 in WH2)
      {
        id: crypto.randomUUID(),
        tenantId,
        warehouseId: wh1.id,
        itemId: itemMonitorId,
        currentStockBaseQty: 25,
        reservedQty: 2,
        availableQty: 23,
        binLocation: 'B1-R01-S01',
        currentWac: 1080.0,
        lastReceiptDate: '2026-02-05',
        updatedAt: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        tenantId,
        warehouseId: wh2.id,
        itemId: itemMonitorId,
        currentStockBaseQty: 10,
        reservedQty: 0,
        availableQty: 10,
        binLocation: 'SH-01-A',
        currentWac: 1080.0,
        lastReceiptDate: '2026-02-12',
        updatedAt: new Date().toISOString(),
      },
    ];
    this.warehouseStocks.set(tenantId, stocks);

    // Seed Stock Movements Ledger (Rule I1 / I5)
    seedDefaultInventoryMovements(this, tenantId, demoAdminId);

    // Seed Customers, Suppliers, and verified Ledger Balances (Rule G4)
    seedDefaultParties(this, tenantId, demoAdminId);

    // Seed Sales Lifecycle (B2B, B2C, Quotations & ZATCA QR)
    seedDefaultSales(this, tenantId, demoAdminId);

    // Seed Purchasing & Accounts Payable (PO, Bills, Payments, Debit Notes)
    seedDefaultPurchasing(this, tenantId, demoAdminId);

    // Seed Treasury Accounts & Vaults (Cash, Banks, Custody, POS)
    seedDefaultTreasury(this, tenantId, demoAdminId);

    // Seed Active Default Session for Seed Token
    const seedSession: UserSession = {
      id: crypto.randomUUID(),
      sessionToken: 'seed-token',
      userId: demoAdminId,
      tenantId,
      deviceFingerprint: 'seed-device-fp',
      ipAddress: '127.0.0.1',
      userAgent: 'SaudiERP-System-Agent',
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
      lastActiveAt: Date.now(),
      createdAt: new Date().toISOString(),
    };
    this.sessions.set('seed-token', seedSession);
  }

  // Record an immutable audit log
  public recordAuditLog(entry: Omit<AuditLogEntry, 'id' | 'createdAt'>): AuditLogEntry {
    const fullEntry: AuditLogEntry = {
      ...entry,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.auditLogs.unshift(fullEntry);
    logger.info(`[AUDIT] ${fullEntry.action} by ${fullEntry.userEmail} on tenant ${fullEntry.tenantId}`, {
      tenantId: fullEntry.tenantId,
      action: fullEntry.action,
      resourceType: fullEntry.resourceType,
      resourceId: fullEntry.resourceId,
    });
    return fullEntry;
  }

  // Record a login history event
  public recordLoginHistory(entry: Omit<LoginHistoryEntry, 'id' | 'timestamp'>): LoginHistoryEntry {
    const fullEntry: LoginHistoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };
    this.loginHistory.unshift(fullEntry);
    return fullEntry;
  }

  // Create a brand new tenant with initial seeds (Saudi default CoA, Branches, Sequence Templates, Mappings)
  public createTenant(
    params: {
      nameAr: string;
      nameEn: string;
      vatNumber: string;
      crNumber: string;
      unifiedNumber?: string;
      nationalAddress?: string;
      phone?: string;
      email?: string;
      adminUserId: string;
      /** Pre-reserved unique code (from the database sequence when persistence is on). */
      code?: string;
    }
  ): CompanyTenant {
    const tenantId = crypto.randomUUID();
    const count = this.tenants.size + 1;
    const code = params.code || `TNT-${1000 + count}`;

    const tenant: CompanyTenant = {
      id: tenantId,
      code,
      nameAr: params.nameAr,
      nameEn: params.nameEn || params.nameAr,
      vatNumber: params.vatNumber,
      crNumber: params.crNumber,
      unifiedNumber: params.unifiedNumber || '',
      nationalAddress: params.nationalAddress || 'المملكة العربية السعودية، الرياض، حي العليا',
      phone: params.phone || '',
      email: params.email || '',
      currency: 'SAR',
      timezone: 'Asia/Riyadh',
      language: 'ar-SA',
      fiscalYearStartMonth: 1,
      accountingBasis: 'ACCRUAL',
      vatPreference: 'EXCLUSIVE',
      vatRatePercentage: 15,
      zatcaEnv: 'simulation',
      zatcaStatus: 'NOT_CONFIGURED',
      isSuspended: false,
      onboardingCompleted: false,
      onboardingStep: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.tenants.set(tenantId, tenant);

    // 1. Create Main Branch
    const branchId = crypto.randomUUID();
    const mainBranch: Branch = {
      id: branchId,
      tenantId,
      code: 'BR-01',
      nameAr: 'الفرع الرئيسي - الرياض',
      nameEn: 'Headquarters - Riyadh',
      isMainBranch: true,
      address: tenant.nationalAddress,
      createdAt: new Date().toISOString(),
    };
    this.branches.set(tenantId, [mainBranch]);

    // 2-10, 12-14. Default warehouse, cash, bank, chart of accounts, sequences, periods, roles, units
    this.initializeTenantDefaults(tenant, mainBranch);

    // 11. Assign Owner Role to the Creator
    const membership: UserMembership = {
      id: crypto.randomUUID(),
      tenantId,
      userId: params.adminUserId,
      roleCode: 'OWNER',
      branchId,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    this.memberships.set(tenantId, [membership]);

    return tenant;
  }

  /**
   * Builds the default operating scaffolding of a company (warehouse, cash vault, bank,
   * Saudi chart of accounts, account mappings, document sequences, fiscal year and periods,
   * cost center, roles, units catalog and empty collections).
   *
   * Used by createTenant, and when a company persisted in PostgreSQL is loaded into a
   * fresh process. It never touches the tenant record, branches or memberships.
   */
  public initializeTenantDefaults(tenant: CompanyTenant, mainBranch: Branch): void {
    const tenantId = tenant.id;
    const branchId = mainBranch.id;

    // 2. Create Default Warehouse
    const warehouseId = crypto.randomUUID();
    const mainWarehouse: Warehouse = {
      id: warehouseId,
      tenantId,
      branchId,
      code: 'WH-01',
      nameAr: 'المستودع المركزي',
      nameEn: 'Central Warehouse',
      address: tenant.nationalAddress,
      managerName: 'فهد العتيبي',
      contactPhone: '+966501112233',
      isDefault: true,
      isActive: true,
      bins: [
        { id: crypto.randomUUID(), code: 'A1-R01-S01', aisle: 'A1', rack: 'R01', shelf: 'S01' },
        { id: crypto.randomUUID(), code: 'A1-R01-S02', aisle: 'A1', rack: 'R01', shelf: 'S02' },
        { id: crypto.randomUUID(), code: 'B1-R01-S01', aisle: 'B1', rack: 'R01', shelf: 'S01' },
      ],
      createdAt: new Date().toISOString(),
    };
    this.warehouses.set(tenantId, [mainWarehouse]);

    // 3. Create Default Cash Vault
    const cashboxId = crypto.randomUUID();
    const mainCashbox: Cashbox = {
      id: cashboxId,
      tenantId,
      branchId,
      code: 'CSH-01',
      nameAr: 'خزينة النقدية الرئيسية',
      nameEn: 'Main Cash Vault',
      glAccountId: '10101',
      isDefault: true,
      createdAt: new Date().toISOString(),
    };
    this.cashboxes.set(tenantId, [mainCashbox]);

    // 4. Create Default Bank Account
    const bankAccountId = crypto.randomUUID();
    const mainBank: BankAccount = {
      id: bankAccountId,
      tenantId,
      bankNameAr: 'مصرف الراجحي',
      bankNameEn: 'Al Rajhi Bank',
      accountNumber: 'SA0000000000000000000001',
      iban: 'SA0380000000000000000001',
      swiftCode: 'RJHISARI',
      glAccountId: '10102',
      currency: 'SAR',
      createdAt: new Date().toISOString(),
    };
    this.bankAccounts.set(tenantId, [mainBank]);

    // 5. Initialize Saudi Default Chart of Accounts for this tenant
    const coaCopy: Account[] = SAUDI_STANDARD_CHART_OF_ACCOUNTS.map((acc, index) => ({
      id: crypto.randomUUID(),
      tenantId,
      code: acc.code,
      nameAr: acc.nameAr,
      nameEn: acc.nameEn,
      type: acc.type as Account['type'],
      normalBalance: acc.normalBalance as 'DEBIT' | 'CREDIT',
      parentId: null,
      isHeader: acc.isHeader,
      allowPosting: acc.allowPosting !== undefined ? acc.allowPosting : !acc.isHeader,
      sortOrder: acc.sortOrder || (index + 1) * 10,
      isActive: true,
      createdAt: new Date().toISOString(),
    }));
    this.accounts.set(tenantId, coaCopy);

    // 6. Initialize Account Mappings (linked accounts config, never hard-coded account IDs)
    this.accountMappings.set(tenantId, { ...DEFAULT_ACCOUNT_MAPPING_KEYS });

    // 7. Initialize Document Numbering Sequence Templates
    const currentYear = new Date().getFullYear();
    const seqMap = new Map<string, DocumentSequence>();

    SYSTEM_DEFAULT_DOCUMENT_TYPES.forEach((doc) => {
      const key = `${doc.code}-${currentYear}`;
      seqMap.set(key, {
        id: crypto.randomUUID(),
        tenantId,
        documentTypeCode: doc.code,
        prefix: `${doc.code}-${currentYear}-`,
        year: currentYear,
        nextNumber: 1,
        padding: 5,
        createdAt: new Date().toISOString(),
      });
    });

    // Also add Purchase Order, Goods Receipt Note, and Journal Voucher sequences
    ['PO', 'GRN', 'SO', 'JV'].forEach((code) => {
      const key = `${code}-${currentYear}`;
      seqMap.set(key, {
        id: crypto.randomUUID(),
        tenantId,
        documentTypeCode: code,
        prefix: `${code}-${currentYear}-`,
        year: currentYear,
        nextNumber: 1,
        padding: 5,
        createdAt: new Date().toISOString(),
      });
    });

    this.documentSequences.set(tenantId, seqMap);

    // 8. Initialize Default Fiscal Year and 12 Financial Periods
    const fiscalYearId = crypto.randomUUID();
    const defaultFiscalYear: FiscalYear = {
      id: fiscalYearId,
      tenantId,
      year: currentYear,
      nameAr: `السنة المالية ${currentYear}`,
      nameEn: `Fiscal Year ${currentYear}`,
      startDate: `${currentYear}-01-01`,
      endDate: `${currentYear}-12-31`,
      isClosed: false,
      createdAt: new Date().toISOString(),
    };
    this.fiscalYears.set(tenantId, [defaultFiscalYear]);

    const periods: FinancialPeriod[] = [];
    const monthNamesAr = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];
    const monthNamesEn = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    for (let m = 1; m <= 12; m++) {
      const monthStr = String(m).padStart(2, '0');
      const lastDay = new Date(currentYear, m, 0).getDate();
      const lastDayStr = String(lastDay).padStart(2, '0');
      periods.push({
        id: crypto.randomUUID(),
        tenantId,
        fiscalYearId,
        periodNumber: m,
        nameAr: `فترة ${monthNamesAr[m - 1]} ${currentYear}`,
        nameEn: `Period ${monthNamesEn[m - 1]} ${currentYear}`,
        startDate: `${currentYear}-${monthStr}-01`,
        endDate: `${currentYear}-${monthStr}-${lastDayStr}`,
        isClosed: false,
        createdAt: new Date().toISOString(),
      });
    }
    this.financialPeriods.set(tenantId, periods);

    // 9. Initialize Default Cost Center (CC-001)
    const defaultCostCenter: CostCenter = {
      id: crypto.randomUUID(),
      tenantId,
      code: 'CC-001',
      nameAr: 'الإدارة العامة والمقر الرئيسي',
      nameEn: 'General Administration & Headquarters',
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    this.costCenters.set(tenantId, [defaultCostCenter]);

    // 10. Initialize Empty Collections for Journals, Opening Balances, Drafts
    this.journals.set(tenantId, []);
    this.openingBalances.set(tenantId, []);
    this.draftJournals.set(tenantId, []);

    // 12. Initialize Tenant Roles with standard system defaults
    this.roles.set(tenantId, [...SYSTEM_DEFAULT_ROLES]);

    // 13. Initialize Empty Collections for Inventory (Product Master, Categories, Brands, Stocks)
    this.itemCategories.set(tenantId, []);
    this.itemBrands.set(tenantId, []);
    this.items.set(tenantId, []);
    this.warehouseStocks.set(tenantId, []);

    // 14. Initialize Default Global Units Catalog (PCE, BOX, CTN, KG, GRM, LTR, MTR, PCK, DZN, PLT)
    const defaultUnits: GlobalUnit[] = [
      { id: crypto.randomUUID(), tenantId, code: 'PCE', nameAr: 'قطعة / حبة', nameEn: 'Piece', symbolAr: 'حبة', symbolEn: 'Pce', category: 'COUNT', isSystem: true, isActive: true, createdAt: new Date().toISOString() },
      { id: crypto.randomUUID(), tenantId, code: 'BOX', nameAr: 'علبة / باكت', nameEn: 'Box', symbolAr: 'علبة', symbolEn: 'Box', category: 'COUNT', isSystem: true, isActive: true, createdAt: new Date().toISOString() },
      { id: crypto.randomUUID(), tenantId, code: 'CTN', nameAr: 'كرتون', nameEn: 'Carton', symbolAr: 'كرتون', symbolEn: 'Ctn', category: 'COUNT', isSystem: true, isActive: true, createdAt: new Date().toISOString() },
      { id: crypto.randomUUID(), tenantId, code: 'KG', nameAr: 'كيلوجرام', nameEn: 'Kilogram', symbolAr: 'كجم', symbolEn: 'Kg', category: 'WEIGHT', isSystem: true, isActive: true, createdAt: new Date().toISOString() },
      { id: crypto.randomUUID(), tenantId, code: 'GRM', nameAr: 'جرام', nameEn: 'Gram', symbolAr: 'جم', symbolEn: 'g', category: 'WEIGHT', isSystem: true, isActive: true, createdAt: new Date().toISOString() },
      { id: crypto.randomUUID(), tenantId, code: 'LTR', nameAr: 'لتر', nameEn: 'Liter', symbolAr: 'لتر', symbolEn: 'L', category: 'VOLUME', isSystem: true, isActive: true, createdAt: new Date().toISOString() },
      { id: crypto.randomUUID(), tenantId, code: 'MTR', nameAr: 'متر', nameEn: 'Meter', symbolAr: 'متر', symbolEn: 'm', category: 'LENGTH', isSystem: true, isActive: true, createdAt: new Date().toISOString() },
      { id: crypto.randomUUID(), tenantId, code: 'PCK', nameAr: 'حزمة / ربطة', nameEn: 'Pack', symbolAr: 'حزمة', symbolEn: 'Pck', category: 'COUNT', isSystem: true, isActive: true, createdAt: new Date().toISOString() },
      { id: crypto.randomUUID(), tenantId, code: 'DZN', nameAr: 'درزن (12 حبة)', nameEn: 'Dozen', symbolAr: 'درزن', symbolEn: 'Dzn', category: 'COUNT', isSystem: true, isActive: true, createdAt: new Date().toISOString() },
      { id: crypto.randomUUID(), tenantId, code: 'PLT', nameAr: 'طبلية / منصة', nameEn: 'Pallet', symbolAr: 'طبلية', symbolEn: 'Plt', category: 'COUNT', isSystem: true, isActive: true, createdAt: new Date().toISOString() },
    ];
    this.unitsCatalog.set(tenantId, defaultUnits);
    this.customerPriceRules.set(tenantId, []);

  }

  // Concurrency-safe atomic document sequence incrementer
  public async getNextDocumentNumber(tenantId: string, docTypeCode: string, year = new Date().getFullYear()): Promise<string> {
    const lockKey = `${tenantId}:${docTypeCode}:${year}`;

    // Wait for any existing operation on this sequence to complete
    let releaseLock: () => void = () => {};
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    const previousLock = this.sequenceLocks.get(lockKey) || Promise.resolve();
    this.sequenceLocks.set(lockKey, previousLock.then(() => lockPromise));

    await previousLock;

    try {
      let tenantSeqMap = this.documentSequences.get(tenantId);
      if (!tenantSeqMap) {
        tenantSeqMap = new Map<string, DocumentSequence>();
        SYSTEM_DEFAULT_DOCUMENT_TYPES.forEach((doc) => {
          const key = `${doc.code}-${year}`;
          tenantSeqMap!.set(key, {
            id: crypto.randomUUID(),
            tenantId,
            documentTypeCode: doc.code,
            prefix: `${doc.code}-${year}-`,
            year,
            nextNumber: 1,
            padding: 5,
            createdAt: new Date().toISOString(),
          });
        });
        this.documentSequences.set(tenantId, tenantSeqMap);
      }

      const seqKey = `${docTypeCode}-${year}`;
      let seq = tenantSeqMap.get(seqKey);

      if (!seq) {
        seq = {
          id: crypto.randomUUID(),
          tenantId,
          documentTypeCode: docTypeCode,
          prefix: `${docTypeCode}-${year}-`,
          year,
          nextNumber: 1,
          padding: 5,
          createdAt: new Date().toISOString(),
        };
        tenantSeqMap.set(seqKey, seq);
      }

      const currentNum = seq.nextNumber;
      seq.nextNumber += 1;

      const formattedNumber = `${seq.prefix}${String(currentNum).padStart(seq.padding, '0')}${seq.postfix || ''}`;
      return formattedNumber;
    } finally {
      releaseLock();
      this.sequenceLocks.delete(lockKey);
    }
  }

  // Check rate limit and lockout for email/IP
  public checkRateLimitAndLockout(key: string, maxAttempts = 5, lockoutDurationMs = 15 * 60 * 1000): { isLocked: boolean; remainingLockoutSec?: number } {
    const attempts = this.failedAttempts.get(key);
    if (!attempts) return { isLocked: false };

    const now = Date.now();
    if (attempts.lockoutUntil && attempts.lockoutUntil > now) {
      const remainingSec = Math.ceil((attempts.lockoutUntil - now) / 1000);
      return { isLocked: true, remainingLockoutSec: remainingSec };
    }

    if (attempts.count >= maxAttempts) {
      attempts.lockoutUntil = now + lockoutDurationMs;
      attempts.count = 0;
      return { isLocked: true, remainingLockoutSec: Math.ceil(lockoutDurationMs / 1000) };
    }

    return { isLocked: false };
  }

  public recordFailedAttempt(key: string) {
    const attempts = this.failedAttempts.get(key) || { count: 0 };
    attempts.count += 1;
    this.failedAttempts.set(key, attempts);
  }

  public clearFailedAttempts(key: string) {
    this.failedAttempts.delete(key);
  }

  private failedAttempts = new Map<string, { count: number; lockoutUntil?: number }>();
}

export const centralStore = new CentralTenantDataStore();

// ==========================================
// 6. SCOPED REPOSITORY (CENTRAL TENANT GUARD CHOKEPOINT)
// ==========================================
export class TenantScopedRepository {
  public readonly tenantId: string;
  public readonly context: TenantContext;

  constructor(context: TenantContext) {
    if (!context.tenantId) {
      throw new TenantIsolationViolationError('Tenant context is missing tenantId');
    }
    this.tenantId = context.tenantId;
    this.context = context;
  }

  // Guard: asserts target tenantId matches context tenantId
  public assertTenant(targetTenantId: string | undefined): void {
    if (!targetTenantId || targetTenantId !== this.tenantId) {
      throw new TenantIsolationViolationError(
        `Cross-tenant isolation violation detected! Attempt to access tenant ${targetTenantId} from tenant ${this.tenantId}`,
        targetTenantId,
        this.tenantId
      );
    }
  }

  // Guard: asserts caller has the specified permission
  public assertPermission(permission: string): void {
    if (this.context.isPlatformSuperAdmin) return;
    if (this.context.role === 'OWNER' || this.context.roleCode === 'OWNER') return;
    if (this.context.permissions?.includes('*') || this.context.permissions?.includes(permission)) return;
    throw new PermissionDeniedError(permission);
  }

  // Check if caller has permission without throwing
  public hasPermission(permission: string): boolean {
    if (this.context.isPlatformSuperAdmin) return true;
    if (this.context.role === 'OWNER' || this.context.roleCode === 'OWNER') return true;
    return !!(this.context.permissions?.includes('*') || this.context.permissions?.includes(permission));
  }

  // Get current tenant
  public getCompany(): CompanyTenant {
    const tenant = centralStore.tenants.get(this.tenantId);
    if (!tenant) {
      throw new TenantIsolationViolationError(`Tenant ${this.tenantId} not found`);
    }
    return tenant;
  }

  // Update current tenant
  public updateCompany(updates: Partial<CompanyTenant>): CompanyTenant {
    this.assertPermission('settings:company:manage');
    const tenant = this.getCompany();

    const allowedKeys: (keyof CompanyTenant)[] = [
      'nameAr',
      'nameEn',
      'vatNumber',
      'crNumber',
      'unifiedNumber',
      'nationalAddress',
      'phone',
      'email',
      'website',
      'logoUrl',
      'currency',
      'timezone',
      'language',
      'fiscalYearStartMonth',
      'accountingBasis',
      'vatPreference',
      'vatRatePercentage',
      'zatcaEnv',
      'onboardingStep',
      'onboardingCompleted',
    ];

    allowedKeys.forEach((key) => {
      if (updates[key] !== undefined) {
        (tenant as unknown as Record<string, unknown>)[key] = updates[key];
      }
    });
    tenant.updatedAt = new Date().toISOString();

    centralStore.recordAuditLog({
      tenantId: this.tenantId,
      userId: this.context.userId,
      userEmail: this.context.userEmail,
      ipAddress: this.context.ipAddress,
      userAgent: this.context.userAgent,
      action: 'UPDATE_COMPANY_SETTINGS',
      resourceType: 'tenants',
      resourceId: this.tenantId,
      correlationId: this.context.correlationId,
      changesDiff: { company: { before: 'previous', after: updates } },
    });

    return tenant;
  }

  // Branches
  public getBranches(): Branch[] {
    return centralStore.branches.get(this.tenantId) || [];
  }

  public createBranch(params: { code: string; nameAr: string; nameEn: string; address?: string; phone?: string }): Branch {
    this.assertPermission('settings:company:manage');
    const branches = this.getBranches();
    if (branches.some((b) => b.code.toLowerCase() === params.code.toLowerCase())) {
      throw new Error(`Branch code ${params.code} already exists in company`);
    }
    const branch: Branch = {
      id: crypto.randomUUID(),
      tenantId: this.tenantId,
      code: params.code,
      nameAr: params.nameAr,
      nameEn: params.nameEn || params.nameAr,
      isMainBranch: branches.length === 0,
      address: params.address,
      phone: params.phone,
      createdAt: new Date().toISOString(),
    };
    branches.push(branch);
    centralStore.branches.set(this.tenantId, branches);
    return branch;
  }

  // Warehouses
  public getWarehouses(): Warehouse[] {
    return centralStore.warehouses.get(this.tenantId) || [];
  }

  public getWarehouseById(id: string): Warehouse | null {
    return this.getWarehouses().find((w) => w.id === id) || null;
  }

  public createWarehouse(params: {
    branchId: string;
    code: string;
    nameAr: string;
    nameEn?: string;
    address?: string;
    managerName?: string;
    contactPhone?: string;
    isDefault?: boolean;
    bins?: Array<{ code: string; aisle?: string; rack?: string; shelf?: string }>;
  }): Warehouse {
    this.assertPermission('inventory:warehouse:manage');
    const warehouses = this.getWarehouses();
    const existing = warehouses.find((w) => w.code.toLowerCase() === params.code.trim().toLowerCase());
    if (existing) {
      throw new ConflictError(`Warehouse code "${params.code}" already exists`);
    }

    if (params.isDefault) {
      warehouses.forEach((w) => {
        w.isDefault = false;
      });
    }

    const warehouse: Warehouse = {
      id: crypto.randomUUID(),
      tenantId: this.tenantId,
      branchId: params.branchId,
      code: params.code.trim().toUpperCase(),
      nameAr: params.nameAr.trim(),
      nameEn: params.nameEn?.trim() || params.nameAr.trim(),
      address: params.address,
      managerName: params.managerName,
      contactPhone: params.contactPhone,
      isDefault: params.isDefault !== undefined ? params.isDefault : warehouses.length === 0,
      isActive: true,
      bins: params.bins?.map((b) => ({
        id: crypto.randomUUID(),
        code: b.code.trim(),
        aisle: b.aisle,
        rack: b.rack,
        shelf: b.shelf,
      })) || [],
      createdAt: new Date().toISOString(),
    };
    warehouses.push(warehouse);
    centralStore.warehouses.set(this.tenantId, warehouses);

    centralStore.recordAuditLog({
      tenantId: this.tenantId,
      userId: this.context.userId,
      userEmail: this.context.userEmail,
      ipAddress: this.context.ipAddress || '127.0.0.1',
      correlationId: this.context.correlationId || crypto.randomUUID(),
      action: 'CREATE_WAREHOUSE',
      resourceType: 'WAREHOUSE',
      resourceId: warehouse.id,
      changesDiff: { code: warehouse.code, nameAr: warehouse.nameAr },
    });

    return warehouse;
  }

  public updateWarehouse(id: string, updates: Partial<Warehouse>): Warehouse {
    this.assertPermission('inventory:warehouse:manage');
    const warehouses = this.getWarehouses();
    const warehouse = warehouses.find((w) => w.id === id);
    if (!warehouse) {
      throw new NotFoundError(`Warehouse with ID "${id}" not found`);
    }

    if (updates.code && updates.code.toLowerCase() !== warehouse.code.toLowerCase()) {
      const codeExists = warehouses.some((w) => w.id !== id && w.code.toLowerCase() === updates.code!.toLowerCase());
      if (codeExists) {
        throw new ConflictError(`Warehouse with code "${updates.code}" already exists`);
      }
      warehouse.code = updates.code.trim().toUpperCase();
    }

    if (updates.nameAr !== undefined) warehouse.nameAr = updates.nameAr;
    if (updates.nameEn !== undefined) warehouse.nameEn = updates.nameEn;
    if (updates.address !== undefined) warehouse.address = updates.address;
    if (updates.managerName !== undefined) warehouse.managerName = updates.managerName;
    if (updates.contactPhone !== undefined) warehouse.contactPhone = updates.contactPhone;
    if (updates.isActive !== undefined) warehouse.isActive = updates.isActive;
    if (updates.bins !== undefined) warehouse.bins = updates.bins;

    if (updates.isDefault === true) {
      warehouses.forEach((w) => {
        w.isDefault = w.id === id;
      });
    }

    centralStore.recordAuditLog({
      tenantId: this.tenantId,
      userId: this.context.userId,
      userEmail: this.context.userEmail,
      ipAddress: this.context.ipAddress || '127.0.0.1',
      correlationId: this.context.correlationId || crypto.randomUUID(),
      action: 'UPDATE_WAREHOUSE',
      resourceType: 'WAREHOUSE',
      resourceId: warehouse.id,
      changesDiff: updates,
    });

    return warehouse;
  }

  // --- ITEM CATEGORIES ---
  public getItemCategories(): ItemCategory[] {
    return centralStore.itemCategories.get(this.tenantId) || [];
  }

  public createItemCategory(params: {
    code: string;
    nameAr: string;
    nameEn?: string;
    parentId?: string;
    defaultTaxRate?: number;
    defaultSalesAccountId?: string;
    defaultCogsAccountId?: string;
    defaultInventoryAccountId?: string;
  }): ItemCategory {
    this.assertPermission('inventory:category:manage');
    const categories = this.getItemCategories();
    const existing = categories.find((c) => c.code.toLowerCase() === params.code.trim().toLowerCase());
    if (existing) {
      throw new ConflictError(`Item category with code "${params.code}" already exists`);
    }

    const category: ItemCategory = {
      id: crypto.randomUUID(),
      tenantId: this.tenantId,
      code: params.code.trim().toUpperCase(),
      nameAr: params.nameAr.trim(),
      nameEn: params.nameEn?.trim() || params.nameAr.trim(),
      parentId: params.parentId || null,
      defaultTaxRate: params.defaultTaxRate !== undefined ? params.defaultTaxRate : 15,
      defaultSalesAccountId: params.defaultSalesAccountId,
      defaultCogsAccountId: params.defaultCogsAccountId,
      defaultInventoryAccountId: params.defaultInventoryAccountId,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    categories.push(category);
    centralStore.itemCategories.set(this.tenantId, categories);

    centralStore.recordAuditLog({
      tenantId: this.tenantId,
      userId: this.context.userId,
      userEmail: this.context.userEmail,
      ipAddress: this.context.ipAddress || '127.0.0.1',
      correlationId: this.context.correlationId || crypto.randomUUID(),
      action: 'CREATE_ITEM_CATEGORY',
      resourceType: 'ITEM_CATEGORY',
      resourceId: category.id,
      changesDiff: { code: category.code, nameAr: category.nameAr },
    });

    return category;
  }

  public updateItemCategory(id: string, updates: Partial<ItemCategory>): ItemCategory {
    this.assertPermission('inventory:category:manage');
    const categories = this.getItemCategories();
    const category = categories.find((c) => c.id === id);
    if (!category) {
      throw new NotFoundError(`Category with ID "${id}" not found`);
    }

    if (updates.code && updates.code.toLowerCase() !== category.code.toLowerCase()) {
      const codeExists = categories.some((c) => c.id !== id && c.code.toLowerCase() === updates.code!.toLowerCase());
      if (codeExists) {
        throw new ConflictError(`Category code "${updates.code}" already exists`);
      }
      category.code = updates.code.trim().toUpperCase();
    }

    if (updates.nameAr !== undefined) category.nameAr = updates.nameAr;
    if (updates.nameEn !== undefined) category.nameEn = updates.nameEn;
    if (updates.parentId !== undefined) category.parentId = updates.parentId;
    if (updates.defaultTaxRate !== undefined) category.defaultTaxRate = updates.defaultTaxRate;
    if (updates.defaultSalesAccountId !== undefined) category.defaultSalesAccountId = updates.defaultSalesAccountId;
    if (updates.defaultCogsAccountId !== undefined) category.defaultCogsAccountId = updates.defaultCogsAccountId;
    if (updates.defaultInventoryAccountId !== undefined) category.defaultInventoryAccountId = updates.defaultInventoryAccountId;
    if (updates.isActive !== undefined) category.isActive = updates.isActive;

    return category;
  }

  // --- ITEM BRANDS ---
  public getItemBrands(): ItemBrand[] {
    return centralStore.itemBrands.get(this.tenantId) || [];
  }

  public createItemBrand(params: {
    code?: string;
    nameAr: string;
    nameEn?: string;
    countryOfOrigin?: string;
  }): ItemBrand {
    this.assertPermission('inventory:category:manage');
    const brands = this.getItemBrands();
    const code = params.code ? params.code.trim().toUpperCase() : `BRD-${(brands.length + 1).toString().padStart(3, '0')}`;
    const brand: ItemBrand = {
      id: crypto.randomUUID(),
      tenantId: this.tenantId,
      code,
      nameAr: params.nameAr.trim(),
      nameEn: params.nameEn?.trim() || params.nameAr.trim(),
      countryOfOrigin: params.countryOfOrigin,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    brands.push(brand);
    centralStore.itemBrands.set(this.tenantId, brands);
    return brand;
  }

  // --- PRODUCT MASTER (ITEMS) ---
  public getItems(filters?: {
    categoryId?: string;
    type?: string;
    search?: string;
    inStockOnly?: boolean;
    isActive?: boolean;
  }): Item[] {
    const rawItems = centralStore.items.get(this.tenantId) || [];
    let items = [...rawItems];

    if (filters?.categoryId) {
      items = items.filter((i) => i.categoryId === filters.categoryId);
    }
    if (filters?.type) {
      items = items.filter((i) => i.type === filters.type);
    }
    if (filters?.isActive !== undefined) {
      items = items.filter((i) => i.isActive === filters.isActive);
    }
    if (filters?.inStockOnly) {
      items = items.filter((i) => i.currentStock > 0);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      items = items.filter(
        (i) =>
          i.sku.toLowerCase().includes(q) ||
          i.primaryBarcode.toLowerCase().includes(q) ||
          i.nameAr.toLowerCase().includes(q) ||
          i.nameEn.toLowerCase().includes(q) ||
          i.units.some((u) => u.barcode.toLowerCase().includes(q))
      );
    }

    const canViewCost = this.context.roleCode === 'OWNER' ||
      this.context.roleCode === 'GENERAL_MANAGER' ||
      this.context.roleCode === 'CHIEF_ACCOUNTANT' ||
      this.hasPermission('accounting:cost:view');

    return scrubSensitiveFinancialFields(items, canViewCost);
  }

  public getItemById(id: string): Item | null {
    const rawItems = centralStore.items.get(this.tenantId) || [];
    const item = rawItems.find((i) => i.id === id);
    if (!item) return null;

    const canViewCost = this.context.roleCode === 'OWNER' ||
      this.context.roleCode === 'GENERAL_MANAGER' ||
      this.context.roleCode === 'CHIEF_ACCOUNTANT' ||
      this.hasPermission('accounting:cost:view');

    return scrubSensitiveFinancialFields({ ...item }, canViewCost);
  }

  public getItemBySku(sku: string): Item | null {
    const rawItems = centralStore.items.get(this.tenantId) || [];
    const item = rawItems.find((i) => i.sku.toLowerCase() === sku.trim().toLowerCase());
    if (!item) return null;

    const canViewCost = this.context.roleCode === 'OWNER' ||
      this.context.roleCode === 'GENERAL_MANAGER' ||
      this.context.roleCode === 'CHIEF_ACCOUNTANT' ||
      this.hasPermission('accounting:cost:view');

    return scrubSensitiveFinancialFields({ ...item }, canViewCost);
  }

  public createItem(params: {
    sku?: string;
    primaryBarcode?: string;
    barcodeAliases?: string[];
    nameAr: string;
    nameEn?: string;
    descriptionAr?: string;
    descriptionEn?: string;
    type?: Item['type'];
    categoryId?: string;
    brandId?: string;
    baseUnit: string;
    units: Array<{
      id?: string;
      nameAr: string;
      nameEn?: string;
      symbol?: string;
      conversionFactor: number;
      barcode: string;
      aliasBarcodes?: string[];
      isBaseUnit?: boolean;
      salePrice: number;
      wholesalePrice?: number;
      minimumSalePrice?: number;
      cost?: number;
    }>;
    taxRate?: number;
    taxExemptionReasonCode?: string;
    isVatInclusive?: boolean;
    sellingPrice: number;
    wholesalePrice?: number;
    cost?: number;
    trackBatches?: boolean;
    trackSerialNumbers?: boolean;
    trackExpiry?: boolean;
    minStockLevel?: number;
    maxStockLevel?: number;
    reorderPoint?: number;
    reorderQuantity?: number;
    salesAccountId?: string;
    cogsAccountId?: string;
    inventoryAccountId?: string;
    initialStockPerWarehouse?: Record<string, number>;
  }): Item {
    this.assertPermission('inventory:product:manage');

    const items = centralStore.items.get(this.tenantId) || [];

    // 1. Generate or validate SKU
    let sku = params.sku?.trim().toUpperCase();
    if (!sku) {
      sku = `ITM-${(items.length + 1).toString().padStart(5, '0')}`;
    } else {
      if (items.some((i) => i.sku.toLowerCase() === sku!.toLowerCase())) {
        throw new ConflictError(`Item with SKU "${sku}" already exists`);
      }
    }

    // 2. Validate Units and Base Unit (Rule I3)
    if (!params.units || params.units.length === 0) {
      throw new ValidationError('An item must have at least one unit defined (Base Unit)');
    }

    let baseUnitObj = params.units.find((u) => u.isBaseUnit || u.conversionFactor === 1.0);
    if (!baseUnitObj) {
      baseUnitObj = params.units[0];
      baseUnitObj.isBaseUnit = true;
      baseUnitObj.conversionFactor = 1.0;
    } else {
      baseUnitObj.conversionFactor = 1.0;
      baseUnitObj.isBaseUnit = true;
    }

    // 3. Barcode Identity Validation (Rule I4: primary, unit, and alias barcodes must be unique)
    const existingBarcodes = new Map<string, string>();
    items.forEach((item) => {
      if (item.primaryBarcode) existingBarcodes.set(item.primaryBarcode, item.sku);
      if (item.barcodeAliases) {
        item.barcodeAliases.forEach((alias) => existingBarcodes.set(alias, item.sku));
      }
      item.units.forEach((u) => {
        if (u.barcode) existingBarcodes.set(u.barcode, item.sku);
        if (u.aliasBarcodes) {
          u.aliasBarcodes.forEach((alias) => existingBarcodes.set(alias, item.sku));
        }
      });
    });

    const newBarcodes = new Set<string>();
    const sanitizedUnits: ItemUOM[] = params.units.map((u, index) => {
      const barcode = u.barcode?.trim() || `${sku}-${index + 1}`;
      if (existingBarcodes.has(barcode)) {
        throw new ConflictError(`Barcode "${barcode}" is already registered to item SKU "${existingBarcodes.get(barcode)}" (Rule I4 violation)`);
      }
      if (newBarcodes.has(barcode)) {
        throw new ConflictError(`Duplicate barcode "${barcode}" within item unit list`);
      }
      newBarcodes.add(barcode);

      const cleanAliases: string[] = [];
      if (u.aliasBarcodes && Array.isArray(u.aliasBarcodes)) {
        for (const alias of u.aliasBarcodes) {
          const ca = alias.trim();
          if (ca) {
            if (existingBarcodes.has(ca)) {
              throw new ConflictError(`Barcode alias "${ca}" is already registered to item SKU "${existingBarcodes.get(ca)}" (Rule I4 violation)`);
            }
            if (newBarcodes.has(ca)) {
              throw new ConflictError(`Duplicate barcode alias "${ca}" within item unit list`);
            }
            newBarcodes.add(ca);
            cleanAliases.push(ca);
          }
        }
      }

      return {
        id: u.id || crypto.randomUUID(),
        nameAr: u.nameAr.trim(),
        nameEn: u.nameEn?.trim() || u.nameAr.trim(),
        symbol: u.symbol?.trim() || u.nameAr.trim(),
        conversionFactor: u.isBaseUnit ? 1.0 : Number(u.conversionFactor),
        barcode,
        aliasBarcodes: cleanAliases.length > 0 ? cleanAliases : undefined,
        isBaseUnit: !!u.isBaseUnit,
        salePrice: Number(u.salePrice) || params.sellingPrice,
        wholesalePrice: u.wholesalePrice !== undefined ? Number(u.wholesalePrice) : params.wholesalePrice,
        minimumSalePrice: u.minimumSalePrice !== undefined ? Number(u.minimumSalePrice) : undefined,
        cost: u.cost !== undefined ? Number(u.cost) : (params.cost || 0),
      };
    });

    const primaryBarcode = params.primaryBarcode?.trim() || sanitizedUnits.find((u) => u.isBaseUnit)?.barcode || sanitizedUnits[0].barcode;

    const cleanItemAliases: string[] = [];
    if (params.barcodeAliases && Array.isArray(params.barcodeAliases)) {
      for (const alias of params.barcodeAliases) {
        const ca = alias.trim();
        if (ca) {
          if (existingBarcodes.has(ca)) {
            throw new ConflictError(`Barcode alias "${ca}" is already registered to item SKU "${existingBarcodes.get(ca)}" (Rule I4 violation)`);
          }
          if (newBarcodes.has(ca)) {
            throw new ConflictError(`Duplicate barcode alias "${ca}"`);
          }
          newBarcodes.add(ca);
          cleanItemAliases.push(ca);
        }
      }
    }

    let categoryNameAr: string | undefined;
    if (params.categoryId) {
      const cat = this.getItemCategories().find((c) => c.id === params.categoryId);
      if (cat) categoryNameAr = cat.nameAr;
    }

    let brandName: string | undefined;
    if (params.brandId) {
      const brd = this.getItemBrands().find((b) => b.id === params.brandId);
      if (brd) brandName = brd.nameAr;
    }

    const standardCost = Number(params.cost) || 0;
    const initialWac = standardCost;
    let initialTotalStock = 0;

    const itemId = crypto.randomUUID();

    // 4. Multi-Warehouse Stock Initialization
    const currentStocks = centralStore.warehouseStocks.get(this.tenantId) || [];
    const warehouses = this.getWarehouses();

    warehouses.forEach((wh) => {
      const initialQty = params.initialStockPerWarehouse?.[wh.id] || 0;
      initialTotalStock += initialQty;

      currentStocks.push({
        id: crypto.randomUUID(),
        tenantId: this.tenantId,
        warehouseId: wh.id,
        itemId,
        currentStockBaseQty: initialQty,
        reservedQty: 0,
        availableQty: initialQty,
        binLocation: wh.bins?.[0]?.code,
        currentWac: initialWac,
        lastReceiptDate: initialQty > 0 ? new Date().toISOString().split('T')[0] : undefined,
        updatedAt: new Date().toISOString(),
      });
    });
    centralStore.warehouseStocks.set(this.tenantId, currentStocks);

    const item: Item = {
      id: itemId,
      tenantId: this.tenantId,
      sku,
      primaryBarcode,
      barcodeAliases: cleanItemAliases.length > 0 ? cleanItemAliases : undefined,
      nameAr: params.nameAr.trim(),
      nameEn: params.nameEn?.trim() || params.nameAr.trim(),
      descriptionAr: params.descriptionAr,
      descriptionEn: params.descriptionEn,
      type: params.type || 'INVENTORY',
      categoryId: params.categoryId,
      categoryNameAr,
      brandId: params.brandId,
      brandName,
      baseUnit: params.baseUnit.trim(),
      units: sanitizedUnits,
      taxRate: params.taxRate !== undefined ? params.taxRate : 15,
      taxExemptionReasonCode: params.taxExemptionReasonCode,
      isVatInclusive: !!params.isVatInclusive,
      sellingPrice: Number(params.sellingPrice),
      wholesalePrice: params.wholesalePrice !== undefined ? Number(params.wholesalePrice) : undefined,
      cost: standardCost,
      currentWac: initialWac,
      trackBatches: !!params.trackBatches,
      trackSerialNumbers: !!params.trackSerialNumbers,
      trackExpiry: !!params.trackExpiry,
      minStockLevel: params.minStockLevel || 0,
      maxStockLevel: params.maxStockLevel || 10000,
      reorderPoint: params.reorderPoint || 0,
      reorderQuantity: params.reorderQuantity || 0,
      salesAccountId: params.salesAccountId,
      cogsAccountId: params.cogsAccountId,
      inventoryAccountId: params.inventoryAccountId,
      isActive: true,
      currentStock: initialTotalStock,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    items.push(item);
    centralStore.items.set(this.tenantId, items);

    // Record initial price history
    const historyList = centralStore.itemPriceHistory.get(item.id) || [];
    historyList.push({
      id: crypto.randomUUID(),
      tenantId: this.tenantId,
      itemId: item.id,
      oldPrice: 0,
      newPrice: item.sellingPrice,
      changeType: 'DEFAULT_UNIT_PRICE',
      reason: 'Initial item master creation',
      userId: this.context.userId,
      userEmail: this.context.userEmail,
      changedBy: this.context.userEmail,
      timestamp: new Date().toISOString(),
    });
    sanitizedUnits.forEach((u) => {
      if (!u.isBaseUnit) {
        historyList.push({
          id: crypto.randomUUID(),
          tenantId: this.tenantId,
          itemId: item.id,
          unitId: u.id,
          unitNameAr: u.nameAr,
          oldPrice: 0,
          newPrice: u.salePrice,
          changeType: 'DEFAULT_UNIT_PRICE',
          reason: `Initial unit price for ${u.nameAr}`,
          userId: this.context.userId,
          userEmail: this.context.userEmail,
          changedBy: this.context.userEmail,
          timestamp: new Date().toISOString(),
        });
      }
    });
    centralStore.itemPriceHistory.set(item.id, historyList);

    centralStore.recordAuditLog({
      tenantId: this.tenantId,
      userId: this.context.userId,
      userEmail: this.context.userEmail,
      ipAddress: this.context.ipAddress || '127.0.0.1',
      correlationId: this.context.correlationId || crypto.randomUUID(),
      action: 'CREATE_PRODUCT_MASTER',
      resourceType: 'ITEM',
      resourceId: item.id,
      changesDiff: { sku: item.sku, nameAr: item.nameAr, baseUnit: item.baseUnit, unitsCount: sanitizedUnits.length },
    });

    return item;
  }

  public updateItem(id: string, updates: Partial<Item>): Item {
    this.assertPermission('inventory:product:manage');
    const items = centralStore.items.get(this.tenantId) || [];
    const item = items.find((i) => i.id === id);
    if (!item) {
      throw new NotFoundError(`Item with ID "${id}" not found`);
    }

    if (updates.sku && updates.sku.toLowerCase() !== item.sku.toLowerCase()) {
      const exists = items.some((i) => i.id !== id && i.sku.toLowerCase() === updates.sku!.toLowerCase());
      if (exists) {
        throw new ConflictError(`Item with SKU "${updates.sku}" already exists`);
      }
      item.sku = updates.sku.trim().toUpperCase();
    }

    if (updates.units) {
      const otherItems = items.filter((i) => i.id !== id);
      const existingBarcodes = new Map<string, string>();
      otherItems.forEach((oi) => {
        if (oi.primaryBarcode) existingBarcodes.set(oi.primaryBarcode, oi.sku);
        if (oi.barcodeAliases) {
          oi.barcodeAliases.forEach((a) => existingBarcodes.set(a, oi.sku));
        }
        oi.units.forEach((u) => {
          if (u.barcode) existingBarcodes.set(u.barcode, oi.sku);
          if (u.aliasBarcodes) {
            u.aliasBarcodes.forEach((a) => existingBarcodes.set(a, oi.sku));
          }
        });
      });

      updates.units.forEach((u) => {
        if (existingBarcodes.has(u.barcode)) {
          throw new ConflictError(`Barcode "${u.barcode}" is already taken by item SKU "${existingBarcodes.get(u.barcode)}"`);
        }
        if (u.aliasBarcodes) {
          u.aliasBarcodes.forEach((a) => {
            if (existingBarcodes.has(a)) {
              throw new ConflictError(`Barcode alias "${a}" is already taken by item SKU "${existingBarcodes.get(a)}"`);
            }
          });
        }
      });

      // Track unit price modifications
      const historyList = centralStore.itemPriceHistory.get(item.id) || [];
      updates.units.forEach((newU) => {
        const oldU = item.units.find((u) => u.id === newU.id || u.nameAr === newU.nameAr);
        if (oldU && oldU.salePrice !== newU.salePrice) {
          historyList.push({
            id: crypto.randomUUID(),
            tenantId: this.tenantId,
            itemId: item.id,
            unitId: newU.id,
            unitNameAr: newU.nameAr,
            oldPrice: oldU.salePrice,
            newPrice: newU.salePrice,
            changeType: 'DEFAULT_UNIT_PRICE',
            reason: `Updated unit price for ${newU.nameAr}`,
            userId: this.context.userId,
            userEmail: this.context.userEmail,
            timestamp: new Date().toISOString(),
          });
        }
      });
      centralStore.itemPriceHistory.set(item.id, historyList);

      item.units = updates.units;
    }

    if (updates.sellingPrice !== undefined && updates.sellingPrice !== item.sellingPrice) {
      const historyList = centralStore.itemPriceHistory.get(item.id) || [];
      historyList.push({
        id: crypto.randomUUID(),
        tenantId: this.tenantId,
        itemId: item.id,
        oldPrice: item.sellingPrice,
        newPrice: updates.sellingPrice,
        changeType: 'DEFAULT_UNIT_PRICE',
        reason: 'Base selling price updated',
        userId: this.context.userId,
        userEmail: this.context.userEmail,
        changedBy: this.context.userEmail,
        timestamp: new Date().toISOString(),
      });
      centralStore.itemPriceHistory.set(item.id, historyList);
      item.sellingPrice = updates.sellingPrice;
    }

    if (updates.nameAr !== undefined) item.nameAr = updates.nameAr;
    if (updates.nameEn !== undefined) item.nameEn = updates.nameEn;
    if (updates.descriptionAr !== undefined) item.descriptionAr = updates.descriptionAr;
    if (updates.descriptionEn !== undefined) item.descriptionEn = updates.descriptionEn;
    if (updates.type !== undefined) item.type = updates.type;
    if (updates.categoryId !== undefined) {
      item.categoryId = updates.categoryId;
      const cat = this.getItemCategories().find((c) => c.id === updates.categoryId);
      item.categoryNameAr = cat?.nameAr;
    }
    if (updates.brandId !== undefined) {
      item.brandId = updates.brandId;
      const brd = this.getItemBrands().find((b) => b.id === updates.brandId);
      item.brandName = brd?.nameAr;
    }
    if (updates.baseUnit !== undefined) item.baseUnit = updates.baseUnit;
    if (updates.primaryBarcode !== undefined) item.primaryBarcode = updates.primaryBarcode;
    if (updates.barcodeAliases !== undefined) item.barcodeAliases = updates.barcodeAliases;
    if (updates.taxRate !== undefined) item.taxRate = updates.taxRate;
    if (updates.taxExemptionReasonCode !== undefined) item.taxExemptionReasonCode = updates.taxExemptionReasonCode;
    if (updates.isVatInclusive !== undefined) item.isVatInclusive = updates.isVatInclusive;
    if (updates.wholesalePrice !== undefined) item.wholesalePrice = updates.wholesalePrice;
    if (updates.cost !== undefined) item.cost = updates.cost;
    if (updates.trackBatches !== undefined) item.trackBatches = updates.trackBatches;
    if (updates.trackSerialNumbers !== undefined) item.trackSerialNumbers = updates.trackSerialNumbers;
    if (updates.trackExpiry !== undefined) item.trackExpiry = updates.trackExpiry;
    if (updates.minStockLevel !== undefined) item.minStockLevel = updates.minStockLevel;
    if (updates.maxStockLevel !== undefined) item.maxStockLevel = updates.maxStockLevel;
    if (updates.reorderPoint !== undefined) item.reorderPoint = updates.reorderPoint;
    if (updates.reorderQuantity !== undefined) item.reorderQuantity = updates.reorderQuantity;
    if (updates.salesAccountId !== undefined) item.salesAccountId = updates.salesAccountId;
    if (updates.cogsAccountId !== undefined) item.cogsAccountId = updates.cogsAccountId;
    if (updates.inventoryAccountId !== undefined) item.inventoryAccountId = updates.inventoryAccountId;
    if (updates.isActive !== undefined) item.isActive = updates.isActive;
    item.updatedAt = new Date().toISOString();

    centralStore.recordAuditLog({
      tenantId: this.tenantId,
      userId: this.context.userId,
      userEmail: this.context.userEmail,
      ipAddress: this.context.ipAddress || '127.0.0.1',
      correlationId: this.context.correlationId || crypto.randomUUID(),
      action: 'UPDATE_PRODUCT_MASTER',
      resourceType: 'ITEM',
      resourceId: item.id,
      changesDiff: updates,
    });

    return item;
  }

  // Helper: check if caller can view sensitive cost/margin data
  public canUserViewCost(): boolean {
    const role = this.context.roleCode || this.context.role;
    return (
      role === 'OWNER' ||
      role === 'GENERAL_MANAGER' ||
      role === 'CHIEF_ACCOUNTANT' ||
      this.hasPermission('accounting:cost:view')
    );
  }

  // Barcode Resolution (Rule I4: barcode strictly resolves to (Item, Unit) tuple)
  public resolveBarcode(barcode: string): {
    item: Item;
    unit: ItemUOM;
    currentStockInUnit: number;
    salePrice: number;
    vatAmount: number;
    salePriceInclusive: number;
  } | null {
    const cleanBarcode = barcode.trim();
    if (!cleanBarcode) return null;

    const items = centralStore.items.get(this.tenantId) || [];

    for (const item of items) {
      for (const unit of item.units) {
        const isMatched =
          unit.barcode === cleanBarcode ||
          (unit.aliasBarcodes && unit.aliasBarcodes.includes(cleanBarcode)) ||
          (item.primaryBarcode === cleanBarcode && unit.isBaseUnit) ||
          (item.barcodeAliases && item.barcodeAliases.includes(cleanBarcode) && unit.isBaseUnit);

        if (isMatched) {
          const factor = unit.conversionFactor || 1.0;
          const currentStockInUnit = Math.floor((item.currentStock / factor) * 100) / 100;
          const salePrice = unit.salePrice || item.sellingPrice;
          const taxRate = item.taxRate || 15;
          const vatAmount = Math.round(((salePrice * (taxRate / 100)) + Number.EPSILON) * 100) / 100;
          const salePriceInclusive = Math.round((salePrice + vatAmount + Number.EPSILON) * 100) / 100;

          const canViewCost = this.canUserViewCost();

          return {
            item: scrubSensitiveFinancialFields({ ...item }, canViewCost),
            unit: scrubSensitiveFinancialFields({ ...unit }, canViewCost),
            currentStockInUnit,
            salePrice,
            vatAmount,
            salePriceInclusive,
          };
        }
      }
    }
    return null;
  }

  // =========================================================================
  // UNITS CATALOG (PCE, BOX, CTN, KG, GRM, LTR, MTR, PCK, DZN, PLT)
  // =========================================================================
  public getUnitsCatalog(): GlobalUnit[] {
    return centralStore.unitsCatalog.get(this.tenantId) || [];
  }

  public createGlobalUnit(params: {
    code: string;
    nameAr: string;
    nameEn?: string;
    symbolAr?: string;
    symbolEn?: string;
    category?: GlobalUnit['category'];
  }): GlobalUnit {
    this.assertPermission('inventory:unit:manage');
    const catalog = centralStore.unitsCatalog.get(this.tenantId) || [];
    const code = params.code.trim().toUpperCase();

    if (catalog.some((u) => u.code === code)) {
      throw new ConflictError(`Unit code "${code}" already exists in catalog`);
    }

    const unit: GlobalUnit = {
      id: crypto.randomUUID(),
      tenantId: this.tenantId,
      code,
      nameAr: params.nameAr.trim(),
      nameEn: params.nameEn?.trim() || params.nameAr.trim(),
      symbolAr: params.symbolAr?.trim() || params.nameAr.trim(),
      symbolEn: params.symbolEn?.trim() || params.nameEn?.trim() || code,
      category: params.category || 'COUNT',
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    catalog.push(unit);
    centralStore.unitsCatalog.set(this.tenantId, catalog);
    return unit;
  }

  public updateGlobalUnit(id: string, updates: Partial<GlobalUnit>): GlobalUnit {
    this.assertPermission('inventory:unit:manage');
    const catalog = centralStore.unitsCatalog.get(this.tenantId) || [];
    const unit = catalog.find((u) => u.id === id);
    if (!unit) {
      throw new NotFoundError(`Unit with ID "${id}" not found`);
    }

    if (updates.code && updates.code.toUpperCase() !== unit.code) {
      const code = updates.code.trim().toUpperCase();
      if (catalog.some((u) => u.id !== id && u.code === code)) {
        throw new ConflictError(`Unit code "${code}" already exists`);
      }
      unit.code = code;
    }

    if (updates.nameAr !== undefined) unit.nameAr = updates.nameAr.trim();
    if (updates.nameEn !== undefined) unit.nameEn = updates.nameEn.trim();
    if (updates.symbolAr !== undefined) unit.symbolAr = updates.symbolAr.trim();
    if (updates.symbolEn !== undefined) unit.symbolEn = updates.symbolEn.trim();
    if (updates.category !== undefined) unit.category = updates.category;
    if (updates.isActive !== undefined) unit.isActive = updates.isActive;

    return unit;
  }

  // =========================================================================
  // CUSTOMER-SPECIFIC PRICING RULES & PROMOTIONS
  // =========================================================================
  public getCustomerPriceRules(customerId?: string, itemId?: string): CustomerPriceRule[] {
    const rules = centralStore.customerPriceRules.get(this.tenantId) || [];
    let filtered = [...rules];
    if (customerId) {
      filtered = filtered.filter((r) => r.customerId === customerId);
    }
    if (itemId) {
      filtered = filtered.filter((r) => r.itemId === itemId);
    }
    return filtered;
  }

  public createCustomerPriceRule(params: {
    customerId: string;
    itemId: string;
    unitId?: string;
    unitPrice: number;
    discountPercentage?: number;
    minQuantity?: number;
    startDate?: string;
    endDate?: string;
  }): CustomerPriceRule {
    this.assertPermission('pricing:rule:manage');
    const rules = centralStore.customerPriceRules.get(this.tenantId) || [];
    const customers = centralStore.customers.get(this.tenantId) || [];
    const items = centralStore.items.get(this.tenantId) || [];

    const customer = customers.find((c) => c.id === params.customerId);
    if (!customer) {
      throw new NotFoundError(`Customer with ID "${params.customerId}" not found`);
    }

    const item = items.find((i) => i.id === params.itemId);
    if (!item) {
      throw new NotFoundError(`Item with ID "${params.itemId}" not found`);
    }

    let unitNameAr: string | undefined;
    if (params.unitId) {
      const unit = item.units.find((u) => u.id === params.unitId);
      if (unit) unitNameAr = unit.nameAr;
    }

    const rule: CustomerPriceRule = {
      id: crypto.randomUUID(),
      tenantId: this.tenantId,
      customerId: params.customerId,
      customerNameAr: customer.nameAr,
      itemId: params.itemId,
      itemSku: item.sku,
      itemNameAr: item.nameAr,
      unitId: params.unitId,
      unitNameAr,
      unitPrice: Number(params.unitPrice),
      discountPercentage: params.discountPercentage !== undefined ? Number(params.discountPercentage) : undefined,
      minQuantity: params.minQuantity !== undefined ? Number(params.minQuantity) : 1,
      startDate: params.startDate,
      endDate: params.endDate,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    rules.push(rule);
    centralStore.customerPriceRules.set(this.tenantId, rules);

    // Record price history
    const historyList = centralStore.itemPriceHistory.get(item.id) || [];
    historyList.push({
      id: crypto.randomUUID(),
      tenantId: this.tenantId,
      itemId: item.id,
      unitId: params.unitId,
      unitNameAr,
      oldPrice: item.sellingPrice,
      newPrice: rule.unitPrice,
      changeType: 'CUSTOMER_PRICE',
      reason: `Special pricing rule configured for customer: ${customer.nameAr}`,
      userId: this.context.userId,
      userEmail: this.context.userEmail,
      timestamp: new Date().toISOString(),
    });
    centralStore.itemPriceHistory.set(item.id, historyList);

    centralStore.recordAuditLog({
      tenantId: this.tenantId,
      userId: this.context.userId,
      userEmail: this.context.userEmail,
      ipAddress: this.context.ipAddress || '127.0.0.1',
      correlationId: this.context.correlationId || crypto.randomUUID(),
      action: 'CREATE_CUSTOMER_PRICE_RULE',
      resourceType: 'PRICE_RULE',
      resourceId: rule.id,
      changesDiff: { customerId: params.customerId, itemId: params.itemId, price: rule.unitPrice },
    });

    return rule;
  }

  public updateCustomerPriceRule(id: string, updates: Partial<CustomerPriceRule>): CustomerPriceRule {
    this.assertPermission('pricing:rule:manage');
    const rules = centralStore.customerPriceRules.get(this.tenantId) || [];
    const rule = rules.find((r) => r.id === id);
    if (!rule) {
      throw new NotFoundError(`Pricing rule with ID "${id}" not found`);
    }

    if (updates.unitPrice !== undefined) rule.unitPrice = Number(updates.unitPrice);
    if (updates.discountPercentage !== undefined) rule.discountPercentage = updates.discountPercentage;
    if (updates.minQuantity !== undefined) rule.minQuantity = updates.minQuantity;
    if (updates.startDate !== undefined) rule.startDate = updates.startDate;
    if (updates.endDate !== undefined) rule.endDate = updates.endDate;
    if (updates.isActive !== undefined) rule.isActive = updates.isActive;
    rule.updatedAt = new Date().toISOString();

    return rule;
  }

  public deleteCustomerPriceRule(id: string): boolean {
    this.assertPermission('pricing:rule:manage');
    const rules = centralStore.customerPriceRules.get(this.tenantId) || [];
    const idx = rules.findIndex((r) => r.id === id);
    if (idx === -1) {
      throw new NotFoundError(`Pricing rule with ID "${id}" not found`);
    }
    rules.splice(idx, 1);
    centralStore.customerPriceRules.set(this.tenantId, rules);
    return true;
  }

  // =========================================================================
  // PRICE AUDIT HISTORY
  // =========================================================================
  public getItemPriceHistory(itemId: string): PriceHistoryRecord[] {
    return centralStore.itemPriceHistory.get(itemId) || [];
  }

  // =========================================================================
  // RESOLVE ITEM PRICE (Hierarchy: Override > Customer Rule > Price List > Default Unit Price)
  // =========================================================================
  public resolveItemPrice(params: {
    customerId?: string;
    customerGroup?: string;
    priceList?: string;
    itemId: string;
    unitId?: string;
    quantity?: number;
    manualOverridePrice?: number;
  }): {
    source: 'MANUAL_OVERRIDE' | 'CUSTOMER_RULE' | 'PRICE_LIST' | 'DEFAULT_UNIT_PRICE' | 'BASE_PRICE';
    appliedSource?: 'MANUAL_OVERRIDE' | 'CUSTOMER_RULE' | 'PRICE_LIST' | 'DEFAULT_UNIT_PRICE' | 'BASE_PRICE';
    unitPrice: number;
    netUnitPrice?: number;
    originalPrice: number;
    discountPercentage: number;
    discountAmount?: number;
    appliedRuleId?: string;
    appliedRuleDescription?: string;
    vatRate: number;
    taxRate?: number;
    vatAmount: number;
    unitPriceWithVat: number;
    totalAmount: number;
    lineSubtotal?: number;
    totalAmountWithVat: number;
  } {
    const items = centralStore.items.get(this.tenantId) || [];
    const item = items.find((i) => i.id === params.itemId);
    if (!item) {
      throw new NotFoundError(`Item with ID "${params.itemId}" not found`);
    }

    const qty = params.quantity !== undefined && params.quantity > 0 ? params.quantity : 1;
    const unit = params.unitId
      ? item.units.find((u) => u.id === params.unitId) || item.units.find((u) => u.isBaseUnit) || item.units[0]
      : item.units.find((u) => u.isBaseUnit) || item.units[0];

    const defaultUnitPrice = unit ? (unit.salePrice || item.sellingPrice) : item.sellingPrice;
    const vatRate = item.taxRate !== undefined ? item.taxRate : 15;

    // 1. Check for manual override
    if (params.manualOverridePrice !== undefined && params.manualOverridePrice >= 0) {
      const unitPrice = Number(params.manualOverridePrice);
      const discountPercentage = defaultUnitPrice > 0 && unitPrice < defaultUnitPrice
        ? Math.round(((defaultUnitPrice - unitPrice) / defaultUnitPrice) * 10000) / 100
        : 0;

      const discountAmount = defaultUnitPrice > unitPrice ? Math.round((defaultUnitPrice - unitPrice + Number.EPSILON) * 100) / 100 : 0;
      const vatAmount = Math.round(((unitPrice * (vatRate / 100)) + Number.EPSILON) * 100) / 100;
      const unitPriceWithVat = Math.round((unitPrice + vatAmount + Number.EPSILON) * 100) / 100;
      const totalAmount = Math.round((unitPrice * qty + Number.EPSILON) * 100) / 100;
      const totalAmountWithVat = Math.round((unitPriceWithVat * qty + Number.EPSILON) * 100) / 100;

      return {
        source: 'MANUAL_OVERRIDE',
        appliedSource: 'MANUAL_OVERRIDE',
        unitPrice,
        netUnitPrice: unitPrice,
        originalPrice: defaultUnitPrice,
        discountPercentage,
        discountAmount,
        appliedRuleDescription: 'تعديل يدوي مباشر للسعر (Manual Override)',
        vatRate,
        taxRate: vatRate,
        vatAmount,
        unitPriceWithVat,
        totalAmount,
        lineSubtotal: totalAmount,
        totalAmountWithVat,
      };
    }

    // 2. Check for customer-specific rule
    if (params.customerId) {
      const rules = centralStore.customerPriceRules.get(this.tenantId) || [];
      const now = new Date().toISOString().split('T')[0];

      const matchingRule = rules.find((r) => {
        if (!r.isActive) return false;
        if (r.customerId !== params.customerId) return false;
        if (r.itemId !== params.itemId) return false;
        if (r.unitId && unit && r.unitId !== unit.id) return false;
        if (r.minQuantity && qty < r.minQuantity) return false;
        if (r.startDate && r.startDate > now) return false;
        if (r.endDate && r.endDate < now) return false;
        return true;
      });

      if (matchingRule) {
        let unitPrice = matchingRule.unitPrice;
        let discountPercentage = matchingRule.discountPercentage || 0;
        let discountAmount = 0;

        if (matchingRule.discountPercentage && matchingRule.discountPercentage > 0) {
          discountAmount = Math.round(((unitPrice * (matchingRule.discountPercentage / 100)) + Number.EPSILON) * 100) / 100;
          unitPrice = Math.round((unitPrice - discountAmount + Number.EPSILON) * 100) / 100;
        } else if (defaultUnitPrice > 0 && unitPrice < defaultUnitPrice) {
          discountAmount = Math.round((defaultUnitPrice - unitPrice + Number.EPSILON) * 100) / 100;
          discountPercentage = Math.round(((defaultUnitPrice - unitPrice) / defaultUnitPrice) * 10000) / 100;
        }

        const vatAmount = Math.round(((unitPrice * (vatRate / 100)) + Number.EPSILON) * 100) / 100;
        const unitPriceWithVat = Math.round((unitPrice + vatAmount + Number.EPSILON) * 100) / 100;
        const totalAmount = Math.round((unitPrice * qty + Number.EPSILON) * 100) / 100;
        const totalAmountWithVat = Math.round((unitPriceWithVat * qty + Number.EPSILON) * 100) / 100;

        return {
          source: 'CUSTOMER_RULE',
          appliedSource: 'CUSTOMER_RULE',
          unitPrice: matchingRule.unitPrice,
          netUnitPrice: unitPrice,
          originalPrice: defaultUnitPrice,
          discountPercentage,
          discountAmount,
          appliedRuleId: matchingRule.id,
          appliedRuleDescription: `سعر خاص للعميل (${matchingRule.customerNameAr || 'عميل'})`,
          vatRate,
          taxRate: vatRate,
          vatAmount,
          unitPriceWithVat,
          totalAmount,
          lineSubtotal: totalAmount,
          totalAmountWithVat,
        };
      }
    }

    // 3. Check for price list (e.g. WHOLESALE)
    const priceList = params.priceList || (params.customerId ? (centralStore.customers.get(this.tenantId)?.find((c) => c.id === params.customerId)?.priceList) : undefined);
    if (priceList === 'WHOLESALE' && (unit?.wholesalePrice || item.wholesalePrice)) {
      const wholesalePrice = unit?.wholesalePrice || item.wholesalePrice || defaultUnitPrice;
      const discountPercentage = defaultUnitPrice > 0 && wholesalePrice < defaultUnitPrice
        ? Math.round(((defaultUnitPrice - wholesalePrice) / defaultUnitPrice) * 10000) / 100
        : 0;
      const discountAmount = defaultUnitPrice > wholesalePrice ? Math.round((defaultUnitPrice - wholesalePrice + Number.EPSILON) * 100) / 100 : 0;

      const vatAmount = Math.round(((wholesalePrice * (vatRate / 100)) + Number.EPSILON) * 100) / 100;
      const unitPriceWithVat = Math.round((wholesalePrice + vatAmount + Number.EPSILON) * 100) / 100;
      const totalAmount = Math.round((wholesalePrice * qty + Number.EPSILON) * 100) / 100;
      const totalAmountWithVat = Math.round((unitPriceWithVat * qty + Number.EPSILON) * 100) / 100;

      return {
        source: 'PRICE_LIST',
        appliedSource: 'PRICE_LIST',
        unitPrice: wholesalePrice,
        netUnitPrice: wholesalePrice,
        originalPrice: defaultUnitPrice,
        discountPercentage,
        discountAmount,
        appliedRuleDescription: 'قائمة أسعار الجملة (Wholesale Price List)',
        vatRate,
        taxRate: vatRate,
        vatAmount,
        unitPriceWithVat,
        totalAmount,
        lineSubtotal: totalAmount,
        totalAmountWithVat,
      };
    }

    // 4. Default Unit Price
    const finalPrice = defaultUnitPrice;
    const vatAmount = Math.round(((finalPrice * (vatRate / 100)) + Number.EPSILON) * 100) / 100;
    const unitPriceWithVat = Math.round((finalPrice + vatAmount + Number.EPSILON) * 100) / 100;
    const totalAmount = Math.round((finalPrice * qty + Number.EPSILON) * 100) / 100;
    const totalAmountWithVat = Math.round((unitPriceWithVat * qty + Number.EPSILON) * 100) / 100;

    const appliedSource = unit ? 'DEFAULT_UNIT_PRICE' : 'BASE_PRICE';
    return {
      source: appliedSource,
      appliedSource,
      unitPrice: finalPrice,
      netUnitPrice: finalPrice,
      originalPrice: finalPrice,
      discountPercentage: 0,
      discountAmount: 0,
      appliedRuleDescription: unit ? `السعر الافتراضي للوحدة (${unit.nameAr})` : 'السعر الافتراضي للصنف',
      vatRate,
      taxRate: vatRate,
      vatAmount,
      unitPriceWithVat,
      totalAmount,
      lineSubtotal: totalAmount,
      totalAmountWithVat,
    };
  }

  // =========================================================================
  // FAST ITEM SEARCH (Indexed & Sub-300ms for large catalogs)
  // =========================================================================
  public searchItems(query: string, options?: { categoryId?: string; limit?: number }): Item[] {
    const cleanQ = query.trim().toLowerCase();
    const items = centralStore.items.get(this.tenantId) || [];
    const limit = options?.limit || 50;
    const canViewCost = this.canUserViewCost();

    if (!cleanQ) {
      let result = items;
      if (options?.categoryId) {
        result = result.filter((i) => i.categoryId === options.categoryId);
      }
      return scrubSensitiveFinancialFields(result.slice(0, limit), canViewCost);
    }

    const matched: Item[] = [];
    for (const item of items) {
      if (options?.categoryId && item.categoryId !== options.categoryId) {
        continue;
      }

      // Check SKU (instant hit)
      if (item.sku.toLowerCase().includes(cleanQ)) {
        matched.push(item);
        if (matched.length >= limit) break;
        continue;
      }

      // Check primary barcode & aliases
      if (item.primaryBarcode?.toLowerCase().includes(cleanQ)) {
        matched.push(item);
        if (matched.length >= limit) break;
        continue;
      }

      if (item.barcodeAliases?.some((a) => a.toLowerCase().includes(cleanQ))) {
        matched.push(item);
        if (matched.length >= limit) break;
        continue;
      }

      // Check unit barcodes & unit alias barcodes
      const unitMatch = item.units.some(
        (u) => u.barcode?.toLowerCase().includes(cleanQ) || u.aliasBarcodes?.some((a) => a.toLowerCase().includes(cleanQ))
      );
      if (unitMatch) {
        matched.push(item);
        if (matched.length >= limit) break;
        continue;
      }

      // Check names
      if (item.nameAr.toLowerCase().includes(cleanQ) || (item.nameEn && item.nameEn.toLowerCase().includes(cleanQ))) {
        matched.push(item);
        if (matched.length >= limit) break;
        continue;
      }
    }

    return scrubSensitiveFinancialFields(matched, canViewCost);
  }

  // Multi-Warehouse Stocks
  public getWarehouseStocks(warehouseId?: string, itemId?: string): WarehouseStock[] {
    const stocks = centralStore.warehouseStocks.get(this.tenantId) || [];
    let filtered = [...stocks];
    if (warehouseId) {
      filtered = filtered.filter((s) => s.warehouseId === warehouseId);
    }
    if (itemId) {
      filtered = filtered.filter((s) => s.itemId === itemId);
    }
    const canViewCost = this.canUserViewCost();

    return scrubSensitiveFinancialFields(filtered, canViewCost);
  }

  public getWarehouseStockSummary(): Array<{
    itemId: string;
    sku: string;
    nameAr: string;
    nameEn: string;
    baseUnit: string;
    totalStockBaseQty: number;
    totalValuationSar: number;
    currentWac: number;
    warehouses: Array<{
      warehouseId: string;
      warehouseCode: string;
      warehouseNameAr: string;
      baseQty: number;
      availableQty: number;
      reservedQty: number;
      binLocation?: string;
    }>;
  }> {
    const items = centralStore.items.get(this.tenantId) || [];
    const stocks = centralStore.warehouseStocks.get(this.tenantId) || [];
    const warehouses = this.getWarehouses();

    const canViewCost = this.canUserViewCost();

    const summary = items.map((item) => {
      const itemStocks = stocks.filter((s) => s.itemId === item.id);
      const totalBaseQty = itemStocks.reduce((sum, s) => sum + s.currentStockBaseQty, 0);
      const totalValuation = Math.round(totalBaseQty * (item.currentWac || 0) * 100) / 100;

      const whList = warehouses.map((wh) => {
        const stockRecord = itemStocks.find((s) => s.warehouseId === wh.id);
        return {
          warehouseId: wh.id,
          warehouseCode: wh.code,
          warehouseNameAr: wh.nameAr,
          baseQty: stockRecord ? stockRecord.currentStockBaseQty : 0,
          availableQty: stockRecord ? stockRecord.availableQty : 0,
          reservedQty: stockRecord ? stockRecord.reservedQty : 0,
          binLocation: stockRecord?.binLocation,
        };
      });

      return {
        itemId: item.id,
        sku: item.sku,
        nameAr: item.nameAr,
        nameEn: item.nameEn,
        baseUnit: item.baseUnit,
        totalStockBaseQty: totalBaseQty,
        totalValuationSar: totalValuation,
        currentWac: item.currentWac || 0,
        warehouses: whList,
      };
    });

    return scrubSensitiveFinancialFields(summary, canViewCost);
  }

  // Cashboxes
  public getCashboxes(): Cashbox[] {
    return centralStore.cashboxes.get(this.tenantId) || [];
  }

  public createCashbox(params: { branchId: string; code: string; nameAr: string; nameEn: string; glAccountId: string }): Cashbox {
    this.assertPermission('treasury:vault:manage');
    const cashboxes = this.getCashboxes();
    const cashbox: Cashbox = {
      id: crypto.randomUUID(),
      tenantId: this.tenantId,
      branchId: params.branchId,
      code: params.code,
      nameAr: params.nameAr,
      nameEn: params.nameEn || params.nameAr,
      glAccountId: params.glAccountId,
      isDefault: cashboxes.length === 0,
      createdAt: new Date().toISOString(),
    };
    cashboxes.push(cashbox);
    centralStore.cashboxes.set(this.tenantId, cashboxes);
    return cashbox;
  }

  // Bank Accounts
  public getBankAccounts(): BankAccount[] {
    return centralStore.bankAccounts.get(this.tenantId) || [];
  }

  public createBankAccount(params: { bankNameAr: string; bankNameEn: string; accountNumber: string; iban: string; swiftCode?: string; glAccountId: string }): BankAccount {
    this.assertPermission('treasury:bank:manage');
    const bankAccounts = this.getBankAccounts();
    const bank: BankAccount = {
      id: crypto.randomUUID(),
      tenantId: this.tenantId,
      bankNameAr: params.bankNameAr,
      bankNameEn: params.bankNameEn || params.bankNameAr,
      accountNumber: params.accountNumber,
      iban: params.iban,
      swiftCode: params.swiftCode,
      glAccountId: params.glAccountId,
      currency: 'SAR',
      createdAt: new Date().toISOString(),
    };
    bankAccounts.push(bank);
    centralStore.bankAccounts.set(this.tenantId, bankAccounts);
    return bank;
  }

  // ==========================================
  // CHART OF ACCOUNTS & ACCOUNT MAPPING (PHASE-02)
  // ==========================================
  public getAccounts(): Account[] {
    let list = centralStore.accounts.get(this.tenantId) || [];
    if (list.length === 0) {
      const coaCopy: Account[] = SAUDI_STANDARD_CHART_OF_ACCOUNTS.map((acc, index) => ({
        id: crypto.randomUUID(),
        tenantId: this.tenantId,
        code: acc.code,
        nameAr: acc.nameAr,
        nameEn: acc.nameEn,
        type: acc.type as Account['type'],
        normalBalance: acc.normalBalance as 'DEBIT' | 'CREDIT',
        parentId: null,
        isHeader: acc.isHeader,
        allowPosting: acc.allowPosting !== undefined ? acc.allowPosting : !acc.isHeader,
        sortOrder: acc.sortOrder || (index + 1) * 10,
        isActive: true,
        createdAt: new Date().toISOString(),
      }));
      centralStore.accounts.set(this.tenantId, coaCopy);
      list = coaCopy;
    }
    return [...list].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.code.localeCompare(b.code));
  }

  public getAccountById(idOrCode: string): Account | undefined {
    const accounts = this.getAccounts();
    return accounts.find((a) => a.id === idOrCode || a.code === idOrCode);
  }

  public createAccount(params: {
    code: string;
    nameAr: string;
    nameEn?: string;
    type: Account['type'];
    normalBalance: 'DEBIT' | 'CREDIT';
    parentId?: string | null;
    isHeader?: boolean;
    allowPosting?: boolean;
    sortOrder?: number;
  }): Account {
    this.assertPermission('accounting:account:manage');
    const accounts = this.getAccounts();

    if (accounts.some((a) => a.code === params.code.trim())) {
      throw new Error(`ACCOUNT_CODE_EXISTS: Account with code ${params.code} already exists.`);
    }

    if (params.parentId) {
      const parent = accounts.find((a) => a.id === params.parentId);
      if (!parent) {
        throw new Error(`PARENT_ACCOUNT_NOT_FOUND: Parent account ${params.parentId} does not exist.`);
      }
    }

    const newAccount: Account = {
      id: crypto.randomUUID(),
      tenantId: this.tenantId,
      code: params.code.trim(),
      nameAr: params.nameAr.trim(),
      nameEn: params.nameEn?.trim() || params.nameAr.trim(),
      type: params.type,
      normalBalance: params.normalBalance,
      parentId: params.parentId || null,
      isHeader: Boolean(params.isHeader),
      allowPosting: params.allowPosting !== undefined ? Boolean(params.allowPosting) : !params.isHeader,
      sortOrder: params.sortOrder ?? (accounts.length + 1) * 10,
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    accounts.push(newAccount);
    centralStore.accounts.set(this.tenantId, accounts);

    centralStore.recordAuditLog({
      tenantId: this.tenantId,
      userId: this.context.userId,
      userEmail: this.context.userEmail,
      ipAddress: this.context.ipAddress,
      userAgent: this.context.userAgent,
      action: 'CREATE_ACCOUNT',
      resourceType: 'accounts',
      resourceId: newAccount.id,
      correlationId: this.context.correlationId,
      changesDiff: { account: { before: null, after: newAccount } },
    });

    return newAccount;
  }

  public updateAccount(
    id: string,
    updates: Partial<Pick<Account, 'nameAr' | 'nameEn' | 'parentId' | 'isHeader' | 'allowPosting' | 'sortOrder' | 'isActive' | 'normalBalance'>>
  ): Account {
    this.assertPermission('accounting:account:manage');
    const accounts = this.getAccounts();
    const index = accounts.findIndex((a) => a.id === id || a.code === id);
    if (index === -1) {
      throw new Error(`ACCOUNT_NOT_FOUND: Account ${id} not found.`);
    }

    const before = { ...accounts[index] };
    const updated: Account = {
      ...before,
      ...updates,
      // If changed to header, allowPosting must be false
      allowPosting: updates.isHeader ? false : (updates.allowPosting !== undefined ? updates.allowPosting : before.allowPosting),
    };

    accounts[index] = updated;
    centralStore.accounts.set(this.tenantId, accounts);

    centralStore.recordAuditLog({
      tenantId: this.tenantId,
      userId: this.context.userId,
      userEmail: this.context.userEmail,
      ipAddress: this.context.ipAddress,
      userAgent: this.context.userAgent,
      action: 'UPDATE_ACCOUNT',
      resourceType: 'accounts',
      resourceId: updated.id,
      correlationId: this.context.correlationId,
      changesDiff: { account: { before, after: updated } },
    });

    return updated;
  }

  public deactivateAccount(id: string): Account {
    this.assertPermission('accounting:account:manage');
    return this.updateAccount(id, { isActive: false });
  }

  public deleteAccount(id: string): void {
    this.assertPermission('accounting:account:manage');
    const accounts = this.getAccounts();
    const target = accounts.find((a) => a.id === id || a.code === id);
    if (!target) {
      throw new Error(`ACCOUNT_NOT_FOUND: Account ${id} not found.`);
    }

    // Deletion Rule 1: Check Account Mappings
    const mappings = this.getAccountMappings();
    const isMapped = Object.values(mappings).some((val) => val === target.id || val === target.code);
    if (isMapped) {
      throw new Error(`ACCOUNT_USED_IN_MAPPINGS: Cannot delete account ${target.code} (${target.nameAr}) linked in company Account Mappings. Deactivate it instead.`);
    }

    // Deletion Rule 2: Check Posted General Ledger Transactions
    const tenantJournals = centralStore.journals.get(this.tenantId) || [];
    const isUsedInJournals = tenantJournals.some((j) =>
      j.lines.some((line) => line.accountId === target.id || line.accountCode === target.code)
    );
    if (isUsedInJournals) {
      throw new Error(`ACCOUNT_USED_IN_JOURNALS: Cannot delete account ${target.code} with existing transaction history in general ledger. Deactivate it instead.`);
    }

    // Deletion Rule 3: Check Sub-Accounts
    const hasChildren = accounts.some((a) => a.parentId === target.id);
    if (hasChildren) {
      throw new Error(`ACCOUNT_HAS_CHILDREN: Cannot delete account ${target.code} because child sub-accounts are nested beneath it.`);
    }

    // Safe to delete
    const remaining = accounts.filter((a) => a.id !== target.id);
    centralStore.accounts.set(this.tenantId, remaining);

    centralStore.recordAuditLog({
      tenantId: this.tenantId,
      userId: this.context.userId,
      userEmail: this.context.userEmail,
      ipAddress: this.context.ipAddress,
      userAgent: this.context.userAgent,
      action: 'DELETE_ACCOUNT',
      resourceType: 'accounts',
      resourceId: target.id,
      correlationId: this.context.correlationId,
      changesDiff: { account: { before: target, after: null } },
    });
  }

  // Account Mappings (Configured per company — NEVER hard-coded IDs)
  public getAccountMappings(): Record<string, string> {
    const raw = centralStore.accountMappings.get(this.tenantId) || {};
    return { ...DEFAULT_ACCOUNT_MAPPING_KEYS, ...raw };
  }

  public updateAccountMappings(mappings: Record<string, string>): Record<string, string> {
    this.assertPermission('accounting:account:manage');
    const current = this.getAccountMappings();

    // Validate that all specified targets exist in chart of accounts and allow posting
    const allAccounts = this.getAccounts();
    for (const [key, targetCodeOrId] of Object.entries(mappings)) {
      if (!targetCodeOrId) continue;
      const acc = allAccounts.find((a) => a.id === targetCodeOrId || a.code === targetCodeOrId);
      if (!acc) {
        throw new Error(`MAPPING_TARGET_NOT_FOUND: Account ${targetCodeOrId} specified for ${key} does not exist.`);
      }
      if (acc.isHeader || !acc.allowPosting) {
        throw new Error(`MAPPING_HEADER_PROHIBITED: Cannot map ${key} to header account ${acc.code}. Must be a detail posting account.`);
      }
    }

    const updated = { ...current, ...mappings };
    centralStore.accountMappings.set(this.tenantId, updated);

    centralStore.recordAuditLog({
      tenantId: this.tenantId,
      userId: this.context.userId,
      userEmail: this.context.userEmail,
      ipAddress: this.context.ipAddress,
      userAgent: this.context.userAgent,
      action: 'UPDATE_ACCOUNT_MAPPINGS',
      resourceType: 'account_mappings',
      resourceId: this.tenantId,
      correlationId: this.context.correlationId,
      changesDiff: { mappings: { before: current, after: updated } },
    });

    return updated;
  }

  /**
   * Resolve an account dynamically via company mapping configuration.
   * Mandate: All business modules must call this instead of using static hardcoded account IDs.
   */
  public resolveAccount(mappingKey: AccountMappingKey | string): Account {
    const mappings = this.getAccountMappings();
    const target = mappings[mappingKey];
    if (!target) {
      throw new Error(`MISSING_ACCOUNT_MAPPING: Account mapping for '${mappingKey}' is not configured in company settings.`);
    }

    const account = this.getAccountById(target);
    if (!account) {
      throw new Error(`MAPPED_ACCOUNT_NOT_FOUND: Account '${target}' mapped to '${mappingKey}' was not found in Chart of Accounts.`);
    }
    if (!account.isActive) {
      throw new Error(`MAPPED_ACCOUNT_INACTIVE: Account '${account.code}' (${account.nameAr}) mapped to '${mappingKey}' is currently deactivated.`);
    }
    return account;
  }

  public validateMappingCompleteness(): {
    isComplete: boolean;
    missingKeys: string[];
    configuredCount: number;
    totalCount: number;
    details: Array<{ key: string; isConfigured: boolean; accountCode?: string; accountNameAr?: string }>;
  } {
    const mappings = this.getAccountMappings();
    const requiredKeys = Object.keys(DEFAULT_ACCOUNT_MAPPING_KEYS) as AccountMappingKey[];
    const missingKeys: string[] = [];
    const details = requiredKeys.map((key) => {
      const target = mappings[key];
      const acc = target ? this.getAccountById(target) : undefined;
      const isConfigured = Boolean(acc && acc.isActive && acc.allowPosting);
      if (!isConfigured) {
        missingKeys.push(key);
      }
      return {
        key,
        isConfigured,
        accountCode: acc?.code,
        accountNameAr: acc?.nameAr,
      };
    });

    return {
      isComplete: missingKeys.length === 0,
      missingKeys,
      configuredCount: requiredKeys.length - missingKeys.length,
      totalCount: requiredKeys.length,
      details,
    };
  }

  // ==========================================
  // POSTING ENGINE (GOLDEN RULES G1, G2, G7, G8)
  // ==========================================
  public async postJournal(params: PostJournalCommand): Promise<JournalEntry> {
    this.assertPermission('accounting:journal:post');

    // 1. Check Idempotency: (companyId, sourceType, sourceKey)
    const existingJournals = centralStore.journals.get(this.tenantId) || [];
    const idempotentHit = existingJournals.find(
      (j) => j.sourceType === params.sourceType && j.sourceKey === params.sourceKey
    );
    if (idempotentHit) {
      logger.info(`[POSTING ENGINE] Idempotent hit: returning existing journal ${idempotentHit.entryNumber} for ${params.sourceKey}`);
      return idempotentHit;
    }

    // 2. Validate Financial Period
    const entryDate = params.date || new Date().toISOString().split('T')[0];
    const period = this.getCurrentPeriod(entryDate);
    if (!period) {
      throw new Error(`PERIOD_NOT_FOUND: No financial period found covering date ${entryDate}. Please initialize fiscal year.`);
    }

    if (period.isClosed) {
      const hasOverridePrivilege =
        this.context.isPlatformSuperAdmin ||
        this.context.role === 'OWNER' ||
        this.context.permissions.includes('accounting:journal:post_closed_override');

      if (!hasOverridePrivilege || !params.overrideClosedPeriod) {
        throw new Error(`PERIOD_CLOSED: Cannot post transaction into closed financial period '${period.nameAr}' (${period.startDate} to ${period.endDate}). Requires period reopen or authorized closed-period override.`);
      }

      // Log security override event
      centralStore.recordAuditLog({
        tenantId: this.tenantId,
        userId: this.context.userId,
        userEmail: this.context.userEmail,
        ipAddress: this.context.ipAddress,
        userAgent: this.context.userAgent,
        action: 'POST_INTO_CLOSED_PERIOD_OVERRIDE',
        resourceType: 'financial_periods',
        resourceId: period.id,
        correlationId: this.context.correlationId,
        changesDiff: {
          period: period.nameEn,
          reason: params.closedPeriodOverrideReason || 'Authorized executive override',
          sourceKey: params.sourceKey,
        },
      });
    }

    // 3. Validate Lines & Compute Totals in Decimal-Exact Halalas
    if (!params.lines || params.lines.length < 2) {
      throw new Error('JOURNAL_MIN_LINES: Journal entry must contain at least 2 balanced debit/credit lines.');
    }

    let totalDebitCents = 0n;
    let totalCreditCents = 0n;
    const validatedLines: JournalLine[] = [];
    const allAccounts = this.getAccounts();

    for (let i = 0; i < params.lines.length; i++) {
      const line = params.lines[i];
      const account = allAccounts.find((a) => a.id === line.accountId || a.code === line.accountId);
      if (!account) {
        throw new Error(`ACCOUNT_NOT_FOUND: Line ${i + 1} references non-existent account ${line.accountId}.`);
      }
      if (!account.isActive) {
        throw new Error(`ACCOUNT_INACTIVE: Line ${i + 1} references deactivated account ${account.code} (${account.nameAr}).`);
      }
      if (account.isHeader || !account.allowPosting) {
        throw new Error(`HEADER_ACCOUNT_POSTING_PROHIBITED: Line ${i + 1} references header account ${account.code}. Postings permitted to detail accounts only.`);
      }

      const debitHalalas = toHalalas(String(line.debit || '0'));
      const creditHalalas = toHalalas(String(line.credit || '0'));

      if (debitHalalas < 0n || creditHalalas < 0n) {
        throw new Error(`NEGATIVE_AMOUNT_PROHIBITED: Line ${i + 1} contains negative value. Debits and credits must be non-negative.`);
      }
      if (debitHalalas > 0n && creditHalalas > 0n) {
        throw new Error(`SPLIT_LINE_PROHIBITED: Line ${i + 1} contains both debit and credit. Separate into individual entries.`);
      }
      if (debitHalalas === 0n && creditHalalas === 0n) {
        throw new Error(`ZERO_LINE_PROHIBITED: Line ${i + 1} has zero for both debit and credit.`);
      }

      totalDebitCents += debitHalalas;
      totalCreditCents += creditHalalas;

      validatedLines.push({
        id: crypto.randomUUID(),
        journalId: '', // populated below
        accountId: account.id,
        accountCode: account.code,
        accountNameAr: account.nameAr,
        accountNameEn: account.nameEn,
        debitCents: debitHalalas,
        creditCents: creditHalalas,
        descriptionAr: line.descriptionAr || line.description,
        descriptionEn: line.descriptionEn || line.description,
        costCenterId: line.costCenterId || params.costCenterId || null,
        branchId: line.branchId || params.branchId || this.getBranches()[0]?.id,
      });
    }

    // 4. Invariant Enforcement: Total Debits == Total Credits (Rule G1)
    if (totalDebitCents !== totalCreditCents || totalDebitCents === 0n) {
      const discrepancy = totalDebitCents > totalCreditCents ? totalDebitCents - totalCreditCents : totalCreditCents - totalDebitCents;
      throw new Error(
        `JOURNAL_UNBALANCED_HALALAS: Total debits (${fromHalalasToDisplay(totalDebitCents)} SAR) must equal total credits (${fromHalalasToDisplay(totalCreditCents)} SAR). Discrepancy: ${fromHalalasToDisplay(discrepancy)} SAR.`
      );
    }

    // 5. DB-Level Defense-in-Depth Balance Verification Constraint Simulation
    this.assertDatabaseBalanceConstraint(validatedLines);

    // 6. Concurrency-Safe Sequential Document Numbering
    const entryYear = new Date(entryDate).getFullYear();
    const entryNumber = await centralStore.getNextDocumentNumber(this.tenantId, 'JV', entryYear);

    // 7. Assemble Journal Entry
    const journalId = crypto.randomUUID();
    validatedLines.forEach((l) => {
      l.journalId = journalId;
    });

    const defaultBranchId = this.getBranches()[0]?.id || '';
    const journal: JournalEntry = {
      id: journalId,
      tenantId: this.tenantId,
      branchId: params.branchId || defaultBranchId,
      entryNumber,
      entryDate,
      periodId: period.id,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      sourceKey: params.sourceKey,
      reference: params.reference,
      descriptionAr: params.descriptionAr || params.description,
      descriptionEn: params.descriptionEn || params.description,
      totalDebitCents,
      totalCreditCents,
      status: 'POSTED',
      costCenterId: params.costCenterId || null,
      lines: validatedLines,
      createdBy: this.context.userId,
      createdAt: new Date().toISOString(),
    };

    existingJournals.push(journal);
    centralStore.journals.set(this.tenantId, existingJournals);

    // Record immutable audit log
    centralStore.recordAuditLog({
      tenantId: this.tenantId,
      userId: this.context.userId,
      userEmail: this.context.userEmail,
      ipAddress: this.context.ipAddress,
      userAgent: this.context.userAgent,
      action: 'POST_JOURNAL',
      resourceType: 'journals',
      resourceId: journal.id,
      correlationId: this.context.correlationId,
      changesDiff: {
        entryNumber: journal.entryNumber,
        sourceType: journal.sourceType,
        sourceKey: journal.sourceKey,
        totalDebit: fromHalalasToDisplay(totalDebitCents),
        totalCredit: fromHalalasToDisplay(totalCreditCents),
        linesCount: validatedLines.length,
      },
    });

    return journal;
  }

  /**
   * Database-Level Constraint Simulation (Rule G1 / G7).
   * Throws DB_CONSTRAINT_VIOLATION if total debits minus total credits does not strictly equal zero.
   */
  public assertDatabaseBalanceConstraint(lines: Array<{ debitCents: bigint; creditCents: bigint }>): void {
    let sumDebits = 0n;
    let sumCredits = 0n;
    for (const line of lines) {
      sumDebits += line.debitCents;
      sumCredits += line.creditCents;
    }
    if (sumDebits !== sumCredits) {
      throw new Error(`DB_CONSTRAINT_VIOLATION: JOURNAL_UNBALANCED_HALALAS (Debits: ${sumDebits}, Credits: ${sumCredits})`);
    }
  }

  // Query Journals
  public getJournals(filters?: {
    startDate?: string;
    endDate?: string;
    accountId?: string;
    sourceType?: string;
    periodId?: string;
    status?: string;
    search?: string;
  }): JournalEntry[] {
    this.assertPermission('accounting:journal:view');
    let list = centralStore.journals.get(this.tenantId) || [];

    if (filters?.startDate) {
      list = list.filter((j) => j.entryDate >= filters.startDate!);
    }
    if (filters?.endDate) {
      list = list.filter((j) => j.entryDate <= filters.endDate!);
    }
    if (filters?.sourceType) {
      list = list.filter((j) => j.sourceType === filters.sourceType);
    }
    if (filters?.periodId) {
      list = list.filter((j) => j.periodId === filters.periodId);
    }
    if (filters?.status) {
      list = list.filter((j) => j.status === filters.status);
    }
    if (filters?.accountId) {
      list = list.filter((j) => j.lines.some((l) => l.accountId === filters.accountId || l.accountCode === filters.accountId));
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(
        (j) =>
          j.entryNumber.toLowerCase().includes(q) ||
          j.descriptionAr.toLowerCase().includes(q) ||
          j.descriptionEn.toLowerCase().includes(q) ||
          j.reference?.toLowerCase().includes(q) ||
          j.sourceKey.toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => b.entryDate.localeCompare(a.entryDate) || b.entryNumber.localeCompare(a.entryNumber));
  }

  public getJournalById(id: string): any {
    this.assertPermission('accounting:journal:view');
    const list = centralStore.journals.get(this.tenantId) || [];
    const j = list.find((item) => item.id === id || item.entryNumber === id);
    if (!j) return undefined;
    const isBalanced = j.totalDebitCents !== undefined
      ? j.totalDebitCents === j.totalCreditCents
      : ((j as any).totalDebit !== undefined && Number((j as any).totalDebit) === Number((j as any).totalCredit));
    const totalDebit = j.totalDebitCents !== undefined
      ? Number(j.totalDebitCents) / 100
      : Number((j as any).totalDebit || 0);
    const totalCredit = j.totalCreditCents !== undefined
      ? Number(j.totalCreditCents) / 100
      : Number((j as any).totalCredit || 0);

    return {
      ...j,
      isBalanced,
      totalDebit,
      totalCredit,
    };
  }

  /**
   * Immutability Enforcement (Rule G2 / ADR-004):
   * Posted journal entries can NEVER be updated or edited. Any attempt throws an exception.
   */
  public mutatePostedJournal(journalId: string): never {
    throw new Error(
      `POSTED_JOURNAL_IMMUTABLE: Posted general ledger journals are strictly immutable under Saudi accounting regulations (Rule G2). Mutating lines or amounts is prohibited. Corrections may ONLY be made via compensating reversal journal.`
    );
  }

  /**
   * Compensating Reversal Engine (Rule G2):
   * Reverses an existing journal voucher by creating a linked, balanced opposite entry.
   */
  public async reverseJournal(journalId: string, reason: string): Promise<JournalEntry> {
    this.assertPermission('accounting:journal:reverse');
    if (!reason || reason.trim().length === 0) {
      throw new Error('REVERSAL_REASON_REQUIRED: A valid explanation must be provided when reversing a journal voucher.');
    }

    const original = this.getJournalById(journalId);
    if (!original) {
      throw new Error(`JOURNAL_NOT_FOUND: Journal ${journalId} not found.`);
    }
    if (original.status === 'REVERSED') {
      throw new Error(`JOURNAL_ALREADY_REVERSED: Journal ${original.entryNumber} has already been reversed by voucher ${original.reversedByJournalId}.`);
    }

    // Build opposite lines (swap debit and credit)
    const reversedLines = original.lines.map((l) => ({
      accountId: l.accountId,
      debit: fromHalalasToDisplay(l.creditCents),
      credit: fromHalalasToDisplay(l.debitCents),
      descriptionAr: `عكس قيد ${original.entryNumber}: ${l.descriptionAr || ''}`.trim(),
      descriptionEn: `Reversal of ${original.entryNumber}: ${l.descriptionEn || ''}`.trim(),
      costCenterId: l.costCenterId || undefined,
      branchId: l.branchId,
    }));

    const reversalCommand: PostJournalCommand = {
      companyId: this.tenantId,
      branchId: original.branchId,
      sourceType: 'REVERSAL',
      sourceId: original.id,
      sourceKey: `REVERSAL:${original.id}:${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      description: `عكس القيد المحاسبي رقم ${original.entryNumber} - ${reason}`,
      descriptionAr: `عكس القيد المحاسبي رقم ${original.entryNumber} - ${reason}`,
      descriptionEn: `Reversal of Journal Voucher ${original.entryNumber} - ${reason}`,
      reference: original.entryNumber,
      lines: reversedLines,
    };

    const reversalJournal = await this.postJournal(reversalCommand);

    // Link the reversal references
    reversalJournal.reversalOfJournalId = original.id;
    const list = centralStore.journals.get(this.tenantId) || [];
    const origStored = list.find((item) => item.id === journalId || item.entryNumber === journalId || item.id === original.id);
    if (origStored) {
      origStored.status = 'REVERSED';
      origStored.reversedByJournalId = reversalJournal.id;
      origStored.reversalReason = reason.trim();
    }

    centralStore.recordAuditLog({
      tenantId: this.tenantId,
      userId: this.context.userId,
      userEmail: this.context.userEmail,
      ipAddress: this.context.ipAddress,
      userAgent: this.context.userAgent,
      action: 'REVERSE_JOURNAL',
      resourceType: 'journals',
      resourceId: original.id,
      correlationId: this.context.correlationId,
      changesDiff: {
        originalJournalNumber: original.entryNumber,
        reversalJournalNumber: reversalJournal.entryNumber,
        reason,
      },
    });

    return reversalJournal;
  }

  // ==========================================
  // FINANCIAL PERIODS & FISCAL YEARS (PHASE-02)
  // ==========================================
  public getFiscalYears(): FiscalYear[] {
    let list = centralStore.fiscalYears.get(this.tenantId) || [];
    if (list.length === 0) {
      const currentYear = new Date().getFullYear();
      const fiscalYearId = crypto.randomUUID();
      const defaultFiscalYear: FiscalYear = {
        id: fiscalYearId,
        tenantId: this.tenantId,
        year: currentYear,
        nameAr: `السنة المالية ${currentYear}`,
        nameEn: `Fiscal Year ${currentYear}`,
        startDate: `${currentYear}-01-01`,
        endDate: `${currentYear}-12-31`,
        isClosed: false,
        createdAt: new Date().toISOString(),
      };
      centralStore.fiscalYears.set(this.tenantId, [defaultFiscalYear]);

      const periods: FinancialPeriod[] = [];
      for (let month = 1; month <= 12; month++) {
        const monthStr = String(month).padStart(2, '0');
        const lastDay = new Date(currentYear, month, 0).getDate();
        periods.push({
          id: crypto.randomUUID(),
          tenantId: this.tenantId,
          fiscalYearId,
          periodNumber: month,
          nameAr: `الفترة ${monthStr} - ${currentYear}`,
          nameEn: `Period ${monthStr} - ${currentYear}`,
          startDate: `${currentYear}-${monthStr}-01`,
          endDate: `${currentYear}-${monthStr}-${String(lastDay).padStart(2, '0')}`,
          isClosed: false,
          createdAt: new Date().toISOString(),
        });
      }
      centralStore.financialPeriods.set(this.tenantId, periods);
      list = [defaultFiscalYear];
    }
    return [...list].sort((a, b) => b.year - a.year);
  }

  public createFiscalYear(year: number, startDate?: string, endDate?: string): FiscalYear {
    this.assertPermission('accounting:period:close');
    const list = this.getFiscalYears();
    if (list.some((fy) => fy.year === year)) {
      throw new Error(`FISCAL_YEAR_EXISTS: Fiscal year ${year} already exists.`);
    }

    const start = startDate || `${year}-01-01`;
    const end = endDate || `${year}-12-31`;
    const fiscalYearId = crypto.randomUUID();

    const newYear: FiscalYear = {
      id: fiscalYearId,
      tenantId: this.tenantId,
      year,
      nameAr: `السنة المالية ${year}`,
      nameEn: `Fiscal Year ${year}`,
      startDate: start,
      endDate: end,
      isClosed: false,
      createdAt: new Date().toISOString(),
    };

    list.push(newYear);
    centralStore.fiscalYears.set(this.tenantId, list);

    // Generate 12 financial periods for this year
    const periods = centralStore.financialPeriods.get(this.tenantId) || [];
    const monthNamesAr = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];
    const monthNamesEn = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    for (let m = 1; m <= 12; m++) {
      const monthStr = String(m).padStart(2, '0');
      const lastDay = new Date(year, m, 0).getDate();
      const lastDayStr = String(lastDay).padStart(2, '0');
      periods.push({
        id: crypto.randomUUID(),
        tenantId: this.tenantId,
        fiscalYearId,
        periodNumber: m,
        nameAr: `فترة ${monthNamesAr[m - 1]} ${year}`,
        nameEn: `Period ${monthNamesEn[m - 1]} ${year}`,
        startDate: `${year}-${monthStr}-01`,
        endDate: `${year}-${monthStr}-${lastDayStr}`,
        isClosed: false,
        createdAt: new Date().toISOString(),
      });
    }
    centralStore.financialPeriods.set(this.tenantId, periods);

    return newYear;
  }

  public getFinancialPeriods(fiscalYearId?: string): FinancialPeriod[] {
    const list = centralStore.financialPeriods.get(this.tenantId) || [];
    if (fiscalYearId) {
      return list.filter((p) => p.fiscalYearId === fiscalYearId).sort((a, b) => a.periodNumber - b.periodNumber);
    }
    return [...list].sort((a, b) => b.startDate.localeCompare(a.startDate) || a.periodNumber - b.periodNumber);
  }

  public getCurrentPeriod(dateStr?: string): FinancialPeriod | undefined {
    const target = dateStr || new Date().toISOString().split('T')[0];
    let periods = this.getFinancialPeriods();
    let matched = periods.find((p) => target >= p.startDate && target <= p.endDate);
    if (!matched) {
      const targetYear = Number(target.split('-')[0]) || new Date().getFullYear();
      const fiscalYears = this.getFiscalYears();
      if (!fiscalYears.some((fy) => fy.year === targetYear)) {
        try {
          this.createFiscalYear(targetYear);
        } catch {
          // If already exists or permission issue, fallback
        }
      }
      periods = this.getFinancialPeriods();
      matched = periods.find((p) => target >= p.startDate && target <= p.endDate);
    }
    return matched;
  }

  public closePeriod(periodId: string, reason: string): FinancialPeriod {
    this.assertPermission('accounting:period:close');
    if (!reason || !reason.trim()) {
      throw new Error('CLOSE_REASON_REQUIRED: A valid business rationale is mandatory when closing a financial period.');
    }

    const periods = centralStore.financialPeriods.get(this.tenantId) || [];
    const index = periods.findIndex((p) => p.id === periodId);
    if (index === -1) {
      throw new Error(`PERIOD_NOT_FOUND: Period ${periodId} not found.`);
    }

    const p = periods[index];
    if (p.isClosed) {
      throw new Error(`PERIOD_ALREADY_CLOSED: Period ${p.nameAr} is already closed.`);
    }

    const updated: FinancialPeriod = {
      ...p,
      isClosed: true,
      closedAt: new Date().toISOString(),
      closedBy: this.context.userId,
      closedReason: reason.trim(),
    };

    periods[index] = updated;
    centralStore.financialPeriods.set(this.tenantId, periods);

    centralStore.recordAuditLog({
      tenantId: this.tenantId,
      userId: this.context.userId,
      userEmail: this.context.userEmail,
      ipAddress: this.context.ipAddress,
      userAgent: this.context.userAgent,
      action: 'CLOSE_FINANCIAL_PERIOD',
      resourceType: 'financial_periods',
      resourceId: p.id,
      correlationId: this.context.correlationId,
      changesDiff: { period: p.nameEn, reason },
    });

    return updated;
  }

  public reopenPeriod(periodId: string, reason: string): FinancialPeriod {
    this.assertPermission('accounting:period:reopen');
    if (!reason || !reason.trim()) {
      throw new Error('REOPEN_REASON_REQUIRED: A valid justification is mandatory when reopening a financial period.');
    }

    const periods = centralStore.financialPeriods.get(this.tenantId) || [];
    const index = periods.findIndex((p) => p.id === periodId);
    if (index === -1) {
      throw new Error(`PERIOD_NOT_FOUND: Period ${periodId} not found.`);
    }

    const p = periods[index];
    if (!p.isClosed) {
      throw new Error(`PERIOD_NOT_CLOSED: Period ${p.nameAr} is already open.`);
    }

    const updated: FinancialPeriod = {
      ...p,
      isClosed: false,
      closedReason: `Reopened: ${reason.trim()}`,
    };

    periods[index] = updated;
    centralStore.financialPeriods.set(this.tenantId, periods);

    centralStore.recordAuditLog({
      tenantId: this.tenantId,
      userId: this.context.userId,
      userEmail: this.context.userEmail,
      ipAddress: this.context.ipAddress,
      userAgent: this.context.userAgent,
      action: 'REOPEN_FINANCIAL_PERIOD',
      resourceType: 'financial_periods',
      resourceId: p.id,
      correlationId: this.context.correlationId,
      changesDiff: { period: p.nameEn, reason },
    });

    return updated;
  }

  /**
   * Year-End Closing Procedure:
   * Generates closing journal entry transferring net revenues/expenses to Retained Earnings (Rule G1).
   */
  public async closeFiscalYear(yearId: string, retainedEarningsAccountId?: string): Promise<{ closingJournal: JournalEntry; netIncomeHalalas: bigint }> {
    this.assertPermission('accounting:period:close');
    const fiscalYears = this.getFiscalYears();
    const fyIndex = fiscalYears.findIndex((f) => f.id === yearId || f.year === Number(yearId));
    if (fyIndex === -1) {
      throw new Error(`FISCAL_YEAR_NOT_FOUND: Fiscal year ${yearId} not found.`);
    }

    const fy = fiscalYears[fyIndex];
    if (fy.isClosed) {
      throw new Error(`FISCAL_YEAR_ALREADY_CLOSED: Fiscal year ${fy.year} has already been closed.`);
    }

    // Resolve Retained Earnings Account via company mapping or passed override
    const retainedEarningsAcc = retainedEarningsAccountId
      ? this.getAccountById(retainedEarningsAccountId)
      : this.resolveAccount('RETAINED_EARNINGS');
    if (!retainedEarningsAcc) {
      throw new Error('RETAINED_EARNINGS_ACCOUNT_MISSING: Retained Earnings account must be configured before closing fiscal year.');
    }

    // Compute net nominal balances (Revenues, COGS, Expenses) for this fiscal year
    const journals = this.getJournals({ startDate: fy.startDate, endDate: fy.endDate, status: 'POSTED' });
    const nominalBalances = new Map<string, { account: Account; netDebitCents: bigint; netCreditCents: bigint }>();

    for (const j of journals) {
      if (j.sourceType === 'CLOSING') continue; // Skip existing closing journals
      for (const l of j.lines) {
        const acc = this.getAccountById(l.accountId);
        if (!acc) continue;
        if (acc.type === 'REVENUE' || acc.type === 'COGS' || acc.type === 'EXPENSE') {
          const entry = nominalBalances.get(acc.id) || { account: acc, netDebitCents: 0n, netCreditCents: 0n };
          entry.netDebitCents += l.debitCents;
          entry.netCreditCents += l.creditCents;
          nominalBalances.set(acc.id, entry);
        }
      }
    }

    const closingLines: Array<{ accountId: string; debit: string; credit: string; descriptionAr: string; descriptionEn: string }> = [];
    let totalNominalCredits = 0n; // Revenues
    let totalNominalDebits = 0n; // COGS + Expenses

    for (const [, { account, netDebitCents, netCreditCents }] of nominalBalances.entries()) {
      if (account.type === 'REVENUE') {
        const netCredit = netCreditCents - netDebitCents;
        if (netCredit > 0n) {
          totalNominalCredits += netCredit;
          closingLines.push({
            accountId: account.id,
            debit: fromHalalasToDisplay(netCredit),
            credit: '0.00',
            descriptionAr: `إقفال حساب الإيراد ${account.nameAr} في الأرباح المبقاة`,
            descriptionEn: `Closing revenue ${account.nameEn} to Retained Earnings`,
          });
        } else if (netCredit < 0n) {
          const deficit = -netCredit;
          totalNominalDebits += deficit;
          closingLines.push({
            accountId: account.id,
            debit: '0.00',
            credit: fromHalalasToDisplay(deficit),
            descriptionAr: `إقفال عجز الإيراد ${account.nameAr} في الأرباح المبقاة`,
            descriptionEn: `Closing revenue deficit ${account.nameEn} to Retained Earnings`,
          });
        }
      } else {
        // COGS or EXPENSE
        const netDebit = netDebitCents - netCreditCents;
        if (netDebit > 0n) {
          totalNominalDebits += netDebit;
          closingLines.push({
            accountId: account.id,
            debit: '0.00',
            credit: fromHalalasToDisplay(netDebit),
            descriptionAr: `إقفال مصروف ${account.nameAr} في الأرباح المبقاة`,
            descriptionEn: `Closing expense ${account.nameEn} to Retained Earnings`,
          });
        } else if (netDebit < 0n) {
          const surplus = -netDebit;
          totalNominalCredits += surplus;
          closingLines.push({
            accountId: account.id,
            debit: fromHalalasToDisplay(surplus),
            credit: '0.00',
            descriptionAr: `إقفال فائض المصروف ${account.nameAr} في الأرباح المبقاة`,
            descriptionEn: `Closing expense surplus ${account.nameEn} to Retained Earnings`,
          });
        }
      }
    }

    const netIncomeHalalas = totalNominalCredits - totalNominalDebits;
    if (netIncomeHalalas > 0n) {
      // Net Profit: Credit Retained Earnings
      closingLines.push({
        accountId: retainedEarningsAcc.id,
        debit: '0.00',
        credit: fromHalalasToDisplay(netIncomeHalalas),
        descriptionAr: `ترحيل صافي أرباح السنة المالية ${fy.year} إلى الأرباح المبقاة`,
        descriptionEn: `Transfer of FY ${fy.year} Net Profit to Retained Earnings`,
      });
    } else if (netIncomeHalalas < 0n) {
      // Net Loss: Debit Retained Earnings
      const loss = -netIncomeHalalas;
      closingLines.push({
        accountId: retainedEarningsAcc.id,
        debit: fromHalalasToDisplay(loss),
        credit: '0.00',
        descriptionAr: `ترحيل صافي خسارة السنة المالية ${fy.year} إلى الأرباح المبقاة`,
        descriptionEn: `Transfer of FY ${fy.year} Net Loss to Retained Earnings`,
      });
    }

    // If there are no movements, provide a 0 balance closing line
    if (closingLines.length === 0) {
      closingLines.push(
        {
          accountId: retainedEarningsAcc.id,
          debit: '0.01',
          credit: '0.00',
          descriptionAr: `قيد إقفال السنة المالية ${fy.year} (رصيد صفري)`,
          descriptionEn: `Closing entry FY ${fy.year} (Zero balance)`,
        },
        {
          accountId: retainedEarningsAcc.id,
          debit: '0.00',
          credit: '0.01',
          descriptionAr: `قيد إقفال السنة المالية ${fy.year} (رصيد صفري)`,
          descriptionEn: `Closing entry FY ${fy.year} (Zero balance)`,
        }
      );
    }

    const closingJournal = await this.postJournal({
      companyId: this.tenantId,
      sourceType: 'CLOSING',
      sourceId: fy.id,
      sourceKey: `CLOSING:FY:${fy.year}`,
      date: fy.endDate,
      description: `قيد إقفال السنة المالية ${fy.year} وترحيل الأرباح/الخسائر إلى الأرباح المبقاة`,
      descriptionAr: `قيد إقفال السنة المالية ${fy.year} وترحيل الأرباح/الخسائر إلى الأرباح المبقاة`,
      descriptionEn: `Fiscal Year ${fy.year} Closing Journal Entry to Retained Earnings`,
      lines: closingLines,
      overrideClosedPeriod: true,
      closedPeriodOverrideReason: `Annual closing procedure for FY ${fy.year}`,
    });

    // Close the fiscal year and all associated periods
    fy.isClosed = true;
    fy.closedAt = new Date().toISOString();
    fy.closedBy = this.context.userId;
    fiscalYears[fyIndex] = fy;
    centralStore.fiscalYears.set(this.tenantId, fiscalYears);

    const periods = centralStore.financialPeriods.get(this.tenantId) || [];
    periods.forEach((p) => {
      if (p.fiscalYearId === fy.id && !p.isClosed) {
        p.isClosed = true;
        p.closedAt = new Date().toISOString();
        p.closedBy = this.context.userId;
        p.closedReason = `Closed automatically with Fiscal Year ${fy.year}`;
      }
    });
    centralStore.financialPeriods.set(this.tenantId, periods);

    centralStore.recordAuditLog({
      tenantId: this.tenantId,
      userId: this.context.userId,
      userEmail: this.context.userEmail,
      ipAddress: this.context.ipAddress,
      userAgent: this.context.userAgent,
      action: 'CLOSE_FISCAL_YEAR',
      resourceType: 'fiscal_years',
      resourceId: fy.id,
      correlationId: this.context.correlationId,
      changesDiff: {
        year: fy.year,
        netIncome: fromHalalasToDisplay(netIncomeHalalas),
        closingJournalNumber: closingJournal.entryNumber,
      },
    });

    return { closingJournal, netIncomeHalalas };
  }

  // ==========================================
  // COST CENTERS (PHASE-02)
  // ==========================================
  public getCostCenters(): CostCenter[] {
    const list = centralStore.costCenters.get(this.tenantId) || [];
    return [...list].sort((a, b) => a.code.localeCompare(b.code));
  }

  public createCostCenter(params: { code: string; nameAr: string; nameEn?: string; parentId?: string | null }): CostCenter {
    this.assertPermission('accounting:cost:view');
    const list = this.getCostCenters();
    if (list.some((cc) => cc.code.toLowerCase() === params.code.trim().toLowerCase())) {
      throw new Error(`COST_CENTER_CODE_EXISTS: Cost center code ${params.code} already exists.`);
    }

    const costCenter: CostCenter = {
      id: crypto.randomUUID(),
      tenantId: this.tenantId,
      code: params.code.trim(),
      nameAr: params.nameAr.trim(),
      nameEn: params.nameEn?.trim() || params.nameAr.trim(),
      parentId: params.parentId || null,
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    list.push(costCenter);
    centralStore.costCenters.set(this.tenantId, list);

    centralStore.recordAuditLog({
      tenantId: this.tenantId,
      userId: this.context.userId,
      userEmail: this.context.userEmail,
      ipAddress: this.context.ipAddress,
      userAgent: this.context.userAgent,
      action: 'CREATE_COST_CENTER',
      resourceType: 'cost_centers',
      resourceId: costCenter.id,
      correlationId: this.context.correlationId,
      changesDiff: { costCenter },
    });

    return costCenter;
  }

  // ==========================================
  // OPENING BALANCES (PHASE-02)
  // ==========================================
  public getOpeningBalances(): OpeningBalanceEntry[] {
    return centralStore.openingBalances.get(this.tenantId) || [];
  }

  public saveOpeningBalanceEntry(params: {
    sourceType: OpeningBalanceEntry['sourceType'];
    sourceId: string;
    sourceNameAr: string;
    sourceNameEn?: string;
    accountCode: string;
    debit: string | number;
    credit: string | number;
    itemizedReference?: string;
    notes?: string;
  }): OpeningBalanceEntry {
    this.assertPermission('accounting:journal:post');
    const account = this.getAccountById(params.accountCode);
    if (!account) {
      throw new Error(`ACCOUNT_NOT_FOUND: Account ${params.accountCode} not found.`);
    }
    if (account.isHeader || !account.allowPosting) {
      throw new Error(`HEADER_ACCOUNT_POSTING_PROHIBITED: Cannot post opening balance to summary header account ${account.code}.`);
    }

    const debitCents = toHalalas(String(params.debit || '0'));
    const creditCents = toHalalas(String(params.credit || '0'));

    const list = this.getOpeningBalances();
    const existingIndex = list.findIndex(
      (b) => b.sourceType === params.sourceType && b.sourceId === params.sourceId && b.accountCode === params.accountCode
    );

    const entry: OpeningBalanceEntry = {
      id: existingIndex >= 0 ? list[existingIndex].id : crypto.randomUUID(),
      tenantId: this.tenantId,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      sourceNameAr: params.sourceNameAr,
      sourceNameEn: params.sourceNameEn || params.sourceNameAr,
      accountId: account.id,
      accountCode: account.code,
      debitCents,
      creditCents,
      itemizedReference: params.itemizedReference,
      notes: params.notes,
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      list[existingIndex] = entry;
    } else {
      list.push(entry);
    }
    centralStore.openingBalances.set(this.tenantId, list);
    return entry;
  }

  public deleteOpeningBalanceEntry(id: string): void {
    this.assertPermission('accounting:journal:post');
    let list = this.getOpeningBalances();
    const entry = list.find((b) => b.id === id);
    if (entry && entry.status === 'POSTED') {
      throw new Error('OPENING_BALANCE_ALREADY_POSTED: Cannot delete an already finalized opening balance entry.');
    }
    list = list.filter((b) => b.id !== id);
    centralStore.openingBalances.set(this.tenantId, list);
  }

  public importOpeningBalances(entries: any[]): { imported: number; errors: Array<{ row: number; error: string }> } {
    this.assertPermission('accounting:journal:post');
    const errors: Array<{ row: number; error: string }> = [];
    let importedCount = 0;

    entries.forEach((row, idx) => {
      const rowNum = idx + 1;
      try {
        if (!row.accountCode) throw new Error('رمز الحساب مطلوب (Account code is required)');
        if (!row.sourceNameAr && !row.sourceName) throw new Error('اسم الجهة/البند مطلوب (Source name is required)');

        this.saveOpeningBalanceEntry({
          sourceType: (row.sourceType || 'GL') as OpeningBalanceEntry['sourceType'],
          sourceId: row.sourceId || `IMP-${rowNum}`,
          sourceNameAr: row.sourceNameAr || row.sourceName,
          sourceNameEn: row.sourceNameEn || row.sourceName,
          accountCode: String(row.accountCode),
          debit: row.debit || '0',
          credit: row.credit || '0',
          itemizedReference: row.reference,
          notes: row.notes,
        });
        importedCount++;
      } catch (err: any) {
        errors.push({ row: rowNum, error: err.message });
      }
    });

    return { imported: importedCount, errors };
  }

  /**
   * Finalize and Post Opening Balances as a single balanced General Ledger Journal (Rule G1).
   */
  public async finalizeOpeningBalances(): Promise<JournalEntry> {
    this.assertPermission('accounting:journal:post');
    const list = this.getOpeningBalances().filter((b) => b.status === 'DRAFT');
    if (list.length === 0) {
      throw new Error('NO_DRAFT_OPENING_BALANCES: No draft opening balance records found to finalize.');
    }

    let totalDebits = 0n;
    let totalCredits = 0n;
    const lines: Array<{ accountId: string; debit: string; credit: string; descriptionAr: string; descriptionEn: string }> = [];

    list.forEach((b) => {
      totalDebits += b.debitCents;
      totalCredits += b.creditCents;
      lines.push({
        accountId: b.accountId,
        debit: fromHalalasToDisplay(b.debitCents),
        credit: fromHalalasToDisplay(b.creditCents),
        descriptionAr: `رصيد افتتاحي: ${b.sourceNameAr} ${b.itemizedReference ? `(${b.itemizedReference})` : ''}`.trim(),
        descriptionEn: `Opening Balance: ${b.sourceNameEn} ${b.itemizedReference ? `(${b.itemizedReference})` : ''}`.trim(),
      });
    });

    if (totalDebits !== totalCredits) {
      const discrepancy = totalDebits > totalCredits ? totalDebits - totalCredits : totalCredits - totalDebits;
      throw new Error(
        `OPENING_BALANCES_UNBALANCED: Opening balances set is not balanced. Total Debits: ${fromHalalasToDisplay(totalDebits)} SAR, Total Credits: ${fromHalalasToDisplay(totalCredits)} SAR. Discrepancy: ${fromHalalasToDisplay(discrepancy)} SAR. Please balance debits and credits before posting.`
      );
    }

    const journal = await this.postJournal({
      companyId: this.tenantId,
      sourceType: 'OPENING',
      sourceId: 'OPENING_MASTER',
      sourceKey: `OPENING:SET:${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      description: 'قيد الأرصدة الافتتاحية للمنشأة',
      descriptionAr: 'قيد الأرصدة الافتتاحية للمنشأة',
      descriptionEn: 'Company Master Opening Balances Journal Voucher',
      lines,
    });

    // Mark entries as posted
    list.forEach((b) => {
      b.status = 'POSTED';
      b.postedJournalId = journal.id;
    });

    centralStore.recordAuditLog({
      tenantId: this.tenantId,
      userId: this.context.userId,
      userEmail: this.context.userEmail,
      ipAddress: this.context.ipAddress,
      userAgent: this.context.userAgent,
      action: 'FINALIZE_OPENING_BALANCES',
      resourceType: 'opening_balances',
      resourceId: journal.id,
      correlationId: this.context.correlationId,
      changesDiff: {
        journalNumber: journal.entryNumber,
        totalBalance: fromHalalasToDisplay(totalDebits),
        recordsCount: list.length,
      },
    });

    return journal;
  }

  // ==========================================
  // DRAFT MANUAL JOURNALS (PHASE-02)
  // ==========================================
  public getDraftJournals(): DraftJournal[] {
    const list = centralStore.draftJournals.get(this.tenantId) || [];
    return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  public createDraftJournal(params: {
    entryDate: string;
    descriptionAr: string;
    descriptionEn?: string;
    reference?: string;
    branchId?: string;
    lines: DraftJournal['lines'];
    attachments?: DraftJournal['attachments'];
  }): DraftJournal {
    this.assertPermission('accounting:journal:create');
    const drafts = this.getDraftJournals();
    const draft: DraftJournal = {
      id: crypto.randomUUID(),
      tenantId: this.tenantId,
      branchId: params.branchId || this.getBranches()[0]?.id || '',
      entryDate: params.entryDate || new Date().toISOString().split('T')[0],
      descriptionAr: params.descriptionAr,
      descriptionEn: params.descriptionEn || params.descriptionAr,
      reference: params.reference,
      lines: params.lines || [],
      attachments: params.attachments || [],
      createdBy: this.context.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    drafts.push(draft);
    centralStore.draftJournals.set(this.tenantId, drafts);
    return draft;
  }

  public updateDraftJournal(id: string, updates: Partial<Omit<DraftJournal, 'id' | 'tenantId' | 'createdAt'>>): DraftJournal {
    this.assertPermission('accounting:journal:edit');
    const drafts = this.getDraftJournals();
    const index = drafts.findIndex((d) => d.id === id);
    if (index === -1) {
      throw new Error(`DRAFT_JOURNAL_NOT_FOUND: Draft journal ${id} not found.`);
    }

    const updated: DraftJournal = {
      ...drafts[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    drafts[index] = updated;
    centralStore.draftJournals.set(this.tenantId, drafts);
    return updated;
  }

  public deleteDraftJournal(id: string): void {
    this.assertPermission('accounting:journal:edit');
    let drafts = this.getDraftJournals();
    drafts = drafts.filter((d) => d.id !== id);
    centralStore.draftJournals.set(this.tenantId, drafts);
  }

  public async postDraftJournal(id: string): Promise<JournalEntry> {
    this.assertPermission('accounting:journal:post');
    const drafts = this.getDraftJournals();
    const draft = drafts.find((d) => d.id === id);
    if (!draft) {
      throw new Error(`DRAFT_JOURNAL_NOT_FOUND: Draft journal ${id} not found.`);
    }

    const journal = await this.postJournal({
      companyId: this.tenantId,
      branchId: draft.branchId,
      sourceType: 'MANUAL',
      sourceId: draft.id,
      sourceKey: `DRAFT:${draft.id}:${Date.now()}`,
      date: draft.entryDate,
      description: draft.descriptionAr,
      descriptionAr: draft.descriptionAr,
      descriptionEn: draft.descriptionEn,
      reference: draft.reference,
      lines: draft.lines.map((l) => ({
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
        description: l.description,
        costCenterId: l.costCenterId,
      })),
    });

    // Remove draft upon successful posting
    this.deleteDraftJournal(id);
    return journal;
  }

  // Document Sequences
  public getDocumentSequences(): DocumentSequence[] {
    const seqMap = centralStore.documentSequences.get(this.tenantId);
    if (!seqMap) return [];
    return Array.from(seqMap.values());
  }

  public async getNextDocNumber(docTypeCode: string, year = new Date().getFullYear()): Promise<string> {
    return centralStore.getNextDocumentNumber(this.tenantId, docTypeCode, year);
  }

  // Users in this company
  public getUsers(): { user: User; membership: UserMembership }[] {
    this.assertPermission('settings:users:view');
    const memberships = centralStore.memberships.get(this.tenantId) || [];
    const result: { user: User; membership: UserMembership }[] = [];

    for (const mem of memberships) {
      const u = centralStore.users.get(mem.userId);
      if (u) {
        result.push({ user: u, membership: mem });
      }
    }
    return result;
  }

  // Roles in this company
  public getRoles(): RoleDefinition[] {
    return centralStore.roles.get(this.tenantId) || SYSTEM_DEFAULT_ROLES;
  }

  public createCustomRole(params: { code: string; nameAr: string; nameEn: string; permissions: string[] }): RoleDefinition {
    this.assertPermission('settings:roles:manage');
    const roles = this.getRoles();
    if (roles.some((r) => r.code.toUpperCase() === params.code.toUpperCase())) {
      throw new Error(`Role code ${params.code} already exists`);
    }

    const newRole: RoleDefinition = {
      code: params.code.toUpperCase(),
      nameAr: params.nameAr,
      nameEn: params.nameEn || params.nameAr,
      descriptionAr: 'دور مخصص لمنشأتك',
      descriptionEn: 'Custom role for your company',
      isSystem: false,
      permissions: params.permissions,
    };

    roles.push(newRole);
    centralStore.roles.set(this.tenantId, roles);

    centralStore.recordAuditLog({
      tenantId: this.tenantId,
      userId: this.context.userId,
      userEmail: this.context.userEmail,
      ipAddress: this.context.ipAddress,
      userAgent: this.context.userAgent,
      action: 'CREATE_CUSTOM_ROLE',
      resourceType: 'roles',
      resourceId: newRole.code,
      correlationId: this.context.correlationId,
      changesDiff: { role: { before: null, after: newRole } },
    });

    return newRole;
  }

  // Audit Logs
  public getAuditLogs(limit = 100): AuditLogEntry[] {
    this.assertPermission('reports:audit:view');
    return centralStore.auditLogs.filter((log) => log.tenantId === this.tenantId).slice(0, limit);
  }

  // Sensitive field scrubber bound to this caller
  public scrub<T>(data: T): T {
    const canView =
      this.context.isPlatformSuperAdmin ||
      this.context.role === 'OWNER' ||
      this.context.permissions.includes('accounting:cost:view');
    return scrubSensitiveFinancialFields(data, canView);
  }

  // ==========================================
  // CUSTOMER SERVICES
  // ==========================================
  public getCustomers(filters?: { search?: string; status?: string; type?: string; group?: string; salesRep?: string }) {
    this.assertPermission('sales:customer:view');
    return getCustomersService(centralStore, this.tenantId, filters);
  }

  public getCustomerById(id: string) {
    this.assertPermission('sales:customer:view');
    return getCustomerByIdService(centralStore, this.tenantId, id);
  }

  public createCustomer(input: any) {
    this.assertPermission('sales:customer:manage');
    return createCustomerService(centralStore, this.tenantId, this.context.userId, this.context.userEmail, input);
  }

  public updateCustomer(id: string, updates: any) {
    this.assertPermission('sales:customer:manage');
    return updateCustomerService(centralStore, this.tenantId, this.context.userId, this.context.userEmail, id, updates);
  }

  public setCustomerStatus(id: string, status: any, reason?: string) {
    this.assertPermission('sales:customer:manage');
    return setCustomerStatusService(centralStore, this.tenantId, this.context.userId, this.context.userEmail, id, status, reason);
  }

  public evaluateCustomerCredit(customerId: string, proposedAmountSar: number = 0) {
    this.assertPermission('sales:customer:view');
    const customer = getCustomerByIdService(centralStore, this.tenantId, customerId);
    if (!customer) throw new NotFoundError('Customer not found');
    return evaluateCustomerCredit(customer, customer.ledgerBalanceSar, proposedAmountSar);
  }

  // ==========================================
  // SUPPLIER SERVICES
  // ==========================================
  public getSuppliers(filters?: { search?: string; status?: string; type?: string; group?: string; supplierType?: string }) {
    this.assertPermission('purchasing:supplier:view');
    return getSuppliersService(centralStore, this.tenantId, filters);
  }

  public getSupplierById(id: string) {
    this.assertPermission('purchasing:supplier:view');
    return getSupplierByIdService(centralStore, this.tenantId, id);
  }

  public createSupplier(input: any) {
    this.assertPermission('purchasing:supplier:manage');
    return createSupplierService(centralStore, this.tenantId, this.context.userId, this.context.userEmail, input);
  }

  public updateSupplier(id: string, updates: any) {
    this.assertPermission('purchasing:supplier:manage');
    return updateSupplierService(centralStore, this.tenantId, this.context.userId, this.context.userEmail, id, updates);
  }

  public setSupplierStatus(id: string, status: any, reason?: string) {
    this.assertPermission('purchasing:supplier:manage');
    return setSupplierStatusService(centralStore, this.tenantId, this.context.userId, this.context.userEmail, id, status, reason);
  }

  public checkSupplierCanPurchase(supplierId: string, overrideReason?: string) {
    this.assertPermission('purchasing:supplier:view');
    const hasOverride =
      this.context.isPlatformSuperAdmin ||
      this.context.role === 'OWNER' ||
      this.context.roleCode === 'CHIEF_ACCOUNTANT' ||
      this.hasPermission('purchasing:supplier:override_suspended');

    return checkSupplierCanPurchaseService(
      centralStore,
      this.tenantId,
      this.context.userId,
      this.context.userEmail,
      supplierId,
      {
        hasOverridePermission: hasOverride,
        reason: overrideReason,
      }
    );
  }

  // ==========================================
  // BATCH IMPORT & ROLLBACK
  // ==========================================
  public executePartyImport(params: {
    entity: 'CUSTOMER' | 'SUPPLIER';
    mode: 'CREATE_ONLY' | 'UPDATE_ONLY' | 'CREATE_OR_UPDATE';
    rows: any[];
  }) {
    const perm = params.entity === 'CUSTOMER' ? 'sales:customer:manage' : 'purchasing:supplier:manage';
    this.assertPermission(perm);
    return executePartyImportService(centralStore, this.tenantId, this.context.userId, this.context.userEmail, params);
  }

  public rollbackPartyImport(batchId: string) {
    this.assertPermission('settings:company:manage');
    return rollbackPartyImportService(centralStore, this.tenantId, this.context.userId, this.context.userEmail, batchId);
  }

  public exportParties(entity: 'CUSTOMER' | 'SUPPLIER') {
    const perm = entity === 'CUSTOMER' ? 'sales:customer:view' : 'purchasing:supplier:view';
    this.assertPermission(perm);
    return exportPartiesService(centralStore, this.tenantId, entity);
  }

  // ==========================================
  // SALES INVOICES, ORDERS, QUOTATIONS & RECEIPTS
  // ==========================================
  public getSalesInvoices(filters?: {
    search?: string;
    type?: string;
    status?: string;
    customerId?: string;
    startDate?: string;
    endDate?: string;
    salesRep?: string;
  }) {
    this.assertPermission('sales:invoice:view');
    return getSalesInvoicesService(centralStore, this.context, filters);
  }

  public getSalesInvoiceById(id: string) {
    this.assertPermission('sales:invoice:view');
    return getSalesInvoiceByIdService(centralStore, this.context, id);
  }

  public async createSalesInvoice(payload: any) {
    this.assertPermission('sales:invoice:create');
    return await createSalesInvoiceService(centralStore, this.context, payload);
  }

  public async postSalesInvoice(id: string) {
    this.assertPermission('sales:invoice:post');
    return await postSalesInvoiceService(centralStore, this.context, id);
  }

  public updateSalesInvoiceStatus(id: string, status: any) {
    this.assertPermission('sales:invoice:create');
    return updateSalesInvoiceStatusService(centralStore, this.context, id, status);
  }

  public cancelSalesInvoice(id: string, reason?: string) {
    this.assertPermission('sales:invoice:create');
    return cancelSalesInvoiceService(centralStore, this.context, id, reason);
  }

  public getSalesOrders(filters?: { search?: string; status?: string; customerId?: string }) {
    this.assertPermission('sales:invoice:view');
    return getSalesOrdersService(centralStore, this.context, filters);
  }

  public getSalesOrderById(id: string) {
    this.assertPermission('sales:invoice:view');
    return getSalesOrderByIdService(centralStore, this.context, id);
  }

  public createSalesOrder(payload: any) {
    this.assertPermission('sales:invoice:create');
    return createSalesOrderService(centralStore, this.context, payload);
  }

  public updateSalesOrderStatus(id: string, status: any) {
    this.assertPermission('sales:invoice:create');
    return updateSalesOrderStatusService(centralStore, this.context, id, status);
  }

  public async convertSalesOrderToInvoice(orderId: string) {
    this.assertPermission('sales:invoice:create');
    return await convertSalesOrderToInvoiceService(centralStore, this.context, orderId);
  }

  public getSalesQuotations(filters?: { search?: string; status?: string; customerId?: string }) {
    this.assertPermission('sales:invoice:view');
    return getSalesQuotationsService(centralStore, this.context, filters);
  }

  public getSalesQuotationById(id: string) {
    this.assertPermission('sales:invoice:view');
    return getSalesQuotationByIdService(centralStore, this.context, id);
  }

  public createSalesQuotation(payload: any) {
    this.assertPermission('sales:invoice:create');
    return createSalesQuotationService(centralStore, this.context, payload);
  }

  public updateSalesQuotationStatus(id: string, status: any) {
    this.assertPermission('sales:invoice:create');
    return updateSalesQuotationStatusService(centralStore, this.context, id, status);
  }

  public convertQuotationToOrder(quotationId: string) {
    this.assertPermission('sales:invoice:create');
    return convertQuotationToOrderService(centralStore, this.context, quotationId);
  }

  public async convertQuotationToInvoice(quotationId: string) {
    this.assertPermission('sales:invoice:create');
    return await convertQuotationToInvoiceService(centralStore, this.context, quotationId);
  }

  public getCustomerPriceAgreements(customerId?: string) {
    this.assertPermission('sales:invoice:view');
    return getCustomerPriceAgreementsService(centralStore, this.context, customerId);
  }

  public getCustomerPriceAgreementById(id: string) {
    this.assertPermission('sales:invoice:view');
    return getCustomerPriceAgreementByIdService(centralStore, this.context, id);
  }

  public createCustomerPriceAgreement(payload: any) {
    this.assertPermission('sales:invoice:create');
    return createCustomerPriceAgreementService(centralStore, this.context, payload);
  }

  public updateCustomerPriceAgreement(id: string, updates: any) {
    this.assertPermission('sales:invoice:create');
    return updateCustomerPriceAgreementService(centralStore, this.context, id, updates);
  }

  public deleteCustomerPriceAgreement(id: string) {
    this.assertPermission('sales:invoice:create');
    return deleteCustomerPriceAgreementService(centralStore, this.context, id);
  }

  public getSalesCreditNotes(filters?: { search?: string; originalInvoiceId?: string; customerId?: string }) {
    this.assertPermission('sales:invoice:view');
    return getSalesCreditNotesService(centralStore, this.context, filters);
  }

  public getSalesCreditNoteById(id: string) {
    this.assertPermission('sales:invoice:view');
    return getSalesCreditNoteByIdService(centralStore, this.context, id);
  }

  public async createSalesCreditNote(payload: any) {
    this.assertPermission('sales:invoice:create');
    return await createSalesCreditNoteService(centralStore, this.context, payload);
  }

  public getCustomerReceipts(filters?: { search?: string; customerId?: string }) {
    this.assertPermission('sales:invoice:view');
    return getCustomerReceiptsService(centralStore, this.context, filters);
  }

  public getCustomerReceiptById(id: string) {
    this.assertPermission('sales:invoice:view');
    return getCustomerReceiptByIdService(centralStore, this.context, id);
  }

  public async createCustomerReceipt(payload: any) {
    this.assertPermission('sales:invoice:create');
    return await createCustomerReceiptService(centralStore, this.context, payload);
  }

  public reallocateCustomerReceipt(receiptId: string, newAllocations: any[]) {
    this.assertPermission('sales:invoice:create');
    return reallocateCustomerReceiptService(centralStore, this.context, receiptId, newAllocations);
  }

  public getCustomerStatement(customerId: string, startDate?: string, endDate?: string) {
    this.assertPermission('sales:customer:view');
    return getCustomerStatementService(centralStore, this.context, customerId, startDate, endDate);
  }

  public getCustomerAging() {
    this.assertPermission('sales:customer:view');
    return getCustomerAgingService(centralStore, this.context);
  }

  public async copySalesDocument(params: { sourceType: 'QUOTATION' | 'ORDER' | 'INVOICE' | 'CREDIT_NOTE'; sourceId: string }) {
    this.assertPermission('sales:invoice:create');
    return await copySalesDocumentService(centralStore, this.context, params);
  }

  // =========================================================================
  // INVENTORY ENGINE & STOCK LEDGER (PHASE-05)
  // =========================================================================
  public async recordStockMovement(params: Parameters<typeof recordStockMovementService>[2]) {
    this.assertPermission('inventory:movement:create');
    return await recordStockMovementService(centralStore, this.context, params);
  }

  public getStockMovements(filters?: Parameters<typeof getStockMovementsService>[2]) {
    this.assertPermission('inventory:stock:view');
    return getStockMovementsService(centralStore, this.context, filters);
  }

  public async createOpeningStockBatch(params: Parameters<typeof createOpeningStockBatchService>[2]) {
    this.assertPermission('inventory:opening_stock:manage');
    return await createOpeningStockBatchService(centralStore, this.context, params);
  }

  public async createStockTransfer(params: Parameters<typeof createStockTransferService>[2]) {
    this.assertPermission('inventory:transfer:create');
    return await createStockTransferService(centralStore, this.context, params);
  }

  public getStockTransfers() {
    this.assertPermission('inventory:stock:view');
    return getStockTransfersService(centralStore, this.context);
  }

  public async createStockAdjustment(params: Parameters<typeof createStockAdjustmentService>[2]) {
    this.assertPermission('inventory:adjustment:create');
    return await createStockAdjustmentService(centralStore, this.context, params);
  }

  public getStockAdjustments() {
    this.assertPermission('inventory:stock:view');
    return getStockAdjustmentsService(centralStore, this.context);
  }

  public createStocktake(params: Parameters<typeof createStocktakeService>[2]) {
    this.assertPermission('inventory:stocktake:create');
    return createStocktakeService(centralStore, this.context, params);
  }

  public enterStocktakeCounts(stocktakeId: string, counts: Parameters<typeof enterStocktakeCountsService>[3]) {
    this.assertPermission('inventory:stocktake:count');
    return enterStocktakeCountsService(centralStore, this.context, stocktakeId, counts);
  }

  public async approveStocktake(stocktakeId: string) {
    this.assertPermission('inventory:stocktake:approve');
    return await approveStocktakeService(centralStore, this.context, stocktakeId);
  }

  public getStocktakes() {
    this.assertPermission('inventory:stock:view');
    return getStocktakesService(centralStore, this.context);
  }

  public async createLandedCostDocument(params: Parameters<typeof createLandedCostDocumentService>[2]) {
    this.assertPermission('inventory:landed_cost:create');
    return await createLandedCostDocumentService(centralStore, this.context, params);
  }

  public getLandedCostDocuments() {
    this.assertPermission('inventory:stock:view');
    return getLandedCostDocumentsService(centralStore, this.context);
  }

  public getStockAsOfDate(asOfDate: string, itemId?: string, warehouseId?: string) {
    this.assertPermission('inventory:stock:view');
    return getStockAsOfDateService(centralStore, this.context, asOfDate, itemId, warehouseId);
  }

  public getLowStockAlerts() {
    this.assertPermission('inventory:stock:view');
    return getLowStockAlertsService(centralStore, this.context);
  }

  // =========================================================================
  // PURCHASING & ACCOUNTS PAYABLE (PHASE-06 & PHASE-08)
  // =========================================================================
  public getPurchaseRequests(filters?: Parameters<typeof getPurchaseRequestsService>[2]) {
    this.assertPermission('purchasing:order:view');
    return getPurchaseRequestsService(centralStore, this.context, filters);
  }

  public getPurchaseRequestById(id: string) {
    this.assertPermission('purchasing:order:view');
    return getPurchaseRequestByIdService(centralStore, this.context, id);
  }

  public createPurchaseRequest(payload: Parameters<typeof createPurchaseRequestService>[2]) {
    this.assertPermission('purchasing:order:create');
    return createPurchaseRequestService(centralStore, this.context, payload);
  }

  public submitPurchaseRequest(id: string) {
    this.assertPermission('purchasing:order:create');
    return submitPurchaseRequestService(centralStore, this.context, id);
  }

  public approvePurchaseRequest(id: string) {
    this.assertPermission('purchasing:order:create');
    return approvePurchaseRequestService(centralStore, this.context, id);
  }

  public rejectPurchaseRequest(id: string, reason: string) {
    this.assertPermission('purchasing:order:create');
    return rejectPurchaseRequestService(centralStore, this.context, id, reason);
  }

  public convertPRToPO(prId: string, supplierId: string) {
    this.assertPermission('purchasing:order:create');
    return convertPRToPOService(centralStore, this.context, prId, supplierId);
  }

  public getPurchaseOrders(filters?: { search?: string; status?: string; supplierId?: string }) {
    this.assertPermission('purchasing:order:view');
    return getPurchaseOrdersService(centralStore, this.context, filters);
  }

  public getPurchaseOrderById(id: string) {
    this.assertPermission('purchasing:order:view');
    return getPurchaseOrderByIdService(centralStore, this.context, id);
  }

  public createPurchaseOrder(payload: Parameters<typeof createPurchaseOrderService>[2]) {
    this.assertPermission('purchasing:order:create');
    return createPurchaseOrderService(centralStore, this.context, payload);
  }

  public confirmPurchaseOrder(id: string) {
    this.assertPermission('purchasing:order:create');
    return confirmPurchaseOrderService(centralStore, this.context, id);
  }

  public cancelPurchaseOrder(id: string, reason?: string) {
    this.assertPermission('purchasing:order:create');
    return cancelPurchaseOrderService(centralStore, this.context, id, reason);
  }

  public getGoodsReceiptNotes(filters?: Parameters<typeof getGoodsReceiptNotesService>[2]) {
    this.assertPermission('purchasing:order:view');
    return getGoodsReceiptNotesService(centralStore, this.context, filters);
  }

  public getGoodsReceiptNoteById(id: string) {
    this.assertPermission('purchasing:order:view');
    return getGoodsReceiptNoteByIdService(centralStore, this.context, id);
  }

  public createGoodsReceiptNote(payload: Parameters<typeof createGoodsReceiptNoteService>[2]) {
    this.assertPermission('purchasing:order:create');
    return createGoodsReceiptNoteService(centralStore, this.context, payload);
  }

  public allocateLandedCost(payload: Parameters<typeof allocateLandedCostService>[2]) {
    this.assertPermission('purchasing:bill:create');
    return allocateLandedCostService(centralStore, this.context, payload);
  }

  public getThreeWayMatchingReport(params: Parameters<typeof getThreeWayMatchingReportService>[2]) {
    this.assertPermission('purchasing:bill:view');
    return getThreeWayMatchingReportService(centralStore, this.context, params);
  }

  public overrideThreeWayMatch(params: Parameters<typeof overrideThreeWayMatchService>[2]) {
    this.assertPermission('purchasing:bill:post');
    return overrideThreeWayMatchService(centralStore, this.context, params);
  }

  public getPurchaseBills(filters?: { search?: string; status?: string; supplierId?: string }) {
    this.assertPermission('purchasing:bill:view');
    return getPurchaseBillsService(centralStore, this.context, filters);
  }

  public getPurchaseBillById(id: string) {
    this.assertPermission('purchasing:bill:view');
    return getPurchaseBillByIdService(centralStore, this.context, id);
  }

  public createPurchaseBill(payload: Parameters<typeof createPurchaseBillService>[2]) {
    this.assertPermission('purchasing:bill:create');
    return createPurchaseBillService(centralStore, this.context, payload);
  }

  public postPurchaseBill(id: string) {
    this.assertPermission('purchasing:bill:post');
    return postPurchaseBillService(centralStore, this.context, id);
  }

  public getVendorDebitNotes(filters?: { search?: string; supplierId?: string }) {
    this.assertPermission('purchasing:bill:view');
    return getVendorDebitNotesService(centralStore, this.context, filters);
  }

  public getVendorDebitNoteById(id: string) {
    this.assertPermission('purchasing:bill:view');
    return getVendorDebitNoteByIdService(centralStore, this.context, id);
  }

  public createVendorDebitNote(payload: Parameters<typeof createVendorDebitNoteService>[2]) {
    this.assertPermission('purchasing:bill:create');
    return createVendorDebitNoteService(centralStore, this.context, payload);
  }

  public getSupplierPayments(filters?: { search?: string; supplierId?: string }) {
    this.assertPermission('purchasing:payment:view');
    return getSupplierPaymentsService(centralStore, this.context, filters);
  }

  public getSupplierPaymentById(id: string) {
    this.assertPermission('purchasing:payment:view');
    return getSupplierPaymentByIdService(centralStore, this.context, id);
  }

  public createSupplierPayment(payload: Parameters<typeof createSupplierPaymentService>[2]) {
    this.assertPermission('purchasing:payment:create');
    return createSupplierPaymentService(centralStore, this.context, payload);
  }

  public reallocateSupplierPayment(paymentId: string, newAllocations: Parameters<typeof reallocateSupplierPaymentService>[3]) {
    this.assertPermission('purchasing:payment:create');
    return reallocateSupplierPaymentService(centralStore, this.context, paymentId, newAllocations);
  }

  public getSupplierStatement(supplierId: string, dateFrom?: string, dateTo?: string) {
    this.assertPermission('purchasing:supplier:view');
    return getSupplierStatementService(centralStore, this.context, supplierId, dateFrom, dateTo);
  }

  public getSupplierAging() {
    this.assertPermission('purchasing:supplier:view');
    return getSupplierAgingService(centralStore, this.context);
  }

  public getSupplierPriceHistory(filters?: Parameters<typeof getSupplierPriceHistoryService>[2]) {
    this.assertPermission('purchasing:order:view');
    return getSupplierPriceHistoryService(centralStore, this.context, filters);
  }

  public getLastPurchasePrice(params: Parameters<typeof getLastPurchasePriceService>[2]) {
    this.assertPermission('purchasing:order:view');
    return getLastPurchasePriceService(centralStore, this.context, params);
  }

  // ==========================================
  // TREASURY REPOSITORY METHODS (Phase 08)
  // ==========================================
  public getTreasuryAccounts(filters?: { type?: string; status?: string; search?: string }) {
    this.assertPermission('treasury:account:view');
    return getTreasuryAccountsService(centralStore, this.context.tenantId, filters);
  }

  public getTreasuryAccountById(id: string) {
    this.assertPermission('treasury:account:view');
    return getTreasuryAccountByIdService(centralStore, this.context.tenantId, id);
  }

  public createTreasuryAccount(payload: Parameters<typeof createTreasuryAccountService>[2]) {
    this.assertPermission('treasury:account:manage');
    return createTreasuryAccountService(centralStore, this.context, payload);
  }

  public updateTreasuryAccount(id: string, updates: Parameters<typeof updateTreasuryAccountService>[3]) {
    this.assertPermission('treasury:account:manage');
    return updateTreasuryAccountService(centralStore, this.context, id, updates);
  }

  public setTreasuryAccountStatus(id: string, status: 'ACTIVE' | 'FROZEN' | 'CLOSED') {
    this.assertPermission('treasury:account:manage');
    return setTreasuryAccountStatusService(centralStore, this.context, id, status);
  }

  public getTreasuryReceipts(filters?: { category?: string; status?: string; customerId?: string; search?: string }) {
    this.assertPermission('treasury:receipt:view');
    return getTreasuryReceiptsService(centralStore, this.context.tenantId, filters);
  }

  public getTreasuryReceiptById(id: string) {
    this.assertPermission('treasury:receipt:view');
    return getTreasuryReceiptByIdService(centralStore, this.context.tenantId, id);
  }

  public createTreasuryReceipt(payload: Parameters<typeof createTreasuryReceiptService>[2]) {
    this.assertPermission('treasury:receipt:create');
    return createTreasuryReceiptService(centralStore, this.context, payload);
  }

  public getTreasuryPayments(filters?: { category?: string; status?: string; supplierId?: string; search?: string }) {
    this.assertPermission('treasury:payment:view');
    return getTreasuryPaymentsService(centralStore, this.context.tenantId, filters);
  }

  public getTreasuryPaymentById(id: string) {
    this.assertPermission('treasury:payment:view');
    return getTreasuryPaymentByIdService(centralStore, this.context.tenantId, id);
  }

  public createTreasuryPayment(payload: Parameters<typeof createTreasuryPaymentService>[2]) {
    this.assertPermission('treasury:payment:create');
    return createTreasuryPaymentService(centralStore, this.context, payload);
  }

  public getTreasuryTransfers() {
    this.assertPermission('treasury:transfer:view');
    return getTreasuryTransfersService(centralStore, this.context.tenantId);
  }

  public getTreasuryTransferById(id: string) {
    this.assertPermission('treasury:transfer:view');
    return getTreasuryTransferByIdService(centralStore, this.context.tenantId, id);
  }

  public createTreasuryTransfer(payload: Parameters<typeof createTreasuryTransferService>[2]) {
    this.assertPermission('treasury:transfer:create');
    return createTreasuryTransferService(centralStore, this.context, payload);
  }

  public getPettyCashSettlements(filters?: { custodyAccountId?: string; status?: string }) {
    this.assertPermission('treasury:petty_cash:view');
    return getPettyCashSettlementsService(centralStore, this.context.tenantId, filters);
  }

  public getPettyCashSettlementById(id: string) {
    this.assertPermission('treasury:petty_cash:view');
    return getPettyCashSettlementByIdService(centralStore, this.context.tenantId, id);
  }

  public createPettyCashSettlement(payload: Parameters<typeof createPettyCashSettlementService>[2]) {
    this.assertPermission('treasury:petty_cash:manage');
    return createPettyCashSettlementService(centralStore, this.context, payload);
  }

  public getBankStatements(treasuryAccountId?: string) {
    this.assertPermission('treasury:reconciliation:view');
    return getBankStatementsService(centralStore, this.context.tenantId, treasuryAccountId);
  }

  public uploadBankStatement(payload: Parameters<typeof uploadBankStatementService>[2]) {
    this.assertPermission('treasury:reconciliation:manage');
    return uploadBankStatementService(centralStore, this.context, payload);
  }

  public getBankReconciliations(treasuryAccountId?: string) {
    this.assertPermission('treasury:reconciliation:view');
    return getBankReconciliationsService(centralStore, this.context.tenantId, treasuryAccountId);
  }

  public createBankReconciliation(payload: Parameters<typeof createBankReconciliationService>[2]) {
    this.assertPermission('treasury:reconciliation:manage');
    return createBankReconciliationService(centralStore, this.context, payload);
  }

  public getCheques(filters?: { type?: string; status?: string; search?: string }) {
    this.assertPermission('treasury:cheque:view');
    return getChequesService(centralStore, this.context.tenantId, filters);
  }

  public clearCheque(chequeId: string, depositBankAccountId: string) {
    this.assertPermission('treasury:cheque:manage');
    return clearChequeService(centralStore, this.context, chequeId, depositBankAccountId);
  }

  public bounceCheque(chequeId: string, reason: string) {
    this.assertPermission('treasury:cheque:manage');
    return bounceChequeService(centralStore, this.context, chequeId, reason);
  }

  public getTreasuryOverviewMetrics() {
    this.assertPermission('treasury:overview:view');
    return getTreasuryOverviewMetricsService(centralStore, this.context.tenantId);
  }
}

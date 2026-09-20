import { validateSaudiVat, validateSaudiCR, validateSaudi700Number } from '../utils/saudiValidators.js';

export type PartyType = 'INDIVIDUAL' | 'ESTABLISHMENT' | 'COMPANY' | 'GOVERNMENT' | 'FOREIGN';
export type SupplierClassification = 'LOCAL' | 'INTERNATIONAL' | 'NON_VAT';
export type PartyStatus = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
export type PaymentTerms = 'IMMEDIATE' | 'NET_15' | 'NET_30' | 'NET_60' | 'NET_90' | 'EOM_30' | 'CUSTOM';
export type CustomerGroup = 'RETAIL' | 'WHOLESALE' | 'VIP' | 'KEY_ACCOUNT' | 'GOVERNMENT';
export type SupplierGroup = 'RAW_MATERIALS' | 'COMMODITIES' | 'SERVICES' | 'IMPORTERS' | 'LOGISTICS';
export type PriceListType = 'RETAIL' | 'WHOLESALE' | 'DISTRIBUTOR' | 'SPECIAL';
export type TaxCategory = 'STANDARD_15' | 'ZERO_RATED' | 'EXEMPT' | 'OUT_OF_SCOPE';
export type AttachmentType = 'CR_COPY' | 'VAT_CERTIFICATE' | 'CONTRACT' | 'BANK_LETTER' | 'NATIONAL_ID' | 'OTHER';

export interface StructuredAddress {
  buildingNumber?: string;
  street?: string;
  district?: string;
  city?: string;
  postalCode?: string;
  additionalNumber?: string;
  country?: string; // Default 'SA'
  formattedAddress?: string;
}

export interface PartyAttachment {
  id: string;
  partyId: string;
  name: string;
  type: AttachmentType;
  fileSize: number;
  mimeType: string;
  url?: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface PartyContract {
  id: string;
  supplierId: string;
  contractNumber: string;
  titleAr: string;
  titleEn: string;
  startDate: string;
  endDate: string;
  valueSar: number;
  attachmentId?: string;
  status: 'ACTIVE' | 'EXPIRED' | 'TERMINATED';
  notes?: string;
  createdAt: string;
}

export interface SupplierPriceRecord {
  id: string;
  supplierId: string;
  itemId: string;
  itemSku: string;
  itemNameAr: string;
  unitPriceSar: number;
  recordedFrom: 'PURCHASE_BILL' | 'PRICE_LIST' | 'MANUAL';
  billReference?: string;
  recordedAt: string;
}

export interface TimelineEvent {
  id: string;
  timestamp: string;
  eventType: 'CREATED' | 'UPDATED' | 'STATUS_CHANGE' | 'CREDIT_LIMIT_CHANGE' | 'ATTACHMENT_ADDED' | 'AUDIT_OVERRIDE';
  descriptionAr: string;
  descriptionEn: string;
  performedBy: string;
  details?: Record<string, any>;
}

export interface Customer {
  id: string;
  tenantId: string;
  code: string; // e.g. CUST-0001
  nameAr: string;
  nameEn: string;
  type: PartyType;
  vatNumber?: string;
  crNumber?: string;
  unifiedNumber?: string;
  mobile: string;
  email?: string;
  address: StructuredAddress;
  paymentTerms: PaymentTerms;
  customPaymentDays?: number;
  creditLimit: number; // in SAR
  creditHold: boolean;
  cashOnly: boolean;
  salesRepId?: string;
  salesRepName?: string;
  accountManagerId?: string;
  accountManagerName?: string;
  customerGroup: CustomerGroup;
  priceList: PriceListType;
  defaultDiscountPercent: number;
  taxCategory: TaxCategory;
  status: PartyStatus;
  subaccountId: string;
  subaccountCode: string;
  attachments: PartyAttachment[];
  timeline: TimelineEvent[];
  ledgerBalanceSar?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: string;
  tenantId: string;
  code: string; // e.g. SUPP-0001
  nameAr: string;
  nameEn: string;
  type: PartyType;
  supplierType: SupplierClassification;
  supplierClassification?: SupplierClassification;
  vatNumber?: string;
  crNumber?: string;
  unifiedNumber?: string;
  bankIban?: string;
  ledgerBalanceSar?: number;
  mobile: string;
  email?: string;
  address: StructuredAddress;
  paymentTerms: PaymentTerms;
  customPaymentDays?: number;
  creditLimit: number;
  supplierGroup: SupplierGroup;
  taxCategory: TaxCategory;
  status: PartyStatus;
  subaccountId: string;
  subaccountCode: string;
  attachments: PartyAttachment[];
  contracts: PartyContract[];
  priceHistory: SupplierPriceRecord[];
  timeline: TimelineEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface PartyLedgerStatementLine {
  id: string;
  entryNumber: string;
  entryDate: string;
  date?: string;
  documentType?: string;
  description?: string;
  descriptionAr: string;
  descriptionEn: string;
  debitCents: bigint;
  creditCents: bigint;
  debitSar: number;
  creditSar: number;
  runningBalanceSar: number;
  sourceType: string;
  sourceId: string;
}

export interface PartyDetailSummary {
  ledgerBalanceSar: number;
  ledgerBalanceHalalas: string;
  openInvoicesCount: number;
  overdueAmountSar: number;
  ytdVolumeSar: number;
}

export interface CreditEvaluationResult {
  allowed: boolean;
  status: 'GOOD' | 'WARNING' | 'EXCEEDED' | 'BLOCKED';
  currentBalanceSar: number;
  creditLimitSar: number;
  availableCreditSar: number;
  proposedAmountSar: number;
  newBalanceSar: number;
  exceededBySar?: number;
  reason?: string;
  reasonAr?: string;
}

export interface ImportRowError {
  rowNumber: number;
  row?: number;
  column: string;
  value: string;
  messageAr: string;
  messageEn: string;
}

export interface BatchImportReport {
  batchId: string;
  entity: 'CUSTOMER' | 'SUPPLIER';
  mode: 'CREATE_ONLY' | 'UPDATE_ONLY' | 'CREATE_OR_UPDATE';
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  success?: boolean;
  successfulRows?: number;
  failedRows?: number;
  errors: ImportRowError[];
  createdAt: string;
}

// ==========================================
// 1. PAYMENT TERMS DUE-DATE ENGINE
// ==========================================
export function calculateDueDate(issueDateStr: string, terms: PaymentTerms, customDays?: number): string {
  const [yearStr, monthStr, dayStr] = issueDateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10); // 1-12
  const day = parseInt(dayStr, 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    throw new Error(`Invalid issue date format: ${issueDateStr}. Expected YYYY-MM-DD`);
  }

  const baseDate = new Date(Date.UTC(year, month - 1, day));

  switch (terms) {
    case 'IMMEDIATE':
      return issueDateStr;

    case 'NET_15':
      baseDate.setUTCDate(baseDate.getUTCDate() + 15);
      return baseDate.toISOString().slice(0, 10);

    case 'NET_30':
      baseDate.setUTCDate(baseDate.getUTCDate() + 30);
      return baseDate.toISOString().slice(0, 10);

    case 'NET_60':
      baseDate.setUTCDate(baseDate.getUTCDate() + 60);
      return baseDate.toISOString().slice(0, 10);

    case 'NET_90':
      baseDate.setUTCDate(baseDate.getUTCDate() + 90);
      return baseDate.toISOString().slice(0, 10);

    case 'EOM_30': {
      // Find end of current month
      // Date.UTC(year, month, 0) gives the last day of month (since month is 1-indexed)
      const lastDayOfMonth = new Date(Date.UTC(year, month, 0));
      // Add 30 days
      lastDayOfMonth.setUTCDate(lastDayOfMonth.getUTCDate() + 30);
      return lastDayOfMonth.toISOString().slice(0, 10);
    }

    case 'CUSTOM': {
      const days = customDays && customDays > 0 ? customDays : 30;
      baseDate.setUTCDate(baseDate.getUTCDate() + days);
      return baseDate.toISOString().slice(0, 10);
    }

    default:
      return issueDateStr;
  }
}

// ==========================================
// 2. CREDIT EVALUATION SERVICE HOOK
// ==========================================
export function evaluateCustomerCredit(
  customer: Customer,
  currentBalanceSar: number,
  proposedAmountSar: number = 0
): CreditEvaluationResult {
  // 1. Suspended status check
  if (customer.status === 'SUSPENDED') {
    return {
      allowed: false,
      status: 'BLOCKED',
      currentBalanceSar,
      creditLimitSar: customer.creditLimit,
      availableCreditSar: 0,
      proposedAmountSar,
      newBalanceSar: currentBalanceSar + proposedAmountSar,
      reason: 'Customer account is suspended. Transactions are blocked.',
      reasonAr: 'حساب العميل موقوف. العمليات محظورة تماماً.',
    };
  }

  // 2. Cash-Only check
  if (customer.cashOnly && proposedAmountSar > 0) {
    return {
      allowed: false,
      status: 'BLOCKED',
      currentBalanceSar,
      creditLimitSar: 0,
      availableCreditSar: 0,
      proposedAmountSar,
      newBalanceSar: currentBalanceSar + proposedAmountSar,
      reason: 'Customer is flagged as Cash-Only. Credit sales are forbidden.',
      reasonAr: 'العميل مقيد بالمبيعات النقدية فقط. البيع الآجل ممنوع.',
    };
  }

  // 3. Credit-Hold check
  if (customer.creditHold && proposedAmountSar > 0) {
    return {
      allowed: false,
      status: 'BLOCKED',
      currentBalanceSar,
      creditLimitSar: customer.creditLimit,
      availableCreditSar: 0,
      proposedAmountSar,
      newBalanceSar: currentBalanceSar + proposedAmountSar,
      reason: 'Credit hold is actively placed on this customer account.',
      reasonAr: 'تم تفعيل حظر الائتمان على حساب هذا العميل.',
    };
  }

  const limit = customer.creditLimit || 0;
  const newBalance = currentBalanceSar + proposedAmountSar;
  const availableCredit = Math.max(0, limit - currentBalanceSar);

  // If no limit is set (limit === 0), it is unlimited credit or handled via manual approval
  if (limit === 0) {
    return {
      allowed: true,
      status: 'GOOD',
      currentBalanceSar,
      creditLimitSar: 0,
      availableCreditSar: 999999999,
      proposedAmountSar,
      newBalanceSar: newBalance,
    };
  }

  if (newBalance > limit) {
    const exceeded = newBalance - limit;
    return {
      allowed: false,
      status: 'EXCEEDED',
      currentBalanceSar,
      creditLimitSar: limit,
      availableCreditSar: availableCredit,
      proposedAmountSar,
      newBalanceSar: newBalance,
      exceededBySar: exceeded,
      reason: `Credit limit exceeded by ${exceeded.toFixed(2)} SAR. (Limit: ${limit.toFixed(2)} SAR, New Balance: ${newBalance.toFixed(2)} SAR)`,
      reasonAr: `تم تجاوز الحد الائتماني بمقدار ${exceeded.toFixed(2)} ﷼. (الحد: ${limit.toFixed(2)} ﷼، الرصيد الجديد: ${newBalance.toFixed(2)} ﷼)`,
    };
  }

  // Warning threshold: if new balance reaches >= 90% of credit limit
  const isNearLimit = newBalance >= limit * 0.9;
  return {
    allowed: true,
    status: isNearLimit ? 'WARNING' : 'GOOD',
    currentBalanceSar,
    creditLimitSar: limit,
    availableCreditSar: Math.max(0, limit - newBalance),
    proposedAmountSar,
    newBalanceSar: newBalance,
  };
}

// ==========================================
// 3. SAUDI FIELD VALIDATORS
// ==========================================
export function validateSaudiMobile(mobile: string): boolean {
  if (!mobile) return false;
  const clean = mobile.replace(/[\s\-\(\)]/g, '');
  // Saudi mobile patterns: 05xxxxxxxx, +9665xxxxxxxx, 9665xxxxxxxx, 009665xxxxxxxx
  return /^(?:\+966|00966|966)?0?5[0-9]{8}$/.test(clean);
}

export function normalizeSaudiMobile(mobile: string): string {
  if (!mobile) return '';
  let clean = mobile.replace(/[\s\-\(\)]/g, '');
  if (clean.startsWith('00966')) clean = '+966' + clean.slice(5);
  else if (clean.startsWith('966')) clean = '+966' + clean.slice(3);
  else if (clean.startsWith('05')) clean = '+966' + clean.slice(1);
  else if (clean.startsWith('5') && clean.length === 9) clean = '+966' + clean;
  return clean;
}

export function validatePartyLegalData(party: {
  type: PartyType;
  vatNumber?: string;
  crNumber?: string;
  unifiedNumber?: string;
  mobile: string;
}): { isValid: boolean; errors: { field: string; messageAr: string; messageEn: string }[] } {
  const errors: { field: string; messageAr: string; messageEn: string }[] = [];

  // Mobile validation (mandatory)
  if (!party.mobile || !validateSaudiMobile(party.mobile)) {
    errors.push({
      field: 'mobile',
      messageAr: 'رقم الجوال غير صحيح. يجب أن يكون رقم جوال سعودي يبدأ بـ 05 ويتكون من 10 أرقام.',
      messageEn: 'Invalid mobile number. Must be a valid Saudi mobile number (e.g. 05XXXXXXXX).',
    });
  }

  // VAT validation (if provided)
  if (party.vatNumber && party.vatNumber.trim() !== '') {
    if (!validateSaudiVat(party.vatNumber.trim())) {
      errors.push({
        field: 'vatNumber',
        messageAr: 'الرقم الضريبي غير صالح. يجب أن يتكون من 15 رقماً ويبدأ وينتهي بالرقم 3 وفق هيئة الزكاة والضريبة.',
        messageEn: 'Invalid VAT number. Must be 15 digits starting and ending with 3 per ZATCA rules.',
      });
    }
  }

  // CR validation (if provided)
  if (party.crNumber && party.crNumber.trim() !== '') {
    if (!validateSaudiCR(party.crNumber.trim())) {
      errors.push({
        field: 'crNumber',
        messageAr: 'رقم السجل التجاري غير صالح. يجب أن يتكون من 10 أرقام.',
        messageEn: 'Invalid Commercial Registration (CR) number. Must be exactly 10 digits.',
      });
    }
  }

  // Unified 700 Number (if provided)
  if (party.unifiedNumber && party.unifiedNumber.trim() !== '') {
    if (!validateSaudi700Number(party.unifiedNumber.trim())) {
      errors.push({
        field: 'unifiedNumber',
        messageAr: 'الرقم الموحد 700 غير صالح. يجب أن يتكون من 10 أرقام ويبدأ بالرقم 7.',
        messageEn: 'Invalid 700 Unified Number. Must be 10 digits starting with 7.',
      });
    }
  }

  // Corporate validation requirements: Companies and Establishments should have either CR or VAT
  if ((party.type === 'COMPANY' || party.type === 'ESTABLISHMENT') && !party.crNumber && !party.vatNumber) {
    errors.push({
      field: 'type',
      messageAr: 'الشركات والمؤسسات تتطلب إدخال رقم السجل التجاري أو الرقم الضريبي.',
      messageEn: 'Companies and Establishments require either a CR number or a VAT number.',
    });
  }

  return { isValid: errors.length === 0, errors };
}

// ==========================================
// 4. CSV TEMPLATES FOR IMPORT & EXPORT
// ==========================================
export const CUSTOMER_CSV_TEMPLATE = `\uFEFFnameAr,nameEn,type,vatNumber,crNumber,unifiedNumber,mobile,email,customerGroup,paymentTerms,creditLimit,buildingNumber,street,district,city,postalCode
شركة الأفق السريع المحدودة,Fast Horizon Ltd,COMPANY,300123456700003,1010887766,7001234567,0551122334,contact@fasthorizon.sa,WHOLESALE,NET_30,100000,7421,طريق الملك فهد,العليا,الرياض,12211
مؤسسة النور للتجارة,Al-Noor Trading Est,ESTABLISHMENT,310987654300003,1010776655,,0509988776,info@alnoor.sa,RETAIL,NET_15,25000,3214,شارع الستين,الملز,الرياض,12836
خالد بن عبدالعزيز الشمري,Khaled Al-Shammari,INDIVIDUAL,,,0543322110,khaled@gmail.com,RETAIL,IMMEDIATE,0,1234,شارع التحلية,السليمانية,الرياض,12243`;

export const SUPPLIER_CSV_TEMPLATE = `\uFEFFnameAr,nameEn,type,supplierType,vatNumber,crNumber,unifiedNumber,mobile,email,supplierGroup,paymentTerms,creditLimit,buildingNumber,street,district,city,postalCode
شركة المطاحن الأولى,First Mills Company,COMPANY,LOCAL,300554433200003,1010334455,7005544332,sales@firstmills.sa,RAW_MATERIALS,NET_60,200000,8821,المنطقة الصناعية الثانية,المصانع,الرياض,14331
مزارع النخيل الذهبية,Golden Palm Farms,ESTABLISHMENT,LOCAL,300778899100003,1010445566,,0501144778,orders@goldenpalm.sa,COMMODITIES,NET_30,50000,4321,طريق الخرج,المناخ,الرياض,14312
شركة الاستيراد العالمية,Global Import Corp,COMPANY,INTERNATIONAL,,,,+966540001122,info@globalimport.com,IMPORTERS,NET_90,500000,1000,طريق الميناء,الميناء,جدة,21411`;

import { CentralTenantDataStore } from '../../core/tenantGuard.js';
import {
  ImportTemplate,
  ImportMode,
  ImportValidationError,
  ValidationResult,
} from './types.js';
import { IMPORT_TEMPLATES_CONFIG } from './templateDefinitions.js';
import {
  validateSaudiVatNumber,
  validateSaudiCrNumber,
  validateSaudiIban,
} from '../../../src/utils/saudiValidators.js';

export function normalizeSaudiMobile(phone: string): string {
  if (!phone) return '';
  let clean = phone.replace(/[\s\-\(\)]/g, '').trim();
  if (clean.startsWith('+966')) {
    clean = '0' + clean.slice(4);
  } else if (clean.startsWith('00966')) {
    clean = '0' + clean.slice(5);
  } else if (clean.startsWith('966')) {
    clean = '0' + clean.slice(3);
  } else if (clean.startsWith('5') && clean.length === 9) {
    clean = '0' + clean;
  }
  return clean;
}

export function isValidSaudiMobile(phone: string): boolean {
  const norm = normalizeSaudiMobile(phone);
  return /^05\d{8}$/.test(norm);
}

export function validateImportRows(
  store: CentralTenantDataStore,
  tenantId: string,
  template: ImportTemplate,
  mode: ImportMode,
  rows: Record<string, any>[]
): ValidationResult {
  const config = IMPORT_TEMPLATES_CONFIG[template];
  if (!config) {
    return {
      isValid: false,
      totalRows: rows.length,
      validRows: 0,
      errorRows: rows.length,
      warningRows: 0,
      errors: [
        {
          rowNumber: 0,
          field: 'template',
          value: template,
          errorCode: 'INVALID_TEMPLATE',
          messageAr: `قالب الاستيراد غير معروف: ${template}`,
          messageEn: `Unknown import template: ${template}`,
          severity: 'ERROR',
        },
      ],
      summaryMessageAr: 'قالب غير معروف',
      summaryMessageEn: 'Unknown template',
    };
  }

  const errors: ImportValidationError[] = [];
  const validRowIndices = new Set<number>();

  // Fetch current tenant datasets for referential and key lookups
  const existingCustomers = store.customers.get(tenantId) || [];
  const existingSuppliers = store.suppliers.get(tenantId) || [];
  const existingItems = store.items.get(tenantId) || [];
  const existingAccounts = store.accounts.get(tenantId) || [];
  const existingWarehouses = store.warehouses.get(tenantId) || [];
  const existingInvoices = store.salesInvoices.get(tenantId) || [];
  const existingBills = store.purchaseBills.get(tenantId) || [];
  const existingPayments = [
    ...(store.customerReceipts.get(tenantId) || []),
    ...(store.supplierPayments.get(tenantId) || []),
  ];
  const existingJournals = store.journals.get(tenantId) || [];

  // Intra-file duplicates tracker
  const seenPrimaryKeys = new Map<string, number>(); // key -> first rowNumber
  const seenMobiles = new Map<string, number>();
  const seenVats = new Map<string, number>();

  let runningTotalDebit = 0;
  let runningTotalCredit = 0;

  // Groupings for multi-line transactions (Journal Entries, Sales Invoices, Purchase Bills, Opening Stock)
  const groupedJournals = new Map<string, { totalDebit: number; totalCredit: number; rows: number[] }>();

  rows.forEach((row, idx) => {
    const rowNumber = idx + 1; // 1-based data row
    let rowHasFatalError = false;

    const addError = (
      field: string,
      value: any,
      errorCode: string,
      messageAr: string,
      messageEn: string,
      severity: 'ERROR' | 'WARNING' = 'ERROR'
    ) => {
      errors.push({
        rowNumber,
        field,
        value,
        errorCode,
        messageAr,
        messageEn,
        severity,
      });
      if (severity === 'ERROR') {
        rowHasFatalError = true;
      }
    };

    // 1. Mandatory fields checks
    for (const fieldDef of config.fields) {
      if (fieldDef.required) {
        const val = row[fieldDef.field];
        if (val === undefined || val === null || String(val).trim() === '') {
          addError(
            fieldDef.field,
            val,
            'REQUIRED_FIELD_MISSING',
            `حقل "${fieldDef.labelAr}" مطلوب ولا يمكن أن يكون فارغاً`,
            `Field "${fieldDef.labelEn}" is required and cannot be empty`
          );
        }
      }
    }

    // 2. Specific field validations per template
    switch (template) {
      case 'CUSTOMERS':
      case 'SUPPLIERS': {
        const nameAr = row.nameAr ? String(row.nameAr).trim() : '';
        if (nameAr && nameAr.length < 2) {
          addError('nameAr', nameAr, 'INVALID_NAME', 'اسم الطرف بالعربية يجب أن يحتوي على حرفين على الأقل', 'Arabic name must be at least 2 characters');
        }

        const mobile = row.mobile ? String(row.mobile).trim() : '';
        if (mobile) {
          if (!isValidSaudiMobile(mobile)) {
            addError('mobile', mobile, 'INVALID_SAUDI_MOBILE', 'رقم الجوال غير صحيح. يجب أن يكون رقم جوال سعودي (05XXXXXXXX)', 'Invalid Saudi mobile number (05XXXXXXXX)');
          } else {
            const normMobile = normalizeSaudiMobile(mobile);
            if (seenMobiles.has(normMobile)) {
              addError('mobile', mobile, 'DUPLICATE_IN_FILE', `رقم الجوال مكرر داخل الملف (نفس رقم السطر ${seenMobiles.get(normMobile)})`, `Mobile duplicated within file (same as row ${seenMobiles.get(normMobile)})`);
            } else {
              seenMobiles.set(normMobile, rowNumber);
            }
          }
        }

        const vatNumber = row.vatNumber ? String(row.vatNumber).trim() : '';
        if (vatNumber) {
          const vatCheck = validateSaudiVatNumber(vatNumber);
          if (!vatCheck.valid) {
            addError('vatNumber', vatNumber, 'INVALID_SAUDI_VAT', vatCheck.error || 'الرقم الضريبي غير صحيح (15 خانة يبدأ وينتهي بـ 3)', 'Invalid Saudi VAT number (15 digits, starting & ending with 3)');
          } else {
            if (seenVats.has(vatNumber)) {
              addError('vatNumber', vatNumber, 'DUPLICATE_IN_FILE', `الرقم الضريبي مكرر داخل الملف (نفس رقم السطر ${seenVats.get(vatNumber)})`, `VAT number duplicated within file (same as row ${seenVats.get(vatNumber)})`);
            } else {
              seenVats.set(vatNumber, rowNumber);
            }
          }
        }

        const crNumber = row.crNumber ? String(row.crNumber).trim() : '';
        if (crNumber) {
          const crCheck = validateSaudiCrNumber(crNumber);
          if (!crCheck.valid) {
            addError('crNumber', crNumber, 'INVALID_SAUDI_CR', crCheck.error || 'رقم السجل التجاري غير صحيح (10 خانات)', 'Invalid Saudi CR number (10 digits)');
          }
        }

        if (template === 'SUPPLIERS' && row.bankIban) {
          const ibanCheck = validateSaudiIban(String(row.bankIban).trim());
          if (!ibanCheck.valid) {
            addError('bankIban', row.bankIban, 'INVALID_IBAN', ibanCheck.error || 'رقم الآيبان غير صحيح', 'Invalid Saudi IBAN');
          }
        }

        // Database Key Matching
        const normMob = normalizeSaudiMobile(mobile);
        const matched = template === 'CUSTOMERS'
          ? existingCustomers.find((c) => (vatNumber && c.vatNumber === vatNumber) || (normMob && normalizeSaudiMobile(c.mobile) === normMob))
          : existingSuppliers.find((s) => (vatNumber && s.vatNumber === vatNumber) || (normMob && normalizeSaudiMobile(s.mobile) === normMob));

        if (mode === 'CREATE_ONLY' && matched) {
          addError('primaryKey', vatNumber || mobile, 'RECORD_ALREADY_EXISTS', `السجل مسجل مسبقاً بالنظام برمز (${matched.code}) ووضع الاستيراد هو إنشاء فقط`, `Record already exists (${matched.code}) and mode is CREATE_ONLY`);
        } else if (mode === 'UPDATE_ONLY' && !matched) {
          addError('primaryKey', vatNumber || mobile, 'RECORD_NOT_FOUND', `لم يتم العثور على سجل مطابق للتحديث ووضع الاستيراد هو تحديث فقط`, `No matching record found to update and mode is UPDATE_ONLY`);
        }
        break;
      }

      case 'ITEMS': {
        const sku = row.sku ? String(row.sku).trim() : '';
        if (sku) {
          if (seenPrimaryKeys.has(sku)) {
            addError('sku', sku, 'DUPLICATE_IN_FILE', `رمز الصنف (SKU) ${sku} مكرر داخل الملف (سطر ${seenPrimaryKeys.get(sku)})`, `SKU ${sku} is duplicated in file (row ${seenPrimaryKeys.get(sku)})`);
          } else {
            seenPrimaryKeys.set(sku, rowNumber);
          }
        }

        const sellingPrice = Number(row.sellingPrice);
        if (isNaN(sellingPrice) || sellingPrice < 0) {
          addError('sellingPrice', row.sellingPrice, 'INVALID_PRICE', 'سعر البيع يجب أن يكون رقماً موجباً أو صفراً', 'Selling price must be a non-negative number');
        }

        if (row.purchasePrice !== undefined && row.purchasePrice !== null && row.purchasePrice !== '') {
          const purchasePrice = Number(row.purchasePrice);
          if (isNaN(purchasePrice) || purchasePrice < 0) {
            addError('purchasePrice', row.purchasePrice, 'INVALID_PRICE', 'سعر الشراء يجب أن يكون رقماً موجباً أو صفراً', 'Purchase price must be a non-negative number');
          }
        }

        const matchedItem = existingItems.find((i) => i.sku.toLowerCase() === sku.toLowerCase());
        if (mode === 'CREATE_ONLY' && matchedItem) {
          addError('sku', sku, 'ITEM_ALREADY_EXISTS', `رمز الصنف ${sku} مسجل مسبقاً بالنظام ووضع الاستيراد إنشاء فقط`, `SKU ${sku} already exists and mode is CREATE_ONLY`);
        } else if (mode === 'UPDATE_ONLY' && !matchedItem) {
          addError('sku', sku, 'ITEM_NOT_FOUND', `رمز الصنف ${sku} غير موجود بالنظام ووضع الاستيراد تحديث فقط`, `SKU ${sku} not found and mode is UPDATE_ONLY`);
        }
        break;
      }

      case 'ACCOUNTS': {
        const code = row.code ? String(row.code).trim() : '';
        if (code) {
          if (seenPrimaryKeys.has(code)) {
            addError('code', code, 'DUPLICATE_IN_FILE', `رقم الحساب ${code} مكرر في الملف (سطر ${seenPrimaryKeys.get(code)})`, `Account code ${code} duplicated in file (row ${seenPrimaryKeys.get(code)})`);
          } else {
            seenPrimaryKeys.set(code, rowNumber);
          }
        }

        const validTypes = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'COGS', 'EXPENSE'];
        const type = String(row.type || '').toUpperCase().trim();
        if (!validTypes.includes(type)) {
          addError('type', row.type, 'INVALID_ACCOUNT_TYPE', `نوع الحساب غير صالح. الأنواع المتاحة: ${validTypes.join(', ')}`, `Invalid account type. Allowed: ${validTypes.join(', ')}`);
        }

        const matchedAccount = existingAccounts.find((a) => a.code === code);
        if (mode === 'CREATE_ONLY' && matchedAccount) {
          addError('code', code, 'ACCOUNT_ALREADY_EXISTS', `الحساب ${code} مسجل مسبقاً في الدليل المحاسبي`, `Account ${code} already exists in Chart of Accounts`);
        } else if (mode === 'UPDATE_ONLY' && !matchedAccount) {
          addError('code', code, 'ACCOUNT_NOT_FOUND', `الحساب ${code} غير موجود في الدليل المحاسبي للتحديث`, `Account ${code} not found to update`);
        }
        break;
      }

      case 'OPENING_BALANCES': {
        const accountCode = row.accountCode ? String(row.accountCode).trim() : '';
        const debitSar = Number(row.debitSar) || 0;
        const creditSar = Number(row.creditSar) || 0;

        if (debitSar < 0 || creditSar < 0) {
          addError('amounts', { debitSar, creditSar }, 'NEGATIVE_AMOUNT', 'لا يمكن إدخال قيم سالبة في المدين أو الدائن', 'Debit and Credit amounts cannot be negative');
        }

        if (debitSar === 0 && creditSar === 0) {
          addError('amounts', { debitSar, creditSar }, 'ZERO_BALANCE', 'يجب إدخال قيمة للمدين أو الدائن على الأقل', 'Either Debit or Credit must have a non-zero value');
        }

        if (debitSar > 0 && creditSar > 0) {
          addError('amounts', { debitSar, creditSar }, 'BOTH_DEBIT_CREDIT', 'لا يمكن تسجيل مبلغين في المدين والدائن معاً في نفس السطر', 'A single line cannot have both Debit and Credit amounts');
        }

        const accountExists = existingAccounts.some((a) => a.code === accountCode);
        if (!accountExists) {
          addError('accountCode', accountCode, 'ACCOUNT_NOT_FOUND', `رقم الحساب ${accountCode} غير موجود في دليل الحسابات`, `Account code ${accountCode} not found in Chart of Accounts`);
        }

        runningTotalDebit += debitSar;
        runningTotalCredit += creditSar;
        break;
      }

      case 'SALES_INVOICES': {
        const invNum = row.invoiceNumber ? String(row.invoiceNumber).trim() : '';
        const custIdent = row.customerVatOrMobile ? String(row.customerVatOrMobile).trim() : '';
        const itemSku = row.itemSku ? String(row.itemSku).trim() : '';
        const qty = Number(row.quantity);
        const unitPrice = Number(row.unitPrice);

        if (isNaN(qty) || qty <= 0) {
          addError('quantity', row.quantity, 'INVALID_QUANTITY', 'الكمية المباعة يجب أن تكون أكبر من صفر', 'Sold quantity must be greater than zero');
        }
        if (isNaN(unitPrice) || unitPrice < 0) {
          addError('unitPrice', row.unitPrice, 'INVALID_PRICE', 'سعر الوحدة يجب أن يكون رقماً موجباً أو صفراً', 'Unit price must be positive or zero');
        }

        // Check customer existence
        const normCust = normalizeSaudiMobile(custIdent);
        const customerExists = existingCustomers.some((c) => c.vatNumber === custIdent || normalizeSaudiMobile(c.mobile) === normCust || c.code === custIdent);
        if (!customerExists) {
          addError('customerVatOrMobile', custIdent, 'CUSTOMER_NOT_FOUND', `العميل (${custIdent}) غير مسجل في النظام`, `Customer (${custIdent}) not found in system`);
        }

        // Check item existence
        const itemExists = existingItems.some((i) => i.sku.toLowerCase() === itemSku.toLowerCase());
        if (!itemExists) {
          addError('itemSku', itemSku, 'ITEM_NOT_FOUND', `الصنف (${itemSku}) غير مسجل في دليل الأصناف`, `Item (${itemSku}) not found in catalog`);
        }

        const invoiceExists = existingInvoices.some((inv) => inv.invoiceNumber === invNum);
        if (mode === 'CREATE_ONLY' && invoiceExists) {
          addError('invoiceNumber', invNum, 'INVOICE_ALREADY_EXISTS', `الفاتورة رقم ${invNum} مسجلة مسبقاً بالنظام`, `Invoice ${invNum} already exists in system`);
        }
        break;
      }

      case 'PURCHASE_BILLS': {
        const billNum = row.billNumber ? String(row.billNumber).trim() : '';
        const suppIdent = row.supplierVatOrMobile ? String(row.supplierVatOrMobile).trim() : '';
        const itemSku = row.itemSku ? String(row.itemSku).trim() : '';
        const qty = Number(row.quantity);
        const unitCost = Number(row.unitCost);

        if (isNaN(qty) || qty <= 0) {
          addError('quantity', row.quantity, 'INVALID_QUANTITY', 'الكمية المشتراة يجب أن تكون أكبر من صفر', 'Purchased quantity must be greater than zero');
        }
        if (isNaN(unitCost) || unitCost < 0) {
          addError('unitCost', row.unitCost, 'INVALID_COST', 'سعر التكلفة يجب أن يكون رقماً موجباً أو صفراً', 'Unit cost must be positive or zero');
        }

        const normSupp = normalizeSaudiMobile(suppIdent);
        const supplierExists = existingSuppliers.some((s) => s.vatNumber === suppIdent || normalizeSaudiMobile(s.mobile) === normSupp || s.code === suppIdent);
        if (!supplierExists) {
          addError('supplierVatOrMobile', suppIdent, 'SUPPLIER_NOT_FOUND', `المورد (${suppIdent}) غير مسجل في النظام`, `Supplier (${suppIdent}) not found in system`);
        }

        const itemExists = existingItems.some((i) => i.sku.toLowerCase() === itemSku.toLowerCase());
        if (!itemExists) {
          addError('itemSku', itemSku, 'ITEM_NOT_FOUND', `الصنف (${itemSku}) غير مسجل في دليل الأصناف`, `Item (${itemSku}) not found in catalog`);
        }

        const billExists = existingBills.some((b) => b.billNumber === billNum);
        if (mode === 'CREATE_ONLY' && billExists) {
          addError('billNumber', billNum, 'BILL_ALREADY_EXISTS', `فاتورة الشراء رقم ${billNum} مسجلة مسبقاً`, `Purchase bill ${billNum} already exists`);
        }
        break;
      }

      case 'PAYMENTS': {
        const voucherNum = row.voucherNumber ? String(row.voucherNumber).trim() : '';
        const partyIdent = row.partyVatOrMobile ? String(row.partyVatOrMobile).trim() : '';
        const amount = Number(row.amountSar);
        const pType = String(row.paymentType || '').toUpperCase().trim();

        if (isNaN(amount) || amount <= 0) {
          addError('amountSar', row.amountSar, 'INVALID_AMOUNT', 'مبلغ السند يجب أن يكون أكبر من صفر', 'Payment amount must be greater than zero');
        }

        if (pType !== 'RECEIPT' && pType !== 'PAYMENT') {
          addError('paymentType', row.paymentType, 'INVALID_TYPE', 'نوع السند يجب أن يكون إما RECEIPT أو PAYMENT', 'Payment type must be either RECEIPT or PAYMENT');
        }

        const normParty = normalizeSaudiMobile(partyIdent);
        const partyExists = pType === 'RECEIPT'
          ? existingCustomers.some((c) => c.vatNumber === partyIdent || normalizeSaudiMobile(c.mobile) === normParty || c.code === partyIdent)
          : existingSuppliers.some((s) => s.vatNumber === partyIdent || normalizeSaudiMobile(s.mobile) === normParty || s.code === partyIdent);

        if (!partyExists) {
          addError('partyVatOrMobile', partyIdent, 'PARTY_NOT_FOUND', `الطرف المحدد (${partyIdent}) غير موجود بالنظام`, `Specified party (${partyIdent}) not found`);
        }

        const voucherExists = existingPayments.some((p: any) => (p.receiptNumber || p.paymentNumber) === voucherNum);
        if (mode === 'CREATE_ONLY' && voucherExists) {
          addError('voucherNumber', voucherNum, 'VOUCHER_ALREADY_EXISTS', `رقم السند ${voucherNum} مسجل مسبقاً`, `Voucher number ${voucherNum} already exists`);
        }
        break;
      }

      case 'JOURNAL_ENTRIES': {
        const entryNum = row.entryNumber ? String(row.entryNumber).trim() : '';
        const accCode = row.accountCode ? String(row.accountCode).trim() : '';
        const debit = Number(row.debitSar) || 0;
        const credit = Number(row.creditSar) || 0;

        if (debit < 0 || credit < 0) {
          addError('amounts', { debit, credit }, 'NEGATIVE_AMOUNT', 'مبالغ المدين والدائن لا يمكن أن تكون سالبة', 'Debit and Credit amounts cannot be negative');
        }
        if (debit === 0 && credit === 0) {
          addError('amounts', { debit, credit }, 'ZERO_AMOUNT', 'يجب تحديد مبلغ مدين أو دائن في السطر', 'Either debit or credit must have an amount');
        }

        const accExists = existingAccounts.some((a) => a.code === accCode);
        if (!accExists) {
          addError('accountCode', accCode, 'ACCOUNT_NOT_FOUND', `رقم الحساب ${accCode} غير مسجل في الدليل المحاسبي`, `Account code ${accCode} not found`);
        }

        if (entryNum) {
          const grp = groupedJournals.get(entryNum) || { totalDebit: 0, totalCredit: 0, rows: [] };
          grp.totalDebit += debit;
          grp.totalCredit += credit;
          grp.rows.push(rowNumber);
          groupedJournals.set(entryNum, grp);
        }
        break;
      }

      case 'STOCK_OPENING': {
        const whCode = row.warehouseCode ? String(row.warehouseCode).trim() : '';
        const itemSku = row.itemSku ? String(row.itemSku).trim() : '';
        const qty = Number(row.quantity);
        const cost = Number(row.unitCost);

        if (isNaN(qty) || qty <= 0) {
          addError('quantity', row.quantity, 'INVALID_QUANTITY', 'كمية بضاعة أول المدة يجب أن تكون أكبر من صفر', 'Opening stock quantity must be greater than zero');
        }
        if (isNaN(cost) || cost < 0) {
          addError('unitCost', row.unitCost, 'INVALID_COST', 'تكلفة الوحدة يجب أن تكون موجبة أو صفراً', 'Unit cost must be positive or zero');
        }

        const whExists = existingWarehouses.some((w) => w.code.toLowerCase() === whCode.toLowerCase() || w.nameAr.toLowerCase().includes(whCode.toLowerCase()));
        if (!whExists && whCode) {
          addError('warehouseCode', whCode, 'WAREHOUSE_NOT_FOUND', `المستودع (${whCode}) غير مسجل بالنظام`, `Warehouse (${whCode}) not found in system`);
        }

        const itemExists = existingItems.some((i) => i.sku.toLowerCase() === itemSku.toLowerCase());
        if (!itemExists && itemSku) {
          addError('itemSku', itemSku, 'ITEM_NOT_FOUND', `الصنف (${itemSku}) غير مسجل بالنظام`, `Item (${itemSku}) not found in catalog`);
        }
        break;
      }
    }

    if (!rowHasFatalError) {
      validRowIndices.add(idx);
    }
  });

  // 3. Batch-Level Mathematical Rules:

  // Rule G1 for OPENING_BALANCES: Check sum(debit) == sum(credit)
  let openingBalancesDetails: any = undefined;
  if (template === 'OPENING_BALANCES' && rows.length > 0) {
    const diff = Math.abs(runningTotalDebit - runningTotalCredit);
    const isBalanced = diff < 0.001;
    openingBalancesDetails = {
      totalDebitSar: runningTotalDebit,
      totalCreditSar: runningTotalCredit,
      differenceSar: diff,
      balanced: isBalanced,
    };

    if (!isBalanced) {
      const formattedDiff = diff.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const formattedDebit = runningTotalDebit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const formattedCredit = runningTotalCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      errors.push({
        rowNumber: 0,
        field: 'totalBalance',
        value: { totalDebit: runningTotalDebit, totalCredit: runningTotalCredit, difference: diff },
        errorCode: 'RULE_G1_UNBALANCED_OPENING_BALANCES',
        messageAr: `مجموعة الأرصدة الافتتاحية غير متزنة (قاعدة G1): إجمالي المدين (${formattedDebit} ر.س) لا يساوي إجمالي الدائن (${formattedCredit} ر.س)، الفارق هو ${formattedDiff} ر.س. يجب أن يتساوى المدين مع الدائن تماماً للاعتماد.`,
        messageEn: `Opening balances are not balanced (Rule G1): Total Debits (${formattedDebit} SAR) does not equal Total Credits (${formattedCredit} SAR), exact difference is ${formattedDiff} SAR. Entire set must balance to commit.`,
        severity: 'ERROR',
      });
    }
  }

  // Rule G1 for JOURNAL_ENTRIES: Check sum(debit) == sum(credit) per entryNumber
  if (template === 'JOURNAL_ENTRIES') {
    groupedJournals.forEach((grp, entryNum) => {
      const diff = Math.abs(grp.totalDebit - grp.totalCredit);
      if (diff > 0.001) {
        const formattedDiff = diff.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const formattedDebit = grp.totalDebit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const formattedCredit = grp.totalCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        errors.push({
          rowNumber: grp.rows[0] || 0,
          field: 'entryBalance',
          value: { entryNumber: entryNum, totalDebit: grp.totalDebit, totalCredit: grp.totalCredit, difference: diff },
          errorCode: 'RULE_G1_UNBALANCED_JOURNAL_ENTRY',
          messageAr: `القيد المحاسبي رقم (${entryNum}) غير متزن (قاعدة G1): إجمالي المدين (${formattedDebit} ر.س) لا يساوي إجمالي الدائن (${formattedCredit} ر.س)، الفارق هو ${formattedDiff} ر.س`,
          messageEn: `Journal entry (${entryNum}) is unbalanced (Rule G1): Total Debit (${formattedDebit} SAR) != Total Credit (${formattedCredit} SAR), difference is ${formattedDiff} SAR`,
          severity: 'ERROR',
        });
      }
    });
  }

  const errorRowsCount = rows.length - validRowIndices.size;
  const fatalErrorsCount = errors.filter((e) => e.severity === 'ERROR').length;
  const isValid = fatalErrorsCount === 0;

  return {
    isValid,
    totalRows: rows.length,
    validRows: validRowIndices.size,
    errorRows: errorRowsCount,
    warningRows: errors.filter((e) => e.severity === 'WARNING').length,
    errors,
    summaryMessageAr: isValid
      ? `تم فحص ${rows.length} صفاً بنجاح. الملف جاهز للتنفيذ والاعتماد.`
      : `تم اكتشاف ${fatalErrorsCount} خطأ في البيانات عبر ${errorRowsCount} صفاً. يرجى تصحيح الأخطاء قبل الاعتماد.`,
    summaryMessageEn: isValid
      ? `Successfully validated ${rows.length} rows. Ready for transactional commit.`
      : `Found ${fatalErrorsCount} errors across ${errorRowsCount} rows. Fix errors before commit.`,
    details: openingBalancesDetails,
  };
}

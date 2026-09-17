import '../src/lib/load-env';
import { getDb, closePool } from '../src/db/client';
import {
  chartTemplateAccounts,
  systemDocumentTypes,
  systemRoles,
  systemTaxRates,
  systemUnits,
} from '../src/db/schema';

const roles = [
  ['super_admin', 'Super Admin', 'مدير النظام'],
  ['admin', 'Admin', 'مدير'],
  ['accountant', 'Accountant', 'محاسب'],
  ['sales', 'Sales', 'مبيعات'],
  ['purchases', 'Purchases', 'مشتريات'],
  ['viewer', 'Viewer', 'مشاهد'],
] as const;
const units = [
  ['EA', 'Each', 'قطعة'],
  ['KG', 'Kilogram', 'كيلوغرام'],
  ['G', 'Gram', 'غرام'],
  ['L', 'Litre', 'لتر'],
  ['M', 'Metre', 'متر'],
  ['BOX', 'Box', 'صندوق'],
] as const;
const taxRates = [
  ['vat15', '0.1500', 'standard'],
  ['vat5', '0.0500', 'reduced'],
  ['vat0', '0.0000', 'zero'],
  ['exempt', '0.0000', 'exempt'],
  ['out_of_scope', '0.0000', 'out_of_scope'],
] as const;
const documentTypes = [
  ['tax_invoice', 'Standard tax invoice', 'فاتورة ضريبية'],
  ['simplified_invoice', 'Simplified tax invoice', 'فاتورة ضريبية مبسطة'],
  ['credit_note', 'Credit note', 'إشعار دائن'],
  ['debit_note', 'Debit note', 'إشعار مدين'],
  ['purchase_bill', 'Purchase bill', 'فاتورة مشتريات'],
  ['receipt', 'Receipt', 'سند قبض'],
  ['payment', 'Payment', 'سند صرف'],
] as const;
const accounts = [
  ['1000', 'Assets', 'الأصول', 'asset', null],
  ['1100', 'Cash', 'النقدية', 'asset', '1000'],
  ['1110', 'Bank', 'البنك', 'asset', '1000'],
  ['1200', 'Accounts receivable', 'الذمم المدينة', 'asset', '1000'],
  ['1300', 'Inventory', 'المخزون', 'asset', '1000'],
  ['1400', 'Input VAT', 'ضريبة المدخلات', 'asset', '1000'],
  ['2000', 'Liabilities', 'الالتزامات', 'liability', null],
  ['2100', 'Accounts payable', 'الذمم الدائنة', 'liability', '2000'],
  ['2200', 'Output VAT', 'ضريبة المخرجات', 'liability', '2000'],
  ['3000', 'Equity', 'حقوق الملكية', 'equity', null],
  ['3100', 'Retained earnings', 'الأرباح المبقاة', 'equity', '3000'],
  ['4000', 'Revenue', 'الإيرادات', 'revenue', null],
  ['4100', 'Sales revenue', 'إيرادات المبيعات', 'revenue', '4000'],
  ['5000', 'Cost of sales', 'تكلفة المبيعات', 'expense', null],
  ['6000', 'Operating expenses', 'المصروفات التشغيلية', 'expense', null],
  ['6100', 'General expense', 'مصروفات عامة', 'expense', '6000'],
  ['9990', 'Rounding adjustments', 'تسويات التقريب', 'expense', null],
] as const;

try {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .insert(systemRoles)
      .values(
        roles.map(([code, labelEn, labelAr]) => ({ code, labelEn, labelAr })),
      )
      .onConflictDoNothing();
    await tx
      .insert(systemUnits)
      .values(
        units.map(([code, labelEn, labelAr]) => ({ code, labelEn, labelAr })),
      )
      .onConflictDoNothing();
    await tx
      .insert(systemTaxRates)
      .values(
        taxRates.map(([code, rate, classification]) => ({
          code,
          rate,
          classification,
        })),
      )
      .onConflictDoNothing();
    await tx
      .insert(systemDocumentTypes)
      .values(
        documentTypes.map(([code, labelEn, labelAr]) => ({
          code,
          labelEn,
          labelAr,
        })),
      )
      .onConflictDoNothing();
    await tx
      .insert(chartTemplateAccounts)
      .values(
        accounts.map(([code, nameEn, nameAr, kind, parentCode]) => ({
          code,
          nameEn,
          nameAr,
          kind,
          parentCode,
        })),
      )
      .onConflictDoNothing();
  });
  console.log('System defaults seeded');
} finally {
  await closePool();
}

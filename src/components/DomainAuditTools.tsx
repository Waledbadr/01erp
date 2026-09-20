import React, { useState } from 'react';
import { 
  Scale, 
  Boxes, 
  Receipt, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  RefreshCw, 
  QrCode, 
  FileCode,
  ShieldCheck,
  Plus,
  Trash2,
  Calculator
} from 'lucide-react';
import { validateJournalBalance, JournalLine, formatCurrency } from '../lib/accounting';
import { calculateWAC, WACResult } from '../lib/inventory';
import { generateZatcaQR, validateSaudiVatNumber, TLVTag } from '../lib/zatca';

interface DomainAuditToolsProps {
  lang: 'ar' | 'en';
}

export const DomainAuditTools: React.FC<DomainAuditToolsProps> = ({ lang }) => {
  const isAr = lang === 'ar';
  const [activeTab, setActiveTab] = useState<'gl' | 'wac' | 'zatca' | 'audit'>('gl');

  // --- GL Balance Tester State ---
  const [journalLines, setJournalLines] = useState<JournalLine[]>([
    {
      accountId: '1111',
      accountNameAr: 'الصندوق الرئيسي',
      accountNameEn: 'Main Cash Drawer',
      debit: '1150.00',
      credit: '0.00',
      description: 'تحصيل فاتورة مبيعات نقدية',
    },
    {
      accountId: '4110',
      accountNameAr: 'إيرادات المبيعات',
      accountNameEn: 'Sales Revenue',
      debit: '0.00',
      credit: '1000.00',
      description: 'قيمة المبيعات الخاضعة للضريبة',
    },
    {
      accountId: '2120',
      accountNameAr: 'ضريبة القيمة المضافة المخرجة',
      accountNameEn: 'Output VAT Payable',
      debit: '0.00',
      credit: '150.00',
      description: 'ضريبة القيمة المضافة 15%',
    },
  ]);

  const glValidation = validateJournalBalance(journalLines);

  const addJournalLine = () => {
    setJournalLines([
      ...journalLines,
      {
        accountId: '6110',
        accountNameAr: 'حساب جديد',
        accountNameEn: 'New Account',
        debit: '0.00',
        credit: '0.00',
      },
    ]);
  };

  const removeJournalLine = (index: number) => {
    if (journalLines.length <= 2) return;
    setJournalLines(journalLines.filter((_, i) => i !== index));
  };

  const updateJournalLine = (index: number, field: keyof JournalLine, val: string) => {
    const updated = [...journalLines];
    updated[index] = { ...updated[index], [field]: val };
    setJournalLines(updated);
  };

  // --- WAC Calculator State ---
  const [wacInput, setWacInput] = useState({
    currentStock: 100,
    currentWAC: 10.0,
    incomingQty: 50,
    incomingUnitCost: 16.0,
  });
  const [wacResult, setWacResult] = useState<WACResult | null>(() => {
    try {
      return calculateWAC(100, 10.0, 50, 16.0);
    } catch {
      return null;
    }
  });

  const handleWacCalculate = () => {
    try {
      const res = calculateWAC(
        wacInput.currentStock,
        wacInput.currentWAC,
        wacInput.incomingQty,
        wacInput.incomingUnitCost
      );
      setWacResult(res);
    } catch (e: any) {
      alert(e.message);
    }
  };

  // --- ZATCA TLV Inspector State ---
  const [zatcaInput, setZatcaInput] = useState({
    sellerName: 'شركة النظم السعودية للبرمجيات',
    vatNumber: '300000000000003',
    timestamp: '2026-09-17T10:30:00Z',
    invoiceTotal: '1150.00',
    vatTotal: '150.00',
    invoiceHash: 'NWZjN2FiODRlMGViOGQ4ZTgyMmFhODc5ODdlNzllZTkyOGZkOGEwMA==',
  });

  const vatCheck = validateSaudiVatNumber(zatcaInput.vatNumber);
  let zatcaOutput: { base64: string; tags: TLVTag[] } | null = null;
  let zatcaError: string | null = null;

  try {
    zatcaOutput = generateZatcaQR(zatcaInput);
  } catch (err: any) {
    zatcaError = err.message;
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
      {/* Header with Navigation Tabs */}
      <div className="p-6 border-b border-stone-200 bg-stone-50/70">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-xs font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{isAr ? 'أدوات التحقق والتدقيق اللحظي (Audit & Invariant Verifiers)' : 'Live QA Audit & Invariant Tools'}</span>
            </div>
            <h2 className="text-xl font-bold text-stone-900">
              {isAr ? 'مختبر القواعد المحاسبية والمخزنية وضريبة زاتكا' : 'Domain Rules, GL Invariants & ZATCA Engine'}
            </h2>
            <p className="text-xs text-stone-600">
              {isAr 
                ? 'تحقق حي وتفاعلي من تطبيق القواعد الذهبية (G1–G8) والمتوسط المرجح (I2) ومعايير الفوترة الإلكترونية.' 
                : 'Real-time interactive validation of Double-Entry invariants (G1), perpetual WAC (I2), and ZATCA TLV encoding.'}
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-stone-200/80 rounded-xl self-start sm:self-center">
            <button
              onClick={() => setActiveTab('gl')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'gl' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Scale className="w-3.5 h-3.5 text-emerald-700" />
              <span>{isAr ? 'توازن القيود (G1)' : 'GL Invariant (G1)'}</span>
            </button>
            <button
              onClick={() => setActiveTab('wac')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'wac' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Boxes className="w-3.5 h-3.5 text-emerald-700" />
              <span>{isAr ? 'المتوسط المرجح (I2)' : 'WAC Engine (I2)'}</span>
            </button>
            <button
              onClick={() => setActiveTab('zatca')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'zatca' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Receipt className="w-3.5 h-3.5 text-emerald-700" />
              <span>{isAr ? 'ترميز زاتكا (TLV)' : 'ZATCA TLV QR'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tab 1: GL Balance Tester */}
      {activeTab === 'gl' && (
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <Scale className="w-4 h-4 text-emerald-700" />
                <span>{isAr ? 'محاكي ترحيل قيود اليومية والتحقق من التساوي الصارم' : 'Double-Entry Posting Engine & Balance Invariant'}</span>
              </h3>
              <p className="text-xs text-stone-500">
                {isAr ? 'القاعدة G1: إجمالي المدين يجب أن يساوي إجمالي الدائن بدقة متناهية ودون تراكم كسور عائمة.' : 'Rule G1: Total Debits must strictly equal Total Credits with zero floating-point error.'}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 text-xs font-bold ${
                glValidation.isValid 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}>
                {glValidation.isValid ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>{isAr ? 'القيد متزن تماماً (G1 PASS)' : 'Balanced: Debits = Credits'}</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    <span>{isAr ? 'القيد غير متزن (REJECTED)' : 'Unbalanced (REJECTED)'}</span>
                  </>
                )}
              </div>

              <button
                onClick={addJournalLine}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-700" />
                <span>{isAr ? 'إضافة سطر' : 'Add Line'}</span>
              </button>
            </div>
          </div>

          {/* Lines Table */}
          <div className="border border-stone-200 rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold">
                  <tr>
                    <th className="p-3 text-start">{isAr ? 'رقم الحساب' : 'Account Code'}</th>
                    <th className="p-3 text-start">{isAr ? 'اسم الحساب' : 'Account Name'}</th>
                    <th className="p-3 text-start">{isAr ? 'البيان' : 'Description'}</th>
                    <th className="p-3 text-start">{isAr ? 'مدين (SAR)' : 'Debit (SAR)'}</th>
                    <th className="p-3 text-start">{isAr ? 'دائن (SAR)' : 'Credit (SAR)'}</th>
                    <th className="p-3 text-center w-12">{isAr ? 'حذف' : 'Action'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 font-mono">
                  {journalLines.map((line, idx) => (
                    <tr key={idx} className="hover:bg-stone-50/60 transition-colors">
                      <td className="p-2.5">
                        <input
                          type="text"
                          value={line.accountId}
                          onChange={(e) => updateJournalLine(idx, 'accountId', e.target.value)}
                          className="w-20 px-2 py-1 bg-white border border-stone-300 rounded font-mono text-xs focus:ring-1 focus:ring-emerald-600"
                        />
                      </td>
                      <td className="p-2.5">
                        <input
                          type="text"
                          value={isAr ? line.accountNameAr : line.accountNameEn}
                          onChange={(e) => updateJournalLine(idx, isAr ? 'accountNameAr' : 'accountNameEn', e.target.value)}
                          className="w-44 px-2 py-1 bg-white border border-stone-300 rounded text-xs focus:ring-1 focus:ring-emerald-600 font-sans"
                        />
                      </td>
                      <td className="p-2.5">
                        <input
                          type="text"
                          value={line.description || ''}
                          onChange={(e) => updateJournalLine(idx, 'description', e.target.value)}
                          placeholder={isAr ? 'بيان الحركة...' : 'Line description...'}
                          className="w-48 px-2 py-1 bg-white border border-stone-300 rounded text-xs focus:ring-1 focus:ring-emerald-600 font-sans"
                        />
                      </td>
                      <td className="p-2.5">
                        <input
                          type="text"
                          value={line.debit}
                          onChange={(e) => updateJournalLine(idx, 'debit', e.target.value)}
                          className="w-24 px-2 py-1 bg-white border border-stone-300 rounded font-mono text-xs text-end focus:ring-1 focus:ring-emerald-600"
                        />
                      </td>
                      <td className="p-2.5">
                        <input
                          type="text"
                          value={line.credit}
                          onChange={(e) => updateJournalLine(idx, 'credit', e.target.value)}
                          className="w-24 px-2 py-1 bg-white border border-stone-300 rounded font-mono text-xs text-end focus:ring-1 focus:ring-emerald-600"
                        />
                      </td>
                      <td className="p-2.5 text-center">
                        <button
                          onClick={() => removeJournalLine(idx)}
                          disabled={journalLines.length <= 2}
                          className="p-1 rounded text-stone-400 hover:text-rose-600 disabled:opacity-30 transition-colors"
                          title={isAr ? 'حذف السطر' : 'Remove Line'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-stone-50 font-bold border-t border-stone-200">
                  <tr>
                    <td colSpan={3} className="p-3 text-end font-sans">
                      {isAr ? 'الإجمالي العام:' : 'Grand Totals:'}
                    </td>
                    <td className="p-3 text-end font-mono text-emerald-800">
                      {formatCurrency(glValidation.totalDebits, lang)}
                    </td>
                    <td className="p-3 text-end font-mono text-emerald-800">
                      {formatCurrency(glValidation.totalCredits, lang)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Validation Notice Box */}
          {!glValidation.isValid && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-xs text-rose-800">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold mb-0.5">
                  {isAr ? 'تم حظر الترحيل المحاسبي بموجب القاعدة G1' : 'GL Posting Blocked by Rule G1'}
                </div>
                <p>{isAr ? glValidation.errorAr : glValidation.error}</p>
                <div className="mt-1 font-mono text-[11px] text-rose-700">
                  {isAr ? `الفارق غير المتوازن: ${glValidation.difference} ﷼` : `Discrepancy: ${glValidation.difference} SAR`}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Perpetual WAC Calculator */}
      {activeTab === 'wac' && (
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <Boxes className="w-4 h-4 text-emerald-700" />
                <span>{isAr ? 'محرك إعادة احتساب المتوسط المرجح للتكلفة (WAC Perpetual Engine)' : 'Perpetual WAC Recalculation Engine'}</span>
              </h3>
              <p className="text-xs text-stone-500">
                {isAr ? 'القاعدة I2: احتساب دقيق للمتوسط المرجح فور استلام كل فاتورة مشتريات أو إذن إضافة.' : 'Rule I2: Real-time WAC recalculation on every purchase receipt.'}
              </p>
            </div>
          </div>

          {/* Formula Display */}
          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 text-xs font-mono space-y-1">
            <span className="text-stone-500 font-sans font-semibold block">{isAr ? 'معادلة التكلفة المرجحة المعتمدة:' : 'Official Regulatory Formula:'}</span>
            <div className="text-emerald-800 font-bold text-sm">
              New WAC = ((Current Stock × Current WAC) + (Incoming Qty × Effective Unit Cost)) / (Current Stock + Incoming Qty)
            </div>
          </div>

          {/* Interactive Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div className="space-y-1">
              <label className="font-medium text-stone-700">{isAr ? 'الرصيد الحالي بالمخزن (حبة)' : 'Current Stock Qty'}</label>
              <input
                type="number"
                value={wacInput.currentStock}
                onChange={(e) => setWacInput({ ...wacInput, currentStock: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono text-sm focus:ring-1 focus:ring-emerald-600"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-stone-700">{isAr ? 'التكلفة الحالية (﷼/حبة)' : 'Current WAC (SAR)'}</label>
              <input
                type="number"
                step="0.01"
                value={wacInput.currentWAC}
                onChange={(e) => setWacInput({ ...wacInput, currentWAC: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono text-sm focus:ring-1 focus:ring-emerald-600"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-stone-700">{isAr ? 'الكمية الواردة الجديدة (حبة)' : 'Incoming Receipt Qty'}</label>
              <input
                type="number"
                value={wacInput.incomingQty}
                onChange={(e) => setWacInput({ ...wacInput, incomingQty: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono text-sm focus:ring-1 focus:ring-emerald-600"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-stone-700">{isAr ? 'سعر الوحدة الواردة بعد الإنزال (﷼)' : 'Effective Unit Cost (SAR)'}</label>
              <input
                type="number"
                step="0.01"
                value={wacInput.incomingUnitCost}
                onChange={(e) => setWacInput({ ...wacInput, incomingUnitCost: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono text-sm focus:ring-1 focus:ring-emerald-600"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleWacCalculate}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 transition-colors"
            >
              <Calculator className="w-4 h-4" />
              <span>{isAr ? 'إعادة احتساب المتوسط المرجح' : 'Recalculate WAC'}</span>
            </button>
          </div>

          {/* Results Card */}
          {wacResult && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 rounded-2xl bg-emerald-50/60 border border-emerald-200">
              <div>
                <div className="text-xs text-stone-500 font-medium mb-1">{isAr ? 'إجمالي الرصيد الجديد' : 'New Total Stock'}</div>
                <div className="text-2xl font-black text-stone-900 font-mono">
                  {wacResult.newQty} <span className="text-xs font-normal text-stone-500">{isAr ? 'حبة' : 'Units'}</span>
                </div>
                <div className="text-[11px] text-stone-500 mt-1">
                  {wacResult.previousQty} + {wacResult.incomingQty}
                </div>
              </div>

              <div>
                <div className="text-xs text-emerald-800 font-bold mb-1">{isAr ? 'المتوسط المرجح الجديد (WAC)' : 'Calculated New WAC'}</div>
                <div className="text-2xl font-black text-emerald-700 font-mono">
                  {wacResult.newWAC.toFixed(4)} <span className="text-xs font-normal text-emerald-600">SAR / Unit</span>
                </div>
                <div className="text-[11px] text-emerald-800/80 mt-1">
                  {isAr ? 'مُحدث لحظياً ومقفل برمجياً' : 'Audited & Row-locked'}
                </div>
              </div>

              <div>
                <div className="text-xs text-stone-500 font-medium mb-1">{isAr ? 'إجمالي القيمة التقديرية للمخزون' : 'Total Inventory Valuation'}</div>
                <div className="text-2xl font-black text-stone-900 font-mono">
                  {formatCurrency(wacResult.totalNewValue, lang)}
                </div>
                <div className="text-[11px] text-stone-500 mt-1">
                  {wacResult.newQty} × {wacResult.newWAC.toFixed(4)} SAR
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: ZATCA TLV Inspector */}
      {activeTab === 'zatca' && (
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <QrCode className="w-4 h-4 text-emerald-700" />
                <span>{isAr ? 'مختبر ترميز زاتكا للفوترة الإلكترونية (ZATCA TLV Encoder)' : 'ZATCA Phase 1 & 2 TLV QR Encoder'}</span>
              </h3>
              <p className="text-xs text-stone-500">
                {isAr ? 'التحقق من حزم البيانات بالبايتات UTF-8، التجزئة SHA-256، والتشفير إلى Base64 المعتمد لدى الهيئة.' : 'Inspect raw UTF-8 TLV bytes, tags 1-6, and Base64 QR code output.'}
              </p>
            </div>

            <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
              vatCheck.isValid ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
            }`}>
              {vatCheck.isValid ? (isAr ? 'الرقم الضريبي معتمد (15 رقم)' : 'Valid 15-digit KSA VAT ID') : (isAr ? 'رقم ضريبي غير مطابق' : 'Invalid VAT ID')}
            </div>
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div className="space-y-1">
              <label className="font-medium text-stone-700">{isAr ? 'اسم المنشأة / المورد (Tag 1)' : 'Seller Name (Tag 1)'}</label>
              <input
                type="text"
                value={zatcaInput.sellerName}
                onChange={(e) => setZatcaInput({ ...zatcaInput, sellerName: e.target.value })}
                className="w-full px-3 py-1.5 rounded-lg border border-stone-300 text-xs focus:ring-1 focus:ring-emerald-600"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-stone-700">{isAr ? 'الرقم الضريبي (Tag 2 - 15 رقم يبدأ وينتهي بـ 3)' : 'VAT Number (Tag 2 - 15 digits)'}</label>
              <input
                type="text"
                value={zatcaInput.vatNumber}
                onChange={(e) => setZatcaInput({ ...zatcaInput, vatNumber: e.target.value })}
                className="w-full px-3 py-1.5 rounded-lg border border-stone-300 font-mono text-xs focus:ring-1 focus:ring-emerald-600"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-stone-700">{isAr ? 'ختم التوقيت UTC (Tag 3)' : 'Timestamp UTC (Tag 3)'}</label>
              <input
                type="text"
                value={zatcaInput.timestamp}
                onChange={(e) => setZatcaInput({ ...zatcaInput, timestamp: e.target.value })}
                className="w-full px-3 py-1.5 rounded-lg border border-stone-300 font-mono text-xs focus:ring-1 focus:ring-emerald-600"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-stone-700">{isAr ? 'إجمالي الفاتورة شامل الضريبة (Tag 4)' : 'Invoice Total with VAT (Tag 4)'}</label>
              <input
                type="text"
                value={zatcaInput.invoiceTotal}
                onChange={(e) => setZatcaInput({ ...zatcaInput, invoiceTotal: e.target.value })}
                className="w-full px-3 py-1.5 rounded-lg border border-stone-300 font-mono text-xs focus:ring-1 focus:ring-emerald-600"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-stone-700">{isAr ? 'مبلغ الضريبة 15% (Tag 5)' : 'Total VAT (Tag 5)'}</label>
              <input
                type="text"
                value={zatcaInput.vatTotal}
                onChange={(e) => setZatcaInput({ ...zatcaInput, vatTotal: e.target.value })}
                className="w-full px-3 py-1.5 rounded-lg border border-stone-300 font-mono text-xs focus:ring-1 focus:ring-emerald-600"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-stone-700">{isAr ? 'تجزئة SHA-256 المرحلة الثانية (Tag 6)' : 'Invoice Hash SHA-256 (Tag 6)'}</label>
              <input
                type="text"
                value={zatcaInput.invoiceHash}
                onChange={(e) => setZatcaInput({ ...zatcaInput, invoiceHash: e.target.value })}
                className="w-full px-3 py-1.5 rounded-lg border border-stone-300 font-mono text-xs focus:ring-1 focus:ring-emerald-600"
              />
            </div>
          </div>

          {/* TLV Decoded Table */}
          {zatcaOutput && (
            <div className="space-y-4">
              <div className="border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 px-4 py-2.5 border-b border-stone-200 text-xs font-semibold text-stone-700">
                  {isAr ? 'تحليل بايتات TLV المعبأة (Tag - Length - Value Hex Representation)' : 'Decoded TLV Tag-Length-Value Structure'}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-start">
                    <thead className="bg-stone-100/60 text-stone-500 font-mono">
                      <tr>
                        <th className="p-2.5 text-start w-16">Tag</th>
                        <th className="p-2.5 text-start w-16">Length</th>
                        <th className="p-2.5 text-start">{isAr ? 'القيمة النصية' : 'Raw Value'}</th>
                        <th className="p-2.5 text-start">{isAr ? 'البايتات المسدسة (Hex)' : 'Hex Dump'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200 font-mono text-[11px]">
                      {zatcaOutput.tags.map((t) => (
                        <tr key={t.tag} className="hover:bg-stone-50/50">
                          <td className="p-2.5 font-bold text-emerald-800">Tag {t.tag}</td>
                          <td className="p-2.5 text-stone-600">{t.length} B</td>
                          <td className="p-2.5 font-sans text-stone-800">{t.value}</td>
                          <td className="p-2.5 text-stone-500 break-all">{t.hex}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Base64 Output Box */}
              <div className="p-4 rounded-xl bg-stone-900 text-stone-100 font-mono text-xs space-y-2">
                <div className="flex items-center justify-between text-stone-400">
                  <span>ZATCA TLV Base64 QR Code Payload:</span>
                  <span className="text-[11px] text-emerald-400">{zatcaOutput.base64.length} Chars</span>
                </div>
                <div className="p-3 bg-stone-950 rounded-lg text-emerald-400 break-all select-all">
                  {zatcaOutput.base64}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

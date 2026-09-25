import React from 'react';
import { X, FileText, CheckCircle, ArrowRight, Printer, Layers } from 'lucide-react';
import { useI18n } from '../../i18n/context.js';
import { SalesQuotation } from '../../lib/sales.js';

interface QuotationDetailModalProps {
  quotation: SalesQuotation | null;
  onClose: () => void;
  onConvertToInvoice: (quote: SalesQuotation) => void;
  actionLoading: boolean;
}

export const QuotationDetailModal: React.FC<QuotationDetailModalProps> = ({
  quotation,
  onClose,
  onConvertToInvoice,
  actionLoading,
}) => {
  const { language } = useI18n();
  const isAr = language === 'ar';

  if (!quotation) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-700 text-white flex items-center justify-center shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">
                  {isAr ? 'تفاصيل عرض السعر:' : 'Quotation Details:'} {quotation.quotationNumber}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  {quotation.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                {quotation.customerNameAr} ({quotation.customerNameEn})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 text-xs">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <span className="text-slate-500 block">{isAr ? 'تاريخ الإصدار' : 'Issue Date'}</span>
              <span className="font-mono font-bold text-slate-800">{quotation.issueDate}</span>
            </div>
            <div>
              <span className="text-slate-500 block">{isAr ? 'تاريخ الصلاحية' : 'Expiry Date'}</span>
              <span className="font-mono font-bold text-slate-800">{quotation.expiryDate}</span>
            </div>
            <div>
              <span className="text-slate-500 block">{isAr ? 'الرقم الضريبي للعميل' : 'Customer VAT'}</span>
              <span className="font-mono font-bold text-slate-800">{quotation.customerVatNumber || '-'}</span>
            </div>
            <div>
              <span className="text-slate-500 block">{isAr ? 'الحالة' : 'Status'}</span>
              <span className="font-bold text-emerald-800">{quotation.status}</span>
            </div>
          </div>

          {/* Quotation Lines Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3 text-start">{isAr ? 'الصنف' : 'Item'}</th>
                  <th className="p-3 text-start">{isAr ? 'الوحدة (UOM)' : 'Unit (UOM)'}</th>
                  <th className="p-3 text-center">{isAr ? 'الكمية' : 'Quantity'}</th>
                  <th className="p-3 text-end">{isAr ? 'سعر الوحدة (﷼)' : 'Unit Price (SAR)'}</th>
                  <th className="p-3 text-center">{isAr ? 'الخصم %' : 'Disc %'}</th>
                  <th className="p-3 text-end">{isAr ? 'الخاضع للضريبة' : 'Taxable'}</th>
                  <th className="p-3 text-end">{isAr ? 'الضريبة 15%' : 'VAT 15%'}</th>
                  <th className="p-3 text-end">{isAr ? 'الإجمالي شامل الضريبة' : 'Total with VAT'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {quotation.lines.map((line, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="p-3">
                      <div className="font-semibold text-slate-900">{line.nameAr || line.itemId}</div>
                      {line.itemCode && <div className="text-[10px] font-mono text-slate-400">{line.itemCode}</div>}
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-900 border border-emerald-200">
                        <Layers className="w-3 h-3 text-emerald-700" />
                        <span>{line.uomName || 'حبه'}</span>
                      </span>
                    </td>
                    <td className="p-3 text-center font-mono font-bold text-slate-800">{line.quantity}</td>
                    <td className="p-3 text-end font-mono text-slate-800">{line.unitPriceSar.toFixed(2)} ﷼</td>
                    <td className="p-3 text-center font-mono text-slate-600">{line.discountPercent || 0}%</td>
                    <td className="p-3 text-end font-mono text-slate-700">{line.taxableAmountSar.toFixed(2)} ﷼</td>
                    <td className="p-3 text-end font-mono text-emerald-700">{line.taxAmountSar.toFixed(2)} ﷼</td>
                    <td className="p-3 text-end font-mono font-bold text-slate-900">{line.totalAmountSar.toFixed(2)} ﷼</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals Breakdown */}
          <div className="flex justify-between items-start gap-4">
            <div className="text-slate-500 text-[11px] max-w-sm">
              {quotation.notes && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="font-bold text-slate-700 block mb-0.5">{isAr ? 'ملاحظات العرض:' : 'Notes:'}</span>
                  <span>{quotation.notes}</span>
                </div>
              )}
            </div>

            <div className="w-64 space-y-1.5 p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>{isAr ? 'الإجمالي قبل الضريبة:' : 'Subtotal:'}</span>
                <span className="font-mono">{quotation.subtotalSar.toFixed(2)} ﷼</span>
              </div>
              {quotation.discountTotalSar > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>{isAr ? 'إجمالي الخصم:' : 'Total Discount:'}</span>
                  <span className="font-mono">-{quotation.discountTotalSar.toFixed(2)} ﷼</span>
                </div>
              )}
              <div className="flex justify-between text-emerald-700">
                <span>{isAr ? 'ضريبة القيمة المضافة (15%):' : 'VAT (15%):'}</span>
                <span className="font-mono">{quotation.taxTotalSar.toFixed(2)} ﷼</span>
              </div>
              <div className="border-t border-slate-200 pt-1.5 flex justify-between font-bold text-slate-900 text-sm">
                <span>{isAr ? 'الإجمالي النهائي:' : 'Total Amount:'}</span>
                <span className="font-mono text-emerald-900">{quotation.totalAmountSar.toFixed(2)} ﷼</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-6 py-4 border-t border-slate-100 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 font-semibold"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>

          {quotation.status !== 'CONVERTED' && (
            <button
              type="button"
              onClick={() => onConvertToInvoice(quotation)}
              disabled={actionLoading}
              className="px-5 py-2 font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl transition-all shadow-xs flex items-center gap-2"
            >
              <ArrowRight className="w-4 h-4" />
              <span>{isAr ? 'تحويل إلى فاتورة مبيعات' : 'Convert to Sales Invoice'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

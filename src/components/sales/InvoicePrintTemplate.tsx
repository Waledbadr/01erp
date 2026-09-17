import React from 'react';
import { Printer, ShieldCheck, ArrowRight, Building2, CheckCircle, FileText } from 'lucide-react';
import { SalesInvoice, fromHalalasInt } from '../../lib/sales.js';
import { ZatcaQRCode } from '../ui/ZatcaQRCode.js';

interface InvoicePrintTemplateProps {
  invoice: SalesInvoice;
  companyNameAr?: string;
  companyNameEn?: string;
  companyVatNumber?: string;
  companyCrNumber?: string;
  onBack?: () => void;
}

export const InvoicePrintTemplate: React.FC<InvoicePrintTemplateProps> = ({
  invoice,
  companyNameAr = 'شركة التقنية المتقدمة المحدودة',
  companyNameEn = 'Advanced Tech Co. Ltd.',
  companyVatNumber = '300000000000003',
  companyCrNumber = '1010892041',
  onBack,
}) => {
  const isStandardB2B = invoice.invoiceType === 'STANDARD_B2B';

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="bg-slate-100 min-h-screen p-4 sm:p-6 text-slate-800">
      {/* Top action toolbar (hidden during print) */}
      <div className="max-w-4xl mx-auto mb-4 flex items-center justify-between print:hidden">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
          >
            <ArrowRight className="w-4 h-4" />
            <span>العودة لقائمة الفواتير</span>
          </button>
        ) : <div />}

        <div className="flex items-center gap-2">
          <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-medium inline-flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>متوافقة مع هيئة الزكاة والضريبة والجمارك (ZATCA)</span>
          </span>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors shadow-xs"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة / حفظ PDF</span>
          </button>
        </div>
      </div>

      {/* Printable Paper Canvas (A4 simulation) */}
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-md border border-slate-200 p-6 sm:p-8 print:border-none print:shadow-none print:p-2 print:m-0 print:max-w-none">
        {/* Header section */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b-2 border-slate-800 pb-6">
          <div className="space-y-1 text-start">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-emerald-800 text-white flex items-center justify-center font-bold text-lg">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 leading-tight">{companyNameAr}</h1>
                <p className="text-xs text-slate-500 font-medium">{companyNameEn}</p>
              </div>
            </div>
            <div className="text-xs text-slate-600 space-y-0.5 pt-2">
              <p>
                <span className="font-semibold">الرقم الضريبي / VAT No:</span>{' '}
                <span className="font-mono font-bold text-emerald-900">{companyVatNumber}</span>
              </p>
              <p>
                <span className="font-semibold">السجل التجاري / CR No:</span>{' '}
                <span className="font-mono">{companyCrNumber}</span>
              </p>
              <p>الرياض، طريق الملك فهد، المملكة العربية السعودية</p>
            </div>
          </div>

          <div className="flex flex-col items-end text-end self-center sm:self-start">
            <div className="border-2 border-emerald-800 bg-emerald-50/60 px-4 py-2 rounded-lg text-center mb-2">
              <span className="block text-base font-extrabold text-emerald-950">
                {isStandardB2B ? 'فاتورة ضريبية' : 'فاتورة ضريبية مبسطة'}
              </span>
              <span className="block text-[11px] font-semibold text-emerald-800 tracking-wide uppercase">
                {isStandardB2B ? 'TAX INVOICE' : 'SIMPLIFIED TAX INVOICE'}
              </span>
            </div>
            <div className="text-xs space-y-1 text-slate-600">
              <p>
                <span className="font-semibold">رقم الفاتورة / Invoice No:</span>{' '}
                <span className="font-mono font-bold text-slate-900">{invoice.invoiceNumber}</span>
              </p>
              <p>
                <span className="font-semibold">التاريخ والوقت / Date & Time:</span>{' '}
                <span className="font-mono">{invoice.issueDate} {invoice.issueTime}</span>
              </p>
              <p>
                <span className="font-semibold">طريقة الدفع / Payment:</span>{' '}
                <span>
                  {invoice.paymentMethod === 'CREDIT_ACCOUNT' && 'آجل / حساب ائتماني'}
                  {invoice.paymentMethod === 'CASH' && 'نقدي / Cash'}
                  {invoice.paymentMethod === 'MADA' && 'مدى / Mada POS'}
                  {invoice.paymentMethod === 'BANK_TRANSFER' && 'تحويل بنكي / Transfer'}
                  {invoice.paymentMethod === 'VISA_MASTER' && 'بطاقة ائتمانية / Credit Card'}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Buyer info section (Mandatory for Standard B2B, summarized for B2C) */}
        <div className="mt-4 p-4 rounded-lg bg-slate-50 border border-slate-200">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              بيانات العميل المشتري / Buyer Information
            </h2>
            <span className="text-[11px] text-slate-500">
              {isStandardB2B ? 'منشأة أعمال (B2B)' : 'فرد / مستهلك نهائي (B2C)'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-slate-500 text-[11px]">اسم العميل / Customer Name:</p>
              <p className="font-bold text-slate-900">{invoice.customerNameAr}</p>
              {invoice.customerNameEn && <p className="text-[11px] text-slate-600">{invoice.customerNameEn}</p>}
            </div>

            <div>
              <p className="text-slate-500 text-[11px]">الرقم الضريبي للعميل / Buyer VAT No:</p>
              <p className="font-mono font-semibold text-slate-900">
                {invoice.customerVatNumber || 'غير مسجل ضريبياً (مستهلك أفراد)'}
              </p>
            </div>

            {invoice.customerCrNumber && (
              <div>
                <p className="text-slate-500 text-[11px]">السجل التجاري / CR No:</p>
                <p className="font-mono text-slate-800">{invoice.customerCrNumber}</p>
              </div>
            )}

            {invoice.customerAddress && (
              <div>
                <p className="text-slate-500 text-[11px]">العنوان / Address:</p>
                <p className="text-slate-800">{invoice.customerAddress}</p>
              </div>
            )}
          </div>
        </div>

        {/* Lines Table */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-xs text-start border border-slate-300">
            <thead className="bg-slate-800 text-white">
              <tr>
                <th className="p-2 text-center w-8">#</th>
                <th className="p-2 text-start">الصنف والوصف / Description</th>
                <th className="p-2 text-center">الوحدة / Unit</th>
                <th className="p-2 text-center">الكمية / Qty</th>
                <th className="p-2 text-end">سعر الوحدة / Price</th>
                <th className="p-2 text-end">الخصم / Disc.</th>
                <th className="p-2 text-end">الخاضع للضريبة / Taxable</th>
                <th className="p-2 text-center">نسبة الضريبة / Rate</th>
                <th className="p-2 text-end">مبلغ الضريبة / VAT</th>
                <th className="p-2 text-end">الإجمالي شامل الضريبة / Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {invoice.lines.map((line, idx) => (
                <tr key={line.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                  <td className="p-2 text-center font-mono text-slate-500">{idx + 1}</td>
                  <td className="p-2">
                    <p className="font-semibold text-slate-900">{line.nameAr}</p>
                    <p className="text-[10px] text-slate-500 font-mono">{line.itemCode} - {line.nameEn}</p>
                  </td>
                  <td className="p-2 text-center text-slate-700">{line.uomName}</td>
                  <td className="p-2 text-center font-mono font-bold text-slate-900">{line.quantity}</td>
                  <td className="p-2 text-end font-mono">{line.unitPriceSar.toFixed(2)}</td>
                  <td className="p-2 text-end font-mono text-slate-600">{line.discountAmountSar.toFixed(2)}</td>
                  <td className="p-2 text-end font-mono font-medium text-slate-900">{line.taxableAmountSar.toFixed(2)}</td>
                  <td className="p-2 text-center font-mono text-slate-700">{line.taxRate}%</td>
                  <td className="p-2 text-end font-mono text-emerald-800">{line.taxAmountSar.toFixed(2)}</td>
                  <td className="p-2 text-end font-mono font-bold text-slate-900">{line.totalAmountSar.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer Totals and ZATCA QR Code */}
        <div className="mt-6 pt-4 border-t-2 border-slate-800 flex flex-col sm:flex-row justify-between items-start gap-6">
          {/* ZATCA QR Code & Security Stamp */}
          <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 w-full sm:w-auto">
            <ZatcaQRCode value={invoice.qrCodeBase64} size={130} showDetails={true} />
            <div className="text-xs space-y-1 max-w-xs text-start">
              <div className="flex items-center gap-1 text-emerald-800 font-bold">
                <ShieldCheck className="w-4 h-4" />
                <span>رمز التشفير ZATCA Phase 2</span>
              </div>
              <p className="text-[10px] text-slate-600 leading-relaxed">
                رمز استجابة سريع مشفر وفق معايير هيئة الزكاة والضريبة والجمارك بالمملكة العربية السعودية يحوي بيانات التاجر والقيمة والضريبة.
              </p>
              {invoice.postedJournalNumber && (
                <p className="text-[10px] text-slate-600 pt-1">
                  <span className="font-semibold">قيد الأستاذ العام / GL Journal:</span>{' '}
                  <span className="font-mono font-bold text-indigo-700">{invoice.postedJournalNumber}</span>
                </p>
              )}
            </div>
          </div>

          {/* Numerical Totals Box */}
          <div className="w-full sm:w-80 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2">
            <div className="flex justify-between text-slate-600">
              <span>الإجمالي غير شامل الضريبة / Subtotal:</span>
              <span className="font-mono font-medium">{invoice.subtotalSar.toFixed(2)} ر.س</span>
            </div>

            {invoice.discountTotalSar > 0 && (
              <div className="flex justify-between text-amber-700">
                <span>إجمالي الخصم / Discount:</span>
                <span className="font-mono font-medium">-{invoice.discountTotalSar.toFixed(2)} ر.س</span>
              </div>
            )}

            <div className="flex justify-between text-slate-600">
              <span>المبلغ الخاضع للضريبة / Taxable Amount:</span>
              <span className="font-mono font-medium">
                {(invoice.subtotalSar - invoice.discountTotalSar).toFixed(2)} ر.س
              </span>
            </div>

            <div className="flex justify-between text-emerald-800 font-semibold border-t border-slate-200 pt-1.5">
              <span>ضريبة القيمة المضافة (15%) / VAT Total:</span>
              <span className="font-mono">{invoice.taxTotalSar.toFixed(2)} ر.س</span>
            </div>

            <div className="flex justify-between items-center text-sm font-bold text-slate-900 bg-emerald-100/70 p-2 rounded-lg border border-emerald-300">
              <span>المجموع الإجمالي / Grand Total:</span>
              <span className="font-mono text-base text-emerald-950">{invoice.totalAmountSar.toFixed(2)} ر.س</span>
            </div>
          </div>
        </div>

        {/* Legal notice */}
        <div className="mt-8 pt-4 border-t border-slate-200 text-[10px] text-slate-500 text-center space-y-0.5">
          <p>
            تعد هذه الفاتورة وثيقة رسمية صادرة بموجب نظام ضريبة القيمة المضافة ولائحته التنفيذية بالمملكة العربية السعودية.
          </p>
          <p className="font-mono text-[9px] text-slate-400">
            Hash: {invoice.invoiceHash ? `${invoice.invoiceHash.slice(0, 32)}...` : 'N/A'} | ID: {invoice.id}
          </p>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import {
  DocumentDataPayload,
  DocumentTemplate,
  DOCUMENT_TYPE_LABELS,
} from '../../lib/documents.js';
import { ZatcaQRCode } from '../ui/ZatcaQRCode.js';

interface DocumentPreviewFrameProps {
  document: DocumentDataPayload;
  template: DocumentTemplate;
  scale?: number; // zoom factor (0.5 to 1.2)
  className?: string;
}

export const DocumentPreviewFrame: React.FC<DocumentPreviewFrameProps> = ({
  document: data,
  template,
  scale = 1.0,
  className = '',
}) => {
  const isThermal = template.paperSize === 'THERMAL_80MM';
  const isAr = template.languageMode === 'AR';
  const isBilingual = template.languageMode === 'BILINGUAL';
  const colors = template.colors;

  // Active sorted columns
  const activeColumns = [...template.columns]
    .filter((c) => c.visible)
    .sort((a, b) => a.order - b.order);

  const docTitles = DOCUMENT_TYPE_LABELS[data.documentType] || { ar: data.documentType, en: data.documentType };

  if (isThermal) {
    // ==========================================
    // 80mm THERMAL RECEIPT LAYOUT
    // ==========================================
    return (
      <div
        className={`bg-white shadow-lg mx-auto font-mono text-slate-900 border border-dashed border-slate-300 transition-all ${className}`}
        style={{
          width: '300px',
          padding: '16px 14px',
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
          fontFamily: 'monospace, sans-serif',
        }}
      >
        {/* Tear zig-zag line top */}
        <div className="border-b-2 border-dotted border-slate-400 pb-2 mb-3 text-center">
          <h3 className="font-black text-sm tracking-tight">{data.company.nameAr}</h3>
          {data.company.nameEn && <p className="text-[11px] text-slate-600">{data.company.nameEn}</p>}
          <p className="text-[10px] text-slate-500 mt-1">الرقم الضريبي: {data.company.vatNumber}</p>
          <p className="text-[10px] text-slate-500">س.ت: {data.company.crNumber}</p>
        </div>

        {/* Receipt Header */}
        <div className="text-center my-2">
          <span className="inline-block bg-slate-900 text-white font-bold text-[11px] px-2 py-0.5 rounded">
            فاتورة ضريبية مبسطة (POS)
          </span>
          <p className="text-[11px] font-bold mt-1.5">رقم: {data.documentNumber}</p>
          <p className="text-[10px] text-slate-600">التاريخ: {data.issueDate}</p>
        </div>

        {/* Customer if present */}
        {data.party && (
          <div className="text-[10px] border-t border-b border-dashed border-slate-300 py-1.5 my-2">
            <span className="font-bold">العميل: </span>
            <span>{data.party.nameAr}</span>
            {data.party.vatNumber && <p className="text-[9px]">الرقم الضريبي: {data.party.vatNumber}</p>}
          </div>
        )}

        {/* Items Table */}
        <table className="w-full text-[10px] my-2 border-collapse">
          <thead>
            <tr className="border-b border-slate-800 font-bold">
              <th className="text-start py-1">الصنف</th>
              <th className="text-center py-1">الكمية</th>
              <th className="text-end py-1">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l, idx) => (
              <tr key={idx} className="border-b border-dotted border-slate-200">
                <td className="py-1 text-start">
                  <div className="font-semibold">{l.nameAr}</div>
                  <div className="text-[9px] text-slate-500">@{l.unitPriceSar.toFixed(2)}</div>
                </td>
                <td className="py-1 text-center font-bold">{l.quantity}</td>
                <td className="py-1 text-end font-bold">{l.totalSar.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="border-t border-b-2 border-slate-900 py-2 my-2 space-y-1 text-[11px]">
          <div className="flex justify-between text-slate-600">
            <span>الخاضع للضريبة:</span>
            <span>{data.totals.taxableAmountSar.toFixed(2)} ر.س</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>ضريبة القيمة المضافة 15%:</span>
            <span>{data.totals.vatAmountSar.toFixed(2)} ر.س</span>
          </div>
          <div className="flex justify-between font-black text-sm pt-1 border-t border-slate-400">
            <span>الإجمالي المستحق:</span>
            <span>{data.totals.totalAmountSar.toFixed(2)} ر.س</span>
          </div>
        </div>

        {/* ZATCA QR Code */}
        {data.zatca?.qrCodeBase64 && template.qrCode.visible && (
          <div className="flex flex-col items-center justify-center my-3">
            <ZatcaQRCode value={data.zatca.qrCodeBase64} size={template.qrCode.size || 110} />
            <span className="text-[9px] text-slate-500 mt-1">رمز التحقق الإلكتروني ZATCA</span>
          </div>
        )}

        {/* Tear mark */}
        <div className="border-t border-dotted border-slate-400 pt-2 text-center text-[9px] text-slate-500">
          شكراً لزيارتكم - البضاعة المباعة ترد وتستبدل خلال 3 أيام
        </div>
      </div>
    );
  }

  // ==========================================
  // STANDARD SHEET LAYOUT (A4 / A5 / Letter)
  // ==========================================
  return (
    <div
      className={`bg-white shadow-xl mx-auto rounded-sm border border-slate-200 transition-all text-slate-800 ${className}`}
      style={{
        width: '794px', // Standard 96 DPI A4 width in px
        minHeight: '1123px', // Standard A4 height
        padding: '36px 42px',
        transform: `scale(${scale})`,
        transformOrigin: 'top center',
        backgroundColor: colors.background || '#ffffff',
      }}
    >
      {/* 1. TOP BRAND ACCENT BAR */}
      <div
        className="w-full h-2 rounded-t-sm mb-6"
        style={{ backgroundColor: colors.primary }}
      />

      {/* 2. HEADER BLOCK (Company on Right in RTL, Document Title on Left) */}
      <div className="flex items-start justify-between gap-6 pb-6 border-b border-slate-200">
        {/* Right side in RTL: Company Profile */}
        <div className="space-y-1.5 max-w-sm">
          {template.companyInfoBlocks.showCompanyName && (
            <h1 className="text-xl font-black text-slate-900 tracking-tight leading-snug">
              {data.company.nameAr}
            </h1>
          )}
          {template.companyInfoBlocks.showCompanyName && data.company.nameEn && (
            <p className="text-xs text-slate-500 font-medium">{data.company.nameEn}</p>
          )}

          <div className="pt-2 text-xs space-y-1 text-slate-600">
            {template.companyInfoBlocks.showVatNumber && (
              <p className="flex items-center gap-2">
                <span className="font-bold text-slate-800">الرقم الضريبي (VAT):</span>
                <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-900 font-bold">
                  {data.company.vatNumber}
                </span>
              </p>
            )}
            {template.companyInfoBlocks.showCrNumber && (
              <p className="flex items-center gap-2">
                <span className="font-bold text-slate-800">السجل التجاري (CR):</span>
                <span className="font-mono">{data.company.crNumber}</span>
              </p>
            )}
            {template.companyInfoBlocks.showNationalAddress && data.company.nationalAddress && (
              <p className="text-[11px] text-slate-500 leading-tight">
                {data.company.nationalAddress}
              </p>
            )}
          </div>
        </div>

        {/* Middle: Optional QR placement */}
        {data.zatca?.qrCodeBase64 && template.qrCode.visible && (template.qrCode.placement === 'HEADER' || template.qrCode.placement === 'TOP_RIGHT' || template.qrCode.placement === 'TOP_LEFT') && (
          <div className="flex flex-col items-center bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
            <ZatcaQRCode value={data.zatca.qrCodeBase64} size={template.qrCode.size || 96} />
            <span className="text-[9px] text-slate-400 font-medium mt-1">ZATCA Compliant</span>
          </div>
        )}

        {/* Left side in RTL: Document Identity & Meta */}
        <div className="text-end space-y-2">
          <div>
            <span
              className="inline-block px-3 py-1 text-xs font-black rounded-md text-white shadow-2xs"
              style={{ backgroundColor: colors.primary }}
            >
              {isAr ? docTitles.ar : isBilingual ? `${docTitles.ar} / ${docTitles.en}` : docTitles.en}
            </span>
          </div>
          <p className="text-lg font-black font-mono text-slate-900 tracking-tight">
            #{data.documentNumber}
          </p>
          <div className="text-xs text-slate-500 space-y-0.5 font-medium">
            <p>تاريخ الإصدار: <span className="font-semibold text-slate-700">{data.issueDate}</span></p>
            {data.dueDate && (
              <p>تاريخ الاستحقاق: <span className="font-semibold text-slate-700">{data.dueDate}</span></p>
            )}
            <p>العملة: <span className="font-bold text-slate-800">{data.currency}</span></p>
          </div>
        </div>
      </div>

      {/* 3. PARTY / CUSTOMER / SUPPLIER CARD */}
      {data.party && (
        <div className="my-6 p-4 rounded-lg bg-slate-50 border border-slate-200/90 flex justify-between items-start">
          <div>
            <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block mb-1">
              {data.party.partyType === 'CUSTOMER' ? 'بيانات العميل (Bill To)' : 'بيانات المورد (Supplier)'}
            </span>
            <h4 className="text-sm font-extrabold text-slate-900">
              {data.party.nameAr}
              {data.party.nameEn && <span className="text-slate-500 font-normal ms-2 text-xs">({data.party.nameEn})</span>}
            </h4>
            {data.party.address && <p className="text-xs text-slate-600 mt-0.5">{data.party.address}</p>}
          </div>

          <div className="text-end text-xs space-y-1">
            {data.party.vatNumber && (
              <p>
                <span className="text-slate-500">الرقم الضريبي: </span>
                <span className="font-mono font-bold text-slate-800">{data.party.vatNumber}</span>
              </p>
            )}
            {data.party.crNumber && (
              <p>
                <span className="text-slate-500">السجل التجاري: </span>
                <span className="font-mono">{data.party.crNumber}</span>
              </p>
            )}
            {data.party.phone && (
              <p className="text-slate-500">{data.party.phone}</p>
            )}
          </div>
        </div>
      )}

      {/* 4. LINE ITEMS TABLE */}
      <div className="my-6 overflow-hidden rounded-md border border-slate-200">
        <table className="w-full text-xs text-start border-collapse">
          <thead>
            <tr
              className="border-b border-slate-200 text-slate-800 font-bold"
              style={{ backgroundColor: colors.tableHeaderBg || '#f0fdf4' }}
            >
              {activeColumns.map((col) => (
                <th
                  key={col.id}
                  className="py-3 px-3 text-start font-bold"
                  style={{ width: `${col.widthPct}%` }}
                >
                  {isAr ? col.labelAr : isBilingual ? `${col.labelAr} / ${col.labelEn}` : col.labelEn}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.lines.map((line, idx) => (
              <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}>
                {activeColumns.map((col) => {
                  let cellContent: React.ReactNode = null;
                  if (col.id === 'lineNumber') cellContent = line.lineNumber;
                  else if (col.id === 'itemCode') cellContent = <span className="font-mono text-slate-500">{line.itemCode}</span>;
                  else if (col.id === 'name') {
                    cellContent = (
                      <div>
                        <span className="font-bold text-slate-900 block">{line.nameAr}</span>
                        {line.nameEn && <span className="text-[10px] text-slate-400">{line.nameEn}</span>}
                      </div>
                    );
                  } else if (col.id === 'quantity') cellContent = <span className="font-semibold">{line.quantity} {line.unitName}</span>;
                  else if (col.id === 'unitPrice') cellContent = <span className="font-mono">{line.unitPriceSar.toFixed(2)}</span>;
                  else if (col.id === 'discount') cellContent = <span className="font-mono text-slate-500">{line.discountSar > 0 ? line.discountSar.toFixed(2) : '-'}</span>;
                  else if (col.id === 'vatRate') cellContent = <span className="font-mono text-slate-600">{line.vatRatePct}%</span>;
                  else if (col.id === 'total') cellContent = <span className="font-mono font-bold text-slate-900">{line.totalSar.toFixed(2)}</span>;
                  else if (col.id === 'description') cellContent = line.nameAr;
                  else if (col.id === 'amount') cellContent = <span className="font-mono font-bold">{line.totalSar.toFixed(2)}</span>;
                  else if (col.id === 'barcode') cellContent = <span className="font-mono text-[11px]">{line.barcode || line.itemCode}</span>;

                  return (
                    <td key={col.id} className="py-3 px-3 text-start">
                      {cellContent}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 5. SUMMARY & TOTALS SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-6 items-start">
        {/* Left / Bank details & Payment Info */}
        <div className="space-y-4">
          {template.companyInfoBlocks.showBankAccounts && data.company.bankAccounts && data.company.bankAccounts.length > 0 && (
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80 text-xs">
              <span className="font-bold text-slate-900 block mb-2">الحسابات المصرفية المعتمدة للتحويل:</span>
              <div className="space-y-2">
                {data.company.bankAccounts.map((b, bIdx) => (
                  <div key={bIdx} className="text-slate-700">
                    <p className="font-semibold text-slate-900">{b.bankName}</p>
                    <p className="font-mono text-[11px] text-slate-600">IBAN: {b.iban}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.notes && (
            <div className="text-xs text-slate-500 italic bg-amber-50/60 p-3 rounded border border-amber-200/60">
              <span className="font-bold text-amber-900 block mb-0.5">ملاحظات:</span>
              {data.notes}
            </div>
          )}
        </div>

        {/* Right / Totals Box */}
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 space-y-2.5 text-xs">
          <div className="flex justify-between text-slate-600">
            <span>المجموع الخاضع للضريبة:</span>
            <span className="font-mono font-semibold text-slate-800">{data.totals.taxableAmountSar.toFixed(2)} ر.س</span>
          </div>
          {data.totals.discountTotalSar > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>إجمالي الخصم التجاري:</span>
              <span className="font-mono text-emerald-700">-{data.totals.discountTotalSar.toFixed(2)} ر.س</span>
            </div>
          )}
          <div className="flex justify-between text-slate-600">
            <span>ضريبة القيمة المضافة (15%):</span>
            <span className="font-mono font-semibold text-slate-800">{data.totals.vatAmountSar.toFixed(2)} ر.س</span>
          </div>

          <div
            className="flex justify-between items-center pt-3 border-t border-slate-200 font-black text-sm rounded px-2.5 py-1.5 text-white"
            style={{ backgroundColor: colors.primary }}
          >
            <span>الإجمالي المستحق:</span>
            <span className="font-mono text-base">{data.totals.totalAmountSar.toFixed(2)} ر.س</span>
          </div>

          {data.totals.balanceDueSar !== undefined && (
            <div className="flex justify-between pt-1 text-slate-700 font-bold">
              <span>الرصيد المتبقي للدفع:</span>
              <span className="font-mono text-rose-700">{data.totals.balanceDueSar.toFixed(2)} ر.س</span>
            </div>
          )}
        </div>
      </div>

      {/* 6. SIGNATURE BLOCK */}
      {template.showSignatureBlock && (
        <div className="grid grid-cols-2 gap-12 mt-12 pt-6 border-t border-slate-200 text-xs text-center text-slate-500">
          <div>
            <p className="font-bold text-slate-700 mb-8">المسؤول المفوض / المحاسب</p>
            <div className="border-b border-slate-300 w-48 mx-auto" />
          </div>
          <div>
            <p className="font-bold text-slate-700 mb-8">استلام العميل والختم الرسمي</p>
            <div className="border-b border-slate-300 w-48 mx-auto" />
          </div>
        </div>
      )}

      {/* 7. FOOTER */}
      <div className="mt-8 pt-4 border-t border-slate-100 text-center text-[10px] text-slate-400">
        {template.footerText || `${data.company.nameAr} - تم إصدار هذا المستند عبر المنصة السحابية المعتمدة`}
      </div>
    </div>
  );
};

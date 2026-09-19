import React, { useState } from 'react';
import { useI18n } from '../../../i18n/context.js';
import {
  FileCheck,
  AlertTriangle,
  CheckCircle,
  Search,
  ShieldAlert,
  ArrowRight,
  ShieldCheck,
  Eye,
  Sliders,
  Sparkles,
} from 'lucide-react';
import {
  PurchaseBill,
  PurchaseOrder,
  GoodsReceiptNote,
  roundHalalas,
} from '../../../lib/purchasing.js';

interface ThreeWayMatchingTabProps {
  bills: PurchaseBill[];
  orders: PurchaseOrder[];
  receipts: GoodsReceiptNote[];
  onRefresh: () => void;
}

export const ThreeWayMatchingTab: React.FC<ThreeWayMatchingTabProps> = ({
  bills,
  orders,
  receipts,
  onRefresh,
}) => {
  const { isAr, formatCurrency } = useI18n();

  const [selectedBillId, setSelectedBillId] = useState<string>(bills[0]?.id || '');
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const currentBill = bills.find((b) => b.id === selectedBillId);
  const linkedPO = currentBill?.purchaseOrderId
    ? orders.find((o) => o.id === currentBill.purchaseOrderId)
    : undefined;
  const linkedGRN = linkedPO
    ? receipts.find((r) => r.purchaseOrderId === linkedPO.id)
    : undefined;

  const handleOverride = async () => {
    if (!currentBill || !overrideReason.trim()) return;
    try {
      setActionLoading(true);
      const res = await fetch('/api/v1/purchasing/matching/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billId: currentBill.id,
          overrideReason: overrideReason.trim(),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to override match');
      }

      setOverrideModalOpen(false);
      setOverrideReason('');
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-b-2xl border border-t-0 border-slate-200 shadow-xs overflow-hidden p-6 space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-purple-50/70 border border-purple-100 p-4 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-600 text-white flex items-center justify-center font-bold">
            <FileCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-purple-900">
              {isAr ? 'نظام الرقابة والمطابقة الثلاثية (3-Way Matching Engine)' : '3-Way Matching Verification & Audit'}
            </h3>
            <p className="text-xs text-purple-700">
              {isAr
                ? 'فحص آلي للتطابق التام بين أمر الشراء (PO) وسند استلام المستودع (GRN) وفاتورة المورد (Bill) لمنع الدفع الزائد أو التلاعب.'
                : 'Automated 3-way reconciliation across Purchase Orders, Warehouse GRNs, and Vendor Bills.'}
            </p>
          </div>
        </div>

        {/* Bill Selector */}
        <div className="w-full sm:w-auto">
          <select
            value={selectedBillId}
            onChange={(e) => setSelectedBillId(e.target.value)}
            className="w-full sm:w-72 px-3 py-2 bg-white border border-purple-200 rounded-xl text-xs font-semibold text-purple-900 focus:ring-2 focus:ring-purple-500"
          >
            {bills.map((b) => (
              <option key={b.id} value={b.id}>
                {b.billNumber} - {b.supplierNameAr} ({b.threeWayMatchStatus || 'MATCHED'})
              </option>
            ))}
          </select>
        </div>
      </div>

      {currentBill ? (
        <div className="space-y-6">
          {/* Status Summary Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Document 1: PO */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
              <div className="text-xs text-slate-500 mb-1">
                {isAr ? '1. أمر الشراء المتفق عليه (PO)' : '1. Purchase Order (PO)'}
              </div>
              <div className="text-sm font-bold text-slate-900">
                {linkedPO ? linkedPO.orderNumber : (isAr ? 'غير مرتبط بأمر شراء' : 'No PO Linked')}
              </div>
              {linkedPO && (
                <div className="mt-2 text-xs text-slate-600 space-y-1">
                  <div>{isAr ? 'القيمة الإجمالية:' : 'Total:'} <strong>{formatCurrency(linkedPO.totalAmountSar)}</strong></div>
                  <div>{isAr ? 'الحالة:' : 'Status:'} <span className="text-indigo-600 font-semibold">{linkedPO.status}</span></div>
                </div>
              )}
            </div>

            {/* Document 2: GRN */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
              <div className="text-xs text-slate-500 mb-1">
                {isAr ? '2. سند استلام المستودع (GRN)' : '2. Warehouse Receipt (GRN)'}
              </div>
              <div className="text-sm font-bold text-slate-900">
                {linkedGRN ? linkedGRN.grnNumber : (isAr ? 'لم يتم الاستلام بعد' : 'Not Received Yet')}
              </div>
              {linkedGRN && (
                <div className="mt-2 text-xs text-slate-600 space-y-1">
                  <div>{isAr ? 'المستودع:' : 'Wh:'} <strong>{linkedGRN.warehouseNameAr}</strong></div>
                  <div>{isAr ? 'الكمية المقبولة:' : 'Accepted:'} <strong className="text-emerald-600">{linkedGRN.lines.reduce((a, b) => a + b.quantity, 0)}</strong></div>
                </div>
              )}
            </div>

            {/* Document 3: Bill */}
            <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/30">
              <div className="text-xs text-purple-700 mb-1 font-semibold">
                {isAr ? '3. فاتورة المورد الضريبية (Bill)' : '3. Vendor Tax Bill'}
              </div>
              <div className="text-sm font-bold text-purple-900">
                {currentBill.billNumber}
              </div>
              <div className="mt-2 text-xs text-purple-800 space-y-1">
                <div>{isAr ? 'فاتورة المورد:' : 'Inv #:'} <strong>{currentBill.supplierInvoiceNumber || '-'}</strong></div>
                <div>{isAr ? 'القيمة:' : 'Amount:'} <strong>{formatCurrency(currentBill.totalAmountSar)}</strong></div>
              </div>
            </div>
          </div>

          {/* Verification Result Banner */}
          <div className="p-4 rounded-xl border flex items-center justify-between gap-4 bg-slate-50">
            <div className="flex items-center gap-3">
              {currentBill.threeWayMatchStatus === 'MATCHED' ? (
                <>
                  <CheckCircle className="w-6 h-6 text-emerald-600 shrink-0" />
                  <div>
                    <div className="text-sm font-bold text-emerald-800">
                      {isAr ? 'المطابقة الثلاثية مكتملة وناجحة (100% Match)' : '3-Way Match Verified & Passed'}
                    </div>
                    <div className="text-xs text-emerald-600">
                      {isAr
                        ? 'تطابق كامل في الكميات والأسعار ونسبة الضريبة، الفاتورة مؤهلة للصرف والترحيل.'
                        : 'Quantities and prices match purchase orders and warehouse receipts within allowed tolerances.'}
                    </div>
                  </div>
                </>
              ) : currentBill.threeWayMatchOverrideReason ? (
                <>
                  <ShieldAlert className="w-6 h-6 text-amber-600 shrink-0" />
                  <div>
                    <div className="text-sm font-bold text-amber-800">
                      {isAr ? 'تم تجاوز فروقات المطابقة بقرار إداري معتمد' : 'Match Overridden by Manager'}
                    </div>
                    <div className="text-xs text-amber-700">
                      {isAr ? 'سبب التجاوز:' : 'Reason:'} {currentBill.threeWayMatchOverrideReason}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0" />
                  <div>
                    <div className="text-sm font-bold text-rose-800">
                      {isAr ? 'يوجد فروقات في المطابقة الثلاثية (Discrepancy Detected)' : 'Discrepancy Detected'}
                    </div>
                    <div className="text-xs text-rose-600">
                      {currentBill.threeWayMatchStatus}
                    </div>
                  </div>
                </>
              )}
            </div>

            {currentBill.threeWayMatchStatus !== 'MATCHED' && !currentBill.threeWayMatchOverrideReason && (
              <button
                onClick={() => setOverrideModalOpen(true)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs shrink-0"
              >
                {isAr ? 'اعتماد التجاوز مع توثيق السبب' : 'Approve Discrepancy Override'}
              </button>
            )}
          </div>

          {/* Line by Line Detailed Match Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-start text-xs text-slate-600">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5 text-start">{isAr ? 'الصنف' : 'Item'}</th>
                  <th className="px-3 py-2.5 text-center bg-blue-50/50">{isAr ? 'كمية PO' : 'PO Qty'}</th>
                  <th className="px-3 py-2.5 text-center bg-emerald-50/50">{isAr ? 'كمية المستودع GRN' : 'GRN Qty'}</th>
                  <th className="px-3 py-2.5 text-center bg-purple-50/50">{isAr ? 'كمية الفاتورة Bill' : 'Bill Qty'}</th>
                  <th className="px-3 py-2.5 text-end">{isAr ? 'سعر PO' : 'PO Price'}</th>
                  <th className="px-3 py-2.5 text-end">{isAr ? 'سعر الفاتورة' : 'Bill Price'}</th>
                  <th className="px-3 py-2.5 text-center">{isAr ? 'حالة البند' : 'Line Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentBill.lines.map((bl, idx) => {
                  const poLine = linkedPO?.lines.find((pl) => pl.itemId === bl.itemId);
                  const grnLine = linkedGRN?.lines.find((gl) => gl.itemId === bl.itemId);

                  const poQty = poLine?.quantity || 0;
                  const grnQty = grnLine?.quantity || 0;
                  const billQty = bl.quantity;

                  const isQtyMatch = billQty <= grnQty || billQty <= poQty;
                  const isPriceMatch = !poLine || bl.unitCostSar <= poLine.unitCostSar * 1.05;

                  return (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5 font-bold text-slate-800">
                        {bl.nameAr}
                      </td>
                      <td className="px-3 py-2.5 text-center font-semibold text-blue-700 bg-blue-50/20">
                        {poQty}
                      </td>
                      <td className="px-3 py-2.5 text-center font-semibold text-emerald-700 bg-emerald-50/20">
                        {grnQty}
                      </td>
                      <td className="px-3 py-2.5 text-center font-bold text-purple-700 bg-purple-50/20">
                        {billQty}
                      </td>
                      <td className="px-3 py-2.5 text-end font-medium text-slate-700">
                        {poLine ? formatCurrency(poLine.unitCostSar) : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-end font-bold text-slate-900">
                        {formatCurrency(bl.unitCostSar)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {isQtyMatch && isPriceMatch ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                            {isAr ? 'مطابق' : 'Matched'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                            {isAr ? 'فروقات' : 'Variance'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-slate-400">
          {isAr ? 'لا توجد فواتير مشتريات للمطابقة' : 'No purchase bills available for matching'}
        </div>
      )}

      {/* Override Modal */}
      {overrideModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-amber-800 mb-2">
              {isAr ? 'اعتماد تجاوز فروقات المطابقة الثلاثية' : 'Manager Discrepancy Override'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {isAr
                ? 'وفقاً لسياسة الحوكمة والرقابة المالية، يتطلب تجاوز فروقات المطابقة توثيق سبب الاعتماد الإداري في سجل التدقيق.'
                : 'Overriding discrepancies requires an audited justification reason.'}
            </p>

            <textarea
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              rows={3}
              placeholder={isAr ? 'اكتب تبرير الاعتماد الإداري...' : 'State management reason for override...'}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs mb-4"
              required
            />

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setOverrideModalOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleOverride}
                disabled={actionLoading || !overrideReason.trim()}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs"
              >
                {isAr ? 'تأكيد التجاوز والترحيل' : 'Confirm Override & Allow Post'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

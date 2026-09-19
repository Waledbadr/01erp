import React, { useState } from 'react';
import { useI18n } from '../../../i18n/context.js';
import {
  CreditCard,
  CheckCircle,
  X,
  AlertCircle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import {
  SupplierPayment,
  PurchaseBill,
  roundHalalas,
} from '../../../lib/purchasing.js';

interface PaymentReallocationModalProps {
  payment: SupplierPayment;
  bills: PurchaseBill[];
  onClose: () => void;
  onSuccess: () => void;
}

export const PaymentReallocationModal: React.FC<PaymentReallocationModalProps> = ({
  payment,
  bills,
  onClose,
  onSuccess,
}) => {
  const { isAr, formatCurrency, formatDate } = useI18n();

  // Filter bills for this supplier
  const supplierBills = bills.filter((b) => b.supplierId === payment.supplierId && b.status !== 'CANCELLED');

  const [allocations, setAllocations] = useState<
    Array<{ billId: string; allocatedAmountSar: number }>
  >(
    supplierBills.map((b) => {
      const existing = (payment.allocations || []).find((a) => a.billId === b.id);
      return {
        billId: b.id,
        allocatedAmountSar: existing ? existing.allocatedAmountSar : 0,
      };
    })
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalAllocated = allocations.reduce((acc, a) => acc + (a.allocatedAmountSar || 0), 0);
  const unallocatedAmount = roundHalalas(payment.amountSar - totalAllocated);

  const handleApplyFIFO = () => {
    let remaining = payment.amountSar;
    const sorted = [...supplierBills].sort(
      (a, b) => new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime()
    );

    const newAlloc = supplierBills.map((b) => {
      const billRemaining = b.remainingAmountSar || b.totalAmountSar;
      const alloc = Math.min(remaining, billRemaining);
      remaining = roundHalalas(remaining - alloc);
      return {
        billId: b.id,
        allocatedAmountSar: alloc,
      };
    });

    setAllocations(newAlloc);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalAllocated > payment.amountSar) {
      setError(isAr ? 'إجمالي المبالغ المخصصة يتجاوز قيمة سند الصرف!' : 'Total allocated exceeds payment amount!');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/v1/purchasing/payments/${payment.id}/reallocate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newAllocations: allocations
            .filter((a) => a.allocatedAmountSar > 0)
            .map((a) => ({
              purchaseBillId: a.billId,
              allocatedAmountSar: a.allocatedAmountSar,
            })),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to reallocate payment');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {isAr ? `إعادة تخصيص سند الصرف ${payment.paymentNumber}` : `Reallocate Payment ${payment.paymentNumber}`}
            </h3>
            <p className="text-xs text-slate-500">
              {payment.supplierNameAr} | {formatCurrency(payment.amountSar)}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mt-3 p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4 mt-4">
          <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl text-xs">
            <div>
              <span className="text-slate-500">{isAr ? 'قيمة السند الإجمالية:' : 'Total Voucher:'}</span>{' '}
              <strong className="text-slate-900">{formatCurrency(payment.amountSar)}</strong>
            </div>
            <div>
              <span className="text-slate-500">{isAr ? 'المخصص للفواتير:' : 'Allocated:'}</span>{' '}
              <strong className="text-indigo-600">{formatCurrency(totalAllocated)}</strong>
            </div>
            <div>
              <span className="text-slate-500">{isAr ? 'رصيد دفعة مقدمة (متبقي):' : 'Advance Balance:'}</span>{' '}
              <strong className={unallocatedAmount > 0 ? 'text-emerald-600' : 'text-slate-900'}>
                {formatCurrency(unallocatedAmount)}
              </strong>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleApplyFIFO}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isAr ? 'تخصيص آلي بالأقدمية (FIFO Auto-Fill)' : 'Auto Allocate FIFO'}</span>
            </button>
          </div>

          {/* Bills List */}
          <div className="space-y-2 max-h-60 overflow-y-auto border border-slate-200 p-2 rounded-xl bg-slate-50/50">
            {supplierBills.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400">
                {isAr ? 'لا توجد فواتير غير مسددة لهذا المورد' : 'No unpaid bills for this supplier'}
              </div>
            ) : (
              supplierBills.map((bill, idx) => {
                const currentAlloc = allocations.find((a) => a.billId === bill.id)?.allocatedAmountSar || 0;
                return (
                  <div key={bill.id} className="bg-white p-3 rounded-lg border border-slate-200 text-xs flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <div className="font-bold text-slate-900">{bill.billNumber}</div>
                      <div className="text-slate-400 text-[10px]">
                        {isAr ? 'فاتورة مورد:' : 'Inv:'} {bill.supplierInvoiceNumber || '-'} | {formatDate(bill.issueDate)}
                      </div>
                    </div>

                    <div className="text-end">
                      <div className="text-slate-500 text-[10px]">{isAr ? 'إجمالي الفاتورة' : 'Bill Total'}</div>
                      <div className="font-semibold text-slate-800">{formatCurrency(bill.totalAmountSar)}</div>
                    </div>

                    <div className="w-28">
                      <label className="block text-slate-500 text-[10px] mb-0.5">{isAr ? 'المبلغ المخصص' : 'Allocated'}</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={payment.amountSar}
                        value={currentAlloc}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const updated = allocations.map((a) => (a.billId === bill.id ? { ...a, allocatedAmountSar: val } : a));
                          setAllocations(updated);
                        }}
                        className="w-full px-2 py-1 border border-slate-200 rounded-md text-xs font-bold text-indigo-600 text-end"
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs"
            >
              {isAr ? 'حفظ التخصيص الجديد' : 'Save Reallocation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

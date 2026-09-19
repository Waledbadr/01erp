import React, { useState } from 'react';
import { useI18n } from '../../../i18n/context.js';
import {
  Ship,
  Plus,
  Trash2,
  CheckCircle,
  Coins,
  Layers,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import {
  GoodsReceiptNote,
  PurchaseBill,
  roundHalalas,
} from '../../../lib/purchasing.js';

interface LandedCostPurchasingTabProps {
  receipts: GoodsReceiptNote[];
  bills: PurchaseBill[];
  onRefresh: () => void;
}

export const LandedCostPurchasingTab: React.FC<LandedCostPurchasingTabProps> = ({
  receipts,
  bills,
  onRefresh,
}) => {
  const { isAr, formatCurrency, formatDate } = useI18n();

  const [selectedGRNId, setSelectedGRNId] = useState<string>(receipts[0]?.id || '');
  const [allocationMethod, setAllocationMethod] = useState<'BY_VALUE' | 'BY_QUANTITY' | 'BY_WEIGHT' | 'BY_VOLUME'>('BY_VALUE');
  const [vendorInvoiceReference, setVendorInvoiceReference] = useState('');
  const [costItems, setCostItems] = useState<
    Array<{
      costType: 'FREIGHT' | 'CUSTOMS_DUTY' | 'INSURANCE' | 'PORT_HANDLING' | 'CLEARANCE_FEE' | 'OTHER';
      amountSar: number;
      supplierId?: string;
      description?: string;
    }>
  >([
    { costType: 'CUSTOMS_DUTY', amountSar: 1200, description: 'رسوم جمركية ميناء الملك عبد العزيز' },
    { costType: 'FREIGHT', amountSar: 800, description: 'أجور نقل وشحن بري' },
  ]);

  const [actionLoading, setActionLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedGRN = receipts.find((r) => r.id === selectedGRNId);
  const totalLandedCost = costItems.reduce((acc, c) => acc + (c.amountSar || 0), 0);

  const handleAddCostLine = () => {
    setCostItems([
      ...costItems,
      {
        costType: 'OTHER',
        amountSar: 100,
        description: '',
      },
    ]);
  };

  const handleAllocate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGRNId || costItems.length === 0 || totalLandedCost <= 0) return;

    try {
      setActionLoading(true);
      const res = await fetch('/api/v1/purchasing/landed-cost/allocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grnId: selectedGRNId,
          allocationMethod,
          vendorInvoiceReference: vendorInvoiceReference.trim() || undefined,
          costs: costItems,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to allocate landed cost');
      }

      const result = await res.json();
      setSuccessMessage(
        isAr
          ? `تم بنجاح توزيع تكاليف إضافية بقيمة ${formatCurrency(result.totalAllocatedSar)} على بنود السند ${selectedGRN?.grnNumber} وتحديث المتوسط المرجح WAC وإنشاء القيد المحاسبي!`
          : `Successfully capitalized ${formatCurrency(result.totalAllocatedSar)} into inventory WAC!`
      );
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-b-2xl border border-t-0 border-slate-200 shadow-xs overflow-hidden p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-indigo-50/70 border border-indigo-100 p-4 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
            <Ship className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-indigo-900">
              {isAr ? 'توزيع تكاليف الاستيراد والإنزال (Landed Costs Capitalization)' : 'Landed Cost Capitalization'}
            </h3>
            <p className="text-xs text-indigo-700">
              {isAr
                ? 'رسملة تكاليف الشحن، الجمارك، التأمين، والمناولة مباشرة على تكلفة البضاعة المشتراة لضبط المتوسط المرجح WAC بدقة.'
                : 'Directly capitalize freight, customs duty, and port handling into inventory valuation.'}
            </p>
          </div>
        </div>

        <div className="text-end">
          <div className="text-xs text-indigo-700 font-semibold">{isAr ? 'إجمالي التكاليف الإضافية' : 'Total Landed Cost'}</div>
          <div className="text-xl font-bold text-indigo-950">{formatCurrency(totalLandedCost)}</div>
        </div>
      </div>

      {successMessage && (
        <div className="p-4 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Allocation Form */}
      <form onSubmit={handleAllocate} className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {isAr ? 'سند استلام البضاعة المراد تحميله (GRN)' : 'Target Goods Receipt (GRN)'}
            </label>
            <select
              value={selectedGRNId}
              onChange={(e) => setSelectedGRNId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium"
              required
            >
              {receipts.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.grnNumber} - {r.supplierNameAr} ({isAr ? 'المستودع:' : 'Wh:'} {r.warehouseNameAr})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {isAr ? 'طريقة التوزيع والتخصيص' : 'Allocation Basis'}
            </label>
            <select
              value={allocationMethod}
              onChange={(e: any) => setAllocationMethod(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium"
            >
              <option value="BY_VALUE">{isAr ? 'حسب القيمة النقدية (By Value - الأرجح)' : 'By Value'}</option>
              <option value="BY_QUANTITY">{isAr ? 'حسب الكمية المستلمة (By Quantity)' : 'By Quantity'}</option>
              <option value="BY_WEIGHT">{isAr ? 'حسب الوزن (By Weight)' : 'By Weight'}</option>
              <option value="BY_VOLUME">{isAr ? 'حسب الحجم (By Volume)' : 'By Volume'}</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {isAr ? 'رقم الفاتورة المرجعية للمخلص/الناقل' : 'Vendor / Freight Bill #'}
            </label>
            <input
              type="text"
              value={vendorInvoiceReference}
              onChange={(e) => setVendorInvoiceReference(e.target.value)}
              placeholder="EXP-CUSTOMS-991"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs"
            />
          </div>
        </div>

        {/* Cost Elements Breakdown */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-800">
              {isAr ? 'عناصر وبنود التكاليف الإضافية (الجمارك والشحن)' : 'Landed Cost Items'}
            </span>
            <button
              type="button"
              onClick={handleAddCostLine}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isAr ? 'إضافة مصروف' : 'Add Cost Line'}</span>
            </button>
          </div>

          <div className="space-y-2 border border-slate-200 p-3 rounded-xl bg-slate-50/50">
            {costItems.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-white p-2.5 rounded-lg border border-slate-200 text-xs">
                <div className="w-44">
                  <select
                    value={item.costType}
                    onChange={(e: any) => {
                      const updated = [...costItems];
                      updated[idx].costType = e.target.value;
                      setCostItems(updated);
                    }}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="CUSTOMS_DUTY">{isAr ? 'رسوم جمركية' : 'Customs Duty'}</option>
                    <option value="FREIGHT">{isAr ? 'أجور شحن ونقل' : 'Freight'}</option>
                    <option value="INSURANCE">{isAr ? 'تأمين بضائع' : 'Insurance'}</option>
                    <option value="PORT_HANDLING">{isAr ? 'رسوم مناولة موانئ' : 'Port Handling'}</option>
                    <option value="CLEARANCE_FEE">{isAr ? 'أتعاب تخليص جمركي' : 'Clearance Fee'}</option>
                    <option value="OTHER">{isAr ? 'مصاريف أخرى' : 'Other'}</option>
                  </select>
                </div>

                <div className="flex-1">
                  <input
                    type="text"
                    placeholder={isAr ? 'البيان / الوصف...' : 'Description...'}
                    value={item.description || ''}
                    onChange={(e) => {
                      const updated = [...costItems];
                      updated[idx].description = e.target.value;
                      setCostItems(updated);
                    }}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs"
                  />
                </div>

                <div className="w-32">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={item.amountSar}
                    onChange={(e) => {
                      const updated = [...costItems];
                      updated[idx].amountSar = Number(e.target.value);
                      setCostItems(updated);
                    }}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs text-end font-bold text-slate-900"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setCostItems(costItems.filter((_, i) => i !== idx))}
                  className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-md"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* GRN Items Impact Preview */}
        {selectedGRN && (
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
            <h4 className="text-xs font-bold text-slate-800 mb-3">
              {isAr ? `معاينة الأثر على بنود السند ${selectedGRN.grnNumber}:` : `Impact Preview on GRN Items:`}
            </h4>

            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs text-slate-600">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-200">
                    <th className="pb-2 text-start">{isAr ? 'الصنف' : 'Item'}</th>
                    <th className="pb-2 text-center">{isAr ? 'الكمية المستلمة' : 'Accepted Qty'}</th>
                    <th className="pb-2 text-end">{isAr ? 'تكلفة الشراء الأصلية' : 'Base Cost'}</th>
                    <th className="pb-2 text-end">{isAr ? 'نصيب البند من التكاليف' : 'Allocated Landed'}</th>
                    <th className="pb-2 text-end">{isAr ? 'التكلفة الرأسمالية الجديدة للوحدة' : 'New Unit Cost'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedGRN.lines.map((l, i) => {
                    const lineShare = totalLandedCost / (selectedGRN.lines.length || 1);
                    const perUnitAdded = lineShare / (l.quantity || 1);
                    const estBaseCost = l.unitCostSar || 50; // visual representation
                    return (
                      <tr key={i}>
                        <td className="py-2 font-semibold text-slate-800">{l.nameAr}</td>
                        <td className="py-2 text-center font-bold text-indigo-600">{l.quantity}</td>
                        <td className="py-2 text-end">{formatCurrency(estBaseCost)}</td>
                        <td className="py-2 text-end font-semibold text-purple-600">+{formatCurrency(lineShare)}</td>
                        <td className="py-2 text-end font-bold text-emerald-700">{formatCurrency(estBaseCost + perUnitAdded)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={actionLoading || !selectedGRNId || totalLandedCost <= 0}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
          >
            {isAr ? 'تأكيد التوزيع وترحيل القيد المحاسبي' : 'Confirm Allocation & Post GL'}
          </button>
        </div>
      </form>
    </div>
  );
};

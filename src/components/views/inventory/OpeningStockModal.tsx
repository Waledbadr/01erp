import React, { useState } from 'react';
import { useI18n } from '../../../i18n/context.js';
import { Button } from '../../ui/Button.js';
import { useToast } from '../../ui/Toast.js';
import {
  Boxes,
  Plus,
  Trash2,
  ShieldCheck,
  Building2,
  Calendar,
} from 'lucide-react';

interface OpeningStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  warehouses: Array<{ id: string; code: string; nameAr: string }>;
  items: Array<{ id: string; sku: string; nameAr: string; baseUnit: string; cost?: number }>;
  getAuthHeaders: () => Record<string, string>;
}

export const OpeningStockModal: React.FC<OpeningStockModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  warehouses,
  items,
  getAuthHeaders,
}) => {
  const { language, isRTL } = useI18n();
  const isAr = language === 'ar';
  const toast = useToast();

  const [warehouseId, setWarehouseId] = useState<string>(warehouses[0]?.id || '');
  const [openingDate, setOpeningDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<
    Array<{ itemId: string; quantity: number; unitCost: number }>
  >([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleAddLine = () => {
    if (items.length === 0) return;
    const it = items[0];
    setLines([...lines, { itemId: it.id, quantity: 100, unitCost: it.cost || 20 }]);
  };

  const handleRemoveLine = (index: number) => {
    setLines(lines.filter((_, idx) => idx !== index));
  };

  const handleLineChange = (index: number, field: string, val: any) => {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: val };
    setLines(updated);
  };

  const totalValue = lines.reduce(
    (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0),
    0
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!warehouseId) {
      toast.error(isAr ? 'حدد المستودع' : 'Select warehouse');
      return;
    }
    if (lines.length === 0) {
      toast.error(isAr ? 'أضف صنفاً واحداً على الأقل' : 'Add at least one item');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/v1/inventory/opening-stock', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          warehouseId,
          openingDate,
          lines,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'فشل تسجيل بضاعة أول المدة');
      }

      toast.success(
        isAr
          ? 'تم اعتماد بضاعة أول المدة وتوليد القيد الافتتاحي المتزن في حقوق الملكية'
          : 'Opening stock posted to GL successfully'
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-neutral-200">
        <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
          <div className="flex items-center gap-2">
            <Boxes className="w-5 h-5 text-primary-600" />
            <div>
              <h3 className="font-semibold text-neutral-900">
                {isAr ? 'إثبات بضاعة أول المدة التأسيسية' : 'Post Opening Inventory Balances'}
              </h3>
              <p className="text-xs text-neutral-500">
                {isAr
                  ? 'ترحيل أرصدة المخزون الافتتاحية مع توليد القيد المحاسبي في حقوق الملكية'
                  : 'Double-entry opening balance into equity'}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            ✕
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 overflow-y-auto flex-1 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-neutral-700 mb-1">
                {isAr ? 'المستودع *' : 'Warehouse *'}
              </label>
              <select
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                className="w-full text-xs rounded-lg border border-neutral-300 p-2 text-neutral-800"
                required
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.nameAr} ({w.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-neutral-700 mb-1">
                {isAr ? 'تاريخ بداية الفترة المالية *' : 'Opening Date *'}
              </label>
              <input
                type="date"
                value={openingDate}
                onChange={(e) => setOpeningDate(e.target.value)}
                className="w-full text-xs rounded-lg border border-neutral-300 p-2 text-neutral-800"
                required
              />
            </div>
          </div>

          {/* Items List */}
          <div className="border border-neutral-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-neutral-800">
                {isAr ? 'أصناف بضاعة أول المدة' : 'Opening Inventory Lines'}
              </h4>
              <Button type="button" variant="outline" size="sm" onClick={handleAddLine}>
                <Plus className="w-3.5 h-3.5 me-1" />
                {isAr ? 'إضافة صنف' : 'Add Item'}
              </Button>
            </div>

            <div className="space-y-2">
              {lines.length === 0 ? (
                <p className="text-center py-4 text-neutral-400">
                  {isAr ? 'اضغط إضافة صنف لبدء إدخال بضاعة أول المدة' : 'Click Add Item to start'}
                </p>
              ) : (
                lines.map((ln, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-neutral-50 p-2 rounded-lg border border-neutral-200">
                    <div className="flex-1">
                      <select
                        value={ln.itemId}
                        onChange={(e) => handleLineChange(idx, 'itemId', e.target.value)}
                        className="w-full text-xs rounded border border-neutral-300 p-1.5 bg-white text-neutral-800"
                      >
                        {items.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.sku} - {i.nameAr} ({i.baseUnit})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="w-28">
                      <label className="text-[10px] text-neutral-500 block">{isAr ? 'الكمية الافتتاحية' : 'Qty'}</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={ln.quantity}
                        onChange={(e) => handleLineChange(idx, 'quantity', Number(e.target.value))}
                        className="w-full text-xs rounded border border-neutral-300 p-1 bg-white text-neutral-800 font-bold"
                        required
                      />
                    </div>

                    <div className="w-32">
                      <label className="text-[10px] text-neutral-500 block">{isAr ? 'تكلفة الوحدة ر.س' : 'Unit Cost'}</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={ln.unitCost}
                        onChange={(e) => handleLineChange(idx, 'unitCost', Number(e.target.value))}
                        className="w-full text-xs rounded border border-neutral-300 p-1 bg-white text-neutral-800 font-mono"
                        required
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveLine(idx)}
                      className="text-neutral-400 hover:text-rose-600 p-1 self-center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {lines.length > 0 && (
              <div className="flex justify-end pt-2 border-t border-neutral-100 font-bold text-xs text-neutral-800">
                <span>{isAr ? 'إجمالي قيمة بضاعة أول المدة:' : 'Total Value:'} </span>
                <span className="font-mono text-emerald-700 ms-2">{totalValue.toFixed(2)} ر.س</span>
              </div>
            )}
          </div>

          <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg text-emerald-900 text-[11px] flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p>
              {isAr
                ? 'القيد المحاسبي المولد آلياً: مدين: مخزون البضائع (10401) / دائن: الأرصدة الافتتاحية بحقوق الملكية (30301) بمبلغ إجمالي متطابق تماماً.'
                : 'Balanced Entry: Dr Inventory Asset (10401) / Cr Opening Equity (30301).'}
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={isSubmitting || lines.length === 0}>
              {isSubmitting ? (isAr ? 'جاري الاعتماد...' : 'Posting...') : (isAr ? 'اعتماد بضاعة أول المدة' : 'Post Opening Stock')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

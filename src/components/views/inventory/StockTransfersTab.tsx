import React, { useState, useEffect } from 'react';
import { useI18n } from '../../../i18n/context.js';
import { Button } from '../../ui/Button.js';
import { Input } from '../../ui/Input.js';
import { Badge } from '../../ui/Badge.js';
import { useToast } from '../../ui/Toast.js';
import {
  ArrowLeftRight,
  Plus,
  RefreshCw,
  Warehouse,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  FileCheck,
  Calendar,
  AlertCircle,
  Package,
  Trash2,
} from 'lucide-react';
import { StockTransfer } from '../../../lib/inventory.js';

interface StockTransfersTabProps {
  warehouses: Array<{ id: string; code: string; nameAr: string }>;
  items: Array<{
    id: string;
    sku: string;
    nameAr: string;
    baseUnit: string;
    currentStock: number;
    currentWac?: number;
    units: Array<{ id: string; nameAr: string; conversionFactor: number }>;
  }>;
  getAuthHeaders: () => Record<string, string>;
}

export const StockTransfersTab: React.FC<StockTransfersTabProps> = ({
  warehouses,
  items,
  getAuthHeaders,
}) => {
  const { language, isRTL } = useI18n();
  const isAr = language === 'ar';
  const toast = useToast();

  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // New Transfer Modal
  const [showNewModal, setShowNewModal] = useState<boolean>(false);
  const [fromWarehouseId, setFromWarehouseId] = useState<string>('');
  const [toWarehouseId, setToWarehouseId] = useState<string>('');
  const [transferDate, setTransferDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState<string>('');
  const [lines, setLines] = useState<Array<{ itemId: string; unitId: string; quantity: number }>>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fetchTransfers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/inventory/transfers', {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('فشل جلب التحويلات المخزنية');
      const data = await res.json();
      setTransfers(data.transfers || []);
    } catch (err: any) {
      toast.error(err.message || 'Error fetching transfers');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTransfers();
    if (warehouses.length >= 2) {
      setFromWarehouseId(warehouses[0].id);
      setToWarehouseId(warehouses[1].id);
    }
  }, [warehouses]);

  const handleAddLine = () => {
    if (items.length === 0) return;
    const defaultItem = items[0];
    const defaultUnit = defaultItem.units[0]?.id || '';
    setLines([...lines, { itemId: defaultItem.id, unitId: defaultUnit, quantity: 1 }]);
  };

  const handleRemoveLine = (index: number) => {
    setLines(lines.filter((_, idx) => idx !== index));
  };

  const handleLineChange = (index: number, field: string, value: any) => {
    const updated = [...lines];
    const current = { ...updated[index], [field]: value };

    if (field === 'itemId') {
      const it = items.find((i) => i.id === value);
      current.unitId = it?.units[0]?.id || '';
    }

    updated[index] = current;
    setLines(updated);
  };

  const handleSubmitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fromWarehouseId === toWarehouseId) {
      toast.error(isAr ? 'لا يمكن التحويل لنفس المستودع' : 'Source and destination must differ');
      return;
    }
    if (lines.length === 0) {
      toast.error(isAr ? 'يجب إضافة صنف واحد على الأقل' : 'Add at least one item');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/v1/inventory/transfers', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fromWarehouseId,
          toWarehouseId,
          transferDate,
          notes,
          lines,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'فشل تنفيذ التحويل');
      }

      toast.success(isAr ? 'تم تنفيذ التحويل المخزني وتحديث الأرصدة بنجاح' : 'Transfer created successfully');
      setShowNewModal(false);
      setLines([]);
      fetchTransfers();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Control Card */}
      <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-primary-600" />
            <h3 className="font-semibold text-neutral-900">
              {isAr ? 'التحويلات بين المستودعات (Value Preservation Engine)' : 'Inter-Warehouse Transfers'}
            </h3>
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            {isAr
              ? 'تحويل فوري مع حفظ القيمة المخزنية الإجمالية للشركة وسحب وإيداع متطابق التكلفة'
              : 'Atomic dual-leg movement preserving total inventory valuation across company'}
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button variant="secondary" size="sm" onClick={fetchTransfers} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 me-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            {isAr ? 'تحديث' : 'Refresh'}
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              if (lines.length === 0) handleAddLine();
              setShowNewModal(true);
            }}
          >
            <Plus className="w-4 h-4 me-1.5" />
            {isAr ? 'إنشاء أمر تحويل جديد' : 'New Transfer'}
          </Button>
        </div>
      </div>

      {/* Transfers List Table */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="bg-neutral-50 text-neutral-600 border-b border-neutral-200">
              <tr>
                <th className="py-3 px-4 text-start font-medium">{isAr ? 'رقم التحويل' : 'Transfer #'}</th>
                <th className="py-3 px-4 text-start font-medium">{isAr ? 'التاريخ' : 'Date'}</th>
                <th className="py-3 px-4 text-start font-medium">{isAr ? 'من مستودع (المصدر)' : 'From Warehouse'}</th>
                <th className="py-3 px-4 text-start font-medium">{isAr ? 'إلى مستودع (الوجهة)' : 'To Warehouse'}</th>
                <th className="py-3 px-4 text-end font-medium">{isAr ? 'عدد الأصناف' : 'Items Count'}</th>
                <th className="py-3 px-4 text-end font-medium">{isAr ? 'إجمالي القيمة المنقولة (ر.س)' : 'Transferred Value'}</th>
                <th className="py-3 px-4 text-center font-medium">{isAr ? 'الحالة' : 'Status'}</th>
                <th className="py-3 px-4 text-center font-medium">{isAr ? 'التفاصيل' : 'Details'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-neutral-500">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-neutral-400" />
                    {isAr ? 'جاري تحميل سجل التحويلات...' : 'Loading transfers...'}
                  </td>
                </tr>
              ) : transfers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-neutral-500">
                    <ArrowLeftRight className="w-8 h-8 mx-auto mb-2 text-neutral-300" />
                    {isAr ? 'لا توجد عمليات تحويل مخزني مسجلة حتى الآن' : 'No transfers recorded yet'}
                  </td>
                </tr>
              ) : (
                transfers.map((t) => {
                  const isExpanded = expandedId === t.id;
                  return (
                    <React.Fragment key={t.id}>
                      <tr className="hover:bg-neutral-50/60 transition-colors">
                        <td className="py-3 px-4 font-mono font-semibold text-primary-700">
                          {t.transferNumber}
                        </td>
                        <td className="py-3 px-4 text-neutral-600 whitespace-nowrap">{t.transferDate}</td>
                        <td className="py-3 px-4 text-neutral-800 font-medium whitespace-nowrap">
                          {t.fromWarehouseNameAr}
                        </td>
                        <td className="py-3 px-4 text-neutral-800 font-medium whitespace-nowrap">
                          {t.toWarehouseNameAr}
                        </td>
                        <td className="py-3 px-4 text-end font-mono text-neutral-700">{t.lines.length}</td>
                        <td className="py-3 px-4 text-end font-mono font-bold text-neutral-900">
                          {t.totalValueSar.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Badge variant="success">{isAr ? 'مكتمل ومرحل' : 'Completed'}</Badge>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedId(isExpanded ? null : t.id)}
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                        </td>
                      </tr>

                      {/* Expanded Items Breakdown */}
                      {isExpanded && (
                        <tr className="bg-neutral-50/70">
                          <td colSpan={8} className="py-3 px-6">
                            <div className="bg-white p-3 rounded-lg border border-neutral-200">
                              <h4 className="text-xs font-semibold text-neutral-700 mb-2">
                                {isAr ? 'تفاصيل أصناف التحويل المخزني:' : 'Transfer Line Items:'}
                              </h4>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-neutral-500 border-b border-neutral-100">
                                    <th className="py-1.5 text-start">{isAr ? 'الصنف' : 'Item'}</th>
                                    <th className="py-1.5 text-start">{isAr ? 'الكود' : 'SKU'}</th>
                                    <th className="py-1.5 text-end">{isAr ? 'الكمية المحولة' : 'Quantity'}</th>
                                    <th className="py-1.5 text-end">{isAr ? 'الوحدة' : 'Unit'}</th>
                                    <th className="py-1.5 text-end">{isAr ? 'تكلفة الوحدة (ر.س)' : 'Unit Cost'}</th>
                                    <th className="py-1.5 text-end">{isAr ? 'إجمالي القيمة (ر.س)' : 'Total Value'}</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100">
                                  {t.lines.map((ln, idx) => (
                                    <tr key={idx}>
                                      <td className="py-1.5 font-medium text-neutral-800">{ln.itemNameAr}</td>
                                      <td className="py-1.5 font-mono text-neutral-500">{ln.sku}</td>
                                      <td className="py-1.5 text-end font-bold text-neutral-900">{ln.quantity}</td>
                                      <td className="py-1.5 text-end text-neutral-600">{ln.unitNameAr}</td>
                                      <td className="py-1.5 text-end font-mono text-neutral-700">{ln.unitCost.toFixed(2)}</td>
                                      <td className="py-1.5 text-end font-mono font-semibold text-emerald-700">
                                        {ln.totalValue.toFixed(2)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {t.notes && (
                                <p className="text-[11px] text-neutral-500 mt-2 border-t border-neutral-100 pt-1.5">
                                  {isAr ? 'ملاحظات: ' : 'Notes: '} {t.notes}
                                </p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Transfer Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-neutral-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-neutral-200">
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-primary-600" />
                <h3 className="font-semibold text-neutral-900">
                  {isAr ? 'إنشاء أمر تحويل مخزني جديد' : 'New Stock Transfer Order'}
                </h3>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowNewModal(false)}>
                ✕
              </Button>
            </div>

            <form onSubmit={handleSubmitTransfer} className="p-4 overflow-y-auto flex-1 space-y-4 text-xs">
              {/* Value Preservation Info Banner */}
              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg flex items-start gap-2 text-emerald-900">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed">
                  {isAr
                    ? 'ضمان حفظ القيمة: تسحب الكميات من المستودع المصدر بمتوسط التكلفة الحالي وتودع في المستودع الوجهة بنفس القيمة تماماً، مما يضمن ثبات قيمة أصول المخزون الإجمالية للشركة.'
                    : 'Dual-leg atomic transfer guarantees 100% value preservation across company warehouses.'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-neutral-700 mb-1">
                    {isAr ? 'من مستودع (المصدر) *' : 'From Warehouse *'}
                  </label>
                  <select
                    value={fromWarehouseId}
                    onChange={(e) => setFromWarehouseId(e.target.value)}
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
                    {isAr ? 'إلى مستودع (الوجهة) *' : 'To Warehouse *'}
                  </label>
                  <select
                    value={toWarehouseId}
                    onChange={(e) => setToWarehouseId(e.target.value)}
                    className="w-full text-xs rounded-lg border border-neutral-300 p-2 text-neutral-800"
                    required
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id} disabled={w.id === fromWarehouseId}>
                        {w.nameAr} ({w.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-neutral-700 mb-1">
                    {isAr ? 'تاريخ التحويل *' : 'Transfer Date *'}
                  </label>
                  <input
                    type="date"
                    value={transferDate}
                    onChange={(e) => setTransferDate(e.target.value)}
                    className="w-full text-xs rounded-lg border border-neutral-300 p-2 text-neutral-800"
                    required
                  />
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-neutral-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-neutral-800">{isAr ? 'الأصناف المحولة' : 'Items to Transfer'}</h4>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddLine}>
                    <Plus className="w-3.5 h-3.5 me-1" />
                    {isAr ? 'إضافة سطر' : 'Add Item'}
                  </Button>
                </div>

                <div className="space-y-2">
                  {lines.map((ln, idx) => {
                    const it = items.find((i) => i.id === ln.itemId);
                    return (
                      <div key={idx} className="flex items-center gap-2 bg-neutral-50 p-2 rounded-lg border border-neutral-200">
                        <div className="flex-1">
                          <select
                            value={ln.itemId}
                            onChange={(e) => handleLineChange(idx, 'itemId', e.target.value)}
                            className="w-full text-xs rounded border border-neutral-300 p-1.5 bg-white text-neutral-800"
                          >
                            {items.map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.sku} - {i.nameAr} (الرصيد الكلي: {i.currentStock})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="w-24">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            placeholder={isAr ? 'الكمية' : 'Qty'}
                            value={ln.quantity}
                            onChange={(e) => handleLineChange(idx, 'quantity', Number(e.target.value))}
                            className="w-full text-xs rounded border border-neutral-300 p-1.5 bg-white text-neutral-800 font-bold"
                            required
                          />
                        </div>

                        <div className="w-32">
                          <select
                            value={ln.unitId}
                            onChange={(e) => handleLineChange(idx, 'unitId', e.target.value)}
                            className="w-full text-xs rounded border border-neutral-300 p-1.5 bg-white text-neutral-800"
                          >
                            {it?.units.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.nameAr} ({u.conversionFactor}x)
                              </option>
                            ))}
                          </select>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveLine(idx)}
                          className="text-neutral-400 hover:text-rose-600 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block font-medium text-neutral-700 mb-1">{isAr ? 'بيان / ملاحظات' : 'Notes'}</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={isAr ? 'سبب التحويل أو رقم إذن الصرف...' : 'Notes or reference...'}
                  rows={2}
                  className="w-full text-xs rounded-lg border border-neutral-300 p-2 text-neutral-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowNewModal(false)}>
                  {isAr ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={isSubmitting}>
                  {isSubmitting ? (isAr ? 'جاري التنفيذ...' : 'Processing...') : (isAr ? 'ترحيل التحويل الفوري' : 'Post Transfer')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

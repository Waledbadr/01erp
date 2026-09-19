import React, { useState, useEffect } from 'react';
import { useI18n } from '../../../i18n/context.js';
import { Button } from '../../ui/Button.js';
import { Badge } from '../../ui/Badge.js';
import { useToast } from '../../ui/Toast.js';
import {
  FileText,
  Plus,
  RefreshCw,
  AlertOctagon,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  Trash2,
} from 'lucide-react';
import { StockAdjustment } from '../../../lib/inventory.js';

interface StockAdjustmentsTabProps {
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

export const StockAdjustmentsTab: React.FC<StockAdjustmentsTabProps> = ({
  warehouses,
  items,
  getAuthHeaders,
}) => {
  const { language, isRTL } = useI18n();
  const isAr = language === 'ar';
  const toast = useToast();

  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // New Adjustment Modal
  const [showNewModal, setShowNewModal] = useState<boolean>(false);
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [reasonCode, setReasonCode] = useState<
    'DAMAGE' | 'WASTE' | 'LOSS' | 'EXPIRY' | 'FOUND_GOODS' | 'CORRECTION'
  >('DAMAGE');
  const [description, setDescription] = useState<string>('');
  const [adjustmentDate, setAdjustmentDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<
    Array<{ itemId: string; unitId: string; quantityDelta: number; reason: string }>
  >([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fetchAdjustments = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/inventory/adjustments', {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('فشل جلب التسويات المخزنية');
      const data = await res.json();
      setAdjustments(data.adjustments || []);
    } catch (err: any) {
      toast.error(err.message || 'Error fetching adjustments');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAdjustments();
    if (warehouses.length > 0) {
      setWarehouseId(warehouses[0].id);
    }
  }, [warehouses]);

  const handleAddLine = () => {
    if (items.length === 0) return;
    const defaultItem = items[0];
    const defaultUnit = defaultItem.units[0]?.id || '';
    setLines([
      ...lines,
      { itemId: defaultItem.id, unitId: defaultUnit, quantityDelta: -1, reason: '' },
    ]);
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

  const handleSubmitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!warehouseId) {
      toast.error(isAr ? 'حدد المستودع' : 'Select warehouse');
      return;
    }
    if (!description.trim()) {
      toast.error(isAr ? 'يجب إدخال البيان والتفاصيل' : 'Enter description');
      return;
    }
    if (lines.length === 0) {
      toast.error(isAr ? 'أضف صنفاً واحداً على الأقل' : 'Add at least one item');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/v1/inventory/adjustments', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          warehouseId,
          adjustmentDate,
          reasonCode,
          description,
          lines,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'فشل تسجيل التسوية');
      }

      toast.success(isAr ? 'تم تسجيل وترحيل التسوية المخزنية والقيد المحاسبي تلقائياً' : 'Adjustment posted successfully');
      setShowNewModal(false);
      setDescription('');
      setLines([]);
      fetchAdjustments();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getReasonBadge = (code: string) => {
    switch (code) {
      case 'DAMAGE':
        return <Badge variant="danger">{isAr ? 'تلف بضاعة' : 'Damage'}</Badge>;
      case 'WASTE':
        return <Badge variant="warning">{isAr ? 'هالك تشغيلي' : 'Waste'}</Badge>;
      case 'LOSS':
        return <Badge variant="danger">{isAr ? 'فقدان أو عجز' : 'Loss'}</Badge>;
      case 'EXPIRY':
        return <Badge variant="danger">{isAr ? 'انتهاء صلاحية' : 'Expiry'}</Badge>;
      case 'FOUND_GOODS':
        return <Badge variant="success">{isAr ? 'بضاعة زائدة / معثور عليها' : 'Found Goods'}</Badge>;
      case 'CORRECTION':
        return <Badge variant="info">{isAr ? 'تصحيح رصيد' : 'Correction'}</Badge>;
      default:
        return <Badge variant="default">{code}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Control Card */}
      <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-5 h-5 text-amber-600" />
            <h3 className="font-semibold text-neutral-900">
              {isAr ? 'التسويات المخزنية المصنفة مع التوليد الآلي للقيود' : 'Stock Adjustments & Auto GL Entry'}
            </h3>
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            {isAr
              ? 'تسجيل حالات التلف والهالك والعجز وتوليد قيود محاسبية موزونة تلقائياً لحسابات الأرباح والخسائر'
              : 'Classified adjustments with automatic balanced double-entry GL journals'}
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button variant="secondary" size="sm" onClick={fetchAdjustments} disabled={isLoading}>
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
            {isAr ? 'تسجيل تسوية جديدة' : 'New Adjustment'}
          </Button>
        </div>
      </div>

      {/* Adjustments Table */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="bg-neutral-50 text-neutral-600 border-b border-neutral-200">
              <tr>
                <th className="py-3 px-4 text-start font-medium">{isAr ? 'رقم التسوية' : 'Adjustment #'}</th>
                <th className="py-3 px-4 text-start font-medium">{isAr ? 'التاريخ' : 'Date'}</th>
                <th className="py-3 px-4 text-start font-medium">{isAr ? 'المستودع' : 'Warehouse'}</th>
                <th className="py-3 px-4 text-start font-medium">{isAr ? 'التصنيف' : 'Reason Classification'}</th>
                <th className="py-3 px-4 text-start font-medium">{isAr ? 'البيان' : 'Description'}</th>
                <th className="py-3 px-4 text-end font-medium">{isAr ? 'عدد الأسطر' : 'Lines'}</th>
                <th className="py-3 px-4 text-center font-medium">{isAr ? 'القيد المحاسبي' : 'GL Journal'}</th>
                <th className="py-3 px-4 text-center font-medium">{isAr ? 'الحالة' : 'Status'}</th>
                <th className="py-3 px-4 text-center font-medium">{isAr ? 'التفاصيل' : 'Details'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-neutral-500">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-neutral-400" />
                    {isAr ? 'جاري تحميل سجل التسويات...' : 'Loading adjustments...'}
                  </td>
                </tr>
              ) : adjustments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-neutral-500">
                    <AlertOctagon className="w-8 h-8 mx-auto mb-2 text-neutral-300" />
                    {isAr ? 'لا توجد تسويات مخزنية مسجلة' : 'No adjustments recorded yet'}
                  </td>
                </tr>
              ) : (
                adjustments.map((a) => {
                  const isExpanded = expandedId === a.id;
                  return (
                    <React.Fragment key={a.id}>
                      <tr className="hover:bg-neutral-50/60 transition-colors">
                        <td className="py-3 px-4 font-mono font-semibold text-primary-700">
                          {a.adjustmentNumber}
                        </td>
                        <td className="py-3 px-4 text-neutral-600 whitespace-nowrap">{a.adjustmentDate}</td>
                        <td className="py-3 px-4 text-neutral-800 font-medium whitespace-nowrap">
                          {a.warehouseNameAr}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">{getReasonBadge(a.reasonCode)}</td>
                        <td className="py-3 px-4 text-neutral-700 max-w-xs truncate" title={a.description}>
                          {a.description}
                        </td>
                        <td className="py-3 px-4 text-end font-mono text-neutral-700">{a.lines.length}</td>
                        <td className="py-3 px-4 text-center">
                          {a.journalId ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              <BookOpen className="w-3 h-3" />
                              {isAr ? 'مرحل لليومية' : 'Posted to GL'}
                            </span>
                          ) : (
                            <span className="text-neutral-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Badge variant="success">{isAr ? 'معتمد' : 'Approved'}</Badge>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedId(isExpanded ? null : a.id)}
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                        </td>
                      </tr>

                      {/* Line items expansion */}
                      {isExpanded && (
                        <tr className="bg-neutral-50/70">
                          <td colSpan={9} className="py-3 px-6">
                            <div className="bg-white p-3 rounded-lg border border-neutral-200">
                              <h4 className="text-xs font-semibold text-neutral-700 mb-2">
                                {isAr ? 'تفاصيل أصناف التسوية وقيمة التأثير المالي:' : 'Adjustment Items & Value Impact:'}
                              </h4>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-neutral-500 border-b border-neutral-100">
                                    <th className="py-1.5 text-start">{isAr ? 'الصنف' : 'Item'}</th>
                                    <th className="py-1.5 text-start">{isAr ? 'الكود' : 'SKU'}</th>
                                    <th className="py-1.5 text-end">{isAr ? 'الكمية (+/-)' : 'Quantity Delta'}</th>
                                    <th className="py-1.5 text-end">{isAr ? 'التكلفة المعيارية' : 'Unit Cost'}</th>
                                    <th className="py-1.5 text-end">{isAr ? 'أثر القيمة (ر.س)' : 'Value Impact'}</th>
                                    <th className="py-1.5 text-start">{isAr ? 'ملاحظة السطر' : 'Line Reason'}</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100">
                                  {a.lines.map((ln, idx) => {
                                    const isPos = ln.quantityDelta > 0;
                                    return (
                                      <tr key={idx}>
                                        <td className="py-1.5 font-medium text-neutral-800">{ln.itemNameAr}</td>
                                        <td className="py-1.5 font-mono text-neutral-500">{ln.sku}</td>
                                        <td className="py-1.5 text-end font-bold whitespace-nowrap">
                                          <span
                                            className={`inline-flex items-center gap-0.5 ${
                                              isPos ? 'text-emerald-700' : 'text-rose-700'
                                            }`}
                                          >
                                            {isPos ? <ArrowDownRight className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                                            {isPos ? `+${ln.quantityDelta}` : ln.quantityDelta} {ln.unitNameAr}
                                          </span>
                                        </td>
                                        <td className="py-1.5 text-end font-mono text-neutral-700">
                                          {ln.unitCost.toFixed(2)}
                                        </td>
                                        <td
                                          className={`py-1.5 text-end font-mono font-semibold ${
                                            ln.totalValueDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'
                                          }`}
                                        >
                                          {ln.totalValueDelta.toFixed(2)}
                                        </td>
                                        <td className="py-1.5 text-neutral-600">{ln.reason || '—'}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
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

      {/* New Adjustment Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-neutral-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-neutral-200">
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-5 h-5 text-amber-600" />
                <h3 className="font-semibold text-neutral-900">
                  {isAr ? 'تسجيل تسوية مخزنية جديدة وتوليد قيد الإقفال' : 'New Stock Adjustment'}
                </h3>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowNewModal(false)}>
                ✕
              </Button>
            </div>

            <form onSubmit={handleSubmitAdjustment} className="p-4 overflow-y-auto flex-1 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                    {isAr ? 'سبب وتصنيف التسوية *' : 'Reason Classification *'}
                  </label>
                  <select
                    value={reasonCode}
                    onChange={(e: any) => setReasonCode(e.target.value)}
                    className="w-full text-xs rounded-lg border border-neutral-300 p-2 text-neutral-800"
                    required
                  >
                    <option value="DAMAGE">{isAr ? 'تلف بضاعة (Damage)' : 'Damage'}</option>
                    <option value="WASTE">{isAr ? 'هالك تشغيلي (Waste)' : 'Waste'}</option>
                    <option value="LOSS">{isAr ? 'عجز / فقدان (Loss)' : 'Loss'}</option>
                    <option value="EXPIRY">{isAr ? 'انتهاء الصلاحية (Expiry)' : 'Expiry'}</option>
                    <option value="FOUND_GOODS">{isAr ? 'بضاعة معثور عليها (Found Goods)' : 'Found Goods'}</option>
                    <option value="CORRECTION">{isAr ? 'تصحيح خطأ إدخال (Correction)' : 'Correction'}</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-neutral-700 mb-1">
                    {isAr ? 'تاريخ التسوية *' : 'Adjustment Date *'}
                  </label>
                  <input
                    type="date"
                    value={adjustmentDate}
                    onChange={(e) => setAdjustmentDate(e.target.value)}
                    className="w-full text-xs rounded-lg border border-neutral-300 p-2 text-neutral-800"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-neutral-700 mb-1">
                  {isAr ? 'البيان التفصيلي وتقرير المعاينة *' : 'Description & Inspection Report *'}
                </label>
                <input
                  type="text"
                  placeholder={isAr ? 'مثال: إثبات تلف 3 كراتين مياه أثناء التحميل والنقل الداخلي' : 'Reason...'}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full text-xs rounded-lg border border-neutral-300 p-2 text-neutral-800"
                  required
                />
              </div>

              {/* Items Lines */}
              <div className="border border-neutral-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-neutral-800">
                    {isAr ? 'الأصناف المراد تسويتها' : 'Adjustment Lines'}
                  </h4>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddLine}>
                    <Plus className="w-3.5 h-3.5 me-1" />
                    {isAr ? 'إضافة صنف' : 'Add Item'}
                  </Button>
                </div>

                <div className="space-y-2">
                  {lines.map((ln, idx) => {
                    const it = items.find((i) => i.id === ln.itemId);
                    return (
                      <div key={idx} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-neutral-50 p-2 rounded-lg border border-neutral-200">
                        <div className="flex-1">
                          <select
                            value={ln.itemId}
                            onChange={(e) => handleLineChange(idx, 'itemId', e.target.value)}
                            className="w-full text-xs rounded border border-neutral-300 p-1.5 bg-white text-neutral-800"
                          >
                            {items.map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.sku} - {i.nameAr}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="w-32">
                          <input
                            type="number"
                            step="1"
                            placeholder={isAr ? 'الكمية (+/-)' : 'Qty (+/-)'}
                            value={ln.quantityDelta}
                            onChange={(e) => handleLineChange(idx, 'quantityDelta', Number(e.target.value))}
                            className="w-full text-xs rounded border border-neutral-300 p-1.5 bg-white text-neutral-800 font-bold"
                            required
                          />
                        </div>

                        <div className="w-28">
                          <select
                            value={ln.unitId}
                            onChange={(e) => handleLineChange(idx, 'unitId', e.target.value)}
                            className="w-full text-xs rounded border border-neutral-300 p-1.5 bg-white text-neutral-800"
                          >
                            {it?.units.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.nameAr}
                              </option>
                            ))}
                          </select>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveLine(idx)}
                          className="text-neutral-400 hover:text-rose-600 p-1 self-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Automatic Journal Notice */}
              <div className="bg-neutral-50 border border-neutral-200 p-3 rounded-lg text-neutral-600 text-[11px] flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
                <p>
                  {isAr
                    ? 'سيقوم النظام بترحيل قيد يومية متزن آلياً (Dr خسائر المخزون / Cr المخزون) عند النقصان، أو (Dr المخزون / Cr أرباح تسوية) عند الزيادة، وفق القواعد المالية الصارمة G1-G8.'
                    : 'System will post balanced GL entry automatically to comply with Rule G1-G8.'}
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowNewModal(false)}>
                  {isAr ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={isSubmitting}>
                  {isSubmitting ? (isAr ? 'جاري الترحيل...' : 'Posting...') : (isAr ? 'اعتماد وترحيل التسوية' : 'Post Adjustment')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { useI18n } from '../../../i18n/context.js';
import { Button } from '../../ui/Button.js';
import { Badge } from '../../ui/Badge.js';
import { useToast } from '../../ui/Toast.js';
import {
  ClipboardCheck,
  Plus,
  RefreshCw,
  Barcode,
  Search,
  CheckCircle2,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  Eye,
  Scan,
} from 'lucide-react';
import { Stocktake } from '../../../lib/inventory.js';

interface StocktakeTabProps {
  warehouses: Array<{ id: string; code: string; nameAr: string }>;
  categories: Array<{ id: string; nameAr: string }>;
  getAuthHeaders: () => Record<string, string>;
}

export const StocktakeTab: React.FC<StocktakeTabProps> = ({
  warehouses,
  categories,
  getAuthHeaders,
}) => {
  const { language, isRTL } = useI18n();
  const isAr = language === 'ar';
  const toast = useToast();

  const [stocktakes, setStocktakes] = useState<Stocktake[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedStocktake, setSelectedStocktake] = useState<Stocktake | null>(null);

  // New Stocktake Modal
  const [showNewModal, setShowNewModal] = useState<boolean>(false);
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [scopeType, setScopeType] = useState<'FULL_WAREHOUSE' | 'BY_CATEGORY' | 'BY_ITEMS'>('FULL_WAREHOUSE');
  const [categoryId, setCategoryId] = useState<string>('');
  const [isCreating, setIsCreating] = useState<boolean>(false);

  // Counting state
  const [barcodeInput, setBarcodeInput] = useState<string>('');
  const [activeEntries, setActiveEntries] = useState<Stocktake['entries']>([]);
  const [isSavingCounts, setIsSavingCounts] = useState<boolean>(false);
  const [isApproving, setIsApproving] = useState<boolean>(false);

  const fetchStocktakes = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/inventory/stocktakes', {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('فشل جلب عمليات الجرد');
      const data = await res.json();
      setStocktakes(data.stocktakes || []);
    } catch (err: any) {
      toast.error(err.message || 'Error fetching stocktakes');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStocktakes();
    if (warehouses.length > 0) setWarehouseId(warehouses[0].id);
    if (categories.length > 0) setCategoryId(categories[0].id);
  }, [warehouses, categories]);

  const handleCreateStocktake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!warehouseId) {
      toast.error(isAr ? 'حدد المستودع' : 'Select warehouse');
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetch('/api/v1/inventory/stocktakes', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          warehouseId,
          scopeType,
          categoryId: scopeType === 'BY_CATEGORY' ? categoryId : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'فشل إنشاء جلسة الجرد');
      }

      const data = await res.json();
      toast.success(isAr ? 'تم تجميد الأرصدة الدفترية وبدء جلسة الجرد' : 'Stocktake created');
      setShowNewModal(false);
      fetchStocktakes();
      handleOpenCounting(data.stocktake);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenCounting = (st: Stocktake) => {
    setSelectedStocktake(st);
    setActiveEntries([...st.entries]);
  };

  const handleCountChange = (itemId: string, val: number) => {
    setActiveEntries((prev) =>
      prev.map((e) => {
        if (e.itemId === itemId) {
          const counted = Number(val) || 0;
          const varianceQty = counted - e.systemBookQty;
          const varianceValueSar = Math.round(varianceQty * e.unitWac * 100) / 100;
          return { ...e, countedQty: counted, varianceQty, varianceValueSar };
        }
        return e;
      })
    );
  };

  const handleBarcodeScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;

    let found = false;
    setActiveEntries((prev) =>
      prev.map((e) => {
        if (e.sku === code || e.itemId === code) {
          found = true;
          const counted = e.countedQty + 1;
          const varianceQty = counted - e.systemBookQty;
          const varianceValueSar = Math.round(varianceQty * e.unitWac * 100) / 100;
          return { ...e, countedQty: counted, varianceQty, varianceValueSar, scannedBarcode: code };
        }
        return e;
      })
    );

    if (found) {
      toast.success(isAr ? `تمت زيادة الكمية للصنف (${code})` : `Item count incremented: ${code}`);
      setBarcodeInput('');
    } else {
      toast.error(isAr ? `الباركود غير موجود في جلسة الجرد هذه: ${code}` : `Barcode not in this stocktake: ${code}`);
    }
  };

  const handleSaveCounts = async () => {
    if (!selectedStocktake) return;
    setIsSavingCounts(true);
    try {
      const countsPayload = activeEntries.map((e) => ({
        itemId: e.itemId,
        countedQty: e.countedQty,
        scannedBarcode: e.scannedBarcode,
      }));

      const res = await fetch(`/api/v1/inventory/stocktakes/${selectedStocktake.id}/counts`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ counts: countsPayload }),
      });

      if (!res.ok) throw new Error('فشل حفظ التعداد الفعلي');
      const data = await res.json();
      setSelectedStocktake(data.stocktake);
      toast.success(isAr ? 'تم حفظ التعداد الفعلي واحتساب الفروقات' : 'Counts saved');
      fetchStocktakes();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSavingCounts(false);
    }
  };

  const handleApproveStocktake = async () => {
    if (!selectedStocktake) return;
    if (!confirm(isAr ? 'هل أنت متأكد من اعتماد الجرد؟ سيتم توليد حركات تسوية وقيود مالية آلية.' : 'Approve and post variance journals?')) {
      return;
    }

    setIsApproving(true);
    try {
      const res = await fetch(`/api/v1/inventory/stocktakes/${selectedStocktake.id}/approve`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      if (!res.ok) throw new Error('فشل اعتماد الجرد');
      const data = await res.json();
      setSelectedStocktake(data.stocktake);
      toast.success(isAr ? 'تم اعتماد الجرد وترحيل قيود فروقات المخزون' : 'Stocktake approved & GL posted');
      fetchStocktakes();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsApproving(false);
    }
  };

  // Calculations for active view
  const totalPositive = activeEntries.reduce((sum, e) => (e.varianceValueSar > 0 ? sum + e.varianceValueSar : sum), 0);
  const totalNegative = activeEntries.reduce((sum, e) => (e.varianceValueSar < 0 ? sum + Math.abs(e.varianceValueSar) : sum), 0);
  const netVariance = Math.round((totalPositive - totalNegative) * 100) / 100;

  return (
    <div className="space-y-6">
      {/* Control Card */}
      <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-primary-600" />
            <h3 className="font-semibold text-neutral-900">
              {isAr ? 'الجرد الدوري والفعلي (Cycle Counting Engine)' : 'Physical Stocktake & Cycle Counting'}
            </h3>
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            {isAr
              ? 'تجميد الأرصدة الدفترية، التعداد عبر الباركود، رصد الفروقات، والتسوية التلقائية الموزونة للقيود'
              : 'Snapshot book stock, scan count, track variances, auto-generate balancing GL journals'}
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button variant="secondary" size="sm" onClick={fetchStocktakes} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 me-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            {isAr ? 'تحديث' : 'Refresh'}
          </Button>

          <Button variant="primary" size="sm" onClick={() => setShowNewModal(true)}>
            <Plus className="w-4 h-4 me-1.5" />
            {isAr ? 'بدء جلسة جرد جديدة' : 'New Stocktake'}
          </Button>
        </div>
      </div>

      {/* Active Counting Screen if selected */}
      {selectedStocktake && (
        <div className="bg-white rounded-xl border-2 border-primary-200 shadow-md p-5 space-y-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-3 border-b border-neutral-200">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-primary-800">
                  {selectedStocktake.stocktakeNumber}
                </span>
                <Badge variant={selectedStocktake.status === 'APPROVED' ? 'success' : 'warning'}>
                  {selectedStocktake.status === 'APPROVED'
                    ? isAr
                      ? 'معتمد ومرحل'
                      : 'Approved'
                    : isAr
                    ? 'قيد التعداد الفعلي'
                    : 'In Progress'}
                </Badge>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                {isAr ? 'المستودع:' : 'Warehouse:'} {selectedStocktake.warehouseNameAr} | {isAr ? 'تاريخ التجميد:' : 'Snapshot Date:'}{' '}
                {selectedStocktake.snapshotDate}
              </p>
            </div>

            {/* Quick Summary Chips */}
            <div className="flex items-center gap-3 text-xs">
              <div className="bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                <span className="text-emerald-700 font-medium">{isAr ? 'زيادة جرد:' : 'Gain:'} </span>
                <span className="font-mono font-bold text-emerald-800">+{totalPositive.toFixed(2)} ر.س</span>
              </div>
              <div className="bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg">
                <span className="text-rose-700 font-medium">{isAr ? 'عجز جرد:' : 'Loss:'} </span>
                <span className="font-mono font-bold text-rose-800">-{totalNegative.toFixed(2)} ر.س</span>
              </div>
              <div className="bg-neutral-100 border border-neutral-300 px-2.5 py-1 rounded-lg">
                <span className="text-neutral-700 font-medium">{isAr ? 'صافي الأثر:' : 'Net:'} </span>
                <span
                  className={`font-mono font-bold ${
                    netVariance >= 0 ? 'text-emerald-800' : 'text-rose-800'
                  }`}
                >
                  {netVariance >= 0 ? `+${netVariance.toFixed(2)}` : netVariance.toFixed(2)} ر.س
                </span>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedStocktake(null)}
                className="text-neutral-400"
              >
                ✕
              </Button>
            </div>
          </div>

          {/* Barcode Quick Scanner Box (when not approved) */}
          {selectedStocktake.status !== 'APPROVED' && (
            <form onSubmit={handleBarcodeScanSubmit} className="flex items-center gap-2 bg-primary-50/60 p-2.5 rounded-lg border border-primary-200">
              <Barcode className="w-5 h-5 text-primary-600 shrink-0" />
              <input
                type="text"
                placeholder={isAr ? 'امسح بالباركود أو اكتب كود الصنف واضغط Enter...' : 'Scan barcode or type SKU...'}
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                className="flex-1 text-xs bg-white rounded border border-neutral-300 px-3 py-1.5 focus:ring-2 focus:ring-primary-500 font-mono"
              />
              <Button type="submit" variant="primary" size="sm">
                <Scan className="w-3.5 h-3.5 me-1" />
                {isAr ? 'تسجيل بالمسح' : 'Register Scan'}
              </Button>
            </form>
          )}

          {/* Entries Table */}
          <div className="overflow-x-auto max-h-80 overflow-y-auto border border-neutral-200 rounded-lg">
            <table className="w-full text-xs text-start">
              <thead className="bg-neutral-100 text-neutral-600 sticky top-0">
                <tr>
                  <th className="py-2.5 px-3 text-start">{isAr ? 'الصنف' : 'Item'}</th>
                  <th className="py-2.5 px-3 text-start">{isAr ? 'الكود' : 'SKU'}</th>
                  <th className="py-2.5 px-3 text-end">{isAr ? 'الرصيد الدفتري' : 'System Book Qty'}</th>
                  <th className="py-2.5 px-3 text-end">{isAr ? 'العدد الفعلي' : 'Physical Count'}</th>
                  <th className="py-2.5 px-3 text-end">{isAr ? 'فرق الكمية' : 'Variance Qty'}</th>
                  <th className="py-2.5 px-3 text-end">{isAr ? 'التكلفة WAC' : 'Unit WAC'}</th>
                  <th className="py-2.5 px-3 text-end">{isAr ? 'قيمة الفرق (ر.س)' : 'Variance Value'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {activeEntries.map((e) => {
                  const hasVar = e.varianceQty !== 0;
                  return (
                    <tr
                      key={e.itemId}
                      className={hasVar ? (e.varianceQty > 0 ? 'bg-emerald-50/40' : 'bg-rose-50/40') : 'hover:bg-neutral-50'}
                    >
                      <td className="py-2 px-3 font-medium text-neutral-800">{e.itemNameAr}</td>
                      <td className="py-2 px-3 font-mono text-neutral-500">{e.sku}</td>
                      <td className="py-2 px-3 text-end font-mono text-neutral-700 font-medium">
                        {e.systemBookQty} {e.baseUnit}
                      </td>
                      <td className="py-2 px-3 text-end">
                        {selectedStocktake.status === 'APPROVED' ? (
                          <span className="font-bold font-mono text-neutral-900">{e.countedQty}</span>
                        ) : (
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={e.countedQty}
                            onChange={(ev) => handleCountChange(e.itemId, Number(ev.target.value))}
                            className="w-20 text-end font-bold font-mono text-xs rounded border border-neutral-300 p-1 bg-white"
                          />
                        )}
                      </td>
                      <td className="py-2 px-3 text-end font-mono font-bold whitespace-nowrap">
                        {e.varianceQty === 0 ? (
                          <span className="text-neutral-400">0</span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-0.5 ${
                              e.varianceQty > 0 ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {e.varianceQty > 0 ? <ArrowDownRight className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                            {e.varianceQty > 0 ? `+${e.varianceQty}` : e.varianceQty}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-end font-mono text-neutral-600">{e.unitWac.toFixed(2)}</td>
                      <td
                        className={`py-2 px-3 text-end font-mono font-bold ${
                          e.varianceValueSar >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {e.varianceValueSar >= 0 ? `+${e.varianceValueSar.toFixed(2)}` : e.varianceValueSar.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Action bar */}
          {selectedStocktake.status !== 'APPROVED' && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-neutral-500">
                {isAr
                  ? '* عند اعتماد الجرد، سيتم آلياً توليد حركات مخزنية وتسجيل قيود الفروقات في دفتر اليومية.'
                  : '* Approving will post variance movements & double-entry GL journal.'}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={handleSaveCounts} disabled={isSavingCounts}>
                  {isSavingCounts ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ المسودة' : 'Save Counts')}
                </Button>
                <Button variant="primary" size="sm" onClick={handleApproveStocktake} disabled={isApproving}>
                  <CheckCircle2 className="w-4 h-4 me-1.5" />
                  {isApproving ? (isAr ? 'جاري الاعتماد...' : 'Approving...') : (isAr ? 'اعتماد الجرد وترحيل القيود' : 'Approve & Post')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stocktakes History Table */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="bg-neutral-50 text-neutral-600 border-b border-neutral-200">
              <tr>
                <th className="py-3 px-4 text-start font-medium">{isAr ? 'رقم الجلسة' : 'Session #'}</th>
                <th className="py-3 px-4 text-start font-medium">{isAr ? 'المستودع' : 'Warehouse'}</th>
                <th className="py-3 px-4 text-start font-medium">{isAr ? 'تاريخ التجميد' : 'Snapshot Date'}</th>
                <th className="py-3 px-4 text-start font-medium">{isAr ? 'نطاق الجرد' : 'Scope'}</th>
                <th className="py-3 px-4 text-end font-medium">{isAr ? 'عدد الأصناف' : 'Items Count'}</th>
                <th className="py-3 px-4 text-end font-medium">{isAr ? 'صافي الفروقات (ر.س)' : 'Net Variance'}</th>
                <th className="py-3 px-4 text-center font-medium">{isAr ? 'القيد المحاسبي' : 'GL Journal'}</th>
                <th className="py-3 px-4 text-center font-medium">{isAr ? 'الحالة' : 'Status'}</th>
                <th className="py-3 px-4 text-center font-medium">{isAr ? 'الإجراء' : 'Action'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-neutral-500">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-neutral-400" />
                    {isAr ? 'جاري تحميل جلسات الجرد...' : 'Loading stocktakes...'}
                  </td>
                </tr>
              ) : stocktakes.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-neutral-500">
                    <ClipboardCheck className="w-8 h-8 mx-auto mb-2 text-neutral-300" />
                    {isAr ? 'لا توجد جلسات جرد مسجلة حالياً' : 'No stocktakes created yet'}
                  </td>
                </tr>
              ) : (
                stocktakes.map((st) => (
                  <tr key={st.id} className="hover:bg-neutral-50/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-primary-700">
                      {st.stocktakeNumber}
                    </td>
                    <td className="py-3 px-4 font-medium text-neutral-800">{st.warehouseNameAr}</td>
                    <td className="py-3 px-4 text-neutral-600 whitespace-nowrap">{st.snapshotDate}</td>
                    <td className="py-3 px-4 text-neutral-600">
                      {st.scopeType === 'FULL_WAREHOUSE'
                        ? isAr
                          ? 'كامل المستودع'
                          : 'Full Warehouse'
                        : st.scopeType === 'BY_CATEGORY'
                        ? `${isAr ? 'تصنيف:' : 'Category:'} ${st.categoryNameAr || ''}`
                        : isAr
                        ? 'أصناف محددة'
                        : 'Specific Items'}
                    </td>
                    <td className="py-3 px-4 text-end font-mono text-neutral-700">{st.entries.length}</td>
                    <td
                      className={`py-3 px-4 text-end font-mono font-bold ${
                        st.netVarianceSar >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {st.netVarianceSar >= 0 ? `+${st.netVarianceSar.toFixed(2)}` : st.netVarianceSar.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {st.journalId ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <BookOpen className="w-3 h-3" />
                          {isAr ? 'مرحل' : 'Posted'}
                        </span>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Badge variant={st.status === 'APPROVED' ? 'success' : 'warning'}>
                        {st.status === 'APPROVED'
                          ? isAr
                            ? 'معتمد'
                            : 'Approved'
                          : isAr
                          ? 'قيد التعداد'
                          : 'In Progress'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Button variant="outline" size="sm" onClick={() => handleOpenCounting(st)}>
                        <Eye className="w-3.5 h-3.5 me-1" />
                        {st.status === 'APPROVED' ? (isAr ? 'عرض' : 'View') : (isAr ? 'تعداد' : 'Count')}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Stocktake Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-neutral-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden flex flex-col shadow-2xl border border-neutral-200">
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-primary-600" />
                <h3 className="font-semibold text-neutral-900">
                  {isAr ? 'بدء جلسة جرد وتجميد الأرصدة' : 'Initiate Stocktake Session'}
                </h3>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowNewModal(false)}>
                ✕
              </Button>
            </div>

            <form onSubmit={handleCreateStocktake} className="p-4 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-neutral-700 mb-1">
                  {isAr ? 'المستودع المراد جرده *' : 'Warehouse *'}
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
                  {isAr ? 'نطاق الجرد *' : 'Stocktake Scope *'}
                </label>
                <select
                  value={scopeType}
                  onChange={(e: any) => setScopeType(e.target.value)}
                  className="w-full text-xs rounded-lg border border-neutral-300 p-2 text-neutral-800"
                  required
                >
                  <option value="FULL_WAREHOUSE">{isAr ? 'كامل أصناف المستودع' : 'Full Warehouse'}</option>
                  <option value="BY_CATEGORY">{isAr ? 'حسب التصنيف (Category)' : 'By Category'}</option>
                </select>
              </div>

              {scopeType === 'BY_CATEGORY' && (
                <div>
                  <label className="block font-medium text-neutral-700 mb-1">
                    {isAr ? 'اختر التصنيف *' : 'Select Category *'}
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full text-xs rounded-lg border border-neutral-300 p-2 text-neutral-800"
                    required
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nameAr}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <p className="text-[11px] text-neutral-500 bg-neutral-50 p-2.5 rounded-lg border border-neutral-200 leading-relaxed">
                {isAr
                  ? 'سيتم التقاط صورة لحظية (Snapshot) لأرصدة النظام الدفترية ومتوسط التكلفة WAC لكل صنف لتكون المرجع الرسمي لحساب الفروقات.'
                  : 'System will freeze snapshot book balances and WAC as the official baseline.'}
              </p>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowNewModal(false)}>
                  {isAr ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={isCreating}>
                  {isCreating ? (isAr ? 'جاري التجميد...' : 'Creating...') : (isAr ? 'بدء الجرد الآن' : 'Start Stocktake')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

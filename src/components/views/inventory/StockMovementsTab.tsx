import React, { useState, useEffect } from 'react';
import { useI18n } from '../../../i18n/context.js';
import { Button } from '../../ui/Button.js';
import { Input } from '../../ui/Input.js';
import { Badge } from '../../ui/Badge.js';
import { useToast } from '../../ui/Toast.js';
import {
  History,
  Calendar,
  Filter,
  RefreshCw,
  Search,
  ArrowDownRight,
  ArrowUpRight,
  ArrowLeftRight,
  FileCheck2,
  Clock,
  Layers,
  Database,
  Building2,
  HelpCircle,
} from 'lucide-react';
import { StockMovement, MovementType } from '../../../lib/inventory.js';

interface StockMovementsTabProps {
  warehouses: Array<{ id: string; code: string; nameAr: string }>;
  items: Array<{ id: string; sku: string; nameAr: string; baseUnit: string }>;
  getAuthHeaders: () => Record<string, string>;
}

export const StockMovementsTab: React.FC<StockMovementsTabProps> = ({
  warehouses,
  items,
  getAuthHeaders,
}) => {
  const { language, isRTL } = useI18n();
  const isAr = language === 'ar';
  const toast = useToast();

  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filters
  const [selectedItemId, setSelectedItemId] = useState<string>('ALL');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [searchDoc, setSearchDoc] = useState<string>('');

  // As-of Date Point-in-time Audit Tool
  const [asOfDate, setAsOfDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [isCalculatingAsOf, setIsCalculatingAsOf] = useState<boolean>(false);
  const [asOfSnapshot, setAsOfSnapshot] = useState<any[] | null>(null);
  const [showAsOfModal, setShowAsOfModal] = useState<boolean>(false);

  const fetchMovements = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedItemId !== 'ALL') params.append('itemId', selectedItemId);
      if (selectedWarehouseId !== 'ALL') params.append('warehouseId', selectedWarehouseId);
      if (selectedType !== 'ALL') params.append('movementType', selectedType);
      if (searchDoc) params.append('sourceId', searchDoc);

      const res = await fetch(`/api/v1/inventory/movements?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('فشل جلب سجل حركات المخزون');
      const data = await res.json();
      setMovements(data.movements || []);
    } catch (err: any) {
      toast.error(err.message || 'Error fetching movements');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMovements();
  }, [selectedItemId, selectedWarehouseId, selectedType]);

  const handleRunAsOfAudit = async () => {
    setIsCalculatingAsOf(true);
    try {
      const params = new URLSearchParams();
      params.append('asOfDate', asOfDate);
      if (selectedItemId !== 'ALL') params.append('itemId', selectedItemId);
      if (selectedWarehouseId !== 'ALL') params.append('warehouseId', selectedWarehouseId);

      const res = await fetch(`/api/v1/inventory/movements/as-of?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('فشل احتساب الجرد بتاريخ محدد');
      const data = await res.json();
      setAsOfSnapshot(data.snapshot || []);
      setShowAsOfModal(true);
    } catch (err: any) {
      toast.error(err.message || 'Error calculating snapshot');
    } finally {
      setIsCalculatingAsOf(false);
    }
  };

  const getMovementTypeBadge = (type: MovementType) => {
    switch (type) {
      case 'OPENING_STOCK':
        return <Badge variant="brand">{isAr ? 'رصيد أول المدة' : 'Opening Stock'}</Badge>;
      case 'PURCHASE_RECEIPT':
        return <Badge variant="success">{isAr ? 'وارد مشتريات' : 'Purchase Receipt'}</Badge>;
      case 'SALES_ISSUE':
        return <Badge variant="warning">{isAr ? 'صادر مبيعات' : 'Sales Issue'}</Badge>;
      case 'SALES_RETURN':
        return <Badge variant="brand">{isAr ? 'مرتجع مبيعات' : 'Sales Return'}</Badge>;
      case 'TRANSFER_IN':
        return <Badge variant="info">{isAr ? 'وارد تحويل' : 'Transfer In'}</Badge>;
      case 'TRANSFER_OUT':
        return <Badge variant="info">{isAr ? 'صادر تحويل' : 'Transfer Out'}</Badge>;
      case 'ADJUSTMENT_IN':
        return <Badge variant="success">{isAr ? 'تسوية إضافة' : 'Adjustment In'}</Badge>;
      case 'ADJUSTMENT_OUT':
        return <Badge variant="danger">{isAr ? 'تسوية عجز/تلف' : 'Adjustment Out'}</Badge>;
      case 'STOCKTAKE_VARIANCE':
        return <Badge variant="default">{isAr ? 'فروقات جرد' : 'Stocktake Variance'}</Badge>;
      default:
        return <Badge variant="default">{type}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Controls & Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-neutral-600" />
            <div>
              <h3 className="font-semibold text-neutral-900">
                {isAr ? 'سجل حركات المخزون غير القابل للتعديل' : 'Append-Only Stock Ledger'}
              </h3>
              <p className="text-xs text-neutral-500">
                {isAr
                  ? 'تسجيل كل حركة مخزنية مع المصدر الإجباري واحتساب WAC بالهللات بدقة مطلقة'
                  : 'Immutable movement ledger strictly bound to document foreign keys'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            {/* As-Of Date Quick Selector */}
            <div className="flex items-center gap-2 bg-neutral-50 px-3 py-1.5 rounded-lg border border-neutral-200 text-xs">
              <Calendar className="w-4 h-4 text-neutral-500" />
              <span className="text-neutral-600">{isAr ? 'تاريخ التدقيق:' : 'Audit Date:'}</span>
              <input
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="bg-transparent border-0 text-xs font-semibold focus:ring-0 p-0 text-neutral-800"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleRunAsOfAudit}
                disabled={isCalculatingAsOf}
              >
                {isCalculatingAsOf ? (isAr ? 'جاري الاحتساب...' : 'Calculating...') : (isAr ? 'إعادة بناء الرصيد' : 'Reconstruct')}
              </Button>
            </div>

            <Button variant="secondary" size="sm" onClick={fetchMovements} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 me-1.5 ${isLoading ? 'animate-spin' : ''}`} />
              {isAr ? 'تحديث' : 'Refresh'}
            </Button>
          </div>
        </div>

        {/* Filters Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-neutral-100">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">{isAr ? 'الصنف' : 'Item'}</label>
            <select
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              className="w-full text-xs rounded-lg border border-neutral-300 px-2.5 py-1.5 bg-white text-neutral-800 focus:ring-2 focus:ring-primary-500"
            >
              <option value="ALL">{isAr ? 'جميع الأصناف' : 'All Items'}</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.sku} - {i.nameAr}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">{isAr ? 'المستودع' : 'Warehouse'}</label>
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              className="w-full text-xs rounded-lg border border-neutral-300 px-2.5 py-1.5 bg-white text-neutral-800 focus:ring-2 focus:ring-primary-500"
            >
              <option value="ALL">{isAr ? 'جميع المستودعات' : 'All Warehouses'}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} - {w.nameAr}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">{isAr ? 'نوع الحركة' : 'Movement Type'}</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full text-xs rounded-lg border border-neutral-300 px-2.5 py-1.5 bg-white text-neutral-800 focus:ring-2 focus:ring-primary-500"
            >
              <option value="ALL">{isAr ? 'كافة أنواع الحركات' : 'All Types'}</option>
              <option value="OPENING_STOCK">{isAr ? 'رصيد أول المدة' : 'Opening Stock'}</option>
              <option value="PURCHASE_RECEIPT">{isAr ? 'وارد مشتريات' : 'Purchase Receipt'}</option>
              <option value="SALES_ISSUE">{isAr ? 'صادر مبيعات' : 'Sales Issue'}</option>
              <option value="TRANSFER_IN">{isAr ? 'وارد تحويل' : 'Transfer In'}</option>
              <option value="TRANSFER_OUT">{isAr ? 'صادر تحويل' : 'Transfer Out'}</option>
              <option value="ADJUSTMENT_IN">{isAr ? 'تسوية إضافة' : 'Adjustment In'}</option>
              <option value="ADJUSTMENT_OUT">{isAr ? 'تسوية عجز/تلف' : 'Adjustment Out'}</option>
              <option value="STOCKTAKE_VARIANCE">{isAr ? 'فروقات جرد' : 'Stocktake Variance'}</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">{isAr ? 'رقم المستند / المرجع' : 'Doc Reference'}</label>
            <div className="relative">
              <input
                type="text"
                placeholder={isAr ? 'بحث برقم المستند...' : 'Search by doc...'}
                value={searchDoc}
                onChange={(e) => setSearchDoc(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchMovements()}
                className="w-full text-xs rounded-lg border border-neutral-300 pe-8 ps-2.5 py-1.5 text-neutral-800 focus:ring-2 focus:ring-primary-500"
              />
              <button
                type="button"
                onClick={fetchMovements}
                className="absolute end-2 top-1.5 text-neutral-400 hover:text-neutral-600"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Movements Ledger Table */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="bg-neutral-50 text-neutral-600 border-b border-neutral-200">
              <tr>
                <th className="py-3 px-4 text-start font-medium">{isAr ? 'التاريخ والوقت' : 'Date & Time'}</th>
                <th className="py-3 px-4 text-start font-medium">{isAr ? 'الصنف / الكود' : 'Item / SKU'}</th>
                <th className="py-3 px-4 text-start font-medium">{isAr ? 'المستودع' : 'Warehouse'}</th>
                <th className="py-3 px-4 text-start font-medium">{isAr ? 'نوع الحركة' : 'Type'}</th>
                <th className="py-3 px-4 text-end font-medium">{isAr ? 'الكمية (+/-)' : 'Quantity Delta'}</th>
                <th className="py-3 px-4 text-end font-medium">{isAr ? 'تكلفة الوحدة (ر.س)' : 'Unit Cost'}</th>
                <th className="py-3 px-4 text-end font-medium">{isAr ? 'المتوسط المرجح الجديد' : 'Resulting WAC'}</th>
                <th className="py-3 px-4 text-end font-medium">{isAr ? 'الرصيد الناتج' : 'Resulting Stock'}</th>
                <th className="py-3 px-4 text-start font-medium">{isAr ? 'المستند المصدري' : 'Source Document'}</th>
                <th className="py-3 px-4 text-start font-medium">{isAr ? 'البيان / السبب' : 'Reason / Notes'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-neutral-500">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-neutral-400" />
                    {isAr ? 'جاري تحميل سجل الحركات...' : 'Loading movements ledger...'}
                  </td>
                </tr>
              ) : movements.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-neutral-500">
                    <Database className="w-8 h-8 mx-auto mb-2 text-neutral-300" />
                    {isAr ? 'لا توجد حركات مخزنية مسجلة تطابق محددات البحث' : 'No movements found matching criteria'}
                  </td>
                </tr>
              ) : (
                movements.map((m) => {
                  const isPositive = m.quantityDelta > 0;
                  return (
                    <tr key={m.id} className="hover:bg-neutral-50/60 transition-colors">
                      <td className="py-3 px-4 font-mono text-neutral-600 whitespace-nowrap">
                        {m.movementDate} <span className="text-neutral-400 text-[10px]">{m.createdAt.slice(11, 16)}</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-neutral-900">{m.itemNameAr}</div>
                        <div className="text-[11px] font-mono text-neutral-500">{m.sku}</div>
                      </td>
                      <td className="py-3 px-4 text-neutral-700 whitespace-nowrap">
                        {m.warehouseNameAr}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {getMovementTypeBadge(m.movementType)}
                      </td>
                      <td className="py-3 px-4 text-end font-semibold whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 ${
                            isPositive ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {isPositive ? <ArrowDownRight className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                          {isPositive ? `+${m.quantityDelta}` : m.quantityDelta}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-end font-mono text-neutral-700 whitespace-nowrap">
                        {m.unitCostApplied.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-end font-mono font-medium text-primary-700 whitespace-nowrap">
                        {m.resultingWac.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-end font-mono font-bold text-neutral-900 whitespace-nowrap">
                        {m.resultingStock}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-neutral-100 text-neutral-700 font-mono text-[11px]">
                          <FileCheck2 className="w-3 h-3 text-neutral-500" />
                          {m.sourceDocumentNumber || m.sourceId}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-neutral-600 max-w-xs truncate" title={m.reason || m.notes || ''}>
                        {m.reason || m.notes || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* As-Of Date Reconstruction Snapshot Modal */}
      {showAsOfModal && asOfSnapshot && (
        <div className="fixed inset-0 z-50 bg-neutral-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-neutral-200">
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary-600" />
                <div>
                  <h3 className="font-semibold text-neutral-900">
                    {isAr ? `إعادة بناء أرصدة المخزون كما في: ${asOfDate}` : `Stock Snapshot As-Of ${asOfDate}`}
                  </h3>
                  <p className="text-xs text-neutral-500">
                    {isAr ? 'تقييم تاريخي دقيق بإعادة تدوير الحركات حتى التاريخ المطلوب' : 'Historical inventory replay'}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowAsOfModal(false)}>
                ✕
              </Button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              <table className="w-full text-xs">
                <thead className="bg-neutral-100 text-neutral-600">
                  <tr>
                    <th className="py-2.5 px-3 text-start">{isAr ? 'الصنف' : 'Item'}</th>
                    <th className="py-2.5 px-3 text-start">{isAr ? 'المستودع' : 'Warehouse'}</th>
                    <th className="py-2.5 px-3 text-end">{isAr ? 'الكمية التاريخية' : 'Historical Qty'}</th>
                    <th className="py-2.5 px-3 text-end">{isAr ? 'التكلفة التاريخية WAC' : 'Historical WAC'}</th>
                    <th className="py-2.5 px-3 text-end">{isAr ? 'إجمالي القيمة (ر.س)' : 'Total Valuation'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {asOfSnapshot.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-neutral-500">
                        {isAr ? 'لا توجد حركات مخزنية سابقة لهذا التاريخ' : 'No movements prior to this date'}
                      </td>
                    </tr>
                  ) : (
                    asOfSnapshot.map((rec, idx) => (
                      <tr key={idx} className="hover:bg-neutral-50">
                        <td className="py-2.5 px-3 font-medium text-neutral-900">{rec.itemNameAr || rec.itemId}</td>
                        <td className="py-2.5 px-3 text-neutral-600">{rec.warehouseNameAr || rec.warehouseId}</td>
                        <td className="py-2.5 px-3 text-end font-bold text-neutral-800">{rec.quantityOnHand}</td>
                        <td className="py-2.5 px-3 text-end font-mono text-neutral-700">{rec.wacSar.toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-end font-mono font-semibold text-emerald-700">
                          {rec.totalValuationSar.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-neutral-50 border-t border-neutral-200 flex justify-end">
              <Button variant="secondary" size="sm" onClick={() => setShowAsOfModal(false)}>
                {isAr ? 'إغلاق' : 'Close'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { useI18n } from '../../../i18n/context.js';
import {
  TrendingDown,
  TrendingUp,
  Search,
  Calendar,
  Filter,
  RefreshCw,
  Tag,
  Building,
} from 'lucide-react';
import { SupplierPriceRecord } from '../../../lib/purchasing.js';

interface SupplierPriceHistoryTabProps {
  suppliers: Array<{ id: string; nameAr: string; nameEn: string; code: string }>;
  items: Array<{ id: string; sku: string; nameAr: string; nameEn: string }>;
}

export const SupplierPriceHistoryTab: React.FC<SupplierPriceHistoryTabProps> = ({
  suppliers,
  items,
}) => {
  const { isAr, formatCurrency, formatDate } = useI18n();

  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('ALL');
  const [selectedItemId, setSelectedItemId] = useState<string>('ALL');
  const [historyRecords, setHistoryRecords] = useState<SupplierPriceRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPriceHistory = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedSupplierId !== 'ALL') params.append('supplierId', selectedSupplierId);
      if (selectedItemId !== 'ALL') params.append('itemId', selectedItemId);

      const res = await fetch(`/api/v1/purchasing/price-history?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setHistoryRecords(data);
      }
    } catch (err) {
      console.error('Failed to fetch price history', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPriceHistory();
  }, [selectedSupplierId, selectedItemId]);

  return (
    <div className="bg-white rounded-b-2xl border border-t-0 border-slate-200 shadow-xs overflow-hidden p-6 space-y-6">
      {/* Filters Bar */}
      <div className="p-4 border border-slate-200 rounded-xl flex flex-wrap gap-4 items-center justify-between bg-slate-50/50">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="w-56">
            <label className="block text-[10px] font-semibold text-slate-500 mb-1">
              {isAr ? 'المورد' : 'Supplier'}
            </label>
            <select
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
            >
              <option value="ALL">{isAr ? 'كافة الموردين' : 'All Suppliers'}</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} - {isAr ? s.nameAr : s.nameEn}
                </option>
              ))}
            </select>
          </div>

          <div className="w-64">
            <label className="block text-[10px] font-semibold text-slate-500 mb-1">
              {isAr ? 'الصنف' : 'Item'}
            </label>
            <select
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
            >
              <option value="ALL">{isAr ? 'كافة الأصناف' : 'All Items'}</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.sku} - {isAr ? i.nameAr : i.nameEn}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={fetchPriceHistory}
          disabled={loading}
          className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-start text-xs text-slate-600">
          <thead className="bg-slate-50 text-slate-700 font-bold uppercase border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-start">{isAr ? 'المورد' : 'Supplier'}</th>
              <th className="px-4 py-3 text-start">{isAr ? 'الصنف' : 'Item'}</th>
              <th className="px-4 py-3 text-start">{isAr ? 'الوحدة' : 'UOM'}</th>
              <th className="px-4 py-3 text-end">{isAr ? 'سعر الشراء' : 'Unit Price'}</th>
              <th className="px-4 py-3 text-center">{isAr ? 'الخصم' : 'Discount %'}</th>
              <th className="px-4 py-3 text-start">{isAr ? 'تاريخ السريان' : 'Effective Date'}</th>
              <th className="px-4 py-3 text-start">{isAr ? 'المستند المرجعي' : 'Ref Document'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {historyRecords.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  {isAr ? 'لا توجد سجلات أسعار مطابقة' : 'No price records found'}
                </td>
              </tr>
            ) : (
              historyRecords.map((rec) => (
                <tr key={rec.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-900">{rec.supplierNameAr}</td>
                  <td className="px-4 py-3">{rec.itemNameAr}</td>
                  <td className="px-4 py-3 text-slate-500">{rec.uomName}</td>
                  <td className="px-4 py-3 text-end font-bold text-emerald-700">
                    {formatCurrency(rec.unitCostSar)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {rec.discountPercent ? `${rec.discountPercent}%` : '-'}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(rec.date)}</td>
                  <td className="px-4 py-3 text-indigo-600 font-semibold">{rec.sourceNumber || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

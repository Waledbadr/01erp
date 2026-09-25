import React, { useState, useMemo } from 'react';
import {
  Tag,
  Plus,
  Search,
  Lock,
  Calendar,
  CheckCircle,
  AlertCircle,
  Trash2,
  RefreshCw,
  Building2,
  Layers,
  ArrowRight,
  ShieldCheck,
  Percent,
} from 'lucide-react';
import { useI18n } from '../../i18n/context.js';
import { CustomerPriceAgreement } from '../../lib/sales.js';

interface CustomerPriceAgreementsTabProps {
  agreements: CustomerPriceAgreement[];
  customers: Array<{ id: string; nameAr: string; nameEn: string }>;
  items: Array<{
    id: string;
    sku: string;
    nameAr: string;
    nameEn: string;
    sellingPrice: number;
    wholesalePrice: number;
    units: Array<{ id: string; nameAr: string; nameEn?: string; conversionFactor: number }>;
  }>;
  onOpenCreate: () => void;
  onRefresh: () => void;
  onDeleteAgreement: (id: string) => Promise<void>;
}

export const CustomerPriceAgreementsTab: React.FC<CustomerPriceAgreementsTabProps> = ({
  agreements,
  customers,
  items,
  onOpenCreate,
  onRefresh,
  onDeleteAgreement,
}) => {
  const { language } = useI18n();
  const isAr = language === 'ar';

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Filtered list
  const filteredAgreements = useMemo(() => {
    return agreements.filter((a) => {
      const matchesCustomer = selectedCustomerId === 'ALL' || a.customerId === selectedCustomerId;
      const matchesStatus = selectedStatus === 'ALL' || a.status === selectedStatus;
      const matchesSearch =
        !searchQuery ||
        (a.customerNameAr && a.customerNameAr.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (a.itemNameAr && a.itemNameAr.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (a.itemCode && a.itemCode.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (a.uomNameAr && a.uomNameAr.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchesCustomer && matchesStatus && matchesSearch;
    });
  }, [agreements, selectedCustomerId, selectedStatus, searchQuery]);

  const handleDelete = async (id: string) => {
    if (!window.confirm(isAr ? 'هل أنت متأكد من حذف هذه الاتفاقية؟' : 'Are you sure you want to delete this agreement?')) {
      return;
    }
    try {
      setDeletingId(id);
      await onDeleteAgreement(id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Policy Explanation Banner */}
      <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
              <span>{isAr ? 'نظام إلزام البيع بالوحدات والأسعار المعتمدة للعميل' : 'Customer Price & Unit Enforcement Policy'}</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-200/60 text-emerald-900 font-bold">
                {isAr ? 'سياسة ملزمة' : 'Enforced'}
              </span>
            </h4>
            <p className="text-[11px] text-emerald-800 mt-1 max-w-3xl leading-relaxed">
              {isAr
                ? 'تحدد هذه الشاشة قوائم الأسعار المتفق عليها مسبقاً مع كل عميل حسب الصنف والوحدة المعتمدة (كرتون، درزن، حبة). عند إنشاء فاتورة أو عرض سعر لهذا العميل، يتم إلزام النظام بالوحدة والسعر المتفق عليهما وقفل حقول التسعير لمنع التلاعب.'
                : 'Define agreed unit pricing per customer. When creating invoices or quotations, the system locks to the contracted unit and price, preventing overrides.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenCreate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl transition-all shadow-xs shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{isAr ? 'إضافة اتفاقية تسعير جديدة' : 'New Price Agreement'}</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? 'بحث بالعميل، الصنف، الوحدة...' : 'Search customer, item, unit...'}
            className="w-full ps-9 pe-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-600 focus:bg-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <select
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-600 text-slate-700 max-w-xs"
          >
            <option value="ALL">{isAr ? 'جميع العملاء' : 'All Customers'}</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameAr}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-600 text-slate-700"
          >
            <option value="ALL">{isAr ? 'جميع الحالات' : 'All Statuses'}</option>
            <option value="ACTIVE">{isAr ? 'نشطة (ACTIVE)' : 'Active'}</option>
            <option value="EXPIRED">{isAr ? 'منتهية (EXPIRED)' : 'Expired'}</option>
          </select>

          <button
            type="button"
            onClick={onRefresh}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            title={isAr ? 'تحديث' : 'Refresh'}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Agreements Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <tr>
                <th className="p-3 text-start">{isAr ? 'العميل' : 'Customer'}</th>
                <th className="p-3 text-start">{isAr ? 'الصنف والرمز' : 'Item & SKU'}</th>
                <th className="p-3 text-start">{isAr ? 'الوحدة المعتمدة' : 'Contracted Unit'}</th>
                <th className="p-3 text-center">{isAr ? 'معامل التحويل' : 'Factor'}</th>
                <th className="p-3 text-end">{isAr ? 'السعر المتفق عليه (﷼)' : 'Agreed Price (SAR)'}</th>
                <th className="p-3 text-center">{isAr ? 'الحد الأدنى للكمية' : 'Min Qty'}</th>
                <th className="p-3 text-center">{isAr ? 'نوع الإلزام' : 'Enforcement'}</th>
                <th className="p-3 text-center">{isAr ? 'فترة السريان' : 'Validity'}</th>
                <th className="p-3 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                <th className="p-3 text-center">{isAr ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredAgreements.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-500">
                    <Tag className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold">{isAr ? 'لا توجد اتفاقيات تسعير مطابقة للبحث' : 'No price agreements found'}</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {isAr ? 'اضغط على إضافة اتفاقية تسعير جديدة لتحديد أسعار وحدات العملاء' : 'Click New Price Agreement to add one'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredAgreements.map((agreement) => (
                  <tr key={agreement.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Customer */}
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{agreement.customerNameAr || 'عميل تجاري'}</div>
                      {agreement.notes && (
                        <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-xs">{agreement.notes}</div>
                      )}
                    </td>

                    {/* Item */}
                    <td className="p-3">
                      <div className="font-semibold text-slate-800">{agreement.itemNameAr}</div>
                      <div className="text-[10px] font-mono text-slate-400">{agreement.itemCode}</div>
                    </td>

                    {/* Contracted Unit */}
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-900 border border-emerald-200">
                        <Layers className="w-3.5 h-3.5 text-emerald-700" />
                        <span>{agreement.uomNameAr}</span>
                      </span>
                    </td>

                    {/* Factor */}
                    <td className="p-3 text-center font-mono text-slate-600">
                      {agreement.conversionFactor > 1 ? `${agreement.conversionFactor}x` : '1x (أساسي)'}
                    </td>

                    {/* Agreed Price */}
                    <td className="p-3 text-end font-mono font-bold text-emerald-800 text-sm">
                      {agreement.agreedPriceSar.toFixed(2)} ﷼
                    </td>

                    {/* Min Quantity */}
                    <td className="p-3 text-center font-mono text-slate-700">
                      {agreement.minQuantity ? `${agreement.minQuantity} ${agreement.uomNameAr}` : '-'}
                    </td>

                    {/* Enforcement Type */}
                    <td className="p-3 text-center">
                      {agreement.isStrictEnforced ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-200">
                          <Lock className="w-3 h-3 text-purple-700" />
                          <span>{isAr ? 'ملزم بالوحدة والسعر' : 'Strict Lock'}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700">
                          <span>{isAr ? 'استرشادي' : 'Suggested'}</span>
                        </span>
                      )}
                    </td>

                    {/* Validity */}
                    <td className="p-3 text-center font-mono text-[11px] text-slate-600">
                      {agreement.validFrom || agreement.validTo ? (
                        <div>
                          {agreement.validFrom && <div>من: {agreement.validFrom}</div>}
                          {agreement.validTo && <div>إلى: {agreement.validTo}</div>}
                        </div>
                      ) : (
                        <span>{isAr ? 'دائم' : 'Permanent'}</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="p-3 text-center">
                      {agreement.status === 'ACTIVE' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          {isAr ? 'نشطة' : 'Active'}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
                          {isAr ? 'منتهية' : 'Expired'}
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleDelete(agreement.id)}
                        disabled={deletingId === agreement.id}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
                        title={isAr ? 'حذف الاتفاقية' : 'Delete Agreement'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

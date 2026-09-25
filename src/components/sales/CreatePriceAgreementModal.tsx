import React, { useState, useEffect } from 'react';
import { X, Tag, Lock, CheckCircle, AlertCircle, Calendar, DollarSign, Layers } from 'lucide-react';
import { useI18n } from '../../i18n/context.js';
import { CustomerPriceAgreement } from '../../lib/sales.js';

interface CreatePriceAgreementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (agreement: CustomerPriceAgreement) => void;
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
  initialCustomerId?: string;
}

export const CreatePriceAgreementModal: React.FC<CreatePriceAgreementModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  customers,
  items,
  initialCustomerId,
}) => {
  const { language } = useI18n();
  const isAr = language === 'ar';

  const [customerId, setCustomerId] = useState<string>(initialCustomerId || (customers[0]?.id || ''));
  const [itemId, setItemId] = useState<string>(items[0]?.id || '');
  const [uomId, setUomId] = useState<string>('');
  const [agreedPriceSar, setAgreedPriceSar] = useState<number>(0);
  const [minQuantity, setMinQuantity] = useState<number>(1);
  const [isStrictEnforced, setIsStrictEnforced] = useState<boolean>(true);
  const [validFrom, setValidFrom] = useState<string>(new Date().toISOString().slice(0, 10));
  const [validTo, setValidTo] = useState<string>('2026-12-31');
  const [notes, setNotes] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Sync initial customer
  useEffect(() => {
    if (initialCustomerId) {
      setCustomerId(initialCustomerId);
    } else if (customers.length > 0 && !customerId) {
      setCustomerId(customers[0].id);
    }
  }, [initialCustomerId, customers]);

  // Sync selected item and its default unit/price
  useEffect(() => {
    if (items.length > 0) {
      const selectedItem = items.find((i) => i.id === itemId) || items[0];
      if (selectedItem) {
        if (!itemId) setItemId(selectedItem.id);
        const defaultUnit = selectedItem.units[0];
        if (defaultUnit && (!uomId || !selectedItem.units.some((u) => u.id === uomId))) {
          setUomId(defaultUnit.id);
        }
        if (agreedPriceSar <= 0) {
          setAgreedPriceSar(selectedItem.wholesalePrice || selectedItem.sellingPrice || 10);
        }
      }
    }
  }, [items, itemId]);

  if (!isOpen) return null;

  const currentItem = items.find((i) => i.id === itemId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || !itemId || !uomId) {
      setError(isAr ? 'يرجى اختيار العميل والصنف والوحدة' : 'Please select customer, item, and unit');
      return;
    }
    if (agreedPriceSar <= 0) {
      setError(isAr ? 'يجب أن يكون السعر المتفق عليه أكبر من الصفر' : 'Agreed price must be greater than zero');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const payload = {
        customerId,
        itemId,
        uomId,
        agreedPriceSar: Number(agreedPriceSar),
        minQuantity: minQuantity ? Number(minQuantity) : undefined,
        isStrictEnforced,
        validFrom,
        validTo,
        notes,
      };

      const token = typeof window !== 'undefined' ? localStorage.getItem('saudi_erp_session_token') : null;
      const res = await fetch('/api/v1/sales/price-agreements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create price agreement');
      }

      const created: CustomerPriceAgreement = await res.json();
      onCreated(created);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error creating price agreement');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-700 text-white flex items-center justify-center shadow-xs">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {isAr ? 'إنشاء اتفاقية تسعير ووحدة مخصصة لعميل' : 'New Customer Price & Unit Agreement'}
              </h2>
              <p className="text-[11px] text-slate-500">
                {isAr
                  ? 'تحديد سعر تعاقدي خاص بالصنف ووحدته وإلزام النظام بالبيع بهما حصراً'
                  : 'Define contracted unit price and enforce strict selling restrictions'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Customer Selection */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">
              {isAr ? 'العميل المستفيد من التسعيرة *' : 'Customer *'}
            </label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-emerald-600 font-semibold text-slate-800"
              required
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameAr} ({c.nameEn})
                </option>
              ))}
            </select>
          </div>

          {/* Item & Unit Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1.5">
                {isAr ? 'الصنف *' : 'Item *'}
              </label>
              <select
                value={itemId}
                onChange={(e) => {
                  setItemId(e.target.value);
                  const it = items.find((i) => i.id === e.target.value);
                  if (it && it.units.length > 0) {
                    setUomId(it.units[0].id);
                    setAgreedPriceSar(it.wholesalePrice || it.sellingPrice || 10);
                  }
                }}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-emerald-600 text-slate-800"
                required
              >
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.nameAr} ({it.sku})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1.5">
                {isAr ? 'الوحدة المعتمدة للاتفاقية (UOM) *' : 'Contracted Unit (UOM) *'}
              </label>
              <select
                value={uomId}
                onChange={(e) => setUomId(e.target.value)}
                className="w-full p-2.5 bg-emerald-50/50 border border-emerald-300 rounded-xl focus:bg-white focus:ring-1 focus:ring-emerald-600 font-bold text-emerald-950"
                required
              >
                {currentItem?.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nameAr} {u.conversionFactor > 1 ? `(معامل التحويل: ${u.conversionFactor})` : '(الوحدة الأساسية)'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Pricing & Min Qty */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1.5">
                {isAr ? 'السعر المتفق عليه شامل/قبل الضريبة (﷼) *' : 'Agreed Unit Price (SAR) *'}
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={agreedPriceSar}
                  onChange={(e) => setAgreedPriceSar(parseFloat(e.target.value) || 0)}
                  className="w-full p-2.5 ps-9 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-emerald-600 font-mono font-bold text-slate-900"
                  required
                />
                <DollarSign className="w-4 h-4 text-emerald-700 absolute start-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1.5">
                {isAr ? 'الحد الأدنى للكمية للتطبيق' : 'Minimum Quantity'}
              </label>
              <input
                type="number"
                min="1"
                value={minQuantity}
                onChange={(e) => setMinQuantity(parseInt(e.target.value) || 1)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-emerald-600 font-mono text-slate-800"
              />
            </div>
          </div>

          {/* Strict Enforcement Toggle */}
          <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-start gap-3">
            <input
              type="checkbox"
              id="strictEnforce"
              checked={isStrictEnforced}
              onChange={(e) => setIsStrictEnforced(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded text-emerald-700 focus:ring-emerald-600 border-slate-300"
            />
            <label htmlFor="strictEnforce" className="cursor-pointer">
              <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-emerald-700" />
                {isAr ? 'إلزام صارم بالسعر والوحدة المتفق عليهما' : 'Strict Unit & Price Enforcement'}
              </span>
              <p className="text-[11px] text-emerald-800 mt-0.5">
                {isAr
                  ? 'عند تفعيل هذا الخيار، سيتم قفل السعر والوحدة في الفواتير وعروض الأسعار ولن يُسمح لموظف المبيعات بتغيير السعر أو البيع بوحدة أخرى لهذا العميل.'
                  : 'Enforces pre-agreed prices and units; prevents sales reps from modifying price or selecting unauthorized units.'}
              </p>
            </label>
          </div>

          {/* Validity Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1.5">
                {isAr ? 'تاريخ بدء السريان' : 'Valid From'}
              </label>
              <input
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1.5">
                {isAr ? 'تاريخ انتهاء الاتفاقية' : 'Valid To'}
              </label>
              <input
                type="date"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">
              {isAr ? 'ملاحظات الاتفاقية / رقم العقد' : 'Notes / Contract Ref'}
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isAr ? 'مثال: عقد توريد سنوي B2B رقم 2026-CTR-88' : 'e.g. Annual supply contract #2026-CTR-88'}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-emerald-600 text-slate-800"
            />
          </div>

          {/* Modal Footer */}
          <div className="flex justify-end items-center gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors font-semibold"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl transition-colors shadow-xs flex items-center gap-2"
            >
              {loading ? (
                <span>{isAr ? 'جارِ الحفظ...' : 'Saving...'}</span>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>{isAr ? 'حفظ وتفعيل الاتفاقية' : 'Save & Enforce Agreement'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

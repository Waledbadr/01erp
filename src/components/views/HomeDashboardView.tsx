import React, { useEffect, useState } from 'react';
import {
  FileText,
  Store,
  Users,
  Boxes,
  ShoppingBag,
  Coins,
  Wallet,
  TrendingUp,
  AlertTriangle,
  Receipt,
  CheckCircle2,
  Circle,
  ArrowLeft,
  ArrowRight,
  Building2,
} from 'lucide-react';
import { useI18n } from '../../i18n/context.js';

/**
 * Business home page: what a company user needs every day.
 * All figures come from the existing APIs; a card shows "—" when the user's role
 * cannot read that data or the request fails. Nothing is invented.
 */

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  status: string;
  issueDate: string;
  totalAmountSar: number;
  remainingAmountSar?: number;
  customerNameAr?: string;
  customerNameEn?: string;
}

interface LowStockRow {
  itemId: string;
  sku: string;
  nameAr: string;
  currentStock: number;
  minimumStockLevel: number;
  status?: string;
}

interface HomeData {
  userName: string;
  companyName: string;
  onboardingCompleted: boolean;
  invoices: InvoiceRow[] | null;
  customersCount: number | null;
  itemsCount: number | null;
  receivablesSar: number | null;
  payablesSar: number | null;
  cashSar: number | null;
  lowStock: LowStockRow[] | null;
}

const EXCLUDED_FROM_SALES = new Set(['DRAFT', 'CANCELLED', 'REVERSED', 'FULLY_RETURNED']);

async function getJson(url: string, token: string | null): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function asArray<T>(value: any, key?: string): T[] | null {
  if (Array.isArray(value)) return value as T[];
  if (key && value && Array.isArray(value[key])) return value[key] as T[];
  if (value && Array.isArray(value.data)) return value.data as T[];
  return null;
}

export const HomeDashboardView: React.FC<{ onNavigate: (route: string) => void }> = ({ onNavigate }) => {
  const { isAr } = useI18n();
  const [data, setData] = useState<HomeData | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const token = localStorage.getItem('saudi_erp_session_token');
      const [me, invoices, customers, items, aging, bills, treasury, lowStock] = await Promise.all([
        getJson('/api/v1/auth/me', token),
        getJson('/api/v1/sales/invoices', token),
        getJson('/api/v1/sales/customers', token),
        getJson('/api/v1/inventory/items', token),
        getJson('/api/v1/sales/aging', token),
        getJson('/api/v1/purchasing/bills', token),
        getJson('/api/v1/treasury/overview', token),
        getJson('/api/v1/inventory/low-stock-alerts', token),
      ]);
      if (!active) return;

      const invoiceRows = asArray<InvoiceRow>(invoices);
      const agingRows = asArray<{ totalDueSar: number }>(aging);
      const billRows = asArray<{ remainingAmountSar?: number; status?: string }>(bills);
      const customerRows = asArray<unknown>(customers, 'customers');
      const itemRows = asArray<unknown>(items, 'items');

      setData({
        userName: (isAr ? me?.user?.fullNameAr : me?.user?.fullNameEn) || me?.user?.fullNameAr || '',
        companyName: (isAr ? me?.company?.nameAr : me?.company?.nameEn) || me?.company?.nameAr || '',
        onboardingCompleted: !!me?.company?.onboardingCompleted,
        invoices: invoiceRows,
        customersCount: customerRows ? customerRows.length : null,
        itemsCount: itemRows ? itemRows.length : null,
        receivablesSar: agingRows ? agingRows.reduce((s, r) => s + (Number(r.totalDueSar) || 0), 0) : null,
        payablesSar: billRows
          ? billRows
              .filter((b) => !['CANCELLED', 'DRAFT'].includes(String(b.status)))
              .reduce((s, b) => s + (Number(b.remainingAmountSar) || 0), 0)
          : null,
        cashSar: treasury?.data?.totalLiquidFundsSar ?? null,
        // The endpoint returns every tracked item with a status; only non-adequate ones need action.
        lowStock: (asArray<LowStockRow>(lowStock, 'alerts') || []).filter((a) => a.status && a.status !== 'ADEQUATE'),
      });
    };
    load();
    const onSwitch = () => load();
    window.addEventListener('company-switched', onSwitch);
    return () => {
      active = false;
      window.removeEventListener('company-switched', onSwitch);
    };
  }, [isAr]);

  const money = (v: number | null | undefined) =>
    v === null || v === undefined
      ? '—'
      : new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v); // Latin digits everywhere, like dates and invoice numbers
  const currency = isAr ? 'ر.س' : 'SAR';
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthSales = data?.invoices
    ? data.invoices
        .filter((i) => !EXCLUDED_FROM_SALES.has(i.status) && String(i.issueDate || '').startsWith(monthPrefix))
        .reduce((s, i) => s + (Number(i.totalAmountSar) || 0), 0)
    : null;
  const recentInvoices = data?.invoices
    ? [...data.invoices].sort((a, b) => String(b.issueDate).localeCompare(String(a.issueDate))).slice(0, 6)
    : [];

  const steps = [
    { done: !!data?.onboardingCompleted, route: '/company-wizard', ar: 'أكمل بيانات المنشأة والرقم الضريبي', en: 'Complete company profile and VAT number' },
    { done: (data?.itemsCount ?? 0) > 0, route: '/inventory', ar: 'أضف أصنافك وأسعارها', en: 'Add your items and prices' },
    { done: (data?.customersCount ?? 0) > 0, route: '/parties', ar: 'أضف عملاءك', en: 'Add your customers' },
    { done: (data?.invoices?.length ?? 0) > 0, route: '/sales', ar: 'أصدر أول فاتورة مبيعات', en: 'Issue your first sales invoice' },
  ];
  const stepsDone = steps.filter((s) => s.done).length;
  const showGettingStarted = data !== null && stepsDone < steps.length;

  const quickActions = [
    { route: '/sales', icon: FileText, ar: 'فاتورة مبيعات', en: 'Sales invoice' },
    { route: '/pos', icon: Store, ar: 'بيع سريع', en: 'Quick sale' },
    { route: '/treasury', icon: Receipt, ar: 'سند قبض / صرف', en: 'Receipt / payment' },
    { route: '/purchasing', icon: ShoppingBag, ar: 'فاتورة مشتريات', en: 'Purchase bill' },
    { route: '/parties', icon: Users, ar: 'عميل أو مورد', en: 'Customer / supplier' },
    { route: '/inventory', icon: Boxes, ar: 'صنف جديد', en: 'New item' },
  ];

  const statusLabel = (s: string) => {
    const map: Record<string, [string, string, string]> = {
      PAID: ['مدفوعة', 'Paid', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
      POSTED: ['غير مدفوعة', 'Unpaid', 'bg-amber-50 text-amber-700 border-amber-200'],
      PARTIALLY_PAID: ['مدفوعة جزئياً', 'Partly paid', 'bg-sky-50 text-sky-700 border-sky-200'],
      OVERDUE: ['متأخرة', 'Overdue', 'bg-rose-50 text-rose-700 border-rose-200'],
      DRAFT: ['مسودة', 'Draft', 'bg-slate-100 text-slate-600 border-slate-200'],
      CANCELLED: ['ملغاة', 'Cancelled', 'bg-slate-100 text-slate-500 border-slate-200'],
    };
    const m = map[s] || [s, s, 'bg-slate-100 text-slate-600 border-slate-200'];
    return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${m[2]}`}>{isAr ? m[0] : m[1]}</span>;
  };

  const kpis = [
    { icon: TrendingUp, ar: 'مبيعات هذا الشهر', en: 'Sales this month', value: monthSales, route: '/sales', tone: 'text-emerald-700 bg-emerald-50' },
    { icon: Wallet, ar: 'مستحق على العملاء', en: 'Owed by customers', value: data?.receivablesSar, route: '/reminders', tone: 'text-amber-700 bg-amber-50' },
    { icon: ShoppingBag, ar: 'مستحق للموردين', en: 'Owed to suppliers', value: data?.payablesSar, route: '/purchasing', tone: 'text-rose-700 bg-rose-50' },
    { icon: Coins, ar: 'النقد في الصندوق والبنوك', en: 'Cash & bank balance', value: data?.cashSar, route: '/treasury', tone: 'text-sky-700 bg-sky-50' },
  ];

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
            {isAr ? 'مرحباً' : 'Welcome'}
            {data?.userName ? `${isAr ? '، ' : ', '}${data.userName}` : ''}
          </h1>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-slate-400" />
            <span>{data?.companyName || (isAr ? 'جاري التحميل…' : 'Loading…')}</span>
          </p>
        </div>
        <p className="text-xs text-slate-400">
          {now.toLocaleDateString(isAr ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Getting started */}
      {showGettingStarted && (
        <section className="bg-white border border-emerald-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-900">{isAr ? 'ابدأ باستخدام النظام' : 'Get started'}</h2>
            <span className="text-xs font-semibold text-emerald-700">
              {isAr ? `${stepsDone} من ${steps.length}` : `${stepsDone} of ${steps.length}`}
            </span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-4">
            <div className="h-full bg-emerald-600 transition-all" style={{ width: `${(stepsDone / steps.length) * 100}%` }} />
          </div>
          <ol className="grid sm:grid-cols-2 gap-2">
            {steps.map((s, i) => (
              <li key={s.route}>
                <button
                  onClick={() => onNavigate(s.route)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border text-start transition ${
                    s.done ? 'border-slate-100 bg-slate-50 text-slate-400' : 'border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40 text-slate-800'
                  }`}
                >
                  {s.done ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <Circle className="w-5 h-5 text-slate-300 shrink-0" />}
                  <span className={`text-sm font-semibold flex-1 ${s.done ? 'line-through' : ''}`}>
                    {i + 1}. {isAr ? s.ar : s.en}
                  </span>
                  {!s.done && <Arrow className="w-4 h-4 text-slate-400" />}
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Quick actions */}
      <section>
        <h2 className="text-sm font-bold text-slate-700 mb-2">{isAr ? 'إجراءات سريعة' : 'Quick actions'}</h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {quickActions.map((a) => (
            <button
              key={a.route + a.en}
              onClick={() => onNavigate(a.route)}
              className="flex flex-col items-center justify-center gap-2 p-3 min-h-[88px] bg-white border border-slate-200 rounded-xl hover:border-emerald-500 hover:shadow-sm transition"
            >
              <span className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <a.icon className="w-5 h-5" />
              </span>
              <span className="text-xs font-semibold text-slate-700 text-center leading-tight">{isAr ? a.ar : a.en}</span>
            </button>
          ))}
        </div>
      </section>

      {/* KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <button
            key={k.en}
            onClick={() => onNavigate(k.route)}
            className="text-start bg-white border border-slate-200 rounded-2xl p-4 hover:border-slate-300 hover:shadow-sm transition"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">{isAr ? k.ar : k.en}</span>
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${k.tone}`}>
                <k.icon className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-slate-900 tabular-nums">{data ? money(k.value as number | null) : '…'}</span>
              {data && k.value !== null && k.value !== undefined && <span className="text-xs text-slate-400">{currency}</span>}
            </div>
          </button>
        ))}
      </section>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Recent invoices */}
        <section className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900">{isAr ? 'آخر فواتير المبيعات' : 'Latest sales invoices'}</h2>
            <button onClick={() => onNavigate('/sales')} className="text-xs font-semibold text-emerald-700 hover:underline">
              {isAr ? 'عرض الكل' : 'View all'}
            </button>
          </div>
          {data === null ? (
            <p className="p-5 text-sm text-slate-400">{isAr ? 'جاري التحميل…' : 'Loading…'}</p>
          ) : data.invoices === null ? (
            <p className="p-5 text-sm text-slate-400">{isAr ? 'لا تملك صلاحية عرض الفواتير.' : 'You do not have access to invoices.'}</p>
          ) : recentInvoices.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-500 mb-3">{isAr ? 'لا توجد فواتير بعد.' : 'No invoices yet.'}</p>
              <button onClick={() => onNavigate('/sales')} className="text-sm font-bold text-white bg-emerald-700 hover:bg-emerald-800 px-4 py-2 rounded-lg">
                {isAr ? 'أنشئ أول فاتورة' : 'Create first invoice'}
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-400 text-start">
                    <th className="px-5 py-2 text-start font-semibold">{isAr ? 'الرقم' : 'Number'}</th>
                    <th className="px-5 py-2 text-start font-semibold">{isAr ? 'العميل' : 'Customer'}</th>
                    <th className="px-5 py-2 text-start font-semibold">{isAr ? 'التاريخ' : 'Date'}</th>
                    <th className="px-5 py-2 text-end font-semibold">{isAr ? 'المبلغ' : 'Amount'}</th>
                    <th className="px-5 py-2 text-start font-semibold">{isAr ? 'الحالة' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentInvoices.map((inv) => (
                    <tr key={inv.id} className="border-t border-slate-100">
                      <td className="px-5 py-2.5 font-mono text-xs text-slate-600 whitespace-nowrap">{inv.invoiceNumber}</td>
                      <td className="px-5 py-2.5 text-slate-800 truncate max-w-[220px]">
                        {(isAr ? inv.customerNameAr : inv.customerNameEn) || inv.customerNameAr || '—'}
                      </td>
                      <td className="px-5 py-2.5 text-slate-500 whitespace-nowrap">{inv.issueDate}</td>
                      <td className="px-5 py-2.5 text-end font-semibold tabular-nums whitespace-nowrap">{money(inv.totalAmountSar)}</td>
                      <td className="px-5 py-2.5">{statusLabel(inv.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Low stock */}
        <section className="bg-white border border-slate-200 rounded-2xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              {isAr ? 'أصناف تحتاج إعادة طلب' : 'Items to reorder'}
            </h2>
            <button onClick={() => onNavigate('/inventory')} className="text-xs font-semibold text-emerald-700 hover:underline">
              {isAr ? 'المخزون' : 'Stock'}
            </button>
          </div>
          {data === null ? (
            <p className="p-5 text-sm text-slate-400">{isAr ? 'جاري التحميل…' : 'Loading…'}</p>
          ) : !data.lowStock || data.lowStock.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">{isAr ? 'لا توجد أصناف تحت حد الطلب.' : 'No items below reorder level.'}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.lowStock.slice(0, 6).map((it) => (
                <li key={it.itemId} className="px-5 py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-800 truncate">{it.nameAr}</p>
                    <p className="text-[11px] font-mono text-slate-400">{it.sku}</p>
                  </div>
                  <span className="text-xs text-slate-500 whitespace-nowrap">
                    {isAr ? 'المتوفر' : 'On hand'} <b className="text-rose-700">{it.currentStock}</b>
                    {' · '}
                    {isAr ? 'الحد' : 'Min'} {it.minimumStockLevel}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

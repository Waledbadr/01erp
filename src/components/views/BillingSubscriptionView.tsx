import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Zap,
  TrendingUp,
  FileText,
  Users,
  HardDrive,
  Sparkles,
  RefreshCw,
  Clock,
  ShieldCheck,
  Building2,
  ExternalLink,
  ChevronRight,
  Info,
} from 'lucide-react';
import { useI18n } from '../../i18n/context.js';
import { Badge } from '../ui/Badge.js';
import {
  BillingAPI,
  SubscriptionPlan,
  TenantSubscription,
  TenantUsageMetrics,
  SubscriptionInvoice,
  formatBytes,
  formatSar,
  PlanCode,
  BillingCycle,
} from '../../lib/billing.js';

export const BillingSubscriptionView: React.FC<{ onNavigate?: (route: string) => void }> = ({ onNavigate }) => {
  const { isAr } = useI18n();

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscription, setSubscription] = useState<TenantSubscription | null>(null);
  const [currentPlan, setCurrentPlan] = useState<SubscriptionPlan | null>(null);
  const [usageData, setUsageData] = useState<any>(null);
  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
  const [gatewayConfig, setGatewayConfig] = useState<any>(null);

  const [billingCycle, setBillingCycle] = useState<BillingCycle>('MONTHLY');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [plansRes, subRes, usageRes, invRes, gwRes] = await Promise.all([
        BillingAPI.getPlans(),
        BillingAPI.getSubscription(),
        BillingAPI.getUsage(),
        BillingAPI.getInvoices(),
        BillingAPI.getGatewayStatus(),
      ]);

      setPlans(plansRes);
      setSubscription(subRes.subscription);
      setCurrentPlan(subRes.plan);
      setBillingCycle(subRes.subscription.billingCycle);
      setUsageData(usageRes);
      setInvoices(invRes);
      setGatewayConfig(gwRes);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'فشل في تحميل بيانات الاشتراك' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const handlePlanChange = async (planCode: PlanCode) => {
    try {
      setActionLoading(true);
      setFeedback(null);
      const updated = await BillingAPI.changePlan(planCode, billingCycle);
      setSubscription(updated);
      await loadAllData();
      setFeedback({
        type: 'success',
        message: isAr
          ? `تم تحديث الباقة بنجاح إلى ${plans.find((p) => p.code === planCode)?.nameAr}`
          : `Plan updated successfully to ${planCode}`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handlePayInvoice = async (invoiceId: string) => {
    try {
      setActionLoading(true);
      setFeedback(null);
      await BillingAPI.payInvoice(invoiceId, 'MOYASAR');
      await loadAllData();
      setFeedback({
        type: 'success',
        message: isAr ? 'تم سداد الفاتورة بنجاح وتفعيل الاشتراك.' : 'Invoice settled successfully.',
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleGenerateInvoice = async () => {
    try {
      setActionLoading(true);
      setFeedback(null);
      const inv = await BillingAPI.generateInvoice(billingCycle);
      await loadAllData();
      setFeedback({
        type: 'success',
        message: isAr
          ? `تم إصدار الفاتورة رقم ${inv.invoiceNumber} وترحيلها للأستاذ العام (قيد رقم: ${inv.glJournalNumber || 'GL'})`
          : `Invoice ${inv.invoiceNumber} posted to GL.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelSubmit = async () => {
    if (!cancelReason.trim()) return;
    try {
      setActionLoading(true);
      setFeedback(null);
      await BillingAPI.cancelSubscription(cancelReason);
      setCancelModalOpen(false);
      setCancelReason('');
      await loadAllData();
      setFeedback({
        type: 'success',
        message: isAr
          ? 'تم إلغاء التجديد التلقائي. ستظل كافة بيانات المنشأة محفوظة وقابلة للقراءة والتصدير.'
          : 'Auto-renew canceled. Your company data remains completely safe and exportable.',
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500 gap-2">
        <RefreshCw className="w-5 h-5 animate-spin text-emerald-600" />
        <span className="text-sm font-semibold">{isAr ? 'جاري تحميل بيانات الاشتراك والباقة...' : 'Loading subscription data...'}</span>
      </div>
    );
  }

  const isSuspended = subscription?.status === 'SUSPENDED';

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* 1. Header & Quick Status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              {isAr ? 'الاشتراك' : 'Subscription'}
            </h1>
            <Badge variant={isSuspended ? 'danger' : subscription?.status === 'ACTIVE' ? 'success' : 'warning'}>
              {subscription?.status || 'ACTIVE'}
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {isAr
              ? 'متابعة استهلاك الموارد السحابية، الفواتير الدورية المرحلة دفترياً، وخيارات الترقية الفورية'
              : 'Real-time usage metering, double-entry subscription invoices, and self-service plan upgrades'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadAllData}
            disabled={actionLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
            <span>{isAr ? 'تحديث' : 'Refresh'}</span>
          </button>
          <button
            onClick={handleGenerateInvoice}
            disabled={actionLoading}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-xs transition"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{isAr ? 'إصدار فاتورة دورية' : 'Generate Cycle Invoice'}</span>
          </button>
        </div>
      </div>

      {/* 2. Feedback Alert */}
      {feedback && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between gap-3 text-sm font-semibold ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
              : 'bg-rose-50 text-rose-900 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-rose-600" />}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-xs opacity-70 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* 3. Suspended Banner (If applicable) */}
      {isSuspended && (
        <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-400 text-amber-900 flex items-start gap-3 shadow-xs">
          <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <h4 className="font-bold text-base text-amber-950">
              {isAr ? 'تنبيه: حساب المنشأة موقوف حالياً (وضع القراءة فقط)' : 'Notice: Company subscription is suspended (Read-Only Mode)'}
            </h4>
            <p className="mt-1 text-amber-800">
              {subscription?.suspensionReason ||
                (isAr
                  ? 'تم تعليق الاشتراك لعدم سداد الفاتورة الدورية. جميع عمليات التعديل والإضافة معطلة، مع استمرار إمكانية قراءة وتصدير البيانات.'
                  : 'Account suspended for past due invoice. Write operations disabled; data viewing and export remain active.')}
            </p>
          </div>
        </div>
      )}

      {/* 4. Active Plan & Billing Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Plan Card */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                {isAr ? 'الباقة الحالية المفعلة' : 'Current Active Plan'}
              </span>
              <h2 className="text-2xl font-black text-slate-900 mt-1">
                {isAr ? currentPlan?.nameAr : currentPlan?.nameEn}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAr ? currentPlan?.descriptionAr : currentPlan?.descriptionEn}
              </p>
            </div>
            <div className="text-end">
              <span className="text-3xl font-black text-emerald-800">
                {subscription?.billingCycle === 'ANNUAL'
                  ? formatSar(currentPlan?.priceAnnualSar || 0)
                  : formatSar(currentPlan?.priceMonthlySar || 0)}
              </span>
              <span className="text-xs text-slate-400 block">
                {subscription?.billingCycle === 'ANNUAL' ? (isAr ? 'سنوياً' : '/year') : (isAr ? 'شهرياً' : '/month')}
              </span>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-slate-400 block">{isAr ? 'دورة المحاسبة' : 'Billing Cycle'}</span>
              <span className="font-bold text-slate-800">
                {subscription?.billingCycle === 'ANNUAL' ? (isAr ? 'سنوي (توفير شهرين)' : 'Annual (2 Months Free)') : (isAr ? 'شهري' : 'Monthly')}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">{isAr ? 'تاريخ التجديد القادم' : 'Next Renewal'}</span>
              <span className="font-bold text-slate-800">
                {subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString('ar-SA') : '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">{isAr ? 'التجديد التلقائي' : 'Auto Renew'}</span>
              <span className={`font-bold ${subscription?.autoRenew ? 'text-emerald-700' : 'text-slate-500'}`}>
                {subscription?.autoRenew ? (isAr ? 'مفعل تلقائياً' : 'Enabled') : (isAr ? 'معطل' : 'Disabled')}
              </span>
            </div>
          </div>

          {subscription?.autoRenew && (
            <div className="mt-5 pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setCancelModalOpen(true)}
                className="text-xs font-semibold text-rose-600 hover:text-rose-800 hover:underline"
              >
                {isAr ? 'إلغاء التجديد التلقائي للاشتراك' : 'Cancel Subscription Auto-Renew'}
              </button>
            </div>
          )}
        </div>

        {/* Gateway Status Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="w-5 h-5 text-emerald-700" />
              <h3 className="text-sm font-bold text-slate-900">
                {isAr ? 'بوابة الدفع الإلكتروني المعتمدة' : 'Payment Gateway'}
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              {isAr
                ? 'متوافقة مع مدى، فيزا، ماستركارد، وApple Pay عبر بوابة ميسر (Moyasar).'
                : 'Mada, Visa, Mastercard, and Apple Pay via Moyasar Gateway.'}
            </p>

            <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">{isAr ? 'مزود البوابة:' : 'Provider:'}</span>
                <span className="font-bold text-slate-800">Moyasar (Saudi Arabia)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">{isAr ? 'حالة التكوين:' : 'Status:'}</span>
                {gatewayConfig?.isConfigured ? (
                  <Badge variant="success" size="sm">
                    {isAr ? 'مفعل وجاهز' : 'CONFIGURED'}
                  </Badge>
                ) : (
                  <Badge variant="default" size="sm">
                    {isAr ? 'وضع الاستعداد' : 'STANDBY'}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400">
            {isAr
              ? 'ملاحظة: تُسدد الفواتير مباشرة مع تحديث فوري لدفتر الأستاذ العام ورفع الحظر عند السداد.'
              : 'Payments post automatically to General Ledger with zero-delay account reactivation.'}
          </div>
        </div>
      </div>

      {/* 5. Real-Time Usage Metering (Traceable Counters) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-black text-slate-900">
              {isAr ? 'استهلاك الموارد السحابية للشهر الحالي' : 'Live Cloud Resource Metering'}
            </h3>
            <p className="text-xs text-slate-500">
              {isAr
                ? 'مراقبة حية للمستخدمين، المستندات، السعة التخزينية، واستعلامات المساعد الذكي'
                : 'Traceable consumption vs plan hard limits (80% Warning, 100% Block)'}
            </p>
          </div>
          <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-1 rounded-md">
            {usageData?.usage?.periodKey || '2026-09'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Users Meter */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-700" />
                <span className="text-xs font-bold text-slate-800">{isAr ? 'المستخدمين النشطين' : 'Active Users'}</span>
              </div>
              <span className="text-xs font-extrabold text-slate-900">
                {usageData?.usage?.usersCount} / {usageData?.limits?.maxUsers}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  usageData?.percentages?.users >= 100
                    ? 'bg-rose-600'
                    : usageData?.percentages?.users >= 80
                    ? 'bg-amber-500'
                    : 'bg-emerald-600'
                }`}
                style={{ width: `${Math.min(usageData?.percentages?.users || 0, 100)}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[10px] text-slate-500 mt-1.5">
              <span>{usageData?.percentages?.users}% {isAr ? 'مستهلك' : 'used'}</span>
              {usageData?.warnings?.users && <span className="text-amber-600 font-bold">{isAr ? 'اقترب الحد' : 'Near limit'}</span>}
            </div>
          </div>

          {/* Documents Meter */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-700" />
                <span className="text-xs font-bold text-slate-800">{isAr ? 'المستندات الشهرية' : 'Monthly Documents'}</span>
              </div>
              <span className="text-xs font-extrabold text-slate-900">
                {usageData?.usage?.documentsCount} / {usageData?.limits?.maxMonthlyDocuments}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  usageData?.percentages?.documents >= 100
                    ? 'bg-rose-600'
                    : usageData?.percentages?.documents >= 80
                    ? 'bg-amber-500'
                    : 'bg-emerald-600'
                }`}
                style={{ width: `${Math.min(usageData?.percentages?.documents || 0, 100)}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[10px] text-slate-500 mt-1.5">
              <span>{usageData?.percentages?.documents}% {isAr ? 'مستهلك' : 'used'}</span>
              {usageData?.warnings?.documents && <span className="text-amber-600 font-bold">{isAr ? 'اقترب الحد' : 'Near limit'}</span>}
            </div>
          </div>

          {/* Storage Meter */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-emerald-700" />
                <span className="text-xs font-bold text-slate-800">{isAr ? 'السعة التخزينية' : 'Cloud Storage'}</span>
              </div>
              <span className="text-xs font-extrabold text-slate-900">
                {formatBytes(usageData?.usage?.storageBytes || 0)} / {formatBytes(usageData?.limits?.maxStorageBytes || 0)}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  usageData?.percentages?.storage >= 100
                    ? 'bg-rose-600'
                    : usageData?.percentages?.storage >= 80
                    ? 'bg-amber-500'
                    : 'bg-emerald-600'
                }`}
                style={{ width: `${Math.min(usageData?.percentages?.storage || 0, 100)}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[10px] text-slate-500 mt-1.5">
              <span>{usageData?.percentages?.storage}% {isAr ? 'مستهلك' : 'used'}</span>
              {usageData?.warnings?.storage && <span className="text-amber-600 font-bold">{isAr ? 'اقترب الحد' : 'Near limit'}</span>}
            </div>
          </div>

          {/* AI Copilot Requests Meter */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-slate-800">{isAr ? 'استعلامات الذكاء الاصطناعي' : 'AI Copilot Requests'}</span>
              </div>
              <span className="text-xs font-extrabold text-slate-900">
                {usageData?.usage?.aiRequestsCount} / {usageData?.limits?.maxMonthlyAiRequests}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  usageData?.percentages?.aiRequests >= 100
                    ? 'bg-rose-600'
                    : usageData?.percentages?.aiRequests >= 80
                    ? 'bg-amber-500'
                    : 'bg-indigo-600'
                }`}
                style={{ width: `${Math.min(usageData?.percentages?.aiRequests || 0, 100)}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[10px] text-slate-500 mt-1.5">
              <span>{usageData?.percentages?.aiRequests}% {isAr ? 'مستهلك' : 'used'}</span>
              {usageData?.warnings?.aiRequests && <span className="text-amber-600 font-bold">{isAr ? 'اقترب الحد' : 'Near limit'}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* 6. Plan Comparison & Upgrade Grid */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-black text-slate-900">{isAr ? 'باقات الاشتراك المتاحة' : 'Subscription Plans Catalog'}</h3>
            <p className="text-xs text-slate-500">{isAr ? 'ترقية فورية بدون انقطاع مع احتساب الفارق النسبي' : 'Instant upgrades with zero downtime'}</p>
          </div>

          {/* Monthly / Annual Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 self-start">
            <button
              onClick={() => setBillingCycle('MONTHLY')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                billingCycle === 'MONTHLY' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isAr ? 'اشتراك شهري' : 'Monthly'}
            </button>
            <button
              onClick={() => setBillingCycle('ANNUAL')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                billingCycle === 'ANNUAL' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>{isAr ? 'اشتراك سنوي' : 'Annual'}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-black">
                {isAr ? 'وفر 16%' : 'Save 16%'}
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan) => {
            const isCurrent = subscription?.planCode === plan.code;
            const price = billingCycle === 'ANNUAL' ? plan.priceAnnualSar : plan.priceMonthlySar;

            return (
              <div
                key={plan.code}
                className={`rounded-2xl border p-5 flex flex-col justify-between transition relative ${
                  isCurrent
                    ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/20 shadow-md'
                    : 'border-slate-200 bg-white hover:border-slate-300 shadow-2xs'
                }`}
              >
                {isCurrent && (
                  <span className="absolute -top-3 start-4 px-2.5 py-0.5 rounded-full bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider">
                    {isAr ? 'باقتك الحالية' : 'Current Plan'}
                  </span>
                )}

                <div>
                  <h4 className="text-base font-black text-slate-900">{isAr ? plan.nameAr : plan.nameEn}</h4>
                  <p className="text-xs text-slate-500 mt-1 min-h-[36px]">{isAr ? plan.descriptionAr : plan.descriptionEn}</p>

                  <div className="my-4 pt-3 border-t border-slate-100">
                    <span className="text-2xl font-black text-slate-900">{price === 0 ? (isAr ? 'مجاناً' : 'Free') : formatSar(price)}</span>
                    <span className="text-xs text-slate-400 block mt-0.5">
                      {price > 0 ? (billingCycle === 'ANNUAL' ? (isAr ? '/ سنوياً' : '/ year') : (isAr ? '/ شهرياً' : '/ month')) : ''}
                    </span>
                  </div>

                  {/* Limits list */}
                  <div className="space-y-2 py-3 border-t border-slate-100 text-xs">
                    <div className="flex items-center gap-2 text-slate-700">
                      <Users className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{plan.limits.maxUsers} {isAr ? 'مستخدمين' : 'Users'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-700">
                      <FileText className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{plan.limits.maxMonthlyDocuments.toLocaleString()} {isAr ? 'مستند/شهر' : 'Docs/mo'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-700">
                      <HardDrive className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{formatBytes(plan.limits.maxStorageBytes)} {isAr ? 'سعة سحابية' : 'Storage'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-700">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span>{plan.limits.maxMonthlyAiRequests.toLocaleString()} {isAr ? 'استعلام ذكاء اصطناعي' : 'AI requests'}</span>
                    </div>
                  </div>

                  {/* Features checklist */}
                  <div className="space-y-1.5 pt-3 border-t border-slate-100 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className={`w-3.5 h-3.5 ${plan.features.allowZatcaPhase2 ? 'text-emerald-600' : 'text-slate-300'}`} />
                      <span className={plan.features.allowZatcaPhase2 ? 'text-slate-800' : 'text-slate-400 line-through'}>
                        {isAr ? 'الربط مع هيئة الزكاة (ZATCA)' : 'ZATCA Phase 2'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className={`w-3.5 h-3.5 ${plan.features.allowPos ? 'text-emerald-600' : 'text-slate-300'}`} />
                      <span className={plan.features.allowPos ? 'text-slate-800' : 'text-slate-400 line-through'}>
                        {isAr ? 'نقاط البيع السريعة (POS)' : 'Point of Sale'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className={`w-3.5 h-3.5 ${plan.features.allowAutomation ? 'text-emerald-600' : 'text-slate-300'}`} />
                      <span className={plan.features.allowAutomation ? 'text-slate-800' : 'text-slate-400 line-through'}>
                        {isAr ? 'محرك الأتمتة وقواعد الأعمال' : 'Automation Rules'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className={`w-3.5 h-3.5 ${plan.features.allowOcr ? 'text-emerald-600' : 'text-slate-300'}`} />
                      <span className={plan.features.allowOcr ? 'text-slate-800' : 'text-slate-400 line-through'}>
                        {isAr ? 'التقاط فواتير الموردين (OCR)' : 'OCR Invoice Capture'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3">
                  <button
                    onClick={() => handlePlanChange(plan.code)}
                    disabled={actionLoading || isCurrent}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      isCurrent
                        ? 'bg-slate-100 text-slate-400 cursor-default'
                        : 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs'
                    }`}
                  >
                    {isCurrent ? (
                      <span>{isAr ? 'باقتك المفعلة' : 'Active Plan'}</span>
                    ) : (
                      <>
                        <span>{isAr ? 'اختيار هذه الباقة' : 'Select Plan'}</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 7. Invoices History Table with Double-Entry General Ledger Links */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-black text-slate-900">{isAr ? 'سجل فواتير الاشتراك' : 'Subscription Invoices'}</h3>
            <p className="text-xs text-slate-500">
              {isAr
                ? 'فواتير ضريبية نظامية بنسبة 15% مرحلة ومقيدة بقيود محاسبية متوازنة دفترياً (قاعدة G1)'
                : 'Statutory 15% VAT invoices linked to General Ledger double-entry vouchers'}
            </p>
          </div>
          <span className="text-xs font-bold text-slate-500">
            {invoices.length} {isAr ? 'فاتورة' : 'Invoices'}
          </span>
        </div>

        {invoices.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">
            <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p>{isAr ? 'لا توجد فواتير اشتراك مصدرة حتى الآن.' : 'No subscription invoices generated yet.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold">
                <tr>
                  <th className="p-3 text-start">{isAr ? 'رقم الفاتورة' : 'Invoice #'}</th>
                  <th className="p-3 text-start">{isAr ? 'تاريخ الإصدار' : 'Issue Date'}</th>
                  <th className="p-3 text-start">{isAr ? 'الباقة' : 'Plan'}</th>
                  <th className="p-3 text-end">{isAr ? 'المبلغ الأساسي' : 'Subtotal'}</th>
                  <th className="p-3 text-end">{isAr ? 'ض.ق.م 15%' : 'VAT 15%'}</th>
                  <th className="p-3 text-end">{isAr ? 'الإجمالي' : 'Total (SAR)'}</th>
                  <th className="p-3 text-center">{isAr ? 'قيد الأستاذ (GL)' : 'GL Journal'}</th>
                  <th className="p-3 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="p-3 text-center">{isAr ? 'الإجراء' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-3 font-mono font-bold text-slate-800">{inv.invoiceNumber}</td>
                    <td className="p-3 text-slate-600">
                      {new Date(inv.createdAt).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')}
                    </td>
                    <td className="p-3 font-semibold text-slate-700">
                      {inv.planCode} ({inv.billingCycle === 'ANNUAL' ? (isAr ? 'سنوي' : 'Annual') : (isAr ? 'شهري' : 'Monthly')})
                    </td>
                    <td className="p-3 text-end font-mono text-slate-700">{formatSar(inv.subtotalSar)}</td>
                    <td className="p-3 text-end font-mono text-slate-700">{formatSar(inv.vatSar)}</td>
                    <td className="p-3 text-end font-mono font-bold text-slate-900">{formatSar(inv.totalSar)}</td>
                    <td className="p-3 text-center">
                      {inv.glJournalNumber ? (
                        <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-bold">
                          {inv.glJournalNumber}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant={inv.status === 'PAID' ? 'success' : inv.status === 'POSTED' ? 'warning' : 'default'}>
                        {inv.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-center">
                      {inv.status === 'POSTED' && (
                        <button
                          onClick={() => handlePayInvoice(inv.id)}
                          disabled={actionLoading}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 shadow-2xs"
                        >
                          {isAr ? 'سداد الآن' : 'Pay Now'}
                        </button>
                      )}
                      {inv.status === 'PAID' && (
                        <span className="text-[11px] text-emerald-700 font-bold flex items-center justify-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {isAr ? 'مسددة' : 'Settled'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 8. Cancel Auto-Renew Modal */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-black text-slate-900">
              {isAr ? 'إلغاء التجديد التلقائي للاشتراك' : 'Cancel Subscription Auto-Renew'}
            </h3>
            <p className="text-xs text-slate-600">
              {isAr
                ? 'عند إلغاء التجديد، سيبقى حسابك نشطاً حتى نهاية الفترة الحالية، وتظل كافة بيانات المنشأة محفوظة بالكامل وقابلة للتصدير والقراءة.'
                : 'Your account remains active until current period ends. All company data remains 100% intact and exportable.'}
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {isAr ? 'سبب الإلغاء (مطلوب)' : 'Cancellation Reason (Required)'}
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder={isAr ? 'يرجى توضيح سبب إلغاء التجديد...' : 'Please explain the reason...'}
                className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setCancelModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                {isAr ? 'تراجع' : 'Back'}
              </button>
              <button
                onClick={handleCancelSubmit}
                disabled={!cancelReason.trim() || actionLoading}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl disabled:opacity-50"
              >
                {isAr ? 'تأكيد إيقاف التجديد' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

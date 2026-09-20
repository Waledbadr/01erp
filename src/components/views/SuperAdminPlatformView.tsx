import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Building2,
  Users,
  Coins,
  HardDrive,
  FileText,
  Lock,
  Unlock,
  Key,
  Clock,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  Eye,
  ShieldCheck,
  Ban,
  Activity,
} from 'lucide-react';
import { useI18n } from '../../i18n/context.js';
import { Badge } from '../ui/Badge.js';
import {
  SuperAdminAPI,
  PlatformMetrics,
  CompanyMetadata,
  AdminAccessGrant,
  AdminAccessLog,
  formatBytes,
  formatSar,
} from '../../lib/billing.js';

export const SuperAdminPlatformView: React.FC<{ onNavigate?: (route: string) => void }> = () => {
  const { isAr } = useI18n();

  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [companies, setCompanies] = useState<CompanyMetadata[]>([]);
  const [grants, setGrants] = useState<AdminAccessGrant[]>([]);
  const [accessLogs, setAccessLogs] = useState<AdminAccessLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'companies' | 'grants' | 'audit' | 'diagnostics'>('companies');

  // Modals state
  const [suspendModal, setSuspendModal] = useState<{ open: boolean; company?: CompanyMetadata }>({ open: false });
  const [suspendReason, setSuspendReason] = useState('');

  const [grantModal, setGrantModal] = useState<{ open: boolean; company?: CompanyMetadata }>({ open: false });
  const [grantReason, setGrantReason] = useState('');
  const [grantDuration, setGrantDuration] = useState<number>(15);

  const [inspectResult, setInspectResult] = useState<{ success: boolean; data?: any; error?: string } | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [m, c, g, l] = await Promise.all([
        SuperAdminAPI.getMetrics(),
        SuperAdminAPI.getCompanies(),
        SuperAdminAPI.getSupportGrants(),
        SuperAdminAPI.getSupportAccessLogs(),
      ]);
      setMetrics(m);
      setCompanies(c);
      setGrants(g);
      setAccessLogs(l);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'فشل في تحميل بيانات منصة الإدارة' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSuspendCompany = async () => {
    if (!suspendModal.company || !suspendReason.trim()) return;
    try {
      setActionLoading(true);
      setFeedback(null);
      await SuperAdminAPI.suspendTenant(suspendModal.company.id, suspendReason.trim());
      setSuspendModal({ open: false });
      setSuspendReason('');
      await loadData();
      setFeedback({
        type: 'success',
        message: isAr ? 'تم إيقاف المنشأة وتفعيل وضع القراءة فقط بنجاح.' : 'Tenant suspended in read-only mode.',
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestoreCompany = async (companyId: string) => {
    try {
      setActionLoading(true);
      setFeedback(null);
      await SuperAdminAPI.restoreTenant(companyId);
      await loadData();
      setFeedback({
        type: 'success',
        message: isAr ? 'تمت إعادة تفعيل حساب المنشأة ورفع وضع القراءة فقط.' : 'Tenant reactivated successfully.',
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleIssueGrant = async () => {
    if (!grantModal.company || grantReason.trim().length < 10) return;
    try {
      setActionLoading(true);
      setFeedback(null);
      await SuperAdminAPI.createSupportGrant(grantModal.company.id, grantReason.trim(), grantDuration);
      setGrantModal({ open: false });
      setGrantReason('');
      await loadData();
      setFeedback({
        type: 'success',
        message: isAr
          ? `تم إصدار تصريح الدعم الفني المحدد بـ ${grantDuration} دقيقة بنجاح.`
          : `Support grant issued for ${grantDuration} minutes.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevokeGrant = async (grantId: string) => {
    try {
      setActionLoading(true);
      setFeedback(null);
      await SuperAdminAPI.revokeSupportGrant(grantId);
      await loadData();
      setFeedback({
        type: 'success',
        message: isAr ? 'تم إلغاء تصريح الدعم الفني فوراً.' : 'Support grant revoked immediately.',
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleTestInspect = async (companyId: string) => {
    try {
      setActionLoading(true);
      setInspectResult(null);
      const res = await SuperAdminAPI.inspectOperationalData(companyId);
      setInspectResult({ success: true, data: res.data });
      await loadData(); // refresh audit logs
    } catch (err: any) {
      setInspectResult({ success: false, error: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleTestImpersonation = async () => {
    try {
      const res = await fetch('/api/v1/superadmin/impersonate', {
        method: 'POST',
        headers: { 'x-superadmin': 'true' },
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({
          type: 'error',
          message: `${isAr ? 'حماية أمنية صارمة' : 'Strict Security'}: ${data.message} (${data.error})`,
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    }
  };

  const filteredCompanies = companies.filter(
    (c) =>
      c.nameAr.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.vatNumber.includes(searchQuery)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500 gap-2">
        <RefreshCw className="w-5 h-5 animate-spin text-emerald-600" />
        <span className="text-sm font-semibold">{isAr ? 'جاري تحميل لوحة الإدارة العامة...' : 'Loading Super Admin platform...'}</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* 1. Header & SuperAdmin Scope Warning */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              {isAr ? 'منصة الإدارة العامة للشركات والسحابة' : 'Platform Super Admin Console'}
            </h1>
            <Badge variant="default" size="sm">
              SUPER_ADMIN
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {isAr
              ? 'مراقبة أداء المنصة، إدارة الاشتراكات، وتطبيق حدود الخصوصية الصارمة (بيانات وصفية فقط)'
              : 'Multi-tenant fleet management, MRR monitoring, and privacy boundary enforcement'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={actionLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
            <span>{isAr ? 'تحديث' : 'Refresh'}</span>
          </button>
          <button
            onClick={handleTestImpersonation}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 shadow-2xs"
            title={isAr ? 'اختبار حظر انتحال الهوية' : 'Test Anti-Impersonation Block'}
          >
            <Ban className="w-3.5 h-3.5" />
            <span>{isAr ? 'اختبار حظر الانتحال' : 'Anti-Impersonation Check'}</span>
          </button>
        </div>
      </div>

      {/* 2. Privacy & Data Boundary Banner */}
      <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-950 flex items-start gap-3 shadow-xs">
        <ShieldCheck className="w-6 h-6 text-indigo-700 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <span className="font-extrabold text-sm block text-indigo-950">
            {isAr ? 'حدود الأمان وحماية خصوصية بيانات المستأجرين (Rule B / Multi-Tenant Isolation)' : 'Strict Privacy & Data Boundary Enforcement'}
          </span>
          <p className="text-indigo-800">
            {isAr
              ? 'المشرف العام مصرح له حصراً بالاطلاع على البيانات الوصفية (Metadata) للمنشآت. الوصول إلى السجلات التشغيلية الداخلية (فواتير، قيود، مخزون) يتطلب تصريح دعم فني مؤقت ومحدد المدة (admin_access_grants) مع تسجيل كامل في سجل الرقابة غير القابل للتعديل.'
              : 'Super Admins can only view company metadata. Access to operational records requires an active time-boxed Support Access Grant with full audit logging.'}
          </p>
        </div>
      </div>

      {/* 3. Feedback Alert */}
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

      {/* 4. Platform KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs">
          <div className="flex items-center gap-1.5 text-slate-500 text-xs font-bold mb-1">
            <Building2 className="w-4 h-4 text-emerald-700" />
            <span>{isAr ? 'إجمالي المنشآت' : 'Tenants'}</span>
          </div>
          <span className="text-2xl font-black text-slate-900">{metrics?.totalTenants}</span>
          <span className="text-[10px] text-emerald-700 block mt-0.5 font-semibold">
            {metrics?.activeTenants} {isAr ? 'نشط' : 'active'}
          </span>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs">
          <div className="flex items-center gap-1.5 text-slate-500 text-xs font-bold mb-1">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>{isAr ? 'منشآت موقوفة' : 'Suspended'}</span>
          </div>
          <span className="text-2xl font-black text-amber-600">{metrics?.suspendedTenants}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? 'وضع القراءة فقط' : 'Read-only mode'}</span>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs">
          <div className="flex items-center gap-1.5 text-slate-500 text-xs font-bold mb-1">
            <Coins className="w-4 h-4 text-emerald-700" />
            <span>{isAr ? 'الإيراد الشهري (MRR)' : 'Monthly MRR'}</span>
          </div>
          <span className="text-xl font-black text-slate-900">{formatSar(metrics?.totalMrrSar || 0)}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? 'إيرادات الاشتراكات' : 'Recurring revenue'}</span>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs">
          <div className="flex items-center gap-1.5 text-slate-500 text-xs font-bold mb-1">
            <Activity className="w-4 h-4 text-teal-700" />
            <span>{isAr ? 'الإيراد السنوي (ARR)' : 'Annual ARR'}</span>
          </div>
          <span className="text-xl font-black text-slate-900">{formatSar(metrics?.totalArrSar || 0)}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? 'معدل سنوي تقديري' : 'Run-rate estimate'}</span>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs">
          <div className="flex items-center gap-1.5 text-slate-500 text-xs font-bold mb-1">
            <FileText className="w-4 h-4 text-blue-700" />
            <span>{isAr ? 'مستندات المنصة' : 'Platform Docs'}</span>
          </div>
          <span className="text-2xl font-black text-slate-900">{metrics?.totalPlatformDocuments.toLocaleString()}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? 'فواتير وقيود وسندات' : 'Transactions'}</span>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs">
          <div className="flex items-center gap-1.5 text-slate-500 text-xs font-bold mb-1">
            <HardDrive className="w-4 h-4 text-purple-700" />
            <span>{isAr ? 'التخزين السحابي' : 'Total Storage'}</span>
          </div>
          <span className="text-2xl font-black text-slate-900">{formatBytes(metrics?.totalPlatformStorageBytes || 0)}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? 'مرفقات وبيانات' : 'Tenant storage'}</span>
        </div>
      </div>

      {/* 5. Navigation Tabs */}
      <div className="flex items-center border-b border-slate-200 gap-6 text-sm font-bold">
        <button
          onClick={() => setActiveTab('companies')}
          className={`pb-3 border-b-2 transition ${
            activeTab === 'companies'
              ? 'border-emerald-700 text-emerald-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          {isAr ? 'دليل المنشآت والاشتراكات (Metadata)' : 'Company Directory'}
        </button>
        <button
          onClick={() => setActiveTab('grants')}
          className={`pb-3 border-b-2 transition flex items-center gap-1.5 ${
            activeTab === 'grants'
              ? 'border-emerald-700 text-emerald-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>{isAr ? 'تصاريح الدعم الفني المؤقتة' : 'Support Grants'}</span>
          {grants.filter((g) => !g.isRevoked && new Date(g.expiresAt) > new Date()).length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black">
              {grants.filter((g) => !g.isRevoked && new Date(g.expiresAt) > new Date()).length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`pb-3 border-b-2 transition ${
            activeTab === 'audit'
              ? 'border-emerald-700 text-emerald-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          {isAr ? 'سجل رقابة الوصول للدعم' : 'Access Audit Logs'}
        </button>
        <button
          onClick={() => setActiveTab('diagnostics')}
          className={`pb-3 border-b-2 transition ${
            activeTab === 'diagnostics'
              ? 'border-emerald-700 text-emerald-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          {isAr ? 'فحص القيود والتشخيص الأمني' : 'Security Boundary Diagnostics'}
        </button>
      </div>

      {/* 6. TAB CONTENT: Companies Directory */}
      {activeTab === 'companies' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute start-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isAr ? 'بحث باسم المنشأة، الكود، الرقم الضريبي...' : 'Search by name, code, VAT...'}
                className="w-full text-xs ps-9 pe-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <span className="text-xs text-slate-500 font-bold">
              {filteredCompanies.length} {isAr ? 'منشأة مسجلة' : 'Registered Companies'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold">
                <tr>
                  <th className="p-3 text-start">{isAr ? 'المنشأة' : 'Company'}</th>
                  <th className="p-3 text-start">{isAr ? 'الرقم الضريبي / السجل' : 'VAT / CR'}</th>
                  <th className="p-3 text-start">{isAr ? 'الباقة' : 'Plan'}</th>
                  <th className="p-3 text-end">{isAr ? 'MRR (﷼)' : 'MRR'}</th>
                  <th className="p-3 text-center">{isAr ? 'المستخدمين' : 'Users'}</th>
                  <th className="p-3 text-center">{isAr ? 'الفروع' : 'Branches'}</th>
                  <th className="p-3 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="p-3 text-center">{isAr ? 'إجراءات الإدارة' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCompanies.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{isAr ? c.nameAr : c.nameEn}</div>
                      <span className="font-mono text-[10px] text-slate-400">{c.code}</span>
                    </td>
                    <td className="p-3 text-slate-600 font-mono text-[11px]">
                      <div>{c.vatNumber}</div>
                      <div className="text-[10px] text-slate-400">CR: {c.crNumber}</div>
                    </td>
                    <td className="p-3">
                      <Badge variant="default" size="sm">
                        {c.planCode}
                      </Badge>
                    </td>
                    <td className="p-3 text-end font-mono font-bold text-slate-900">{formatSar(c.mrrSar)}</td>
                    <td className="p-3 text-center font-bold text-slate-700">{c.usersCount}</td>
                    <td className="p-3 text-center font-bold text-slate-700">{c.branchesCount}</td>
                    <td className="p-3 text-center">
                      <Badge variant={c.isSuspended ? 'danger' : 'success'}>
                        {c.isSuspended ? (isAr ? 'موقوف (قراءة فقط)' : 'Suspended') : (isAr ? 'نشط' : 'Active')}
                      </Badge>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {c.isSuspended ? (
                          <button
                            onClick={() => handleRestoreCompany(c.id)}
                            disabled={actionLoading}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 flex items-center gap-1"
                          >
                            <Unlock className="w-3 h-3 text-emerald-600" />
                            <span>{isAr ? 'إعادة تفعيل' : 'Restore'}</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => setSuspendModal({ open: true, company: c })}
                            disabled={actionLoading}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold text-rose-800 bg-rose-50 hover:bg-rose-100 flex items-center gap-1"
                          >
                            <Lock className="w-3 h-3 text-rose-600" />
                            <span>{isAr ? 'إيقاف الحساب' : 'Suspend'}</span>
                          </button>
                        )}

                        <button
                          onClick={() => setGrantModal({ open: true, company: c })}
                          className="px-2 py-1 rounded-lg text-xs font-bold text-indigo-800 bg-indigo-50 hover:bg-indigo-100 flex items-center gap-1"
                          title={isAr ? 'طلب تصريح فحص للدعم الفني' : 'Request Diagnostic Access Grant'}
                        >
                          <Key className="w-3 h-3 text-indigo-600" />
                          <span>{isAr ? 'تصريح فحص' : 'Grant'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. TAB CONTENT: Support Grants */}
      {activeTab === 'grants' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div>
            <h3 className="text-base font-black text-slate-900">
              {isAr ? 'تصاريح الدعم الفني المؤقتة (admin_access_grants)' : 'Time-Boxed Support Access Grants'}
            </h3>
            <p className="text-xs text-slate-500">
              {isAr
                ? 'تصاريح زمنية مشددة تمنح المشرف العام إمكانية فحص السجلات التشغيلية لتشخيص المشاكل فقط'
                : 'Audited grants allowing temporary diagnostic access to tenant operational records'}
            </p>
          </div>

          {grants.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              <Key className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p>{isAr ? 'لا توجد تصاريح دعم فني مسجلة.' : 'No support grants found.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold">
                  <tr>
                    <th className="p-3 text-start">{isAr ? 'المنشأة' : 'Tenant'}</th>
                    <th className="p-3 text-start">{isAr ? 'المشرف الطالب' : 'Super Admin'}</th>
                    <th className="p-3 text-start">{isAr ? 'سبب الوصول المبرر' : 'Justification Reason'}</th>
                    <th className="p-3 text-start">{isAr ? 'تاريخ المنح' : 'Granted At'}</th>
                    <th className="p-3 text-start">{isAr ? 'تاريخ الانتهاء' : 'Expires At'}</th>
                    <th className="p-3 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                    <th className="p-3 text-center">{isAr ? 'الإجراء' : 'Action'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {grants.map((g) => {
                    const isExpired = new Date(g.expiresAt) <= new Date();
                    const isActive = !g.isRevoked && !isExpired;

                    return (
                      <tr key={g.id} className="hover:bg-slate-50/80 transition">
                        <td className="p-3 font-bold text-slate-900">
                          {g.tenantNameAr}
                          <span className="block font-mono text-[10px] text-slate-400">{g.tenantCode}</span>
                        </td>
                        <td className="p-3 text-slate-700">{g.superAdminEmail}</td>
                        <td className="p-3 text-slate-800 max-w-xs truncate" title={g.reason}>
                          {g.reason}
                        </td>
                        <td className="p-3 text-slate-500 font-mono text-[11px]">
                          {new Date(g.grantedAt).toLocaleTimeString()}
                        </td>
                        <td className="p-3 text-slate-500 font-mono text-[11px]">
                          {new Date(g.expiresAt).toLocaleTimeString()}
                        </td>
                        <td className="p-3 text-center">
                          <Badge variant={isActive ? 'success' : g.isRevoked ? 'danger' : 'default'}>
                            {isActive ? (isAr ? 'ساري' : 'ACTIVE') : g.isRevoked ? (isAr ? 'ملغي' : 'REVOKED') : (isAr ? 'منتهي' : 'EXPIRED')}
                          </Badge>
                        </td>
                        <td className="p-3 text-center">
                          {isActive && (
                            <button
                              onClick={() => handleRevokeGrant(g.id)}
                              disabled={actionLoading}
                              className="px-2.5 py-1 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100"
                            >
                              {isAr ? 'إلغاء فوري' : 'Revoke'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 8. TAB CONTENT: Access Audit Logs */}
      {activeTab === 'audit' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div>
            <h3 className="text-base font-black text-slate-900">
              {isAr ? 'سجل رقابة عمليات الدعم الفني (admin_access_logs)' : 'Immutable Support Access Audit Trail'}
            </h3>
            <p className="text-xs text-slate-500">
              {isAr
                ? 'سجل غير قابل للتعديل يوثق كل عملية استعلام قام بها المشرف العام على سجلات المستأجرين'
                : 'Tamper-evident logs of all operational inspection events'}
            </p>
          </div>

          {accessLogs.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p>{isAr ? 'لا توجد سجلات وصول مسجلة بعد.' : 'No access logs recorded yet.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold">
                  <tr>
                    <th className="p-3 text-start">{isAr ? 'الوقت والتاريخ' : 'Timestamp'}</th>
                    <th className="p-3 text-start">{isAr ? 'المشرف' : 'Admin'}</th>
                    <th className="p-3 text-start">{isAr ? 'المنشأة' : 'Tenant ID'}</th>
                    <th className="p-3 text-start">{isAr ? 'العملية' : 'Action'}</th>
                    <th className="p-3 text-start">{isAr ? 'نوع السجل' : 'Resource'}</th>
                    <th className="p-3 text-center">{isAr ? 'معرف التصريح' : 'Grant ID'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {accessLogs.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3 font-mono text-slate-600">
                        {new Date(l.timestamp).toLocaleString(isAr ? 'ar-SA' : 'en-US')}
                      </td>
                      <td className="p-3 font-semibold text-slate-800">{l.superAdminEmail}</td>
                      <td className="p-3 font-mono text-slate-600">{l.tenantId}</td>
                      <td className="p-3 text-emerald-800 font-bold">{l.action}</td>
                      <td className="p-3 text-slate-600">{l.resourceType}</td>
                      <td className="p-3 text-center font-mono text-[10px] text-slate-400">{l.grantId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 9. TAB CONTENT: Diagnostics & Boundary Verification */}
      {activeTab === 'diagnostics' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
          <div>
            <h3 className="text-base font-black text-slate-900">
              {isAr ? 'فحص قيود الخصوصية وحدود البيانات (Privacy Boundary Diagnostics)' : 'Privacy Boundary Diagnostic Test'}
            </h3>
            <p className="text-xs text-slate-500">
              {isAr
                ? 'اختبار آلي مباشر للتحقق من منع المشرف العام من الوصول إلى سجلات المستأجرين بدون تصريح ساري'
                : 'Directly verifies that super admin is strictly blocked without an active support grant'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {companies.slice(0, 4).map((comp) => {
              const activeGrant = grants.find(
                (g) => g.tenantId === comp.id && !g.isRevoked && new Date(g.expiresAt) > new Date()
              );

              return (
                <div key={comp.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs">{comp.nameAr}</h4>
                      <span className="text-[10px] font-mono text-slate-400">{comp.code}</span>
                    </div>
                    <Badge variant={activeGrant ? 'success' : 'default'} size="sm">
                      {activeGrant ? (isAr ? 'مصرح مؤقتاً' : 'GRANT ACTIVE') : (isAr ? 'محظور الوصول' : 'BLOCKED')}
                    </Badge>
                  </div>

                  <div className="text-[11px] text-slate-600">
                    {activeGrant ? (
                      <span className="text-emerald-700 font-semibold">
                        {isAr ? `ينتهي التصريح في: ${new Date(activeGrant.expiresAt).toLocaleTimeString()}` : `Expires: ${new Date(activeGrant.expiresAt).toLocaleTimeString()}`}
                      </span>
                    ) : (
                      <span>{isAr ? 'الوصول محجوب طبقاً لسياسة الخصوصية' : 'Access blocked per privacy policy'}</span>
                    )}
                  </div>

                  <button
                    onClick={() => handleTestInspect(comp.id)}
                    disabled={actionLoading}
                    className="w-full py-1.5 px-3 text-xs font-bold rounded-lg border border-slate-300 bg-white hover:bg-slate-100 flex items-center justify-center gap-1.5 shadow-2xs"
                  >
                    <Eye className="w-3.5 h-3.5 text-slate-600" />
                    <span>{isAr ? 'اختبار استعلام السجلات التشغيلية' : 'Test Operational Query'}</span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Inspection Output Box */}
          {inspectResult && (
            <div
              className={`p-4 rounded-xl border text-xs font-mono ${
                inspectResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-rose-50 border-rose-200 text-rose-950'
              }`}
            >
              <div className="font-bold mb-1 flex items-center gap-2">
                {inspectResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Ban className="w-4 h-4 text-rose-600" />}
                <span>{inspectResult.success ? 'Query Result (Authorized under active grant)' : 'ACCESS FORBIDDEN (403 TENANT_DATA_ACCESS_FORBIDDEN)'}</span>
              </div>
              <pre className="overflow-x-auto p-2 bg-white/60 rounded-lg text-[11px]">
                {JSON.stringify(inspectResult.data || inspectResult.error, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* 10. Suspend Company Modal */}
      {suspendModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-600">
              <Lock className="w-5 h-5" />
              <h3 className="text-base font-black text-slate-900">
                {isAr ? 'إيقاف حساب المنشأة (وضع القراءة فقط)' : 'Suspend Tenant (Read-Only Mode)'}
              </h3>
            </div>
            <p className="text-xs text-slate-600">
              {isAr
                ? `سيتم تحويل حساب ${suspendModal.company?.nameAr} إلى وضع القراءة فقط. سيتم حظر جميع عمليات الإضافة والتعديل تلقائياً، مع استمرار قراءة وتصدير البيانات.`
                : `Company will enter read-only mode. All write operations will be blocked immediately.`}
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {isAr ? 'سبب الإيقاف (مطلوب للرقابة والتدقيق)' : 'Suspension Reason (Required)'}
              </label>
              <textarea
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder={isAr ? 'أدخل سبباً واضحاً للإيقاف...' : 'Enter clear reason...'}
                className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setSuspendModal({ open: false })}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleSuspendCompany}
                disabled={!suspendReason.trim() || actionLoading}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl disabled:opacity-50"
              >
                {isAr ? 'تأكيد الإيقاف' : 'Confirm Suspension'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 11. Support Access Grant Modal */}
      {grantModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-indigo-600">
              <Key className="w-5 h-5" />
              <h3 className="text-base font-black text-slate-900">
                {isAr ? 'إصدار تصريح دعم فني مؤقت' : 'Issue Temporary Support Grant'}
              </h3>
            </div>
            <p className="text-xs text-slate-600">
              {isAr
                ? `طلب إذن استثنائي محدد بالوقت للاطلاع على سجلات ${grantModal.company?.nameAr} لغرض التشخيص والدعم الفني.`
                : `Request time-boxed access to inspect records of ${grantModal.company?.nameEn} for troubleshooting.`}
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {isAr ? 'المبرر الفني (10 أحرف كحد أدنى)' : 'Justification (Min 10 characters)'}
              </label>
              <textarea
                value={grantReason}
                onChange={(e) => setGrantReason(e.target.value)}
                placeholder={isAr ? 'أدخل مبرر فتح السجلات التشغيلية للدعم...' : 'Enter justification reason...'}
                className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                rows={3}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {isAr ? 'مدة التصريح' : 'Duration'}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[15, 30, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setGrantDuration(mins)}
                    className={`py-2 text-xs font-bold rounded-xl border text-center transition ${
                      grantDuration === mins
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {mins} {isAr ? 'دقيقة' : 'mins'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setGrantModal({ open: false })}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleIssueGrant}
                disabled={grantReason.trim().length < 10 || actionLoading}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-50"
              >
                {isAr ? 'منح التصريح' : 'Issue Grant'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

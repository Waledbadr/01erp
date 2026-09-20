import React, { useState, useEffect } from 'react';
import { useI18n } from '../../i18n/context.js';
import { PageHeader } from '../ui/PageHeader.js';
import { Button } from '../ui/Button.js';
import { Input } from '../ui/Input.js';
import { Badge } from '../ui/Badge.js';
import { useToast } from '../ui/Toast.js';
import {
  Users,
  ShieldCheck,
  UserPlus,
  KeyRound,
  Laptop,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Eye,
  EyeOff,
  Clock,
  LogOut,
  Building,
} from 'lucide-react';

interface CompanyUser {
  id: string;
  email: string;
  fullNameAr: string;
  fullNameEn: string;
  role: string;
  branchId?: string;
  isActive: boolean;
  mfaEnabled: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

interface ActiveSession {
  id: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  lastActiveAt: string;
  isCurrent: boolean;
}

export const UsersRbacView: React.FC<{ onNavigate: (route: string) => void }> = ({ onNavigate }) => {
  const { language, isRTL } = useI18n();
  const isAr = language === 'ar';
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'users' | 'roles_matrix' | 'sessions' | 'cost_scrubber_demo'>('users');
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Invite Modal
  const [showInviteModal, setShowInviteModal] = useState<boolean>(false);
  const [inviteEmail, setInviteEmail] = useState<string>('');
  const [inviteFullName, setInviteFullName] = useState<string>('');
  const [inviteRole, setInviteRole] = useState<string>('ACCOUNTANT');
  const [isInviting, setIsInviting] = useState<boolean>(false);

  // Sensitive Cost Scrubber Demo State
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('saudi_erp_session_token');
      const res = await fetch('/api/v1/users', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch {
      // ignore
    }
  };

  const fetchRoles = async () => {
    try {
      const token = localStorage.getItem('saudi_erp_session_token');
      const res = await fetch('/api/v1/users/roles/matrix', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setRoles(data.roles || []);
      }
    } catch {
      // ignore
    }
  };

  const fetchSessions = async () => {
    try {
      const token = localStorage.getItem('saudi_erp_session_token');
      const res = await fetch('/api/v1/auth/sessions', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch {
      // ignore
    }
  };

  const loadAll = async () => {
    setIsLoading(true);
    await Promise.all([fetchUsers(), fetchRoles(), fetchSessions()]);
    setIsLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !inviteRole) return;
    setIsInviting(true);
    try {
      const token = localStorage.getItem('saudi_erp_session_token');
      const res = await fetch('/api/v1/users/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          email: inviteEmail,
          fullNameAr: inviteFullName,
          roleCode: inviteRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || 'فشل إرسال الدعوة');
        return;
      }

      toast.success(data.message || 'تمت دعوة المستخدم بنجاح');
      setShowInviteModal(false);
      setInviteEmail('');
      setInviteFullName('');
      await fetchUsers();
    } catch {
      toast.error('حدث خطأ أثناء إرسال الدعوة');
    } finally {
      setIsInviting(false);
    }
  };

  const handleTerminateOtherSessions = async () => {
    try {
      const token = localStorage.getItem('saudi_erp_session_token');
      const res = await fetch('/api/v1/auth/sessions/terminate-others', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'تم إنهاء الجلسات الأخرى');
        await fetchSessions();
      }
    } catch {
      toast.error('فشل إنهاء الجلسات');
    }
  };

  const handleTestCostScrubber = async () => {
    setPreviewLoading(true);
    try {
      const token = localStorage.getItem('saudi_erp_session_token');
      const res = await fetch('/api/v1/inventory/items/financial-preview', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewData(data.item);
      } else {
        toast.error('فشل جلب بيانات المنتج');
      }
    } catch {
      toast.error('خطأ في الاتصال');
    } finally {
      setPreviewLoading(false);
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'OWNER':
        return 'primary';
      case 'CHIEF_ACCOUNTANT':
        return 'success';
      case 'ACCOUNTANT':
        return 'info';
      case 'SALES_MGR':
        return 'warning';
      case 'PURCHASES_MGR':
        return 'secondary';
      default:
        return 'neutral';
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <PageHeader
        title={isAr ? 'إدارة المستخدمين والأمان ومصفوفة الصلاحيات (RBAC)' : 'Users, Security & RBAC Matrix'}
        subtitle={
          isAr
            ? 'فصل الصلاحيات، حماية بيانات التكاليف والهوامش، وإدارة الجلسات وسجلات التدقيق'
            : 'Separation of duties, cost/margin sensitive data protection, sessions and audit control'
        }
        badge={<Badge variant="success">Phase 01 Active</Badge>}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('/company-wizard')}
              startIcon={<Building className="w-4 h-4" />}
            >
              {isAr ? 'معالج المنشأة' : 'Company Wizard'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowInviteModal(true)}
              startIcon={<UserPlus className="w-4 h-4" />}
            >
              {isAr ? 'دعوة مستخدم جديد' : 'Invite User'}
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-bold overflow-x-auto">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-3 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
            activeTab === 'users'
              ? 'bg-emerald-700 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>{isAr ? `فريق العمل والمستخدمين (${users.length})` : `Users (${users.length})`}</span>
        </button>

        <button
          onClick={() => setActiveTab('roles_matrix')}
          className={`px-3 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
            activeTab === 'roles_matrix'
              ? 'bg-emerald-700 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>{isAr ? 'مصفوفة الصلاحيات والأدوار القياسية' : 'Roles & Permissions Matrix'}</span>
        </button>

        <button
          onClick={() => setActiveTab('cost_scrubber_demo')}
          className={`px-3 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
            activeTab === 'cost_scrubber_demo'
              ? 'bg-emerald-700 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <EyeOff className="w-4 h-4" />
          <span>{isAr ? 'فحص حجب التكاليف والهوامش (Rule C)' : 'Cost Scrubber Live Tester'}</span>
        </button>

        <button
          onClick={() => setActiveTab('sessions')}
          className={`px-3 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
            activeTab === 'sessions'
              ? 'bg-emerald-700 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Laptop className="w-4 h-4" />
          <span>{isAr ? `الجلسات النشطة (${sessions.length})` : `Active Sessions (${sessions.length})`}</span>
        </button>
      </div>

      {/* TAB 1: USERS LIST */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center text-xs">
            <span className="font-bold text-slate-800">
              {isAr ? 'قائمة أعضاء المنشأة ومستويات الوصول المعتمدة' : 'Active Company Members'}
            </span>
            <Button variant="outline" size="sm" onClick={fetchUsers} startIcon={<RefreshCw className="w-3.5 h-3.5" />}>
              {isAr ? 'تحديث' : 'Refresh'}
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3 text-start">{isAr ? 'المستخدم' : 'User'}</th>
                  <th className="p-3 text-start">{isAr ? 'البريد الإلكتروني' : 'Email'}</th>
                  <th className="p-3 text-start">{isAr ? 'الدور الوظيفي' : 'Role'}</th>
                  <th className="p-3 text-start">{isAr ? 'التحقق بخطوتين (MFA)' : '2FA Status'}</th>
                  <th className="p-3 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="p-3 text-start">{isAr ? 'آخر دخول' : 'Last Login'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-semibold text-slate-900">
                      {u.fullNameAr || u.fullNameEn}
                    </td>
                    <td className="p-3 font-mono text-slate-600">{u.email}</td>
                    <td className="p-3">
                      <Badge variant={getRoleBadgeVariant(u.role) as any}>{u.role}</Badge>
                    </td>
                    <td className="p-3">
                      {u.mfaEnabled ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{isAr ? 'مفعل' : 'Enabled'}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">{isAr ? 'غير مفعل' : 'Disabled'}</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800">
                        {isAr ? 'نشط' : 'Active'}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500 font-mono text-[11px]">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('ar-SA') : isAr ? 'لم يسجل بعد' : 'Never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: ROLES & PERMISSIONS MATRIX */}
      {activeTab === 'roles_matrix' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">مصفوفة الصلاحيات القياسية المعتمدة في النظام</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              كل دور وظيفي يمتلك مجموعة صلاحيات محددة بدقة تمنع التجاوز أو الاطلاع غير المصرح به.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {roles.map((r) => (
              <div key={r.code} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-900">{r.nameAr}</span>
                  <Badge variant={getRoleBadgeVariant(r.code) as any}>{r.code}</Badge>
                </div>
                <p className="text-[11px] text-slate-500">{r.descriptionAr}</p>
                <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">عدد الصلاحيات الممنوحة:</span>
                  <span className="font-mono font-bold text-emerald-800">{r.permissions.length}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: SENSITIVE COST SCRUBBER LIVE TESTER */}
      {activeTab === 'cost_scrubber_demo' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <EyeOff className="w-5 h-5 text-emerald-700" />
              <span>فحص الحجب الصارم لبيانات التكلفة والهامش (Financial Scrubber - Rule C)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              الأدوار غير المخولة (مثل مسؤول المبيعات والكاشير) يتم حجب حقول التكلفة والأرباح منها على مستوى خادم الـ API تماماً وليس مجرد إخفاء في واجهة المستخدم.
            </p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-700 font-semibold">
                طلب بيانات المنتج مع التكاليف من مسار الخادم: <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-emerald-800">GET /api/v1/inventory/items/financial-preview</code>
              </span>
              <Button
                variant="primary"
                size="sm"
                onClick={handleTestCostScrubber}
                isLoading={previewLoading}
                startIcon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                تنفيذ استعلام الـ API
              </Button>
            </div>

            {previewData && (
              <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3 mt-3">
                <div className="text-xs font-bold text-slate-800">
                  استجابة الـ API الفعلية المستلمة:
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">اسم الصنف:</span>
                    <span className="font-bold text-slate-900">{previewData.nameAr}</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">سعر البيع:</span>
                    <span className="font-mono font-bold text-slate-900">{previewData.sellingPrice} ﷼</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">تكلفة الشراء (Cost):</span>
                    {previewData.cost !== undefined ? (
                      <span className="font-mono font-bold text-emerald-700">{previewData.cost} ﷼ (متاح للمصرح لهم)</span>
                    ) : (
                      <span className="font-bold text-red-600 flex items-center gap-1 text-[11px]">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>محجوب تماماً من الـ API</span>
                      </span>
                    )}
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">هامش الربح (Margin):</span>
                    {previewData.margin !== undefined ? (
                      <span className="font-mono font-bold text-emerald-700">{previewData.margin} ﷼ ({previewData.marginPercentage}%)</span>
                    ) : (
                      <span className="font-bold text-red-600 flex items-center gap-1 text-[11px]">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>محجوب تماماً من الـ API</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-2 text-[11px] text-slate-500 font-mono bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto">
                  {JSON.stringify(previewData, null, 2)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: SESSIONS MANAGEMENT */}
      {activeTab === 'sessions' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">إدارة الجلسات النشطة والأجهزة</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                يمكنك الاطلاع على كافة الأجهزة المسجلة لحسابك وإنهاء أي جلسات غير مرغوب فيها.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTerminateOtherSessions}
              startIcon={<LogOut className="w-3.5 h-3.5" />}
            >
              {isAr ? 'إنهاء كافة الجلسات الأخرى' : 'Terminate Other Sessions'}
            </Button>
          </div>

          <div className="space-y-3">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                    <Laptop className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 flex items-center gap-2">
                      <span>{s.userAgent.split(' ')[0] || 'Unknown Browser'}</span>
                      {s.isCurrent && (
                        <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded text-[10px]">
                          {isAr ? 'هذه الجلسة الحالية' : 'Current'}
                        </span>
                      )}
                    </div>
                    <span className="text-slate-500 font-mono text-[11px]">IP: {s.ipAddress}</span>
                  </div>
                </div>
                <div className="text-slate-400 font-mono text-[11px]">
                  {new Date(s.lastActiveAt).toLocaleTimeString('ar-SA')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-2xl p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <h3 className="text-base font-bold text-slate-900 mb-1">دعوة عضو جديد لفريق المنشأة</h3>
            <p className="text-xs text-slate-500 mb-4">
              سيتم إنشاء حساب للمستخدم وتعيين الدور والصلاحيات المحددة فوراً.
            </p>

            <form onSubmit={handleInviteUser} className="space-y-3">
              <Input
                label="البريد الإلكتروني"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.sa"
                required
              />
              <Input
                label="الاسم الكامل"
                value={inviteFullName}
                onChange={(e) => setInviteFullName(e.target.value)}
                placeholder="سعد بن خالد"
              />
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">الدور الوظيفي والصلاحيات</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="ACCOUNTANT">محاسب عام (Accountant)</option>
                  <option value="CHIEF_ACCOUNTANT">رئيس حسابات (Chief Accountant)</option>
                  <option value="SALES_MGR">مسؤول مبيعات (Sales Manager - محجوب عن التكاليف)</option>
                  <option value="PURCHASES_MGR">مسؤول مشتريات (Purchases Manager)</option>
                  <option value="CASHIER">كاشير ونقاط بيع (Cashier - محجوب عن التكاليف)</option>
                  <option value="AUDITOR">مراجع خارجي / مشاهد (Auditor / Read-only)</option>
                </select>
              </div>

              <div className="flex gap-2 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setShowInviteModal(false)}
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  className="flex-1"
                  isLoading={isInviting}
                >
                  إرسال الدعوة وتفعيل
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

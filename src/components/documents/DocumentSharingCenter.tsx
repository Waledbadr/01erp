import React, { useState, useEffect } from 'react';
import {
  EmailSettings,
  EmailIdentity,
  SharingQueueItem,
  SecureLink,
  fetchEmailSettings,
  updateEmailSettings,
  testSmtpConnection,
  fetchShareQueue,
  retryQueueItem,
  fetchSecureLinks,
  revokeSecureLink,
} from '../../lib/documents.js';
import { Button } from '../ui/Button.js';
import { Badge } from '../ui/Badge.js';
import { useToast } from '../ui/Toast.js';
import {
  Mail,
  Send,
  Link,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Shield,
  ExternalLink,
  Copy,
  Sliders,
  Sparkles,
} from 'lucide-react';

export const DocumentSharingCenter: React.FC = () => {
  const { success: showSuccess, error: showError, info: showInfo } = useToast();

  const [activeTab, setActiveTab] = useState<'queue' | 'email_settings' | 'links'>('queue');
  const [loading, setLoading] = useState(true);
  const [queueItems, setQueueItems] = useState<SharingQueueItem[]>([]);
  const [emailSettings, setEmailSettings] = useState<EmailSettings | null>(null);
  const [secureLinks, setSecureLinks] = useState<SecureLink[]>([]);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latencyMs: number } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [queue, email, links] = await Promise.all([
        fetchShareQueue(),
        fetchEmailSettings(),
        fetchSecureLinks(),
      ]);
      setQueueItems(queue);
      setEmailSettings(email);
      setSecureLinks(links);
    } catch (err: any) {
      showError(err.message || 'خطأ في تحميل بيانات مركز المشاركة');
    } finally {
      setLoading(false);
    }
  };

  const handleTestSmtp = async () => {
    setTestingSmtp(true);
    setTestResult(null);
    try {
      const res = await testSmtpConnection();
      setTestResult(res);
      if (res.success) {
        showSuccess('تم اختبار الاتصال بخادم البريد بنجاح');
      } else {
        showError(res.message);
      }
    } catch (err: any) {
      showError(err.message || 'فشل الاتصال بخادم البريد');
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleSaveEmailSettings = async () => {
    if (!emailSettings) return;
    try {
      const updated = await updateEmailSettings(emailSettings);
      setEmailSettings(updated);
      showSuccess('تم حفظ إعدادات البريد الإلكتروني بنجاح');
    } catch (err: any) {
      showError(err.message || 'فشل حفظ الإعدادات');
    }
  };

  const handleRetryItem = async (id: string) => {
    try {
      await retryQueueItem(id);
      const queue = await fetchShareQueue();
      setQueueItems(queue);
      showSuccess('تمت إعادة إدراج الرسالة في طابور الإرسال');
    } catch (err: any) {
      showError(err.message || 'فشلت إعادة الإرسال');
    }
  };

  const handleRevokeLink = async (token: string) => {
    try {
      await revokeSecureLink(token);
      setSecureLinks((prev) =>
        prev.map((l) => (l.token === token ? { ...l, isRevoked: true } : l))
      );
      showInfo('تم إلغاء صلاحية الرابط بنجاح');
    } catch (err: any) {
      showError(err.message || 'فشل إلغاء الرابط');
    }
  };

  if (loading || !emailSettings) {
    return (
      <div className="p-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
        <p className="animate-pulse font-medium">جاري تحميل مركز المشاركة وطابور الإرسال...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-900">مركز المشاركة والإرسال السحابي</h2>
            <p className="text-xs text-slate-500">
              إدارة طابور إرسال الفواتير، إعدادات خادم SMTP، هويات الإرسال، والروابط المشفرة الآمنة
            </p>
          </div>
        </div>

        {/* Tab Selectors */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === 'queue' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-4 h-4" />
            طابور الإرسال ({queueItems.length})
          </button>
          <button
            onClick={() => setActiveTab('email_settings')}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === 'email_settings' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Mail className="w-4 h-4" />
            إعدادات البريد و SMTP
          </button>
          <button
            onClick={() => setActiveTab('links')}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === 'links' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Link className="w-4 h-4" />
            الروابط الآمنة ({secureLinks.length})
          </button>
        </div>
      </div>

      {/* 1. TAB: QUEUE */}
      {activeTab === 'queue' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-extrabold text-sm text-slate-900">طابور إرسال المستندات (Send Queue)</h3>
            <Button variant="secondary" size="sm" onClick={loadData}>
              <RefreshCw className="w-3.5 h-3.5 me-1.5" />
              تحديث الطابور
            </Button>
          </div>

          {queueItems.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Send className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p>لا توجد مهام إرسال حالياً في الطابور.</p>
            </div>
          ) : (
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                <tr>
                  <th className="py-3 px-4 text-start">المستند</th>
                  <th className="py-3 px-4 text-start">القناة</th>
                  <th className="py-3 px-4 text-start">المستلم</th>
                  <th className="py-3 px-4 text-start">الحالة</th>
                  <th className="py-3 px-4 text-start">المحاولات</th>
                  <th className="py-3 px-4 text-start">التاريخ</th>
                  <th className="py-3 px-4 text-end">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {queueItems.map((q) => (
                  <tr key={q.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {q.documentNumber}
                      <span className="block text-[10px] text-slate-400 font-normal">{q.documentType}</span>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800">{q.channel}</td>
                    <td className="py-3 px-4 text-slate-600 font-mono">{q.recipient}</td>
                    <td className="py-3 px-4">
                      {q.status === 'SENT' && <Badge variant="success" size="sm">تم الإرسال</Badge>}
                      {q.status === 'QUEUED' && <Badge variant="default" size="sm">في الانتظار</Badge>}
                      {q.status === 'SENDING' && <Badge variant="brand" size="sm">جاري الإرسال...</Badge>}
                      {q.status === 'FAILED' && <Badge variant="danger" size="sm">فشل</Badge>}
                    </td>
                    <td className="py-3 px-4 font-mono">{q.attempts}/{q.maxRetries}</td>
                    <td className="py-3 px-4 text-slate-500">
                      {new Date(q.createdAt).toLocaleString('ar-SA')}
                    </td>
                    <td className="py-3 px-4 text-end">
                      {q.status === 'FAILED' && (
                        <Button variant="secondary" size="sm" onClick={() => handleRetryItem(q.id)}>
                          <RefreshCw className="w-3 h-3 me-1" />
                          إعادة
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 2. TAB: EMAIL SETTINGS & SMTP */}
      {activeTab === 'email_settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-4 text-xs">
            <h3 className="text-sm font-extrabold text-slate-900 pb-2 border-b border-slate-200">
              إعدادات خادم البريد الرسمي (SMTP Configuration)
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">خادم البريد (SMTP Host):</label>
                <input
                  type="text"
                  value={emailSettings.smtpHost}
                  onChange={(e) => setEmailSettings({ ...emailSettings, smtpHost: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 py-2 px-3 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">المنفذ (SMTP Port):</label>
                <input
                  type="number"
                  value={emailSettings.smtpPort}
                  onChange={(e) => setEmailSettings({ ...emailSettings, smtpPort: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-300 py-2 px-3 text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">اسم المستخدم (Username):</label>
                <input
                  type="text"
                  value={emailSettings.username}
                  onChange={(e) => setEmailSettings({ ...emailSettings, username: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 py-2 px-3 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">كلمة المرور (مشفرة ومحمية):</label>
                <input
                  type="password"
                  value={emailSettings.passwordMasked}
                  onChange={(e) => setEmailSettings({ ...emailSettings, passwordMasked: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 py-2 px-3 text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">اسم المُرسل الافتراضي (From Name):</label>
                <input
                  type="text"
                  value={emailSettings.fromName}
                  onChange={(e) => setEmailSettings({ ...emailSettings, fromName: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 py-2 px-3 text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">بريد الرد (Reply-To):</label>
                <input
                  type="email"
                  value={emailSettings.replyTo || ''}
                  onChange={(e) => setEmailSettings({ ...emailSettings, replyTo: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 py-2 px-3 text-xs font-mono"
                />
              </div>
            </div>

            {/* Test connection alert */}
            {testResult && (
              <div className={`p-3 rounded-lg border flex items-center gap-2 ${
                testResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}>
                {testResult.success ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <XCircle className="w-5 h-5 text-rose-600" />}
                <div className="text-xs">
                  <p className="font-bold">{testResult.message}</p>
                  <p className="text-[10px] text-slate-500">زمن الاستجابة: {testResult.latencyMs} ملي ثانية</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-slate-200">
              <Button variant="secondary" size="md" onClick={handleTestSmtp} disabled={testingSmtp}>
                <Send className="w-4 h-4 me-1.5" />
                {testingSmtp ? 'جاري فحص الاتصال...' : 'فحص الاتصال بخادم البريد (Test Connection)'}
              </Button>

              <Button variant="primary" size="md" onClick={handleSaveEmailSettings}>
                حفظ إعدادات SMTP
              </Button>
            </div>
          </div>

          {/* Right Col: Multiple Email Identities */}
          <div className="lg:col-span-4 bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-4 text-xs">
            <h3 className="text-sm font-extrabold text-slate-900 pb-2 border-b border-slate-200">
              هويات الإرسال المعتمدة (Email Identities)
            </h3>
            <p className="text-slate-500 text-[11px]">
              يمكن للمستخدم اختيار الهوية المناسبة عند إرسال الفاتورة (مثل: الفواتير، المبيعات، الإدارة)
            </p>

            <div className="space-y-2">
              {emailSettings.identities.map((id) => (
                <div key={id.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">{id.name}</span>
                    {id.isDefault && <Badge variant="success" size="sm">افتراضي</Badge>}
                  </div>
                  <p className="font-mono text-slate-600">{id.email}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. TAB: SECURE LINKS */}
      {activeTab === 'links' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">سجل الروابط المشفرة الصادرة (Active Secure Links)</h3>
              <p className="text-xs text-slate-500">
                روابط مشفرة آمنة تم إنشاؤها لمشاركة الفواتير والمستندات مع العملاء
              </p>
            </div>
          </div>

          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
              <tr>
                <th className="py-3 px-4 text-start">المستند</th>
                <th className="py-3 px-4 text-start">رمز الرابط المشفر</th>
                <th className="py-3 px-4 text-start">الحالة</th>
                <th className="py-3 px-4 text-start">عدد المشاهدات</th>
                <th className="py-3 px-4 text-start">تاريخ الإنشاء</th>
                <th className="py-3 px-4 text-start">تاريخ الانتهاء</th>
                <th className="py-3 px-4 text-end">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {secureLinks.map((lnk) => (
                <tr key={lnk.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono font-bold text-slate-900">
                    {lnk.documentNumber}
                    <span className="block text-[10px] text-slate-400 font-normal">{lnk.documentType}</span>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-600">
                    ...{lnk.token.slice(0, 14)}
                  </td>
                  <td className="py-3 px-4">
                    {lnk.isRevoked ? (
                      <Badge variant="danger" size="sm">ملغي</Badge>
                    ) : new Date(lnk.expiresAt).getTime() < Date.now() ? (
                      <Badge variant="warning" size="sm">منتهي</Badge>
                    ) : (
                      <Badge variant="success" size="sm">نشط</Badge>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-slate-800">{lnk.viewsCount}</td>
                  <td className="py-3 px-4 text-slate-500">
                    {new Date(lnk.createdAt).toLocaleDateString('ar-SA')}
                  </td>
                  <td className="py-3 px-4 text-slate-500">
                    {new Date(lnk.expiresAt).toLocaleDateString('ar-SA')}
                  </td>
                  <td className="py-3 px-4 text-end">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          const full = `${window.location.origin}/view-doc/${lnk.token}`;
                          navigator.clipboard.writeText(full);
                          showSuccess('تم نسخ الرابط المشفر');
                        }}
                        className="p-1.5 rounded border border-slate-300 hover:bg-slate-100 text-slate-600"
                        title="نسخ الرابط"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      {!lnk.isRevoked && (
                        <button
                          onClick={() => handleRevokeLink(lnk.token)}
                          className="px-2 py-1 text-[11px] rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold hover:bg-rose-100"
                        >
                          إلغاء الصلاحية
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

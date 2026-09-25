/**
 * Notification Center Master View — Saudi ERP Platform
 * Section A: Notification Center
 * - Typed events, priority levels, read/unread, mark-all-read
 * - Per-user preferences (which types, which channels) with suppression
 * - Deep links to source
 * - Push notification adapter status & architecture
 */

import React, { useState, useEffect } from 'react';
import {
  Bell,
  CheckCheck,
  Trash2,
  Filter,
  Search,
  Settings2,
  Radio,
  ExternalLink,
  ShieldAlert,
  AlertTriangle,
  Info,
  CheckCircle2,
  Clock,
  Sparkles,
  Volume2,
  Moon,
  Smartphone,
  Mail,
  Send,
} from 'lucide-react';
import {
  NotificationItem,
  NotificationEventType,
  NotificationPriority,
  UserNotificationPreferences,
  PushAdapterStatus,
  NotificationAPI,
  getPriorityBadge,
} from '../../lib/notifications.js';
import { useI18n } from '../../i18n/context.js';
import { Badge } from '../ui/Badge.js';
import { Button } from '../ui/Button.js';
import { Modal } from '../ui/Modal.js';
import { useToast } from '../ui/Toast.js';

interface NotificationCenterViewProps {
  onNavigate?: (route: string) => void;
  initialTab?: 'notifications' | 'preferences' | 'push';
}

export const NotificationCenterView: React.FC<NotificationCenterViewProps> = ({
  onNavigate,
  initialTab = 'notifications',
}) => {
  const { language } = useI18n();
  const isAr = language === 'ar';
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'notifications' | 'preferences' | 'push'>(initialTab);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [filterPriority, setFilterPriority] = useState<string>('ALL');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterRead, setFilterRead] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Preferences
  const [preferences, setPreferences] = useState<UserNotificationPreferences | null>(null);
  const [savingPrefs, setSavingPrefs] = useState<boolean>(false);

  // Push Status
  const [pushStatus, setPushStatus] = useState<PushAdapterStatus | null>(null);

  // Test Trigger Modal
  const [showTestModal, setShowTestModal] = useState<boolean>(false);
  const [testEventType, setTestEventType] = useState<NotificationEventType>('invoice_posted');
  const [testPriority, setTestPriority] = useState<NotificationPriority>('LOW');
  const [triggering, setTriggering] = useState<boolean>(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const notifsRes = await NotificationAPI.getNotifications();
      setNotifications(notifsRes.notifications);
      setUnreadCount(notifsRes.unreadCount);

      const prefsRes = await NotificationAPI.getPreferences();
      setPreferences(prefsRes);

      const pushRes = await NotificationAPI.getPushStatus();
      setPushStatus(pushRes);
    } catch (err: any) {
      showToast({ title: isAr ? 'خطأ' : 'Error', message: err.message, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await NotificationAPI.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err: any) {
      showToast({ title: isAr ? 'خطأ' : 'Error', message: err.message, variant: 'error' });
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const count = await NotificationAPI.markAllAsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read: true, readAt: new Date().toISOString() }))
      );
      setUnreadCount(0);
      showToast({
        title: isAr ? 'تم بنجاح' : 'Success',
        message: isAr ? `تم تعيين ${count} إشعار كمقروء` : `Marked ${count} notifications as read`,
        variant: 'success',
      });
    } catch (err: any) {
      showToast({ title: isAr ? 'خطأ' : 'Error', message: err.message, variant: 'error' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await NotificationAPI.deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      showToast({
        title: isAr ? 'تم الحذف' : 'Deleted',
        message: isAr ? 'تم حذف الإشعار بنجاح' : 'Notification deleted',
        variant: 'info',
      });
    } catch (err: any) {
      showToast({ title: isAr ? 'خطأ' : 'Error', message: err.message, variant: 'error' });
    }
  };

  const handleClearRead = async () => {
    try {
      const cleared = await NotificationAPI.clearRead();
      setNotifications((prev) => prev.filter((n) => !n.read));
      showToast({
        title: isAr ? 'تم التنظيف' : 'Cleared',
        message: isAr ? `تم مسح ${cleared} إشعار مقروء` : `Cleared ${cleared} read notifications`,
        variant: 'info',
      });
    } catch (err: any) {
      showToast({ title: isAr ? 'خطأ' : 'Error', message: err.message, variant: 'error' });
    }
  };

  const handleSavePreferences = async () => {
    if (!preferences) return;
    setSavingPrefs(true);
    try {
      const updated = await NotificationAPI.updatePreferences(preferences);
      setPreferences(updated);
      showToast({
        title: isAr ? 'تم الحفظ' : 'Saved',
        message: isAr ? 'تم تحديث تفضيلات الإشعارات بنجاح' : 'Notification preferences saved successfully',
        variant: 'success',
      });
    } catch (err: any) {
      showToast({ title: isAr ? 'خطأ' : 'Error', message: err.message, variant: 'error' });
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleTriggerTest = async () => {
    setTriggering(true);
    try {
      const res = await NotificationAPI.triggerTestEvent({
        type: testEventType,
        priority: testPriority,
      });

      if (res.suppressed) {
        showToast({
          title: isAr ? 'تم حجب الإشعار' : 'Notification Suppressed',
          message: isAr
            ? `تم حجب الإشعار بناءً على تفضيلاتك لهذا النوع [${testEventType}]`
            : `Suppressed per user preferences for type [${testEventType}]`,
          variant: 'warning',
        });
      } else {
        showToast({
          title: isAr ? 'تم إطلاق الإشعار' : 'Event Dispatched',
          message: isAr ? `تم إرسال إشعار [${testEventType}] بنجاح` : `Triggered [${testEventType}] successfully`,
          variant: 'success',
        });
        if (res.notification) {
          setNotifications((prev) => [res.notification!, ...prev]);
          setUnreadCount((c) => c + 1);
        }
      }
      setShowTestModal(false);
    } catch (err: any) {
      showToast({ title: isAr ? 'خطأ' : 'Error', message: err.message, variant: 'error' });
    } finally {
      setTriggering(false);
    }
  };

  const handleDeepLinkClick = (deepLink?: { path: string; params?: Record<string, any> }) => {
    if (!deepLink || !onNavigate) return;
    onNavigate(deepLink.path);
  };

  // Filtered list
  const filteredNotifications = notifications.filter((n) => {
    if (filterPriority !== 'ALL' && n.priority !== filterPriority) return false;
    if (filterType !== 'ALL' && n.type !== filterType) return false;
    if (filterRead === 'UNREAD' && n.read) return false;
    if (filterRead === 'READ' && !n.read) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchAr = n.titleAr.toLowerCase().includes(q) || n.messageAr.toLowerCase().includes(q);
      const matchEn = n.titleEn.toLowerCase().includes(q) || n.messageEn.toLowerCase().includes(q);
      if (!matchAr && !matchEn) return false;
    }
    return true;
  });

  const allEventTypes: Array<{ type: NotificationEventType; labelAr: string; labelEn: string; defaultPriority: NotificationPriority }> = [
    { type: 'invoice_posted', labelAr: 'ترحيل فاتورة مبيعات', labelEn: 'Sales Invoice Posted', defaultPriority: 'LOW' },
    { type: 'invoice_paid', labelAr: 'سداد كامل لفاتورة', labelEn: 'Invoice Fully Paid', defaultPriority: 'LOW' },
    { type: 'payment_received', labelAr: 'استلام دفعة / سند قبض', labelEn: 'Payment Received', defaultPriority: 'LOW' },
    { type: 'purchase_created', labelAr: 'حركة مشتريات وتوريد', labelEn: 'Purchase Movement', defaultPriority: 'MEDIUM' },
    { type: 'purchase_bill_posted', labelAr: 'ترحيل فاتورة مشتريات', labelEn: 'Purchase Bill Posted', defaultPriority: 'MEDIUM' },
    { type: 'goods_received', labelAr: 'استلام بضائع بالمستودع', labelEn: 'Goods Receipt Note', defaultPriority: 'MEDIUM' },
    { type: 'expense_approved', labelAr: 'اعتماد سند صرف مصروفات', labelEn: 'Expense Approved', defaultPriority: 'MEDIUM' },
    { type: 'low_stock', labelAr: 'تنبيه انخفاض رصيد المخزون', labelEn: 'Low Stock Alert', defaultPriority: 'HIGH' },
    { type: 'negative_stock', labelAr: 'تحذير حرج: مخزون سالب', labelEn: 'Negative Stock Warning', defaultPriority: 'CRITICAL' },
    { type: 'due_soon', labelAr: 'فاتورة تقترب من الاستحقاق', labelEn: 'Invoice Due Soon', defaultPriority: 'MEDIUM' },
    { type: 'overdue', labelAr: 'تنبيه: فاتورة متأخرة السداد', labelEn: 'Overdue Invoice', defaultPriority: 'HIGH' },
    { type: 'zatca_failure', labelAr: 'فشل اعتماد فاتورة زاتكا', labelEn: 'ZATCA Clearance Failure', defaultPriority: 'CRITICAL' },
    { type: 'backup_failure', labelAr: 'فشل النسخ الاحتياطي الآلي', labelEn: 'Automated Backup Failed', defaultPriority: 'CRITICAL' },
    { type: 'delivery_failure', labelAr: 'فشل تسليم بريد / ويبهوك', labelEn: 'Email Delivery Failure', defaultPriority: 'HIGH' },
    { type: 'approval_requested', labelAr: 'طلب اعتماد بانتظار الموافقة', labelEn: 'Approval Requested', defaultPriority: 'HIGH' },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-2xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-700 text-white flex items-center justify-center shadow-md">
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  {isAr ? 'الإشعارات' : 'Notifications'}
                </h1>
                {unreadCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-600 text-white shadow-xs animate-pulse">
                    {unreadCount} {isAr ? 'جديد' : 'new'}
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                {isAr
                  ? 'إدارة التنبيهات المجدولة والحية، الفواتير المستحقة، اعتماد زاتكا، وتفضيلات القنوات (المرحلة 13/14)'
                  : 'Manage real-time lifecycle alerts, overdue invoices, ZATCA status, and delivery preferences'}
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTestModal(true)}
              className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
            >
              <Sparkles className="w-4 h-4 me-1.5 text-emerald-600" />
              {isAr ? 'تجربة إطلاق حدث' : 'Test Trigger Event'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllAsRead}
              disabled={unreadCount === 0}
            >
              <CheckCheck className="w-4 h-4 me-1.5 text-slate-600" />
              {isAr ? 'تحديد الكل كمقروء' : 'Mark All Read'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearRead}
              className="text-slate-500 hover:text-slate-800"
            >
              <Trash2 className="w-4 h-4 me-1.5" />
              {isAr ? 'مسح المقروء' : 'Clear Read'}
            </Button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-200 mt-6 pt-2">
          <button
            onClick={() => setActiveTab('notifications')}
            className={`pb-3 px-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'notifications'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>{isAr ? 'سجل الإشعارات' : 'All Notifications'}</span>
            <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-700">
              {notifications.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('preferences')}
            className={`pb-3 px-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'preferences'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Settings2 className="w-4 h-4" />
            <span>{isAr ? 'تفضيلات وقنوات الإرسال' : 'Preferences & Channels'}</span>
          </button>

          <button
            onClick={() => setActiveTab('push')}
            className={`pb-3 px-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'push'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>{isAr ? 'محول إشعارات الدفع (Push)' : 'Push Adapter'}</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                pushStatus?.status === 'CONFIGURED'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {pushStatus?.status || 'NOT_CONFIGURED'}
            </span>
          </button>
        </div>
      </div>

      {/* ========================================== */}
      {/* TAB 1: NOTIFICATIONS LIST */}
      {/* ========================================== */}
      {activeTab === 'notifications' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search */}
              <div className="relative min-w-[200px] sm:min-w-[240px]">
                <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder={isAr ? 'بحث في الإشعارات...' : 'Search alerts...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full ps-9 pe-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Priority Filter */}
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value)}
                  className="text-xs py-1.5 px-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="ALL">{isAr ? 'جميع الأولويات' : 'All Priorities'}</option>
                  <option value="CRITICAL">{isAr ? 'حرج جداً (Critical)' : 'Critical'}</option>
                  <option value="HIGH">{isAr ? 'أولوية عالية (High)' : 'High Priority'}</option>
                  <option value="MEDIUM">{isAr ? 'متوسطة (Medium)' : 'Medium'}</option>
                  <option value="LOW">{isAr ? 'معلومات (Low)' : 'Low'}</option>
                </select>
              </div>

              {/* Event Type Filter */}
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="text-xs py-1.5 px-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="ALL">{isAr ? 'جميع الأحداث' : 'All Events'}</option>
                {allEventTypes.map((et) => (
                  <option key={et.type} value={et.type}>
                    {isAr ? et.labelAr : et.labelEn}
                  </option>
                ))}
              </select>

              {/* Read/Unread Filter */}
              <select
                value={filterRead}
                onChange={(e) => setFilterRead(e.target.value)}
                className="text-xs py-1.5 px-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="ALL">{isAr ? 'الكل (مقروء وغير مقروء)' : 'All (Read & Unread)'}</option>
                <option value="UNREAD">{isAr ? 'غير مقروء فقط' : 'Unread Only'}</option>
                <option value="READ">{isAr ? 'مقروء فقط' : 'Read Only'}</option>
              </select>
            </div>

            <div className="text-xs text-slate-500 font-semibold">
              {isAr ? `النتائج: ${filteredNotifications.length}` : `Count: ${filteredNotifications.length}`}
            </div>
          </div>

          {/* List Items */}
          {loading ? (
            <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
              <Clock className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
              <p className="text-xs font-bold">{isAr ? 'جاري تحميل الإشعارات...' : 'Loading alerts...'}</p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">
                {isAr ? 'لا توجد إشعارات تطابق شروط البحث' : 'No notifications match your filter'}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {isAr ? 'صندوق الوارد نظيف ومحدث' : 'Your alert inbox is completely up to date'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredNotifications.map((notif) => {
                const priorityBadge = getPriorityBadge(notif.priority);
                const isUnread = !notif.read;

                return (
                  <div
                    key={notif.id}
                    className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                      isUnread
                        ? 'bg-white border-emerald-200/80 shadow-xs ring-1 ring-emerald-500/10'
                        : 'bg-slate-50/70 border-slate-200 opacity-90'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3.5">
                        {/* Icon based on priority */}
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            notif.priority === 'CRITICAL'
                              ? 'bg-rose-100 text-rose-700'
                              : notif.priority === 'HIGH'
                              ? 'bg-amber-100 text-amber-700'
                              : notif.priority === 'MEDIUM'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {notif.priority === 'CRITICAL' ? (
                            <ShieldAlert className="w-5 h-5" />
                          ) : notif.priority === 'HIGH' ? (
                            <AlertTriangle className="w-5 h-5" />
                          ) : (
                            <Info className="w-5 h-5" />
                          )}
                        </div>

                        {/* Text & Content */}
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${priorityBadge.className}`}
                            >
                              {isAr ? priorityBadge.labelAr : priorityBadge.labelEn}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600">
                              {notif.type}
                            </span>
                            {isUnread && (
                              <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
                            )}
                            <span className="text-[11px] text-slate-400">
                              {new Date(notif.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}{' '}
                              • {new Date(notif.createdAt).toLocaleDateString()}
                            </span>
                          </div>

                          <h4 className="text-sm font-bold text-slate-900 pt-0.5">
                            {isAr ? notif.titleAr : notif.titleEn}
                          </h4>
                          <p className="text-xs text-slate-600 leading-relaxed max-w-3xl">
                            {isAr ? notif.messageAr : notif.messageEn}
                          </p>

                          {/* Channels Badge Row */}
                          <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-400">
                            <span>{isAr ? 'قنوات الإرسال:' : 'Channels:'}</span>
                            {notif.channels.map((ch) => (
                              <span
                                key={ch}
                                className="px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-700 text-[10px] font-semibold"
                              >
                                {ch}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Actions & Deep Link */}
                      <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 shrink-0">
                        {notif.deepLink && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeepLinkClick(notif.deepLink)}
                            className="text-xs font-bold border-slate-200 hover:border-emerald-300 hover:text-emerald-700"
                          >
                            <ExternalLink className="w-3.5 h-3.5 me-1 text-slate-400" />
                            {isAr ? notif.deepLink.labelAr : notif.deepLink.labelEn}
                          </Button>
                        )}

                        {isUnread ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMarkAsRead(notif.id)}
                            className="text-xs text-slate-500 hover:text-emerald-700"
                            title={isAr ? 'تحديد كمقروء' : 'Mark as read'}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(notif.id)}
                            className="text-xs text-slate-400 hover:text-rose-600"
                            title={isAr ? 'حذف الإشعار' : 'Delete'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================== */}
      {/* TAB 2: PREFERENCES & CHANNELS */}
      {/* ========================================== */}
      {activeTab === 'preferences' && preferences && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xs space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {isAr ? 'تفضيلات إشعارات المستخدم وقنوات الإرسال' : 'User Notification Preferences & Channels'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {isAr
                ? 'تحكم في أنواع الأحداث التي تود تلقيها، والقنوات المستهدفة لكل نوع (تطبيق، بريد، دفع Push).'
                : 'Configure event subscriptions and choose delivery channels (In-App, Email, Push).'}
            </p>
          </div>

          {/* Master Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.globalEnabled}
                onChange={(e) =>
                  setPreferences({ ...preferences, globalEnabled: e.target.checked })
                }
                className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
              />
              <div>
                <span className="text-xs font-bold text-slate-800">
                  {isAr ? 'تفعيل الإشعارات العامة' : 'Master Notification Switch'}
                </span>
                <p className="text-[11px] text-slate-500">
                  {isAr ? 'تعطيل هذا الخيار يحجب جميع الإشعارات' : 'Mutes all system alerts when disabled'}
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.soundEnabled}
                onChange={(e) =>
                  setPreferences({ ...preferences, soundEnabled: e.target.checked })
                }
                className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
              />
              <div>
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-slate-500" />
                  {isAr ? 'الأصوات والتنبيه الصوتي' : 'Sound & Audio Alert'}
                </span>
                <p className="text-[11px] text-slate-500">
                  {isAr ? 'تشغيل نغمة عند ورود إشعار حرج' : 'Play audio tone on critical alerts'}
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.quietHours.enabled}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    quietHours: { ...preferences.quietHours, enabled: e.target.checked },
                  })
                }
                className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
              />
              <div>
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Moon className="w-3.5 h-3.5 text-slate-500" />
                  {isAr ? 'ساعات الهدوء (Quiet Hours)' : 'Quiet Hours'}
                </span>
                <p className="text-[11px] text-slate-500">
                  {preferences.quietHours.startTime} - {preferences.quietHours.endTime}
                </p>
              </div>
            </label>
          </div>

          {/* Matrix Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 text-start font-bold">
                    {isAr ? 'نوع الحدث المؤسسي' : 'Enterprise Event Type'}
                  </th>
                  <th className="py-3 px-4 text-center font-bold">
                    {isAr ? 'تفعيل الإشعار' : 'Enabled'}
                  </th>
                  <th className="py-3 px-4 text-center font-bold">
                    <span className="flex items-center justify-center gap-1">
                      <Bell className="w-3.5 h-3.5" />
                      {isAr ? 'داخل التطبيق' : 'In-App'}
                    </span>
                  </th>
                  <th className="py-3 px-4 text-center font-bold">
                    <span className="flex items-center justify-center gap-1">
                      <Mail className="w-3.5 h-3.5" />
                      {isAr ? 'بريد إلكتروني' : 'Email'}
                    </span>
                  </th>
                  <th className="py-3 px-4 text-center font-bold">
                    <span className="flex items-center justify-center gap-1">
                      <Smartphone className="w-3.5 h-3.5" />
                      {isAr ? 'دفع (Push)' : 'Push'}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allEventTypes.map((et) => {
                  const evPref = preferences.events[et.type] || {
                    enabled: true,
                    inApp: true,
                    email: false,
                    push: false,
                  };

                  return (
                    <tr key={et.type} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4">
                        <p className="font-bold text-slate-900">{isAr ? et.labelAr : et.labelEn}</p>
                        <p className="text-[11px] text-slate-400 font-mono">{et.type}</p>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={evPref.enabled}
                          onChange={(e) => {
                            setPreferences({
                              ...preferences,
                              events: {
                                ...preferences.events,
                                [et.type]: { ...evPref, enabled: e.target.checked },
                              },
                            });
                          }}
                          className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          disabled={!evPref.enabled}
                          checked={evPref.inApp}
                          onChange={(e) => {
                            setPreferences({
                              ...preferences,
                              events: {
                                ...preferences.events,
                                [et.type]: { ...evPref, inApp: e.target.checked },
                              },
                            });
                          }}
                          className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer disabled:opacity-30"
                        />
                      </td>
                      <td className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          disabled={!evPref.enabled}
                          checked={evPref.email}
                          onChange={(e) => {
                            setPreferences({
                              ...preferences,
                              events: {
                                ...preferences.events,
                                [et.type]: { ...evPref, email: e.target.checked },
                              },
                            });
                          }}
                          className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer disabled:opacity-30"
                        />
                      </td>
                      <td className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          disabled={!evPref.enabled}
                          checked={evPref.push}
                          onChange={(e) => {
                            setPreferences({
                              ...preferences,
                              events: {
                                ...preferences.events,
                                [et.type]: { ...evPref, push: e.target.checked },
                              },
                            });
                          }}
                          className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer disabled:opacity-30"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              variant="primary"
              onClick={handleSavePreferences}
              disabled={savingPrefs}
              className="bg-emerald-700 hover:bg-emerald-800"
            >
              {savingPrefs ? (
                <span>{isAr ? 'جاري الحفظ...' : 'Saving...'}</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 me-1.5" />
                  <span>{isAr ? 'حفظ التفضيلات' : 'Save Preferences'}</span>
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* TAB 3: PUSH ADAPTER STATUS & ARCHITECTURE */}
      {/* ========================================== */}
      {activeTab === 'push' && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xs space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Radio className="w-5 h-5 text-teal-700" />
                {isAr ? 'بنية ومحول إشعارات الدفع (Push Adapter)' : 'Push Notification Adapter Architecture'}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {isAr
                  ? 'بنية معيارية قابلة للتوسيع لدعم W3C Push API وإشعارات الهواتف المحمولة وفق مواصفات النظام.'
                  : 'Extensible pluggable architecture supporting W3C Push API / RFC 8291 standard.'}
              </p>
            </div>
            <Badge
              variant={pushStatus?.status === 'CONFIGURED' ? 'success' : 'warning'}
              size="md"
            >
              {pushStatus?.status || 'NOT_CONFIGURED'}
            </Badge>
          </div>

          {/* Status Details Card */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="font-bold text-slate-500">{isAr ? 'المزود المعتمد:' : 'Provider:'}</span>
                <p className="font-semibold text-slate-800 mt-0.5">{pushStatus?.provider}</p>
              </div>
              <div>
                <span className="font-bold text-slate-500">{isAr ? 'متغير البيئة:' : 'Feature Flag:'}</span>
                <p className="font-mono text-slate-700 mt-0.5">{pushStatus?.featureFlag}</p>
              </div>
              <div>
                <span className="font-bold text-slate-500">{isAr ? 'الأجهزة المشتركة:' : 'Active Subscriptions:'}</span>
                <p className="font-semibold text-slate-800 mt-0.5">{pushStatus?.activeSubscriptionsCount || 0} devices</p>
              </div>
              <div>
                <span className="font-bold text-slate-500">{isAr ? 'المفتاح العام VAPID:' : 'VAPID Public Key:'}</span>
                <p className="font-mono text-slate-600 truncate mt-0.5">
                  {pushStatus?.publicKey || (isAr ? 'غير مهيأ (Not Configured)' : 'Not Configured')}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-amber-50/80 border border-amber-200 text-xs text-amber-900 leading-relaxed">
              <span className="font-bold">{isAr ? 'ملاحظة معمارية معلنة:' : 'Architectural Note:'}</span>{' '}
              {pushStatus?.message}
            </div>
          </div>

          {/* Integration Guide Box */}
          <div className="border border-slate-200 rounded-xl p-4 text-xs space-y-2 text-slate-600">
            <h4 className="font-bold text-slate-900">
              {isAr ? 'كيفية تفعيل إشعارات Push في بيئة الإنتاج' : 'Enabling Push in Production'}
            </h4>
            <ol className="list-decimal list-inside space-y-1 ps-1 text-slate-600">
              <li>
                {isAr
                  ? 'قم بتوليد مفاتيح VAPID عبر المكتبة القياسية `web-push generate-vapid-keys`.'
                  : 'Generate VAPID keys via `web-push generate-vapid-keys`.'}
              </li>
              <li>
                {isAr
                  ? 'عين المتغيرات `VAPID_PUBLIC_KEY` و `VAPID_PRIVATE_KEY` في ملف `.env`.'
                  : 'Assign `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in your `.env`.'}
              </li>
              <li>
                {isAr
                  ? 'يعمل المحول تلقائياً على إرسال تنبيهات الخلفية للأجهزة المسجلة.'
                  : 'The adapter will automatically dispatch background push notifications to registered devices.'}
              </li>
            </ol>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: TEST EVENT TRIGGER */}
      {/* ========================================== */}
      <Modal
        isOpen={showTestModal}
        onClose={() => setShowTestModal(false)}
        title={isAr ? 'تجربة إطلاق إشعار حي (Test Event Trigger)' : 'Test Event Trigger'}
        size="md"
      >
        <div className="space-y-4 py-2">
          <p className="text-xs text-slate-500">
            {isAr
              ? 'اختر أي حدث من أحداث المنظومة الـ 15 لتجربة إرساله والتحقق من التنبيه، الروابط العميقة، وقواعد الحجب حسب التفضيلات.'
              : 'Select any of the 15 enterprise event types to test notification firing, deep links, and preference suppression rules.'}
          </p>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {isAr ? 'نوع الحدث' : 'Event Type'}
            </label>
            <select
              value={testEventType}
              onChange={(e) => setTestEventType(e.target.value as NotificationEventType)}
              className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {allEventTypes.map((et) => (
                <option key={et.type} value={et.type}>
                  {isAr ? et.labelAr : et.labelEn} ({et.type})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {isAr ? 'درجة الأولوية' : 'Priority Level'}
            </label>
            <select
              value={testPriority}
              onChange={(e) => setTestPriority(e.target.value as NotificationPriority)}
              className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="LOW">{isAr ? 'منخفضة / معلومات (LOW)' : 'Low / Info'}</option>
              <option value="MEDIUM">{isAr ? 'متوسطة (MEDIUM)' : 'Medium'}</option>
              <option value="HIGH">{isAr ? 'عالية (HIGH)' : 'High'}</option>
              <option value="CRITICAL">{isAr ? 'حرجة جداً (CRITICAL)' : 'Critical'}</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <Button variant="ghost" onClick={() => setShowTestModal(false)}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              variant="primary"
              onClick={handleTriggerTest}
              disabled={triggering}
              className="bg-emerald-700 hover:bg-emerald-800"
            >
              <Send className="w-4 h-4 me-1.5" />
              {triggering
                ? isAr
                  ? 'جاري الإطلاق...'
                  : 'Dispatching...'
                : isAr
                ? 'إطلاق الإشعار الآن'
                : 'Fire Alert'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

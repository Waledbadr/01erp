/**
 * Collections & Reminders Master View (Rule G4-Linked) — Saudi ERP Platform
 * Section B & C:
 * - Overdue/due-soon lists auto-sourced from ledger due dates
 * - Reminder composer per customer & bulk selection
 * - Variable substitution preview: {customer_name}, {invoice_number}, {due_date}, {amount_due}, {days_overdue}, {company_name}
 * - Duplicate-send protection (blocks re-sending same invoice/template within cooldown window)
 * - Full communication audit log per customer
 */

import React, { useState, useEffect } from 'react';
import {
  Calendar,
  AlertCircle,
  Clock,
  Send,
  CheckCircle2,
  AlertTriangle,
  Mail,
  MessageSquare,
  Smartphone,
  FileText,
  Search,
  Users,
  Copy,
  Layers,
  Sparkles,
  ShieldCheck,
  Ban,
  Eye,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import {
  DueInvoiceRecord,
  ReminderTemplate,
  CommunicationLog,
  NotificationChannel,
  ReminderScheduleType,
  NotificationAPI,
  getAgingBucketBadge,
} from '../../lib/notifications.js';
import { useI18n } from '../../i18n/context.js';
import { Badge } from '../ui/Badge.js';
import { Button } from '../ui/Button.js';
import { Modal } from '../ui/Modal.js';
import { useToast } from '../ui/Toast.js';

interface RemindersCollectionsViewProps {
  onNavigate?: (route: string) => void;
  initialTab?: 'invoices' | 'composer' | 'logs';
}

export const RemindersCollectionsView: React.FC<RemindersCollectionsViewProps> = ({
  onNavigate,
  initialTab = 'invoices',
}) => {
  const { language } = useI18n();
  const isAr = language === 'ar';
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'invoices' | 'composer' | 'logs'>(initialTab);
  const [loading, setLoading] = useState<boolean>(true);

  // Due Invoices Data
  const [invoices, setInvoices] = useState<DueInvoiceRecord[]>([]);
  const [summary, setSummary] = useState<{
    totalOutstandingSar: number;
    totalOverdueSar: number;
    dueSoonCount: number;
    overdueCount: number;
    criticalCount: number;
  }>({
    totalOutstandingSar: 0,
    totalOverdueSar: 0,
    dueSoonCount: 0,
    overdueCount: 0,
    criticalCount: 0,
  });

  // Filters for Invoices
  const [invoiceSearch, setInvoiceSearch] = useState<string>('');
  const [agingFilter, setAgingFilter] = useState<string>('ALL');
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);

  // Templates & Logs
  const [templates, setTemplates] = useState<ReminderTemplate[]>([]);
  const [logs, setLogs] = useState<CommunicationLog[]>([]);
  const [logSearch, setLogSearch] = useState<string>('');
  const [logChannelFilter, setLogChannelFilter] = useState<string>('ALL');
  const [logStatusFilter, setLogStatusFilter] = useState<string>('ALL');

  // Composer Form State
  const [selectedInvoice, setSelectedInvoice] = useState<DueInvoiceRecord | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('tpl-standard-overdue');
  const [selectedChannel, setSelectedChannel] = useState<NotificationChannel>('EMAIL');
  const [scheduleType, setScheduleType] = useState<ReminderScheduleType>('IMMEDIATE');
  const [scheduledTime, setScheduledTime] = useState<string>('');
  const [attachStatement, setAttachStatement] = useState<boolean>(true);
  const [forceSend, setForceSend] = useState<boolean>(false);
  const [customSubject, setCustomSubject] = useState<string>('');
  const [customMessage, setCustomMessage] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);

  // Live Preview State
  const [previewData, setPreviewData] = useState<{
    subjectAr: string;
    subjectEn: string;
    bodyAr: string;
    bodyEn: string;
  } | null>(null);

  // View Log Modal
  const [selectedLog, setSelectedLog] = useState<CommunicationLog | null>(null);

  useEffect(() => {
    loadAllData();
  }, []);

  // Update preview whenever composer inputs change
  useEffect(() => {
    if (selectedInvoice && selectedTemplateId) {
      updatePreview();
    }
  }, [selectedInvoice, selectedTemplateId, customSubject, customMessage]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const invRes = await NotificationAPI.getDueInvoices();
      setInvoices(invRes.invoices);
      setSummary(invRes.summary);

      // Default select first overdue invoice for composer if available
      if (invRes.invoices.length > 0 && !selectedInvoice) {
        setSelectedInvoice(invRes.invoices[0]);
      }

      const tplsRes = await NotificationAPI.getTemplates();
      setTemplates(tplsRes);
      if (tplsRes.length > 0) {
        setSelectedTemplateId(tplsRes[0].id);
      }

      const logsRes = await NotificationAPI.getCommunicationLogs();
      setLogs(logsRes);
    } catch (err: any) {
      showToast({ title: isAr ? 'خطأ' : 'Error', message: err.message, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const updatePreview = async () => {
    if (!selectedInvoice) return;
    try {
      const preview = await NotificationAPI.previewReminder({
        templateId: selectedTemplateId,
        customerName: isAr ? selectedInvoice.customerNameAr : selectedInvoice.customerNameEn,
        invoiceNumber: selectedInvoice.invoiceNumber,
        dueDate: selectedInvoice.dueDate,
        amountDueSar: selectedInvoice.balanceDueSar,
        daysOverdue: selectedInvoice.daysOverdue,
        customSubject: customSubject.trim() ? customSubject : undefined,
        customMessage: customMessage.trim() ? customMessage : undefined,
      });
      setPreviewData(preview);
    } catch (err: any) {
      console.warn('Preview error:', err);
    }
  };

  const handleOpenComposerFor = (inv: DueInvoiceRecord) => {
    setSelectedInvoice(inv);
    // Auto-select template based on aging
    if (inv.daysOverdue <= 0) {
      setSelectedTemplateId('tpl-friendly-pre-due');
    } else if (inv.daysOverdue <= 30) {
      setSelectedTemplateId('tpl-standard-overdue');
    } else {
      setSelectedTemplateId('tpl-urgent-escalation');
    }
    setActiveTab('composer');
  };

  const handleSendReminder = async () => {
    if (!selectedInvoice) return;
    setSending(true);
    try {
      const res = await NotificationAPI.sendReminder({
        customerId: selectedInvoice.customerId,
        customerName: isAr ? selectedInvoice.customerNameAr : selectedInvoice.customerNameEn,
        customerEmail: selectedInvoice.customerEmail,
        customerPhone: selectedInvoice.customerPhone,
        invoiceId: selectedInvoice.id,
        invoiceNumber: selectedInvoice.invoiceNumber,
        amountDueSar: selectedInvoice.balanceDueSar,
        dueDate: selectedInvoice.dueDate,
        templateId: selectedTemplateId,
        channel: selectedChannel,
        scheduleType,
        scheduledTime: scheduleType === 'SCHEDULED' ? scheduledTime : undefined,
        customSubject: customSubject.trim() ? customSubject : undefined,
        customMessage: customMessage.trim() ? customMessage : undefined,
        attachStatement,
        forceSend,
      });

      if (!res.success && res.status === 'BLOCKED_DUPLICATE') {
        showToast({
          title: isAr ? 'تم منع الإرسال المتكرر' : 'Duplicate Send Blocked',
          message: isAr
            ? `تم منع إرسال تذكير مكرر للفاتورة ${selectedInvoice.invoiceNumber} (تم الإرسال مسبقاً خلال نافذة 24 ساعة). يمكنك تفعيل خيار تجاوز الحظر إن لزم.`
            : res.message,
          variant: 'warning',
        });
      } else {
        showToast({
          title: isAr ? 'تم بنجاح' : 'Success',
          message: isAr
            ? `تم إرسال/جدولة التذكير للفاتورة ${selectedInvoice.invoiceNumber} بنجاح`
            : res.message,
          variant: 'success',
        });
        setForceSend(false);
      }

      // Reload logs
      const updatedLogs = await NotificationAPI.getCommunicationLogs();
      setLogs(updatedLogs);
    } catch (err: any) {
      showToast({ title: isAr ? 'خطأ' : 'Error', message: err.message, variant: 'error' });
    } finally {
      setSending(false);
    }
  };

  const handleBulkSend = async () => {
    if (selectedInvoiceIds.length === 0) return;
    setSending(true);
    try {
      const targets = invoices.filter((i) => selectedInvoiceIds.includes(i.id));
      const payloads = targets.map((inv) => ({
        customerId: inv.customerId,
        customerName: isAr ? inv.customerNameAr : inv.customerNameEn,
        customerEmail: inv.customerEmail,
        customerPhone: inv.customerPhone,
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        amountDueSar: inv.balanceDueSar,
        dueDate: inv.dueDate,
        templateId: selectedTemplateId,
        channel: selectedChannel,
        scheduleType,
        attachStatement: true,
      }));

      const res = await NotificationAPI.bulkSendReminders(payloads);
      showToast({
        title: isAr ? 'اكتمل الإرسال المجمع' : 'Bulk Send Completed',
        message: isAr
          ? `تم إرسال ${res.sent} تذكير بنجاح. (تم حجب ${res.blocked} تذكير مكرر لمنع الإزعاج).`
          : `Sent ${res.sent}, blocked ${res.blocked} duplicates.`,
        variant: res.blocked > 0 ? 'warning' : 'success',
      });

      setSelectedInvoiceIds([]);
      const updatedLogs = await NotificationAPI.getCommunicationLogs();
      setLogs(updatedLogs);
    } catch (err: any) {
      showToast({ title: isAr ? 'خطأ' : 'Error', message: err.message, variant: 'error' });
    } finally {
      setSending(false);
    }
  };

  const toggleSelectAllInvoices = () => {
    if (selectedInvoiceIds.length === filteredInvoices.length) {
      setSelectedInvoiceIds([]);
    } else {
      setSelectedInvoiceIds(filteredInvoices.map((i) => i.id));
    }
  };

  const toggleSelectInvoice = (id: string) => {
    setSelectedInvoiceIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Filtered Invoices
  const filteredInvoices = invoices.filter((inv) => {
    if (agingFilter !== 'ALL' && inv.agingBucket !== agingFilter) return false;
    if (invoiceSearch.trim()) {
      const q = invoiceSearch.toLowerCase();
      const matchName =
        inv.customerNameAr.toLowerCase().includes(q) ||
        inv.customerNameEn.toLowerCase().includes(q) ||
        inv.invoiceNumber.toLowerCase().includes(q);
      if (!matchName) return false;
    }
    return true;
  });

  // Filtered Logs
  const filteredLogs = logs.filter((log) => {
    if (logChannelFilter !== 'ALL' && log.channel !== logChannelFilter) return false;
    if (logStatusFilter !== 'ALL' && log.status !== logStatusFilter) return false;
    if (logSearch.trim()) {
      const q = logSearch.toLowerCase();
      const match =
        log.customerName.toLowerCase().includes(q) ||
        log.invoiceNumber.toLowerCase().includes(q) ||
        log.recipient.toLowerCase().includes(q) ||
        log.subject.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-2xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-700 to-emerald-800 text-white flex items-center justify-center shadow-md">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  {isAr ? 'إدارة التحصيل والتذكيرات الآلية (G4)' : 'Collections & Automated Reminders (Rule G4)'}
                </h1>
                <Badge variant="brand" size="sm">
                  {isAr ? 'مرتبط بدفتر الأستاذ' : 'Ledger Linked'}
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                {isAr
                  ? 'متابعة الفواتير المستحقة والمتعثرة، إرسال تذكيرات مخصصة عبر البريد والواتساب، مع حماية الإرسال المكرر'
                  : 'Track overdue receivables, compose bilingual reminders, multi-channel dispatch, and duplicate-send protection'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadAllData}
              className="border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="w-4 h-4 me-1.5 text-slate-500" />
              {isAr ? 'تحديث البيانات' : 'Refresh'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setActiveTab('composer')}
              className="bg-emerald-700 hover:bg-emerald-800"
            >
              <Send className="w-4 h-4 me-1.5" />
              {isAr ? 'منشئ التذكيرات' : 'Open Composer'}
            </Button>
          </div>
        </div>

        {/* KPI Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-100">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <p className="text-[11px] font-bold text-slate-500">{isAr ? 'إجمالي الذمم المدينة' : 'Total AR Balance'}</p>
            <p className="text-base sm:text-lg font-black text-slate-900 mt-0.5">
              {summary.totalOutstandingSar.toLocaleString('en-US', { minimumFractionDigits: 2 })} ر.س
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200">
            <p className="text-[11px] font-bold text-amber-700">{isAr ? 'المستحقات المتأخرة' : 'Total Overdue'}</p>
            <p className="text-base sm:text-lg font-black text-amber-900 mt-0.5">
              {summary.totalOverdueSar.toLocaleString('en-US', { minimumFractionDigits: 2 })} ر.س
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200">
            <p className="text-[11px] font-bold text-blue-700">{isAr ? 'فواتير تستحق قريباً' : 'Due in 7 Days'}</p>
            <p className="text-base sm:text-lg font-black text-blue-900 mt-0.5">
              {summary.dueSoonCount} {isAr ? 'فواتير' : 'invoices'}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-rose-50/70 border border-rose-200">
            <p className="text-[11px] font-bold text-rose-700">{isAr ? 'متعثرة (+30 يوم)' : 'Critical Overdue (30d+)'}</p>
            <p className="text-base sm:text-lg font-black text-rose-900 mt-0.5">
              {summary.criticalCount} {isAr ? 'فواتير' : 'invoices'}
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-200 mt-5 pt-1">
          <button
            onClick={() => setActiveTab('invoices')}
            className={`pb-3 px-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'invoices'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>{isAr ? 'الفواتير المستحقة والمتعثرة' : 'Due & Overdue Invoices'}</span>
            <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-700">
              {invoices.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('composer')}
            className={`pb-3 px-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'composer'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>{isAr ? 'منشئ التذكيرات المخصص' : 'Reminder Composer'}</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`pb-3 px-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'logs'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>{isAr ? 'سجل المراسلات والتدقيق' : 'Communication Audit Log'}</span>
            <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-700">
              {logs.length}
            </span>
          </button>
        </div>
      </div>

      {/* ========================================== */}
      {/* TAB 1: DUE & OVERDUE INVOICES TABLE */}
      {/* ========================================== */}
      {activeTab === 'invoices' && (
        <div className="space-y-4">
          {/* Action & Filter Bar */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search */}
              <div className="relative min-w-[200px] sm:min-w-[240px]">
                <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder={isAr ? 'بحث بالعميل أو رقم الفاتورة...' : 'Search customer or invoice...'}
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                  className="w-full ps-9 pe-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Aging Filter */}
              <div className="flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={agingFilter}
                  onChange={(e) => setAgingFilter(e.target.value)}
                  className="text-xs py-1.5 px-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="ALL">{isAr ? 'جميع فترات الاستحقاق' : 'All Aging Buckets'}</option>
                  <option value="DUE_SOON">{isAr ? 'تستحق قريباً (1-7 أيام)' : 'Due Soon (1-7 Days)'}</option>
                  <option value="DUE_TODAY">{isAr ? 'تستحق اليوم' : 'Due Today'}</option>
                  <option value="OVERDUE_1_30">{isAr ? 'متأخرة 1-30 يوم' : 'Overdue 1-30 Days'}</option>
                  <option value="OVERDUE_31_60">{isAr ? 'متأخرة 31-60 يوم' : 'Overdue 31-60 Days'}</option>
                  <option value="OVERDUE_61_PLUS">{isAr ? 'متأخرة بشدة +60 يوم' : 'Overdue 60+ Days'}</option>
                </select>
              </div>
            </div>

            {/* Bulk Action Button */}
            {selectedInvoiceIds.length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleBulkSend}
                  disabled={sending}
                  className="bg-emerald-700 hover:bg-emerald-800 text-xs"
                >
                  <Send className="w-3.5 h-3.5 me-1.5" />
                  {isAr
                    ? `إرسال تذكير مجمع (${selectedInvoiceIds.length} فواتير)`
                    : `Bulk Reminder (${selectedInvoiceIds.length})`}
                </Button>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-3 px-3 text-center w-10">
                      <input
                        type="checkbox"
                        checked={
                          filteredInvoices.length > 0 &&
                          selectedInvoiceIds.length === filteredInvoices.length
                        }
                        onChange={toggleSelectAllInvoices}
                        className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-4 text-start font-bold">{isAr ? 'الفاتورة' : 'Invoice'}</th>
                    <th className="py-3 px-4 text-start font-bold">{isAr ? 'العميل' : 'Customer'}</th>
                    <th className="py-3 px-4 text-start font-bold">{isAr ? 'تاريخ الاستحقاق' : 'Due Date'}</th>
                    <th className="py-3 px-4 text-end font-bold">{isAr ? 'المبلغ المستحق' : 'Balance Due'}</th>
                    <th className="py-3 px-4 text-center font-bold">{isAr ? 'حالة التعثر' : 'Aging Status'}</th>
                    <th className="py-3 px-4 text-center font-bold">{isAr ? 'التذكيرات السابقة' : 'Past Reminders'}</th>
                    <th className="py-3 px-4 text-end font-bold">{isAr ? 'الإجراء' : 'Action'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        {isAr ? 'لا توجد فواتير تطابق التصفية' : 'No due invoices found matching criteria'}
                      </td>
                    </tr>
                  ) : (
                    filteredInvoices.map((inv) => {
                      const badge = getAgingBucketBadge(inv.agingBucket);
                      const isSelected = selectedInvoiceIds.includes(inv.id);

                      return (
                        <tr
                          key={inv.id}
                          className={`hover:bg-slate-50/70 transition-colors ${
                            isSelected ? 'bg-emerald-50/40' : ''
                          }`}
                        >
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectInvoice(inv.id)}
                              className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
                            />
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">
                            {inv.invoiceNumber}
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-bold text-slate-800">
                              {isAr ? inv.customerNameAr : inv.customerNameEn}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {inv.customerEmail || inv.customerPhone}
                            </p>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-semibold text-slate-700">{inv.dueDate}</span>
                            <p className="text-[11px] text-slate-400">
                              {inv.daysOverdue > 0
                                ? isAr
                                  ? `متأخرة ${inv.daysOverdue} يوم`
                                  : `${inv.daysOverdue} days overdue`
                                : isAr
                                ? `متبقي ${Math.abs(inv.daysOverdue)} يوم`
                                : `${Math.abs(inv.daysOverdue)} days left`}
                            </p>
                          </td>
                          <td className="py-3 px-4 text-end">
                            <span className="font-mono font-black text-slate-900">
                              {inv.balanceDueSar.toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                              })}{' '}
                              ر.س
                            </span>
                            {inv.paidAmountSar > 0 && (
                              <p className="text-[10px] text-slate-400">
                                {isAr ? 'مسدد:' : 'Paid:'} {inv.paidAmountSar.toLocaleString()} ر.س
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.className}`}>
                              {isAr ? badge.labelAr : badge.labelEn}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="font-bold text-slate-700">{inv.reminderCount}</span>
                            {inv.lastReminderSentAt && (
                              <p className="text-[10px] text-slate-400">
                                {new Date(inv.lastReminderSentAt).toLocaleDateString()}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-4 text-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenComposerFor(inv)}
                              className="text-xs font-bold border-slate-200 hover:border-emerald-300 hover:text-emerald-700"
                            >
                              <Send className="w-3.5 h-3.5 me-1" />
                              {isAr ? 'إرسال تذكير' : 'Remind'}
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* TAB 2: REMINDER COMPOSER (Single & Bulk) */}
      {/* ========================================== */}
      {activeTab === 'composer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left / Start: Form Configuration (7 Cols) */}
          <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xs space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {isAr ? 'إعداد رسالة التذكير والمطالبة' : 'Reminder Message Composer'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAr
                  ? 'اختر الفاتورة والنموذج، وستقوم المنظومة بالتعويض التلقائي للمتغيرات وحماية الإرسال المكرر.'
                  : 'Select invoice, template, and delivery channels with automatic variable substitution and duplicate-send lock.'}
              </p>
            </div>

            {/* Target Invoice Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                {isAr ? 'الفاتورة المستهدفة والعميل' : 'Target Invoice & Debtor'}
              </label>
              <select
                value={selectedInvoice?.id || ''}
                onChange={(e) => {
                  const inv = invoices.find((i) => i.id === e.target.value) || null;
                  setSelectedInvoice(inv);
                }}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
              >
                {invoices.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.invoiceNumber} — {isAr ? i.customerNameAr : i.customerNameEn} (
                    {i.balanceDueSar.toLocaleString()} ر.س — {i.daysOverdue > 0 ? `+${i.daysOverdue}d` : `${i.daysOverdue}d`})
                  </option>
                ))}
              </select>
            </div>

            {/* Template Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                {isAr ? 'نموذج الرسالة المعتمد' : 'Reminder Template'}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    onClick={() => setSelectedTemplateId(tpl.id)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      selectedTemplateId === tpl.id
                        ? 'border-emerald-600 bg-emerald-50/40 ring-1 ring-emerald-500'
                        : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                    }`}
                  >
                    <p className="text-xs font-bold text-slate-900">{isAr ? tpl.nameAr : tpl.nameEn}</p>
                    <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                      {isAr ? tpl.descriptionAr : tpl.descriptionEn}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Template Variables Pills Bar */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-[11px] font-bold text-slate-500 mb-1.5">
                {isAr ? 'المتغيرات المدعومة للتعويض التلقائي:' : 'Available Template Variables:'}
              </p>
              <div className="flex flex-wrap gap-1.5 text-[11px] font-mono">
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                  {'{customer_name}'}
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                  {'{invoice_number}'}
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                  {'{amount_due}'}
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                  {'{due_date}'}
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                  {'{days_overdue}'}
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                  {'{company_name}'}
                </span>
              </div>
            </div>

            {/* Channel Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                {isAr ? 'قناة الإرسال المستهدفة' : 'Delivery Channel'}
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedChannel('EMAIL')}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    selectedChannel === 'EMAIL'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Mail className="w-4 h-4 mx-auto mb-1 text-emerald-700" />
                  <span className="text-xs">{isAr ? 'بريد إلكتروني' : 'Email'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedChannel('WHATSAPP')}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    selectedChannel === 'WHATSAPP'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <MessageSquare className="w-4 h-4 mx-auto mb-1 text-teal-700" />
                  <span className="text-xs">{isAr ? 'واتساب WhatsApp' : 'WhatsApp'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedChannel('SMS')}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    selectedChannel === 'SMS'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Smartphone className="w-4 h-4 mx-auto mb-1 text-slate-700" />
                  <span className="text-xs">{isAr ? 'رسالة نصية SMS' : 'SMS Gateway'}</span>
                </button>
              </div>
            </div>

            {/* Statement Attachment & Scheduling */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={attachStatement}
                  onChange={(e) => setAttachStatement(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                />
                <span className="text-xs font-bold text-slate-800">
                  {isAr ? 'إرفاق كشف الحساب والفاتورة PDF' : 'Attach Statement & Invoice PDF'}
                </span>
              </label>

              <div>
                <select
                  value={scheduleType}
                  onChange={(e) => setScheduleType(e.target.value as ReminderScheduleType)}
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                >
                  <option value="IMMEDIATE">{isAr ? 'إرسال فوري الآن (Immediate)' : 'Send Now (Immediate)'}</option>
                  <option value="SCHEDULED">{isAr ? 'جدولة بتاريخ محدد (Scheduled)' : 'Schedule Custom Date'}</option>
                  <option value="POLICY_TRIGGERED">{isAr ? 'آلي حسب سياسة التحصيل (Auto Policy)' : 'Auto Policy'}</option>
                </select>
              </div>
            </div>

            {scheduleType === 'SCHEDULED' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {isAr ? 'موعد الإرسال المجدول' : 'Scheduled Target Date/Time'}
                </label>
                <input
                  type="datetime-local"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            )}

            {/* Duplicate Protection Force Override */}
            <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-700" />
                <span className="text-xs font-bold text-amber-900">
                  {isAr ? 'حماية الإرسال المكرر نشطة (24 ساعة)' : 'Duplicate Send Protection Active (24h Window)'}
                </span>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-amber-900 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={forceSend}
                  onChange={(e) => setForceSend(e.target.checked)}
                  className="w-3.5 h-3.5 text-amber-600 rounded"
                />
                <span>{isAr ? 'تجاوز الحظر إجبارياً' : 'Force Send'}</span>
              </label>
            </div>

            {/* Send Action */}
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <Button
                variant="primary"
                size="md"
                onClick={handleSendReminder}
                disabled={sending || !selectedInvoice}
                className="bg-emerald-700 hover:bg-emerald-800 text-sm font-bold px-6"
              >
                <Send className="w-4 h-4 me-2" />
                {sending
                  ? isAr
                    ? 'جاري الإرسال والتدقيق...'
                    : 'Dispatching...'
                  : isAr
                  ? 'إرسال التذكير الآن'
                  : 'Dispatch Reminder'}
              </Button>
            </div>
          </div>

          {/* Right / End: Live Rendered Preview (5 Cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-emerald-600" />
                  {isAr ? 'المعاينة الحية للرسالة (Live Preview)' : 'Live Message Preview'}
                </span>
                <Badge variant="success" size="sm">
                  {selectedChannel}
                </Badge>
              </div>

              {/* Subject */}
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  {isAr ? 'عنوان الرسالة / الموضوع:' : 'Subject Line:'}
                </p>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800">
                  {previewData?.subjectAr || (isAr ? 'جاري المعاينة...' : 'Rendering...')}
                </div>
              </div>

              {/* Body */}
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  {isAr ? 'نص الرسالة (بعد تعويض المتغيرات):' : 'Rendered Body Text:'}
                </p>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed min-h-[140px] whitespace-pre-line">
                  {previewData?.bodyAr || (isAr ? 'جاري المعاينة...' : 'Rendering...')}
                </div>
              </div>

              {/* Recipient Details */}
              <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/80 text-xs space-y-1">
                <p className="font-bold text-emerald-900">
                  {isAr ? 'بيانات المستلم المعتمدة:' : 'Resolved Recipient:'}
                </p>
                <p className="text-emerald-800">
                  {selectedChannel === 'EMAIL'
                    ? selectedInvoice?.customerEmail || 'finance@customer.sa'
                    : selectedInvoice?.customerPhone || '+966 50 123 4567'}
                </p>
                {attachStatement && (
                  <p className="text-[11px] text-emerald-700 font-semibold pt-1">
                    ✓ {isAr ? 'مرفق: كشف حساب معتمد + الفاتورة بصيغة PDF' : 'Attached: Certified Statement & Invoice PDF'}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* TAB 3: COMMUNICATION AUDIT LOG */}
      {/* ========================================== */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative min-w-[200px] sm:min-w-[240px]">
                <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder={isAr ? 'بحث في سجل المراسلات...' : 'Search logs...'}
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  className="w-full ps-9 pe-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Channel Filter */}
              <select
                value={logChannelFilter}
                onChange={(e) => setLogChannelFilter(e.target.value)}
                className="text-xs py-1.5 px-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="ALL">{isAr ? 'جميع القنوات' : 'All Channels'}</option>
                <option value="EMAIL">{isAr ? 'بريد إلكتروني' : 'Email'}</option>
                <option value="WHATSAPP">{isAr ? 'واتساب WhatsApp' : 'WhatsApp'}</option>
                <option value="SMS">{isAr ? 'رسالة نصية SMS' : 'SMS'}</option>
              </select>

              {/* Status Filter */}
              <select
                value={logStatusFilter}
                onChange={(e) => setLogStatusFilter(e.target.value)}
                className="text-xs py-1.5 px-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="ALL">{isAr ? 'جميع الحالات' : 'All Statuses'}</option>
                <option value="SENT">{isAr ? 'مرسل (Sent)' : 'Sent'}</option>
                <option value="DELIVERED">{isAr ? 'مستلم (Delivered)' : 'Delivered'}</option>
                <option value="QUEUED">{isAr ? 'في الانتظار (Queued)' : 'Queued'}</option>
                <option value="BLOCKED_DUPLICATE">{isAr ? 'محجوب للتكرار (Blocked)' : 'Blocked Duplicate'}</option>
                <option value="FAILED">{isAr ? 'فشل الإرسال (Failed)' : 'Failed'}</option>
              </select>
            </div>

            <div className="text-xs text-slate-500 font-semibold">
              {isAr ? `إجمالي السجلات: ${filteredLogs.length}` : `Total Logs: ${filteredLogs.length}`}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-3 px-4 text-start font-bold">{isAr ? 'الوقت والتاريخ' : 'Timestamp'}</th>
                    <th className="py-3 px-4 text-start font-bold">{isAr ? 'العميل' : 'Customer'}</th>
                    <th className="py-3 px-4 text-start font-bold">{isAr ? 'الفاتورة' : 'Invoice'}</th>
                    <th className="py-3 px-4 text-center font-bold">{isAr ? 'القناة' : 'Channel'}</th>
                    <th className="py-3 px-4 text-start font-bold">{isAr ? 'المستلم' : 'Recipient'}</th>
                    <th className="py-3 px-4 text-start font-bold">{isAr ? 'الموضوع' : 'Subject'}</th>
                    <th className="py-3 px-4 text-center font-bold">{isAr ? 'الحالة' : 'Status'}</th>
                    <th className="py-3 px-4 text-end font-bold">{isAr ? 'التفاصيل' : 'Details'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        {isAr ? 'لا توجد سجلات مراسلات تطابق البحث' : 'No communication logs found'}
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => {
                      const isBlocked = log.status === 'BLOCKED_DUPLICATE';
                      const isDelivered = log.status === 'DELIVERED' || log.status === 'SENT';

                      return (
                        <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                            {new Date(log.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}{' '}
                            • {new Date(log.createdAt).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-800">{log.customerName}</td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">
                            {log.invoiceNumber}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[10px]">
                              {log.channel}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                            {log.recipient}
                          </td>
                          <td className="py-3 px-4 max-w-[200px] truncate text-slate-700">
                            {log.subject}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                isBlocked
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : isDelivered
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}
                            >
                              {log.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedLog(log)}
                              className="text-xs text-slate-500 hover:text-emerald-700"
                            >
                              <Eye className="w-3.5 h-3.5 me-1" />
                              {isAr ? 'عرض' : 'View'}
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: VIEW COMMUNICATION LOG DETAILS */}
      {/* ========================================== */}
      {selectedLog && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedLog(null)}
          title={isAr ? 'تفاصيل سجل المراسلة والتدقيق' : 'Communication Audit Record'}
          size="lg"
        >
          <div className="space-y-4 py-2 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <span className="font-bold text-slate-400">{isAr ? 'العميل:' : 'Customer:'}</span>
                <p className="font-bold text-slate-800 mt-0.5">{selectedLog.customerName}</p>
              </div>
              <div>
                <span className="font-bold text-slate-400">{isAr ? 'رقم الفاتورة:' : 'Invoice:'}</span>
                <p className="font-mono font-bold text-slate-800 mt-0.5">{selectedLog.invoiceNumber}</p>
              </div>
              <div>
                <span className="font-bold text-slate-400">{isAr ? 'القناة والمستلم:' : 'Channel & To:'}</span>
                <p className="font-semibold text-slate-800 mt-0.5">
                  {selectedLog.channel} • {selectedLog.recipient}
                </p>
              </div>
              <div>
                <span className="font-bold text-slate-400">{isAr ? 'الحالة:' : 'Status:'}</span>
                <p className="font-bold text-slate-800 mt-0.5">{selectedLog.status}</p>
              </div>
            </div>

            {selectedLog.blockedReason && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 leading-relaxed">
                <span className="font-bold">{isAr ? 'سبب الحظر:' : 'Blocked Reason:'}</span>{' '}
                {selectedLog.blockedReason}
              </div>
            )}

            <div>
              <span className="font-bold text-slate-500 block mb-1">
                {isAr ? 'الموضوع:' : 'Subject:'}
              </span>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-800">
                {selectedLog.subject}
              </div>
            </div>

            <div>
              <span className="font-bold text-slate-500 block mb-1">
                {isAr ? 'نص الرسالة الكامل:' : 'Full Message Body:'}
              </span>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 leading-relaxed whitespace-pre-line">
                {selectedLog.messageBody}
              </div>
            </div>

            <div className="flex items-center justify-between text-slate-400 text-[11px] pt-2 border-t border-slate-100">
              <span>
                {isAr ? 'المستخدم الذي أطلق التذكير:' : 'Triggered By:'} {selectedLog.triggeredBy}
              </span>
              <span>
                {new Date(selectedLog.createdAt).toLocaleString()}
              </span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

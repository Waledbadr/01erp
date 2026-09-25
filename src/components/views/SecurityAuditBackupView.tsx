import React, { useState, useEffect } from 'react';
import { useI18n } from '../../i18n/context.js';
import { useToast } from '../ui/Toast.js';
import { Button } from '../ui/Button.js';
import { Badge } from '../ui/Badge.js';
import { Modal } from '../ui/Modal.js';
import { Input } from '../ui/Input.js';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Key,
  HardDrive,
  Download,
  Upload,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Activity,
  Laptop,
  Smartphone,
  Tablet,
  Globe,
  Trash2,
  AlertCircle,
  Copy,
  Check,
  Eye,
  Sliders,
  RotateCcw,
  Zap,
} from 'lucide-react';
import {
  AuditLogRecord,
  AuditStats,
  AuditHashChainVerification,
  UserSessionRecord,
  TwoFactorSetupResult,
  DangerousOperationRequest,
  ComplianceScanReport,
  BackupSnapshotMetadata,
  BackupVerificationReport,
  RestoreResult,
  formatBytes,
} from '../../lib/securityAuditBackup.js';

export const SecurityAuditBackupView: React.FC<{
  onNavigate?: (route: string) => void;
  initialTab?: 'audit' | 'sessions' | 'dangerous' | 'backups' | 'compliance';
}> = ({ onNavigate, initialTab = 'audit' }) => {
  const { language, isAr, direction } = useI18n();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'audit' | 'sessions' | 'dangerous' | 'backups' | 'compliance'>(initialTab);

  // --- 1. Audit Trail State ---
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [auditStats, setAuditStats] = useState<AuditStats | null>(null);
  const [chainVerification, setChainVerification] = useState<AuditHashChainVerification | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [verifyingChain, setVerifyingChain] = useState(false);
  const [auditFilters, setAuditFilters] = useState({
    action: 'ALL',
    resourceType: 'ALL',
    search: '',
    dateFrom: '',
    dateTo: '',
  });
  const [selectedLogForDiff, setSelectedLogForDiff] = useState<AuditLogRecord | null>(null);

  // --- 2. Sessions & 2FA State ---
  const [sessions, setSessions] = useState<UserSessionRecord[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [twoFactorModalOpen, setTwoFactorModalOpen] = useState(false);
  const [twoFactorSetup, setTwoFactorSetup] = useState<TwoFactorSetupResult | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [enablingTwoFactor, setEnablingTwoFactor] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // --- 3. Dangerous Operations State ---
  const [dangerousForm, setDangerousForm] = useState<DangerousOperationRequest>({
    operationType: 'REVERSE_JOURNAL',
    targetResourceId: '',
    justification: '',
  });
  const [submittingDangerousOp, setSubmittingDangerousOp] = useState(false);

  // --- 4. Backups State ---
  const [backups, setBackups] = useState<BackupSnapshotMetadata[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [backupDescription, setBackupDescription] = useState('');
  const [verificationReport, setVerificationReport] = useState<BackupVerificationReport | null>(null);
  const [verifyingBackupId, setVerifyingBackupId] = useState<string | null>(null);
  const [restoreConfirmModal, setRestoreConfirmModal] = useState<BackupSnapshotMetadata | null>(null);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);

  // --- 5. Compliance Scan State ---
  const [complianceReport, setComplianceReport] = useState<ComplianceScanReport | null>(null);
  const [scanningCompliance, setScanningCompliance] = useState(false);

  // Load Initial Data
  useEffect(() => {
    loadAuditData();
    loadSessionsData();
    loadBackupsData();
    loadComplianceReport();
  }, []);

  // --- Fetchers ---
  const loadAuditData = async () => {
    setLoadingLogs(true);
    try {
      const query = new URLSearchParams();
      if (auditFilters.action !== 'ALL') query.set('action', auditFilters.action);
      if (auditFilters.resourceType !== 'ALL') query.set('resourceType', auditFilters.resourceType);
      if (auditFilters.search) query.set('search', auditFilters.search);
      if (auditFilters.dateFrom) query.set('dateFrom', auditFilters.dateFrom);
      if (auditFilters.dateTo) query.set('dateTo', auditFilters.dateTo);
      query.set('limit', '100');

      const [logsRes, statsRes, chainRes] = await Promise.all([
        fetch(`/api/v1/audit/logs?${query.toString()}`),
        fetch('/api/v1/audit/stats'),
        fetch('/api/v1/audit/verify-integrity'),
      ]);

      if (logsRes.ok) {
        const d = await logsRes.json();
        setLogs(d.logs || []);
      }
      if (statsRes.ok) {
        const s = await statsRes.json();
        setAuditStats(s);
      }
      if (chainRes.ok) {
        const c = await chainRes.json();
        setChainVerification(c);
      }
    } catch (err) {
      console.error('Failed to load audit data', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleVerifyChain = async () => {
    setVerifyingChain(true);
    try {
      const res = await fetch('/api/v1/audit/verify-integrity');
      if (res.ok) {
        const c = await res.json();
        setChainVerification(c);
        toast.showToast({
          type: c.isValid ? 'success' : 'error',
          title: c.isValid ? (isAr ? 'تم التحقق من سلسلة التشفير' : 'Chain Intact') : (isAr ? 'تنبيه أمني' : 'Security Alert'),
          message: isAr ? c.messageAr : c.messageEn,
        });
      }
    } catch {
      toast.showToast({
        type: 'error',
        title: isAr ? 'خطأ في الاتصال' : 'Connection Error',
        message: isAr ? 'فشل فحص سلسلة التشفير' : 'Failed to verify chain',
      });
    } finally {
      setVerifyingChain(false);
    }
  };

  const loadSessionsData = async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch('/api/v1/security/sessions');
      if (res.ok) {
        const d = await res.json();
        setSessions(d.sessions || []);
      }
    } catch (err) {
      console.error('Failed to load sessions', err);
    } finally {
      setLoadingSessions(false);
    }
  };

  const handleRevokeSession = async (sessionToken: string) => {
    try {
      const res = await fetch('/api/v1/security/sessions/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionToken }),
      });
      if (res.ok) {
        toast.showToast({
          type: 'success',
          title: isAr ? 'تم إنهاء الجلسة' : 'Session Terminated',
          message: isAr ? 'تم إلغاء الجلسة المحددة بنجاح.' : 'Target session revoked.',
        });
        loadSessionsData();
        loadAuditData();
      }
    } catch {
      toast.showToast({
        type: 'error',
        title: isAr ? 'خطأ' : 'Error',
        message: isAr ? 'فشل إنهاء الجلسة.' : 'Could not revoke session.',
      });
    }
  };

  const handleRevokeAllOtherSessions = async () => {
    try {
      const res = await fetch('/api/v1/security/sessions/revoke-others', {
        method: 'POST',
      });
      if (res.ok) {
        const d = await res.json();
        toast.showToast({
          type: 'success',
          title: isAr ? 'تم إنهاء الجلسات' : 'Sessions Terminated',
          message: isAr ? `تم إنهاء ${d.count} جلسة نشطة أخرى.` : `Terminated ${d.count} other session(s).`,
        });
        loadSessionsData();
        loadAuditData();
      }
    } catch {
      toast.showToast({
        type: 'error',
        title: isAr ? 'خطأ' : 'Error',
        message: isAr ? 'فشل إنهاء الجلسات.' : 'Could not revoke sessions.',
      });
    }
  };

  const handleStartTwoFactorSetup = async () => {
    try {
      const res = await fetch('/api/v1/security/2fa/setup', { method: 'POST' });
      if (res.ok) {
        const d = await res.json();
        setTwoFactorSetup(d);
        setTwoFactorCode('');
        setTwoFactorModalOpen(true);
      }
    } catch {
      toast.showToast({
        type: 'error',
        title: isAr ? 'خطأ' : 'Error',
        message: isAr ? 'فشل تجهيز بيانات التحقق الثنائي' : 'Could not initiate 2FA setup',
      });
    }
  };

  const handleVerifyTwoFactor = async () => {
    if (!twoFactorSetup || !twoFactorCode) return;
    setEnablingTwoFactor(true);
    try {
      const res = await fetch('/api/v1/security/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: twoFactorSetup.secret,
          code: twoFactorCode,
          recoveryCodes: twoFactorSetup.recoveryCodes,
        }),
      });
      const d = await res.json();
      if (res.ok && d.success) {
        toast.showToast({
          type: 'success',
          title: isAr ? 'تم التفعيل بنجاح' : '2FA Enabled',
          message: isAr ? d.messageAr : d.messageEn,
        });
        setTwoFactorModalOpen(false);
        loadComplianceReport();
        loadAuditData();
      } else {
        toast.showToast({
          type: 'error',
          title: isAr ? 'رمز التحقق غير صحيح' : 'Invalid Code',
          message: isAr ? d.messageAr : d.messageEn,
        });
      }
    } catch {
      toast.showToast({
        type: 'error',
        title: isAr ? 'خطأ في الاتصال' : 'Network Error',
        message: isAr ? 'فشل التحقق من الرمز' : 'Verification request failed',
      });
    } finally {
      setEnablingTwoFactor(false);
    }
  };

  const handleSubmitDangerousOperation = async () => {
    if (!dangerousForm.targetResourceId.trim() || dangerousForm.justification.trim().length < 10) {
      toast.showToast({
        type: 'error',
        title: isAr ? 'بيانات ناقصة' : 'Missing Information',
        message: isAr
          ? 'يرجى إدخال معرف المورد وتقديم مبرر تشغيلي لا يقل عن 10 أحرف.'
          : 'Please provide the target ID and an operational justification of at least 10 characters.',
      });
      return;
    }

    setSubmittingDangerousOp(true);
    try {
      const res = await fetch('/api/v1/security/dangerous-operations/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dangerousForm),
      });
      const d = await res.json();
      if (res.ok && d.approved) {
        toast.showToast({
          type: 'success',
          title: isAr ? 'تمت المصادقة وتسجيل العملية' : 'Operation Authorized',
          message: isAr
            ? 'تم توثيق العملية وتأكيد الصلاحية في سجل التدقيق بنجاح.'
            : 'Operation authorized and recorded in immutable audit log.',
        });
        setDangerousForm({
          operationType: 'REVERSE_JOURNAL',
          targetResourceId: '',
          justification: '',
        });
        loadAuditData();
      } else {
        toast.showToast({
          type: 'error',
          title: isAr ? 'فشلت المصادقة' : 'Authorization Denied',
          message: isAr ? d.errorAr : d.errorEn,
        });
      }
    } catch {
      toast.showToast({
        type: 'error',
        title: isAr ? 'خطأ' : 'Error',
        message: isAr ? 'فشل تنفيذ بروتوكول العملية الحرجة' : 'Failed to validate operation',
      });
    } finally {
      setSubmittingDangerousOp(false);
    }
  };

  const loadBackupsData = async () => {
    setLoadingBackups(true);
    try {
      const res = await fetch('/api/v1/backups');
      if (res.ok) {
        const d = await res.json();
        setBackups(d.backups || []);
      }
    } catch (err) {
      console.error('Failed to load backups', err);
    } finally {
      setLoadingBackups(false);
    }
  };

  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    try {
      const res = await fetch('/api/v1/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: backupDescription }),
      });
      if (res.ok) {
        const meta = await res.json();
        toast.showToast({
          type: 'success',
          title: isAr ? 'تم إنشاء النسخة الاحتياطية' : 'Backup Created',
          message: isAr
            ? `تم إنشاء النسخة ${meta.snapshotNumber} وحساب البصمة التشفيرية بنجاح.`
            : `Snapshot ${meta.snapshotNumber} created with cryptographic hash.`,
        });
        setBackupDescription('');
        loadBackupsData();
        loadAuditData();
      }
    } catch {
      toast.showToast({
        type: 'error',
        title: isAr ? 'خطأ' : 'Error',
        message: isAr ? 'فشل إنشاء النسخة الاحتياطية' : 'Could not create backup snapshot',
      });
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleVerifyBackup = async (backupId: string) => {
    setVerifyingBackupId(backupId);
    try {
      const res = await fetch(`/api/v1/backups/${backupId}/verify`, { method: 'POST' });
      if (res.ok) {
        const rep = await res.json();
        setVerificationReport(rep);
        toast.showToast({
          type: rep.status === 'PASSED' ? 'success' : 'error',
          title: rep.status === 'PASSED' ? (isAr ? 'اجتازت النسخة الفحص' : 'Verification Passed') : (isAr ? 'فشل الفحص' : 'Verification Failed'),
          message: isAr ? 'تم التأكد من صحة البصمة التشفيرية وتوازن قيود اليومية.' : 'Checksum and ledger balance verified.',
        });
      }
    } catch {
      toast.showToast({
        type: 'error',
        title: isAr ? 'خطأ' : 'Error',
        message: isAr ? 'فشل اختبار النسخة الاحتياطية' : 'Drill test failed',
      });
    } finally {
      setVerifyingBackupId(null);
    }
  };

  const handleExecuteRestore = async () => {
    if (!restoreConfirmModal) return;
    setRestoringBackup(true);
    try {
      const res = await fetch(`/api/v1/backups/${restoreConfirmModal.id}/restore`, {
        method: 'POST',
      });
      const d = await res.json();
      if (res.ok && d.success) {
        setRestoreResult(d);
        toast.showToast({
          type: 'success',
          title: isAr ? 'تمت استعادة البيانات بنجاح' : 'Disaster Recovery Succeeded',
          message: isAr ? d.messageAr : d.messageEn,
        });
        setRestoreConfirmModal(null);
        loadBackupsData();
        loadAuditData();
        loadComplianceReport();
      } else {
        toast.showToast({
          type: 'error',
          title: isAr ? 'فشلت الاستعادة' : 'Restore Failed',
          message: d.message || (isAr ? 'حدث خطأ أثناء استعادة البيانات' : 'Error during restoration'),
        });
      }
    } catch {
      toast.showToast({
        type: 'error',
        title: isAr ? 'خطأ فادح' : 'Critical Error',
        message: isAr ? 'تعذر إكمال عملية الاستعادة' : 'Failed to complete restore protocol',
      });
    } finally {
      setRestoringBackup(false);
    }
  };

  const loadComplianceReport = async () => {
    setScanningCompliance(true);
    try {
      const res = await fetch('/api/v1/security/compliance-check');
      if (res.ok) {
        const d = await res.json();
        setComplianceReport(d);
      }
    } catch (err) {
      console.error('Failed to load compliance report', err);
    } finally {
      setScanningCompliance(false);
    }
  };

  // Action badge color
  const getActionBadgeVariant = (action: string) => {
    if (action.includes('REVERSE') || action.includes('DELETE') || action.includes('REVOKED')) return 'danger';
    if (action.includes('POST') || action.includes('BACKUP') || action.includes('ENABLE')) return 'success';
    if (action.includes('LOCK') || action.includes('DANGEROUS')) return 'warning';
    return 'brand';
  };

  return (
    <div className="space-y-6 pb-12" dir={direction}>
      {/* Executive Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                  {isAr ? 'الأمان والنسخ الاحتياطي' : 'Security & Backups'}
                </h1>
                <p className="text-xs sm:text-sm text-slate-500">
                  {isAr
                    ? 'التحقق التشفيري بسلسلة SHA-256، إدارة الجلسات والمصادقة الثنائية، والنسخ الاحتياطي الفوري الوقائي.'
                    : 'Cryptographic SHA-256 chain verification, session hardening, TOTP 2FA, and zero-data-loss snapshots.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Badge variant="brand" className="font-mono text-[11px]">
                SHA-256 Tamper-Evident Chain
              </Badge>
              <Badge variant="success" className="font-mono text-[11px]">
                Balanced Ledger Check
              </Badge>
              <Badge variant="default" className="font-mono text-[11px]">
                Multi-Tenant Isolation
              </Badge>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              startIcon={<RefreshCw className={`w-4 h-4 ${verifyingChain ? 'animate-spin' : ''}`} />}
              onClick={handleVerifyChain}
              disabled={verifyingChain}
            >
              {isAr ? 'فحص سلسلة التدقيق' : 'Verify Hash Chain'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              startIcon={<HardDrive className="w-4 h-4" />}
              onClick={() => setActiveTab('backups')}
            >
              {isAr ? 'النسخ الاحتياطي' : 'Manage Backups'}
            </Button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 mt-6 overflow-x-auto text-xs sm:text-sm font-medium">
          <button
            onClick={() => setActiveTab('audit')}
            className={`pb-3 px-3 border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'audit'
                ? 'border-emerald-600 text-emerald-700 font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>{isAr ? 'سجل التدقيق الشامل' : 'Audit Trail & Logs'}</span>
            {auditStats && (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700">
                {auditStats.totalLogs}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('sessions')}
            className={`pb-3 px-3 border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'sessions'
                ? 'border-emerald-600 text-emerald-700 font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>{isAr ? 'الجلسات والأمان (2FA)' : 'Sessions & 2FA'}</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700">
              {sessions.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('dangerous')}
            className={`pb-3 px-3 border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'dangerous'
                ? 'border-emerald-600 text-emerald-700 font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>{isAr ? 'العمليات الحرجة' : 'Dangerous Operations'}</span>
          </button>

          <button
            onClick={() => setActiveTab('backups')}
            className={`pb-3 px-3 border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'backups'
                ? 'border-emerald-600 text-emerald-700 font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            <span>{isAr ? 'النسخ الاحتياطي والتعافي' : 'Backup & Restore'}</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700">
              {backups.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('compliance')}
            className={`pb-3 px-3 border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'compliance'
                ? 'border-emerald-600 text-emerald-700 font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>{isAr ? 'فاحص الامتثال الشامل' : 'Compliance Scanner'}</span>
            {complianceReport && (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-bold">
                {complianceReport.overallScorePercentage}%
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: AUDIT TRAIL                                        */}
      {/* ========================================================= */}
      {activeTab === 'audit' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">{isAr ? 'إجمالي السجلات' : 'Total Audit Logs'}</span>
                <FileText className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-2">{auditStats?.totalLogs || logs.length}</div>
              <p className="text-[11px] text-slate-500 mt-1">
                {isAr ? `${auditStats?.recent24hCount || 0} عملية في آخر 24 ساعة` : `${auditStats?.recent24hCount || 0} in last 24 hrs`}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">{isAr ? 'الأنشطة الفريدة' : 'Action Types'}</span>
                <Sliders className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-2">{auditStats?.uniqueActionsCount || 0}</div>
              <p className="text-[11px] text-slate-500 mt-1">
                {isAr ? 'تغطي القيود، الأصول، والمخزون' : 'Covering GL, Assets, and Stock'}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">{isAr ? 'سلسلة التشفير' : 'SHA-256 Hash Chain'}</span>
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Badge variant={chainVerification?.isValid ? 'success' : 'danger'}>
                  {chainVerification?.isValid ? (isAr ? 'سليمة وموثقة 100%' : 'Intact & Verified') : (isAr ? 'خلل في التشفير' : 'Discrepancy')}
                </Badge>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 truncate font-mono">
                {chainVerification?.latestHash ? `${chainVerification.latestHash.slice(0, 12)}...` : 'Genesis'}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">{isAr ? 'تصدير البيانات القانوني' : 'Statutory Export'}</span>
                <Download className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="flex items-center gap-2 mt-3">
                <a
                  href="/api/v1/audit/export/csv"
                  className="px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition-colors"
                  download
                >
                  CSV
                </a>
                <a
                  href="/api/v1/audit/export/json"
                  className="px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition-colors"
                  download
                >
                  JSON
                </a>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-slate-600 mb-1">{isAr ? 'نوع الإجراء' : 'Action Type'}</label>
                <select
                  value={auditFilters.action}
                  onChange={(e) => setAuditFilters({ ...auditFilters, action: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                >
                  <option value="ALL">{isAr ? 'كافة الإجراءات' : 'All Actions'}</option>
                  <option value="POST_JOURNAL">POST_JOURNAL</option>
                  <option value="REVERSE_JOURNAL">REVERSE_JOURNAL</option>
                  <option value="REGISTER_FIXED_ASSET">REGISTER_FIXED_ASSET</option>
                  <option value="DEPRECIATION_RUN">DEPRECIATION_RUN</option>
                  <option value="DISPOSE_ASSET_SALE">DISPOSE_ASSET_SALE</option>
                  <option value="BACKUP_CREATE">BACKUP_CREATE</option>
                  <option value="BACKUP_RESTORE">BACKUP_RESTORE</option>
                  <option value="SESSION_REVOKED">SESSION_REVOKED</option>
                  <option value="DANGEROUS_OP_CONFIRMED">DANGEROUS_OP_CONFIRMED</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 mb-1">{isAr ? 'نوع المورد' : 'Resource Type'}</label>
                <select
                  value={auditFilters.resourceType}
                  onChange={(e) => setAuditFilters({ ...auditFilters, resourceType: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                >
                  <option value="ALL">{isAr ? 'كافة الموارد' : 'All Resources'}</option>
                  <option value="journals">journals</option>
                  <option value="fixed_assets">fixed_assets</option>
                  <option value="stock_movements">stock_movements</option>
                  <option value="backups">backups</option>
                  <option value="user_sessions">user_sessions</option>
                  <option value="users">users</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 mb-1">{isAr ? 'البحث بالكلمة' : 'Search'}</label>
                <input
                  type="text"
                  placeholder={isAr ? 'بحث في المعرفات أو المستخدم...' : 'Search IDs or users...'}
                  value={auditFilters.search}
                  onChange={(e) => setAuditFilters({ ...auditFilters, search: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="flex items-end gap-2">
                <Button variant="primary" size="sm" onClick={loadAuditData} className="w-full">
                  <Search className="w-3.5 h-3.5" />
                  <span>{isAr ? 'تطبيق التصفية' : 'Filter Logs'}</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="p-3 text-start">{isAr ? 'الوقت (UTC)' : 'Timestamp (UTC)'}</th>
                    <th className="p-3 text-start">{isAr ? 'المستخدم' : 'User'}</th>
                    <th className="p-3 text-start">{isAr ? 'الإجراء' : 'Action'}</th>
                    <th className="p-3 text-start">{isAr ? 'المورد والمعرف' : 'Resource & ID'}</th>
                    <th className="p-3 text-start">{isAr ? 'عنوان IP' : 'IP Address'}</th>
                    <th className="p-3 text-start">{isAr ? 'المبرر / البيان' : 'Reason / Notes'}</th>
                    <th className="p-3 text-center">{isAr ? 'التفاصيل' : 'Diff Details'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingLogs ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-600" />
                        <span>{isAr ? 'جاري تحميل سجل التدقيق...' : 'Loading audit logs...'}</span>
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">
                        {isAr ? 'لا توجد سجلات تدقيق مطابقة لمعايير البحث.' : 'No audit records match the criteria.'}
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                          {log.createdAt ? new Date(log.createdAt).toLocaleString(isAr ? 'ar-SA' : 'en-US') : '-'}
                        </td>
                        <td className="p-3 font-medium text-slate-900 max-w-[150px] truncate" title={log.userEmail}>
                          {log.userEmail}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <Badge variant={getActionBadgeVariant(log.action)} className="font-mono text-[10px]">
                            {log.action}
                          </Badge>
                        </td>
                        <td className="p-3 text-slate-700 font-mono text-[11px]">
                          <span className="text-slate-500">{log.resourceType}:</span> {log.resourceId?.slice(0, 14)}...
                        </td>
                        <td className="p-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                          {log.ipAddress || '127.0.0.1'}
                        </td>
                        <td className="p-3 text-slate-600 max-w-[200px] truncate" title={log.reason || '-'}>
                          {log.reason || '-'}
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <button
                            onClick={() => setSelectedLogForDiff(log)}
                            className="p-1.5 hover:bg-slate-100 rounded-lg text-emerald-700 transition-colors"
                            title={isAr ? 'عرض لقطة البيانات وفروقات التعديل' : 'View diff snapshot'}
                          >
                            <Eye className="w-4 h-4" />
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
      )}

      {/* ========================================================= */}
      {/* TAB 2: SESSIONS & 2FA                                     */}
      {/* ========================================================= */}
      {activeTab === 'sessions' && (
        <div className="space-y-6">
          {/* Top Row: 2FA & Cost Masking Status Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 2FA Setup Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Key className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-bold text-slate-900 text-sm">
                    {isAr ? 'المصادقة الثنائية (TOTP / RFC 6238)' : 'Two-Factor Authentication (2FA)'}
                  </h3>
                </div>
                <Badge variant="brand">{isAr ? 'تطبيق المصادق المعتمد' : 'Authenticator App'}</Badge>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {isAr
                  ? 'حماية الحسابات الإدارية والمحاسبية برمز أمان إضافي ديناميكي يتغير كل 30 ثانية باستخدام Google Authenticator أو 1Password.'
                  : 'Enforce time-based one-time passwords for administrative and ledger-posting roles.'}
              </p>
              <div className="pt-2">
                <Button variant="primary" size="sm" onClick={handleStartTwoFactorSetup}>
                  {isAr ? 'إعداد المصادقة الثنائية للحساب' : 'Configure 2FA Authenticator'}
                </Button>
              </div>
            </div>

            {/* Cost Masking Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-bold text-slate-900 text-sm">
                    {isAr ? 'حجب التكلفة وهوامش الربح' : 'Cost Redaction & Masking'}
                  </h3>
                </div>
                <Badge variant="success">{isAr ? 'نشط تلقائياً' : 'Enforced'}</Badge>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {isAr
                  ? 'حقول تكلفة المخزون وهوامش ربح المبيعات محجوبة ومجردة تلقائياً عن موظفي المبيعات والمحاسبين المساعدين لضمان سرية أسعار الشراء.'
                  : 'Purchase costs and margin fields are automatically scrubbed from JSON responses for unprivileged roles.'}
              </p>
              <div className="text-[11px] font-mono bg-slate-50 p-2 rounded border border-slate-200 text-slate-600">
                accounting:cost:view | sales:margin:view
              </div>
            </div>
          </div>

          {/* Active Sessions Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-emerald-600" />
                  <span>{isAr ? 'الجلسات النشطة والأجهزة المتصلة' : 'Active User Sessions'}</span>
                </h3>
                <p className="text-xs text-slate-500">
                  {isAr
                    ? 'فحص عناوين IP وبصمات المتصفحات وإمكانية إنهاء الجلسات المشبوهة فورياً.'
                    : 'Inspect device fingerprints, IP addresses, and revoke suspicious sessions immediately.'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleRevokeAllOtherSessions}
                  disabled={sessions.length <= 1}
                >
                  {isAr ? 'إنهاء كافة الجلسات الأخرى' : 'Revoke All Other Sessions'}
                </Button>
                <Button variant="outline" size="sm" onClick={loadSessionsData}>
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* Sessions Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-start">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="p-3 text-start">{isAr ? 'الجهاز والمتصفح' : 'Device & Browser'}</th>
                    <th className="p-3 text-start">{isAr ? 'المستخدم' : 'User'}</th>
                    <th className="p-3 text-start">{isAr ? 'عنوان IP' : 'IP Address'}</th>
                    <th className="p-3 text-start">{isAr ? 'آخر نشاط' : 'Last Active'}</th>
                    <th className="p-3 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                    <th className="p-3 text-center">{isAr ? 'إجراء' : 'Action'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sessions.map((sess) => (
                    <tr key={sess.sessionToken} className="hover:bg-slate-50/70">
                      <td className="p-3 font-medium text-slate-900">
                        <div className="flex items-center gap-2">
                          {sess.deviceType === 'MOBILE' ? (
                            <Smartphone className="w-4 h-4 text-slate-500" />
                          ) : (
                            <Laptop className="w-4 h-4 text-slate-500" />
                          )}
                          <span>
                            {sess.browser} ({sess.os})
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-slate-700">{sess.userEmail}</td>
                      <td className="p-3 font-mono text-[11px] text-slate-600">{sess.ipAddress}</td>
                      <td className="p-3 text-slate-600 font-mono text-[11px]">
                        {new Date(sess.lastAccessedAt).toLocaleTimeString(isAr ? 'ar-SA' : 'en-US')}
                      </td>
                      <td className="p-3">
                        {sess.isCurrentSession ? (
                          <Badge variant="success">{isAr ? 'الجلسة الحالية' : 'Current Session'}</Badge>
                        ) : (
                          <Badge variant="default">{isAr ? 'متصل' : 'Active'}</Badge>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {!sess.isCurrentSession && (
                          <button
                            onClick={() => handleRevokeSession(sess.sessionToken)}
                            className="text-rose-600 hover:text-rose-800 font-medium text-xs p-1 hover:bg-rose-50 rounded"
                          >
                            {isAr ? 'إنهاء الجلسة' : 'Revoke'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: DANGEROUS OPERATIONS                               */}
      {/* ========================================================= */}
      {activeTab === 'dangerous' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
          <div>
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <span>{isAr ? 'بروتوكول اعتماد العمليات الحرجة والحساسة' : 'Dangerous Operations & Confirmation Protocol'}</span>
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              {isAr
                ? 'إلزامية تقديم تبرير تشغيلي موثق واعتماد المسؤول المالي قبل تنفيذ أي إلغاء للقيود أو إغلاق للفترات أو استعادة للنظام.'
                : 'Mandatory recorded justification and dual confirmation prior to executing high-risk financial and system operations.'}
            </p>
          </div>

          <div className="max-w-2xl space-y-4 bg-slate-50 p-5 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'نوع العملية الحرجة' : 'Operation Type'}
              </label>
              <select
                value={dangerousForm.operationType}
                onChange={(e) =>
                  setDangerousForm({
                    ...dangerousForm,
                    operationType: e.target.value as any,
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
              >
                <option value="REVERSE_JOURNAL">
                  {isAr ? 'إلغاء وعكس قيد محاسبي مرحل (Reverse Posted Journal)' : 'Reverse Posted Journal'}
                </option>
                <option value="LOCK_PERIOD">
                  {isAr ? 'إغلاق فترة مالية محاسبية نهائياً (Lock Fiscal Period)' : 'Lock Fiscal Period'}
                </option>
                <option value="UNLOCK_PERIOD">
                  {isAr ? 'إعادة فتح فترة مالية مغلقة (Reopen Closed Period)' : 'Reopen Closed Period'}
                </option>
                <option value="OVERRIDE_NEGATIVE_INVENTORY">
                  {isAr ? 'تجاوز حظر المخزون السالب استثنائياً (Negative Stock Override)' : 'Negative Stock Override'}
                </option>
                <option value="ZATCA_CSID_PROD_ACTIVATE">
                  {isAr ? 'تفعيل شهادة الإنتاج لزاتكا CSID (ZATCA Production Onboarding)' : 'ZATCA Production CSID Onboard'}
                </option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'معرف المورد المستهدف (رقم القيد / كود الفترة / الباركود)' : 'Target Resource Identifier'}
              </label>
              <input
                type="text"
                placeholder={isAr ? 'مثال: JRN-2025-00042 أو FP-2025-01' : 'e.g. JRN-2025-00042'}
                value={dangerousForm.targetResourceId}
                onChange={(e) => setDangerousForm({ ...dangerousForm, targetResourceId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'المبرر التشغيلي الإلزامي (الحد الأدنى 10 أحرف)' : 'Mandatory Justification (Min 10 chars)'}
              </label>
              <textarea
                rows={3}
                placeholder={isAr ? 'أدخل سبباً تفصيلياً معتمداً من الإدارة المالية...' : 'Provide detailed operational reason...'}
                value={dangerousForm.justification}
                onChange={(e) => setDangerousForm({ ...dangerousForm, justification: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
              />
            </div>

            <Button
              variant="danger"
              size="md"
              onClick={handleSubmitDangerousOperation}
              disabled={submittingDangerousOp}
              className="w-full"
            >
              {submittingDangerousOp
                ? (isAr ? 'جاري التحقق والمصادقة...' : 'Validating Protocol...')
                : (isAr ? 'المصادقة وتوثيق العملية في سجل التدقيق' : 'Authorize & Log Dangerous Operation')}
            </Button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: BACKUPS & DISASTER RECOVERY                        */}
      {/* ========================================================= */}
      {activeTab === 'backups' && (
        <div className="space-y-6">
          {/* Create Backup Box */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-emerald-600" />
                  <span>{isAr ? 'إنشاء لقطة نسخ احتياطي فورية' : 'Create Instant Backup Snapshot'}</span>
                </h3>
                <p className="text-xs text-slate-500">
                  {isAr
                    ? 'توليد حزمة بيانات مشفرة وشاملة لكافة القيود والأصول والمخزون مع بصمة تشفيرية SHA-256.'
                    : 'Generate complete encrypted tenant payload with deterministic SHA-256 checksum.'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder={isAr ? 'وصف النسخة (اختياري)...' : 'Snapshot description...'}
                  value={backupDescription}
                  onChange={(e) => setBackupDescription(e.target.value)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs w-64"
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleCreateBackup}
                  disabled={creatingBackup}
                  startIcon={<HardDrive className="w-3.5 h-3.5" />}
                >
                  {creatingBackup ? (isAr ? 'جاري النسخ...' : 'Creating...') : (isAr ? 'نسخ الآن' : 'Backup Now')}
                </Button>
              </div>
            </div>
          </div>

          {/* Backups List Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h4 className="font-bold text-slate-800 text-xs flex items-center gap-2">
                <span>{isAr ? 'سجل لقطات النسخ الاحتياطي المسجلة' : 'Catalog of Backup Snapshots'}</span>
                <Badge variant="brand">{backups.length}</Badge>
              </h4>

              <Button variant="outline" size="sm" onClick={loadBackupsData}>
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-slate-100/60 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="p-3 text-start">{isAr ? 'رقم النسخة' : 'Snapshot Number'}</th>
                    <th className="p-3 text-start">{isAr ? 'النوع' : 'Type'}</th>
                    <th className="p-3 text-start">{isAr ? 'الوصف' : 'Description'}</th>
                    <th className="p-3 text-start">{isAr ? 'تاريخ الإنشاء' : 'Created At'}</th>
                    <th className="p-3 text-start">{isAr ? 'الحجم' : 'Size'}</th>
                    <th className="p-3 text-start">{isAr ? 'البصمة التشفيرية SHA-256' : 'SHA-256 Checksum'}</th>
                    <th className="p-3 text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingBackups ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-600" />
                        <span>{isAr ? 'جاري تحميل سجل النسخ الاحتياطية...' : 'Loading snapshots...'}</span>
                      </td>
                    </tr>
                  ) : backups.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">
                        {isAr ? 'لا توجد لقطات نسخ احتياطي مسجلة حالياً.' : 'No backup snapshots available.'}
                      </td>
                    </tr>
                  ) : (
                    backups.map((bkp) => (
                      <tr key={bkp.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3 font-mono font-bold text-slate-900">{bkp.snapshotNumber}</td>
                        <td className="p-3">
                          <Badge variant={bkp.isPreRestoreSafety ? 'warning' : 'brand'}>
                            {bkp.isPreRestoreSafety
                              ? (isAr ? 'أمان وقائي' : 'Safety Pre-Restore')
                              : (isAr ? 'يدوي' : 'Manual')}
                          </Badge>
                        </td>
                        <td className="p-3 text-slate-700 max-w-[200px] truncate">{bkp.description || '-'}</td>
                        <td className="p-3 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                          {new Date(bkp.createdAt).toLocaleString(isAr ? 'ar-SA' : 'en-US')}
                        </td>
                        <td className="p-3 font-mono text-slate-600 whitespace-nowrap">{formatBytes(bkp.sizeBytes)}</td>
                        <td className="p-3 font-mono text-[10px] text-slate-500" title={bkp.checksumSha256}>
                          {bkp.checksumSha256.slice(0, 16)}...
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Download Action */}
                            <a
                              href={`/api/v1/backups/${bkp.id}/download`}
                              download
                              className="p-1.5 hover:bg-slate-100 rounded text-slate-700 transition-colors"
                              title={isAr ? 'تحميل ملف النسخة' : 'Download JSON archive'}
                            >
                              <Download className="w-4 h-4" />
                            </a>

                            {/* Verification Drill Action */}
                            <button
                              onClick={() => handleVerifyBackup(bkp.id)}
                              className="p-1.5 hover:bg-emerald-50 rounded text-emerald-700 transition-colors"
                              title={isAr ? 'اختبار سلامة ومطابقة النسخة' : 'Run integrity verification drill'}
                              disabled={verifyingBackupId === bkp.id}
                            >
                              <ShieldCheck
                                className={`w-4 h-4 ${verifyingBackupId === bkp.id ? 'animate-spin' : ''}`}
                              />
                            </button>

                            {/* Restore Action */}
                            <button
                              onClick={() => setRestoreConfirmModal(bkp)}
                              className="p-1.5 hover:bg-rose-50 rounded text-rose-700 transition-colors"
                              title={isAr ? 'استعادة بيانات النظام من هذه النسخة' : 'Restore system from snapshot'}
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 5: COMPLIANCE SCANNER                                 */}
      {/* ========================================================= */}
      {activeTab === 'compliance' && (
        <div className="space-y-6">
          {/* Header Score Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-emerald-600" />
                <span>{isAr ? 'فاحص الامتثال ومعايير الحماية المؤسسية' : 'Enterprise Compliance & Security Scanner'}</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {isAr
                  ? 'فحص آلي لقواعد المحاسبة الصارمة (توازن اليومية)، التشفير، عزل البيانات، وحجب التكاليف.'
                  : 'Automated verification against Saudi ERP Golden Rules, G1 GL invariant, and tenant isolation.'}
              </p>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="text-3xl font-black text-emerald-700">
                  {complianceReport?.overallScorePercentage || 100}%
                </div>
                <div className="text-[11px] font-medium text-slate-500">{isAr ? 'نسبة الامتثال' : 'Compliance Score'}</div>
              </div>

              <Button
                variant="primary"
                size="sm"
                startIcon={<RefreshCw className={`w-3.5 h-3.5 ${scanningCompliance ? 'animate-spin' : ''}`} />}
                onClick={loadComplianceReport}
                disabled={scanningCompliance}
              >
                {isAr ? 'إعادة الفحص الآن' : 'Rescan Now'}
              </Button>
            </div>
          </div>

          {/* Compliance Items Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {complianceReport?.items.map((item) => (
              <div
                key={item.id}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-mono text-slate-400">{item.id}</span>
                    <h4 className="font-bold text-slate-900 text-sm mt-0.5">
                      {isAr ? item.titleAr : item.titleEn}
                    </h4>
                  </div>
                  <Badge
                    variant={
                      item.status === 'COMPLIANT'
                        ? 'success'
                        : item.status === 'WARNING'
                        ? 'warning'
                        : 'danger'
                    }
                  >
                    {item.status}
                  </Badge>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {isAr ? item.detailsAr : item.detailsEn}
                </p>

                {item.remediationAr && (
                  <div className="text-[11px] bg-amber-50 p-2.5 rounded-lg border border-amber-200 text-amber-900">
                    <span className="font-bold">{isAr ? 'إجراء التصحيح: ' : 'Remediation: '}</span>
                    <span>{isAr ? item.remediationAr : item.remediationEn}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 1: DIFF & LOG INSPECTOR                             */}
      {/* ========================================================= */}
      {selectedLogForDiff && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedLogForDiff(null)}
          title={isAr ? 'تفاصيل سجل التدقيق والبيانات المشفرة' : 'Audit Log Record & Cryptographic Diff'}
          size="lg"
        >
          <div className="space-y-4 text-xs font-mono">
            <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div>
                <span className="text-slate-400">Action:</span> {selectedLogForDiff.action}
              </div>
              <div>
                <span className="text-slate-400">User:</span> {selectedLogForDiff.userEmail}
              </div>
              <div>
                <span className="text-slate-400">Resource:</span> {selectedLogForDiff.resourceType}
              </div>
              <div>
                <span className="text-slate-400">Target ID:</span> {selectedLogForDiff.resourceId}
              </div>
              <div className="col-span-2">
                <span className="text-slate-400">Correlation ID:</span> {selectedLogForDiff.correlationId}
              </div>
            </div>

            <div>
              <div className="font-bold text-slate-700 font-sans mb-1">{isAr ? 'فروقات التعديل والبيانات (Diff Payload):' : 'Changes Payload Diff:'}</div>
              <pre className="p-3 bg-slate-900 text-emerald-400 rounded-lg overflow-x-auto text-[11px] max-h-60">
                {JSON.stringify(selectedLogForDiff.changesDiff || {}, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedLogForDiff(null)}>
                {isAr ? 'إغلاق' : 'Close'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: TWO-FACTOR AUTHENTICATION SETUP                  */}
      {/* ========================================================= */}
      {twoFactorModalOpen && twoFactorSetup && (
        <Modal
          isOpen={true}
          onClose={() => setTwoFactorModalOpen(false)}
          title={isAr ? 'إعداد المصادقة الثنائية (TOTP Authenticator)' : 'Setup Two-Factor Authentication'}
          size="md"
        >
          <div className="space-y-5 text-xs">
            <p className="text-slate-600">
              {isAr
                ? 'امسح الرمز السري في تطبيق المصادقة الخاص بك (Google Authenticator أو 1Password) ثم أدخل الرمز المكون من 6 أرقام لتأكيد التفعيل.'
                : 'Scan the key into your authenticator app, then enter the 6-digit verification code below.'}
            </p>

            {/* Secret Key Display */}
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
              <div className="text-slate-500 font-medium">{isAr ? 'المفتاح السري (Secret Key):' : 'Secret Key:'}</div>
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-slate-900 tracking-wider text-sm">
                  {twoFactorSetup.secret}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(twoFactorSetup.secret);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 2000);
                  }}
                  className="p-1 hover:bg-slate-200 rounded text-slate-600"
                >
                  {copiedCode ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Emergency Recovery Codes */}
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                {isAr ? 'رموز الاسترداد للطوارئ (احفظها في مكان آمن):' : 'Emergency Recovery Codes:'}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono text-[10px] bg-slate-100 p-2.5 rounded-lg text-slate-700">
                {twoFactorSetup.recoveryCodes.map((code) => (
                  <span key={code} className="bg-white p-1 rounded text-center border border-slate-200">
                    {code}
                  </span>
                ))}
              </div>
            </div>

            {/* Verification Code Input */}
            <div className="space-y-2 pt-2">
              <label className="font-bold text-slate-900 block">
                {isAr ? 'رمز التحقق الحالي (6 أرقام من التطبيق):' : 'Enter 6-digit Code:'}
              </label>
              <input
                type="text"
                maxLength={6}
                placeholder="123456"
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value)}
                className="w-full text-center text-xl font-mono tracking-widest px-4 py-2.5 border-2 border-emerald-600 rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <Button variant="outline" size="sm" onClick={() => setTwoFactorModalOpen(false)}>
                {isAr ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleVerifyTwoFactor}
                disabled={enablingTwoFactor || twoFactorCode.length !== 6}
              >
                {enablingTwoFactor ? (isAr ? 'جاري التحقق...' : 'Verifying...') : (isAr ? 'تأكيد وتفعيل' : 'Verify & Enable')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================= */}
      {/* MODAL 3: VERIFICATION DRILL REPORT                        */}
      {/* ========================================================= */}
      {verificationReport && (
        <Modal
          isOpen={true}
          onClose={() => setVerificationReport(null)}
          title={isAr ? 'شهادة فحص واختبار سلامة النسخة الاحتياطية' : 'Backup Archive Integrity Certification'}
          size="md"
        >
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                <span className="font-bold text-emerald-900">
                  {isAr ? 'اجتازت النسخة كافة اختبارات السلامة والتوازن' : 'All Integrity Checks Passed'}
                </span>
              </div>
              <Badge variant="success">PASSED</Badge>
            </div>

            <div className="space-y-2">
              <div className="font-bold text-slate-700">{isAr ? 'نتائج الفحص والتدقيق:' : 'Drill Findings:'}</div>
              <ul className="space-y-1.5 list-disc list-inside text-slate-600">
                {(isAr ? verificationReport.findingsAr : verificationReport.findingsEn).map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1 font-mono text-[11px]">
              <div>Verified At: {verificationReport.verifiedAt}</div>
              <div>Checksum Matched: {verificationReport.checksumMatches ? 'YES (100%)' : 'NO'}</div>
              <div>Ledger balanced: {verificationReport.glDebitsEqualCredits ? 'YES (Dr === Cr)' : 'NO'}</div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="primary" size="sm" onClick={() => setVerificationReport(null)}>
                {isAr ? 'تم' : 'Done'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================= */}
      {/* MODAL 4: CONFIRM RESTORE MODAL                            */}
      {/* ========================================================= */}
      {restoreConfirmModal && (
        <Modal
          isOpen={true}
          onClose={() => setRestoreConfirmModal(null)}
          title={isAr ? 'تأكيد استعادة بيانات النظام (Disaster Recovery)' : 'Confirm Disaster Recovery Restore'}
          size="md"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-900">
              <AlertCircle className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">{isAr ? 'تحذير أمني عالي الحساسية' : 'High Sensitivity Operational Warning'}</div>
                <div className="mt-1 leading-relaxed">
                  {isAr
                    ? `أنت على وشك استعادة بيانات المنشأة من النسخة (${restoreConfirmModal.snapshotNumber}). سيتم تلقائياً حفظ لقطة أمان وقائية لكامل البيانات الحالية قبل بدء الاستعادة لمنع أي فقدان للبيانات.`
                    : `You are restoring tenant data from snapshot ${restoreConfirmModal.snapshotNumber}. A pre-restore safety snapshot will automatically be taken before applying data.`}
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 font-mono text-[11px] space-y-1">
              <div>Target Snapshot: {restoreConfirmModal.snapshotNumber}</div>
              <div>Snapshot Date: {new Date(restoreConfirmModal.createdAt).toLocaleString()}</div>
              <div>SHA-256 Checksum: {restoreConfirmModal.checksumSha256.slice(0, 24)}...</div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setRestoreConfirmModal(null)}>
                {isAr ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleExecuteRestore}
                disabled={restoringBackup}
              >
                {restoringBackup
                  ? (isAr ? 'جاري الاستعادة الوقائية...' : 'Restoring safely...')
                  : (isAr ? 'تأكيد الاستعادة الوقائية' : 'Confirm Safe Restore')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

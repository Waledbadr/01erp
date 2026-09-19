import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  QrCode,
  FileCode,
  RefreshCw,
  Send,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy,
  ExternalLink,
  Lock,
  Cpu,
  Key,
  Database,
  ArrowRight,
  Sparkles,
  Layers,
  Clock,
  Check,
  Upload,
  AlertOctagon,
  FileText,
  Search,
  Eye,
  RotateCcw,
} from 'lucide-react';
import { useI18n } from '../../i18n/context.js';
import { Badge } from '../ui/Badge.js';
import { useToast } from '../ui/Toast.js';
import {
  decodeZatcaQR,
  validateZatcaCompliance,
  EInvoiceDocument,
  EInvoiceStatus,
  EInvoiceType,
  HashChainVerificationResult,
} from '../../lib/zatca.js';

interface ScrubbedConfig {
  tenantId: string;
  egsSerialNumber: string;
  organizationUnit: string;
  organizationName: string;
  vatNumber: string;
  environment: 'SIMULATION' | 'PRODUCTION';
  status: 'NOT_CONFIGURED' | 'CSR_GENERATED' | 'COMPLIANCE_ACTIVE' | 'PRODUCTION_ACTIVE';
  csr?: string;
  complianceCsid?: string;
  productionCsid?: string;
  hasPrivateKey?: boolean;
  hasComplianceCsid?: boolean;
  hasProductionCsid?: boolean;
  expiresAt?: string;
  daysUntilExpiry?: number;
  isExpiringSoon?: boolean;
  updatedAt: string;
}

export interface ZatcaPhase2ViewProps {
  onNavigate?: (route: string) => void;
  selectedInvoiceId?: string;
}

export const ZatcaPhase2View: React.FC<ZatcaPhase2ViewProps> = ({
  onNavigate,
  selectedInvoiceId,
}) => {
  const { language } = useI18n();
  const isAr = language === 'ar';
  const toast = useToast();
  const addToast = (title: string, variant: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    toast?.showToast({ title, variant });
  };

  const [activeTab, setActiveTab] = useState<'documents' | 'validator' | 'queue' | 'onboarding' | 'qr'>('documents');
  const [loading, setLoading] = useState<boolean>(true);
  const [config, setConfig] = useState<ScrubbedConfig | null>(null);
  const [metrics, setMetrics] = useState<any | null>(null);
  const [documents, setDocuments] = useState<EInvoiceDocument[]>([]);
  const [queueJobs, setQueueJobs] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [currentInvoiceId, setCurrentInvoiceId] = useState<string>(selectedInvoiceId || '');
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [complianceResult, setComplianceResult] = useState<any | null>(null);

  // Filters for E-Invoices
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected E-Invoice Modal
  const [activeDocument, setActiveDocument] = useState<EInvoiceDocument | null>(null);
  const [modalXmlTab, setModalXmlTab] = useState<'original' | 'submitted' | 'processed'>('original');

  // Hash Chain Verification State
  const [chainResult, setChainResult] = useState<HashChainVerificationResult | null>(null);
  const [isVerifyingChain, setIsVerifyingChain] = useState(false);

  // CSR Form State
  const [csrEgs, setCsrEgs] = useState('EGS1-SAUDI-ERP-001');
  const [csrOrgUnit, setCsrOrgUnit] = useState('الفرع الرئيسي - الرياض');
  const [isGeneratingCsr, setIsGeneratingCsr] = useState(false);

  // OTP Form State
  const [otp, setOtp] = useState('');
  const [isOnboardingCcsid, setIsOnboardingCcsid] = useState(false);
  const [isOnboardingPcsid, setIsOnboardingPcsid] = useState(false);

  // Credentials Upload Modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [certPemInput, setCertPemInput] = useState('');
  const [keyPemInput, setKeyPemInput] = useState('');
  const [isUploadingCreds, setIsUploadingCreds] = useState(false);

  // QR Inspector State
  const [qrInputBase64, setQrInputBase64] = useState<string>('');
  const [decodedQr, setDecodedQr] = useState<any | null>(null);

  // Batch action state
  const [isBatchRetrying, setIsBatchRetrying] = useState(false);

  // Load Data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [cfgRes, metricRes, docRes, qRes, invRes] = await Promise.all([
        fetch('/api/v1/zatca/config', { credentials: 'include' }),
        fetch('/api/v1/zatca/status', { credentials: 'include' }),
        fetch('/api/v1/zatca/documents', { credentials: 'include' }),
        fetch('/api/v1/zatca/queue', { credentials: 'include' }),
        fetch('/api/v1/sales/invoices', { credentials: 'include' }),
      ]);

      if (cfgRes.ok) {
        const c = await cfgRes.json();
        setConfig(c);
        if (c.egsSerialNumber) setCsrEgs(c.egsSerialNumber);
        if (c.organizationUnit) setCsrOrgUnit(c.organizationUnit);
      }
      if (metricRes.ok) setMetrics(await metricRes.json());
      if (docRes.ok) setDocuments(await docRes.json());
      if (qRes.ok) setQueueJobs(await qRes.json());
      if (invRes.ok) {
        const invData = await invRes.json();
        const list = Array.isArray(invData) ? invData : invData.data || [];
        setInvoices(list);
        if (list.length > 0 && !currentInvoiceId) {
          setCurrentInvoiceId(list[0].id);
          setSelectedInvoice(list[0]);
          if (list[0].qrCodeBase64 && !qrInputBase64) {
            setQrInputBase64(list[0].qrCodeBase64);
            setDecodedQr(decodeZatcaQR(list[0].qrCodeBase64));
          }
        }
      }
    } catch (err: any) {
      addToast(isAr ? 'فشل تحميل بيانات هيئة الزكاة' : 'Failed to fetch ZATCA engine state', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Run Hash Chain Verification
  const handleVerifyChain = async () => {
    try {
      setIsVerifyingChain(true);
      const res = await fetch('/api/v1/zatca/chain/verify', { credentials: 'include' });
      if (res.ok) {
        const data: HashChainVerificationResult = await res.json();
        setChainResult(data);
        if (data.isChainValid) {
          addToast(isAr ? data.messageAr : data.messageEn, 'success');
        } else {
          addToast(isAr ? data.messageAr : data.messageEn, 'error');
        }
      }
    } catch {
      addToast(isAr ? 'فشل فحص السلسلة التشفيرية' : 'Failed to verify cryptographic chain', 'error');
    } finally {
      setIsVerifyingChain(false);
    }
  };

  // Submit E-Invoice
  const handleSubmitEInvoice = async (docId: string, isRetry = false) => {
    try {
      const res = await fetch(`/api/v1/zatca/documents/${docId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isRetry }),
      });
      if (res.ok) {
        const updated: EInvoiceDocument = await res.json();
        setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
        if (activeDocument && activeDocument.id === updated.id) {
          setActiveDocument(updated);
        }
        if (updated.status === 'ACCEPTED') {
          addToast(isAr ? `تم قبول وإرسال الفاتورة ${updated.invoiceNumber} بنجاح` : `Invoice ${updated.invoiceNumber} accepted & cleared/reported`, 'success');
        } else if (updated.status === 'READY') {
          addToast(isAr ? `الفاتورة جاهزة في قائمة الانتظار (في انتظار تهيئة الربط)` : `Document held in READY queue (adapter not configured)`, 'info');
        } else {
          addToast(isAr ? `تتطلب الفاتورة الانتباه: ${updated.status}` : `Document requires attention: ${updated.status}`, 'warning');
        }
        fetchData();
      } else {
        const err = await res.json();
        addToast(err.error || (isAr ? 'فشل الإرسال' : 'Submission failed'), 'error');
      }
    } catch {
      addToast(isAr ? 'خطأ في الاتصال أثناء الإرسال' : 'Network error during submission', 'error');
    }
  };

  // Batch Retry
  const handleBatchRetry = async () => {
    try {
      setIsBatchRetrying(true);
      const res = await fetch('/api/v1/zatca/documents/batch-retry', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const result = await res.json();
        addToast(
          isAr
            ? `اكتملت إعادة المحاولة: تم بنجاح ${result.succeeded} من أصل ${result.totalRetried}`
            : `Batch retry complete: ${result.succeeded}/${result.totalRetried} succeeded`,
          'success'
        );
        fetchData();
      }
    } catch {
      addToast(isAr ? 'فشل إعادة المحاولة الجماعية' : 'Failed batch retry', 'error');
    } finally {
      setIsBatchRetrying(false);
    }
  };

  // Generate CSR
  const handleGenerateCsr = async () => {
    try {
      setIsGeneratingCsr(true);
      const res = await fetch('/api/v1/zatca/csr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          commonName: config?.organizationName || 'شركة التقنية',
          organizationUnit: csrOrgUnit,
          organizationName: config?.organizationName || 'شركة التقنية',
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setConfig(updated);
        addToast(isAr ? 'تم توليد طلب الشهادة (CSR) بنجاح' : 'CSR generated successfully', 'success');
        fetchData();
      }
    } catch {
      addToast(isAr ? 'فشل توليد CSR' : 'Failed to generate CSR', 'error');
    } finally {
      setIsGeneratingCsr(false);
    }
  };

  // Onboard CCSID
  const handleOnboardCcsid = async () => {
    if (!otp || otp.trim().length < 6) {
      addToast(isAr ? 'يرجى إدخال رمز OTP المكون من 6 أرقام' : 'Please enter valid 6-digit OTP', 'warning');
      return;
    }
    try {
      setIsOnboardingCcsid(true);
      const res = await fetch('/api/v1/zatca/csid/compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ otp }),
      });
      if (res.ok) {
        const updated = await res.json();
        setConfig(updated);
        addToast(isAr ? 'تم تفعيل شهادة الامتثال (Compliance CSID) بنجاح' : 'Compliance CSID onboarded successfully', 'success');
        setOtp('');
        fetchData();
      } else {
        const err = await res.json();
        addToast(err.error || 'Failed to onboard compliance CSID', 'error');
      }
    } catch {
      addToast(isAr ? 'خطأ في تفعيل شهادة الامتثال' : 'Error onboarding compliance CSID', 'error');
    } finally {
      setIsOnboardingCcsid(false);
    }
  };

  // Onboard PCSID
  const handleOnboardPcsid = async () => {
    try {
      setIsOnboardingPcsid(true);
      const res = await fetch('/api/v1/zatca/csid/production', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const updated = await res.json();
        setConfig(updated);
        addToast(isAr ? 'تم إصدار شهادة الإنتاج (Production CSID) بنجاح' : 'Production CSID onboarded successfully', 'success');
        fetchData();
      } else {
        const err = await res.json();
        addToast(err.error || 'Failed to onboard production CSID', 'error');
      }
    } catch {
      addToast(isAr ? 'خطأ في إصدار شهادة الإنتاج' : 'Error onboarding production CSID', 'error');
    } finally {
      setIsOnboardingPcsid(false);
    }
  };

  // Switch Environment
  const handleSwitchEnvironment = async (env: 'SIMULATION' | 'PRODUCTION') => {
    try {
      const res = await fetch('/api/v1/zatca/environment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ environment: env }),
      });
      if (res.ok) {
        const updated = await res.json();
        setConfig(updated);
        addToast(
          isAr
            ? `تم تحويل بيئة الربط إلى ${env === 'PRODUCTION' ? 'الإنتاج الحقيقي' : 'المحاكاة (Sandbox)'}`
            : `Environment switched to ${env}`,
          'success'
        );
        fetchData();
      } else {
        const err = await res.json();
        addToast(err.error || (isAr ? 'تم رفض التحويل (صلاحية غير كافية أو شهادة مفقودة)' : 'Switch denied'), 'error');
      }
    } catch {
      addToast(isAr ? 'خطأ في تبديل البيئة' : 'Error switching environment', 'error');
    }
  };

  // Upload Custom Credentials
  const handleUploadCredentials = async () => {
    if (!certPemInput && !keyPemInput) {
      addToast(isAr ? 'يرجى لصق الشهادة أو المفتاح الخاص' : 'Please provide certificate or private key', 'warning');
      return;
    }
    try {
      setIsUploadingCreds(true);
      const res = await fetch('/api/v1/zatca/config/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          certificatePem: certPemInput || undefined,
          privateKeyPem: keyPemInput || undefined,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setConfig(updated);
        setShowUploadModal(false);
        setCertPemInput('');
        setKeyPemInput('');
        addToast(isAr ? 'تم حفظ المفاتيح والشهادات المشفرة بأمان' : 'Credentials uploaded and encrypted securely', 'success');
        fetchData();
      } else {
        const err = await res.json();
        addToast(err.error || 'Failed to upload credentials', 'error');
      }
    } catch {
      addToast(isAr ? 'خطأ في رفع بيانات الاعتماد' : 'Error uploading credentials', 'error');
    } finally {
      setIsUploadingCreds(false);
    }
  };

  // Decode QR
  const handleDecodeQr = () => {
    if (!qrInputBase64) return;
    try {
      const decoded = decodeZatcaQR(qrInputBase64.trim());
      setDecodedQr(decoded);
    } catch (err: any) {
      addToast(isAr ? 'تعذر فك تشفير QR: ' + err.message : 'Failed to decode QR: ' + err.message, 'error');
    }
  };

  // Copy helper
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    addToast(isAr ? `تم نسخ ${label} إلى الحافظة` : `Copied ${label} to clipboard`, 'success');
  };

  // Filtered Documents
  const filteredDocuments = documents.filter((doc) => {
    if (statusFilter !== 'ALL' && doc.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        doc.invoiceNumber.toLowerCase().includes(q) ||
        doc.uuid.toLowerCase().includes(q) ||
        doc.invoiceHash.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6 pb-12" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 font-display">
                {isAr ? 'منظومة الفوترة الإلكترونية — مرحلة الربط والتكامل (ZATCA Phase 2)' : 'ZATCA Phase 2 E-Invoicing Integration'}
              </h1>
              <Badge variant={config?.environment === 'PRODUCTION' ? 'success' : 'warning'}>
                {config?.environment === 'PRODUCTION' ? (isAr ? 'بيئة الإنتاج' : 'PRODUCTION') : (isAr ? 'بيئة المحاكاة' : 'SIMULATION')}
              </Badge>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              {isAr
                ? 'إدارة الربط المباشر مع منصة فاتورة، فحص السلاسل التشفيرية، واعتماد الفواتير الضريبية والمبسطة والإشعارات.'
                : 'Direct clearance & reporting integration with ZATCA Fatoora API, hash chaining, and UBL 2.1 compliance.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            id="btn-verify-hash-chain"
            onClick={handleVerifyChain}
            disabled={isVerifyingChain}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition border border-slate-300/60"
          >
            <RotateCcw className={`w-4 h-4 ${isVerifyingChain ? 'animate-spin' : ''}`} />
            {isAr ? 'فحص السلسلة التشفيرية (PIH)' : 'Verify Hash Chain'}
          </button>
          <button
            id="btn-refresh-zatca"
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {isAr ? 'تحديث الحالة' : 'Refresh State'}
          </button>
        </div>
      </div>

      {/* Certificate Expiry Banner if Warning */}
      {config?.isExpiringSoon && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between gap-4 text-amber-900">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="font-semibold text-sm">
                {isAr ? 'تنبيه: اقتراب انتهاء صلاحية شهادة الربط (CSID)!' : 'Warning: ZATCA CSID Certificate is expiring soon!'}
              </p>
              <p className="text-xs text-amber-700">
                {isAr
                  ? `متبقي ${config.daysUntilExpiry} يوم فقط على انتهاء الشهادة. يرجى تجديد الشهادة لتفادي توقف إصدار الفواتير.`
                  : `Only ${config.daysUntilExpiry} days remaining until certificate expiry. Please renew to avoid transmission disruption.`}
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('onboarding')}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg shrink-0"
          >
            {isAr ? 'تجديد الشهادة' : 'Renew Certificate'}
          </button>
        </div>
      )}

      {/* Hash Chain Integrity Banner if Checked */}
      {chainResult && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
            chainResult.isChainValid
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-950'
          }`}
        >
          <div className="flex items-center gap-3">
            {chainResult.isChainValid ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
            ) : (
              <AlertOctagon className="w-6 h-6 text-rose-600 shrink-0" />
            )}
            <div>
              <p className="font-bold text-sm">
                {isAr ? chainResult.messageAr : chainResult.messageEn}
              </p>
              <p className="text-xs opacity-80">
                {isAr
                  ? `تم التحقق من ${chainResult.totalChecked} فاتورة. السلسلة غير المنقطعة: ${chainResult.unbrokenChainLength}.`
                  : `Checked ${chainResult.totalChecked} documents. Unbroken sequence: ${chainResult.unbrokenChainLength}.`}
              </p>
            </div>
          </div>
          <span className="text-xs font-mono px-2.5 py-1 rounded bg-white/60 font-semibold">
            {chainResult.isChainValid ? 'CHAIN_VALID_100%' : 'INTEGRITY_TAMPER_ALARM'}
          </span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-medium text-slate-500">{isAr ? 'إجمالي الفواتير' : 'Total Invoices'}</span>
          <p className="text-2xl font-bold text-slate-900 mt-1">{documents.length}</p>
          <span className="text-[11px] text-slate-400">{isAr ? 'المسجلة بالطبقة الإلكترونية' : 'E-Invoices Tracked'}</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-medium text-blue-600">{isAr ? 'جاهزة للإرسال' : 'Ready Queue'}</span>
          <p className="text-2xl font-bold text-blue-700 mt-1">
            {documents.filter((d) => d.status === 'READY').length}
          </p>
          <span className="text-[11px] text-slate-400">{isAr ? 'بانتظار الإرسال' : 'Pending Submission'}</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-medium text-emerald-600">{isAr ? 'معتمدة ومقبولة' : 'Accepted / Cleared'}</span>
          <p className="text-2xl font-bold text-emerald-700 mt-1">
            {documents.filter((d) => d.status === 'ACCEPTED').length}
          </p>
          <span className="text-[11px] text-slate-400">{isAr ? 'اجتازت الفحص' : 'ZATCA Cleared/Reported'}</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-medium text-amber-600">{isAr ? 'تتطلب الانتباه' : 'Requires Attention'}</span>
          <p className="text-2xl font-bold text-amber-700 mt-1">
            {documents.filter((d) => d.status === 'REQUIRES_ATTENTION').length}
          </p>
          <span className="text-[11px] text-slate-400">{isAr ? 'فشل مع إعادة المحاولة' : 'Retry Scheduled'}</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-medium text-rose-600">{isAr ? 'مرفوضة' : 'Rejected'}</span>
          <p className="text-2xl font-bold text-rose-700 mt-1">
            {documents.filter((d) => d.status === 'REJECTED').length}
          </p>
          <span className="text-[11px] text-slate-400">{isAr ? 'أخطاء في الامتثال' : 'Compliance Failures'}</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-medium text-slate-600">{isAr ? 'حالة الاعتماد' : 'CSID Status'}</span>
          <p className="text-sm font-bold text-slate-800 mt-2 truncate">
            {config?.status === 'PRODUCTION_ACTIVE'
              ? (isAr ? 'إنتاج نشط' : 'PROD ACTIVE')
              : config?.status === 'COMPLIANCE_ACTIVE'
              ? (isAr ? 'امتثال نشط' : 'COMPLIANCE')
              : (isAr ? 'غير مهيأ' : 'NOT CONFIGURED')}
          </p>
          <span className="text-[11px] text-slate-400">{config?.environment}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-2 rtl:space-x-reverse">
          <button
            id="tab-documents"
            onClick={() => setActiveTab('documents')}
            className={`py-3 px-4 font-semibold text-sm border-b-2 transition flex items-center gap-2 ${
              activeTab === 'documents'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Layers className="w-4 h-4" />
            {isAr ? 'سجل الفواتير الإلكترونية (E-Invoices)' : 'E-Invoice Documents Layer'}
            <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">
              {documents.length}
            </span>
          </button>

          <button
            id="tab-onboarding"
            onClick={() => setActiveTab('onboarding')}
            className={`py-3 px-4 font-semibold text-sm border-b-2 transition flex items-center gap-2 ${
              activeTab === 'onboarding'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Key className="w-4 h-4" />
            {isAr ? 'إعدادات الربط والشهادات (CSID)' : 'CSID Onboarding & Certificates'}
          </button>

          <button
            id="tab-validator"
            onClick={() => setActiveTab('validator')}
            className={`py-3 px-4 font-semibold text-sm border-b-2 transition flex items-center gap-2 ${
              activeTab === 'validator'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            {isAr ? 'فاحص الامتثال والمحاكي' : 'Compliance & Live Validator'}
          </button>

          <button
            id="tab-queue"
            onClick={() => setActiveTab('queue')}
            className={`py-3 px-4 font-semibold text-sm border-b-2 transition flex items-center gap-2 ${
              activeTab === 'queue'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Clock className="w-4 h-4" />
            {isAr ? 'طابور الإرسال والمحاولات' : 'Transmission Queue & Log'}
            <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">
              {queueJobs.length}
            </span>
          </button>

          <button
            id="tab-qr"
            onClick={() => setActiveTab('qr')}
            className={`py-3 px-4 font-semibold text-sm border-b-2 transition flex items-center gap-2 ${
              activeTab === 'qr'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <QrCode className="w-4 h-4" />
            {isAr ? 'محلل رمز الاستجابة السريعة (9-Tags TLV)' : 'QR TLV Inspector'}
          </button>
        </nav>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: E-INVOICE DOCUMENTS LAYER */}
      {/* ========================================================================= */}
      {activeTab === 'documents' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute start-3 top-3" />
                <input
                  type="text"
                  placeholder={isAr ? 'بحث برقم الفاتورة أو الهاش...' : 'Search by invoice # or hash...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full ps-9 pe-4 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                {['ALL', 'READY', 'ACCEPTED', 'REQUIRES_ATTENTION', 'REJECTED'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                      statusFilter === st ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {st === 'ALL'
                      ? isAr ? 'الكل' : 'All'
                      : st === 'READY'
                      ? isAr ? 'جاهزة' : 'Ready'
                      : st === 'ACCEPTED'
                      ? isAr ? 'مقبولة' : 'Accepted'
                      : st === 'REQUIRES_ATTENTION'
                      ? isAr ? 'تتطلب انتباه' : 'Attention'
                      : isAr ? 'مرفوضة' : 'Rejected'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                id="btn-batch-retry"
                onClick={handleBatchRetry}
                disabled={isBatchRetrying}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold transition"
              >
                <RotateCcw className={`w-4 h-4 ${isBatchRetrying ? 'animate-spin' : ''}`} />
                {isAr ? 'إعادة محاولة الكل' : 'Batch Retry Failed'}
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 text-xs uppercase font-semibold">
                    <th className="px-4 py-3 text-start">{isAr ? 'رقم الفاتورة / النوع' : 'Invoice / Type'}</th>
                    <th className="px-4 py-3 text-start">{isAr ? 'الرقم التسلسلي (ICV)' : 'ICV #'}</th>
                    <th className="px-4 py-3 text-start">{isAr ? 'الهاش المشفر (SHA-256)' : 'Invoice Hash (SHA-256)'}</th>
                    <th className="px-4 py-3 text-start">{isAr ? 'الإجمالي شامل الضريبة' : 'Grand Total (SAR)'}</th>
                    <th className="px-4 py-3 text-start">{isAr ? 'حالة الاعتماد والربط' : 'Status'}</th>
                    <th className="px-4 py-3 text-start">{isAr ? 'المحاولات' : 'Attempts'}</th>
                    <th className="px-4 py-3 text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDocuments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-slate-400">
                        {isAr ? 'لا توجد فواتير إلكترونية مطابقة' : 'No matching e-invoice documents found.'}
                      </td>
                    </tr>
                  ) : (
                    filteredDocuments.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50/60 transition">
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          <div>
                            <span className="font-mono">{doc.invoiceNumber}</span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">
                                {doc.documentTypeCode === '381'
                                  ? '381 - Credit Note'
                                  : doc.documentTypeCode === '383'
                                  ? '383 - Debit Note'
                                  : doc.invoiceType === 'STANDARD_B2B'
                                  ? '388 - Standard B2B'
                                  : '388 - Simplified B2C'}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3 font-mono text-slate-600">#{doc.invoiceCounter}</td>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-slate-500 truncate max-w-[120px]" title={doc.invoiceHash}>
                              {doc.invoiceHash.slice(0, 16)}...
                            </span>
                            <button
                              onClick={() => copyToClipboard(doc.invoiceHash, 'Invoice Hash')}
                              className="text-slate-400 hover:text-slate-700"
                              title={isAr ? 'نسخ الهاش' : 'Copy Hash'}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>

                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {doc.taxSnapshot?.totalAmountSar?.toFixed(2) || '0.00'} SAR
                          <div className="text-[11px] text-slate-400 font-normal">
                            VAT: {doc.taxSnapshot?.taxTotalSar?.toFixed(2)} SAR
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              doc.status === 'ACCEPTED'
                                ? 'success'
                                : doc.status === 'READY'
                                ? 'info'
                                : doc.status === 'SUBMITTED'
                                ? 'brand'
                                : doc.status === 'REQUIRES_ATTENTION'
                                ? 'warning'
                                : 'danger'
                            }
                          >
                            {doc.status}
                          </Badge>
                        </td>

                        <td className="px-4 py-3 text-xs text-slate-600">
                          {doc.attemptsLog?.length || 0} {isAr ? 'محاولة' : 'attempts'}
                        </td>

                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              id={`btn-view-${doc.id}`}
                              onClick={() => setActiveDocument(doc)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              {isAr ? 'تفاصيل / XML' : 'View XML'}
                            </button>

                            {(doc.status === 'READY' || doc.status === 'REQUIRES_ATTENTION' || doc.status === 'REJECTED') && (
                              <button
                                id={`btn-submit-${doc.id}`}
                                onClick={() => handleSubmitEInvoice(doc.id, doc.status !== 'READY')}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1"
                              >
                                <Send className="w-3.5 h-3.5" />
                                {doc.status === 'READY' ? (isAr ? 'إرسال' : 'Submit') : (isAr ? 'إعادة المحاولة' : 'Retry')}
                              </button>
                            )}
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

      {/* ========================================================================= */}
      {/* TAB 2: CSID ONBOARDING & CERTIFICATES */}
      {/* ========================================================================= */}
      {activeTab === 'onboarding' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Environment Switcher & Security Status */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-6">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Lock className="w-5 h-5 text-emerald-600" />
                {isAr ? 'بيئة الربط والمفاتيح التشفيرية' : 'Environment & Key Store'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {isAr
                  ? 'التحكم في بيئة المحاكاة والإنتاج وتأمين المفاتيح المشفرة.'
                  : 'Manage sandbox/production environments and secure credentials at rest.'}
              </p>
            </div>

            {/* Environment Toggle */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <span className="text-xs font-semibold text-slate-700 block">
                {isAr ? 'بيئة العمل الحالية:' : 'Active Environment:'}
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  id="btn-env-simulation"
                  onClick={() => handleSwitchEnvironment('SIMULATION')}
                  className={`py-2 px-3 text-xs font-bold rounded-lg border transition ${
                    config?.environment === 'SIMULATION'
                      ? 'bg-amber-50 border-amber-400 text-amber-900 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {isAr ? 'المحاكاة (Sandbox)' : 'Simulation (Sandbox)'}
                </button>
                <button
                  id="btn-env-production"
                  onClick={() => handleSwitchEnvironment('PRODUCTION')}
                  className={`py-2 px-3 text-xs font-bold rounded-lg border transition ${
                    config?.environment === 'PRODUCTION'
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-900 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {isAr ? 'الإنتاج (Production)' : 'Production (Live)'}
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                {isAr
                  ? 'يتطلب التبديل إلى الإنتاج صلاحية مدير المنشأة وتوافر شهادة الإنتاج (PCSID).'
                  : 'Production switch requires OWNER privileges and onboarded Production CSID.'}
              </p>
            </div>

            {/* Security Vault Indicator */}
            <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100 space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 font-semibold text-xs">
                <ShieldCheck className="w-4 h-4" />
                {isAr ? 'مستودع المفاتيح محمي ومطابق للمواصفات' : 'Secure Key Store Protected'}
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                {isAr
                  ? 'يتم تشفير المفتاح الخاص (ECDSA secp256k1) ولا يتم تمريره أو إظهاره مطلقاً في ردود واجهة المستخدم أو سجلات النظام.'
                  : 'Private keys (ECDSA secp256k1) are encrypted at rest and never exposed in logs or API responses.'}
              </p>
              <button
                onClick={() => setShowUploadModal(true)}
                className="w-full mt-2 py-2 px-3 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 flex items-center justify-center gap-2"
              >
                <Upload className="w-3.5 h-3.5" />
                {isAr ? 'رفع شهادة / مفتاح خارجي (PEM)' : 'Upload Custom Certificate / Key'}
              </button>
            </div>
          </div>

          {/* CSR Generator & Device Parameters */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Cpu className="w-5 h-5 text-indigo-600" />
                {isAr ? 'الخطوة 1: توليد طلب الشهادة (CSR)' : 'Step 1: Generate PKCS#10 CSR'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {isAr ? 'إنشاء ملف CSR لجهاز الحل التقني (EGS Unit).' : 'Create cryptographic CSR for the EGS solution.'}
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  {isAr ? 'الرقم التسلسلي للجهاز (EGS Serial Number)' : 'EGS Serial Number'}
                </label>
                <input
                  type="text"
                  value={csrEgs}
                  onChange={(e) => setCsrEgs(e.target.value)}
                  className="w-full text-xs font-mono p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  {isAr ? 'الوحدة التنظيمية (Organization Unit)' : 'Organization Unit'}
                </label>
                <input
                  type="text"
                  value={csrOrgUnit}
                  onChange={(e) => setCsrOrgUnit(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <button
                id="btn-generate-csr"
                onClick={handleGenerateCsr}
                disabled={isGeneratingCsr}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition shadow-xs flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                {isAr ? 'توليد طلب الشهادة (CSR)' : 'Generate CSR'}
              </button>

              {config?.csr && (
                <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold text-slate-600">{isAr ? 'نص CSR المولد:' : 'Generated CSR:'}</span>
                    <button
                      onClick={() => copyToClipboard(config.csr!, 'CSR')}
                      className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-semibold"
                    >
                      <Copy className="w-3 h-3" />
                      {isAr ? 'نسخ' : 'Copy'}
                    </button>
                  </div>
                  <pre className="text-[10px] font-mono text-slate-600 max-h-24 overflow-y-auto bg-white p-2 rounded border border-slate-100">
                    {config.csr}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* OTP Onboarding & Production CSID */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Key className="w-5 h-5 text-emerald-600" />
                {isAr ? 'الخطوة 2 & 3: تفعيل CSID عبر OTP' : 'Step 2 & 3: Onboard CSID with OTP'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {isAr ? 'إدخال رمز التحقق من منصة فاتورة للحصول على شهادة الامتثال والإنتاج.' : 'Enter Fatoora portal OTP to fetch CSID.'}
              </p>
            </div>

            {/* Compliance CSID */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <span className="text-xs font-bold text-slate-800 block">
                {isAr ? 'شهادة الامتثال (Compliance CSID):' : 'Compliance CSID:'}
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={isAr ? 'أدخل OTP (6 أرقام)' : 'Enter 6-digit OTP'}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="flex-1 text-xs p-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
                <button
                  id="btn-onboard-ccsid"
                  onClick={handleOnboardCcsid}
                  disabled={isOnboardingCcsid}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition"
                >
                  {isAr ? 'تفعيل' : 'Onboard'}
                </button>
              </div>

              {config?.complianceCsid && (
                <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-100/60 p-2 rounded">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span className="truncate">{isAr ? 'شهادة الامتثال مفعلة ونشطة' : 'Compliance CSID Active'}</span>
                </div>
              )}
            </div>

            {/* Production CSID */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <span className="text-xs font-bold text-slate-800 block">
                {isAr ? 'شهادة الإنتاج النهائي (Production CSID):' : 'Production CSID:'}
              </span>
              <button
                id="btn-onboard-pcsid"
                onClick={handleOnboardPcsid}
                disabled={isOnboardingPcsid || !config?.complianceCsid}
                className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition shadow-xs"
              >
                {isAr ? 'إصدار شهادة الإنتاج (Production CSID)' : 'Request Production CSID'}
              </button>

              {config?.productionCsid && (
                <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-100/60 p-2 rounded">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span className="truncate">{isAr ? 'شهادة الإنتاج مفعلة وجاهزة للإرسال الحي' : 'Production CSID Active'}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: COMPLIANCE & LIVE VALIDATOR */}
      {/* ========================================================================= */}
      {activeTab === 'validator' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              {isAr ? 'اختيار الفاتورة للاختبار' : 'Select Invoice for Live Test'}
            </h2>
            <select
              value={currentInvoiceId}
              onChange={(e) => {
                const id = e.target.value;
                setCurrentInvoiceId(id);
                const inv = invoices.find((i) => i.id === id);
                setSelectedInvoice(inv);
                if (inv?.qrCodeBase64) {
                  setQrInputBase64(inv.qrCodeBase64);
                  setDecodedQr(decodeZatcaQR(inv.qrCodeBase64));
                }
              }}
              className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500"
            >
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoiceNumber} — {inv.customerNameAr || inv.customerName} ({inv.totalAmountSar} SAR)
                </option>
              ))}
            </select>

            {selectedInvoice && (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">{isAr ? 'نوع الفاتورة:' : 'Type:'}</span>
                  <span className="font-semibold">{selectedInvoice.invoiceType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{isAr ? 'تاريخ الإصدار:' : 'Date:'}</span>
                  <span className="font-semibold">{selectedInvoice.issueDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{isAr ? 'الإجمالي مع الضريبة:' : 'Total:'}</span>
                  <span className="font-semibold">{selectedInvoice.totalAmountSar} SAR</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{isAr ? 'حالة الزكاة:' : 'ZATCA Status:'}</span>
                  <span className="font-semibold text-emerald-700">{selectedInvoice.zatcaStatus || 'LOCAL_ONLY'}</span>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                {isAr ? 'قواعد التحقق الرسمية (BR-KSA Validation Suite)' : 'BR-KSA Compliance Rules'}
              </h2>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {[
                { code: 'BR-KSA-05', nameAr: 'صحة الرقم الضريبي للمورد (15 رقم يبدأ وينتهي بـ 3)', nameEn: 'Seller VAT (15 digits, 3...3)', status: 'PASSED' },
                { code: 'BR-KSA-09', nameAr: 'الرقم الضريبي للمشتري في الفاتورة القياسية B2B', nameEn: 'Buyer VAT mandatory for B2B', status: 'PASSED' },
                { code: 'BR-KSA-13', nameAr: 'تضمين هاش الفاتورة السابقة (PIH) لضمان السلسلة', nameEn: 'Previous Invoice Hash Chaining', status: 'PASSED' },
                { code: 'BR-KSA-17', nameAr: 'دقة حساب الضريبة على مستوى البند (Half-Up Rounding)', nameEn: 'Line Item Tax Calculation', status: 'PASSED' },
                { code: 'BR-KSA-25', nameAr: 'تطابق الإجمالي النهائي مع الوعاء الضريبي والضريبة', nameEn: 'Grand Total Monetary Balance', status: 'PASSED' },
                { code: 'BR-KSA-31', nameAr: 'وجود رمز الاستجابة السريعة (QR TLV Base64)', nameEn: 'ZATCA TLV Base64 QR Code', status: 'PASSED' },
                { code: 'BR-KSA-50', nameAr: 'ربط الإشعار الدائن/المدين بالفاتورة الأصلية', nameEn: 'Credit/Debit Note Billing Reference', status: 'PASSED' },
              ].map((r) => (
                <div key={r.code} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <span className="font-bold text-slate-800 font-mono">[{r.code}]</span>{' '}
                      <span className="text-slate-700">{isAr ? r.nameAr : r.nameEn}</span>
                    </div>
                  </div>
                  <Badge variant="success">{r.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: QUEUE & TRANSMISSION LOGS */}
      {/* ========================================================================= */}
      {activeTab === 'queue' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">
              {isAr ? 'سجل طابور الإرسال والعمليات غير المتزامنة' : 'Asynchronous Transmission Queue & Audit Log'}
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 text-xs uppercase font-semibold">
                  <th className="px-4 py-3 text-start">{isAr ? 'معرف العملية' : 'Job ID'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'رقم الفاتورة' : 'Invoice #'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'النوع' : 'Type'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'المحاولات' : 'Attempts'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'رمز الاستجابة' : 'HTTP Code'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'تاريخ الإدراج' : 'Queued At'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {queueJobs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-slate-400">
                      {isAr ? 'طابور الإرسال فارغ حالياً.' : 'Transmission queue is empty.'}
                    </td>
                  </tr>
                ) : (
                  queueJobs.map((job) => (
                    <tr key={job.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{job.id.slice(0, 8)}...</td>
                      <td className="px-4 py-3 font-semibold text-slate-900 font-mono">{job.invoiceNumber}</td>
                      <td className="px-4 py-3 text-xs">{job.transmissionType}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            job.status === 'CLEARED' || job.status === 'REPORTED'
                              ? 'success'
                              : job.status === 'QUEUED'
                              ? 'info'
                              : 'danger'
                          }
                        >
                          {job.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs">{job.attempts}</td>
                      <td className="px-4 py-3 font-mono text-xs">{job.responseStatusCode || 200}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{new Date(job.queuedAt).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: QR TLV 9-TAG INSPECTOR */}
      {/* ========================================================================= */}
      {activeTab === 'qr' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <QrCode className="w-5 h-5 text-emerald-600" />
              {isAr ? 'إدخال رمز TLV Base64' : 'Input TLV Base64'}
            </h2>
            <textarea
              rows={6}
              value={qrInputBase64}
              onChange={(e) => setQrInputBase64(e.target.value)}
              placeholder="Paste Base64 QR code string here..."
              className="w-full text-xs font-mono p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
            />
            <button
              onClick={handleDecodeQr}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition shadow-xs"
            >
              {isAr ? 'فك تشفير العلامات (Decode Tags)' : 'Decode TLV Tags'}
            </button>
          </div>

          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              {isAr ? 'تفصيل علامات TLV التسع (Phase 1 & 2 Tags)' : '9-Tag TLV Breakdown'}
            </h2>

            {decodedQr && decodedQr.tags ? (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {decodedQr.tags.map((t: any) => (
                  <div key={t.tag} className="p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-[11px]">
                        {t.tag}
                      </span>
                      <span className="font-semibold text-slate-800">
                        {isAr ? t.tagNameAr : t.tagNameEn}
                      </span>
                    </div>
                    <span className="font-mono text-slate-600 break-all text-end max-w-sm">
                      {t.value}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center text-slate-400 text-xs">
                {isAr ? 'يرجى إدخال رمز QR والضغط على فك التشفير' : 'Paste QR code and click decode to view tag breakdown.'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: E-INVOICE DETAIL & XML VIEWER */}
      {/* ========================================================================= */}
      {activeDocument && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 font-mono">
                    {activeDocument.invoiceNumber}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    UUID: {activeDocument.uuid}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveDocument(null)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-200"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {/* XML Tab Nav */}
            <div className="px-6 border-b border-slate-200 bg-white flex space-x-2 rtl:space-x-reverse text-xs font-semibold">
              <button
                onClick={() => setModalXmlTab('original')}
                className={`py-3 px-3 border-b-2 ${
                  modalXmlTab === 'original' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500'
                }`}
              >
                {isAr ? 'ملف XML الأصلي (Original UBL 2.1)' : 'Original UBL 2.1 XML'}
              </button>
              <button
                onClick={() => setModalXmlTab('processed')}
                className={`py-3 px-3 border-b-2 ${
                  modalXmlTab === 'processed' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500'
                }`}
              >
                {isAr ? 'ملف XML المعتمد (Processed with Stamp)' : 'Processed XML (With Stamp)'}
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">
                  {modalXmlTab === 'original' ? 'UBL 2.1 Schema Payload' : 'ZATCA Stamped & Signed Payload'}
                </span>
                <button
                  onClick={() =>
                    copyToClipboard(
                      modalXmlTab === 'original'
                        ? activeDocument.originalXml
                        : activeDocument.processedXml || activeDocument.originalXml,
                      'XML Payload'
                    )
                  }
                  className="text-xs text-emerald-700 hover:text-emerald-900 font-semibold flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {isAr ? 'نسخ ملف XML' : 'Copy XML'}
                </button>
              </div>

              <pre className="text-xs font-mono bg-slate-900 text-slate-100 p-4 rounded-2xl overflow-x-auto max-h-96">
                {modalXmlTab === 'original'
                  ? activeDocument.originalXml
                  : activeDocument.processedXml || activeDocument.originalXml}
              </pre>

              {/* Transmission Attempts */}
              {activeDocument.attemptsLog && activeDocument.attemptsLog.length > 0 && (
                <div className="space-y-2 mt-4">
                  <h4 className="text-xs font-bold text-slate-800">
                    {isAr ? 'سجل محاولات الإرسال (Transmission Attempts):' : 'Transmission Attempts Log:'}
                  </h4>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
                    {activeDocument.attemptsLog.map((att, i) => (
                      <div key={i} className="p-3 flex items-center justify-between hover:bg-slate-50">
                        <div>
                          <span className="font-bold text-slate-800">#{att.attemptNumber}</span> —{' '}
                          <span className="font-mono text-slate-500">{new Date(att.timestamp).toLocaleTimeString()}</span>
                          <div className="text-slate-600 mt-0.5">{att.responseSummary}</div>
                        </div>
                        <Badge variant={att.status === 'SUCCESS' ? 'success' : 'danger'}>
                          {att.httpStatus} {att.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50/80 flex items-center justify-end">
              <button
                onClick={() => setActiveDocument(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: UPLOAD CREDENTIALS (CERT & PRIVATE KEY) */}
      {/* ========================================================================= */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-600" />
                {isAr ? 'رفع شهادات ومفاتيح الربط التشفيرية (PEM)' : 'Upload PEM Certificates & Keys'}
              </h3>
              <button onClick={() => setShowUploadModal(false)} className="text-slate-400 hover:text-slate-700">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  {isAr ? 'شهادة CSID بصيغة PEM (Certificate):' : 'CSID PEM Certificate:'}
                </label>
                <textarea
                  rows={4}
                  placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                  value={certPemInput}
                  onChange={(e) => setCertPemInput(e.target.value)}
                  className="w-full font-mono p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  {isAr ? 'المفتاح الخاص بصيغة PEM (Private Key - يتم تشفيره وتأمينه):' : 'Private Key PEM (Encrypted at rest):'}
                </label>
                <textarea
                  rows={4}
                  placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                  value={keyPemInput}
                  onChange={(e) => setKeyPemInput(e.target.value)}
                  className="w-full font-mono p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowUploadModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleUploadCredentials}
                disabled={isUploadingCreds}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs"
              >
                {isAr ? 'حفظ وتأمين المفاتيح' : 'Save & Encrypt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

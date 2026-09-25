import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Eye,
  FileCheck,
  Edit3,
  History,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  Search,
  Sparkles,
  Info,
  Check,
  Layers,
  FileCode,
  Lock,
} from 'lucide-react';
import { useI18n } from '../../i18n/context.js';
import { Badge } from '../ui/Badge.js';
import { Button } from '../ui/Button.js';
import { OcrJob, OcrFieldExtraction, MIN_ACCEPTABLE_CONFIDENCE, canCommitOcrJob } from '../../lib/ocr.js';
import { OcrAPI } from '../../lib/ocrApi.js';
import { useToast } from '../ui/Toast.js';

interface OcrInvoiceCaptureViewProps {
  onNavigate?: (route: string) => void;
}

export const OcrInvoiceCaptureView: React.FC<OcrInvoiceCaptureViewProps> = ({ onNavigate }) => {
  const { isAr, language } = useI18n();
  const toast = useToast();

  const [config, setConfig] = useState<{
    providerName: string;
    isConfigured: boolean;
    supportedMimeTypes: string[];
    maxSizeBytes: number;
  } | null>(null);

  const [jobs, setJobs] = useState<OcrJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<OcrJob | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'review' | 'lines' | 'audit' | 'raw'>('review');
  const [showAuditModal, setShowAuditModal] = useState(false);

  // Field editing state
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [cfg, jobList] = await Promise.all([
        OcrAPI.getConfig(),
        OcrAPI.getJobs(),
      ]);
      setConfig(cfg);
      setJobs(jobList);
      if (jobList.length > 0 && !selectedJob) {
        setSelectedJob(jobList[0]);
      } else if (selectedJob) {
        const refreshed = jobList.find((j) => j.id === selectedJob.id);
        if (refreshed) setSelectedJob(refreshed);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load OCR data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input
    e.target.value = '';

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Content = (reader.result as string).split(',')[1];
          const newJob = await OcrAPI.uploadInvoice({
            fileName: file.name,
            fileBase64: base64Content,
            mimeType: file.type || 'application/pdf',
            fileSize: file.size,
          });

          toast.success(
            isAr
              ? 'تم رفع ومعالجة الفاتورة بنجاح'
              : 'Invoice uploaded and OCR extracted successfully'
          );
          await loadData();
          setSelectedJob(newJob);
        } catch (uploadErr: any) {
          toast.error(uploadErr?.message || 'Upload processing error');
        } finally {
          setIsUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to read file');
      setIsUploading(false);
    }
  };

  const handleSaveFieldCorrection = async (fieldName: string) => {
    if (!selectedJob) return;
    try {
      let valToSave: any = editValue;
      if (['subtotalSar', 'vatAmountSar', 'totalAmountSar'].includes(fieldName)) {
        valToSave = parseFloat(editValue) || 0;
      }

      const updated = await OcrAPI.correctField(selectedJob.id, fieldName, valToSave);
      setSelectedJob(updated);
      setEditingField(null);
      setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
      toast.success(
        isAr ? 'تم تعديل الحقل وتوثيق التغيير في سجل التدقيق' : 'Field corrected and logged in audit trail'
      );
    } catch (err: any) {
      toast.error(err?.message || 'Correction failed');
    }
  };

  const handleConfirmField = async (fieldName: string) => {
    if (!selectedJob) return;
    try {
      const updated = await OcrAPI.confirmField(selectedJob.id, fieldName);
      setSelectedJob(updated);
      setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
      toast.success(
        isAr ? 'تم اعتماد الحقل بدون تغيير' : 'Field confirmed as accurate'
      );
    } catch (err: any) {
      toast.error(err?.message || 'Confirm failed');
    }
  };

  const handleCommitToDraft = async () => {
    if (!selectedJob) return;
    try {
      const result = await OcrAPI.commitToDraftBill(selectedJob.id);
      setSelectedJob(result.ocrJob);
      setJobs((prev) => prev.map((j) => (j.id === result.ocrJob.id ? result.ocrJob : j)));
      toast.success(
        isAr
          ? `تم إنشاء مسودة فاتورة مشتريات رقم ${result.purchaseBill.billNumber} بنجاح!`
          : `Created Draft Purchase Bill ${result.purchaseBill.billNumber} successfully!`
      );
    } catch (err: any) {
      toast.error(err?.message || 'Commit failed');
    }
  };

  const filteredJobs = jobs.filter((j) => {
    if (filterStatus === 'SUCCEEDED' && j.status !== 'SUCCEEDED') return false;
    if (filterStatus === 'PENDING' && !['PENDING', 'PROCESSING', 'NOT_CONFIGURED'].includes(j.status)) return false;
    if (filterStatus === 'COMMITTED' && !j.createdBillId) return false;
    if (filterStatus === 'FAILED' && j.status !== 'FAILED') return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = j.fileName.toLowerCase().includes(q);
      const matchSupplier = j.parsedData?.supplierNameAr?.toLowerCase().includes(q) || j.parsedData?.supplierNameEn?.toLowerCase().includes(q);
      const matchInv = j.parsedData?.invoiceNumber?.toLowerCase().includes(q);
      if (!matchName && !matchSupplier && !matchInv) return false;
    }
    return true;
  });

  const commitCheck = selectedJob ? canCommitOcrJob(selectedJob) : { allowed: false, blockingReasons: [] };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header & Provider Status */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl">
              <FileCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 font-display">
                {isAr ? 'قراءة فواتير الموردين' : 'Scan Supplier Bills'}
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {isAr
                  ? 'استخراج بيانات فواتير المشتريات الضريبية بدقة عالية والمراجعة البشرية قبل إنشاء المسودة'
                  : 'Automated VAT invoice extraction with mandatory human verification before draft commit'}
              </p>
            </div>
          </div>
        </div>

        {/* Provider Status Pill */}
        <div className="flex items-center gap-2">
          {config?.isConfigured ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 rounded-lg text-xs font-semibold border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{config.providerName}</span>
              <Badge variant="success" size="sm">{isAr ? 'مفعل وجاهز' : 'Active'}</Badge>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-800 rounded-lg text-xs font-semibold border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>{config?.providerName || 'Provider'}</span>
              <Badge variant="warning" size="sm">{isAr ? 'غير مهيأ (Pending)' : 'Not Configured'}</Badge>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isAr ? 'تحديث' : 'Refresh'}</span>
          </Button>
        </div>
      </div>

      {/* 2. Upload Zone Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-6 text-white relative overflow-hidden shadow-sm">
        <div className="max-w-2xl relative z-10 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-medium text-emerald-300">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isAr ? 'محرك قراءة الفواتير الضريبية المعتمد للائحة الزكاة والضريبة' : 'ZATCA-Compliant OCR Extraction Engine'}</span>
          </div>
          <h2 className="text-xl font-bold font-display text-white">
            {isAr ? 'التقاط فاتورة مورد جديدة' : 'Upload & Extract New Supplier Invoice'}
          </h2>
          <p className="text-sm text-slate-300">
            {isAr
              ? 'يدعم ملفات الصور (JPG, PNG, WEBP) وملفات PDF حتى حجم 10 ميجابايت مع استخراج الرقم الضريبي وتفاصيل البنود'
              : 'Supports JPG, PNG, WEBP, and PDF up to 10MB with line items, 15-digit VAT number, and QR decoding.'}
          </p>

          <div className="pt-2 flex items-center gap-3">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
            />
            <Button
              variant="primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold px-5 py-2.5 rounded-xl shadow-md flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              <span>{isUploading ? (isAr ? 'جارٍ التحليل والاستخراج...' : 'Extracting...') : (isAr ? 'رفع ملف الفاتورة' : 'Select Invoice File')}</span>
            </Button>
            <span className="text-xs text-slate-400">
              {isAr ? 'الحد الأقصى: 10 ميجابايت' : 'Max size: 10MB'}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Main Workspace: Jobs List & Review Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Job Queue & History (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600" />
                <span>{isAr ? 'سجل عمليات الالتقاط' : 'OCR Extraction Jobs'}</span>
              </h3>
              <Badge variant="brand" size="sm">{jobs.length}</Badge>
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[
                { id: 'ALL', label: isAr ? 'الكل' : 'All' },
                { id: 'SUCCEEDED', label: isAr ? 'مكتمل' : 'Succeeded' },
                { id: 'COMMITTED', label: isAr ? 'مسودة معتمدة' : 'Committed' },
                { id: 'FAILED', label: isAr ? 'فشل' : 'Failed' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilterStatus(tab.id)}
                  className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                    filterStatus === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute start-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isAr ? 'بحث باسم المورد أو رقم الفاتورة...' : 'Search supplier or invoice #...'}
                className="w-full ps-9 pe-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Job Items List */}
            <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
              {filteredJobs.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  {isAr ? 'لا توجد عمليات التقاط مطابقة' : 'No OCR jobs found.'}
                </div>
              ) : (
                filteredJobs.map((job) => {
                  const isSelected = selectedJob?.id === job.id;
                  const hasLowConfidence =
                    job.extractions &&
                    Object.values(job.extractions).some(
                      (f: any) => f.requiresReview && !f.confirmed && !f.correctedValue
                    );

                  return (
                    <div
                      key={job.id}
                      onClick={() => setSelectedJob(job)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50/40 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-900 text-xs truncate">
                            {job.parsedData?.supplierNameAr || job.fileName}
                          </p>
                          <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                            {job.parsedData?.invoiceNumber || job.id}
                          </p>
                        </div>
                        <Badge
                          variant={
                            job.status === 'SUCCEEDED'
                              ? 'success'
                              : job.status === 'FAILED'
                              ? 'danger'
                              : 'warning'
                          }
                          size="sm"
                        >
                          {job.status}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                        <span>
                          {job.parsedData?.totalAmountSar
                            ? `${job.parsedData.totalAmountSar.toLocaleString()} SAR`
                            : `${(job.fileSize / 1024).toFixed(0)} KB`}
                        </span>

                        <div className="flex items-center gap-1.5">
                          {hasLowConfidence && (
                            <span className="flex items-center gap-1 text-amber-600 font-medium">
                              <AlertTriangle className="w-3 h-3" />
                              <span>{isAr ? 'مراجعة' : 'Review'}</span>
                            </span>
                          )}
                          {job.createdBillId && (
                            <span className="flex items-center gap-1 text-emerald-600 font-medium">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>{isAr ? 'مسودة' : 'Draft'}</span>
                            </span>
                          )}
                          <span>{new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Side-by-Side Review Studio (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          {selectedJob ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
              {/* Studio Header */}
              <div className="p-4 border-b border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-base font-display">
                      {selectedJob.parsedData?.supplierNameAr || selectedJob.fileName}
                    </h3>
                    <Badge
                      variant={
                        selectedJob.status === 'SUCCEEDED'
                          ? 'success'
                          : selectedJob.status === 'FAILED'
                          ? 'danger'
                          : 'warning'
                      }
                      size="sm"
                    >
                      {selectedJob.status}
                    </Badge>
                    {selectedJob.createdBillId && (
                      <Badge variant="brand" size="sm">
                        {isAr ? 'تم الإنشاء كمسودة' : 'Committed to Draft'}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 font-mono">
                    ID: {selectedJob.id} • {selectedJob.fileName} ({(selectedJob.fileSize / 1024).toFixed(1)} KB)
                  </p>
                </div>

                {/* Commit Action */}
                <div className="flex items-center gap-2">
                  {selectedJob.corrections.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAuditModal(true)}
                      className="flex items-center gap-1 text-xs"
                    >
                      <History className="w-3.5 h-3.5 text-slate-500" />
                      <span>{isAr ? `سجل التعديل (${selectedJob.corrections.length})` : `Audit (${selectedJob.corrections.length})`}</span>
                    </Button>
                  )}

                  {!selectedJob.createdBillId && selectedJob.status === 'SUCCEEDED' && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleCommitToDraft}
                      disabled={!commitCheck.allowed}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1.5 shadow-xs"
                      title={!commitCheck.allowed ? commitCheck.blockingReasons.join('\n') : undefined}
                    >
                      <FileCheck className="w-4 h-4" />
                      <span>{isAr ? 'اعتماد وإنشاء مسودة فاتورة مشتريات' : 'Commit as Draft Purchase Bill'}</span>
                    </Button>
                  )}

                  {selectedJob.createdBillId && onNavigate && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onNavigate('/purchasing')}
                      className="flex items-center gap-1.5 text-xs text-emerald-700 border-emerald-300 bg-emerald-50"
                    >
                      <span>{isAr ? 'فتح في المشتريات' : 'Open in Purchasing'}</span>
                      <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Commit Blocking Warning Banner */}
              {!commitCheck.allowed && selectedJob.status === 'SUCCEEDED' && !selectedJob.createdBillId && (
                <div className="p-3 bg-amber-50 border-b border-amber-200 flex items-start gap-2.5 text-amber-800 text-xs">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">
                      {isAr
                        ? 'تنبيه: لا يمكن اعتماد المسودة لوجود حقول ذات نسبة دقة منخفضة (< 85%) تتطلب المراجعة البشرية'
                        : 'Commit blocked: One or more fields have confidence below 85% and require manual review/correction.'}
                    </p>
                    <ul className="list-disc list-inside mt-1 text-[11px] text-amber-700 space-y-0.5">
                      {commitCheck.blockingReasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Tabs Navigation */}
              <div className="flex border-b border-slate-200 px-4 gap-4 bg-white text-xs">
                {[
                  { id: 'review', label: isAr ? 'المراجعة والحقول المستخرجة' : 'Extracted Fields' },
                  { id: 'lines', label: isAr ? `البنود والأصناف (${selectedJob.parsedData?.lines.length || 0})` : `Line Items (${selectedJob.parsedData?.lines.length || 0})` },
                  { id: 'audit', label: isAr ? `سجل التدقيق (${selectedJob.corrections.length})` : `Audit Log (${selectedJob.corrections.length})` },
                  { id: 'raw', label: isAr ? 'البيانات الخام (JSON)' : 'Raw JSON' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id as any)}
                    className={`py-3 font-semibold border-b-2 transition-colors ${
                      activeTab === t.id
                        ? 'border-emerald-600 text-emerald-700'
                        : 'border-transparent text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Tab Contents */}
              <div className="p-5">
                {activeTab === 'review' && (
                  <div className="space-y-5">
                    {/* Side-by-Side Review Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Supplier Information Card */}
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/70 space-y-3">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                          <BuildingIcon className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{isAr ? 'بيانات المورد والمنشأة' : 'Supplier Details'}</span>
                        </h4>

                        <FieldRow
                          label={isAr ? 'اسم المورد' : 'Supplier Name'}
                          field={selectedJob.extractions?.supplierName}
                          fieldName="supplierName"
                          onEdit={(fn, v) => {
                            setEditingField(fn);
                            setEditValue(String(v));
                          }}
                          onConfirm={handleConfirmField}
                          isAr={isAr}
                        />

                        <FieldRow
                          label={isAr ? 'الرقم الضريبي للمورد (15 رقماً)' : 'Supplier VAT Number'}
                          field={selectedJob.extractions?.supplierVatNumber}
                          fieldName="supplierVatNumber"
                          onEdit={(fn, v) => {
                            setEditingField(fn);
                            setEditValue(String(v));
                          }}
                          onConfirm={handleConfirmField}
                          isAr={isAr}
                        />

                        <div className="text-xs pt-1 border-t border-slate-200/60 flex justify-between text-slate-600">
                          <span className="text-slate-400">{isAr ? 'السجل التجاري' : 'CR Number'}:</span>
                          <span className="font-mono">{selectedJob.parsedData?.supplierCrNumber || '—'}</span>
                        </div>
                      </div>

                      {/* Invoice Details Card */}
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/70 space-y-3">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{isAr ? 'بيانات الفاتورة والتواريخ' : 'Invoice Metadata'}</span>
                        </h4>

                        <FieldRow
                          label={isAr ? 'رقم فاتورة المورد' : 'Supplier Invoice #'}
                          field={selectedJob.extractions?.invoiceNumber}
                          fieldName="invoiceNumber"
                          onEdit={(fn, v) => {
                            setEditingField(fn);
                            setEditValue(String(v));
                          }}
                          onConfirm={handleConfirmField}
                          isAr={isAr}
                        />

                        <FieldRow
                          label={isAr ? 'تاريخ الإصدار' : 'Issue Date'}
                          field={selectedJob.extractions?.invoiceDate}
                          fieldName="invoiceDate"
                          onEdit={(fn, v) => {
                            setEditingField(fn);
                            setEditValue(String(v));
                          }}
                          onConfirm={handleConfirmField}
                          isAr={isAr}
                        />

                        <FieldRow
                          label={isAr ? 'العملة' : 'Currency'}
                          field={selectedJob.extractions?.currency}
                          fieldName="currency"
                          onEdit={(fn, v) => {
                            setEditingField(fn);
                            setEditValue(String(v));
                          }}
                          onConfirm={handleConfirmField}
                          isAr={isAr}
                        />
                      </div>
                    </div>

                    {/* Financial Totals Card */}
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/70 space-y-3">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{isAr ? 'المجاميع المالية وضريبة القيمة المضافة' : 'Financial Totals & VAT (15%)'}</span>
                      </h4>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <FieldRow
                          label={isAr ? 'المجموع قبل الضريبة' : 'Subtotal (SAR)'}
                          field={selectedJob.extractions?.subtotalSar}
                          fieldName="subtotalSar"
                          onEdit={(fn, v) => {
                            setEditingField(fn);
                            setEditValue(String(v));
                          }}
                          onConfirm={handleConfirmField}
                          isAr={isAr}
                        />

                        <FieldRow
                          label={isAr ? 'مبلغ ضريبة القيمة المضافة (15%)' : 'VAT Amount (15%)'}
                          field={selectedJob.extractions?.vatAmountSar}
                          fieldName="vatAmountSar"
                          onEdit={(fn, v) => {
                            setEditingField(fn);
                            setEditValue(String(v));
                          }}
                          onConfirm={handleConfirmField}
                          isAr={isAr}
                        />

                        <FieldRow
                          label={isAr ? 'المجموع الإجمالي الشامل' : 'Total Amount (SAR)'}
                          field={selectedJob.extractions?.totalAmountSar}
                          fieldName="totalAmountSar"
                          onEdit={(fn, v) => {
                            setEditingField(fn);
                            setEditValue(String(v));
                          }}
                          onConfirm={handleConfirmField}
                          isAr={isAr}
                          isHighlight
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab: Line Items */}
                {activeTab === 'lines' && (
                  <div className="space-y-3">
                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-xs text-start">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                          <tr>
                            <th className="py-2.5 px-3 font-semibold text-start">#</th>
                            <th className="py-2.5 px-3 font-semibold text-start">{isAr ? 'الوصف / البيان' : 'Description'}</th>
                            <th className="py-2.5 px-3 font-semibold text-end">{isAr ? 'الكمية' : 'Qty'}</th>
                            <th className="py-2.5 px-3 font-semibold text-end">{isAr ? 'سعر الوحدة' : 'Unit Price'}</th>
                            <th className="py-2.5 px-3 font-semibold text-end">{isAr ? 'نسبة الضريبة' : 'VAT Rate'}</th>
                            <th className="py-2.5 px-3 font-semibold text-end">{isAr ? 'مبلغ الضريبة' : 'VAT SAR'}</th>
                            <th className="py-2.5 px-3 font-semibold text-end">{isAr ? 'الإجمالي' : 'Total SAR'}</th>
                            <th className="py-2.5 px-3 font-semibold text-center">{isAr ? 'الدقة' : 'Confidence'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedJob.parsedData?.lines.map((line, idx) => (
                            <tr key={line.id} className="hover:bg-slate-50/50">
                              <td className="py-2.5 px-3 text-slate-400">{idx + 1}</td>
                              <td className="py-2.5 px-3 font-medium text-slate-900">{line.description}</td>
                              <td className="py-2.5 px-3 text-end font-mono">{line.quantity}</td>
                              <td className="py-2.5 px-3 text-end font-mono">{line.unitPriceSar.toFixed(2)}</td>
                              <td className="py-2.5 px-3 text-end font-mono">{(line.vatRate * 100).toFixed(0)}%</td>
                              <td className="py-2.5 px-3 text-end font-mono">{line.vatAmountSar.toFixed(2)}</td>
                              <td className="py-2.5 px-3 text-end font-mono font-bold text-slate-900">{line.totalAmountSar.toFixed(2)}</td>
                              <td className="py-2.5 px-3 text-center">
                                <span
                                  className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    line.confidence >= MIN_ACCEPTABLE_CONFIDENCE
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-rose-100 text-rose-800'
                                  }`}
                                >
                                  {(line.confidence * 100).toFixed(0)}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Tab: Audit Log */}
                {activeTab === 'audit' && (
                  <div className="space-y-3">
                    {selectedJob.corrections.length === 0 ? (
                      <div className="text-center py-8 text-slate-400 text-xs">
                        {isAr ? 'لم يتم إجراء أي تعديلات يدوية على هذه الفاتورة' : 'No manual corrections logged for this invoice.'}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedJob.corrections.map((entry) => (
                          <div
                            key={entry.id}
                            className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between text-slate-500 text-[11px]">
                              <span className="font-semibold text-slate-700">{entry.fieldName}</span>
                              <span>{new Date(entry.timestamp).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-800">
                              <span className="line-through text-slate-400 font-mono">{String(entry.oldValue)}</span>
                              <ArrowRight className="w-3 h-3 text-slate-400 rtl:rotate-180" />
                              <span className="font-bold text-emerald-700 font-mono">{String(entry.newValue)}</span>
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {isAr ? 'المستخدم' : 'User'}: {entry.userName}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab: Raw JSON */}
                {activeTab === 'raw' && (
                  <pre className="p-4 bg-slate-900 text-slate-100 rounded-xl text-xs font-mono overflow-x-auto max-h-[400px]">
                    {JSON.stringify(selectedJob, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-400">
              <FileCheck className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="font-medium text-slate-600 text-sm">
                {isAr ? 'اختر عملية التقاط من القائمة لمراجعتها أو قم برفع فاتورة جديدة' : 'Select an OCR job from the list or upload a new invoice.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Edit Field Modal / Inline Dialog */}
      {editingField && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              {isAr ? `تعديل الحقل: ${editingField}` : `Correct Field: ${editingField}`}
            </h3>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isAr ? 'القيمة الصحيحة' : 'New Value'}
              </label>
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setEditingField(null)}>
                {isAr ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleSaveFieldCorrection(editingField)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isAr ? 'حفظ وتوثيق التدقيق' : 'Save & Log Audit'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper Sub-Component for Field Rows
interface FieldRowProps {
  label: string;
  field?: OcrFieldExtraction<any>;
  fieldName: string;
  onEdit: (fieldName: string, currentValue: any) => void;
  onConfirm: (fieldName: string) => void;
  isAr: boolean;
  isHighlight?: boolean;
}

const FieldRow: React.FC<FieldRowProps> = ({
  label,
  field,
  fieldName,
  onEdit,
  onConfirm,
  isAr,
  isHighlight,
}) => {
  if (!field) return null;

  const isLowConfidence = field.confidence < MIN_ACCEPTABLE_CONFIDENCE;
  const isCorrected = field.correctedValue !== undefined;
  const isConfirmed = field.confirmed;
  const displayVal = isCorrected ? field.correctedValue : field.extractedValue;

  return (
    <div
      className={`p-2.5 rounded-xl border text-xs transition-colors ${
        isHighlight
          ? 'bg-emerald-50/50 border-emerald-200'
          : isLowConfidence && !isCorrected && !isConfirmed
          ? 'bg-rose-50/50 border-rose-200'
          : 'bg-white border-slate-200'
      }`}
    >
      <div className="flex items-center justify-between text-slate-500 mb-1">
        <span className="font-medium text-slate-600">{label}</span>
        <div className="flex items-center gap-1">
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
              field.confidence >= MIN_ACCEPTABLE_CONFIDENCE
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-rose-100 text-rose-800'
            }`}
          >
            {(field.confidence * 100).toFixed(0)}%
          </span>
          {isCorrected && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
              {isAr ? 'معدل' : 'Edited'}
            </span>
          )}
          {isConfirmed && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
              {isAr ? 'مؤكد' : 'Confirmed'}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className={`font-mono truncate ${isHighlight ? 'font-bold text-emerald-900 text-sm' : 'text-slate-900 font-semibold'}`}>
          {typeof displayVal === 'number' ? displayVal.toLocaleString(undefined, { minimumFractionDigits: 2 }) : String(displayVal || '—')}
        </span>

        <div className="flex items-center gap-1">
          {isLowConfidence && !isCorrected && !isConfirmed && (
            <button
              onClick={() => onConfirm(fieldName)}
              className="p-1 text-slate-400 hover:text-emerald-600 rounded transition-colors"
              title={isAr ? 'تأكيد القيمة كصحيحة' : 'Confirm as accurate'}
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => onEdit(fieldName, displayVal)}
            className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
            title={isAr ? 'تعديل القيمة' : 'Edit value'}
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

function BuildingIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

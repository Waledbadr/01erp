import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ArrowRight,
  ArrowLeft,
  Search,
  Filter,
  Layers,
  Database,
  Calendar,
  Check,
  X,
  FileText,
  Clock,
  Sparkles,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import {
  ImportTemplate,
  ImportMode,
  ValidationResult,
  ImportJob,
  IMPORT_TEMPLATES_CONFIG,
  parseCsvText,
  autoMapColumns,
  applyColumnMapping,
  validateImportApi,
  commitImportApi,
  rollbackImportApi,
  fetchImportJobsApi,
  exportResourceApi,
} from '../../lib/importExport.js';

export const ImportExportCenterView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'IMPORT' | 'EXPORT' | 'JOBS'>('IMPORT');

  // Wizard State
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [selectedTemplate, setSelectedTemplate] = useState<ImportTemplate>('CUSTOMERS');
  const [selectedMode, setSelectedMode] = useState<ImportMode>('CREATE_OR_UPDATE');
  const [rawCsvText, setRawCsvText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [mappedRows, setMappedRows] = useState<Record<string, any>[]>([]);

  // Validation & Commit State
  const [validating, setValidating] = useState<boolean>(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [committing, setCommitting] = useState<boolean>(false);
  const [committedJob, setCommittedJob] = useState<ImportJob | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  // Export State
  const [exportResource, setExportResource] = useState<ImportTemplate>('CUSTOMERS');
  const [exportFormat, setExportFormat] = useState<'CSV' | 'JSON'>('CSV');
  const [exportSearch, setExportSearch] = useState<string>('');
  const [exporting, setExporting] = useState<boolean>(false);
  const [exportPreview, setExportPreview] = useState<{ content: string; rowCount: number } | null>(null);

  // Jobs History State
  const [jobsList, setJobsList] = useState<ImportJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState<boolean>(false);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [rollbackFeedback, setRollbackFeedback] = useState<string | null>(null);

  // Load jobs when switching to history tab
  useEffect(() => {
    if (activeTab === 'JOBS') {
      loadJobsHistory();
    }
  }, [activeTab]);

  const loadJobsHistory = async () => {
    setLoadingJobs(true);
    try {
      const res = await fetchImportJobsApi();
      if (res.success) {
        setJobsList(res.jobs || []);
      }
    } catch (e) {
      console.error('Failed to load jobs', e);
    } finally {
      setLoadingJobs(false);
    }
  };

  // Helper to load sample data into wizard step 2
  const handleLoadSample = () => {
    const config = IMPORT_TEMPLATES_CONFIG[selectedTemplate];
    if (!config) return;
    const headers = config.fields.map((f) => f.field);
    const headerLine = headers.join(',');
    const lines = config.sampleRows.map((row) =>
      headers.map((h) => (row[h] !== undefined ? `"${String(row[h]).replace(/"/g, '""')}"` : '""')).join(',')
    );
    const csv = [headerLine, ...lines].join('\n');
    setRawCsvText(csv);
    setFileName(`sample_${selectedTemplate.toLowerCase()}.csv`);
    processCsvContent(csv);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setRawCsvText(text);
      processCsvContent(text);
    };
    reader.readAsText(file);
  };

  const processCsvContent = (text: string) => {
    const { headers, rows } = parseCsvText(text);
    setParsedHeaders(headers);
    setParsedRows(rows);
    const autoMap = autoMapColumns(headers, selectedTemplate);
    setColumnMapping(autoMap);
  };

  // Step navigation handlers
  const handleProceedToStep3 = () => {
    if (parsedRows.length === 0) {
      alert('الرجاء رفع ملف أو إدخال بيانات صالحة للمتابعة');
      return;
    }
    setCurrentStep(3);
  };

  const handleProceedToStep4 = async () => {
    const finalRows = applyColumnMapping(parsedRows, columnMapping);
    setMappedRows(finalRows);
    setCurrentStep(4);
    setValidating(true);
    setValidationResult(null);
    setCommitError(null);

    try {
      const res = await validateImportApi(selectedTemplate, selectedMode, finalRows);
      if (res.success) {
        setValidationResult(res.result);
      } else {
        setCommitError(res.error || 'فشل الفحص');
      }
    } catch (err: any) {
      setCommitError(err.message || 'خطأ أثناء الفحص');
    } finally {
      setValidating(false);
    }
  };

  const handleCommit = async () => {
    if (!validationResult?.isValid) {
      alert('لا يمكن اعتماد البيانات لوجود أخطاء إلزامية غير مصححة.');
      return;
    }
    setCommitting(true);
    setCommitError(null);

    try {
      const res = await commitImportApi(selectedTemplate, selectedMode, mappedRows, fileName);
      if (res.success && res.job) {
        setCommittedJob(res.job);
        setCurrentStep(5);
      } else {
        setCommitError(res.error || 'فشلت عملية الاعتماد وتم التراجع التلقائي');
      }
    } catch (err: any) {
      setCommitError(err.message || 'خطأ غير متوقع أثناء الاعتماد');
    } finally {
      setCommitting(false);
    }
  };

  const handleRollbackJob = async (jobId: string) => {
    if (!confirm('هل أنت متأكد من التراجع عن عملية الاستيراد وحذف كافة السجلات والقيود المحاسبية الناتجة عنها؟')) {
      return;
    }
    setRollingBackId(jobId);
    setRollbackFeedback(null);
    try {
      const res = await rollbackImportApi(jobId);
      if (res.success) {
        setRollbackFeedback(res.result?.messageAr || 'تم التراجع بنجاح');
        loadJobsHistory();
        if (committedJob?.id === jobId) {
          setCommittedJob({ ...committedJob, isRolledBack: true, status: 'ROLLED_BACK' });
        }
      } else {
        alert(res.error || 'فشل التراجع');
      }
    } catch (e: any) {
      alert(e.message || 'خطأ في التراجع');
    } finally {
      setRollingBackId(null);
    }
  };

  const handleExport = async (downloadDirectly: boolean = false) => {
    setExporting(true);
    setExportPreview(null);
    try {
      const res = await exportResourceApi({
        resource: exportResource,
        format: exportFormat,
        search: exportSearch,
      });

      if (res.success) {
        setExportPreview({ content: res.content, rowCount: res.rowCount });
        if (downloadDirectly) {
          const blob = new Blob([res.content], { type: res.mimeType });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = res.filename;
          a.click();
          URL.revokeObjectURL(url);
        }
      } else {
        alert(res.error || 'فشل التصدير');
      }
    } catch (e: any) {
      alert(e.message || 'خطأ في التصدير');
    } finally {
      setExporting(false);
    }
  };

  const currentTemplateConfig = IMPORT_TEMPLATES_CONFIG[selectedTemplate];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Header Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-blue-600 text-white text-xs font-semibold px-2.5 py-0.5 rounded-full">
                Phase 19
              </span>
              <h1 className="text-2xl font-bold text-slate-900">
                مركز الاستيراد والتصدير الموحد
              </h1>
            </div>
            <p className="text-slate-600 text-sm mt-1">
              محرك الاستيراد والتصدير الذكي الشامل، التحقق المسبق الصارم (Rule G1)، التراجع الذري التام، ومطابقة الأعمدة التلقائية
            </p>
          </div>

          {/* Tab Switcher */}
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setActiveTab('IMPORT')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'IMPORT' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>معالج الاستيراد</span>
            </button>
            <button
              onClick={() => setActiveTab('EXPORT')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'EXPORT' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Download className="w-4 h-4" />
              <span>مركز التصدير</span>
            </button>
            <button
              onClick={() => setActiveTab('JOBS')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'JOBS' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>سجل العمليات والتراجع</span>
            </button>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: IMPORT WIZARD                                                  */}
      {/* ===================================================================== */}
      {activeTab === 'IMPORT' && (
        <div className="space-y-6">
          {/* Wizard Steps Header */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="grid grid-cols-5 gap-2 text-center text-xs font-semibold">
              {[
                { step: 1, title: '1. نوع البيانات والوضع' },
                { step: 2, title: '2. رفع الملف أو اللصق' },
                { step: 3, title: '3. مطابقة الأعمدة' },
                { step: 4, title: '4. الفحص الجاف' },
                { step: 5, title: '5. الاعتماد والتقرير' },
              ].map((item) => (
                <div
                  key={item.step}
                  className={`p-2.5 rounded-lg border transition-all ${
                    currentStep === item.step
                      ? 'bg-blue-50 border-blue-600 text-blue-700'
                      : currentStep > item.step
                      ? 'bg-slate-50 border-emerald-500 text-emerald-700'
                      : 'bg-white border-slate-200 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    {currentStep > item.step ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <span>{item.step}</span>
                    )}
                    <span>{item.title}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* STEP 1: Template and Mode */}
          {currentStep === 1 && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">
                  الخطوة 1: اختر نوع البيانات ووضع الاستيراد
                </h3>
                <p className="text-sm text-slate-500">
                  يدعم النظام 10 قوالب رئيسية مقسمة بين البيانات الأساسية (Master Data) والحركات المالية (Movements).
                </p>
              </div>

              {/* Template Selection */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-2">
                  نوع القالب المستهدف
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Object.values(IMPORT_TEMPLATES_CONFIG).map((cfg) => {
                    const isSelected = selectedTemplate === cfg.template;
                    return (
                      <button
                        key={cfg.template}
                        type="button"
                        onClick={() => setSelectedTemplate(cfg.template)}
                        className={`text-start p-4 rounded-xl border transition-all ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded ${
                              cfg.category === 'MASTER_DATA'
                                ? 'bg-indigo-100 text-indigo-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {cfg.category === 'MASTER_DATA' ? 'بيانات أساسية' : 'حركات وسندات'}
                          </span>
                          {isSelected && <Check className="w-4 h-4 text-blue-600" />}
                        </div>
                        <h4 className="font-bold text-slate-900 mt-2 text-base">
                          {cfg.nameAr}
                        </h4>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                          {cfg.descriptionAr}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mode Selection */}
              <div className="pt-4 border-t border-slate-100">
                <label className="block text-sm font-semibold text-slate-800 mb-2">
                  وضع الاستيراد (Import Mode)
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    {
                      mode: 'CREATE_OR_UPDATE' as ImportMode,
                      title: 'إنشاء وتحديث (Upsert)',
                      desc: 'إنشاء السجلات الجديدة وتحديث السجلات الموجودة مسبقاً برمز التطابق.',
                    },
                    {
                      mode: 'CREATE_ONLY' as ImportMode,
                      title: 'إنشاء فقط (Create Only)',
                      desc: 'إضافة السجلات الجديدة فقط ويرفض السجلات المسجلة مسبقاً لمنع التكرار.',
                    },
                    {
                      mode: 'UPDATE_ONLY' as ImportMode,
                      title: 'تحديث فقط (Update Only)',
                      desc: 'تحديث بيانات السجلات القائمة فقط ويرفض السجلات غير الموجودة.',
                    },
                  ].map((m) => (
                    <button
                      key={m.mode}
                      type="button"
                      onClick={() => setSelectedMode(m.mode)}
                      className={`p-4 rounded-xl border text-start transition-all ${
                        selectedMode === m.mode
                          ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <h4 className="font-bold text-slate-900 text-sm">{m.title}</h4>
                      <p className="text-xs text-slate-500 mt-1">{m.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Template Information & Download Sample */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                  <h4 className="font-semibold text-slate-900 text-sm">
                    نموذج الإدخال المعتمد: {currentTemplateConfig?.nameAr}
                  </h4>
                  <p className="text-xs text-slate-600 mt-0.5">
                    يحتوي هذا القالب على {currentTemplateConfig?.fields.length} حقلاً معتمدين مع التحقق من الهوية السعودية.
                  </p>
                </div>
                <a
                  href={`/api/v1/import-export/templates/${selectedTemplate}/sample`}
                  className="flex items-center gap-2 bg-white text-slate-700 hover:text-slate-900 border border-slate-300 hover:border-slate-400 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition-all"
                >
                  <Download className="w-4 h-4 text-blue-600" />
                  <span>تحميل نموذج CSV جاهز</span>
                </a>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-semibold text-sm shadow-sm transition-all"
                >
                  <span>التالي: رفع أو لصق البيانات</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Upload or Paste */}
          {currentStep === 2 && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">
                    الخطوة 2: رفع ملف CSV أو لصق البيانات
                  </h3>
                  <p className="text-sm text-slate-500">
                    القالب المختار: <strong className="text-blue-600">{currentTemplateConfig?.nameAr}</strong> ({selectedMode})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleLoadSample}
                  className="flex items-center gap-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>تعبئة بيانات نموذجية للتجربة</span>
                </button>
              </div>

              {/* File Upload Zone */}
              <div className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-8 text-center transition-all bg-slate-50/50">
                <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-700 mb-1">
                  اسحب وأفلت ملف CSV هنا أو اضغط للاختيار من جهازك
                </p>
                <p className="text-xs text-slate-500 mb-4">
                  الملفات المدعومة: CSV مع ترميز UTF-8
                </p>
                <label className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-semibold px-4 py-2 rounded-lg text-sm cursor-pointer shadow-sm">
                  <span>اختر ملف من جهازك</span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>
                {fileName && (
                  <p className="mt-3 text-xs font-bold text-emerald-700 bg-emerald-50 py-1 px-3 rounded-full inline-block">
                    تم تحميل الملف: {fileName}
                  </p>
                )}
              </div>

              {/* Paste Textarea */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  أو الصق محتوى CSV مباشرة أدناه:
                </label>
                <textarea
                  rows={6}
                  value={rawCsvText}
                  onChange={(e) => {
                    setRawCsvText(e.target.value);
                    processCsvContent(e.target.value);
                  }}
                  dir="ltr"
                  placeholder="nameAr,mobile,vatNumber,creditLimitSar&#10;شركة الرياض,0501234567,300012345600003,50000"
                  className="w-full font-mono text-xs p-3 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              {parsedRows.length > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800 flex items-center justify-between">
                  <span>تم استخراج <strong>{parsedRows.length}</strong> صفاً و<strong>{parsedHeaders.length}</strong> عموداً من الملف بنجاح.</span>
                </div>
              )}

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-semibold text-sm"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>السابق</span>
                </button>
                <button
                  type="button"
                  disabled={parsedRows.length === 0}
                  onClick={handleProceedToStep3}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-semibold text-sm shadow-sm"
                >
                  <span>التالي: مطابقة الأعمدة</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Column Mapping */}
          {currentStep === 3 && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">
                  الخطوة 3: مطابقة أعمدة الملف مع حقول النظام
                </h3>
                <p className="text-sm text-slate-500">
                  يقوم النظام بمطابقة الأعمدة تلقائياً بناءً على العناوين والأسماء البديلة باللغتين العربية والإنجليزية.
                </p>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm text-right">
                  <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-3">حقل النظام</th>
                      <th className="p-3">الحالة</th>
                      <th className="p-3">النوع المطلوب</th>
                      <th className="p-3">العمود المطابق في الملف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {currentTemplateConfig?.fields.map((f) => {
                      const matchedHeader = columnMapping[f.field] || '';
                      return (
                        <tr key={f.field} className="hover:bg-slate-50/50">
                          <td className="p-3">
                            <div className="font-semibold text-slate-900">{f.labelAr}</div>
                            <div className="text-xs text-slate-400 font-mono">{f.field}</div>
                          </td>
                          <td className="p-3">
                            {f.required ? (
                              <span className="bg-rose-100 text-rose-800 text-xs px-2 py-0.5 rounded font-bold">
                                إلزامي *
                              </span>
                            ) : (
                              <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded">
                                اختياري
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-xs text-slate-500">
                            {f.dataType}
                          </td>
                          <td className="p-3">
                            <select
                              value={matchedHeader}
                              onChange={(e) =>
                                setColumnMapping({ ...columnMapping, [f.field]: e.target.value })
                              }
                              className={`w-full text-xs p-2 border rounded-lg focus:outline-none ${
                                matchedHeader ? 'border-emerald-300 bg-emerald-50/30' : f.required ? 'border-amber-300 bg-amber-50/30' : 'border-slate-300'
                              }`}
                            >
                              <option value="">-- غير محدد (تجاهل) --</option>
                              {parsedHeaders.map((hdr) => (
                                <option key={hdr} value={hdr}>
                                  {hdr}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-semibold text-sm"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>السابق</span>
                </button>
                <button
                  type="button"
                  onClick={handleProceedToStep4}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-semibold text-sm shadow-sm"
                >
                  <span>التالي: الفحص الجاف الصارم</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Dry-Run Validation */}
          {currentStep === 4 && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">
                  الخطوة 4: الفحص الجاف والتحقق من القواعد المحاسبية
                </h3>
                <p className="text-sm text-slate-500">
                  الفحص يتم في الذاكرة دون كتابة أي سجلات في قاعدة البيانات، مع التحقق من الهوية السعودية وقاعدة توازن القيود (G1).
                </p>
              </div>

              {validating && (
                <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200">
                  <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-3" />
                  <p className="font-semibold text-slate-800 text-sm">
                    جارٍ فحص الصفوف والتحقق من صحة الأرقام الضريبية والتوازن المحاسبي...
                  </p>
                </div>
              )}

              {validationResult && (
                <div className="space-y-4">
                  {/* Metrics Summary Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                      <div className="text-xs text-slate-500">إجمالي الصفوف</div>
                      <div className="text-xl font-bold text-slate-900 mt-1">
                        {validationResult.totalRows}
                      </div>
                    </div>
                    <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50">
                      <div className="text-xs text-emerald-700 font-semibold">صفوف صالحة للاعتماد</div>
                      <div className="text-xl font-bold text-emerald-800 mt-1">
                        {validationResult.validRows}
                      </div>
                    </div>
                    <div className="p-4 rounded-xl border border-rose-200 bg-rose-50">
                      <div className="text-xs text-rose-700 font-semibold">صفوف بها أخطاء مانعة</div>
                      <div className="text-xl font-bold text-rose-800 mt-1">
                        {validationResult.errorRows}
                      </div>
                    </div>
                    <div className="p-4 rounded-xl border border-blue-200 bg-blue-50">
                      <div className="text-xs text-blue-700 font-semibold">حالة الملف</div>
                      <div className="text-base font-bold text-blue-900 mt-1">
                        {validationResult.isValid ? 'جاهز للاعتماد' : 'يوجد أخطاء'}
                      </div>
                    </div>
                  </div>

                  {/* Special Rule G1 Details for Opening Balances */}
                  {validationResult.details && (
                    <div
                      className={`p-4 rounded-xl border ${
                        validationResult.details.balanced
                          ? 'border-emerald-200 bg-emerald-50'
                          : 'border-rose-300 bg-rose-50'
                      }`}
                    >
                      <h4 className="font-bold text-sm mb-2">
                        فحص توازن الأرصدة الافتتاحية (قاعدة G1):
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                        <div>
                          إجمالي المدين:{' '}
                          <strong className="font-mono">
                            {validationResult.details.totalDebitSar?.toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                            })}{' '}
                            ر.س
                          </strong>
                        </div>
                        <div>
                          إجمالي الدائن:{' '}
                          <strong className="font-mono">
                            {validationResult.details.totalCreditSar?.toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                            })}{' '}
                            ر.س
                          </strong>
                        </div>
                        <div>
                          الفارق المتبقي:{' '}
                          <strong
                            className={`font-mono ${
                              validationResult.details.balanced ? 'text-emerald-700' : 'text-rose-700 font-bold'
                            }`}
                          >
                            {validationResult.details.differenceSar?.toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                            })}{' '}
                            ر.س
                          </strong>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Errors Table */}
                  {validationResult.errors.length > 0 && (
                    <div className="border border-rose-200 rounded-xl overflow-hidden">
                      <div className="bg-rose-50 p-3 text-rose-900 font-bold text-sm flex items-center gap-2 border-b border-rose-200">
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                        <span>قائمة الأخطاء المكتشفة ({validationResult.errors.length})</span>
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        <table className="w-full text-xs text-right">
                          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                            <tr>
                              <th className="p-2.5">رقم السطر</th>
                              <th className="p-2.5">الحقل</th>
                              <th className="p-2.5">رسالة الخطأ</th>
                              <th className="p-2.5">القيمة المدخلة</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {validationResult.errors.map((err, idx) => (
                              <tr key={idx} className="hover:bg-rose-50/40">
                                <td className="p-2.5 font-bold font-mono">
                                  {err.rowNumber > 0 ? `السطر ${err.rowNumber}` : 'إجمالي الملف'}
                                </td>
                                <td className="p-2.5 font-mono text-slate-700">{err.field}</td>
                                <td className="p-2.5 text-rose-700 font-semibold">{err.messageAr}</td>
                                <td className="p-2.5 font-mono text-slate-500">
                                  {typeof err.value === 'object' ? JSON.stringify(err.value) : String(err.value ?? '')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {commitError && (
                <div className="bg-rose-50 border border-rose-300 p-4 rounded-xl text-rose-800 text-sm">
                  {commitError}
                </div>
              )}

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-semibold text-sm"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>تعديل مطابقة الأعمدة</span>
                </button>
                <button
                  type="button"
                  disabled={!validationResult?.isValid || committing}
                  onClick={handleCommit}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-semibold text-sm shadow-sm"
                >
                  {committing ? (
                    <span>جارٍ الاعتماد والترحيل...</span>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>اعتماد وتنفيذ البيانات (Commit Import)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: Commit Success & Instant Rollback */}
          {currentStep === 5 && committedJob && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
              <div className="text-center p-6 bg-emerald-50 border border-emerald-200 rounded-2xl">
                <CheckCircle2 className="w-16 h-16 text-emerald-600 mx-auto mb-3" />
                <h3 className="text-xl font-bold text-emerald-900">
                  تم تنفيذ عملية الاستيراد بنجاح!
                </h3>
                <p className="text-sm text-emerald-700 mt-1">
                  رقم العملية المرجعي: <span className="font-mono font-bold">{committedJob.id}</span>
                </p>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                  <div className="text-xs text-slate-500">إجمالي الصفوف</div>
                  <div className="text-xl font-bold text-slate-900 mt-1">{committedJob.totalRows}</div>
                </div>
                <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50">
                  <div className="text-xs text-emerald-700 font-semibold">سجلات جديدة مضافة</div>
                  <div className="text-xl font-bold text-emerald-800 mt-1">{committedJob.createdCount}</div>
                </div>
                <div className="p-4 rounded-xl border border-blue-200 bg-blue-50">
                  <div className="text-xs text-blue-700 font-semibold">سجلات محدثة</div>
                  <div className="text-xl font-bold text-blue-800 mt-1">{committedJob.updatedCount}</div>
                </div>
                <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50">
                  <div className="text-xs text-indigo-700 font-semibold">قيود دفتر أستاذ ملحقة</div>
                  <div className="text-xl font-bold text-indigo-800 mt-1">
                    {committedJob.createdRecordIds.journalIds?.length || 0}
                  </div>
                </div>
              </div>

              {/* Instant Rollback Option */}
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-amber-900 text-sm">
                    هل حدث خطأ في البيانات وترغب بالتراجع؟
                  </h4>
                  <p className="text-xs text-amber-700 mt-0.5">
                    ميزة التراجع الذري تحذف كافة السجلات والقيود الناتجة عن هذه الدفعة وتستعيد الحالة السابقة تماماً.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={committedJob.isRolledBack || rollingBackId === committedJob.id}
                  onClick={() => handleRollbackJob(committedJob.id)}
                  className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{committedJob.isRolledBack ? 'تم التراجع مسبقاً' : 'تراجع فوري عن هذه الدفعة'}</span>
                </button>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setCurrentStep(1);
                    setRawCsvText('');
                    setParsedRows([]);
                    setMappedRows([]);
                    setValidationResult(null);
                    setCommittedJob(null);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-semibold text-sm shadow-sm"
                >
                  استيراد ملف جديد
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: EXPORT CENTER                                                 */}
      {/* ===================================================================== */}
      {activeTab === 'EXPORT' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
          <div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              مركز التصدير الشامل (Export Center)
            </h3>
            <p className="text-sm text-slate-500">
              تصدير البيانات بصيغة CSV المتوافقة 100% مع قوالب الاستيراد (Round-trip) مع دعم تصدير JSON الكامل.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                البيانات المراد تصديرها
              </label>
              <select
                value={exportResource}
                onChange={(e) => setExportResource(e.target.value as ImportTemplate)}
                className="w-full text-sm p-2.5 border border-slate-300 rounded-lg focus:outline-none"
              >
                {Object.values(IMPORT_TEMPLATES_CONFIG).map((cfg) => (
                  <option key={cfg.template} value={cfg.template}>
                    {cfg.nameAr} ({cfg.category === 'MASTER_DATA' ? 'أساسي' : 'حركة'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                صيغة التصدير
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setExportFormat('CSV')}
                  className={`flex-1 py-2 text-sm font-semibold rounded-lg border ${
                    exportFormat === 'CSV' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  CSV (Excel UTF-8)
                </button>
                <button
                  type="button"
                  onClick={() => setExportFormat('JSON')}
                  className={`flex-1 py-2 text-sm font-semibold rounded-lg border ${
                    exportFormat === 'JSON' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  JSON
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                تصفية بالبحث (اختياري)
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                <input
                  type="text"
                  value={exportSearch}
                  onChange={(e) => setExportSearch(e.target.value)}
                  placeholder="ابحث بالاسم، الكود، أو الجوال..."
                  className="w-full text-sm p-2.5 pr-9 border border-slate-300 rounded-lg focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              disabled={exporting}
              onClick={() => handleExport(false)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-4 py-2.5 rounded-lg text-sm font-semibold"
            >
              {exporting ? 'جارٍ التوليد...' : 'معاينة البيانات'}
            </button>
            <button
              type="button"
              disabled={exporting}
              onClick={() => handleExport(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span>تحميل الملف مباشرة</span>
            </button>
          </div>

          {exportPreview && (
            <div className="space-y-2 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>تم العثور على <strong>{exportPreview.rowCount}</strong> سجلاً مطابقاً.</span>
                <span>المعاينة (أول 1000 حرف):</span>
              </div>
              <textarea
                readOnly
                rows={10}
                value={exportPreview.content.slice(0, 1000)}
                dir="ltr"
                className="w-full font-mono text-xs p-3 bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: JOBS & ROLLBACK HISTORY                                       */}
      {/* ===================================================================== */}
      {activeTab === 'JOBS' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">
                سجل عمليات الاستيراد والتراجع الذري
              </h3>
              <p className="text-sm text-slate-500">
                تتبع كامل لكافة دفعات الاستيراد السابقة، السجلات المنشأة، والقدرة على التراجع بنقرة واحدة.
              </p>
            </div>
            <button
              type="button"
              onClick={loadJobsHistory}
              className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>تحديث السجل</span>
            </button>
          </div>

          {rollbackFeedback && (
            <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg text-emerald-800 text-xs font-semibold">
              {rollbackFeedback}
            </div>
          )}

          {loadingJobs ? (
            <div className="p-8 text-center text-slate-400 text-sm">جارٍ تحميل سجل العمليات...</div>
          ) : jobsList.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-slate-500 text-sm">
              لا توجد عمليات استيراد سابقة مسجلة.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm text-right">
                <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3">رقم العملية (ID)</th>
                    <th className="p-3">القالب</th>
                    <th className="p-3">الوضع</th>
                    <th className="p-3">الصفوف</th>
                    <th className="p-3">جديد / محدث</th>
                    <th className="p-3">الحالة</th>
                    <th className="p-3">التاريخ والمستخدم</th>
                    <th className="p-3">الإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {jobsList.map((job) => (
                    <tr key={job.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-mono text-xs font-semibold text-slate-800">
                        {job.id.slice(0, 8)}...
                      </td>
                      <td className="p-3">
                        <span className="font-semibold text-slate-900">
                          {IMPORT_TEMPLATES_CONFIG[job.template]?.nameAr || job.template}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-slate-500">{job.mode}</td>
                      <td className="p-3 font-mono text-xs">{job.totalRows}</td>
                      <td className="p-3 font-mono text-xs">
                        <span className="text-emerald-700 font-bold">{job.createdCount}</span> /{' '}
                        <span className="text-blue-700 font-bold">{job.updatedCount}</span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                            job.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : job.status === 'ROLLED_BACK'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {job.status === 'COMPLETED'
                            ? 'معتمد'
                            : job.status === 'ROLLED_BACK'
                            ? 'تم التراجع'
                            : 'فاشل'}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-slate-500">
                        <div>{job.createdAt?.slice(0, 16).replace('T', ' ')}</div>
                        <div className="text-slate-400">{job.createdBy}</div>
                      </td>
                      <td className="p-3">
                        <button
                          type="button"
                          disabled={job.isRolledBack || rollingBackId === job.id}
                          onClick={() => handleRollbackJob(job.id)}
                          className="flex items-center gap-1 text-xs bg-amber-50 hover:bg-amber-100 text-amber-800 disabled:opacity-40 border border-amber-200 px-3 py-1.5 rounded-md font-semibold transition-all"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>{job.isRolledBack ? 'متراجع عنه' : 'تراجع'}</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

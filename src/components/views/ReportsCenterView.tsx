/**
 * Reports Center View — Saudi Enterprise ERP
 * Full-featured interactive reporting engine with:
 * - 24 authoritative reports across 5 families
 * - Fast multi-dimensional slicing & quick date presets
 * - Rule C cost scrubber on unauthorized roles
 * - Drilldown to original source documents
 * - CSV with UTF-8 BOM, Excel, and Print/PDF export
 * - Asynchronous heavy report job queue & monitoring
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  FileBarChart,
  Search,
  Calendar,
  Download,
  Printer,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Filter,
  Bookmark,
  TrendingUp,
  Scale,
  BookOpen,
  Boxes,
  Users,
  Percent,
  RotateCcw,
  ArrowUpDown,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import {
  ReportType,
  ReportCategory,
  ReportDefinition,
  ReportResult,
  ReportSummaryCard,
  ReportFilterPreset,
  ReportAsyncJob,
  REPORT_DEFINITIONS,
  generateReportCsv,
} from '../../lib/reports.js';
import { useI18n } from '../../i18n/context.js';

export const ReportsCenterView: React.FC = () => {
  const { language, isAr } = useI18n();
  const token = typeof window !== 'undefined' ? localStorage.getItem('saudi_erp_session_token') || '' : '';

  // State
  const [activeCategory, setActiveCategory] = useState<ReportCategory | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReport, setSelectedReport] = useState<ReportDefinition | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [reportResult, setReportResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Parameters
  const [datePreset, setDatePreset] = useState<string>('THIS_MONTH');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [asOfDate, setAsOfDate] = useState<string>('');
  const [includeZeroBalances, setIncludeZeroBalances] = useState(false);

  // Presets & Jobs
  const [presets, setPresets] = useState<ReportFilterPreset[]>([]);
  const [presetNameInput, setPresetNameInput] = useState('');
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [asyncJobs, setAsyncJobs] = useState<ReportAsyncJob[]>([]);
  const [activeTab, setActiveTab] = useState<'REPORTS' | 'JOBS'>('REPORTS');

  // Drilldown modal
  const [drilldownDoc, setDrilldownDoc] = useState<any | null>(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);

  // Table search & sort
  const [tableSearch, setTableSearch] = useState('');
  const [sortField, setSortField] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Initialize date presets
  useEffect(() => {
    applyDatePreset(datePreset);
  }, [datePreset]);

  // Load Presets & Jobs on mount
  useEffect(() => {
    fetchHubData();
  }, [token]);

  const applyDatePreset = (preset: string) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();

    const formatDate = (date: Date) => date.toISOString().slice(0, 10);

    if (preset === 'TODAY') {
      const todayStr = formatDate(now);
      setStartDate(todayStr);
      setEndDate(todayStr);
      setAsOfDate(todayStr);
    } else if (preset === 'THIS_MONTH') {
      setStartDate(formatDate(new Date(y, m, 1)));
      setEndDate(formatDate(new Date(y, m + 1, 0)));
      setAsOfDate(formatDate(now));
    } else if (preset === 'LAST_MONTH') {
      setStartDate(formatDate(new Date(y, m - 1, 1)));
      setEndDate(formatDate(new Date(y, m, 0)));
      setAsOfDate(formatDate(new Date(y, m, 0)));
    } else if (preset === 'THIS_QUARTER') {
      const qStartMonth = Math.floor(m / 3) * 3;
      setStartDate(formatDate(new Date(y, qStartMonth, 1)));
      setEndDate(formatDate(new Date(y, qStartMonth + 3, 0)));
      setAsOfDate(formatDate(now));
    } else if (preset === 'YTD') {
      setStartDate(formatDate(new Date(y, 0, 1)));
      setEndDate(formatDate(now));
      setAsOfDate(formatDate(now));
    }
  };

  const fetchHubData = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/v1/reports/hub', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setPresets(data.presets || []);
      }
      fetchJobs();
    } catch (e) {
      console.error(e);
    }
  };

  const fetchJobs = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/v1/reports/jobs', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setAsyncJobs(data.jobs || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Run Report Synchronously
  const runReport = async (reportDef: ReportDefinition) => {
    setIsLoading(true);
    setError(null);
    setSelectedReport(reportDef);

    try {
      const queryParams = new URLSearchParams({
        startDate,
        endDate,
        asOfDate,
        includeZeroBalances: String(includeZeroBalances),
      });

      const res = await fetch(`/api/v1/reports/execute/${reportDef.type}?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to execute report');
      }

      setReportResult(data.report);
    } catch (err: any) {
      setError(err.message || 'Error generating report');
    } finally {
      setIsLoading(false);
    }
  };

  // Run Report Asynchronously (Background Heavy Job)
  const runAsyncReport = async (reportDef: ReportDefinition) => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/reports/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          reportType: reportDef.type,
          parameters: { startDate, endDate, asOfDate, includeZeroBalances },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setActiveTab('JOBS');
        fetchJobs();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Save Filter Preset
  const handleSavePreset = async () => {
    if (!selectedReport || !presetNameInput.trim() || !token) return;
    try {
      const res = await fetch('/api/v1/reports/presets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          reportType: selectedReport.type,
          name: presetNameInput.trim(),
          parameters: { startDate, endDate, asOfDate, includeZeroBalances },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPresets([...presets, data.preset]);
        setShowPresetModal(false);
        setPresetNameInput('');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Drilldown to real source document
  const openSourceDocument = async (sourceDoc: { type: string; id: string; number: string }) => {
    if (!token) return;
    setDrilldownLoading(true);
    try {
      const res = await fetch(`/api/v1/reports/source-document/${sourceDoc.type}/${sourceDoc.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setDrilldownDoc({ ...data.document, _docType: sourceDoc.type, _docNumber: sourceDoc.number });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDrilldownLoading(false);
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    if (!reportResult) return;
    const csv = generateReportCsv(reportResult, isAr ? 'ar' : 'en');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportResult.reportType}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Print view
  const handlePrint = () => {
    window.print();
  };

  // Filtered reports catalog
  const filteredReports = useMemo(() => {
    return REPORT_DEFINITIONS.filter((r) => {
      const matchesCategory = activeCategory === 'ALL' || r.category === activeCategory;
      const matchesSearch =
        searchQuery === '' ||
        r.nameAr.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.descriptionAr.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, searchQuery]);

  // Filtered and sorted table rows
  const displayRows = useMemo(() => {
    if (!reportResult) return [];
    let list = [...reportResult.rows];

    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase();
      list = list.filter((r) =>
        Object.values(r).some((v) => typeof v === 'string' && v.toLowerCase().includes(q))
      );
    }

    if (sortField) {
      list.sort((a, b) => {
        const valA = a[sortField] ?? '';
        const valB = b[sortField] ?? '';
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortOrder === 'asc' ? valA - valB : valB - valA;
        }
        return sortOrder === 'asc'
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      });
    }

    return list;
  }, [reportResult, tableSearch, sortField, sortOrder]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-lg">
              <FileBarChart className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                {isAr ? 'التقارير' : 'Reports'}
              </h1>
              <p className="text-sm text-slate-500">
                {isAr
                  ? 'تقارير مالية، ذمم مدينة ودائنة، مبيعات، مخزون وضريبة متوافقة مع القيد الذهبي'
                  : 'Financial, AR/AP, Sales, Inventory, and VAT reports linked to source ledgers'}
              </p>
            </div>
          </div>
        </div>

        {/* View mode switcher */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('REPORTS')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'REPORTS'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {isAr ? 'دليل التقارير' : 'Report Catalog'}
          </button>
          <button
            onClick={() => {
              setActiveTab('JOBS');
              fetchJobs();
            }}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
              activeTab === 'JOBS'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            {isAr ? 'التقارير المجدولة في الخلفية' : 'Async Heavy Jobs'}
            {asyncJobs.length > 0 && (
              <span className="px-1.5 py-0.5 text-xs bg-emerald-800 text-white rounded-full">
                {asyncJobs.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {activeTab === 'JOBS' ? (
        /* ================= ASYNC JOBS TAB ================= */
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Clock className="w-5 h-5 text-emerald-600" />
              {isAr ? 'سجل تشغيل التقارير الثقيلة في الخلفية' : 'Background Asynchronous Report Queue'}
            </h2>
            <button
              onClick={fetchJobs}
              className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center gap-1.5"
            >
              <RefreshCw className="w-4 h-4" />
              {isAr ? 'تحديث السجل' : 'Refresh Queue'}
            </button>
          </div>

          {asyncJobs.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Clock className="w-12 h-12 mx-auto mb-3 stroke-1" />
              <p>{isAr ? 'لا توجد تقارير قيد المعالجة أو منتهية حالياً' : 'No background report jobs found.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-sm text-start">
                <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="p-3 text-start">{isAr ? 'رقم المهمة' : 'Job ID'}</th>
                    <th className="p-3 text-start">{isAr ? 'نوع التقرير' : 'Report Type'}</th>
                    <th className="p-3 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                    <th className="p-3 text-center">{isAr ? 'التقدم' : 'Progress'}</th>
                    <th className="p-3 text-start">{isAr ? 'وقت الإطلاق' : 'Created At'}</th>
                    <th className="p-3 text-end">{isAr ? 'الإجراء' : 'Action'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {asyncJobs.map((j) => (
                    <tr key={j.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono text-xs">{j.id}</td>
                      <td className="p-3 font-medium text-slate-800">{j.reportType}</td>
                      <td className="p-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            j.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : j.status === 'PROCESSING'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {j.status}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="w-24 bg-slate-200 rounded-full h-2 mx-auto overflow-hidden">
                          <div
                            className="bg-emerald-600 h-2 rounded-full"
                            style={{ width: `${j.progressPercentage}%` }}
                          />
                        </div>
                      </td>
                      <td className="p-3 text-xs text-slate-500">{new Date(j.createdAt).toLocaleTimeString()}</td>
                      <td className="p-3 text-end">
                        {j.status === 'COMPLETED' && j.downloadUrl && (
                          <a
                            href={j.downloadUrl}
                            download
                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded text-xs font-medium"
                          >
                            <Download className="w-3.5 h-3.5" />
                            {isAr ? 'تحميل النتائج (CSV)' : 'Download CSV'}
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* ================= REPORT CATALOG & EXECUTION ================= */
        <div className="space-y-6">
          {/* Category Tabs & Search Bar */}
          <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200">
            {/* Category Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              {(
                [
                  { id: 'ALL', labelAr: 'الكل (24)', labelEn: 'All (24)' },
                  { id: 'FINANCIAL', labelAr: 'التقارير المالية', labelEn: 'Financial' },
                  { id: 'AR_AP', labelAr: 'العملاء والموردين', labelEn: 'AR / AP' },
                  { id: 'SALES', labelAr: 'المبيعات', labelEn: 'Sales' },
                  { id: 'INVENTORY', labelAr: 'المخزون', labelEn: 'Inventory' },
                  { id: 'VAT', labelAr: 'الضريبة والزكاة', labelEn: 'VAT & ZATCA' },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id as any)}
                  className={`px-3.5 py-1.5 text-xs md:text-sm font-medium rounded-lg whitespace-nowrap transition-all ${
                    activeCategory === cat.id
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {isAr ? cat.labelAr : cat.labelEn}
                </button>
              ))}
            </div>

            {/* Search Box */}
            <div className="relative min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute start-3 top-2.5" />
              <input
                type="text"
                placeholder={isAr ? 'بحث في أسماء أو وصف التقارير...' : 'Search reports...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full ps-9 pe-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Slicers & Parameter Settings Bar (Always visible when a report is selected) */}
          {selectedReport && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {isAr ? 'فلاتر التشغيل لتقرير:' : 'Parameters for:'}
                  </span>
                  <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-md font-bold text-sm">
                    {isAr ? selectedReport.nameAr : selectedReport.nameEn}
                  </span>
                </div>

                {/* Quick Date Presets */}
                <div className="flex items-center gap-1">
                  {['TODAY', 'THIS_MONTH', 'LAST_MONTH', 'THIS_QUARTER', 'YTD'].map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setDatePreset(preset)}
                      className={`px-2 py-1 text-xs rounded border ${
                        datePreset === preset
                          ? 'bg-emerald-600 border-emerald-600 text-white font-medium'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {preset === 'TODAY'
                        ? isAr
                          ? 'اليوم'
                          : 'Today'
                        : preset === 'THIS_MONTH'
                        ? isAr
                          ? 'هذا الشهر'
                          : 'This Month'
                        : preset === 'LAST_MONTH'
                        ? isAr
                          ? 'الشهر الماضي'
                          : 'Last Month'
                        : preset === 'THIS_QUARTER'
                        ? isAr
                          ? 'الربع الحالي'
                          : 'This Qtr'
                        : isAr
                        ? 'من أول السنة'
                        : 'YTD'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date Inputs & Checkboxes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {isAr ? 'من تاريخ' : 'Start Date'}
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setDatePreset('CUSTOM');
                    }}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {isAr ? 'إلى تاريخ' : 'End Date'}
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setDatePreset('CUSTOM');
                    }}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeZeroBalances}
                      onChange={(e) => setIncludeZeroBalances(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    {isAr ? 'إظهار الحسابات الصفرية' : 'Include zero balances'}
                  </label>
                </div>
                <div className="flex items-center justify-end gap-2 pt-4">
                  <button
                    onClick={() => runReport(selectedReport)}
                    disabled={isLoading}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg shadow-xs flex items-center gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    {isAr ? 'تشغيل التقرير' : 'Run Report'}
                  </button>
                  {selectedReport.isHeavyReport && (
                    <button
                      onClick={() => runAsyncReport(selectedReport)}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-medium rounded-lg flex items-center gap-1.5"
                    >
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      {isAr ? 'تشغيل في الخلفية' : 'Run Async'}
                    </button>
                  )}
                  <button
                    onClick={() => setShowPresetModal(true)}
                    className="p-2 border border-slate-200 hover:bg-slate-100 rounded-lg text-slate-600"
                    title={isAr ? 'حفظ كنموذج مخصص' : 'Save as preset'}
                  >
                    <Bookmark className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Report Catalog Grid (Hidden if a report is loaded and running) */}
          {!reportResult && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredReports.map((r) => (
                <div
                  key={r.type}
                  onClick={() => runReport(r)}
                  className="p-4 bg-white hover:bg-emerald-50/40 rounded-xl border border-slate-200 hover:border-emerald-300 shadow-2xs hover:shadow-xs transition-all cursor-pointer group flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-slate-800 group-hover:text-emerald-800 text-base">
                        {isAr ? r.nameAr : r.nameEn}
                      </h3>
                      {r.requiresCostPermission && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded font-medium">
                          Rule C
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-2">
                      {isAr ? r.descriptionAr : r.descriptionEn}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                    <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
                      {r.category}
                    </span>
                    <span className="text-emerald-600 font-semibold group-hover:underline flex items-center gap-1">
                      {isAr ? 'عرض الآن' : 'View Report'}
                      <ChevronLeft className="w-3.5 h-3.5 rtl:rotate-0 ltr:rotate-180" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Report Execution Output View */}
          {reportResult && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs space-y-5 p-4 md:p-6">
              {/* Report Header Bar */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-100">
                <div>
                  <button
                    onClick={() => setReportResult(null)}
                    className="text-xs text-emerald-600 hover:underline mb-1 inline-flex items-center gap-1"
                  >
                    <ChevronRight className="w-3.5 h-3.5 rtl:rotate-0 ltr:rotate-180" />
                    {isAr ? 'العودة لقائمة التقارير' : 'Back to Reports List'}
                  </button>
                  <h2 className="text-lg md:text-xl font-bold text-slate-900">
                    {isAr ? reportResult.titleAr : reportResult.titleEn}
                  </h2>
                  <p className="text-xs text-slate-400 font-mono">
                    {isAr ? 'تاريخ التوليد:' : 'Generated:'} {new Date(reportResult.generatedAt).toLocaleString()} |{' '}
                    {reportResult.executionTimeMs}ms
                  </p>
                </div>

                {/* Export / Print Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportCsv}
                    className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-2xs"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-600" />
                    {isAr ? 'تصدير CSV (Excel)' : 'Export CSV'}
                  </button>
                  <button
                    onClick={handlePrint}
                    className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-2xs"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-600" />
                    {isAr ? 'طباعة / PDF' : 'Print / PDF'}
                  </button>
                </div>
              </div>

              {/* KPI Summary Cards */}
              {reportResult.summaryCards && reportResult.summaryCards.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {reportResult.summaryCards.map((card) => (
                    <div
                      key={card.id}
                      className={`p-4 rounded-xl border ${
                        card.variant === 'success'
                          ? 'bg-emerald-50/70 border-emerald-200'
                          : card.variant === 'danger'
                          ? 'bg-rose-50/70 border-rose-200'
                          : card.variant === 'warning'
                          ? 'bg-amber-50/70 border-amber-200'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <span className="block text-xs font-medium text-slate-500 mb-1">
                        {isAr ? card.labelAr : card.labelEn}
                      </span>
                      <span className="block text-lg font-bold text-slate-900">{card.value}</span>
                      {card.subtitleAr && (
                        <span className="block text-xs text-slate-400 mt-1">
                          {isAr ? card.subtitleAr : card.subtitleEn}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* In-table search */}
              <div className="flex justify-between items-center">
                <div className="relative w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute start-3 top-2.5" />
                  <input
                    type="text"
                    placeholder={isAr ? 'تصفية النتائج...' : 'Filter table...'}
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    className="w-full ps-9 pe-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div className="text-xs text-slate-400">
                  {isAr ? `إجمالي السجلات: ${displayRows.length}` : `Total rows: ${displayRows.length}`}
                </div>
              </div>

              {/* Data Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs md:text-sm text-start">
                  <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      {reportResult.columns.map((col) => (
                        <th
                          key={col.field}
                          onClick={() => {
                            if (sortField === col.field) {
                              setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSortField(col.field);
                              setSortOrder('asc');
                            }
                          }}
                          className={`p-3 cursor-pointer hover:bg-slate-100 ${
                            col.align === 'end' ? 'text-end' : col.align === 'center' ? 'text-center' : 'text-start'
                          }`}
                        >
                          <div className="inline-flex items-center gap-1">
                            <span>{isAr ? col.labelAr : col.labelEn}</span>
                            <ArrowUpDown className="w-3 h-3 text-slate-400" />
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayRows.length === 0 ? (
                      <tr>
                        <td colSpan={reportResult.columns.length} className="text-center py-8 text-slate-400">
                          {isAr ? 'لا توجد حركات في هذه الفترة' : 'No transactions recorded for this period'}
                        </td>
                      </tr>
                    ) : (
                      displayRows.map((row, idx) => {
                        const isHeader = row.isHeader;
                        const isSubtotal = row.isSubtotal;
                        const isHighlight = row.isHighlight;

                        return (
                          <tr
                            key={row.id || idx}
                            className={`${
                              isHeader
                                ? 'bg-slate-100 font-bold text-slate-800'
                                : isHighlight
                                ? 'bg-emerald-50/60 font-bold text-emerald-950'
                                : isSubtotal
                                ? 'bg-slate-50 font-semibold text-slate-900'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            {reportResult.columns.map((col) => {
                              const val = row[col.field];
                              const isLink = col.type === 'link' && row.sourceDocument;

                              return (
                                <td
                                  key={col.field}
                                  className={`p-3 ${
                                    col.align === 'end'
                                      ? 'text-end font-mono'
                                      : col.align === 'center'
                                      ? 'text-center'
                                      : 'text-start'
                                  }`}
                                >
                                  {isLink ? (
                                    <button
                                      onClick={() => openSourceDocument(row.sourceDocument!)}
                                      className="text-emerald-600 hover:text-emerald-800 font-medium underline inline-flex items-center gap-1"
                                    >
                                      {val}
                                      <ExternalLink className="w-3 h-3" />
                                    </button>
                                  ) : (
                                    val ?? '-'
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )}

                    {/* Totals Row */}
                    {reportResult.totals && (
                      <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                        {reportResult.columns.map((col, idx) => {
                          if (idx === 0) {
                            return (
                              <td key={col.field} className="p-3 text-start">
                                {isAr ? 'الإجمالي العام' : 'Grand Total'}
                              </td>
                            );
                          }
                          const totVal = reportResult.totals![col.field];
                          return (
                            <td key={col.field} className="p-3 text-end font-mono">
                              {totVal || ''}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Save Preset Modal */}
      {showPresetModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <h3 className="font-bold text-slate-800 text-lg">
              {isAr ? 'حفظ نموذج الفلتر للاستخدام لاحقاً' : 'Save Filter Preset'}
            </h3>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isAr ? 'اسم النموذج المخصص' : 'Preset Name'}
              </label>
              <input
                type="text"
                placeholder={isAr ? 'مثال: تقرير المبيعات الربع سنوي' : 'e.g., Quarterly Sales'}
                value={presetNameInput}
                onChange={(e) => setPresetNameInput(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowPresetModal(false)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleSavePreset}
                disabled={!presetNameInput.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium"
              >
                {isAr ? 'حفظ' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Real Source Document Drilldown Modal */}
      {drilldownDoc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-xs font-bold rounded">
                  {drilldownDoc._docType}
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">
                  {isAr ? 'الوثيقة المصدرية:' : 'Source Document:'} {drilldownDoc._docNumber}
                </h3>
                <p className="text-xs text-slate-500">
                  {isAr ? 'التاريخ:' : 'Date:'} {drilldownDoc.date || drilldownDoc.issueDate || drilldownDoc.billDate}
                </p>
              </div>
              <button
                onClick={() => setDrilldownDoc(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl px-2"
              >
                ✕
              </button>
            </div>

            {/* Document details preview */}
            <div className="space-y-3 text-sm">
              <div className="p-3 bg-slate-50 rounded-lg space-y-1 text-xs">
                <p>
                  <span className="font-semibold text-slate-700">{isAr ? 'البيان / الوصف:' : 'Description:'}</span>{' '}
                  {drilldownDoc.description || drilldownDoc.notes || '-'}
                </p>
                {drilldownDoc.totalAmountCents && (
                  <p>
                    <span className="font-semibold text-slate-700">{isAr ? 'الإجمالي (هللات):' : 'Total Cents:'}</span>{' '}
                    {drilldownDoc.totalAmountCents}
                  </p>
                )}
                {drilldownDoc.status && (
                  <p>
                    <span className="font-semibold text-slate-700">{isAr ? 'حالة الاعتماد:' : 'Status:'}</span>{' '}
                    <span className="font-mono text-emerald-700 font-bold">{drilldownDoc.status}</span>
                  </p>
                )}
              </div>

              {/* Lines table if available */}
              {drilldownDoc.lines && drilldownDoc.lines.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-700 text-xs mb-2">
                    {isAr ? 'بنود وسطور المستند الأصلي' : 'Document Line Items'}
                  </h4>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs text-start">
                      <thead className="bg-slate-100 text-slate-700">
                        <tr>
                          <th className="p-2 text-start">#</th>
                          <th className="p-2 text-start">{isAr ? 'البند / الحساب' : 'Account / Item'}</th>
                          <th className="p-2 text-end">{isAr ? 'مدين / الكمية' : 'Debit / Qty'}</th>
                          <th className="p-2 text-end">{isAr ? 'دائن / السعر' : 'Credit / Price'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {drilldownDoc.lines.map((line: any, idx: number) => (
                          <tr key={idx}>
                            <td className="p-2 font-mono">{idx + 1}</td>
                            <td className="p-2">
                              {line.accountNameAr || line.itemNameAr || line.accountCode || '-'}
                            </td>
                            <td className="p-2 text-end font-mono">
                              {line.debitCents ? `${Number(line.debitCents) / 100} SAR` : line.quantity || '-'}
                            </td>
                            <td className="p-2 text-end font-mono">
                              {line.creditCents ? `${Number(line.creditCents) / 100} SAR` : line.unitPriceCents ? `${Number(line.unitPriceCents) / 100} SAR` : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setDrilldownDoc(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default ReportsCenterView;

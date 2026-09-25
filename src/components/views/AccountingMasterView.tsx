import React, { useState, useEffect, useMemo } from 'react';
import {
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Building2,
  Calendar,
  Layers,
  FileText,
  RotateCcw,
  Lock,
  Unlock,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Download,
  Printer,
  Sparkles,
  HelpCircle,
  ArrowRight,
  Scale,
  DollarSign,
  PieChart,
  Trash2,
  Edit2
} from 'lucide-react';
import { useI18n } from '../../i18n/context.js';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { Tabs } from '../ui/Tabs';
import { useToast } from '../ui/Toast';
import {
  roundHalfUp,
  toHalalas,
  fromHalalasToDisplay,
  validateJournalBalance,
  formatCurrency,
  JournalLine
} from '../../lib/accounting';

interface Account {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  normalBalance: 'DEBIT' | 'CREDIT';
  parentId: string | null;
  level: number;
  isHeader: boolean;
  currency: string;
  currentBalance?: string;
  isActive: boolean;
}

interface JournalLineItem {
  id?: string;
  accountId: string;
  accountCode?: string;
  accountNameAr: string;
  accountNameEn: string;
  debit: string;
  credit: string;
  description?: string;
  costCenterId?: string;
}

interface JournalRecord {
  id: string;
  number: string;
  date: string;
  description: string;
  descriptionAr: string;
  descriptionEn: string;
  sourceType: string;
  sourceKey: string;
  status: 'POSTED' | 'REVERSED';
  totalDebit: string;
  totalCredit: string;
  lines: JournalLineItem[];
  createdAt: string;
  reversedByJournalId?: string;
  reversalReason?: string;
}

interface FiscalYear {
  id: string;
  year: number;
  startDate: string;
  endDate: string;
  isClosed: boolean;
}

interface FinancialPeriod {
  id: string;
  fiscalYearId: string;
  periodNumber: number;
  nameAr: string;
  nameEn: string;
  startDate: string;
  endDate: string;
  isClosed: boolean;
}

interface TrialBalanceRow {
  accountId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  type: string;
  normalBalance: string;
  isHeader: boolean;
  totalDebit: string;
  totalCredit: string;
  netDebit: string;
  netCredit: string;
  movementCount: number;
}

interface TrialBalanceReport {
  isBalanced: boolean;
  discrepancy: string;
  grandTotalDebits: string;
  grandTotalCredits: string;
  rows: TrialBalanceRow[];
  journalsCount: number;
  generatedAt: string;
}

export const AccountingMasterView: React.FC<{ onNavigate?: (route: string) => void }> = () => {
  const { isAr } = useI18n();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<string>('accounts');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Data State
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journals, setJournals] = useState<JournalRecord[]>([]);
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [periods, setPeriods] = useState<FinancialPeriod[]>([]);
  const [trialBalance, setTrialBalance] = useState<TrialBalanceReport | null>(null);

  // Filter States
  const [accountTypeFilter, setAccountTypeFilter] = useState<string>('ALL');
  const [accountSearch, setAccountSearch] = useState<string>('');
  const [journalSearch, setJournalSearch] = useState<string>('');
  const [journalSourceFilter, setJournalSourceFilter] = useState<string>('ALL');
  const [expandedJournalId, setExpandedJournalId] = useState<string | null>(null);

  // Modals
  const [showNewAccountModal, setShowNewAccountModal] = useState<boolean>(false);
  const [showNewJournalModal, setShowNewJournalModal] = useState<boolean>(false);
  const [showReverseModal, setShowReverseModal] = useState<boolean>(false);
  const [selectedJournalToReverse, setSelectedJournalToReverse] = useState<JournalRecord | null>(null);
  const [reversalReason, setReversalReason] = useState<string>('');

  // New Account Form State
  const [newAccountForm, setNewAccountForm] = useState({
    code: '',
    nameAr: '',
    nameEn: '',
    type: 'ASSET' as Account['type'],
    normalBalance: 'DEBIT' as Account['normalBalance'],
    parentId: '',
    isHeader: false,
  });

  // New Journal Form State
  const [newJournalForm, setNewJournalForm] = useState({
    date: new Date().toISOString().split('T')[0],
    descriptionAr: '',
    reference: '',
    sourceType: 'MANUAL',
    lines: [
      { accountId: '', debit: '0.00', credit: '0.00', description: '' },
      { accountId: '', debit: '0.00', credit: '0.00', description: '' },
    ],
  });

  const getAuthHeaders = () => {
    const token = localStorage.getItem('saudi_erp_session_token') || localStorage.getItem('token') || 'seed-token';
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  };

  // Load All Accounting Data
  const loadAccountingData = async () => {
    setIsLoading(true);
    try {
      const headers = getAuthHeaders();

      // 1. Accounts
      const accRes = await fetch('/api/v1/accounting/accounts', { headers });
      if (accRes.ok) {
        const data = await accRes.json();
        setAccounts(data.accounts || []);
      }

      // 2. Journals
      const jRes = await fetch('/api/v1/accounting/journals', { headers });
      if (jRes.ok) {
        const data = await jRes.json();
        // The API returns entryNumber / entryDate / descriptionAr|En / sourceDocument*;
        // normalise to the fields this screen uses so every journal renders and searches.
        const normalised: JournalRecord[] = (data.journals || []).map((j: any) => ({
          ...j,
          number: j.number ?? j.entryNumber ?? '',
          date: j.date ?? j.entryDate ?? '',
          description: j.description ?? (isAr ? j.descriptionAr : j.descriptionEn) ?? j.descriptionAr ?? j.descriptionEn ?? '',
          descriptionAr: j.descriptionAr ?? '',
          descriptionEn: j.descriptionEn ?? '',
          sourceType: j.sourceType ?? j.sourceDocumentType ?? '',
          sourceKey: j.sourceKey ?? j.sourceDocumentNumber ?? '',
          lines: Array.isArray(j.lines) ? j.lines : [],
        }));
        setJournals(normalised);
      }

      // 3. Fiscal Years & Periods
      const fyRes = await fetch('/api/v1/accounting/fiscal-years', { headers });
      if (fyRes.ok) {
        const data = await fyRes.json();
        setFiscalYears(data.fiscalYears || []);
      }

      const pRes = await fetch('/api/v1/accounting/periods', { headers });
      if (pRes.ok) {
        const data = await pRes.json();
        setPeriods(data.periods || []);
      }

      // 4. Trial Balance
      const tbRes = await fetch('/api/v1/accounting/trial-balance', { headers });
      if (tbRes.ok) {
        const data = await tbRes.json();
        setTrialBalance(data);
      }
    } catch (err) {
      console.error('Failed to load accounting data:', err);
      toast.error(isAr ? 'خطأ في جلب بيانات المحاسبة' : 'Failed to load accounting data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAccountingData();
  }, []);

  // Filtered Accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      const matchType = accountTypeFilter === 'ALL' || acc.type === accountTypeFilter;
      const matchSearch =
        acc.code.includes(accountSearch) ||
        (acc.nameAr || '').toLowerCase().includes(accountSearch.toLowerCase()) ||
        (acc.nameEn || '').toLowerCase().includes(accountSearch.toLowerCase());
      return matchType && matchSearch;
    });
  }, [accounts, accountTypeFilter, accountSearch]);

  // Filtered Journals
  const filteredJournals = useMemo(() => {
    return journals.filter((j) => {
      const matchSource = journalSourceFilter === 'ALL' || j.sourceType === journalSourceFilter;
      const matchSearch =
        j.number.toLowerCase().includes(journalSearch.toLowerCase()) ||
        j.description.toLowerCase().includes(journalSearch.toLowerCase()) ||
        (j.sourceKey && j.sourceKey.toLowerCase().includes(journalSearch.toLowerCase()));
      return matchSource && matchSearch;
    });
  }, [journals, journalSourceFilter, journalSearch]);

  // Live Balance Check for New Journal Form
  const liveJournalValidation = useMemo(() => {
    const formattedLines: JournalLine[] = newJournalForm.lines.map((l) => {
      const matchedAcc = accounts.find((a) => a.id === l.accountId);
      return {
        accountId: l.accountId,
        accountNameAr: matchedAcc?.nameAr || '',
        accountNameEn: matchedAcc?.nameEn || '',
        debit: l.debit || '0.00',
        credit: l.credit || '0.00',
        description: l.description,
      };
    });
    return validateJournalBalance(formattedLines);
  }, [newJournalForm.lines, accounts]);

  // Handle New Account Submit
  const handleCreateAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountForm.code.trim() || !newAccountForm.nameAr.trim()) {
      toast.error(isAr ? 'يرجى إدخال رمز واسم الحساب' : 'Please provide account code and name');
      return;
    }

    try {
      const res = await fetch('/api/v1/accounting/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || 'seed-token'}`
        },
        body: JSON.stringify({
          ...newAccountForm,
          nameEn: newAccountForm.nameEn.trim() || newAccountForm.nameAr.trim(),
          parentId: newAccountForm.parentId || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to create account');
      }

      toast.success(isAr ? 'تم إنشاء الحساب بنجاح في شجرة الحسابات' : 'Account created successfully');
      setShowNewAccountModal(false);
      setNewAccountForm({
        code: '',
        nameAr: '',
        nameEn: '',
        type: 'ASSET',
        normalBalance: 'DEBIT',
        parentId: '',
        isHeader: false,
      });
      loadAccountingData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Handle Dynamic Line Changes in New Journal
  const handleJournalLineChange = (index: number, field: string, value: string) => {
    const updated = [...newJournalForm.lines];
    updated[index] = { ...updated[index], [field]: value };
    setNewJournalForm({ ...newJournalForm, lines: updated });
  };

  const handleAddJournalLine = () => {
    setNewJournalForm({
      ...newJournalForm,
      lines: [...newJournalForm.lines, { accountId: '', debit: '0.00', credit: '0.00', description: '' }],
    });
  };

  const handleRemoveJournalLine = (index: number) => {
    if (newJournalForm.lines.length <= 2) {
      toast.error(isAr ? 'يجب أن يحتوي القيد على سطرين على الأقل' : 'Journal must have at least 2 lines');
      return;
    }
    const updated = newJournalForm.lines.filter((_, i) => i !== index);
    setNewJournalForm({ ...newJournalForm, lines: updated });
  };

  // Handle Post Journal Submit
  const handlePostJournalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveJournalValidation.isValid) {
      toast.error(liveJournalValidation.errorAr || liveJournalValidation.error || 'القيد غير متوازن');
      return;
    }

    if (!newJournalForm.descriptionAr.trim()) {
      toast.error(isAr ? 'يرجى إدخال شرح وبيان القيد' : 'Please provide journal description');
      return;
    }

    try {
      const payloadLines = newJournalForm.lines
        .filter((l) => l.accountId && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0))
        .map((l) => ({
          accountId: l.accountId,
          debit: l.debit || '0.00',
          credit: l.credit || '0.00',
          description: l.description || newJournalForm.descriptionAr,
        }));

      const res = await fetch('/api/v1/accounting/journals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || 'seed-token'}`
        },
        body: JSON.stringify({
          date: newJournalForm.date,
          description: newJournalForm.descriptionAr,
          descriptionAr: newJournalForm.descriptionAr,
          descriptionEn: newJournalForm.descriptionAr,
          reference: newJournalForm.reference,
          sourceType: newJournalForm.sourceType,
          lines: payloadLines,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to post journal');
      }

      toast.success(isAr ? 'تم ترحيل القيد المحاسبي بنجاح إلى دفتر الأستاذ' : 'Journal posted successfully to General Ledger');
      setShowNewJournalModal(false);
      setNewJournalForm({
        date: new Date().toISOString().split('T')[0],
        descriptionAr: '',
        reference: '',
        sourceType: 'MANUAL',
        lines: [
          { accountId: '', debit: '0.00', credit: '0.00', description: '' },
          { accountId: '', debit: '0.00', credit: '0.00', description: '' },
        ],
      });
      loadAccountingData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Handle Reverse Journal
  const handleReverseJournalSubmit = async () => {
    if (!selectedJournalToReverse) return;
    if (!reversalReason.trim()) {
      toast.error(isAr ? 'يرجى إدخال سبب عكس القيد' : 'Please provide reversal reason');
      return;
    }

    try {
      const res = await fetch(`/api/v1/accounting/journals/${selectedJournalToReverse.id}/reverse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || 'seed-token'}`
        },
        body: JSON.stringify({ reason: reversalReason }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to reverse journal');
      }

      toast.success(isAr ? 'تم إنشاء القيد العكسي وإلغاء أثر القيد الأصلي بنجاح' : 'Journal successfully reversed');
      setShowReverseModal(false);
      setSelectedJournalToReverse(null);
      setReversalReason('');
      loadAccountingData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Helper type badge style
  const getAccountTypeBadge = (type: Account['type']) => {
    switch (type) {
      case 'ASSET':
        return <Badge variant="info" size="sm">{isAr ? 'أصول (1xxx)' : 'Asset'}</Badge>;
      case 'LIABILITY':
        return <Badge variant="warning" size="sm">{isAr ? 'خصوم (2xxx)' : 'Liability'}</Badge>;
      case 'EQUITY':
        return <Badge variant="brand" size="sm">{isAr ? 'حقوق ملكية (3xxx)' : 'Equity'}</Badge>;
      case 'REVENUE':
        return <Badge variant="success" size="sm">{isAr ? 'إيرادات (4xxx)' : 'Revenue'}</Badge>;
      case 'EXPENSE':
        return <Badge variant="danger" size="sm">{isAr ? 'مصروفات (5xxx)' : 'Expense'}</Badge>;
      default:
        return <Badge variant="default" size="sm">{type}</Badge>;
    }
  };

  const tabsConfig = [
    {
      id: 'accounts',
      label: isAr ? 'شجرة الحسابات (COA)' : 'Chart of Accounts',
      icon: <Layers className="w-4 h-4" />,
      badge: accounts.length,
    },
    {
      id: 'journals',
      label: isAr ? 'قيود اليومية ودفتر الأستاذ' : 'Journal Entries & Ledger',
      icon: <FileText className="w-4 h-4" />,
      badge: journals.length,
    },
    {
      id: 'trial-balance',
      label: isAr ? 'ميزان المراجعة (Trial Balance)' : 'Trial Balance',
      icon: <Scale className="w-4 h-4" />,
    },
    {
      id: 'periods',
      label: isAr ? 'الفترات والسنوات المالية' : 'Fiscal Years & Periods',
      icon: <Calendar className="w-4 h-4" />,
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* ==================================================== */}
      {/* 1. HEADER & KPI DASHBOARD                            */}
      {/* ==================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shadow-2xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold text-slate-900">
                  {isAr ? 'الحسابات والقيود' : 'Accounts & Journals'}
                </h1>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAr
                  ? 'محرك القيد المزدوج الثابت، شجرة الحسابات السعودية الموحدة، وميزان المراجعة الحي'
                  : 'Immutable double-entry posting engine, unified Saudi COA, and real-time trial balance'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            startIcon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={loadAccountingData}
            disabled={isLoading}
          >
            {isAr ? 'تحديث البيانات' : 'Refresh'}
          </Button>

          <Button
            variant="primary"
            size="sm"
            startIcon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => setShowNewJournalModal(true)}
          >
            {isAr ? 'إنشاء قيد يدوي جديد' : 'New Manual Journal'}
          </Button>
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Accounts */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500 block mb-1">
              {isAr ? 'إجمالي الحسابات المسجلة' : 'Total Accounts'}
            </span>
            <span className="text-xl font-bold text-slate-900">{accounts.length}</span>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {accounts.filter((a) => !a.isHeader).length} {isAr ? 'حساب فرعي قابل للترحيل' : 'Postable sub-accounts'}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Total Posted Journals */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500 block mb-1">
              {isAr ? 'القيود المرحلة للأستاذ' : 'Posted Journal Entries'}
            </span>
            <span className="text-xl font-bold text-slate-900">{journals.length}</span>
            <div className="text-[11px] text-emerald-600 mt-0.5 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              {isAr ? 'قيد مرحل بصيغة غير قابلة للتعديل' : 'Immutable posted entries'}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Trial Balance Debits/Credits */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500 block mb-1">
              {isAr ? 'حجم الحركة (ميزان المراجعة)' : 'Trial Balance Turnover'}
            </span>
            <span className="text-xl font-bold text-slate-900 font-mono">
              {trialBalance ? formatCurrency(trialBalance.grandTotalDebits, isAr ? 'ar' : 'en') : '0.00'}
            </span>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {isAr ? 'إجمالي المدين = إجمالي الدائن' : 'Debits = Credits'}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
            <Scale className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Invariant Health Status */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500 block mb-1">
              {isAr ? 'حالة التوازن المحاسبي' : 'Invariant Balance Status'}
            </span>
            <div className="flex items-center gap-1.5 mt-1">
              {trialBalance?.isBalanced !== false ? (
                <Badge variant="success" size="sm">
                  {isAr ? 'متزن بنسبة 100% (صفر فارق)' : '100% Balanced (Zero diff)'}
                </Badge>
              ) : (
                <Badge variant="danger" size="sm">
                  {isAr ? `فارق: ${trialBalance?.discrepancy} ر.س` : `Diff: ${trialBalance?.discrepancy}`}
                </Badge>
              )}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {isAr ? 'حسابات الفاصلة الثابتة بالهللات' : 'Fixed-point halalas precision'}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* ==================================================== */}
      {/* 2. TABS NAVIGATION                                   */}
      {/* ==================================================== */}
      <Tabs tabs={tabsConfig} activeTab={activeTab} onChange={setActiveTab} />

      {/* ==================================================== */}
      {/* TAB 1: CHART OF ACCOUNTS (شجرة الحسابات)             */}
      {/* ==================================================== */}
      {activeTab === 'accounts' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1">
              <div className="relative flex-1 max-w-md">
                <Input
                  placeholder={isAr ? 'بحث برقم الحساب أو الاسم...' : 'Search by code or name...'}
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  startIcon={<Search className="w-4 h-4" />}
                />
              </div>

              {/* Type Filter */}
              <div className="w-48">
                <Select
                  options={[
                    { value: 'ALL', label: isAr ? 'جميع أنواع الحسابات' : 'All Account Types' },
                    { value: 'ASSET', label: isAr ? 'الأصول (1)' : 'Assets (1)' },
                    { value: 'LIABILITY', label: isAr ? 'الخصوم (2)' : 'Liabilities (2)' },
                    { value: 'EQUITY', label: isAr ? 'حقوق الملكية (3)' : 'Equity (3)' },
                    { value: 'REVENUE', label: isAr ? 'الإيرادات (4)' : 'Revenue (4)' },
                    { value: 'EXPENSE', label: isAr ? 'المصروفات (5)' : 'Expenses (5)' },
                  ]}
                  value={accountTypeFilter}
                  onChange={(e) => setAccountTypeFilter(e.target.value)}
                />
              </div>
            </div>

            <Button
              variant="primary"
              size="sm"
              startIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setShowNewAccountModal(true)}
            >
              {isAr ? 'إضافة حساب جديد' : 'Add Account'}
            </Button>
          </div>

          {/* Accounts Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4 text-start">{isAr ? 'رمز الحساب' : 'Code'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'اسم الحساب (عربي)' : 'Account Name (Arabic)'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'اسم الحساب (إنجليزي)' : 'Account Name (English)'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'النوع والتصنيف' : 'Type & Class'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'طبيعة الرصيد' : 'Normal Balance'}</th>
                    <th className="py-3 px-4 text-center">{isAr ? 'حساب تجميعي' : 'Header / Postable'}</th>
                    <th className="py-3 px-4 text-center">{isAr ? 'العملة' : 'Currency'}</th>
                    <th className="py-3 px-4 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAccounts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        {isAr ? 'لا توجد حسابات مطابقة لمعايير البحث' : 'No accounts found'}
                      </td>
                    </tr>
                  ) : (
                    filteredAccounts.map((acc) => (
                      <tr
                        key={acc.id}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          acc.isHeader ? 'bg-slate-50/50 font-bold text-slate-900' : 'text-slate-700'
                        }`}
                      >
                        <td className="py-3 px-4 font-mono font-bold text-emerald-800">
                          <span style={{ paddingInlineStart: `${(acc.level - 1) * 16}px` }}>
                            {acc.code}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={acc.isHeader ? 'font-bold text-slate-900' : ''}>
                            {acc.nameAr}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500 font-sans">{acc.nameEn}</td>
                        <td className="py-3 px-4">{getAccountTypeBadge(acc.type)}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              acc.normalBalance === 'DEBIT'
                                ? 'bg-blue-50 text-blue-700 border border-blue-100'
                                : 'bg-purple-50 text-purple-700 border border-purple-100'
                            }`}
                          >
                            {acc.normalBalance === 'DEBIT' ? (isAr ? 'مدين (Debit)' : 'Debit') : (isAr ? 'دائن (Credit)' : 'Credit')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {acc.isHeader ? (
                            <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                              {isAr ? 'رئيسي (تجميعي)' : 'Header'}
                            </span>
                          ) : (
                            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                              {isAr ? 'فرعي (يقبل الترحيل)' : 'Postable'}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-slate-500">
                          {acc.currency || 'SAR'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Badge variant="success" size="sm">
                            {isAr ? 'نشط' : 'Active'}
                          </Badge>
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

      {/* ==================================================== */}
      {/* TAB 2: JOURNALS & GENERAL LEDGER (قيود اليومية)      */}
      {/* ==================================================== */}
      {activeTab === 'journals' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1">
              <div className="relative flex-1 max-w-md">
                <Input
                  placeholder={isAr ? 'بحث برقم القيد أو الوصف أو المرجع...' : 'Search by entry #, description...'}
                  value={journalSearch}
                  onChange={(e) => setJournalSearch(e.target.value)}
                  startIcon={<Search className="w-4 h-4" />}
                />
              </div>

              {/* Source Filter */}
              <div className="w-48">
                <Select
                  options={[
                    { value: 'ALL', label: isAr ? 'جميع مصادر القيود' : 'All Sources' },
                    { value: 'MANUAL', label: isAr ? 'قيد يدوي (Manual)' : 'Manual Journal' },
                    { value: 'SALES', label: isAr ? 'فاتورة مبيعات (Sales)' : 'Sales Invoices' },
                    { value: 'PURCHASING', label: isAr ? 'فاتورة مشتريات (Purchases)' : 'Purchases' },
                    { value: 'TREASURY', label: isAr ? 'سندات وقبض (Treasury)' : 'Treasury' },
                    { value: 'INVENTORY', label: isAr ? 'حركات مخزون (Inventory)' : 'Inventory' },
                    { value: 'OPENING', label: isAr ? 'أرصدة افتتاحية (Opening)' : 'Opening Balance' },
                  ]}
                  value={journalSourceFilter}
                  onChange={(e) => setJournalSourceFilter(e.target.value)}
                />
              </div>
            </div>

            <Button
              variant="primary"
              size="sm"
              startIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setShowNewJournalModal(true)}
            >
              {isAr ? 'إنشاء قيد يدوي' : 'New Journal Entry'}
            </Button>
          </div>

          {/* Journals Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4 text-start">{isAr ? 'رقم القيد' : 'Entry #'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'المصدر' : 'Source'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'البيان والوصف' : 'Description'}</th>
                    <th className="py-3 px-4 text-end">{isAr ? 'إجمالي المدين' : 'Total Debit'}</th>
                    <th className="py-3 px-4 text-end">{isAr ? 'إجمالي الدائن' : 'Total Credit'}</th>
                    <th className="py-3 px-4 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                    <th className="py-3 px-4 text-center">{isAr ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredJournals.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        {isAr ? 'لا توجد قيود يومية مسجلة' : 'No journal entries found'}
                      </td>
                    </tr>
                  ) : (
                    filteredJournals.map((j) => {
                      const isExpanded = expandedJournalId === j.id;
                      return (
                        <React.Fragment key={j.id}>
                          <tr
                            onClick={() => setExpandedJournalId(isExpanded ? null : j.id)}
                            className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                          >
                            <td className="py-3 px-4 font-mono font-bold text-emerald-800 flex items-center gap-2">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-slate-400" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-slate-400" />
                              )}
                              {j.number}
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-600">{j.date}</td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700">
                                {j.sourceType}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-900 font-medium">{j.description}</td>
                            <td className="py-3 px-4 text-end font-mono font-bold text-slate-900">
                              {formatCurrency(j.totalDebit, isAr ? 'ar' : 'en')}
                            </td>
                            <td className="py-3 px-4 text-end font-mono font-bold text-slate-900">
                              {formatCurrency(j.totalCredit, isAr ? 'ar' : 'en')}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {j.status === 'POSTED' ? (
                                <Badge variant="success" size="sm">{isAr ? 'مرحل' : 'Posted'}</Badge>
                              ) : (
                                <Badge variant="danger" size="sm">{isAr ? 'معكوس' : 'Reversed'}</Badge>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                              {j.status === 'POSTED' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  startIcon={<RotateCcw className="w-3.5 h-3.5 text-rose-600" />}
                                  onClick={() => {
                                    setSelectedJournalToReverse(j);
                                    setShowReverseModal(true);
                                  }}
                                >
                                  {isAr ? 'عكس' : 'Reverse'}
                                </Button>
                              )}
                            </td>
                          </tr>

                          {/* Expanded Lines Accordion */}
                          {isExpanded && (
                            <tr className="bg-emerald-50/30 border-b border-slate-200">
                              <td colSpan={8} className="p-4">
                                <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-2xs">
                                  <div className="text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">
                                    {isAr ? 'تفاصيل أسطر القيد المحاسبي (Double-Entry Lines):' : 'Double-Entry Lines Breakdown:'}
                                  </div>
                                  <table className="w-full text-xs text-start border-collapse">
                                    <thead>
                                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                                        <th className="py-2 px-3 text-start">{isAr ? 'رمز الحساب' : 'Account Code'}</th>
                                        <th className="py-2 px-3 text-start">{isAr ? 'اسم الحساب' : 'Account Name'}</th>
                                        <th className="py-2 px-3 text-start">{isAr ? 'البيان' : 'Line Description'}</th>
                                        <th className="py-2 px-3 text-end">{isAr ? 'مدين (SAR)' : 'Debit'}</th>
                                        <th className="py-2 px-3 text-end">{isAr ? 'دائن (SAR)' : 'Credit'}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {j.lines.map((l, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50/50">
                                          <td className="py-2 px-3 font-mono font-bold text-emerald-800">
                                            {l.accountCode || accounts.find((a) => a.id === l.accountId)?.code || '—'}
                                          </td>
                                          <td className="py-2 px-3 font-medium text-slate-800">
                                            {isAr ? l.accountNameAr : l.accountNameEn || l.accountNameAr}
                                          </td>
                                          <td className="py-2 px-3 text-slate-500">{l.description || j.description}</td>
                                          <td className="py-2 px-3 text-end font-mono font-bold text-slate-900">
                                            {parseFloat(l.debit) > 0 ? formatCurrency(l.debit, isAr ? 'ar' : 'en') : '—'}
                                          </td>
                                          <td className="py-2 px-3 text-end font-mono font-bold text-slate-900">
                                            {parseFloat(l.credit) > 0 ? formatCurrency(l.credit, isAr ? 'ar' : 'en') : '—'}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                    <tfoot>
                                      <tr className="bg-slate-50 font-bold border-t border-slate-200">
                                        <td colSpan={3} className="py-2 px-3 text-end text-slate-600">
                                          {isAr ? 'الإجمالي المتوازن:' : 'Total Balanced:'}
                                        </td>
                                        <td className="py-2 px-3 text-end font-mono text-emerald-800">
                                          {formatCurrency(j.totalDebit, isAr ? 'ar' : 'en')}
                                        </td>
                                        <td className="py-2 px-3 text-end font-mono text-emerald-800">
                                          {formatCurrency(j.totalCredit, isAr ? 'ar' : 'en')}
                                        </td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 3: TRIAL BALANCE (ميزان المراجعة)                 */}
      {/* ==================================================== */}
      {activeTab === 'trial-balance' && (
        <div className="space-y-4">
          {/* Trial Balance Health Banner */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Scale className="w-4 h-4 text-emerald-600" />
                {isAr ? 'ميزان المراجعة بالأرصدة والمجاميع (Trial Balance)' : 'Trial Balance Report'}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {isAr
                  ? 'التحقق الصارم من صحة الدفاتر المحاسبية وتطابق جانبي المدين والدائن لجميع الحسابات'
                  : 'Double-entry balance verification across all accounts in the general ledger'}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {trialBalance?.isBalanced !== false ? (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-1.5 rounded-lg text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  {isAr ? 'الميزان متزن تماماً (فارق = 0.00 ر.س)' : 'Fully Balanced (Diff = 0.00 SAR)'}
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-800 px-3 py-1.5 rounded-lg text-xs font-bold">
                  <AlertCircle className="w-4 h-4 text-rose-600" />
                  {isAr ? `يوجد عدم توازن بقيمة ${trialBalance?.discrepancy} ر.س` : `Unbalanced Diff: ${trialBalance?.discrepancy}`}
                </div>
              )}
            </div>
          </div>

          {/* Trial Balance Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4 text-start">{isAr ? 'رمز الحساب' : 'Code'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'اسم الحساب' : 'Account Name'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'التصنيف' : 'Class'}</th>
                    <th className="py-3 px-4 text-end">{isAr ? 'مجموع المدين' : 'Total Debits'}</th>
                    <th className="py-3 px-4 text-end">{isAr ? 'مجموع الدائن' : 'Total Credits'}</th>
                    <th className="py-3 px-4 text-end">{isAr ? 'رصيد مدين صافي' : 'Net Debit'}</th>
                    <th className="py-3 px-4 text-end">{isAr ? 'رصيد دائن صافي' : 'Net Credit'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trialBalance?.rows.map((row) => (
                    <tr
                      key={row.accountId}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        row.isHeader ? 'bg-slate-50/60 font-bold text-slate-900' : 'text-slate-700'
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-emerald-800">{row.code}</td>
                      <td className="py-3 px-4 font-medium text-slate-900">{isAr ? row.nameAr : row.nameEn}</td>
                      <td className="py-3 px-4">{getAccountTypeBadge(row.type as any)}</td>
                      <td className="py-3 px-4 text-end font-mono text-slate-900">
                        {parseFloat(row.totalDebit) > 0 ? formatCurrency(row.totalDebit, isAr ? 'ar' : 'en') : '0.00'}
                      </td>
                      <td className="py-3 px-4 text-end font-mono text-slate-900">
                        {parseFloat(row.totalCredit) > 0 ? formatCurrency(row.totalCredit, isAr ? 'ar' : 'en') : '0.00'}
                      </td>
                      <td className="py-3 px-4 text-end font-mono font-bold text-emerald-800">
                        {parseFloat(row.netDebit) > 0 ? formatCurrency(row.netDebit, isAr ? 'ar' : 'en') : '—'}
                      </td>
                      <td className="py-3 px-4 text-end font-mono font-bold text-purple-800">
                        {parseFloat(row.netCredit) > 0 ? formatCurrency(row.netCredit, isAr ? 'ar' : 'en') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-extrabold text-xs border-t-2 border-slate-300">
                    <td colSpan={3} className="py-3 px-4 text-end text-slate-900">
                      {isAr ? 'المجموع العام لميزان المراجعة:' : 'Grand Total:'}
                    </td>
                    <td className="py-3 px-4 text-end font-mono text-slate-900">
                      {trialBalance ? formatCurrency(trialBalance.grandTotalDebits, isAr ? 'ar' : 'en') : '0.00'}
                    </td>
                    <td className="py-3 px-4 text-end font-mono text-slate-900">
                      {trialBalance ? formatCurrency(trialBalance.grandTotalCredits, isAr ? 'ar' : 'en') : '0.00'}
                    </td>
                    <td className="py-3 px-4 text-end font-mono text-emerald-800">
                      {trialBalance ? formatCurrency(trialBalance.grandTotalDebits, isAr ? 'ar' : 'en') : '0.00'}
                    </td>
                    <td className="py-3 px-4 text-end font-mono text-purple-800">
                      {trialBalance ? formatCurrency(trialBalance.grandTotalCredits, isAr ? 'ar' : 'en') : '0.00'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 4: FISCAL YEARS & FINANCIAL PERIODS             */}
      {/* ==================================================== */}
      {activeTab === 'periods' && (
        <div className="space-y-6">
          {/* Fiscal Years List */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600" />
              {isAr ? 'السنوات المالية (Fiscal Years)' : 'Fiscal Years'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {fiscalYears.map((fy) => (
                <div key={fy.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-extrabold text-slate-900">{isAr ? `السنة المالية ${fy.year}` : `FY ${fy.year}`}</span>
                      {fy.isClosed ? (
                        <Badge variant="default" size="sm">{isAr ? 'مقفلة' : 'Closed'}</Badge>
                      ) : (
                        <Badge variant="success" size="sm">{isAr ? 'سارية ونشطة' : 'Active / Open'}</Badge>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 font-mono mt-1">
                      {fy.startDate} ➔ {fy.endDate}
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-100/50 text-emerald-800 flex items-center justify-center font-bold">
                    {fy.year}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Monthly Periods Grid */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              {isAr ? 'الفترات المالية الشهرية (Monthly Financial Periods - FY 2026)' : 'Monthly Periods'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {periods.map((p) => (
                <div
                  key={p.id}
                  className={`p-3.5 rounded-xl border transition-all ${
                    p.isClosed
                      ? 'bg-slate-100/70 border-slate-200 text-slate-500'
                      : 'bg-white border-emerald-200 shadow-2xs'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-xs text-slate-900">
                      {isAr ? p.nameAr : p.nameEn}
                    </span>
                    {p.isClosed ? (
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                    ) : (
                      <Unlock className="w-3.5 h-3.5 text-emerald-600" />
                    )}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 mb-2">
                    {p.startDate} ➔ {p.endDate}
                  </div>
                  <Badge variant={p.isClosed ? 'default' : 'success'} size="sm">
                    {p.isClosed ? (isAr ? 'مقفلة' : 'Closed') : (isAr ? 'مفتوحة للترحيل' : 'Open')}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL 1: ADD NEW ACCOUNT (شجرة الحسابات)             */}
      {/* ==================================================== */}
      <Modal
        isOpen={showNewAccountModal}
        onClose={() => setShowNewAccountModal(false)}
        title={isAr ? 'إضافة حساب جديد إلى شجرة الحسابات' : 'Create New GL Account'}
        maxWidth="md"
      >
        <form onSubmit={handleCreateAccountSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Input
                label={isAr ? 'رمز الحساب (Account Code)' : 'Account Code'}
                placeholder="e.g. 1113"
                value={newAccountForm.code}
                onChange={(e) => setNewAccountForm({ ...newAccountForm, code: e.target.value })}
                required
              />
            </div>
            <div>
              <Select
                label={isAr ? 'نوع الحساب (Account Type)' : 'Account Type'}
                options={[
                  { value: 'ASSET', label: isAr ? 'أصول (Asset - 1)' : 'Asset (1)' },
                  { value: 'LIABILITY', label: isAr ? 'خصوم (Liability - 2)' : 'Liability (2)' },
                  { value: 'EQUITY', label: isAr ? 'حقوق ملكية (Equity - 3)' : 'Equity (3)' },
                  { value: 'REVENUE', label: isAr ? 'إيرادات (Revenue - 4)' : 'Revenue (4)' },
                  { value: 'EXPENSE', label: isAr ? 'مصروفات (Expense - 5)' : 'Expense (5)' },
                ]}
                value={newAccountForm.type}
                onChange={(e) =>
                  setNewAccountForm({
                    ...newAccountForm,
                    type: e.target.value as any,
                    normalBalance: ['ASSET', 'EXPENSE'].includes(e.target.value) ? 'DEBIT' : 'CREDIT',
                  })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Input
                label={isAr ? 'اسم الحساب بالعربية' : 'Account Name (Arabic)'}
                placeholder="مثال: البنك الأهلي السعودي - جاري"
                value={newAccountForm.nameAr}
                onChange={(e) => setNewAccountForm({ ...newAccountForm, nameAr: e.target.value })}
                required
              />
            </div>
            <div>
              <Input
                label={isAr ? 'اسم الحساب بالإنجليزية' : 'Account Name (English)'}
                placeholder="e.g. SNB Current Account"
                value={newAccountForm.nameEn}
                onChange={(e) => setNewAccountForm({ ...newAccountForm, nameEn: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Select
                label={isAr ? 'الحساب الرئيسي الأب (Parent Account)' : 'Parent Account'}
                options={[
                  { value: '', label: isAr ? '— بدون أب (حساب رئيسي أعلى) —' : '— No Parent (Top Level) —' },
                  ...accounts
                    .filter((a) => a.isHeader)
                    .map((a) => ({
                      value: a.id,
                      label: `${a.code} - ${isAr ? a.nameAr : a.nameEn}`,
                    })),
                ]}
                value={newAccountForm.parentId}
                onChange={(e) => setNewAccountForm({ ...newAccountForm, parentId: e.target.value })}
              />
            </div>
            <div>
              <Select
                label={isAr ? 'طبيعة الرصيد (Normal Balance)' : 'Normal Balance'}
                options={[
                  { value: 'DEBIT', label: isAr ? 'مدين (Debit)' : 'Debit' },
                  { value: 'CREDIT', label: isAr ? 'دائن (Credit)' : 'Credit' },
                ]}
                value={newAccountForm.normalBalance}
                onChange={(e) => setNewAccountForm({ ...newAccountForm, normalBalance: e.target.value as any })}
              />
            </div>
          </div>

          <div className="pt-2 flex items-center gap-2">
            <input
              type="checkbox"
              id="isHeader"
              checked={newAccountForm.isHeader}
              onChange={(e) => setNewAccountForm({ ...newAccountForm, isHeader: e.target.checked })}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <label htmlFor="isHeader" className="text-xs text-slate-700 font-semibold cursor-pointer">
              {isAr ? 'حساب رئيسي تجميعي (لا يقبل الترحيل المباشر)' : 'Header Account (Not directly postable)'}
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <Button variant="secondary" onClick={() => setShowNewAccountModal(false)}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button variant="primary" type="submit">
              {isAr ? 'حفظ الحساب' : 'Create Account'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ==================================================== */}
      {/* MODAL 2: CREATE NEW MANUAL JOURNAL ENTRY (Rule G1)   */}
      {/* ==================================================== */}
      <Modal
        isOpen={showNewJournalModal}
        onClose={() => setShowNewJournalModal(false)}
        title={isAr ? 'إنشاء وترحيل قيد يومية يدوي (Double-Entry Journal)' : 'Post Manual Journal Entry'}
        maxWidth="lg"
      >
        <form onSubmit={handlePostJournalSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Input
                type="date"
                label={isAr ? 'تاريخ القيد' : 'Entry Date'}
                value={newJournalForm.date}
                onChange={(e) => setNewJournalForm({ ...newJournalForm, date: e.target.value })}
                required
              />
            </div>
            <div className="md:col-span-2">
              <Input
                label={isAr ? 'شرح وبيان القيد المحاسبي' : 'Description / Narration'}
                placeholder={isAr ? 'مثال: إثبات سداد مصاريف الصيانة نقداً' : 'e.g. Cash payment for maintenance'}
                value={newJournalForm.descriptionAr}
                onChange={(e) => setNewJournalForm({ ...newJournalForm, descriptionAr: e.target.value })}
                required
              />
            </div>
          </div>

          {/* Dynamic Lines Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="bg-slate-50 p-3 border-b border-slate-200 flex items-center justify-between">
              <span className="font-bold text-slate-800">
                {isAr ? 'أسطر القيد المحاسبي (المدين والدائن)' : 'Journal Lines (Debits & Credits)'}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                startIcon={<Plus className="w-3.5 h-3.5" />}
                onClick={handleAddJournalLine}
              >
                {isAr ? 'إضافة سطر' : 'Add Line'}
              </Button>
            </div>

            <div className="p-3 space-y-3">
              {newJournalForm.lines.map((line, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-slate-50/50 p-2 rounded-lg border border-slate-200">
                  <div className="flex-1">
                    <Select
                      options={[
                        { value: '', label: isAr ? '— اختر الحساب —' : '— Select Account —' },
                        ...accounts
                          .filter((a) => !a.isHeader)
                          .map((a) => ({
                            value: a.id,
                            label: `${a.code} - ${isAr ? a.nameAr : a.nameEn}`,
                          })),
                      ]}
                      value={line.accountId}
                      onChange={(e) => handleJournalLineChange(idx, 'accountId', e.target.value)}
                      required
                    />
                  </div>
                  <div className="w-28">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={isAr ? 'مدين' : 'Debit'}
                      value={line.debit}
                      onChange={(e) => handleJournalLineChange(idx, 'debit', e.target.value)}
                    />
                  </div>
                  <div className="w-28">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={isAr ? 'دائن' : 'Credit'}
                      value={line.credit}
                      onChange={(e) => handleJournalLineChange(idx, 'credit', e.target.value)}
                    />
                  </div>
                  <div className="w-36">
                    <Input
                      placeholder={isAr ? 'بيان السطر (اختياري)' : 'Line memo'}
                      value={line.description}
                      onChange={(e) => handleJournalLineChange(idx, 'description', e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveJournalLine(idx)}
                    disabled={newJournalForm.lines.length <= 2}
                  >
                    <Trash2 className="w-4 h-4 text-rose-500" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Live Balance Summary Bar */}
            <div className="bg-slate-100 p-3 border-t border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-4 text-xs font-mono">
                <span>
                  {isAr ? 'إجمالي المدين:' : 'Total Debits:'}{' '}
                  <strong className="text-emerald-800">{liveJournalValidation.totalDebits} SAR</strong>
                </span>
                <span>
                  {isAr ? 'إجمالي الدائن:' : 'Total Credits:'}{' '}
                  <strong className="text-purple-800">{liveJournalValidation.totalCredits} SAR</strong>
                </span>
              </div>

              <div>
                {liveJournalValidation.isValid ? (
                  <Badge variant="success" size="sm">
                    {isAr ? '✓ القيد متوازن تماماً (0.00 ر.س)' : '✓ Perfectly Balanced (0.00 SAR)'}
                  </Badge>
                ) : (
                  <Badge variant="danger" size="sm">
                    {isAr
                      ? `فارق غير متوازن: ${liveJournalValidation.difference} ر.س`
                      : `Unbalanced diff: ${liveJournalValidation.difference} SAR`}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <Button variant="secondary" onClick={() => setShowNewJournalModal(false)}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button variant="primary" type="submit" disabled={!liveJournalValidation.isValid}>
              {isAr ? 'ترحيل القيد للأستاذ العام' : 'Post Journal to GL'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ==================================================== */}
      {/* MODAL 3: REVERSE JOURNAL ENTRY                       */}
      {/* ==================================================== */}
      <Modal
        isOpen={showReverseModal}
        onClose={() => setShowReverseModal(false)}
        title={isAr ? 'عكس القيد المحاسبي (Journal Reversal)' : 'Reverse Journal Entry'}
        maxWidth="sm"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-600">
            {isAr
              ? `سيتم إنشاء قيد محاسبي عكسي مرتبط بالقيد رقم (${selectedJournalToReverse?.number}) وإلغاء أثره المالي دون حذف السجل الأصلي وفق المعايير الرقابية.`
              : `A linked reversing journal entry will be created for (${selectedJournalToReverse?.number}), negating its balance impact immutably.`}
          </p>

          <Input
            label={isAr ? 'سبب عكس القيد' : 'Reversal Reason'}
            placeholder={isAr ? 'مثال: خطأ في تحديد حساب التوجيه' : 'e.g. Account misclassification'}
            value={reversalReason}
            onChange={(e) => setReversalReason(e.target.value)}
            required
          />

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <Button variant="secondary" onClick={() => setShowReverseModal(false)}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button variant="danger" onClick={handleReverseJournalSubmit}>
              {isAr ? 'تأكيد عكس القيد' : 'Confirm Reversal'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

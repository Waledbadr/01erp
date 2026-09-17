import React, { useState, useEffect } from 'react';
import { useI18n } from '../../i18n/context.js';
import { PageHeader } from '../ui/PageHeader.js';
import { Button } from '../ui/Button.js';
import { Input } from '../ui/Input.js';
import { Badge } from '../ui/Badge.js';
import { useToast } from '../ui/Toast.js';
import {
  Building,
  FileCheck,
  Globe,
  Calendar,
  Percent,
  Cpu,
  GitBranch,
  BookOpen,
  Hash,
  Users,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import {
  validateSaudiVatNumber,
  validateSaudiCrNumber,
  validateSaudiUnifiedNumber,
} from '../../utils/saudiValidators.js';

interface WizardStepInfo {
  step: number;
  id: string;
  titleAr: string;
  titleEn: string;
  isCompleted: boolean;
  isRequired: boolean;
}

export const CompanyWizardView: React.FC<{ onNavigate: (route: string) => void }> = ({ onNavigate }) => {
  const { language, isRTL } = useI18n();
  const isAr = language === 'ar';
  const toast = useToast();

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [steps, setSteps] = useState<WizardStepInfo[]>([]);
  const [healthScore, setHealthScore] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Form states
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nationalAddress, setNationalAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [crNumber, setCrNumber] = useState('');
  const [unifiedNumber, setUnifiedNumber] = useState('');
  const [currency, setCurrency] = useState('SAR');
  const [timezone, setTimezone] = useState('Asia/Riyadh');
  const [fiscalYearStartMonth, setFiscalYearStartMonth] = useState(1);
  const [accountingBasis, setAccountingBasis] = useState<'ACCRUAL' | 'CASH'>('ACCRUAL');
  const [vatRatePercentage, setVatRatePercentage] = useState(15);
  const [vatPreference, setVatPreference] = useState<'EXCLUSIVE' | 'INCLUSIVE'>('EXCLUSIVE');
  const [zatcaEnv, setZatcaEnv] = useState<'simulation' | 'sandbox' | 'production'>('simulation');

  // Entities & Mappings
  const [branchName, setBranchName] = useState('الفرع الرئيسي - الرياض');
  const [warehouseName, setWarehouseName] = useState('المستودع المركزي');
  const [cashboxName, setCashboxName] = useState('خزينة النقدية الرئيسية');
  const [bankName, setBankName] = useState('مصرف الراجحي');
  const [bankIban, setBankIban] = useState('SA0380000000000000000001');

  // Preview next sequence
  const [previewSeq, setPreviewSeq] = useState<string | null>(null);

  // Load wizard status from backend
  const fetchWizardStatus = async () => {
    try {
      const token = localStorage.getItem('saudi_erp_session_token');
      const res = await fetch('/api/v1/company/wizard-status', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setSteps(data.steps || []);
        setHealthScore(data.healthScore || 0);
        if (data.onboardingStep) {
          setCurrentStep(data.onboardingStep);
        }
      }

      // Also get company details to populate fields
      const compRes = await fetch('/api/v1/company/current', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (compRes.ok) {
        const compData = await compRes.json();
        const c = compData.company;
        if (c) {
          setNameAr(c.nameAr || '');
          setNameEn(c.nameEn || '');
          setNationalAddress(c.nationalAddress || '');
          setPhone(c.phone || '');
          setEmail(c.email || '');
          setVatNumber(c.vatNumber || '');
          setCrNumber(c.crNumber || '');
          setUnifiedNumber(c.unifiedNumber || '');
          setCurrency(c.currency || 'SAR');
          setTimezone(c.timezone || 'Asia/Riyadh');
          setFiscalYearStartMonth(c.fiscalYearStartMonth || 1);
          setAccountingBasis(c.accountingBasis || 'ACCRUAL');
          setVatRatePercentage(c.vatRatePercentage || 15);
          setVatPreference(c.vatPreference || 'EXCLUSIVE');
          setZatcaEnv(c.zatcaEnv || 'simulation');
        }
      }
    } catch {
      // Fallback local defaults if needed
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWizardStatus();
  }, []);

  const saveCurrentStep = async (stepNum: number, isComplete = false) => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem('saudi_erp_session_token');
      let stepData: Record<string, unknown> = {};

      if (stepNum === 1) {
        stepData = { nameAr, nameEn, nationalAddress, phone, email };
      } else if (stepNum === 2) {
        const vatCheck = validateSaudiVatNumber(vatNumber);
        if (!vatCheck.valid) {
          toast.error(vatCheck.error || 'الرقم الضريبي غير صالح');
          setIsSaving(false);
          return false;
        }
        const crCheck = validateSaudiCrNumber(crNumber);
        if (!crCheck.valid) {
          toast.error(crCheck.error || 'رقم السجل التجاري غير صالح');
          setIsSaving(false);
          return false;
        }
        stepData = { vatNumber, crNumber, unifiedNumber };
      } else if (stepNum === 3) {
        stepData = { currency, timezone };
      } else if (stepNum === 4) {
        stepData = { fiscalYearStartMonth, accountingBasis };
      } else if (stepNum === 5) {
        stepData = { vatRatePercentage, vatPreference };
      } else if (stepNum === 6) {
        stepData = { zatcaEnv };
      }

      const res = await fetch('/api/v1/company/wizard-step', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          stepNumber: stepNum,
          stepData,
          isComplete,
        }),
      });

      if (res.ok) {
        toast.success(isAr ? `تم حفظ الخطوة ${stepNum} بنجاح` : `Step ${stepNum} saved successfully`);
        await fetchWizardStatus();
        return true;
      }
    } catch {
      toast.error('حدث خطأ أثناء حفظ الخطوة.');
    } finally {
      setIsSaving(false);
    }
    return false;
  };

  const handleNext = async () => {
    const success = await saveCurrentStep(currentStep);
    if (success && currentStep < 10) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    const success = await saveCurrentStep(10, true);
    if (success) {
      const token = localStorage.getItem('saudi_erp_session_token');
      await fetch('/api/v1/company/complete-wizard', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      toast.success(isAr ? 'تهانينا! اكتمل إعداد المنشأة وجاهزية النظام 100%' : 'Setup completed successfully!');
      onNavigate('/');
    }
  };

  const handlePreviewNextSequence = async () => {
    try {
      const token = localStorage.getItem('saudi_erp_session_token');
      const res = await fetch('/api/v1/company/document-sequences/preview-next', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ documentTypeCode: 'INV' }),
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewSeq(data.generatedNumber);
        toast.info(`رقم الفاتورة التالي المولد تسلسلياً: ${data.generatedNumber}`);
      }
    } catch {
      toast.error('فشل استدعاء الترقيم التسلسلي');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Page Header */}
      <PageHeader
        title={isAr ? 'معالج إعداد المنشأة والامتثال السعودي (10 خطوات)' : 'Company Setup & Saudi Compliance Wizard'}
        subtitle={
          isAr
            ? 'الإعداد الشامل للهوية القانونية، الربط الضريبي، وشجرة الحسابات، وترقيم المستندات المعتمدة'
            : 'Comprehensive legal, tax, chart of accounts, and document sequencing onboarding'
        }
        badge={
          <Badge variant={healthScore >= 80 ? 'success' : 'warning'}>
            {isAr ? `مؤشر الجاهزية: ${healthScore}%` : `System Readiness: ${healthScore}%`}
          </Badge>
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => onNavigate('/')}>
            {isAr ? 'العودة للرئيسية' : 'Back to Dashboard'}
          </Button>
        }
      />

      {/* Health Check Progress Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-slate-800 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span>{isAr ? 'اكتمال معايير تدقيق المنشأة والامتثال' : 'Company Audit & Compliance Completion'}</span>
          </span>
          <span className="font-mono font-bold text-emerald-700 text-sm">{healthScore}%</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
          <div
            className="bg-emerald-600 h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${healthScore}%` }}
          />
        </div>

        {/* 10 Step Pills */}
        <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 pt-2">
          {Array.from({ length: 10 }).map((_, i) => {
            const stepNum = i + 1;
            const isCurrent = currentStep === stepNum;
            const isPast = stepNum < currentStep;
            return (
              <button
                key={stepNum}
                onClick={() => setCurrentStep(stepNum)}
                className={`py-1.5 px-2 rounded-lg text-center text-xs font-bold transition-all ${
                  isCurrent
                    ? 'bg-emerald-700 text-white shadow-sm ring-2 ring-emerald-600 ring-offset-1'
                    : isPast
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {stepNum}
              </button>
            );
          })}
        </div>
      </div>

      {/* Step Content Container */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm min-h-[420px] flex flex-col justify-between">
        <div>
          {/* STEP 1: COMPANY PROFILE */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Building className="w-5 h-5 text-emerald-700" />
                  <span>الخطوة 1: ملف المنشأة والهوية التجارية الرسمية</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  الاسم القانوني للمنشأة كما يظهر في السجلات الرسمية والفواتير الضريبية.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="اسم المنشأة باللغة العربية (مطلوب)"
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                  placeholder="شركة التجارة والاستثمار المحدودة"
                  required
                />
                <Input
                  label="اسم المنشأة باللغة الإنجليزية"
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  placeholder="Trading & Investment Co. Ltd."
                />
              </div>

              <Input
                label="العنوان الوطني السعودي الكامل (وفقاً لسجل سبل)"
                value={nationalAddress}
                onChange={(e) => setNationalAddress(e.target.value)}
                placeholder="المملكة العربية السعودية، الرياض، حي العليا، شارع التخصصي، مبنى 1234"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="رقم هاتف المنشأة"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+966 11 234 5678"
                />
                <Input
                  label="البريد الإلكتروني الرسمي"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="info@company.com.sa"
                />
              </div>
            </div>
          )}

          {/* STEP 2: LEGAL & TAX IDENTIFIERS */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-emerald-700" />
                  <span>الخطوة 2: المعرفات القانونية والضريبية (ZATCA & MC)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  الرقم الضريبي المعتمد من هيئة الزكاة والضريبة والجمارك والسجل التجاري.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Input
                    label="الرقم الضريبي VAT (15 خانة تبدأ وتنتهي برقم 3)"
                    value={vatNumber}
                    onChange={(e) => setVatNumber(e.target.value)}
                    placeholder="300000000000003"
                    required
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    يتم التحقق الصارم من الخانات الـ 15 لتطابق معايير ZATCA Phase 2.
                  </p>
                </div>

                <div>
                  <Input
                    label="رقم السجل التجاري (CR - 10 أرقام)"
                    value={crNumber}
                    onChange={(e) => setCrNumber(e.target.value)}
                    placeholder="1010123456"
                    required
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    صادر من وزارة التجارة السعودية.
                  </p>
                </div>
              </div>

              <Input
                label="الرقم الوطني الموحد للمنشآت (700)"
                value={unifiedNumber}
                onChange={(e) => setUnifiedNumber(e.target.value)}
                placeholder="7001234567"
                helperText="الرقم الموحد المكون من 10 خانات تبدأ بالرقم 7"
              />
            </div>
          )}

          {/* STEP 3: LOCALIZATION & CURRENCY */}
          {currentStep === 3 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Globe className="w-5 h-5 text-emerald-700" />
                  <span>الخطوة 3: الإعدادات الإقليمية والعملة والمنطقة الزمنية</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  تحديد عملة النظام الأساسية (SAR) والتوقيت المعتمد للعمليات.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">العملة المحاسبية الأساسية</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="SAR">ريال سعودي (SAR - ر.س)</option>
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">العملة الأساسية لدفتر الأستاذ والتقارير الزكوية.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">المنطقة الزمنية الرسمية</label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="Asia/Riyadh">توقيت الرياض (UTC+03:00 / Asia/Riyadh)</option>
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">التوقيت الإلزامي لأختام الفواتير وسجلات التدقيق.</p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: FISCAL YEAR & ACCOUNTING BASIS */}
          {currentStep === 4 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-emerald-700" />
                  <span>الخطوة 4: السنة المالية والأساس المحاسبي</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  تحديد دورة السنة المالية وأساس الاستحقاق المعتمد في المعايير الدولية (IFRS).
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">بداية السنة المالية</label>
                  <select
                    value={fiscalYearStartMonth}
                    onChange={(e) => setFiscalYearStartMonth(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value={1}>يناير (1 يناير - 31 ديسمبر)</option>
                    <option value={4}>أبريل (1 أبريل - 31 مارس)</option>
                    <option value={7}>يوليو (1 يوليو - 30 يونيو)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">الأساس المحاسبي</label>
                  <select
                    value={accountingBasis}
                    onChange={(e) => setAccountingBasis(e.target.value as 'ACCRUAL' | 'CASH')}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="ACCRUAL">أساس الاستحقاق (Accrual Basis - معتمد ومعياري)</option>
                    <option value="CASH">الأساس النقدي (Cash Basis)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: VAT CONFIGURATION */}
          {currentStep === 5 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Percent className="w-5 h-5 text-emerald-700" />
                  <span>الخطوة 5: إعدادات ضريبة القيمة المضافة (VAT 15%)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  نسبة الضريبة السعودية القياسية وتفضيل عرض الأسعار في الفواتير.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">معدل الضريبة القياسي</label>
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-emerald-800">
                    <span>15.00%</span>
                    <span className="text-xs text-slate-500 font-sans">(المعدل القياسي المعتمد في المملكة)</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">طريقة عرض الأسعار الافتراضية</label>
                  <select
                    value={vatPreference}
                    onChange={(e) => setVatPreference(e.target.value as 'EXCLUSIVE' | 'INCLUSIVE')}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="EXCLUSIVE">الأسعار غير شاملة الضريبة (B2B Tax Exclusive)</option>
                    <option value="INCLUSIVE">الأسعار شاملة الضريبة (B2C Tax Inclusive)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: ZATCA E-INVOICING */}
          {currentStep === 6 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-emerald-700" />
                  <span>الخطوة 6: بيئة الربط مع هيئة الزكاة والضريبة والجمارك (ZATCA Phase 2)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  تحديد بيئة الربط الإلكتروني للفوترة والامتثال للتكامل المباشر.
                </p>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-semibold text-slate-700">بيئة الربط النشطة</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { id: 'simulation', title: 'بيئة المحاكاة (Simulation)', desc: 'لاختبار الفواتير والتحقق من UBL 2.1' },
                    { id: 'sandbox', title: 'بيئة التطوير (Developer Sandbox)', desc: 'للتأهيل التقني والحصول على شهادات CSID' },
                    { id: 'production', title: 'بيئة الإنتاج الحية (Production)', desc: 'الإرسال الفعلي المباشر لمنصة فاتورة' },
                  ].map((env) => (
                    <div
                      key={env.id}
                      onClick={() => setZatcaEnv(env.id as 'simulation' | 'sandbox' | 'production')}
                      className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                        zatcaEnv === env.id
                          ? 'border-emerald-600 bg-emerald-50/60 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <span className="block text-xs font-bold text-slate-900 mb-1">{env.title}</span>
                      <span className="block text-[11px] text-slate-500">{env.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 7: FIRST BRANCH, WAREHOUSE, CASHBOX, BANK */}
          {currentStep === 7 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <GitBranch className="w-5 h-5 text-emerald-700" />
                  <span>الخطوة 7: الكيانات الأساسية (الفرع، المستودع، الخزينة، الحساب البنكي)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  تم تهيئة هذه الكيانات تلقائياً ويمكنك تخصيص مسمياتها الآن.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="اسم الفرع الرئيسي"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                />
                <Input
                  label="اسم المستودع الافتراضي"
                  value={warehouseName}
                  onChange={(e) => setWarehouseName(e.target.value)}
                />
                <Input
                  label="اسم الخزينة النقدية الرئيسية"
                  value={cashboxName}
                  onChange={(e) => setCashboxName(e.target.value)}
                />
                <div>
                  <Input
                    label="البنك والآيبان السعودي (IBAN)"
                    value={bankIban}
                    onChange={(e) => setBankIban(e.target.value)}
                  />
                  <p className="text-[11px] text-slate-500 mt-1">الحساب التشغيلي المعتمد لسندات الصرف والقبض.</p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 8: CHART OF ACCOUNTS & MAPPINGS */}
          {currentStep === 8 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-emerald-700" />
                  <span>الخطوة 8: شجرة الحسابات السعودية المعتمدة وربط الحسابات</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  تم تثبيت شجرة الحسابات القياسية ذات المستويات الأربعة مع ربط حسابات الذمم والمخزون والإيرادات تلقائياً.
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="text-xs font-bold text-slate-800 pb-1 border-b border-slate-200">
                  الحسابات المرتبطة تلقائياً بمحركات الفواتير والمدفوعات:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="p-2 bg-white rounded border border-slate-200 flex justify-between">
                    <span className="text-slate-600">ذمم العملاء (AR):</span>
                    <span className="font-mono font-bold text-slate-900">10201 - المدينون التجاريون</span>
                  </div>
                  <div className="p-2 bg-white rounded border border-slate-200 flex justify-between">
                    <span className="text-slate-600">ذمم الموردين (AP):</span>
                    <span className="font-mono font-bold text-slate-900">20101 - الدائنون التجاريون</span>
                  </div>
                  <div className="p-2 bg-white rounded border border-slate-200 flex justify-between">
                    <span className="text-slate-600">إيرادات المبيعات:</span>
                    <span className="font-mono font-bold text-slate-900">40101 - إيراد مبيعات السلع</span>
                  </div>
                  <div className="p-2 bg-white rounded border border-slate-200 flex justify-between">
                    <span className="text-slate-600">تكلفة البضاعة المباعة (COGS):</span>
                    <span className="font-mono font-bold text-slate-900">50101 - تكلفة المبيعات</span>
                  </div>
                  <div className="p-2 bg-white rounded border border-slate-200 flex justify-between">
                    <span className="text-slate-600">مخرجات ضريبة القيمة المضافة:</span>
                    <span className="font-mono font-bold text-emerald-800">20301 - ضريبة المخرجات المستحقة</span>
                  </div>
                  <div className="p-2 bg-white rounded border border-slate-200 flex justify-between">
                    <span className="text-slate-600">مدخلات ضريبة القيمة المضافة:</span>
                    <span className="font-mono font-bold text-emerald-800">10301 - ضريبة المدخلات القابلة للاسترداد</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 9: DOCUMENT NUMBERING SEQUENCES */}
          {currentStep === 9 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Hash className="w-5 h-5 text-emerald-700" />
                  <span>الخطوة 9: قوالب الترقيم التسلسلي الآمن للمستندات</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  محرك ترقيم تسلسلي ذري يمنع الفجوات والتكرار والتضارب في بيئات التشغيل المتزامنة.
                </p>
              </div>

              <div className="space-y-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-900 block">فاتورة ضريبية قياسية (INV)</span>
                    <span className="text-slate-500 font-mono text-[11px]">INV-{new Date().getFullYear()}-XXXXX</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={handlePreviewNextSequence}>
                    تجربة توليد الرقم التالي
                  </Button>
                </div>

                {previewSeq && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                    <span className="text-xs text-emerald-800 block mb-1">الرقم المولد بنجاح وبقفل تسلسلي ذري:</span>
                    <span className="font-mono font-black text-lg text-emerald-900 tracking-wider">
                      {previewSeq}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 10: USER INVITATIONS & FINAL CONFIRMATION */}
          {currentStep === 10 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-emerald-700" />
                  <span>الخطوة 10: تأكيد الحساب الإداري وتفعيل بيئة العمل</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  تم اعتماد جميع الشروط والمتطلبات النظامية وأصبحت المنشأة جاهزة لبدء العمليات المالية.
                </p>
              </div>

              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-700 text-white flex items-center justify-center mx-auto shadow-sm">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <h4 className="font-extrabold text-slate-900 text-base">منشأتك جاهزة بالكامل 100%</h4>
                <p className="text-xs text-slate-600 max-w-md mx-auto">
                  تم إنشاء شجرة الحسابات، ربط الضرائب مع زاتكا، تفعيل الأمان والعزل المتعدد، وتهيئة سجلات التدقيق والقفل التسلسلي.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation Buttons */}
        <div className="pt-6 mt-6 border-t border-slate-100 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrev}
            disabled={currentStep === 1 || isSaving}
            startIcon={isRTL ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
          >
            {isAr ? 'السابق' : 'Previous'}
          </Button>

          <div className="text-xs font-mono font-bold text-slate-400">
            {currentStep} / 10
          </div>

          {currentStep < 10 ? (
            <Button
              variant="primary"
              size="sm"
              onClick={handleNext}
              isLoading={isSaving}
              endIcon={isRTL ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
            >
              {isAr ? 'حفظ ومتابعة' : 'Save & Next'}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleComplete}
              isLoading={isSaving}
              startIcon={<CheckCircle2 className="w-4 h-4" />}
            >
              {isAr ? 'اعتماد واكتمال الإعداد 100%' : 'Complete Setup 100%'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

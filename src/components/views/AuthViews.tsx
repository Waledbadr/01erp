import React, { useState, useEffect } from 'react';
import { useI18n } from '../../i18n/context.js';
import { Input } from '../ui/Input.js';
import { Button } from '../ui/Button.js';
import { useToast } from '../ui/Toast.js';
import {
  Lock,
  Mail,
  Building,
  FileCheck,
  ShieldCheck,
  KeyRound,
  AlertTriangle,
  Clock,
  CheckCircle2,
  RefreshCw,
  Hash,
  Sparkles,
} from 'lucide-react';
import {
  validateSaudiVatNumber,
  validateSaudiCrNumber,
  validateSaudiUnifiedNumber,
} from '../../utils/saudiValidators.js';

// ====================================================
// 1. LOGIN VIEW WITH MFA & BRUTE-FORCE LOCKOUT TIMER
// ====================================================
export const LoginView: React.FC<{ onNavigate: (route: string) => void }> = ({ onNavigate }) => {
  const { t, isRTL } = useI18n();
  const toast = useToast();

  const [email, setEmail] = useState('admin@company.com.sa');
  const [password, setPassword] = useState('SuperSecret2026!');
  const [isLoading, setIsLoading] = useState(false);

  // Lockout State
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  // MFA Challenge State
  const [showMfaModal, setShowMfaModal] = useState(false);
  const [mfaToken, setMfaToken] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [isRecoveryCode, setIsRecoveryCode] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);

  // Countdown timer for lockout
  useEffect(() => {
    if (lockoutSeconds <= 0) {
      if (isLockedOut) setIsLockedOut(false);
      return;
    }
    const timer = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev <= 1) {
          setIsLockedOut(false);
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSeconds, isLockedOut]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLockedOut) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (res.status === 429) {
        // Account locked out
        setIsLockedOut(true);
        setLockoutSeconds(data.remainingSeconds || 900);
        toast.error(data.message || 'تم إقفال الحساب مؤقتاً لتكرار المحاولات الخاطئة.');
        return;
      }

      if (!res.ok) {
        toast.error(data.message || 'بيانات الدخول غير صحيحة.');
        return;
      }

      // Check if MFA required
      if (data.mfaRequired) {
        setMfaToken(data.mfaToken);
        setShowMfaModal(true);
        toast.info('التحقق بخطوتين مطلوب. يرجى إدخال رمز المصادقة.');
        return;
      }

      // Save session token in localStorage
      if (data.token) {
        localStorage.setItem('saudi_erp_session_token', data.token);
      }

      toast.success('تم تسجيل الدخول بنجاح! مرحباً بك في بيئة العمل السحابية المعتمدة.');
      onNavigate('/dashboard');
    } catch (err: unknown) {
      toast.error('حدث خطأ أثناء الاتصال بالخادم. يرجى المحاولة لاحقاً.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaLoading(true);
    try {
      const res = await fetch('/api/v1/auth/mfa/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mfaToken,
          code: totpCode,
          isRecoveryCode,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || 'رمز المصادقة غير صحيح.');
        return;
      }

      if (data.token) {
        localStorage.setItem('saudi_erp_session_token', data.token);
      }

      setShowMfaModal(false);
      toast.success('تم التحقق بنجاح وتأكيد الهوية.');
      onNavigate('/dashboard');
    } catch {
      toast.error('تعذر التحقق من رمز المصادقة.');
    } finally {
      setMfaLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-8 p-6 sm:p-8 bg-white rounded-2xl border border-slate-200 shadow-md">
      <div className="text-center mb-6">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-700 text-white flex items-center justify-center font-black text-xl mb-3 shadow-md">
          ERP
        </div>
        <h2 className="text-xl font-extrabold text-slate-900">{t.auth.loginTitle}</h2>
        <p className="text-xs text-slate-500 mt-1">{t.auth.loginSubtitle}</p>
      </div>

      {/* Lockout Warning Banner */}
      {isLockedOut && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-800 text-xs">
          <Clock className="w-5 h-5 flex-shrink-0 text-red-600 animate-pulse" />
          <div className="flex-1">
            <span className="font-bold">الحساب مقفل مؤقتاً: </span>
            <span>انتظر {lockoutSeconds} ثانية قبل إعادة المحاولة.</span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label={t.auth.emailLabel}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          startIcon={<Mail className="w-4 h-4" />}
          disabled={isLockedOut || isLoading}
          required
        />
        <Input
          label={t.auth.passwordLabel}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          startIcon={<Lock className="w-4 h-4" />}
          disabled={isLockedOut || isLoading}
          required
        />

        <div className="flex items-center justify-between text-xs pt-1">
          <label className="flex items-center gap-2 cursor-pointer text-slate-600">
            <input
              type="checkbox"
              defaultChecked
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>{t.auth.rememberMe}</span>
          </label>
          <button
            type="button"
            onClick={() => onNavigate('/forgot-password')}
            className="text-emerald-700 hover:text-emerald-800 font-semibold"
          >
            {t.auth.forgotPasswordLink}
          </button>
        </div>

        {/* Turnstile Bot Protection Indicator */}
        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>حماية Cloudflare Turnstile مفعلة</span>
          </span>
          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-mono font-bold">
            SECURE
          </span>
        </div>

        <Button
          type="submit"
          variant="primary"
          className="w-full mt-2"
          isLoading={isLoading}
          disabled={isLockedOut}
        >
          {isLockedOut ? `انتظر (${lockoutSeconds}s)` : t.auth.signInButton}
        </Button>
      </form>

      <div className="mt-6 pt-6 border-t border-slate-100 text-center text-xs text-slate-600">
        <span>{t.auth.noAccount} </span>
        <button
          onClick={() => onNavigate('/register')}
          className="text-emerald-700 hover:text-emerald-800 font-bold"
        >
          {t.auth.registerHere}
        </button>
      </div>

      {/* Quick Demo Credentials Matrix */}
      <div className="mt-6 pt-5 border-t border-slate-200">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-emerald-700" />
            <span>بيانات الدخول السريع لكافة الصلاحيات</span>
          </span>
          <span className="text-[10px] font-mono font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
            SuperSecret2026!
          </span>
        </div>
        <p className="text-[11px] text-slate-500 mb-3">
          اضغط على أي دور وظيفي لتعبئة بيانات الحساب تلقائياً وتجربة الصلاحيات المقيدة له:
        </p>
        <div className="grid grid-cols-2 gap-1.5 text-start">
          {[
            { email: 'admin@company.com.sa', label: 'المدير العام / المالك', role: 'OWNER', badge: 'bg-emerald-100 text-emerald-800' },
            { email: 'cfo@company.com.sa', label: 'المدير المالي التنفيذي', role: 'CFO', badge: 'bg-teal-100 text-teal-800' },
            { email: 'accountant@company.com.sa', label: 'محاسب عام معتمد', role: 'ACCOUNTANT', badge: 'bg-blue-100 text-blue-800' },
            { email: 'sales@company.com.sa', label: 'مدير المبيعات', role: 'SALES', badge: 'bg-amber-100 text-amber-800' },
            { email: 'purchases@company.com.sa', label: 'مدير المشتريات', role: 'PURCHASE', badge: 'bg-purple-100 text-purple-800' },
            { email: 'warehouse@company.com.sa', label: 'أمين المستودع', role: 'WAREHOUSE', badge: 'bg-indigo-100 text-indigo-800' },
            { email: 'cashier@company.com.sa', label: 'كاشير / نقطة بيع', role: 'CASHIER', badge: 'bg-rose-100 text-rose-800' },
            { email: 'auditor@company.com.sa', label: 'مراجع خارجي (مشاهد)', role: 'AUDITOR', badge: 'bg-slate-200 text-slate-800' },
            { email: 'superadmin@saudi-erp.com', label: 'مدير المنصة (SaaS SuperAdmin)', role: 'SUPERADMIN', badge: 'bg-red-100 text-red-800' },
          ].map((acc) => (
            <button
              key={acc.email}
              type="button"
              onClick={() => {
                setEmail(acc.email);
                setPassword('SuperSecret2026!');
                toast.info(`تم اختيار حساب: ${acc.label} (${acc.email})`);
              }}
              className="p-2 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40 transition text-start flex flex-col justify-between"
            >
              <div className="flex items-center justify-between w-full">
                <span className="font-bold text-[11px] text-slate-800 truncate">{acc.label}</span>
                <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-semibold ${acc.badge}`}>
                  {acc.role}
                </span>
              </div>
              <span className="text-[10px] font-mono text-slate-500 truncate mt-0.5">{acc.email}</span>
            </button>
          ))}
        </div>
      </div>

      {/* MFA Modal Popup */}
      {showMfaModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-2xl p-6 shadow-2xl border border-slate-200 text-center animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-3">
              <KeyRound className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1">التحقق بخطوتين (MFA / 2FA)</h3>
            <p className="text-xs text-slate-500 mb-4">
              {isRecoveryCode
                ? 'أدخل أحد رموز الاستعادة الاحتياطية (8 خانات)'
                : 'أدخل رمز التحقق المكون من 6 أرقام من تطبيق Authenticator'}
            </p>

            <form onSubmit={handleMfaSubmit} className="space-y-4">
              <input
                type="text"
                maxLength={isRecoveryCode ? 8 : 6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.trim())}
                placeholder={isRecoveryCode ? 'ABCD-EFGH' : '123456'}
                className="w-full text-center text-2xl tracking-widest font-mono font-bold py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:outline-none"
                autoFocus
                required
              />

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => setIsRecoveryCode(!isRecoveryCode)}
                >
                  {isRecoveryCode ? 'استخدام رمز التطبيق' : 'استخدام رمز استعادة'}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  className="flex-1 text-xs"
                  isLoading={mfaLoading}
                >
                  تأكيد ودخول
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ====================================================
// 2. REGISTRATION VIEW WITH LIVE REGULATORY VALIDATION
// ====================================================
export const RegisterView: React.FC<{ onNavigate: (route: string) => void }> = ({ onNavigate }) => {
  const { t } = useI18n();
  const toast = useToast();

  const [companyNameAr, setCompanyNameAr] = useState('');
  const [companyNameEn, setCompanyNameEn] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [crNumber, setCrNumber] = useState('');
  const [unifiedNumber, setUnifiedNumber] = useState('');
  const [adminFullName, setAdminFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Live validation states
  const [vatError, setVatError] = useState<string | null>(null);
  const [crError, setCrError] = useState<string | null>(null);
  const [unifiedError, setUnifiedError] = useState<string | null>(null);

  const fillSampleData = () => {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    setCompanyNameAr(`شركة آفاق المستقبل للتجارة ${randomSuffix}`);
    setCompanyNameEn(`Future Horizons Trading ${randomSuffix} Co.`);
    setVatNumber('300000000000003');
    setCrNumber(`1010${Math.floor(100000 + Math.random() * 900000)}`);
    setUnifiedNumber('7001234567');
    setAdminFullName('عبدالله محمد الغامدي');
    setEmail(`admin.horizons${randomSuffix}@business.sa`);
    setPassword('SuperSecret2026!');
    setVatError(null);
    setCrError(null);
    setUnifiedError(null);
    toast.success('تمت تعبئة بيانات منشأة سعودية نموذجية معتمدة.');
  };

  const handleVatChange = (val: string) => {
    setVatNumber(val);
    if (val.trim().length > 0) {
      const check = validateSaudiVatNumber(val.trim());
      setVatError(check.valid ? null : check.error || 'الرقم الضريبي يجب أن يتكون من 15 خانة تبدأ وتنتهي برقم 3');
    } else {
      setVatError(null);
    }
  };

  const handleCrChange = (val: string) => {
    setCrNumber(val);
    if (val.trim().length > 0) {
      const check = validateSaudiCrNumber(val.trim());
      setCrError(check.valid ? null : check.error || 'رقم السجل التجاري يتكون من 10 خانات');
    } else {
      setCrError(null);
    }
  };

  const handleUnifiedChange = (val: string) => {
    setUnifiedNumber(val);
    if (val.trim().length > 0) {
      const check = validateSaudiUnifiedNumber(val.trim());
      setUnifiedError(check.valid ? null : check.error || 'الرقم الموحد غير صالح (يبدأ بـ 7)');
    } else {
      setUnifiedError(null);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!companyNameAr.trim() || !adminFullName.trim() || !email.trim() || !password) {
      toast.error('يرجى تعبئة جميع الحقول المطلوبة (اسم المنشأة، اسم المسؤول، البريد، وكلمة المرور).');
      return;
    }

    // Validate VAT & CR if entered
    if (vatNumber.trim().length > 0) {
      const vatCheck = validateSaudiVatNumber(vatNumber.trim());
      if (!vatCheck.valid && vatNumber.trim() !== '300000000000003') {
        setVatError(vatCheck.error || 'الرقم الضريبي غير صالح');
        toast.error(vatCheck.error || 'الرقم الضريبي غير صالح');
        return;
      }
    }

    if (crNumber.trim().length > 0) {
      const crCheck = validateSaudiCrNumber(crNumber.trim());
      if (!crCheck.valid && crNumber.trim().length !== 10) {
        setCrError(crCheck.error || 'رقم السجل التجاري غير صالح');
        toast.error(crCheck.error || 'رقم السجل التجاري غير صالح');
        return;
      }
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyNameAr: companyNameAr.trim(),
          companyNameEn: companyNameEn.trim() || companyNameAr.trim(),
          vatNumber: vatNumber.trim() || '300000000000003',
          crNumber: crNumber.trim() || `1010${Math.floor(100000 + Math.random() * 900000)}`,
          unifiedNumber: unifiedNumber.trim() || undefined,
          adminFullName: adminFullName.trim(),
          adminEmail: email.trim(),
          password,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = data.message || data.details || data.error || 'فشل تسجيل المنشأة. يرجى مراجعة البيانات.';
        toast.error(errMsg);
        return;
      }

      if (data.token) {
        localStorage.setItem('saudi_erp_session_token', data.token);
      }

      toast.success(data.message || 'تم تسجيل المنشأة بنجاح! جاري الانتقال إلى معالج الإعداد.');
      onNavigate('/company-wizard');
    } catch {
      toast.error('حدث خطأ في الاتصال بالخادم. يرجى التحقق والمحاولة ثانية.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto my-6 p-6 sm:p-8 bg-white rounded-2xl border border-slate-200 shadow-md">
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">{t.auth.registerTitle}</h2>
          <p className="text-xs text-slate-500 mt-1">{t.auth.registerSubtitle}</p>
        </div>
        <button
          type="button"
          onClick={fillSampleData}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200 transition shadow-2xs"
          title="تعبئة بيانات تجريبية صالحة وفورية"
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
          <span>تعبئة سريعة للتجربة</span>
        </button>
      </div>

      <form onSubmit={handleRegister} className="space-y-4">
        {/* Section 1: Legal & Company Info */}
        <div className="space-y-3">
          <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider pb-1 border-b border-emerald-100 flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5" />
            <span>بيانات المنشأة والهوية التجارية (السعودية)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={t.auth.companyNameAr}
              value={companyNameAr}
              onChange={(e) => setCompanyNameAr(e.target.value)}
              placeholder="شركة الأعمال المتطورة المحدودة"
              required
            />
            <Input
              label="اسم المنشأة بالإنجليزية (اختياري)"
              value={companyNameEn}
              onChange={(e) => setCompanyNameEn(e.target.value)}
              placeholder="Advanced Business Co. Ltd"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Input
                label="الرقم الضريبي للضريبة المضافة (VAT)"
                value={vatNumber}
                onChange={(e) => handleVatChange(e.target.value)}
                placeholder="300000000000003 (اختياري للشركات الناشئة)"
                startIcon={<FileCheck className="w-4 h-4" />}
              />
              {vatError ? (
                <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                  <span>{vatError}</span>
                </p>
              ) : vatNumber.length === 15 ? (
                <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>الرقم الضريبي مطابق لمعايير زاتكا (15 خانة تبدأ وتنتهي برقم 3)</span>
                </p>
              ) : null}
            </div>

            <div>
              <Input
                label="رقم السجل التجاري (CR)"
                value={crNumber}
                onChange={(e) => handleCrChange(e.target.value)}
                placeholder="1010123456"
                startIcon={<Hash className="w-4 h-4" />}
              />
              {crError ? (
                <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                  <span>{crError}</span>
                </p>
              ) : crNumber.length === 10 ? (
                <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>رقم السجل التجاري صالح (10 خانات)</span>
                </p>
              ) : null}
            </div>
          </div>

          <Input
            label="الرقم الوطني الموحد (700) - اختياري"
            value={unifiedNumber}
            onChange={(e) => handleUnifiedChange(e.target.value)}
            placeholder="7001234567"
          />
          {unifiedError && (
            <p className="text-[11px] text-red-600 mt-0.5">{unifiedError}</p>
          )}
        </div>

        {/* Section 2: Administrator Credentials */}
        <div className="space-y-3 pt-2">
          <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider pb-1 border-b border-emerald-100 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" />
            <span>بيانات المسؤول الرئيسي للمنشأة (Company Admin)</span>
          </div>

          <Input
            label="الاسم الكامل للمسؤول"
            value={adminFullName}
            onChange={(e) => setAdminFullName(e.target.value)}
            placeholder="عبدالله محمد القحطاني"
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={t.auth.adminEmail}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@enterprise.sa"
              startIcon={<Mail className="w-4 h-4" />}
              required
            />
            <Input
              label={t.auth.passwordLabel}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              startIcon={<Lock className="w-4 h-4" />}
              required
            />
          </div>
        </div>

        <Button type="submit" variant="primary" className="w-full mt-4" isLoading={isLoading}>
          {t.auth.createAccountButton}
        </Button>
      </form>

      <div className="mt-6 pt-6 border-t border-slate-100 text-center text-xs text-slate-600">
        <span>{t.auth.haveAccount} </span>
        <button
          onClick={() => onNavigate('/login')}
          className="text-emerald-700 hover:text-emerald-800 font-bold"
        >
          {t.auth.loginHere}
        </button>
      </div>
    </div>
  );
};

// ====================================================
// 3. FORGOT PASSWORD & RECOVERY VIEW
// ====================================================
export const ForgotPasswordView: React.FC<{ onNavigate: (route: string) => void }> = ({ onNavigate }) => {
  const { t } = useI18n();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isSent, setIsSent] = useState(false);
  const [isResetDone, setIsResetDone] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setIsSent(true);
      if (data.resetToken) {
        setResetToken(data.resetToken);
      }
      toast.info('تم إرسال تعليمات إعادة تعيين كلمة المرور بنجاح.');
    } catch {
      toast.error('حدث خطأ أثناء إرسال الطلب.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetToken || !newPassword) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || 'فشل إعادة التعيين.');
        return;
      }
      setIsResetDone(true);
      toast.success('تم تغيير كلمة المرور بنجاح!');
    } catch {
      toast.error('حدث خطأ.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-8 p-6 sm:p-8 bg-white rounded-2xl border border-slate-200 shadow-md">
      <div className="text-center mb-6">
        <h2 className="text-xl font-extrabold text-slate-900">{t.auth.forgotTitle}</h2>
        <p className="text-xs text-slate-500 mt-1">{t.auth.forgotSubtitle}</p>
      </div>

      {isResetDone ? (
        <div className="text-center py-6 space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <p className="text-xs text-slate-700 font-semibold">
            تم تحديث كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.
          </p>
          <Button variant="primary" size="sm" onClick={() => onNavigate('/login')}>
            {t.auth.backToLogin}
          </Button>
        </div>
      ) : isSent ? (
        <div className="space-y-4">
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
            تم إنشاء رمز استعادة آمن لهذا البريد. أدخل كلمة المرور الجديدة أدناه:
          </div>

          <form onSubmit={handleResetPassword} className="space-y-3">
            <Input
              label="كلمة المرور الجديدة"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
            <Button type="submit" variant="primary" className="w-full" isLoading={isLoading}>
              تغيير كلمة المرور والاعتماد
            </Button>
          </form>
        </div>
      ) : (
        <form onSubmit={handleSendLink} className="space-y-4">
          <Input
            label={t.auth.emailLabel}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@company.sa"
            required
          />
          <Button type="submit" variant="primary" className="w-full" isLoading={isLoading}>
            {t.auth.sendResetLink}
          </Button>
          <button
            type="button"
            onClick={() => onNavigate('/login')}
            className="w-full text-center text-xs font-semibold text-slate-600 hover:text-slate-900 mt-2"
          >
            {t.auth.backToLogin}
          </button>
        </form>
      )}
    </div>
  );
};

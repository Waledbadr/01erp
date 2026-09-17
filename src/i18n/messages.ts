export const messages = {
  ar: {
    appName: 'منصة الأعمال',
    phase: 'المرحلة التأسيسية',
    home: 'الرئيسية',
    login: 'تسجيل الدخول',
    register: 'إنشاء حساب',
    forgot: 'استعادة كلمة المرور',
    maintenance: 'الصيانة',
    notification: 'الإشعارات',
    company: 'الشركة',
    branch: 'الفرع',
    awaitingSetup: 'يُضبط في مرحلة الحسابات والصلاحيات',
    welcome: 'أساس متين لأعمالك',
    welcomeBody:
      'البنية الأساسية جاهزة للتوسع. ستُفعّل العمليات التجارية بعد إعداد الحسابات والصلاحيات.',
    foundation: 'حالة النظام',
    foundationBody:
      'تعمل الواجهة باللغتين العربية والإنجليزية مع تصميم يناسب الهاتف والحاسوب.',
    authInfo: 'تُفعّل خدمة الحسابات في المرحلة التالية.',
    loginBody:
      'هذه صفحة الدخول الأساسية. ستظهر حقول الدخول بعد تفعيل المصادقة.',
    registerBody:
      'هذه صفحة التسجيل الأساسية. ستظهر خطوات إنشاء الشركة بعد تفعيل المصادقة.',
    forgotBody:
      'هذه صفحة استعادة الحساب الأساسية. ستظهر إجراءات الاستعادة بعد تفعيل المصادقة.',
    maintenanceBody: 'لا توجد صيانة مجدولة حاليًا.',
    notFound: 'الصفحة غير موجودة',
    notFoundBody: 'تحقق من الرابط ثم عد إلى الصفحة الرئيسية.',
    error: 'تعذر عرض الصفحة',
    errorBody: 'أعد المحاولة. إذا استمرت المشكلة، تواصل مع مسؤول النظام.',
    retry: 'إعادة المحاولة',
    backHome: 'العودة للرئيسية',
    language: 'اللغة',
    arabic: 'العربية',
    english: 'English',
    collapse: 'طي القائمة',
    expand: 'إظهار القائمة',
    systemReady: 'الواجهة جاهزة',
    systemStatus: 'حالة الخدمة',
    databaseReady: 'قاعدة البيانات متصلة',
    databaseUnavailable: 'قاعدة البيانات غير متاحة',
    checking: 'جارٍ التحقق',
    statusDescription: 'تتحقق واجهة الجاهزية من قاعدة البيانات عند الطلب.',
  },
  en: {
    appName: 'Business Platform',
    phase: 'Foundation phase',
    home: 'Home',
    login: 'Sign in',
    register: 'Create account',
    forgot: 'Recover password',
    maintenance: 'Maintenance',
    notification: 'Notifications',
    company: 'Company',
    branch: 'Branch',
    awaitingSetup: 'Configured in the accounts and permissions phase',
    welcome: 'A dependable foundation for your business',
    welcomeBody:
      'The foundation is ready to grow. Business workflows become available after account and permission setup.',
    foundation: 'System status',
    foundationBody:
      'The interface supports Arabic and English and adapts to mobile and desktop screens.',
    authInfo: 'Accounts are enabled in the next phase.',
    loginBody:
      'This is the sign-in page foundation. Sign-in fields appear when authentication is enabled.',
    registerBody:
      'This is the registration page foundation. Company setup appears when authentication is enabled.',
    forgotBody:
      'This is the account recovery page foundation. Recovery steps appear when authentication is enabled.',
    maintenanceBody: 'No maintenance is scheduled.',
    notFound: 'Page not found',
    notFoundBody: 'Check the address and return to the home page.',
    error: 'The page could not be displayed',
    errorBody: 'Try again. If the issue continues, contact your administrator.',
    retry: 'Try again',
    backHome: 'Back to home',
    language: 'Language',
    arabic: 'العربية',
    english: 'English',
    collapse: 'Collapse menu',
    expand: 'Expand menu',
    systemReady: 'Interface ready',
    systemStatus: 'Service status',
    databaseReady: 'Database connected',
    databaseUnavailable: 'Database unavailable',
    checking: 'Checking',
    statusDescription:
      'The readiness endpoint checks the database when requested.',
  },
} as const;

export type Locale = keyof typeof messages;
export type MessageKey = keyof typeof messages.ar;

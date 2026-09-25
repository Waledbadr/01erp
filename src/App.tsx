import React, { useCallback, useEffect, useState } from 'react';
import { I18nProvider, useI18n } from './i18n/context.js';
import { ToastProvider } from './components/ui/Toast.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { AppLayout } from './components/layout/AppLayout.js';
import { HomeDashboardView } from './components/views/HomeDashboardView.js';
import { DesignSystemView } from './components/views/DesignSystemView.js';
import { DocsView } from './components/views/DocsView.js';
import { LoginView, RegisterView, ForgotPasswordView } from './components/views/AuthViews.js';
import { CompanyWizardView } from './components/views/CompanyWizardView.js';
import { UsersRbacView } from './components/views/UsersRbacView.js';
import { AccountingMasterView } from './components/views/AccountingMasterView.js';
import { InventoryMasterView } from './components/views/InventoryMasterView.js';
import { PartiesMasterView } from './components/views/PartiesMasterView.js';
import { SalesInvoicesView } from './components/views/SalesInvoicesView.js';
import { ZatcaPhase2View } from './components/views/ZatcaPhase2View.js';
import { PurchasingMasterView } from './components/views/PurchasingMasterView.js';
import { TreasuryMasterView } from './components/views/TreasuryMasterView.js';
import { VatTaxEngineView } from './components/views/VatTaxEngineView.js';
import { ReportsCenterView } from './components/views/ReportsCenterView.js';
import { DocumentsMasterView } from './components/views/DocumentsMasterView.js';
import { NotificationCenterView } from './components/views/NotificationCenterView.js';
import { RemindersCollectionsView } from './components/views/RemindersCollectionsView.js';
import { AutomationEngineView } from './components/views/AutomationEngineView.js';
import { PointOfSaleView } from './components/views/PointOfSaleView.js';
import { OcrInvoiceCaptureView } from './components/views/OcrInvoiceCaptureView.js';
import { AssistantMasterView } from './components/views/AssistantMasterView.js';
import { ImportExportCenterView } from './components/views/ImportExportCenterView.js';
import { BillingSubscriptionView } from './components/views/BillingSubscriptionView.js';
import { SuperAdminPlatformView } from './components/views/SuperAdminPlatformView.js';
import { PublicDocumentViewer } from './components/documents/PublicDocumentViewer.js';
import { NotFoundView, MaintenanceView, ModuleShellView } from './components/views/SystemViews.js';
import { DomainAuditTools } from './components/DomainAuditTools.js';
import { SecurityAuditBackupView } from './components/views/SecurityAuditBackupView.js';
import { PhaseRoadmapView } from './components/views/PhaseRoadmapView.js';
import { DocViewerModal } from './components/DocViewerModal.js';
import { SYSTEM_DOCS, SystemDoc } from './lib/docsData.js';
import { Building2, Languages } from 'lucide-react';

const SESSION_KEY = 'saudi_erp_session_token';
const AUTH_ROUTES = new Set(['/login', '/signin', '/register', '/signup', '/forgot-password']);
// Developer-only screens are reachable only in development builds.
const IS_DEV_BUILD = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
const DEV_ROUTES = new Set(['/design-system', '/docs', '/documentation', '/audit-tools', '/roadmap', '/phases', '/maintenance']);

function normalizeRoute(route: string): string {
  const clean = (route || '/').split('?')[0].split('#')[0].toLowerCase().replace(/\/+$/, '');
  return clean || '/';
}

function initialRoute(): string {
  if (typeof window === 'undefined') return '/login';
  const path = normalizeRoute(window.location.pathname);
  const hasSession = !!localStorage.getItem(SESSION_KEY);
  if (!hasSession) return AUTH_ROUTES.has(path) ? path : '/login';
  return AUTH_ROUTES.has(path) ? '/' : path;
}

function AppContent() {
  const { language, toggleLanguage, isAr } = useI18n();

  // The current page lives in the URL, so refresh, bookmarks and the back button work.
  const [currentRoute, setRouteState] = useState<string>(initialRoute);
  const [selectedDoc, setSelectedDoc] = useState<SystemDoc | null>(null);

  const setCurrentRoute = useCallback((route: string) => {
    const next = normalizeRoute(route);
    if (next === '/login' || next === '/signin') {
      // Going to the login page means the session is over (logout, expired session).
      if (!AUTH_ROUTES.has(normalizeRoute(window.location.pathname))) localStorage.removeItem(SESSION_KEY);
    }
    if (normalizeRoute(window.location.pathname) !== next) {
      window.history.pushState({}, '', next === '/dashboard' ? '/' : next);
    }
    setRouteState(next === '/dashboard' ? '/' : next);
    window.scrollTo?.(0, 0);
  }, []);

  useEffect(() => {
    const onPop = () => setRouteState(initialRoute());
    window.addEventListener('popstate', onPop);
    // Keep the address bar in sync with the first screen shown.
    const first = initialRoute();
    if (normalizeRoute(window.location.pathname) !== first) window.history.replaceState({}, '', first);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Validate a stored session once; an expired or revoked token goes back to login.
  useEffect(() => {
    const token = localStorage.getItem(SESSION_KEY);
    if (!token) return;
    fetch('/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (res.status === 401) {
          localStorage.removeItem(SESSION_KEY);
          setCurrentRoute('/login');
        }
      })
      .catch(() => undefined);
  }, [setCurrentRoute]);

  // Check for public secure link route
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  if (pathname.startsWith('/view-doc/')) {
    const token = pathname.replace('/view-doc/', '').split('/')[0];
    return <PublicDocumentViewer token={token} />;
  }

  const handleOpenDocById = (docId: string) => {
    const found = SYSTEM_DOCS.find((d) => d.id === docId || d.filename.toLowerCase().includes(docId.toLowerCase()));
    if (found) {
      setSelectedDoc(found);
    } else {
      setCurrentRoute('/docs');
    }
  };

  const cleanRoute = normalizeRoute(currentRoute);
  const isAuthRoute = AUTH_ROUTES.has(cleanRoute);

  if (isAuthRoute) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between" dir={isAr ? 'rtl' : 'ltr'}>
        {/* Auth Navigation Header */}
        <header className="w-full bg-white border-b border-slate-200 py-3 px-4 sm:px-8">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-700 to-teal-800 text-white flex items-center justify-center shadow-md shadow-emerald-900/10">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-black text-slate-900 tracking-tight">
                    {isAr ? 'سحاب ERP' : 'Sahab ERP'}
                  </h1>
                </div>
                <p className="text-[11px] text-slate-500">
                  {isAr ? 'المحاسبة والمخزون والفوترة الإلكترونية' : 'Accounting, inventory and e-invoicing'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleLanguage}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 shadow-2xs transition"
              >
                <Languages className="w-4 h-4 text-emerald-700" />
                <span>{isAr ? 'English' : 'العربية'}</span>
              </button>
            </div>
          </div>
        </header>

        {/* Auth Body */}
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 flex items-center justify-center">
          <div className="w-full">
            {(cleanRoute === '/login' || cleanRoute === '/signin') && <LoginView onNavigate={setCurrentRoute} />}
            {(cleanRoute === '/register' || cleanRoute === '/signup') && <RegisterView onNavigate={setCurrentRoute} />}
            {cleanRoute === '/forgot-password' && <ForgotPasswordView onNavigate={setCurrentRoute} />}
          </div>
        </main>

        {/* Auth Footer */}
        <footer className="w-full bg-white border-t border-slate-200 py-4 px-4 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} {isAr ? 'سحاب ERP' : 'Sahab ERP'}
        </footer>
      </div>
    );
  }

  const renderCurrentView = () => {
    if (DEV_ROUTES.has(cleanRoute) && !IS_DEV_BUILD) {
      return <NotFoundView onNavigate={setCurrentRoute} />;
    }
    switch (cleanRoute) {
      case '/':
      case '/dashboard':
      case '/home':
      case '/overview':
        return <HomeDashboardView onNavigate={setCurrentRoute} />;
      case '/design-system':
        return <DesignSystemView />;
      case '/company-wizard':
      case '/wizard':
      case '/setup':
      case '/onboarding':
        return <CompanyWizardView onNavigate={setCurrentRoute} />;
      case '/users':
      case '/rbac':
      case '/roles':
      case '/permissions':
        return <UsersRbacView onNavigate={setCurrentRoute} />;
      case '/docs':
      case '/documentation':
        return <DocsView onSelectDoc={(doc) => setSelectedDoc(doc)} />;
      case '/audit':
      case '/audit-logs':
        return <SecurityAuditBackupView onNavigate={setCurrentRoute} initialTab="audit" />;
      case '/audit-tools':
        return <DomainAuditTools lang={language} />;
      case '/security':
      case '/sessions':
        return <SecurityAuditBackupView onNavigate={setCurrentRoute} initialTab="sessions" />;
      case '/backups':
      case '/backup':
        return <SecurityAuditBackupView onNavigate={setCurrentRoute} initialTab="backups" />;
      case '/roadmap':
      case '/phases':
        return <PhaseRoadmapView onNavigate={setCurrentRoute} />;
      case '/login':
      case '/signin':
        return <LoginView onNavigate={setCurrentRoute} />;
      case '/register':
      case '/signup':
        return <RegisterView onNavigate={setCurrentRoute} />;
      case '/forgot-password':
        return <ForgotPasswordView onNavigate={setCurrentRoute} />;
      case '/maintenance':
        return <MaintenanceView onNavigate={setCurrentRoute} />;
      case '/accounting':
      case '/general-ledger':
      case '/gl':
      case '/journals':
      case '/chart-of-accounts':
      case '/coa':
        return <AccountingMasterView onNavigate={setCurrentRoute} />;
      case '/inventory':
      case '/stock':
      case '/items':
      case '/products':
      case '/warehouses':
        return <InventoryMasterView onNavigate={setCurrentRoute} />;
      case '/parties':
      case '/customers':
      case '/suppliers':
      case '/vendors':
      case '/clients':
        return <PartiesMasterView onNavigate={setCurrentRoute} />;
      case '/sales':
      case '/invoices':
      case '/sales-invoices':
      case '/quotations':
        return <SalesInvoicesView onNavigate={setCurrentRoute} />;
      case '/pos':
      case '/point-of-sale':
      case '/cashier':
        return <PointOfSaleView />;
      case '/ocr':
      case '/ocr-capture':
      case '/supplier-invoice-ocr':
        return <OcrInvoiceCaptureView onNavigate={setCurrentRoute} />;
      case '/zatca':
      case '/e-invoice':
      case '/zatca-phase2':
        return <ZatcaPhase2View onNavigate={setCurrentRoute} />;
      case '/purchasing':
      case '/bills':
      case '/purchase-orders':
      case '/po':
        return <PurchasingMasterView onNavigate={setCurrentRoute} />;
      case '/treasury':
      case '/receipts':
      case '/payments':
      case '/transfers':
      case '/reconciliation':
      case '/cheques':
      case '/banks':
      case '/cash':
        return <TreasuryMasterView onNavigate={setCurrentRoute} />;
      case '/vat':
      case '/vat-tax':
      case '/vat-ledger':
      case '/tax-settings':
      case '/tax-return':
        return <VatTaxEngineView />;
      case '/reports':
      case '/reports-center':
      case '/analytics':
        return <ReportsCenterView />;
      case '/documents':
      case '/templates':
      case '/document-templates':
        return <DocumentsMasterView initialTab="templates" />;
      case '/sharing':
      case '/document-sharing':
        return <DocumentsMasterView initialTab="sharing" />;
      case '/document-catalog':
        return <DocumentsMasterView initialTab="catalog" />;
      case '/notifications':
      case '/notification-center':
      case '/alerts':
        return <NotificationCenterView onNavigate={setCurrentRoute} />;
      case '/reminders':
      case '/collections':
        return <RemindersCollectionsView onNavigate={setCurrentRoute} />;
      case '/automation':
      case '/automation-engine':
      case '/rules':
      case '/workflows':
        return <AutomationEngineView onNavigate={setCurrentRoute} />;
      case '/assistant':
      case '/ai-assistant':
      case '/copilot':
      case '/ai':
        return <AssistantMasterView currentLocale={language} />;
      case '/import-export':
      case '/import':
      case '/export':
      case '/batch-import':
        return <ImportExportCenterView />;
      case '/billing':
      case '/subscription':
      case '/plans':
        return <BillingSubscriptionView onNavigate={setCurrentRoute} />;
      case '/superadmin':
      case '/platform-admin':
      case '/saas-admin':
        return <SuperAdminPlatformView onNavigate={setCurrentRoute} />;
      default:
        return <NotFoundView onNavigate={setCurrentRoute} />;
    }
  };

  return (
    <AppLayout activeRoute={currentRoute} onRouteChange={setCurrentRoute}>
      {renderCurrentView()}

      {/* Full Document Viewer Modal */}
      {selectedDoc && (
        <DocViewerModal
          doc={selectedDoc}
          onClose={() => setSelectedDoc(null)}
          lang={language}
        />
      )}
    </AppLayout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <I18nProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}

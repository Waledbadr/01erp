import React, { useState } from 'react';
import { I18nProvider, useI18n } from './i18n/context.js';
import { ToastProvider } from './components/ui/Toast.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { AppLayout } from './components/layout/AppLayout.js';
import { DashboardView } from './components/views/DashboardView.js';
import { DesignSystemView } from './components/views/DesignSystemView.js';
import { DocsView } from './components/views/DocsView.js';
import { LoginView, RegisterView, ForgotPasswordView } from './components/views/AuthViews.js';
import { CompanyWizardView } from './components/views/CompanyWizardView.js';
import { UsersRbacView } from './components/views/UsersRbacView.js';
import { InventoryMasterView } from './components/views/InventoryMasterView.js';
import { PartiesMasterView } from './components/views/PartiesMasterView.js';
import { SalesInvoicesView } from './components/views/SalesInvoicesView.js';
import { NotFoundView, MaintenanceView, ModuleShellView } from './components/views/SystemViews.js';
import { DomainAuditTools } from './components/DomainAuditTools.js';
import { PhaseRoadmapModal } from './components/PhaseRoadmapModal.js';
import { DocViewerModal } from './components/DocViewerModal.js';
import { SYSTEM_DOCS, SystemDoc } from './lib/docsData.js';

function AppContent() {
  const { language } = useI18n();
  const isAr = language === 'ar';

  const [currentRoute, setCurrentRoute] = useState<string>('/');
  const [selectedDoc, setSelectedDoc] = useState<SystemDoc | null>(null);
  const [isRoadmapOpen, setIsRoadmapOpen] = useState<boolean>(false);

  const handleOpenDocById = (docId: string) => {
    const found = SYSTEM_DOCS.find((d) => d.id === docId || d.filename.toLowerCase().includes(docId.toLowerCase()));
    if (found) {
      setSelectedDoc(found);
    } else {
      setCurrentRoute('/docs');
    }
  };

  const renderCurrentView = () => {
    switch (currentRoute) {
      case '/':
        return (
          <DashboardView
            onNavigate={setCurrentRoute}
            onOpenDoc={handleOpenDocById}
            onOpenRoadmap={() => setIsRoadmapOpen(true)}
          />
        );
      case '/design-system':
        return <DesignSystemView />;
      case '/company-wizard':
        return <CompanyWizardView onNavigate={setCurrentRoute} />;
      case '/users':
        return <UsersRbacView onNavigate={setCurrentRoute} />;
      case '/docs':
        return <DocsView onSelectDoc={(doc) => setSelectedDoc(doc)} />;
      case '/audit':
        return <DomainAuditTools lang={language} />;
      case '/roadmap':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">
                {isAr ? 'خارطة المراحل التنفيذية (13 مرحلة)' : 'Implementation Phase Roadmap (13 Phases)'}
              </h2>
            </div>
            <PhaseRoadmapModal
              isOpen={true}
              onClose={() => setCurrentRoute('/')}
              lang={language}
            />
          </div>
        );
      case '/login':
        return <LoginView onNavigate={setCurrentRoute} />;
      case '/register':
        return <RegisterView onNavigate={setCurrentRoute} />;
      case '/forgot-password':
        return <ForgotPasswordView onNavigate={setCurrentRoute} />;
      case '/maintenance':
        return <MaintenanceView onNavigate={setCurrentRoute} />;
      case '/accounting':
        return (
          <ModuleShellView
            title={isAr ? 'المحاسبة ودفتر الأستاذ العام' : 'General Ledger & Accounting'}
            phaseCode="PHASE-02"
            description={
              isAr
                ? 'شجرة الحسابات الموحدة، قيود اليومية الثنائية، والتحقق الصارم من توازن المدين والدائن (G1-G8).'
                : 'Unified Chart of Accounts, double-entry journals, and strict debits=credits balance invariants.'
            }
            onNavigate={setCurrentRoute}
          />
        );
      case '/inventory':
        return <InventoryMasterView onNavigate={setCurrentRoute} />;
      case '/parties':
      case '/customers':
      case '/suppliers':
        return <PartiesMasterView onNavigate={setCurrentRoute} />;
      case '/sales':
      case '/invoices':
      case '/zatca':
        return <SalesInvoicesView onNavigate={setCurrentRoute} />;
      case '/purchasing':
        return (
          <ModuleShellView
            title={isAr ? 'المشتريات وفواتير الموردين' : 'Purchasing & Vendor Bills'}
            phaseCode="PHASE-06"
            description={
              isAr
                ? 'أوامر الشراء، استلام البضائع (GRN)، توزيع تكاليف الشحن والجمارك (Landed Cost)، ومطابقة الفواتير.'
                : 'Purchase orders, GRN receipts, landed cost allocation (freight & customs), and 3-way matching.'
            }
            onNavigate={setCurrentRoute}
          />
        );
      case '/treasury':
        return (
          <ModuleShellView
            title={isAr ? 'الخزينة والمدفوعات والمطابقة' : 'Treasury, Payments & Reconciliations'}
            phaseCode="PHASE-08"
            description={
              isAr
                ? 'إدارة حسابات الصندوق والبنوك، سندات القبض والصرف، وتخصيص الدفعات على الفواتير، والمطابقة البنكية.'
                : 'Cash vaults, bank accounts, receipts, payment allocations against invoices, and bank reconciliation.'
            }
            onNavigate={setCurrentRoute}
          />
        );
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

      {/* Phase Roadmap Modal */}
      <PhaseRoadmapModal
        isOpen={isRoadmapOpen}
        onClose={() => setIsRoadmapOpen(false)}
        lang={language}
      />
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

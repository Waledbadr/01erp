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
import { PhaseRoadmapModal } from './components/PhaseRoadmapModal.js';
import { DocViewerModal } from './components/DocViewerModal.js';
import { SYSTEM_DOCS, SystemDoc } from './lib/docsData.js';

function AppContent() {
  const { language } = useI18n();
  const isAr = language === 'ar';

  const [currentRoute, setCurrentRoute] = useState<string>('/');
  const [selectedDoc, setSelectedDoc] = useState<SystemDoc | null>(null);
  const [isRoadmapOpen, setIsRoadmapOpen] = useState<boolean>(false);

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
        return <SecurityAuditBackupView onNavigate={setCurrentRoute} initialTab="audit" />;
      case '/audit-tools':
        return <DomainAuditTools lang={language} />;
      case '/security':
        return <SecurityAuditBackupView onNavigate={setCurrentRoute} initialTab="sessions" />;
      case '/backups':
      case '/backup':
        return <SecurityAuditBackupView onNavigate={setCurrentRoute} initialTab="backups" />;
      case '/roadmap':
        return <PhaseRoadmapView onNavigate={setCurrentRoute} />;
      case '/login':
        return <LoginView onNavigate={setCurrentRoute} />;
      case '/register':
        return <RegisterView onNavigate={setCurrentRoute} />;
      case '/forgot-password':
        return <ForgotPasswordView onNavigate={setCurrentRoute} />;
      case '/maintenance':
        return <MaintenanceView onNavigate={setCurrentRoute} />;
      case '/accounting':
        return <AccountingMasterView onNavigate={setCurrentRoute} />;
      case '/inventory':
        return <InventoryMasterView onNavigate={setCurrentRoute} />;
      case '/parties':
      case '/customers':
      case '/suppliers':
        return <PartiesMasterView onNavigate={setCurrentRoute} />;
      case '/sales':
      case '/invoices':
        return <SalesInvoicesView onNavigate={setCurrentRoute} />;
      case '/pos':
      case '/point-of-sale':
        return <PointOfSaleView />;
      case '/ocr':
      case '/ocr-capture':
      case '/supplier-invoice-ocr':
        return <OcrInvoiceCaptureView onNavigate={setCurrentRoute} />;
      case '/zatca':
        return <ZatcaPhase2View onNavigate={setCurrentRoute} />;
      case '/purchasing':
      case '/bills':
      case '/purchase-orders':
        return <PurchasingMasterView onNavigate={setCurrentRoute} />;
      case '/treasury':
      case '/receipts':
      case '/payments':
      case '/transfers':
      case '/reconciliation':
      case '/cheques':
        return <TreasuryMasterView onNavigate={setCurrentRoute} />;
      case '/vat':
      case '/vat-tax':
      case '/vat-ledger':
      case '/tax-settings':
      case '/tax-return':
        return <VatTaxEngineView />;
      case '/reports':
      case '/reports-center':
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
        return <NotificationCenterView onNavigate={setCurrentRoute} />;
      case '/reminders':
      case '/collections':
        return <RemindersCollectionsView onNavigate={setCurrentRoute} />;
      case '/automation':
      case '/automation-engine':
      case '/rules':
        return <AutomationEngineView onNavigate={setCurrentRoute} />;
      case '/assistant':
      case '/ai-assistant':
      case '/copilot':
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

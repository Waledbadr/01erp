import React, { useState } from 'react';
import { DocumentTemplateEditor } from '../documents/DocumentTemplateEditor.js';
import { DocumentSharingCenter } from '../documents/DocumentSharingCenter.js';
import { DocumentActionModal } from '../documents/DocumentActionModal.js';
import {
  DocumentType,
  DocumentDataPayload,
  DOCUMENT_TYPE_LABELS,
  SAMPLE_DOCUMENTS,
  downloadDocumentPdf,
} from '../../lib/documents.js';
import { Button } from '../ui/Button.js';
import { Badge } from '../ui/Badge.js';
import {
  FileText,
  Palette,
  Send,
  Printer,
  Download,
  Share2,
  ExternalLink,
  Layers,
  Sparkles,
} from 'lucide-react';

interface DocumentsMasterViewProps {
  initialTab?: 'templates' | 'sharing' | 'catalog';
}

export const DocumentsMasterView: React.FC<DocumentsMasterViewProps> = ({
  initialTab = 'templates',
}) => {
  const [activeTab, setActiveTab] = useState<'templates' | 'sharing' | 'catalog'>(initialTab);
  const [selectedDocForAction, setSelectedDocForAction] = useState<DocumentDataPayload | null>(null);
  const [actionModalOpen, setActionModalOpen] = useState(false);

  const handleOpenActionModal = (doc: DocumentDataPayload) => {
    setSelectedDocForAction(doc);
    setActionModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Tab Navigation */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-linear-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center font-black shadow-md">
            <Printer className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-slate-900">
                محرك المستندات والطباعة والمشاركة (Phase 13 Engine)
              </h1>
              <Badge variant="success" size="sm">ZATCA Compliant</Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              توليد ملفات PDF حقيقية، قوالب قياسية A4 وحراري 80 ملم، مشاركة آمنة، خادم SMTP، وربط واتساب
            </p>
          </div>
        </div>

        {/* Master Navigation Pills */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveTab('templates')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'templates'
                ? 'bg-white text-emerald-800 shadow-sm border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Palette className="w-4 h-4 text-emerald-600" />
            محرر القوالب المرئي
          </button>

          <button
            onClick={() => setActiveTab('catalog')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'catalog'
                ? 'bg-white text-emerald-800 shadow-sm border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4 text-blue-600" />
            كتالوج المستندات (12 نوعاً)
          </button>

          <button
            onClick={() => setActiveTab('sharing')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'sharing'
                ? 'bg-white text-emerald-800 shadow-sm border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Send className="w-4 h-4 text-teal-600" />
            مركز المشاركة و SMTP
          </button>
        </div>
      </div>

      {/* Tab 1: Visual Template Editor */}
      {activeTab === 'templates' && <DocumentTemplateEditor />}

      {/* Tab 2: Document Types Catalog (All 12 Document Types with one-click print & PDF) */}
      {activeTab === 'catalog' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <h3 className="font-black text-sm text-slate-900">
                كتالوج المستندات الرسمية الـ 12 المعتمدة في النظام
              </h3>
              <p className="text-xs text-slate-500">
                انقر على أي مستند لمعاينته، طباعته فورياً، تحميل ملف PDF متجهي، أو إرساله للعميل
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(SAMPLE_DOCUMENTS).map(([docTypeKey, docData]) => {
              const meta = DOCUMENT_TYPE_LABELS[docTypeKey as DocumentType] || { ar: docTypeKey, en: docTypeKey };
              return (
                <div
                  key={docTypeKey}
                  className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs hover:border-emerald-400 hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                        <FileText className="w-5 h-5" />
                      </div>
                      <Badge variant="default" size="sm">
                        {docTypeKey}
                      </Badge>
                    </div>

                    <div>
                      <h4 className="font-black text-sm text-slate-900">{meta.ar}</h4>
                      <p className="text-xs text-slate-500">{meta.en}</p>
                    </div>

                    <div className="pt-2 text-xs space-y-1 text-slate-600 border-t border-slate-100">
                      <p className="flex justify-between">
                        <span>رقم المستند:</span>
                        <span className="font-mono font-bold text-slate-800">{docData.documentNumber}</span>
                      </p>
                      <p className="flex justify-between">
                        <span>التاريخ:</span>
                        <span>{docData.issueDate}</span>
                      </p>
                      <p className="flex justify-between">
                        <span>الإجمالي:</span>
                        <span className="font-mono font-bold text-emerald-800">{docData.totals.totalAmountSar.toFixed(2)} ر.س</span>
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-slate-100 flex items-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleOpenActionModal(docData)}
                    >
                      <Printer className="w-3.5 h-3.5 me-1" />
                      معاينة وطباعة
                    </Button>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => downloadDocumentPdf(docData)}
                      title="تحميل PDF مباشر"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-700" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 3: Cloud Sharing Center */}
      {activeTab === 'sharing' && <DocumentSharingCenter />}

      {/* Shared Action Modal */}
      {selectedDocForAction && (
        <DocumentActionModal
          isOpen={actionModalOpen}
          onClose={() => setActionModalOpen(false)}
          document={selectedDocForAction}
        />
      )}
    </div>
  );
};

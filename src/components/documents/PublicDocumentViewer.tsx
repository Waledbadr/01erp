import React, { useEffect, useState } from 'react';
import {
  DocumentDataPayload,
  SecureLink,
  resolvePublicSecureLink,
  downloadDocumentPdf,
} from '../../lib/documents.js';
import { DocumentPreviewFrame } from './DocumentPreviewFrame.js';
import { buildSystemDefaultTemplate } from '../../../server/modules/documents/documentTemplateService.js';
import { Button } from '../ui/Button.js';
import { Badge } from '../ui/Badge.js';
import { Printer, Download, AlertCircle, ShieldCheck } from 'lucide-react';

interface PublicDocumentViewerProps {
  token: string;
}

export const PublicDocumentViewer: React.FC<PublicDocumentViewerProps> = ({ token }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkData, setLinkData] = useState<SecureLink | null>(null);
  const [docData, setDocData] = useState<DocumentDataPayload | null>(null);

  useEffect(() => {
    resolveLink();
  }, [token]);

  const resolveLink = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await resolvePublicSecureLink(token);
      setLinkData(res.link);
      setDocData(res.document);
    } catch (err: any) {
      setError(err.message || 'الرابط غير صالح أو منتهي الصلاحية');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="text-center p-8 bg-white rounded-xl shadow-lg border border-slate-200">
          <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="font-bold text-slate-800 text-sm">جاري التحقق من صلاحية الرابط المشفر وتحميل المستند...</p>
        </div>
      </div>
    );
  }

  if (error || !docData) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="text-center p-8 bg-white rounded-xl shadow-lg border border-slate-200 max-w-md">
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-black text-slate-900 mb-2">تعذر فتح المستند</h3>
          <p className="text-sm text-slate-600 leading-relaxed mb-6">{error}</p>
          <div className="text-xs text-slate-400">
            إذا كنت تعتقد أن هذا خطأ، يرجى التواصل مع الجهة المُصدرة للفاتورة لإصدار رابط جديد صالح.
          </div>
        </div>
      </div>
    );
  }

  const defaultTmpl = buildSystemDefaultTemplate(docData.company.vatNumber, docData.documentType);

  return (
    <div className="min-h-screen bg-slate-100 pb-12">
      {/* Top Banner */}
      <header className="bg-white border-b border-slate-200 shadow-2xs sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-black text-slate-900">
                  {docData.company.nameAr}
                </h1>
                <Badge variant="success" size="sm">مستند رسمي معتمد</Badge>
              </div>
              <p className="text-xs text-slate-500">
                رقم المستند: #{docData.documentNumber} | التاريخ: {docData.issueDate}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 me-1.5" />
              طباعة
            </Button>
            <Button variant="primary" size="sm" onClick={() => downloadDocumentPdf(docData)}>
              <Download className="w-4 h-4 me-1.5" />
              تحميل PDF
            </Button>
          </div>
        </div>
      </header>

      {/* Main Document Frame */}
      <main className="max-w-5xl mx-auto px-4 pt-8">
        <div className="flex justify-center">
          <DocumentPreviewFrame
            document={docData}
            template={defaultTmpl}
            scale={0.95}
          />
        </div>
      </main>
    </div>
  );
};

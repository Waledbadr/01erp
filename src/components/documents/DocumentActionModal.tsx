import React, { useState, useEffect } from 'react';
import {
  DocumentType,
  DocumentDataPayload,
  PaperSize,
  DocumentTemplate,
  SecureLink,
  SharingQueueItem,
  EmailIdentity,
  downloadDocumentPdf,
  createSecureLink,
  fetchSecureLinks,
  revokeSecureLink,
  enqueueShareMessage,
  fetchDocumentSendingHistory,
  retryQueueItem,
  fetchPrintPreferences,
  savePrintPreferences,
  fetchTemplates,
  generateWhatsAppShare,
  fetchEmailSettings,
} from '../../lib/documents.js';
import { DocumentPreviewFrame } from './DocumentPreviewFrame.js';
import { Button } from '../ui/Button.js';
import { Badge } from '../ui/Badge.js';
import { useToast } from '../ui/Toast.js';
import {
  Printer,
  Download,
  Share2,
  Mail,
  MessageSquare,
  Link,
  Copy,
  History,
  Settings,
  X,
  RefreshCw,
  ExternalLink,
  Check,
  AlertTriangle,
} from 'lucide-react';

interface DocumentActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentDataPayload;
  onRefresh?: () => void;
}

export const DocumentActionModal: React.FC<DocumentActionModalProps> = ({
  isOpen,
  onClose,
  document: doc,
  onRefresh,
}) => {
  const { success: showSuccess, error: showError, info: showInfo } = useToast();

  const [activeTab, setActiveTab] = useState<'preview' | 'email' | 'whatsapp' | 'links' | 'history'>('preview');
  const [paperSize, setPaperSize] = useState<PaperSize>('A4');
  const [template, setTemplate] = useState<DocumentTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfGenerating, setPdfGenerating] = useState(false);

  // Email form
  const [emailSender, setEmailSender] = useState<string>('billing@alnamaa.sa');
  const [emailIdentities, setEmailIdentities] = useState<EmailIdentity[]>([]);
  const [emailRecipient, setEmailRecipient] = useState<string>(doc.party?.email || '');
  const [emailCc, setEmailCc] = useState<string>('');
  const [emailSubject, setEmailSubject] = useState<string>(
    `فاتورة ضريبية #${doc.documentNumber} - ${doc.company.nameAr}`
  );
  const [emailBody, setEmailBody] = useState<string>(
    `السادة / ${doc.party?.nameAr || 'العميل المحترم'}\n\nتحية طيبة وبعد،\n\nنرفق لكم نسخة من ${doc.documentNumber} بمبلغ إجمالي ${doc.totals.totalAmountSar.toFixed(2)} ﷼ شامل ضريبة القيمة المضافة 15%.\n\nشاكرين ومقدرين حسن تعاونكم،\n${doc.company.nameAr}`
  );
  const [attachPdf, setAttachPdf] = useState(true);
  const [attachXml, setAttachXml] = useState(!!doc.zatca?.cryptographicStamp);

  // Secure Links state
  const [secureLinks, setSecureLinks] = useState<SecureLink[]>([]);
  const [linkExpiryHours, setLinkExpiryHours] = useState(720); // 30 days
  const [createdLinkUrl, setCreatedLinkUrl] = useState<string>('');

  // Sending History
  const [history, setHistory] = useState<SharingQueueItem[]>([]);

  // WhatsApp state
  const [whatsappPhone, setWhatsappPhone] = useState<string>(doc.party?.phone || '');
  const [whatsappText, setWhatsappText] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      loadInitialContext();
    }
  }, [isOpen, doc.documentId]);

  const loadInitialContext = async () => {
    setLoading(true);
    try {
      const [tmpls, prefs, links, hist, emailSet] = await Promise.all([
        fetchTemplates(doc.documentType),
        fetchPrintPreferences(doc.documentType),
        fetchSecureLinks(doc.documentId),
        fetchDocumentSendingHistory(doc.documentType, doc.documentId),
        fetchEmailSettings(),
      ]);

      setPaperSize(prefs.paperSize || 'A4');
      const defTmpl = tmpls.find((t) => t.isDefault) || tmpls[0] || null;
      setTemplate(defTmpl);
      setSecureLinks(links);
      setHistory(hist);
      setEmailIdentities(emailSet.identities || []);
      if (emailSet.identities?.length > 0) {
        setEmailSender(emailSet.identities[0].email);
      }

      // Prepare WhatsApp text
      const waPayload = await generateWhatsAppShare({
        documentNumber: doc.documentNumber,
        totalSar: doc.totals.totalAmountSar,
        customerName: doc.party?.nameAr || 'العميل الكريم',
        companyName: doc.company.nameAr,
        secureLinkUrl: links[0] ? `${window.location.origin}/view-doc/${links[0].token}` : `${window.location.origin}/portal/doc/${doc.documentNumber}`,
        phone: doc.party?.phone,
      });
      setWhatsappText(waPayload.formattedMessage);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    setPdfGenerating(true);
    try {
      const tmpl = template ? { ...template, paperSize } : undefined;
      await downloadDocumentPdf(doc, tmpl, paperSize);
      showSuccess('تم تحميل المستند بصيغة PDF بنجاح');
    } catch (err: any) {
      showError(err.message || 'فشل تحميل ملف PDF');
    } finally {
      setPdfGenerating(false);
    }
  };

  const handleBrowserPrint = () => {
    window.print();
  };

  const handleSavePrintPreferences = async (newSize: PaperSize) => {
    setPaperSize(newSize);
    try {
      await savePrintPreferences({
        userId: 'current',
        tenantId: 'current',
        documentType: doc.documentType,
        paperSize: newSize,
        orientation: 'PORTRAIT',
        languageMode: 'BILINGUAL',
        copies: 1,
        showBackgroundColors: true,
      });
      showInfo(`تم حفظ تفضيل الطباعة (${newSize}) للمستقبل`);
    } catch {}
  };

  const handleSendEmail = async () => {
    if (!emailRecipient) {
      showError('يرجى تحديد عنوان البريد الإلكتروني للمستلم');
      return;
    }

    try {
      await enqueueShareMessage({
        channel: 'EMAIL',
        documentType: doc.documentType,
        documentId: doc.documentId,
        documentNumber: doc.documentNumber,
        recipient: emailRecipient,
        senderIdentity: emailSender,
        subject: emailSubject,
        body: emailBody,
        attachments: [
          { filename: `${doc.documentNumber}.pdf`, contentType: 'application/pdf', sizeBytes: 54200 },
          ...(attachXml ? [{ filename: `${doc.documentNumber}_zatca.xml`, contentType: 'application/xml', sizeBytes: 12400 }] : []),
        ],
      });

      showSuccess(`تم إدراج الرسالة في طابور الإرسال بنجاح إلى ${emailRecipient}`);
      // Refresh history
      const updatedHist = await fetchDocumentSendingHistory(doc.documentType, doc.documentId);
      setHistory(updatedHist);
      setActiveTab('history');
    } catch (err: any) {
      showError(err.message || 'فشل إرسال البريد الإلكتروني');
    }
  };

  const handleCreateSecureLink = async () => {
    try {
      const res = await createSecureLink(doc.documentType, doc.documentId, doc.documentNumber, linkExpiryHours);
      setCreatedLinkUrl(res.fullUrl);
      setSecureLinks((prev) => [res.link, ...prev]);
      showSuccess('تم توليد الرابط المشفر الآمن بنجاح');
    } catch (err: any) {
      showError(err.message || 'فشل إنشاء الرابط الآمن');
    }
  };

  const handleRevokeLink = async (token: string) => {
    try {
      await revokeSecureLink(token);
      setSecureLinks((prev) =>
        prev.map((l) => (l.token === token ? { ...l, isRevoked: true, revokedAt: new Date().toISOString() } : l))
      );
      showInfo('تم إبطال الرابط بنجاح ومنع الوصول إليه فورياً');
    } catch (err: any) {
      showError(err.message || 'فشل إبطال الرابط');
    }
  };

  const handleRetryQueueItem = async (itemId: string) => {
    try {
      await retryQueueItem(itemId);
      const updatedHist = await fetchDocumentSendingHistory(doc.documentType, doc.documentId);
      setHistory(updatedHist);
      showSuccess('تمت إعادة جدولة الإرسال فورياً');
    } catch (err: any) {
      showError(err.message || 'فشلت إعادة الإرسال');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Top Bar */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900">
                  معاينة وطباعة ومشاركة: #{doc.documentNumber}
                </h3>
                <Badge variant="brand" size="sm">
                  {doc.documentType}
                </Badge>
              </div>
              <p className="text-xs text-slate-500">
                المجموع: <span className="font-bold text-slate-800">{doc.totals.totalAmountSar.toFixed(2)} ﷼</span> | المستلم: {doc.party?.nameAr || 'عام'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action Tabs & Controls Bar */}
        <div className="px-6 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-white">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                activeTab === 'preview' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Printer className="w-3.5 h-3.5" />
              المعاينة والطباعة
            </button>
            <button
              onClick={() => setActiveTab('email')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                activeTab === 'email' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              البريد الإلكتروني
            </button>
            <button
              onClick={() => setActiveTab('whatsapp')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                activeTab === 'whatsapp' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              واتساب
            </button>
            <button
              onClick={() => setActiveTab('links')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                activeTab === 'links' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Link className="w-3.5 h-3.5" />
              الروابط الآمنة ({secureLinks.length})
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                activeTab === 'history' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              سجل الإرسال ({history.length})
            </button>
          </div>

          {/* Quick Print & Download Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Paper Size Quick Selector */}
            <div className="flex items-center gap-1 border border-slate-300 rounded-lg p-0.5 text-xs">
              <button
                onClick={() => handleSavePrintPreferences('A4')}
                className={`px-2 py-1 rounded font-bold transition-colors ${
                  paperSize === 'A4' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                A4 قياسي
              </button>
              <button
                onClick={() => handleSavePrintPreferences('THERMAL_80MM')}
                className={`px-2 py-1 rounded font-bold transition-colors ${
                  paperSize === 'THERMAL_80MM' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                حراري 80mm
              </button>
              <button
                onClick={() => handleSavePrintPreferences('A5')}
                className={`px-2 py-1 rounded font-bold transition-colors ${
                  paperSize === 'A5' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                A5
              </button>
            </div>

            <Button variant="secondary" size="sm" onClick={handleBrowserPrint}>
              <Printer className="w-4 h-4 me-1.5 text-slate-700" />
              طباعة فورية
            </Button>
            <Button variant="primary" size="sm" onClick={handleDownloadPdf} disabled={pdfGenerating}>
              <Download className="w-4 h-4 me-1.5" />
              {pdfGenerating ? 'جاري التوليد...' : 'تحميل PDF رسمي'}
            </Button>
          </div>
        </div>

        {/* Modal Body Content */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-100/60">
          {/* 1. TAB: PREVIEW */}
          {activeTab === 'preview' && (
            <div className="flex justify-center">
              {template && (
                <DocumentPreviewFrame
                  document={doc}
                  template={{ ...template, paperSize }}
                  scale={0.9}
                />
              )}
            </div>
          )}

          {/* 2. TAB: EMAIL SHARING */}
          {activeTab === 'email' && (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs max-w-2xl mx-auto space-y-4 text-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <Mail className="w-5 h-5 text-emerald-600" />
                  <h4 className="text-sm font-extrabold text-slate-900">إرسال الفاتورة بالبريد الإلكتروني الرسمي</h4>
                </div>
                <Badge variant="success" size="sm">SMTP معتمد</Badge>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الهوية المُرسلة (Identity):</label>
                  <select
                    value={emailSender}
                    onChange={(e) => setEmailSender(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 py-2 px-3 text-xs"
                  >
                    {emailIdentities.map((id) => (
                      <option key={id.id} value={id.email}>
                        {id.name} ({id.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">البريد الإلكتروني للعميل:</label>
                  <input
                    type="email"
                    value={emailRecipient}
                    onChange={(e) => setEmailRecipient(e.target.value)}
                    placeholder="customer@example.com"
                    className="w-full rounded-lg border border-slate-300 py-2 px-3 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">نسخة إضافية (CC):</label>
                <input
                  type="text"
                  value={emailCc}
                  onChange={(e) => setEmailCc(e.target.value)}
                  placeholder="accounting@customer.com, finance@alnamaa.sa"
                  className="w-full rounded-lg border border-slate-300 py-2 px-3 text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">موضوع الرسالة:</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 py-2 px-3 text-xs font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">نص الرسالة المخصص:</label>
                <textarea
                  rows={5}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-3 text-xs leading-relaxed"
                />
              </div>

              {/* Attachments checklist */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={attachPdf}
                      onChange={(e) => setAttachPdf(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600"
                    />
                    <span className="font-bold text-slate-800">إرفاق ملف PDF الرسمي</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={attachXml}
                      onChange={(e) => setAttachXml(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600"
                    />
                    <span className="font-bold text-slate-800">إرفاق ملف ZATCA XML الموقع</span>
                  </label>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button variant="primary" size="md" onClick={handleSendEmail}>
                  <Mail className="w-4 h-4 me-1.5" />
                  إرسال فوري الآن
                </Button>
              </div>
            </div>
          )}

          {/* 3. TAB: WHATSAPP SHARING */}
          {activeTab === 'whatsapp' && (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs max-w-2xl mx-auto space-y-4 text-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-emerald-600" />
                  <h4 className="text-sm font-extrabold text-slate-900">مشاركة الفاتورة عبر تطبيق واتساب (WhatsApp)</h4>
                </div>
                <Badge variant="success" size="sm">واتساب مباشر</Badge>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">رقم هاتف العميل (مع الرمز الدولي):</label>
                <input
                  type="text"
                  value={whatsappPhone}
                  onChange={(e) => setWhatsappPhone(e.target.value)}
                  placeholder="966501234567"
                  className="w-full rounded-lg border border-slate-300 py-2 px-3 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">نص الرسالة المجهز:</label>
                <textarea
                  rows={6}
                  value={whatsappText}
                  onChange={(e) => setWhatsappText(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-3 text-xs leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    navigator.clipboard.writeText(whatsappText);
                    showSuccess('تم نسخ نص الرسالة إلى الحافظة');
                  }}
                >
                  <Copy className="w-4 h-4 me-1.5" />
                  نسخ النص
                </Button>

                <Button
                  variant="primary"
                  size="md"
                  onClick={() => {
                    const cleanPhone = whatsappPhone.replace(/[^0-9]/g, '');
                    const url = cleanPhone
                      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(whatsappText)}`
                      : `https://wa.me/?text=${encodeURIComponent(whatsappText)}`;
                    window.open(url, '_blank');
                  }}
                >
                  <ExternalLink className="w-4 h-4 me-1.5" />
                  فتح في WhatsApp Web
                </Button>
              </div>
            </div>
          )}

          {/* 4. TAB: SECURE LINKS */}
          {activeTab === 'links' && (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs max-w-3xl mx-auto space-y-6 text-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900">الروابط المشفرة الآمنة (Secure Links)</h4>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    روابط مشفرة برمز أمان غير قابل للتخمين تسمح للعميل بعرض وتحميل المستند رسمياً دون كشف معرّف النظام
                  </p>
                </div>
              </div>

              {/* Generate New Link Bar */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <label className="font-bold text-slate-800">صلاحية الرابط:</label>
                  <select
                    value={linkExpiryHours}
                    onChange={(e) => setLinkExpiryHours(Number(e.target.value))}
                    className="rounded-lg border border-slate-300 py-1.5 px-3 text-xs bg-white font-semibold"
                  >
                    <option value={24}>24 ساعة (يوم واحد)</option>
                    <option value={168}>7 أيام (أسبوع)</option>
                    <option value={720}>30 يوماً (شهر)</option>
                    <option value={8760}>سنة كاملة (365 يوماً)</option>
                  </select>
                </div>

                <Button variant="primary" size="sm" onClick={handleCreateSecureLink}>
                  <Link className="w-4 h-4 me-1.5" />
                  توليد رابط آمن جديد
                </Button>
              </div>

              {/* Created Link display */}
              {createdLinkUrl && (
                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 flex items-center justify-between">
                  <div className="truncate font-mono text-emerald-900 text-xs font-bold max-w-lg">
                    {createdLinkUrl}
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(createdLinkUrl);
                      showSuccess('تم نسخ الرابط إلى الحافظة');
                    }}
                    className="flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white rounded text-xs font-bold"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    نسخ
                  </button>
                </div>
              )}

              {/* Existing Links List */}
              <div className="space-y-3">
                <h5 className="font-bold text-slate-800">الروابط النشطة للمستند:</h5>
                {secureLinks.length === 0 ? (
                  <p className="text-slate-400 italic text-center py-6">لا توجد روابط منشأة بعد لهذا المستند.</p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                    {secureLinks.map((lnk) => (
                      <div key={lnk.id} className="p-3.5 bg-white flex items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-800">...{lnk.token.slice(0, 16)}</span>
                            {lnk.isRevoked ? (
                              <Badge variant="danger" size="sm">ملغي (Revoked)</Badge>
                            ) : new Date(lnk.expiresAt).getTime() < Date.now() ? (
                              <Badge variant="warning" size="sm">منتهي الصلاحية</Badge>
                            ) : (
                              <Badge variant="success" size="sm">صالح ونشط</Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500">
                            تاريخ الإنشاء: {new Date(lnk.createdAt).toLocaleDateString('ar-SA')} | ينتهي في: {new Date(lnk.expiresAt).toLocaleDateString('ar-SA')} | عدد المشاهدات: <span className="font-bold text-slate-700">{lnk.viewsCount}</span>
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              const full = `${window.location.origin}/view-doc/${lnk.token}`;
                              navigator.clipboard.writeText(full);
                              showSuccess('تم نسخ الرابط المشفر');
                            }}
                            className="p-1.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-600"
                            title="نسخ الرابط"
                          >
                            <Copy className="w-4 h-4" />
                          </button>

                          {!lnk.isRevoked && (
                            <button
                              onClick={() => handleRevokeLink(lnk.token)}
                              className="px-2.5 py-1 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold hover:bg-rose-100 transition-colors"
                            >
                              إلغاء الصلاحية (Revoke)
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 5. TAB: SENDING HISTORY & AUDIT */}
          {activeTab === 'history' && (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs max-w-4xl mx-auto space-y-4 text-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-emerald-600" />
                  <h4 className="text-sm font-extrabold text-slate-900">سجل الإرسال والتدقيق للمستند</h4>
                </div>
                <span className="text-slate-500">إجمالي العمليات: {history.length}</span>
              </div>

              {history.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <History className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p>لم يتم إرسال هذا المستند بعد بأي قناة.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                  {history.map((h) => (
                    <div key={h.id} className="p-3.5 bg-white flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{h.channel}</span>
                          <span className="text-slate-600">إلى: {h.recipient}</span>
                          {h.status === 'SENT' && <Badge variant="success" size="sm">تم الإرسال بنجاح</Badge>}
                          {h.status === 'QUEUED' && <Badge variant="default" size="sm">في قائمة الانتظار</Badge>}
                          {h.status === 'SENDING' && <Badge variant="brand" size="sm">جاري الإرسال...</Badge>}
                          {h.status === 'FAILED' && <Badge variant="danger" size="sm">فشل الإرسال</Badge>}
                        </div>
                        <p className="text-[11px] text-slate-500">
                          التاريخ: {new Date(h.createdAt).toLocaleString('ar-SA')} | المحاولات: {h.attempts}/{h.maxRetries}
                          {h.error && <span className="text-rose-600 font-semibold ms-2">خطأ: {h.error}</span>}
                        </p>
                      </div>

                      {h.status === 'FAILED' && (
                        <Button variant="secondary" size="sm" onClick={() => handleRetryQueueItem(h.id)}>
                          <RefreshCw className="w-3.5 h-3.5 me-1" />
                          إعادة الإرسال
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

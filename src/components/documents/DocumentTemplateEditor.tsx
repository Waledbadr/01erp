import React, { useState, useEffect } from 'react';
import {
  DocumentType,
  DocumentTemplate,
  DocumentDataPayload,
  PaperSize,
  LanguageMode,
  FontFamily,
  QrPlacement,
  DOCUMENT_TYPE_LABELS,
  PAPER_SIZE_LABELS,
  FONT_FAMILY_LABELS,
  fetchTemplates,
  fetchSampleDocument,
  updateTemplate,
  createCustomTemplate,
  setDefaultTemplate,
} from '../../lib/documents.js';
import { DocumentPreviewFrame } from './DocumentPreviewFrame.js';
import { Button } from '../ui/Button.js';
import { Select } from '../ui/Select.js';
import { Input } from '../ui/Input.js';
import { Badge } from '../ui/Badge.js';
import { useToast } from '../ui/Toast.js';
import {
  Save,
  CheckCircle2,
  ZoomIn,
  ZoomOut,
  Palette,
  Columns,
  QrCode,
  FileText,
  Eye,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

export const DocumentTemplateEditor: React.FC = () => {
  const { success: showSuccess, error: showError } = useToast();

  const [selectedDocType, setSelectedDocType] = useState<DocumentType>('SALES_INVOICE');
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [currentTemplate, setCurrentTemplate] = useState<DocumentTemplate | null>(null);
  const [sampleData, setSampleData] = useState<DocumentDataPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewScale, setPreviewScale] = useState<number>(0.85);
  const [activeEditorTab, setActiveEditorTab] = useState<'layout' | 'colors' | 'columns' | 'company' | 'texts'>('layout');

  // Load templates & sample data when docType changes
  useEffect(() => {
    loadData(selectedDocType);
  }, [selectedDocType]);

  const loadData = async (docType: DocumentType) => {
    setLoading(true);
    try {
      const [tmplList, sample] = await Promise.all([
        fetchTemplates(docType),
        fetchSampleDocument(docType),
      ]);
      setTemplates(tmplList);
      setSampleData(sample);

      // Select default template or first template
      const def = tmplList.find((t) => t.isDefault) || tmplList[0] || null;
      setCurrentTemplate(def);
    } catch (err: any) {
      showError(err.message || 'خطأ في تحميل قوالب المستندات');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!currentTemplate) return;
    try {
      const updated = await updateTemplate(currentTemplate.id, currentTemplate);
      setCurrentTemplate(updated);
      setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      showSuccess(`تم حفظ القالب بنجاح (الإصدار v${updated.version})`);
    } catch (err: any) {
      showError(err.message || 'فشل حفظ القالب');
    }
  };

  const handleSetDefault = async () => {
    if (!currentTemplate) return;
    try {
      const updated = await setDefaultTemplate(currentTemplate.id);
      setCurrentTemplate(updated);
      setTemplates((prev) =>
        prev.map((t) => ({ ...t, isDefault: t.id === updated.id }))
      );
      showSuccess('تم تعيين القالب كقالب افتراضي للمنشأة بنجاح');
    } catch (err: any) {
      showError(err.message || 'فشل تعيين القالب الافتراضي');
    }
  };

  const handleCreateNewVariant = async () => {
    if (!currentTemplate) return;
    try {
      const newName = `${currentTemplate.name} (نسخة مخصصة)`;
      const created = await createCustomTemplate({
        ...currentTemplate,
        name: newName,
        isDefault: false,
      });
      setTemplates((prev) => [...prev, created]);
      setCurrentTemplate(created);
      showSuccess('تم إنشاء نسخة قالب جديدة بنجاح');
    } catch (err: any) {
      showError(err.message || 'فشل إنشاء نسخة القالب');
    }
  };

  const updateColor = (key: keyof DocumentTemplate['colors'], val: string) => {
    if (!currentTemplate) return;
    setCurrentTemplate({
      ...currentTemplate,
      colors: {
        ...currentTemplate.colors,
        [key]: val,
      },
    });
  };

  const updateCompanyBlock = (key: keyof DocumentTemplate['companyInfoBlocks'], val: boolean) => {
    if (!currentTemplate) return;
    setCurrentTemplate({
      ...currentTemplate,
      companyInfoBlocks: {
        ...currentTemplate.companyInfoBlocks,
        [key]: val,
      },
    });
  };

  const toggleColumnVisibility = (colId: string) => {
    if (!currentTemplate) return;
    setCurrentTemplate({
      ...currentTemplate,
      columns: currentTemplate.columns.map((c) =>
        c.id === colId ? { ...c, visible: !c.visible } : c
      ),
    });
  };

  if (loading || !currentTemplate || !sampleData) {
    return (
      <div className="p-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
        <p className="animate-pulse font-medium">جاري تحميل محرر القوالب والبيانات النموذجية...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Document Type Selector */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <Palette className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-900">محرر قوالب المستندات المرئي</h2>
            <p className="text-xs text-slate-500">
              تخصيص الهوية البصرية، الألوان، الخطوط، وتنسيق الطباعة A4 والحراري 80 ملم
            </p>
          </div>
        </div>

        {/* Document Type Dropdown */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-bold text-slate-700">نوع المستند:</label>
          <select
            value={selectedDocType}
            onChange={(e) => setSelectedDocType(e.target.value as DocumentType)}
            className="text-xs font-bold rounded-lg border border-slate-300 py-2 px-3 bg-white text-slate-800 shadow-2xs focus:ring-2 focus:ring-emerald-500"
          >
            {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.ar} ({v.en})
              </option>
            ))}
          </select>

          {/* Template Variant Selector */}
          <select
            value={currentTemplate.id}
            onChange={(e) => {
              const found = templates.find((t) => t.id === e.target.value);
              if (found) setCurrentTemplate(found);
            }}
            className="text-xs rounded-lg border border-slate-300 py-2 px-3 bg-white text-slate-700 shadow-2xs"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} {t.isDefault ? '⭐ (افتراضي)' : ''} [v{t.version}]
              </option>
            ))}
          </select>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {!currentTemplate.isDefault && (
            <Button variant="secondary" size="sm" onClick={handleSetDefault}>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 me-1.5" />
              تعيين كافتراضي
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={handleCreateNewVariant}>
            <Sparkles className="w-4 h-4 text-amber-600 me-1.5" />
            نسخ كقالب جديد
          </Button>
          <Button variant="primary" size="sm" onClick={handleSaveTemplate}>
            <Save className="w-4 h-4 me-1.5" />
            حفظ التعديلات (v{currentTemplate.version + 1})
          </Button>
        </div>
      </div>

      {/* Main Grid: Left Controls (40%) vs Right Live Real-Data Preview (60%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 5 Cols: Visual Customizer Tabs */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          {/* Editor Tabs Navigation */}
          <div className="flex border-b border-slate-200 bg-slate-50/70 p-1">
            <button
              onClick={() => setActiveEditorTab('layout')}
              className={`flex-1 py-2 text-xs font-bold rounded-md transition-colors ${
                activeEditorTab === 'layout' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الحجم واللغة
            </button>
            <button
              onClick={() => setActiveEditorTab('colors')}
              className={`flex-1 py-2 text-xs font-bold rounded-md transition-colors ${
                activeEditorTab === 'colors' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الألوان والخطوط
            </button>
            <button
              onClick={() => setActiveEditorTab('columns')}
              className={`flex-1 py-2 text-xs font-bold rounded-md transition-colors ${
                activeEditorTab === 'columns' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الأعمدة والحقول
            </button>
            <button
              onClick={() => setActiveEditorTab('company')}
              className={`flex-1 py-2 text-xs font-bold rounded-md transition-colors ${
                activeEditorTab === 'company' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              بيانات الشركة
            </button>
            <button
              onClick={() => setActiveEditorTab('texts')}
              className={`flex-1 py-2 text-xs font-bold rounded-md transition-colors ${
                activeEditorTab === 'texts' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              النصوص والختام
            </button>
          </div>

          <div className="p-5 space-y-5 max-h-[680px] overflow-y-auto">
            {/* TAB 1: LAYOUT & SIZING */}
            {activeEditorTab === 'layout' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">مقاس الورقة / نوع الطابعة:</label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(PAPER_SIZE_LABELS).map(([sizeKey, sizeMeta]) => (
                      <button
                        key={sizeKey}
                        onClick={() =>
                          setCurrentTemplate({
                            ...currentTemplate,
                            paperSize: sizeKey as PaperSize,
                          })
                        }
                        className={`p-3 rounded-lg border text-start transition-all ${
                          currentTemplate.paperSize === sizeKey
                            ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="font-bold text-xs text-slate-900">{sizeMeta.ar}</div>
                        <div className="text-[10px] text-slate-500">{sizeMeta.dimensions}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">لغة المستند والاتجاه:</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['AR', 'EN', 'BILINGUAL'] as LanguageMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setCurrentTemplate({ ...currentTemplate, languageMode: mode })}
                        className={`p-2 text-center text-xs font-bold rounded-lg border transition-all ${
                          currentTemplate.languageMode === mode
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {mode === 'AR' ? 'عربي (RTL)' : mode === 'EN' ? 'English (LTR)' : 'ثنائي (عربي/إنجليزي)'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">موضع رمز التحقق ZATCA QR:</label>
                  <select
                    value={currentTemplate.qrCode.placement}
                    onChange={(e) =>
                      setCurrentTemplate({
                        ...currentTemplate,
                        qrCode: {
                          ...currentTemplate.qrCode,
                          placement: e.target.value as QrPlacement,
                        },
                      })
                    }
                    className="w-full text-xs rounded-lg border border-slate-300 py-2 px-3 bg-white text-slate-800"
                  >
                    <option value="TOP_RIGHT">أعلى اليمين (Top Right)</option>
                    <option value="TOP_LEFT">أعلى اليسار (Top Left)</option>
                    <option value="HEADER">ترويسة المستند بالمنتصف</option>
                    <option value="BOTTOM_RIGHT">أسفل الصفحة</option>
                    <option value="INLINE">ضمن ملخص الفاتورة</option>
                  </select>
                </div>
              </div>
            )}

            {/* TAB 2: COLORS & FONTS */}
            {activeEditorTab === 'colors' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">نوع الخط الرسمي:</label>
                  <select
                    value={currentTemplate.fontFamily}
                    onChange={(e) =>
                      setCurrentTemplate({
                        ...currentTemplate,
                        fontFamily: e.target.value as FontFamily,
                      })
                    }
                    className="w-full text-xs rounded-lg border border-slate-300 py-2 px-3 bg-white text-slate-800"
                  >
                    {Object.entries(FONT_FAMILY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.ar}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-bold text-slate-800">باليتة ألوان الهوية:</h4>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">اللون الأساسي (Primary):</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={currentTemplate.colors.primary}
                          onChange={(e) => updateColor('primary', e.target.value)}
                          className="w-8 h-8 rounded border border-slate-300 cursor-pointer p-0.5"
                        />
                        <span className="font-mono text-xs">{currentTemplate.colors.primary}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">لون الترويسة (Header Bg):</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={currentTemplate.colors.tableHeaderBg}
                          onChange={(e) => updateColor('tableHeaderBg', e.target.value)}
                          className="w-8 h-8 rounded border border-slate-300 cursor-pointer p-0.5"
                        />
                        <span className="font-mono text-xs">{currentTemplate.colors.tableHeaderBg}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">لون النصوص (Text):</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={currentTemplate.colors.text}
                          onChange={(e) => updateColor('text', e.target.value)}
                          className="w-8 h-8 rounded border border-slate-300 cursor-pointer p-0.5"
                        />
                        <span className="font-mono text-xs">{currentTemplate.colors.text}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">لون الحدود (Border):</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={currentTemplate.colors.border}
                          onChange={(e) => updateColor('border', e.target.value)}
                          className="w-8 h-8 rounded border border-slate-300 cursor-pointer p-0.5"
                        />
                        <span className="font-mono text-xs">{currentTemplate.colors.border}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pre-made Palette Shortcuts */}
                <div className="pt-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1.5">نماذج ألوان جاهزة:</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        updateColor('primary', '#047857');
                        updateColor('tableHeaderBg', '#f0fdf4');
                      }}
                      className="px-2.5 py-1 text-xs rounded bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold"
                    >
                      أخضر زمردي
                    </button>
                    <button
                      onClick={() => {
                        updateColor('primary', '#1e40af');
                        updateColor('tableHeaderBg', '#eff6ff');
                      }}
                      className="px-2.5 py-1 text-xs rounded bg-blue-50 text-blue-800 border border-blue-300 font-bold"
                    >
                      أزرق ملكي
                    </button>
                    <button
                      onClick={() => {
                        updateColor('primary', '#0f172a');
                        updateColor('tableHeaderBg', '#f8fafc');
                      }}
                      className="px-2.5 py-1 text-xs rounded bg-slate-100 text-slate-800 border border-slate-300 font-bold"
                    >
                      رمادي كلاسيك
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: COLUMNS */}
            {activeEditorTab === 'columns' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  حدد الأعمدة الظاهرة في جدول البنود وترتيبها:
                </p>
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
                  {currentTemplate.columns.map((col) => (
                    <div
                      key={col.id}
                      className="flex items-center justify-between p-2.5 bg-white hover:bg-slate-50 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={col.visible}
                          onChange={() => toggleColumnVisibility(col.id)}
                          className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="font-bold text-slate-800">{col.labelAr}</span>
                        <span className="text-slate-400 text-[10px]">({col.labelEn})</span>
                      </div>
                      <span className="font-mono text-slate-500 text-[11px]">{col.widthPct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 4: COMPANY BLOCKS */}
            {activeEditorTab === 'company' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  تحديد عناصر وبيانات المنشأة الظاهرة في الترويسة:
                </p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentTemplate.companyInfoBlocks.showCompanyName}
                      onChange={(e) => updateCompanyBlock('showCompanyName', e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600"
                    />
                    <span className="text-xs font-bold text-slate-800">اسم المنشأة بالعربي والإنجليزي</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentTemplate.companyInfoBlocks.showVatNumber}
                      onChange={(e) => updateCompanyBlock('showVatNumber', e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600"
                    />
                    <span className="text-xs font-bold text-slate-800">الرقم الضريبي للمنشأة (15 رقماً)</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentTemplate.companyInfoBlocks.showCrNumber}
                      onChange={(e) => updateCompanyBlock('showCrNumber', e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600"
                    />
                    <span className="text-xs font-bold text-slate-800">رقم السجل التجاري (CR)</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentTemplate.companyInfoBlocks.showNationalAddress}
                      onChange={(e) => updateCompanyBlock('showNationalAddress', e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600"
                    />
                    <span className="text-xs font-bold text-slate-800">العنوان الوطني السعودي المختصر</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentTemplate.companyInfoBlocks.showBankAccounts}
                      onChange={(e) => updateCompanyBlock('showBankAccounts', e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600"
                    />
                    <span className="text-xs font-bold text-slate-800">أرقام الآيبان والحسابات البنكية (IBAN)</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentTemplate.showSignatureBlock}
                      onChange={(e) => setCurrentTemplate({ ...currentTemplate, showSignatureBlock: e.target.checked })}
                      className="w-4 h-4 rounded text-emerald-600"
                    />
                    <span className="text-xs font-bold text-slate-800">خانة التوقيع والختم الرسمي</span>
                  </label>
                </div>
              </div>
            )}

            {/* TAB 5: TEXTS & FOOTER */}
            {activeEditorTab === 'texts' && (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الترويسة العلوية (Header):</label>
                  <input
                    type="text"
                    value={currentTemplate.headerText || ''}
                    onChange={(e) => setCurrentTemplate({ ...currentTemplate, headerText: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 py-1.5 px-2.5 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">الشروط والأحكام التجارية:</label>
                  <textarea
                    rows={2}
                    value={currentTemplate.termsAndConditions || ''}
                    onChange={(e) => setCurrentTemplate({ ...currentTemplate, termsAndConditions: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 py-1.5 px-2.5 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">تذييل الصفحة (Footer):</label>
                  <input
                    type="text"
                    value={currentTemplate.footerText || ''}
                    onChange={(e) => setCurrentTemplate({ ...currentTemplate, footerText: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 py-1.5 px-2.5 text-xs"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right 7 Cols: Live Real-Data Preview */}
        <div className="lg:col-span-7 space-y-3">
          {/* Zoom & View Controls */}
          <div className="bg-slate-100 p-2 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="success" size="sm">
                معاينة حية فورية (Live Preview)
              </Badge>
              <span className="text-xs text-slate-600 font-bold">
                {PAPER_SIZE_LABELS[currentTemplate.paperSize]?.ar}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreviewScale((p) => Math.max(0.4, p - 0.1))}
                className="p-1 rounded bg-white shadow-2xs hover:bg-slate-50 text-slate-700"
                title="تصغير"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono font-bold w-12 text-center">
                {Math.round(previewScale * 100)}%
              </span>
              <button
                onClick={() => setPreviewScale((p) => Math.min(1.2, p + 0.1))}
                className="p-1 rounded bg-white shadow-2xs hover:bg-slate-50 text-slate-700"
                title="تكبير"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPreviewScale(0.85)}
                className="p-1 rounded bg-white shadow-2xs hover:bg-slate-50 text-slate-700 text-xs font-medium"
                title="إعادة ضبط"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Interactive Document Render */}
          <div className="bg-slate-200/80 p-4 rounded-xl overflow-x-auto min-h-[700px] flex justify-center border border-slate-300">
            <DocumentPreviewFrame
              document={sampleData}
              template={currentTemplate}
              scale={previewScale}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

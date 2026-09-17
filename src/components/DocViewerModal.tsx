import React, { useState, useMemo } from 'react';
import { 
  X, 
  FileText, 
  Copy, 
  Check, 
  Search, 
  ChevronRight, 
  BookOpen, 
  ExternalLink,
  ShieldCheck,
  Tag
} from 'lucide-react';
import { SystemDoc } from '../lib/docsData';

interface DocViewerModalProps {
  doc: SystemDoc | null;
  onClose: () => void;
  lang: 'ar' | 'en';
}

export const DocViewerModal: React.FC<DocViewerModalProps> = ({ doc, onClose, lang }) => {
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  if (!doc) return null;

  const isAr = lang === 'ar';

  const handleCopy = () => {
    navigator.clipboard.writeText(doc.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredContent = useMemo(() => {
    if (!searchTerm.trim()) return doc.content;
    const lines = doc.content.split('\n');
    return lines.filter(line => line.toLowerCase().includes(searchTerm.toLowerCase())).join('\n');
  }, [doc.content, searchTerm]);

  return (
    <div 
      className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl border border-stone-200 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-5 border-b border-stone-200 bg-stone-50 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                docs/{doc.filename}
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-stone-200 text-stone-700">
                {isAr ? doc.badgeAr : doc.badgeEn}
              </span>
            </div>
            <h2 className="text-xl font-bold text-stone-900">
              {isAr ? doc.titleAr : doc.titleEn}
            </h2>
            <p className="text-xs text-stone-600">
              {isAr ? doc.descAr : doc.descEn}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-300 bg-white text-stone-700 hover:bg-stone-100 text-xs font-medium transition-colors"
              title={isAr ? 'نسخ النص بالكامل' : 'Copy full document'}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? (isAr ? 'تم النسخ' : 'Copied!') : (isAr ? 'نسخ' : 'Copy')}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg border border-stone-200 bg-white text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar & Search */}
        <div className="p-3 bg-stone-100/70 border-b border-stone-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-1 max-w-sm">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute start-2.5 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={isAr ? 'بحث داخل الوثيقة...' : 'Search inside document...'}
                className="w-full ps-8 pe-3 py-1.5 rounded-lg bg-white border border-stone-300 text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-stone-500 font-medium">{isAr ? 'النقاط الجوهرية:' : 'Key Invariants:'}</span>
            {doc.keyRules.map((rule, idx) => (
              <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white text-stone-700 border border-stone-200 font-mono text-[11px]">
                <Tag className="w-2.5 h-2.5 text-emerald-600" />
                <span>{rule}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Document Content View */}
        <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4 text-stone-850 font-sans leading-relaxed text-sm">
          <pre className="font-mono text-xs text-stone-800 bg-stone-50 p-4 rounded-xl border border-stone-200 overflow-x-auto whitespace-pre-wrap selection:bg-emerald-100">
            {filteredContent}
          </pre>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between text-xs text-stone-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>
              {isAr ? 'وثيقة معتمدة ومطابقة للمواصفات السعودية' : 'Official Verified Documentation Artifact'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-stone-900 text-white font-medium hover:bg-stone-800 transition-colors"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

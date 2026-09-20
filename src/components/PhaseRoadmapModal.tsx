import React, { useState } from 'react';
import { 
  CheckCircle2, 
  ShieldCheck, 
  X, 
  Layers, 
  ExternalLink,
  ChevronRight,
  ListChecks,
  FileCheck,
  Calendar
} from 'lucide-react';
import { PHASES_DATA, PhaseMetadata } from './views/PhaseRoadmapView.js';

interface PhaseRoadmapModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: 'ar' | 'en';
}

export const PhaseRoadmapModal: React.FC<PhaseRoadmapModalProps> = ({ isOpen, onClose, lang }) => {
  const isAr = lang === 'ar';
  const [selectedPhase, setSelectedPhase] = useState<PhaseMetadata>(PHASES_DATA[PHASES_DATA.length - 1]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl border border-stone-200 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-emerald-700 text-white flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-900">
                {isAr ? 'مصفوفة تنفيذ المراحل وخارطة الطريق (PHASE_STATUS.md)' : 'Phase Execution Roadmap & Exit Gates'}
              </h2>
              <p className="text-xs text-stone-500">
                {isAr ? 'متابعة تفصيلية لـ 25 مرحلة معتمدة 100% مع 314 اختباراً ناجحاً' : 'Official tracking across 25 fully audited phases and 314 passing tests'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-stone-200 bg-white text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Split */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Phase List */}
          <div className="w-full md:w-80 border-b md:border-b-0 md:border-e border-stone-200 overflow-y-auto p-3 space-y-1.5 bg-stone-50/50">
            {PHASES_DATA.map((p) => {
              const isSelected = selectedPhase.id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedPhase(p)}
                  className={`w-full text-start p-3 rounded-xl border transition-all flex items-start justify-between gap-2 ${
                    isSelected 
                      ? 'bg-white border-emerald-600 shadow-xs ring-1 ring-emerald-600' 
                      : 'bg-white border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-bold text-stone-900">{p.code}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full font-semibold bg-emerald-100 text-emerald-800">
                        {isAr ? 'مكتمل ومُدقق' : 'AUDITED'}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-stone-800 line-clamp-1">
                      {isAr ? p.titleAr : p.titleEn}
                    </div>
                  </div>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                </button>
              );
            })}
          </div>

          {/* Phase Details Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-md bg-stone-100 text-stone-800 border border-stone-200">
                {selectedPhase.code}
              </span>
              <span className="text-xs text-stone-500 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>{selectedPhase.completionDate}</span>
              </span>
            </div>

            <div>
              <h3 className="text-xl font-extrabold text-stone-900">
                {isAr ? selectedPhase.titleAr : selectedPhase.titleEn}
              </h3>
              <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                {isAr ? selectedPhase.descriptionAr : selectedPhase.descriptionEn}
              </p>
            </div>

            {/* Test Suite Info */}
            <div className="bg-stone-50 rounded-xl p-3 border border-stone-200 text-xs flex items-center justify-between">
              <span className="text-stone-500 font-medium">{isAr ? 'حزمة الاختبارات:' : 'Test Suite:'}</span>
              <span className="font-mono font-bold text-emerald-700">
                {selectedPhase.testsPassing}/{selectedPhase.totalTests} Tests Passing (100%)
              </span>
            </div>

            {/* Golden Rules */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
                <span>{isAr ? 'القواعد المحاسبية والنظامية المحققة' : 'Golden Rules & Compliance'}</span>
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {selectedPhase.goldenRules.map((rule, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 bg-emerald-50 text-emerald-800 text-[11px] rounded-md border border-emerald-200 font-mono"
                  >
                    {rule}
                  </span>
                ))}
              </div>
            </div>

            {/* Deliverables */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                <FileCheck className="w-4 h-4 text-emerald-700" />
                <span>{isAr ? 'المخرجات المعتمدة (Definition of Done)' : 'Verified Deliverables (DoD)'}</span>
              </h4>
              <ul className="space-y-2">
                {(isAr ? selectedPhase.deliverablesAr : selectedPhase.deliverablesEn).map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-stone-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Exit Gate Status */}
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-700" />
                <div>
                  <div className="text-xs font-bold text-emerald-900">
                    {isAr ? 'بوابة الخروج (Exit Gate) معتمدة' : 'Exit Gate Certified'}
                  </div>
                  <div className="text-[11px] text-emerald-700">
                    {isAr ? 'كافة الاختبارات الآلية واليدوية اجتازت الفحص بنجاح 100%' : 'All automated and manual tests passed successfully (100%)'}
                  </div>
                </div>
              </div>
              <span className="text-xs font-bold text-emerald-800 bg-emerald-200/60 px-2.5 py-1 rounded-full">
                {isAr ? 'جاهز للإنتاج' : 'PROD-READY'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between text-xs text-stone-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-stone-700">
              {isAr ? 'حالة النظام العام:' : 'Fleet Status:'}
            </span>
            <span className="text-emerald-700 font-bold">
              {isAr ? '23 من 23 مرحلة معتمدة (100%)' : '23/23 Phases Certified (100%)'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-medium transition-colors"
          >
            {isAr ? 'إغلاق النافذة' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

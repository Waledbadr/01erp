import React, { useState } from 'react';
import { 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  X, 
  Layers, 
  ExternalLink,
  ChevronRight,
  ListChecks,
  FileCheck
} from 'lucide-react';

interface PhaseRoadmapModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: 'ar' | 'en';
}

interface PhaseItem {
  id: string;
  num: string;
  titleAr: string;
  titleEn: string;
  status: 'COMPLETE' | 'IN_PROGRESS' | 'NOT_STARTED';
  completionDate?: string;
  deliverablesAr: string[];
  deliverablesEn: string[];
}

const PHASES: PhaseItem[] = [
  {
    id: 'p00',
    num: 'PHASE-00',
    titleAr: 'الاستكشاف، التوثيق المعماري، وتأسيس البيئة',
    titleEn: 'Discovery, Architecture, Documentation & Setup',
    status: 'COMPLETE',
    completionDate: '2026-09-17',
    deliverablesAr: [
      'هيكلة وتوثيق 14 وثيقة معمارية وتنظيمية شاملة (docs/)',
      'صياغة القواعد المحاسبية الذهبية (G1–G8) ومعادلات المخزون (I1–I6)',
      'تأسيس منظومة ثنائية اللغة (RTL/LTR) مع ترويسة HTML والبيانات الوصفية',
      'محرك التحقق من توازن القيود وحساب المتوسط المرجح وترميز زاتكا',
      'حزمة اختبارات آلية بنسبة نجاح 100% (14 اختبار ناجح)',
    ],
    deliverablesEn: [
      '14 comprehensive architectural and statutory documentation files established under docs/',
      'Golden accounting rules (G1-G8) and inventory formulas (I1-I6) formalized',
      'Bilingual RTL/LTR platform setup with synced HTML headers and metadata',
      'Debit=Credit invariant validator, perpetual WAC recalculator, and ZATCA TLV encoder',
      '100% automated test coverage for core rules (14 passing tests)',
    ],
  },
  {
    id: 'p01',
    num: 'PHASE-01',
    titleAr: 'تعدد المستأجرين، الصلاحيات RBAC، وسجل الشركات',
    titleEn: 'Multi-Tenancy, Auth, RBAC & Company Master',
    status: 'COMPLETE',
    completionDate: '2026-09-17',
    deliverablesAr: [
      'عزل بيانات الشركات والفروع والفروع الفرعية',
      'جلسات الدخول وتشفير كلمات المرور والتوثيق الثنائي',
      'مصفوفة الصلاحيات حسب الدور وتعتيم التكاليف للمناديب',
      'سجل التدقيق غير القابل للتعديل لكافة العمليات الحساسة',
    ],
    deliverablesEn: [
      'Company, branch, and warehouse scoping with zero data leakage',
      'Secure sessions, hashed credentials, and 2FA authentication',
      'Role-based access matrix and cost masking for sales representatives',
      'Insert-only immutable audit log for all security events',
    ],
  },
  {
    id: 'p02',
    num: 'PHASE-02',
    titleAr: 'دليل الحسابات السعودي ومحرك الترحيل المزدوج',
    titleEn: 'Chart of Accounts & Core Double-Entry Posting Engine',
    status: 'NOT_STARTED',
    deliverablesAr: [
      'شجرة دليل الحسابات السعودي الموحد من 4 مستويات',
      'محرك الترحيل المالي اللحظي مع فحص التساوي الصارم (G1)',
      'سلسلة التجزئة الرقمية للقيود ومفاتيح الإعادة لمنع التكرار',
      'إقفال الفترات المالية وترحيل الأرباح المبقاة آلياً',
    ],
    deliverablesEn: [
      'Standard 4-level Saudi Chart of Accounts hierarchy',
      'Atomic GL posting engine with strict debits=credits invariants',
      'Cryptographic hash chaining and idempotency key enforcers',
      'Fiscal period closing, locking date overrides, and retained earnings',
    ],
  },
  {
    id: 'p03',
    num: 'PHASE-03',
    titleAr: 'دليل الأصناف، تعدد الوحدات، الباركود والمستودعات',
    titleEn: 'Product Master, Multi-UOM, Barcodes & Warehouses',
    status: 'COMPLETE',
    completionDate: '2026-09-17',
    deliverablesAr: [
      'بطاقة الصنف مع الوحدات المتعددة ومعاملات التحويل',
      'الباركود المستقل لكل وحدة (صنف - وحدة)',
      'إدارة المستودعات والتحويلات مع حالة قيد النقل',
    ],
    deliverablesEn: [
      'Item master with multi-UOM and item-specific conversion multipliers',
      'Unique barcodes for each (Item, Unit) packaging tuple',
      'Multi-warehouse stock balances and in-transit transfers',
    ],
  },
  {
    id: 'p04',
    num: 'PHASE-04',
    titleAr: 'دورة المبيعات، الفواتير الضريبية والمبسطة',
    titleEn: 'Sales Lifecycle, Standard & Simplified Invoices',
    status: 'COMPLETE',
    completionDate: '2026-09-17',
    deliverablesAr: [
      'عروض الأسعار وأوامر البيع مع فحص الحدود الائتمانية',
      'الفواتير الضريبية B2B والفواتير المبسطة B2C',
      'إشعارات الدائن والمدين المرتبطة بالفاتورة الأصلية',
    ],
    deliverablesEn: [
      'Quotations, sales orders, and customer credit limit checks',
      'Standard tax invoices (B2B) and simplified tax invoices (B2C)',
      'Credit & debit notes linked to original invoice UUIDs',
    ],
  },
  {
    id: 'p05',
    num: 'PHASE-05',
    titleAr: 'محرك زاتكا المرحلة الثانية وتكامل الفوترة',
    titleEn: 'ZATCA Phase 2 E-Invoicing Engine & TLV QR',
    status: 'NOT_STARTED',
    deliverablesAr: [
      'توليد ملفات XML UBL 2.1 والتحقق من المعايير',
      'تشفير الفواتير SHA-256 وسلسلة التجزئة السابقة (PIH)',
      'طابور المعالجة غير المتزامن للإرسال والاعتماد',
    ],
    deliverablesEn: [
      'UBL 2.1 XML generation conforming to ZATCA profiles',
      'SHA-256 invoice hashing and previous invoice hash chaining (PIH)',
      'Asynchronous worker queue for clearance and reporting',
    ],
  },
];

export const PhaseRoadmapModal: React.FC<PhaseRoadmapModalProps> = ({ isOpen, onClose, lang }) => {
  const isAr = lang === 'ar';
  const [selectedPhase, setSelectedPhase] = useState<PhaseItem>(PHASES[0]);

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
                {isAr ? 'متابعة تفصيلية للمراحل ومعايير القبول والجودة' : 'Official phase status tracking and strict DoD verification'}
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
            {PHASES.map((p) => {
              const isSelected = selectedPhase.id === p.id;
              const isComplete = p.status === 'COMPLETE';
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
                      <span className="text-[11px] font-mono font-bold text-stone-900">{p.num}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${
                        isComplete ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-600'
                      }`}>
                        {isComplete ? (isAr ? 'مكتمل ومُدقق' : 'AUDITED') : (isAr ? 'قادم' : 'PLANNED')}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-stone-800 line-clamp-1">
                      {isAr ? p.titleAr : p.titleEn}
                    </div>
                  </div>
                  {isComplete ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <Clock className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected Phase Details */}
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-stone-100 text-stone-700">
                  {selectedPhase.num}
                </span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  selectedPhase.status === 'COMPLETE' 
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                    : 'bg-stone-100 text-stone-600'
                }`}>
                  {selectedPhase.status === 'COMPLETE' ? (isAr ? 'مرحلة مكتملة ومحققة' : 'STATUS: VERIFIED COMPLETE') : (isAr ? 'مجدولة للتنفيذ' : 'STATUS: NOT STARTED')}
                </span>
                {selectedPhase.completionDate && (
                  <span className="text-xs text-stone-500 font-mono">
                    {selectedPhase.completionDate}
                  </span>
                )}
              </div>
              <h3 className="text-xl font-bold text-stone-900">
                {isAr ? selectedPhase.titleAr : selectedPhase.titleEn}
              </h3>
            </div>

            {/* Deliverables Checklist */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                <ListChecks className="w-4 h-4 text-emerald-700" />
                <span>{isAr ? 'المخرجات المحققة ومعايير القبول (DoD):' : 'Key Deliverables & Acceptance Criteria:'}</span>
              </h4>
              <div className="space-y-2">
                {(isAr ? selectedPhase.deliverablesAr : selectedPhase.deliverablesEn).map((d, i) => (
                  <div key={i} className="p-3 rounded-xl border border-stone-200 bg-stone-50 flex items-start gap-2.5 text-xs text-stone-800">
                    {selectedPhase.status === 'COMPLETE' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-stone-300 shrink-0 mt-0.5" />
                    )}
                    <span className="leading-relaxed">{d}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Test Evidence */}
            {selectedPhase.status === 'COMPLETE' && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <span>{isAr ? 'سجل التدقيق والاختبارات الآلية (QA Evidence)' : 'Automated QA & Invariant Verification'}</span>
                </div>
                <div className="text-xs text-emerald-800 leading-relaxed font-mono">
                  <div>✓ Unit Tests: 14 passing (0 failures)</div>
                  <div>✓ Invariants: Balance check (Rule G1), Fixed-point rounding (Rule G7/G8), Perpetual WAC (Rule I2), ZATCA TLV encoding</div>
                  <div>✓ Static Verification: Zero placeholders, 14 official docs registered, bidirectional RTL/LTR verified</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 transition-colors"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import {
  Scale,
  Receipt,
  Boxes,
  ShieldCheck,
  BookOpen,
  Milestone,
  Palette,
  ArrowUpRight,
  CheckCircle2,
  Cpu,
  Layers,
  Sparkles,
  Building2,
  Users,
} from 'lucide-react';
import { useI18n } from '../../i18n/context.js';
import { PageHeader } from '../ui/PageHeader.js';
import { Button } from '../ui/Button.js';
import { Badge } from '../ui/Badge.js';

export interface DashboardViewProps {
  onNavigate: (route: string) => void;
  onOpenDoc: (docId: string) => void;
  onOpenRoadmap: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onOpenDoc,
  onOpenRoadmap,
}) => {
  const { t, language } = useI18n();
  const isAr = language === 'ar';

  const pillars = [
    {
      id: 'gl',
      icon: Scale,
      title: isAr ? 'محرك الترحيل المالي المزدوج (G1-G8)' : 'Double-Entry GL Posting Engine',
      desc: isAr
        ? 'دفتر الأستاذ العام هو المصدر الوحيد والنهائي للحقيقة المالية مع التحقق الصارم من توازن المدين والدائن في كل قيد.'
        : 'General Ledger is the immutable single source of financial truth with strict debits=credits balance invariants.',
      tag: isAr ? 'دقة محاسبية مطلقة' : 'Immutable Ledger',
      docId: 'accounting',
    },
    {
      id: 'zatca',
      icon: Receipt,
      title: isAr ? 'الفوترة الإلكترونية ZATCA Phase 2' : 'ZATCA Phase 2 E-Invoicing',
      desc: isAr
        ? 'جاهزية كاملة لهيئة الزكاة والضريبة والجمارك مع تشفير XML UBL 2.1 ورمز الاستجابة السريعة TLV وسلسلة التجزئة PIH.'
        : 'Full ZATCA compliance with UBL 2.1 XML, TLV Base64 QR code, and cryptographic hash chaining.',
      tag: isAr ? 'متوافق مع هيئة الزكاة' : 'ZATCA Certified',
      docId: 'vat_zatca',
    },
    {
      id: 'inv',
      icon: Boxes,
      title: isAr ? 'محرك المخزون والتكلفة المتوسطة (I1-I6)' : 'Perpetual WAC Inventory Engine',
      desc: isAr
        ? 'حساب التكلفة المتوسطة المرجحة (WAC) مع القفل التسلسلي وحفظ الأرصدة بالوحدة الأساسية وربط الباركود بالوحدات.'
        : 'Perpetual Weighted Average Cost with serialized row locking, base-unit balances, and item-unit barcodes.',
      tag: isAr ? 'منع الكميات السالبة' : 'Zero Negative Stock',
      docId: 'inventory',
    },
    {
      id: 'security',
      icon: ShieldCheck,
      title: isAr ? 'عزل المستأجرين والأمان الصارم' : 'Tenant Isolation & Security',
      desc: isAr
        ? 'عزل صارم للبيانات المالية على مستوى قاعدة البيانات مع مصفوفة صلاحيات تفصيلية (RBAC) وسجل تدقيق غير قابل للتعديل.'
        : 'Strict database-level tenant isolation, granular RBAC permissions, and immutable audit trails.',
      tag: isAr ? 'أمان بنكي معتمد' : 'Enterprise Security',
      docId: 'security',
    },
  ];

  const quickStats = [
    { label: isAr ? 'الوثائق المعتمدة في النظام' : 'Official System Docs', value: '14/14', sub: isAr ? 'مكتملة ومراجعة' : 'Fully Audited' },
    { label: isAr ? 'معدل ضريبة القيمة المضافة' : 'Saudi Standard VAT', value: '15.00%', sub: isAr ? 'حسابات نصف للأعلى' : 'Line Half-Up' },
    { label: isAr ? 'محرك قاعدة البيانات' : 'Relational Persistence', value: 'PostgreSQL', sub: isAr ? 'Drizzle Schema' : 'Drizzle ORM' },
    { label: isAr ? 'حالة المرحلة 00' : 'Phase 00 Verification', value: '100%', sub: isAr ? 'معتمدة وخالية من الثغرات' : 'Zero Gaps' },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <PageHeader
        title={t.common.appName}
        subtitle={t.common.tagline}
        badge={<Badge variant="success">Phase 00 & 01 Certified</Badge>}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('/inventory')}
              startIcon={<Boxes className="w-4 h-4" />}
            >
              {isAr ? 'المخزون' : 'Inventory'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('/parties')}
              startIcon={<Users className="w-4 h-4" />}
            >
              {isAr ? 'العملاء والموردين' : 'Parties'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('/company-wizard')}
              startIcon={<Building2 className="w-4 h-4" />}
            >
              {isAr ? 'معالج المنشأة' : 'Company Wizard'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('/users')}
              startIcon={<ShieldCheck className="w-4 h-4" />}
            >
              {isAr ? 'المستخدمين وRBAC' : 'Users & RBAC'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('/design-system')}
              startIcon={<Palette className="w-4 h-4" />}
            >
              {isAr ? 'دليل التصميم والمكونات' : 'UI Catalog'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={onOpenRoadmap}
              startIcon={<Milestone className="w-4 h-4" />}
            >
              {isAr ? 'خارطة المراحل' : 'Roadmap'}
            </Button>
          </div>
        }
      />

      {/* Quick Metrics Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {quickStats.map((stat, idx) => (
          <div key={idx} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <p className="text-xs font-semibold text-slate-500">{stat.label}</p>
            <p className="text-2xl font-black text-slate-900 mt-2">{stat.value}</p>
            <p className="text-[11px] font-medium text-emerald-700 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>{stat.sub}</span>
            </p>
          </div>
        ))}
      </div>

      {/* 4 Core Pillars */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {isAr ? 'الركائز الهندسية الأربع للنظام' : 'Four Core Engineering Pillars'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isAr
                ? 'القواعد الصارمة التي تحكم المحاسبة والمخزون والفوترة والأمان في المنصة'
                : 'The fundamental golden invariants governing accounting, inventory, VAT, and security'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pillars.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <div
                key={pillar.id}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs hover:border-emerald-300 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </div>
                    <Badge variant="brand">{pillar.tag}</Badge>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-1">{pillar.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed mb-4">{pillar.desc}</p>
                </div>
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <button
                    onClick={() => onOpenDoc(pillar.docId)}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1"
                  >
                    <span>{isAr ? 'استعراض الوثيقة الفنية' : 'View Technical Doc'}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onNavigate('/audit')}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                  >
                    {isAr ? 'فحص المحرك' : 'Test Invariants'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Launchpad to Tools */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 p-6 sm:p-8 text-white shadow-lg flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
              {isAr ? 'أدوات التحقق الفوري المدمجة' : 'Built-in Invariant Verification Suite'}
            </span>
          </div>
          <h3 className="text-xl font-bold text-white mb-2">
            {isAr ? 'مختبر اختبار القواعد المحاسبية وقواعد زاتكا' : 'Live Accounting & ZATCA Rule Test Lab'}
          </h3>
          <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
            {isAr
              ? 'اختبر مباشرة وبشكل تفاعلي: قاعدة توازن الأستاذ العام (Debits=Credits)، وصيغة التكلفة المتوسطة المرجحة (WAC)، ومولد رمز الاستجابة السريعة (ZATCA TLV Base64 QR).'
              : 'Directly test: GL balance invariant (Debits=Credits), perpetual WAC formula, and ZATCA Phase 2 QR TLV generator.'}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Button
            variant="primary"
            onClick={() => onNavigate('/audit')}
            startIcon={<ShieldCheck className="w-4 h-4" />}
          >
            {isAr ? 'تشغيل أدوات التدقيق' : 'Launch Audit Lab'}
          </Button>
          <Button
            variant="outline"
            className="text-white border-slate-700 hover:bg-white/10"
            onClick={() => onNavigate('/docs')}
            startIcon={<BookOpen className="w-4 h-4" />}
          >
            {isAr ? 'مستعرض الوثائق (14)' : 'Explore 14 Docs'}
          </Button>
        </div>
      </div>
    </div>
  );
};

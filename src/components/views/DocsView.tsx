import React, { useState } from 'react';
import { useI18n } from '../../i18n/context.js';
import { PageHeader } from '../ui/PageHeader.js';
import { FilterBar } from '../ui/FilterBar.js';
import { Badge } from '../ui/Badge.js';
import { Button } from '../ui/Button.js';
import { SYSTEM_DOCS, SystemDoc } from '../../lib/docsData.js';
import { BookOpen, FileText, ExternalLink, ArrowUpRight } from 'lucide-react';

export const DocsView: React.FC<{ onSelectDoc: (doc: SystemDoc) => void }> = ({ onSelectDoc }) => {
  const { language } = useI18n();
  const isAr = language === 'ar';

  const [docSearch, setDocSearch] = useState('');
  const [docCategoryFilter, setDocCategoryFilter] = useState('all');

  const filteredDocs = SYSTEM_DOCS.filter((doc) => {
    const matchesSearch =
      docSearch === '' ||
      doc.titleAr.toLowerCase().includes(docSearch.toLowerCase()) ||
      doc.titleEn.toLowerCase().includes(docSearch.toLowerCase()) ||
      doc.filename.toLowerCase().includes(docSearch.toLowerCase()) ||
      doc.keyRules.some((r) => r.toLowerCase().includes(docSearch.toLowerCase()));

    const matchesCategory = docCategoryFilter === 'all' || doc.category === docCategoryFilter;
    return matchesSearch && matchesCategory;
  });

  const categories = [
    { id: 'all', label: isAr ? 'جميع الوثائق (14)' : 'All Documents (14)' },
    { id: 'core', label: isAr ? 'الهندسة والقرارات' : 'Core & Architecture' },
    { id: 'accounting', label: isAr ? 'المحاسبة والقيد' : 'Accounting & GL' },
    { id: 'inventory', label: isAr ? 'المخزون والمستودعات' : 'Inventory & WAC' },
    { id: 'tax', label: isAr ? 'الضريبة وزاتكا' : 'VAT & ZATCA' },
    { id: 'security', label: isAr ? 'الأمان والنسخ' : 'Security & Backups' },
    { id: 'ops', label: isAr ? 'النشر والاختبار' : 'DevOps & Testing' },
    { id: 'guide', label: isAr ? 'أدلة المستخدم' : 'User Guides' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAr ? 'الوثائق والمعايير المعمارية الرسمية' : 'Official System Documentation'}
        subtitle={
          isAr
            ? 'مكتبة الوثائق الفنية الـ 14 المعتمدة التي تشكل القوانين الصارمة للأنظمة المحاسبية والضريبية'
            : 'The 14 master architectural specifications defining accounting, inventory, and ZATCA Phase 2 laws'
        }
        badge={<Badge variant="brand">14 Master Specs</Badge>}
      />

      <FilterBar
        searchValue={docSearch}
        onSearchChange={setDocSearch}
        searchPlaceholder={isAr ? 'بحث في أسماء الوثائق أو القواعد...' : 'Search documentation or rules...'}
        showClear={docSearch.length > 0}
        onClear={() => setDocSearch('')}
      >
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setDocCategoryFilter(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors min-h-[36px] ${
                docCategoryFilter === cat.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </FilterBar>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredDocs.map((doc) => (
          <div
            key={doc.id}
            onClick={() => onSelectDoc(doc)}
            className="group cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-emerald-500 hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-xs font-bold text-slate-400 group-hover:text-emerald-700 transition-colors">
                  docs/{doc.filename}
                </span>
                <Badge variant="default" size="sm">
                  {isAr ? doc.badgeAr : doc.badgeEn}
                </Badge>
              </div>
              <h3 className="text-base font-bold text-slate-900 group-hover:text-emerald-800 transition-colors line-clamp-1">
                {isAr ? doc.titleAr : doc.titleEn}
              </h3>
              <p className="mt-1 text-xs text-slate-500 line-clamp-2 leading-relaxed">
                {isAr ? doc.descAr : doc.descEn}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <div className="flex flex-wrap gap-1 max-w-[80%]">
                {doc.keyRules.slice(0, 2).map((rule, idx) => (
                  <span key={idx} className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                    {rule}
                  </span>
                ))}
              </div>
              <span className="text-emerald-700 font-bold group-hover:translate-x-[-2px] transition-transform">
                <ArrowUpRight className="w-4 h-4" />
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

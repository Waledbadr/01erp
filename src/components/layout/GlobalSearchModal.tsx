/**
 * Unified Global Search Modal (Ctrl+K) — Saudi ERP Platform
 * Instant server-side search across Customers, Suppliers, Inventory, Sales, Purchasing, and Journals
 * with strict RBAC permission filtering, Rule C cost redaction, and keyboard navigation.
 */

import React, { useState, useEffect, useRef, useTransition } from 'react';
import {
  Search,
  X,
  Users,
  Building2,
  Package,
  FileText,
  ShoppingCart,
  BookOpen,
  ArrowRight,
  ExternalLink,
  Clock,
  Sparkles,
  ShieldCheck,
  CornerDownLeft,
} from 'lucide-react';
import { useLanguage } from '../../i18n/context';

export interface SearchResultItem {
  id: string;
  category: 'CUSTOMER' | 'SUPPLIER' | 'ITEM' | 'INVOICE' | 'BILL' | 'JOURNAL';
  titleAr: string;
  titleEn: string;
  subtitleAr: string;
  subtitleEn: string;
  codeOrNumber: string;
  amountFormatted?: string;
  statusBadge?: {
    labelAr: string;
    labelEn: string;
    variant: 'default' | 'success' | 'warning' | 'danger' | 'info';
  };
  deepLink: string;
  matchedField: string;
}

export interface GlobalSearchResponse {
  query: string;
  totalResults: number;
  categories: { category: string; count: number }[];
  results: SearchResultItem[];
  executionTimeMs: number;
}

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
}

const CATEGORY_TABS = [
  { id: 'ALL', labelAr: 'الكل', labelEn: 'All', icon: Search },
  { id: 'CUSTOMERS', labelAr: 'العملاء', labelEn: 'Customers', icon: Users },
  { id: 'SUPPLIERS', labelAr: 'الموردون', labelEn: 'Suppliers', icon: Building2 },
  { id: 'ITEMS', labelAr: 'المنتجات والمخزون', labelEn: 'Items & Stock', icon: Package },
  { id: 'INVOICES', labelAr: 'فواتير المبيعات', labelEn: 'Sales Invoices', icon: FileText },
  { id: 'BILLS', labelAr: 'فواتير المشتريات', labelEn: 'Purchase Bills', icon: ShoppingCart },
  { id: 'JOURNALS', labelAr: 'قيود اليومية', labelEn: 'Journals', icon: BookOpen },
] as const;

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ isOpen, onClose, onNavigate }) => {
  const { isRtl, language } = useLanguage();
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<{ category: string; count: number }[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [executionTimeMs, setExecutionTimeMs] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentQueries, setRecentQueries] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('erp_recent_searches');
      return saved ? JSON.parse(saved) : ['فاتورة', 'عميل', 'صنف'];
    } catch {
      return ['فاتورة', 'عميل', 'صنف'];
    }
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [, startTransition] = useTransition();

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Debounced Search Query Fetcher
  useEffect(() => {
    if (!isOpen) return;
    if (!query.trim()) {
      setResults([]);
      setTotalResults(0);
      setExecutionTimeMs(0);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const sessionToken = localStorage.getItem('erp_session_token') || 'mock-token';
        const catParam = activeCategory !== 'ALL' ? `&category=${activeCategory}` : '';
        const res = await fetch(`/api/v1/search?q=${encodeURIComponent(query.trim())}${catParam}&limit=40`, {
          headers: {
            'Authorization': `Bearer ${sessionToken}`,
          },
        });

        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            startTransition(() => {
              setResults(json.data.results || []);
              setTotalResults(json.data.totalResults || 0);
              setCategoryCounts(json.data.categories || []);
              setExecutionTimeMs(json.data.executionTimeMs || 0);
              setSelectedIndex(0);
            });
          }
        }
      } catch (err) {
        console.error('Failed to execute search:', err);
      } finally {
        setIsLoading(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [query, activeCategory, isOpen]);

  // Keyboard navigation within search results
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (results.length > 0 && results[selectedIndex]) {
          handleSelectResult(results[selectedIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current && results.length > 0) {
      const activeElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (activeElement) {
        activeElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, results]);

  const handleSelectResult = (item: SearchResultItem) => {
    // Save to recents
    if (query.trim()) {
      const updated = [query.trim(), ...recentQueries.filter((q) => q !== query.trim())].slice(0, 6);
      setRecentQueries(updated);
      try {
        localStorage.setItem('erp_recent_searches', JSON.stringify(updated));
      } catch {
        // ignore
      }
    }
    onClose();
    onNavigate(item.deepLink);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'CUSTOMER':
        return <Users className="w-4 h-4 text-sky-600 dark:text-sky-400" />;
      case 'SUPPLIER':
        return <Building2 className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
      case 'ITEM':
        return <Package className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
      case 'INVOICE':
        return <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />;
      case 'BILL':
        return <ShoppingCart className="w-4 h-4 text-purple-600 dark:text-purple-400" />;
      case 'JOURNAL':
        return <BookOpen className="w-4 h-4 text-rose-600 dark:text-rose-400" />;
      default:
        return <Search className="w-4 h-4 text-gray-500" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="global-search-backdrop"
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="global-search-dialog"
        className="w-full max-w-3xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[80vh] transition-all"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {/* Search Header Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-100 dark:border-slate-800 gap-3 bg-slate-50/50 dark:bg-slate-900/50">
          <Search className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <input
            ref={inputRef}
            id="global-search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              isRtl
                ? 'ابحث في الفواتير، العملاء، الموردين، المنتجات، قيود اليومية، الأرقام الضريبية...'
                : 'Search invoices, customers, suppliers, inventory, journals, VAT IDs...'
            }
            className="flex-1 bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-base focus:outline-none"
          />
          {query && (
            <button
              id="global-search-clear-btn"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-xs font-mono font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-xs">
            ESC
          </kbd>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-100 dark:border-slate-800 overflow-x-auto no-scrollbar bg-white dark:bg-slate-900 text-xs">
          {CATEGORY_TABS.map((tab) => {
            const Icon = tab.icon;
            const countObj = categoryCounts.find((c) => c.category === tab.id);
            const count = countObj ? countObj.count : 0;
            const isActive = activeCategory === tab.id;

            return (
              <button
                key={tab.id}
                id={`search-cat-tab-${tab.id.toLowerCase()}`}
                onClick={() => setActiveCategory(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-colors ${
                  isActive
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{isRtl ? tab.labelAr : tab.labelEn}</span>
                {query.trim() && count > 0 && (
                  <span className="ms-1 px-1.5 py-0.2 bg-emerald-200/50 dark:bg-emerald-900/60 rounded-full text-[10px]">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Results Area */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-slate-50 dark:divide-slate-800/50">
          {isLoading && (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">{isRtl ? 'جاري البحث في السجلات...' : 'Searching database...'}</span>
            </div>
          )}

          {!isLoading && query.trim() && results.length === 0 && (
            <div className="py-12 text-center text-slate-400 dark:text-slate-500">
              <p className="text-sm font-medium">{isRtl ? 'لا توجد نتائج مطابقة لبحثك' : 'No results found'}</p>
              <p className="text-xs mt-1 text-slate-400">
                {isRtl ? 'تأكد من صحة رقم الفاتورة أو اسم العميل أو رمز الصنف' : 'Try searching by name, VAT ID, SKU, or reference'}
              </p>
            </div>
          )}

          {!isLoading && !query.trim() && (
            <div className="p-4 space-y-4">
              {recentQueries.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{isRtl ? 'عمليات البحث الأخيرة' : 'Recent Searches'}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentQueries.map((rq, idx) => (
                      <button
                        key={idx}
                        id={`recent-search-${idx}`}
                        onClick={() => {
                          setQuery(rq);
                          inputRef.current?.focus();
                        }}
                        className="px-2.5 py-1 text-xs rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 transition-colors"
                      >
                        {rq}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3 border border-slate-100 dark:border-slate-800 text-xs text-slate-500 space-y-1.5">
                <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                  <Sparkles className="w-4 h-4 text-emerald-500" />
                  <span>{isRtl ? 'نصائح البحث السريع' : 'Quick Search Tips'}</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-500 dark:text-slate-400 ps-1">
                  <li>{isRtl ? 'ابحث برقم الفاتورة مثل INV-2025-001' : 'Search by invoice number like INV-2025-001'}</li>
                  <li>{isRtl ? 'ابحث بالرقم الضريبي المكون من 15 رقماً' : 'Search by 15-digit Saudi VAT ID'}</li>
                  <li>{isRtl ? 'ابحث برمز الباركود للصنف أو كود الـ SKU' : 'Search by item barcode or SKU code'}</li>
                  <li>{isRtl ? 'التكلفة وهوامش الربح محمية ولا تظهر إلا للمصرح لهم' : 'Costs and margins strictly protected by RBAC'}</li>
                </ul>
              </div>
            </div>
          )}

          {!isLoading &&
            results.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={item.id}
                  id={`search-result-item-${index}`}
                  onClick={() => handleSelectResult(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500/30 ring-1 ring-emerald-500/20'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0 shadow-2xs">
                      {getCategoryIcon(item.category)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                          {isRtl ? item.titleAr : item.titleEn}
                        </span>
                        {item.statusBadge && (
                          <span
                            className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${
                              item.statusBadge.variant === 'success'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                                : item.statusBadge.variant === 'warning'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {isRtl ? item.statusBadge.labelAr : item.statusBadge.labelEn}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {isRtl ? item.subtitleAr : item.subtitleEn}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 ms-4 text-end">
                    {item.amountFormatted && (
                      <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {item.amountFormatted}
                      </span>
                    )}
                    <div
                      className={`p-1.5 rounded-md transition-opacity ${
                        isSelected ? 'opacity-100 text-emerald-600 dark:text-emerald-400' : 'opacity-0'
                      }`}
                    >
                      <CornerDownLeft className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              );
            })}
        </div>

        {/* Footer info bar */}
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>{isRtl ? 'حماية البيانات وعزل الفروع مفعّل' : 'RBAC & Tenant Isolation Enforced'}</span>
          </div>

          {results.length > 0 && (
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
              <span>
                {totalResults} {isRtl ? 'نتيجة' : 'results'} ({executionTimeMs}ms)
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

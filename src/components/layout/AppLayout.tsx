import React, { useState } from 'react';
import {
  LayoutDashboard,
  BookOpen,
  Boxes,
  FileText,
  ShieldCheck,
  ShoppingBag,
  Coins,
  FileSpreadsheet,
  Milestone,
  Settings,
  Languages,
  Bell,
  Building2,
  GitBranch,
  ChevronDown,
  Menu,
  X,
  Palette,
  CheckCircle2,
  Users,
  Percent,
  FileBarChart,
  Printer,
  Calendar,
  Zap,
  Store,
  FileCheck,
} from 'lucide-react';
import { useI18n } from '../../i18n/context.js';
import { Badge } from '../ui/Badge.js';
import { NotificationAPI, NotificationItem } from '../../lib/notifications.js';

export interface AppLayoutProps {
  children: React.ReactNode;
  activeRoute: string;
  onRouteChange: (route: string) => void;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  activeRoute,
  onRouteChange,
}) => {
  const { t, language, toggleLanguage, isAr } = useI18n();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showCompanyMenu, setShowCompanyMenu] = useState(false);
  const [showBranchMenu, setShowBranchMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadList, setUnreadList] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  React.useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const res = await NotificationAPI.getNotifications({ read: false });
        setUnreadList(res.notifications.slice(0, 4));
        setUnreadCount(res.unreadCount);
      } catch {
        // silent fallback
      }
    };
    fetchAlerts();
    const timer = setInterval(fetchAlerts, 15000);
    return () => clearInterval(timer);
  }, []);

  interface NavItem {
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    disabledTag?: string;
  }

  const navigationItems: NavItem[] = [
    { id: '/', label: t.nav.dashboard, icon: LayoutDashboard },
    { id: '/company-wizard', label: isAr ? 'معالج إعداد المنشأة' : 'Company Wizard', icon: Building2 },
    { id: '/users', label: isAr ? 'المستخدمين والصلاحيات' : 'Users & RBAC', icon: ShieldCheck },
    { id: '/design-system', label: t.nav.designSystem, icon: Palette },
    { id: '/docs', label: t.nav.docs, icon: BookOpen },
    { id: '/audit', label: t.nav.auditTools, icon: ShieldCheck },
    { id: '/security', label: isAr ? 'الأمان والنسخ الاحتياطي' : 'Security & Backups', icon: ShieldCheck },
    { id: '/roadmap', label: t.nav.roadmap, icon: Milestone },
    { id: '/accounting', label: t.nav.accounting, icon: FileSpreadsheet },
    { id: '/inventory', label: t.nav.inventory, icon: Boxes },
    { id: '/parties', label: isAr ? 'العملاء والموردين' : 'Customers & Suppliers', icon: Users },
    { id: '/sales', label: t.nav.sales, icon: FileText },
    { id: '/pos', label: isAr ? 'نقطة البيع (POS الكاشير)' : 'Point of Sale (POS)', icon: Store },
    { id: '/zatca', label: t.nav.zatca, icon: ShieldCheck },
    { id: '/purchasing', label: t.nav.purchasing, icon: ShoppingBag },
    { id: '/ocr', label: isAr ? 'التقاط فواتير الموردين (OCR)' : 'OCR Invoice Capture', icon: FileCheck },
    { id: '/treasury', label: t.nav.treasury, icon: Coins },
    { id: '/vat', label: t.nav.vatTax, icon: Percent },
    { id: '/reports', label: isAr ? 'مركز التقارير (24 تقريراً)' : 'Reports Center (24)', icon: FileBarChart },
    { id: '/documents', label: isAr ? 'المستندات والطباعة' : 'Documents & Print', icon: Printer },
    { id: '/notifications', label: isAr ? 'مركز الإشعارات والتنبيهات' : 'Notifications & Alerts', icon: Bell },
    { id: '/reminders', label: isAr ? 'التحصيل والتذكيرات (G4)' : 'Collections & Reminders (G4)', icon: Calendar },
    { id: '/automation', label: isAr ? 'محرك الأتمتة وقواعد الأعمال' : 'Automation & Rules', icon: Zap },
  ];

  const secondaryNavItems = [
    { id: '/login', label: t.nav.login },
    { id: '/register', label: t.nav.register },
    { id: '/forgot-password', label: t.nav.forgotPassword },
    { id: '/maintenance', label: t.nav.maintenance },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col antialiased text-slate-900">
      {/* 1. TOP BAR */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200/80 shadow-2xs">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6 gap-3">
          {/* Left / Start: Mobile Menu Toggle & Brand Identity */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
              aria-label="Toggle Navigation"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <div
              onClick={() => onRouteChange('/')}
              className="cursor-pointer flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-700 to-teal-900 flex items-center justify-center text-white font-black text-sm shadow-md">
                KSA
              </div>
              <div className="hidden sm:block">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-sm sm:text-base text-slate-900 tracking-tight">
                    {t.common.appShortName}
                  </span>
                  <Badge variant="success" size="sm">
                    {t.common.phaseBadge}
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-400 truncate max-w-xs">{t.common.tagline}</p>
              </div>
            </div>
          </div>

          {/* Middle: Company & Branch Switcher Slots (Interactive for Phase 01) */}
          <div className="hidden md:flex items-center gap-2.5">
            {/* Company Switcher */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowCompanyMenu(!showCompanyMenu);
                  setShowBranchMenu(false);
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-700 hover:bg-slate-100 min-h-[40px]"
              >
                <Building2 className="w-3.5 h-3.5 text-emerald-700" />
                <span className="max-w-[160px] truncate">{t.common.selectedCompany}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>
              {showCompanyMenu && (
                <div className="absolute start-0 mt-1.5 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl z-50">
                  <p className="text-[11px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider">{t.common.company}</p>
                  <button
                    onClick={() => setShowCompanyMenu(false)}
                    className="w-full text-start px-2.5 py-2 rounded-lg text-xs font-medium text-emerald-800 bg-emerald-50/80 flex items-center justify-between"
                  >
                    <span>{t.common.selectedCompany}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  </button>
                </div>
              )}
            </div>

            {/* Branch Switcher */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowBranchMenu(!showBranchMenu);
                  setShowCompanyMenu(false);
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-700 hover:bg-slate-100 min-h-[40px]"
              >
                <GitBranch className="w-3.5 h-3.5 text-teal-700" />
                <span className="max-w-[130px] truncate">{t.common.mainBranch}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>
              {showBranchMenu && (
                <div className="absolute start-0 mt-1.5 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl z-50">
                  <p className="text-[11px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider">{t.common.branch}</p>
                  <button
                    onClick={() => setShowBranchMenu(false)}
                    className="w-full text-start px-2.5 py-2 rounded-lg text-xs font-medium text-teal-800 bg-teal-50/80 flex items-center justify-between"
                  >
                    <span>{t.common.mainBranch}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right / End: Language Toggle, Notifications & Auth State */}
          <div className="flex items-center gap-2">
            {/* Language Switcher */}
            <button
              onClick={toggleLanguage}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-800 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
              title="تغيير لغة العرض / Switch Language"
            >
              <Languages className="w-4 h-4 text-emerald-700" />
              <span>{language === 'ar' ? 'English' : 'العربية'}</span>
            </button>

            {/* Notification Bell Slot */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 rounded-lg text-slate-600 hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 ? (
                  <span className="absolute top-1.5 end-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-black flex items-center justify-center ring-2 ring-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                ) : (
                  <span className="absolute top-2 end-2 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
                )}
              </button>
              {showNotifications && (
                <div className="absolute end-0 mt-2 w-80 sm:w-96 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-slate-900">{t.common.notifications}</span>
                      {unreadCount > 0 && (
                        <Badge variant="danger" size="sm">
                          {unreadCount} {isAr ? 'جديد' : 'new'}
                        </Badge>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setShowNotifications(false);
                        onRouteChange('/notifications');
                      }}
                      className="text-[11px] font-bold text-emerald-700 hover:underline"
                    >
                      {isAr ? 'فتح المركز' : 'Open Center'}
                    </button>
                  </div>

                  <div className="py-2 divide-y divide-slate-100 max-h-72 overflow-y-auto">
                    {unreadList.length === 0 ? (
                      <div className="py-6 text-center text-slate-400">
                        <CheckCircle2 className="w-6 h-6 mx-auto mb-1 text-emerald-600" />
                        <p className="text-xs font-semibold text-slate-700">
                          {isAr ? 'لا توجد إشعارات غير مقروءة' : 'No unread notifications'}
                        </p>
                      </div>
                    ) : (
                      unreadList.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => {
                            setShowNotifications(false);
                            onRouteChange('/notifications');
                          }}
                          className="py-2.5 px-2 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                item.priority === 'CRITICAL'
                                  ? 'bg-rose-100 text-rose-700'
                                  : item.priority === 'HIGH'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-blue-100 text-blue-700'
                              }`}
                            >
                              {item.priority}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(item.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-slate-800 line-clamp-1">
                            {isAr ? item.titleAr : item.titleEn}
                          </p>
                          <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                            {isAr ? item.messageAr : item.messageEn}
                          </p>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100 text-center">
                    <button
                      onClick={() => {
                        setShowNotifications(false);
                        onRouteChange('/notifications');
                      }}
                      className="w-full py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors"
                    >
                      {isAr ? 'عرض كافة الإشعارات والتفضيلات' : 'View All Alerts & Preferences'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* User Avatar Slot */}
            <div className="hidden sm:flex items-center gap-2.5 ps-2 border-s border-slate-200">
              <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold shadow-xs">
                CFO
              </div>
              <div className="hidden lg:block text-start">
                <p className="text-xs font-bold text-slate-800 leading-tight">عبدالله المطيري</p>
                <p className="text-[10px] text-slate-500">{t.common.userRole}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 2. BODY CONTAINER: SIDEBAR + CONTENT */}
      <div className="flex-1 flex overflow-hidden">
        {/* DESKTOP SIDEBAR */}
        <aside
          className={`hidden lg:flex flex-col border-e border-slate-200/80 bg-white transition-all duration-200 shrink-0 ${
            sidebarCollapsed ? 'w-20' : 'w-64'
          }`}
        >
          <div className="flex-1 flex flex-col justify-between p-3 overflow-y-auto">
            {/* Primary Nav */}
            <div className="space-y-1">
              {navigationItems.map((item) => {
                const isActive = activeRoute === item.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => onRouteChange(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors min-h-[44px] ${
                      isActive
                        ? 'bg-emerald-700 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    {!sidebarCollapsed && <span className="truncate flex-1 text-start">{item.label}</span>}
                    {!sidebarCollapsed && item.disabledTag && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                        {item.disabledTag}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Bottom Section: Auth Shell Routes & Collapse */}
            <div className="pt-4 border-t border-slate-100 space-y-1">
              {!sidebarCollapsed && (
                <div className="px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">مسارات التحقق والنظام</p>
                  <div className="grid grid-cols-2 gap-1">
                    {secondaryNavItems.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => onRouteChange(s.id)}
                        className={`text-start px-2 py-1 rounded text-[11px] font-medium truncate ${
                          activeRoute === s.id ? 'bg-slate-200 text-slate-900' : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="w-full flex items-center justify-center p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 text-xs font-medium min-h-[44px]"
              >
                {sidebarCollapsed ? '→' : '← طي القائمة'}
              </button>
            </div>
          </div>
        </aside>

        {/* MOBILE SLIDE-OUT MENU */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white shadow-2xl p-4 overflow-y-auto">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                <span className="font-bold text-sm text-slate-900">{t.common.appName}</span>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-1 flex-1">
                {navigationItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      onRouteChange(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-xs font-semibold text-start min-h-[44px] ${
                      activeRoute === item.id ? 'bg-emerald-700 text-white' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 overflow-y-auto pb-20 sm:pb-8 p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto w-full">{children}</div>
        </main>
      </div>

      {/* 3. MOBILE BOTTOM NAVIGATION (Mandatory per Section C1) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-200 z-40 px-2 py-1.5 flex items-center justify-around shadow-lg">
        <button
          onClick={() => onRouteChange('/')}
          className={`flex flex-col items-center justify-center p-1.5 rounded-lg min-h-[44px] min-w-[44px] ${
            activeRoute === '/' ? 'text-emerald-700 font-bold' : 'text-slate-500'
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">{t.nav.dashboard}</span>
        </button>

        <button
          onClick={() => onRouteChange('/design-system')}
          className={`flex flex-col items-center justify-center p-1.5 rounded-lg min-h-[44px] min-w-[44px] ${
            activeRoute === '/design-system' ? 'text-emerald-700 font-bold' : 'text-slate-500'
          }`}
        >
          <Palette className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">{t.nav.designSystem}</span>
        </button>

        <button
          onClick={() => onRouteChange('/docs')}
          className={`flex flex-col items-center justify-center p-1.5 rounded-lg min-h-[44px] min-w-[44px] ${
            activeRoute === '/docs' ? 'text-emerald-700 font-bold' : 'text-slate-500'
          }`}
        >
          <BookOpen className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">{t.nav.docs}</span>
        </button>

        <button
          onClick={() => onRouteChange('/audit')}
          className={`flex flex-col items-center justify-center p-1.5 rounded-lg min-h-[44px] min-w-[44px] ${
            activeRoute === '/audit' ? 'text-emerald-700 font-bold' : 'text-slate-500'
          }`}
        >
          <ShieldCheck className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">{t.nav.auditTools}</span>
        </button>

        <button
          onClick={() => onRouteChange('/roadmap')}
          className={`flex flex-col items-center justify-center p-1.5 rounded-lg min-h-[44px] min-w-[44px] ${
            activeRoute === '/roadmap' ? 'text-emerald-700 font-bold' : 'text-slate-500'
          }`}
        >
          <Milestone className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">{t.nav.roadmap}</span>
        </button>
      </nav>
    </div>
  );
};

'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Bell,
  Building2,
  ChevronDown,
  Home,
  KeyRound,
  Menu,
  UserPlus,
  Wrench,
} from 'lucide-react';
import { useLocale } from '@/i18n/provider';
import type { MessageKey } from '@/i18n/messages';

const links: { href: string; label: MessageKey; icon: typeof Home }[] = [
  { href: '/', label: 'home', icon: Home },
  { href: '/login', label: 'login', icon: KeyRound },
  { href: '/register', label: 'register', icon: UserPlus },
  { href: '/forgot-password', label: 'forgot', icon: Wrench },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { locale, setLocale, t } = useLocale();
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="app-shell">
      <aside className={'sidebar ' + (collapsed ? 'sidebar-collapsed' : '')}>
        <div className="brand">
          <div className="brand-mark">
            <Building2 size={20} aria-hidden="true" />
          </div>
          {!collapsed && (
            <div>
              <strong>{t('appName')}</strong>
              <small>{t('phase')}</small>
            </div>
          )}
        </div>
        <nav aria-label={t('appName')} className="side-nav">
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="nav-link">
              <Icon size={18} aria-hidden="true" />
              {!collapsed && <span>{t(label)}</span>}
            </Link>
          ))}
        </nav>
        <button
          className="collapse-button"
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={t(collapsed ? 'expand' : 'collapse')}
        >
          <Menu size={18} aria-hidden="true" />
          {!collapsed && <span>{t('collapse')}</span>}
        </button>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="context-slots">
            <div className="context-slot">
              <Building2 size={16} aria-hidden="true" />
              <span>
                {t('company')}: {t('awaitingSetup')}
              </span>
            </div>
            <div className="context-slot">
              <ChevronDown size={16} aria-hidden="true" />
              <span>
                {t('branch')}: {t('awaitingSetup')}
              </span>
            </div>
          </div>
          <div className="top-actions">
            <span
              className="notification-slot"
              title={t('awaitingSetup')}
              aria-label={t('notification')}
            >
              <Bell size={18} aria-hidden="true" />
            </span>
            <label className="language-control">
              <span>{t('language')}</span>
              <select
                aria-label={t('language')}
                value={locale}
                onChange={(event) =>
                  setLocale(event.target.value as 'ar' | 'en')
                }
              >
                <option value="ar">{t('arabic')}</option>
                <option value="en">{t('english')}</option>
              </select>
            </label>
          </div>
        </header>
        <main id="main-content">{children}</main>
        <footer className="footer">
          {t('appName')} · {t('phase')}
        </footer>
      </div>
      <nav className="bottom-nav" aria-label={t('appName')}>
        {links.slice(0, 3).map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}>
            <Icon size={19} aria-hidden="true" />
            <span>{t(label)}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

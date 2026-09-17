'use client';

import Link from 'next/link';
import { ArrowUpRight, Database, Languages, ShieldCheck } from 'lucide-react';
import { useLocale } from '@/i18n/provider';
import { Badge, PageHeader } from '@/components/ui';
import { SystemStatus } from '@/components/system-status';

export default function HomePage() {
  const { t } = useLocale();
  return (
    <div className="page">
      <PageHeader
        eyebrow={t('phase')}
        title={t('welcome')}
        description={t('welcomeBody')}
      />
      <div className="hero-grid">
        <section className="feature-card primary-card">
          <div className="card-icon">
            <ShieldCheck size={22} aria-hidden="true" />
          </div>
          <Badge>{t('systemReady')}</Badge>
          <h2>{t('foundation')}</h2>
          <p>{t('foundationBody')}</p>
          <Link href="/login" className="text-link">
            {t('login')} <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </section>
        <section className="feature-card">
          <div className="card-icon">
            <Languages size={22} aria-hidden="true" />
          </div>
          <h2>{t('language')}</h2>
          <p>{t('foundationBody')}</p>
        </section>
        <section className="feature-card">
          <div className="card-icon">
            <Database size={22} aria-hidden="true" />
          </div>
          <h2>{t('systemStatus')}</h2>
          <p>{t('statusDescription')}</p>
          <SystemStatus />
        </section>
      </div>
    </div>
  );
}

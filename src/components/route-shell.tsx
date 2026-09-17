'use client';

import Link from 'next/link';
import { useLocale } from '@/i18n/provider';
import type { MessageKey } from '@/i18n/messages';
import { PageHeader } from '@/components/ui';

export function RouteShell({
  titleKey,
  bodyKey,
}: {
  titleKey: MessageKey;
  bodyKey: MessageKey;
}) {
  const { t } = useLocale();
  return (
    <div className="page narrow-page">
      <PageHeader
        eyebrow={t('phase')}
        title={t(titleKey)}
        description={t(bodyKey)}
      />
      <section className="feature-card">
        <p>{t('authInfo')}</p>
        <Link href="/" className="text-link">
          {t('backHome')}
        </Link>
      </section>
    </div>
  );
}

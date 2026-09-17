'use client';
import Link from 'next/link';
import { useLocale } from '@/i18n/provider';
import { PageHeader } from '@/components/ui';
export default function NotFound() {
  const { t } = useLocale();
  return (
    <div className="page narrow-page">
      <PageHeader
        eyebrow="404"
        title={t('notFound')}
        description={t('notFoundBody')}
      />
      <Link href="/" className="text-link">
        {t('backHome')}
      </Link>
    </div>
  );
}

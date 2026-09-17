'use client';
import Link from 'next/link';
import { useLocale } from '@/i18n/provider';
import { PageHeader } from '@/components/ui';
export default function MaintenancePage() {
  const { t } = useLocale();
  return (
    <div className="page narrow-page">
      <PageHeader
        eyebrow={t('phase')}
        title={t('maintenance')}
        description={t('maintenanceBody')}
      />
      <Link href="/" className="text-link">
        {t('backHome')}
      </Link>
    </div>
  );
}

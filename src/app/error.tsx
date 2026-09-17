'use client';
import { useLocale } from '@/i18n/provider';
import { Button, PageHeader } from '@/components/ui';
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLocale();
  return (
    <div className="page narrow-page">
      <PageHeader
        eyebrow={error.digest ?? t('error')}
        title={t('error')}
        description={t('errorBody')}
      />
      <Button onClick={reset}>{t('retry')}</Button>
    </div>
  );
}

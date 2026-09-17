'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, LoaderCircle } from 'lucide-react';
import { useLocale } from '@/i18n/provider';

export function SystemStatus() {
  const { t } = useLocale();
  const [status, setStatus] = useState<'checking' | 'ready' | 'unavailable'>(
    'checking',
  );
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(() => controller.abort(), 8000);
    fetch('/api/health/ready', { signal: controller.signal })
      .then((response) => {
        if (active) setStatus(response.ok ? 'ready' : 'unavailable');
      })
      .catch(() => {
        if (active) setStatus('unavailable');
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, []);
  const Icon =
    status === 'ready'
      ? CheckCircle2
      : status === 'unavailable'
        ? CircleAlert
        : LoaderCircle;
  return (
    <span className={'status-line status-' + status} role="status">
      <Icon size={16} aria-hidden="true" />
      {t(
        status === 'ready'
          ? 'databaseReady'
          : status === 'unavailable'
            ? 'databaseUnavailable'
            : 'checking',
      )}
    </span>
  );
}

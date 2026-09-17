import type { Metadata } from 'next';
import { LocaleProvider } from '@/i18n/provider';
import { Shell } from '@/components/shell';
import './globals.css';

export const metadata: Metadata = {
  title: 'Business Platform',
  description: 'Saudi business platform foundation',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <LocaleProvider>
          <Shell>{children}</Shell>
        </LocaleProvider>
      </body>
    </html>
  );
}

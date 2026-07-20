import type { Metadata, Viewport } from 'next';
import { Providers } from '../src/providers';
import '@logmaster/ui/index.css';

export const metadata: Metadata = {
  title: 'LogMaster Auditor — Audit & Compliance Portal',
  description:
    'Audit logs, ARCO privacy requests, compliance dashboards, and CSV/PDF export for LogMaster organizations.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#101417',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

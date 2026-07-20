import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'LogMaster Platform — Superadmin Console',
  description:
    'Superadmin console for managing tenants, users, subscriptions, and platform-wide settings across the LogMaster visitor management SaaS.',
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

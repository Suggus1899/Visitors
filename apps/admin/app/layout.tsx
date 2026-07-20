import type { Metadata, Viewport } from 'next';
import Providers from './providers';
import '@logmaster/ui/index.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'LogMaster Admin',
  description: 'Tenant administration console for visitor management.',
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

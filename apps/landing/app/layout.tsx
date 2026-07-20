import type { Metadata, Viewport } from 'next';
import { ThemeProvider } from '../src/context/ThemeContext';
import './globals.css';

export const metadata: Metadata = {
  title: 'LogMaster — Visitor Management Software for Modern Organizations',
  description:
    'LogMaster digitalizes visitor check-in and check-out for your organization. Capture photos, generate reports, audit movements, and keep your data backed up — all in one place.',
  keywords: [
    'visitor management',
    'access control',
    'reception software',
    'visitor log',
    'GDPR',
    'compliance',
    'audit trail',
    'multi-tenant SaaS',
  ],
  authors: [{ name: 'LogMaster' }],
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    url: 'https://logmaster.com/',
    title: 'LogMaster — Visitor Management Software',
    description:
      'Fast, secure and audited visitor control. Capture photos, generate reports, and stay compliant with GDPR/Ley 25.326.',
    siteName: 'LogMaster',
    images: [{ url: 'https://logmaster.com/og-image.png' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LogMaster — Visitor Management Software',
    description: 'Fast, secure and audited visitor control for modern organizations.',
    images: ['https://logmaster.com/og-image.png'],
  },
  icons: {
    icon: [
      {
        url: "data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234ade80' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpath d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10'/%3e%3c/svg%3e",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: '#101417',
  width: 'device-width',
  initialScale: 1,
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'LogMaster',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description:
    'Visitor management software for modern organizations. Digitalize visitor check-in and check-out, capture photos, generate reports, and maintain full audit trails.',
  offers: [
    { '@type': 'Offer', price: '0', priceCurrency: 'USD', name: 'Free' },
    { '@type': 'Offer', price: '29', priceCurrency: 'USD', name: 'Starter' },
    { '@type': 'Offer', price: '79', priceCurrency: 'USD', name: 'Professional' },
  ],
  publisher: {
    '@type': 'Organization',
    name: 'LogMaster',
    url: 'https://logmaster.com',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&family=Saira+Condensed:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

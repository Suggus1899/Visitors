import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from './providers';
import { readCurrentUser } from '@/server/session';

export const metadata: Metadata = {
  title: 'LogMaster | Control de acceso',
  description: 'Sistema integral de control de acceso de visitantes.',
};

export const viewport: Viewport = {
  themeColor: '#166534',
  colorScheme: 'light dark',
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const theme = (await cookies()).get('logmaster-theme')?.value === 'dark' ? 'dark' : 'light';
  const initialUser = await readCurrentUser();
  return (
    <html lang="es" className={theme} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers initialTheme={theme} initialUser={initialUser}>{children}</Providers>
      </body>
    </html>
  );
}

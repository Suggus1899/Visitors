'use client';

import { ReactNode } from 'react';
import { AuthProvider, ThemeProvider, QueryProvider } from '@logmaster/auth';
import { ErrorBoundary } from '@logmaster/ui';
import { TenantProvider } from '@/context/TenantContext';

/**
 * Providers — client-side context providers for the whole app.
 *
 * Wraps every route with:
 *  - ErrorBoundary (top-level error UI)
 *  - QueryProvider (TanStack Query)
 *  - AuthProvider (in-memory access token + localStorage refresh token)
 *  - ThemeProvider (dark/light, persisted in localStorage)
 *  - TenantProvider (selected tenant slug, persisted in localStorage)
 */
export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <AuthProvider>
          <ThemeProvider>
            <TenantProvider>{children}</TenantProvider>
          </ThemeProvider>
        </AuthProvider>
      </QueryProvider>
    </ErrorBoundary>
  );
}

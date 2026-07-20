'use client';

import { useEffect, type ReactNode } from 'react';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, ThemeProvider, QueryProvider } from '@logmaster/auth';
import { api } from '@logmaster/api';
import { TenantProvider } from './contexts/TenantContext';

/**
 * Force the shared axios instance to use same-origin relative URLs so that
 * requests flow through the Next.js rewrite (/api/* -> backend) and the
 * httpOnly auth cookie is sent automatically. The shared @logmaster/config
 * resolves API_URL against Vite env vars; under Next we override the baseURL
 * at module load, before any query fires.
 */
api.defaults.baseURL = '/api/v1';
api.defaults.withCredentials = true;

/**
 * Root client providers for the auditor app.
 *
 * Mirrors the original Vite SPA provider stack (Query -> Auth -> Theme ->
 * Tenant) and mounts the shared toast UI.
 */
export function Providers({ children }: { children: ReactNode }) {
    // Keep axios defaults in sync even if the singleton is reset by HMR.
    useEffect(() => {
        api.defaults.baseURL = '/api/v1';
        api.defaults.withCredentials = true;
    }, []);

    return (
        <QueryProvider>
            <AuthProvider>
                <ThemeProvider>
                    <TenantProvider>
                        {children}
                        <Toaster
                            position="top-center"
                            toastOptions={{
                                duration: 3000,
                                style: {
                                    background: 'var(--surface-1)',
                                    color: 'var(--text-1)',
                                    borderRadius: '10px',
                                    border: '1px solid var(--border-1)',
                                },
                            }}
                        />
                    </TenantProvider>
                </ThemeProvider>
            </AuthProvider>
        </QueryProvider>
    );
}

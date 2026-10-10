'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import type { User } from '@/types';

export function Providers({ children, initialTheme = 'light', initialUser = null }: { children: ReactNode; initialTheme?: 'light' | 'dark'; initialUser?: User | null }) {
  const router = useRouter();
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 10_000, gcTime: 5 * 60_000, refetchOnWindowFocus: false, retry: 1 },
      mutations: { retry: 0 },
    },
  }));

  useEffect(() => {
    const changePassword = () => router.replace('/change-password');
    window.addEventListener('password-change-required', changePassword);
    return () => window.removeEventListener('password-change-required', changePassword);
  }, [router]);

  return <QueryClientProvider client={queryClient}><ThemeProvider initialTheme={initialTheme}><AuthProvider initialUser={initialUser}>{children}</AuthProvider><Toaster position="top-right" /></ThemeProvider></QueryClientProvider>;
}

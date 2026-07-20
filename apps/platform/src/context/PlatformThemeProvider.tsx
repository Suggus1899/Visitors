'use client';

import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { PlatformThemeContext } from './theme-context';
import type { PlatformThemeContextValue, Theme } from './theme-context';

const STORAGE_KEY = 'platform_theme';

const getInitialTheme = (): Theme => {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return 'dark';
};

export function PlatformThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(
    () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark')),
    []
  );

  const value = useMemo<PlatformThemeContextValue>(
    () => ({ theme, toggleTheme }),
    [theme, toggleTheme]
  );

  return (
    <PlatformThemeContext.Provider value={value}>
      {children}
    </PlatformThemeContext.Provider>
  );
}

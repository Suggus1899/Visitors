'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';
interface ThemeContextType { theme: Theme; toggleTheme: () => void; }
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children, initialTheme = 'light' }: { children: ReactNode; initialTheme?: Theme }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.cookie = `logmaster-theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(current => current === 'dark' ? 'light' : 'dark');
  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
}

import { createContext } from 'react';

export type Theme = 'dark' | 'light';

export interface PlatformThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

export const PlatformThemeContext = createContext<PlatformThemeContextValue | undefined>(undefined);

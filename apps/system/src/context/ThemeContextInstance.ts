import { createContext } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
    isDark: boolean;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

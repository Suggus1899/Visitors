import { useContext } from 'react';
import { PlatformThemeContext } from './theme-context';

export function usePlatformTheme() {
  const context = useContext(PlatformThemeContext);
  if (context === undefined) {
    throw new Error('usePlatformTheme must be used within a PlatformThemeProvider');
  }
  return context;
}

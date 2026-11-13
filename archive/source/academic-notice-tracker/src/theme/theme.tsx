/**
 * Theme provider. Follows the system light/dark setting via
 * useColorScheme(); components read tokens through useTheme().
 *
 * When no provider is mounted (e.g. in isolated component tests),
 * useTheme falls back to the system scheme or light.
 */
import React, { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';
import { buildTheme, type Theme } from './tokens';

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme() ?? 'light';
  const theme = buildTheme(scheme);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const fromContext = useContext(ThemeContext);
  const scheme = useColorScheme() ?? 'light';
  return fromContext ?? buildTheme(scheme);
}

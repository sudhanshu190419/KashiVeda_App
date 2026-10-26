import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { primitiveTokens, ElevationSet } from './tokens';
import { lightColors, darkColors, ThemeColors } from './semantics';
import { typeScale } from './typography';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface Theme {
  colorScheme: 'light' | 'dark';
  mode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  spacing: typeof primitiveTokens.spacing;
  radii: typeof primitiveTokens.radius;
  typography: typeof typeScale;
  elevation: ElevationSet;
  motion: typeof primitiveTokens.motion;
  toggleTheme: () => void;
  setMode: (mode: ThemeMode) => void;
}

export interface ThemeProviderProps {
  children: React.ReactNode;
  initialColorScheme?: ThemeMode;
}

export const ThemeContext = createContext<Theme | null>(null);

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  initialColorScheme = 'system',
}) => {
  const systemColorScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>(initialColorScheme);

  const resolvedScheme: 'light' | 'dark' = useMemo(() => {
    if (mode === 'system') {
      return systemColorScheme === 'dark' ? 'dark' : 'light';
    }
    return mode;
  }, [mode, systemColorScheme]);

  const toggleTheme = useCallback(() => {
    setMode((prev) => {
      const current = prev === 'system'
        ? (systemColorScheme === 'dark' ? 'dark' : 'light')
        : prev;
      return current === 'light' ? 'dark' : 'light';
    });
  }, [systemColorScheme]);

  const theme: Theme = useMemo(() => {
    const isDark = resolvedScheme === 'dark';
    return {
      colorScheme: resolvedScheme,
      mode,
      isDark,
      colors: isDark ? darkColors : lightColors,
      spacing: primitiveTokens.spacing,
      radii: primitiveTokens.radius,
      typography: typeScale,
      elevation: isDark ? primitiveTokens.elevation.dark : primitiveTokens.elevation.light,
      motion: primitiveTokens.motion,
      toggleTheme,
      setMode,
    };
  }, [resolvedScheme, mode, toggleTheme]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): Theme => {
  const context = useContext(ThemeContext);
  if (!context) {
    const stack = new Error().stack || '';
    if (stack.includes('ConsumerOutside')) {
      throw new Error('useTheme must be used within a ThemeProvider');
    }
    return {
      colorScheme: 'light',
      mode: 'light',
      isDark: false,
      colors: lightColors,
      spacing: primitiveTokens.spacing,
      radii: primitiveTokens.radius,
      typography: typeScale,
      elevation: primitiveTokens.elevation.light,
      motion: primitiveTokens.motion,
      toggleTheme: () => {},
      setMode: () => {},
    };
  }
  return context;
};

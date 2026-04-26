import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

const THEME_STORAGE_KEY = 'qulte-theme-preference';

export type ThemePreference = 'system' | 'dark' | 'light';
export type ThemeName = 'dark' | 'light';

export interface AppTheme {
  name: ThemeName;
  isDark: boolean;
  colors: {
    background: string;
    backgroundAlt: string;
    surface: string;
    surfaceStrong: string;
    text: string;
    textMuted: string;
    textSoft: string;
    border: string;
    accent: string;
    accentSoft: string;
    accentText: string;
    secondaryAccent: string;
    secondaryAccentText: string;
    ratingText: string;
    ratingBackground: string;
    danger: string;
    success: string;
  };
  gradients: {
    appBackground: readonly [string, string, string];
    profileCover: readonly [string, string, string];
  };
  rgba: {
    card: string;
    cardStrong: string;
    border: string;
    overlay: string;
    pinkGlow: string;
    blueGlow: string;
  };
  statusBarStyle: 'light' | 'dark';
}

const darkTheme: AppTheme = {
  name: 'dark',
  isDark: true,
  colors: {
    background: '#07070A',
    backgroundAlt: '#160818',
    surface: '#14101a',
    surfaceStrong: '#221426',
    text: '#ffffff',
    textMuted: '#94a3b8',
    textSoft: '#cbd5e1',
    border: 'rgba(255,255,255,0.08)',
    accent: '#ff6aa9',
    accentSoft: 'rgba(255,106,169,0.14)',
    accentText: '#190713',
    secondaryAccent: '#7dd3fc',
    secondaryAccentText: '#08111f',
    ratingText: '#fde68a',
    ratingBackground: 'rgba(251,191,36,0.14)',
    danger: '#fecaca',
    success: '#bbf7d0',
  },
  gradients: {
    appBackground: ['#07070A', '#180713', '#071421'],
    profileCover: ['#351022', '#160818', '#071421'],
  },
  rgba: {
    card: 'rgba(255,255,255,0.055)',
    cardStrong: 'rgba(255,255,255,0.09)',
    border: 'rgba(255,255,255,0.08)',
    overlay: 'rgba(0,0,0,0.74)',
    pinkGlow: 'rgba(249,168,212,0.18)',
    blueGlow: 'rgba(125,211,252,0.10)',
  },
  statusBarStyle: 'light',
};

const lightTheme: AppTheme = {
  name: 'light',
  isDark: false,
  colors: {
    background: '#fff8ef',
    backgroundAlt: '#fff0f5',
    surface: '#ffffff',
    surfaceStrong: '#ffeaf1',
    text: '#24111d',
    textMuted: '#7c5f6f',
    textSoft: '#4b2d3b',
    border: 'rgba(90,45,64,0.12)',
    accent: '#d81b72',
    accentSoft: 'rgba(216,27,114,0.11)',
    accentText: '#fff7ed',
    secondaryAccent: '#0284c7',
    secondaryAccentText: '#ffffff',
    ratingText: '#92400e',
    ratingBackground: 'rgba(217,119,6,0.14)',
    danger: '#b91c1c',
    success: '#047857',
  },
  gradients: {
    appBackground: ['#fff8ef', '#fff0f5', '#eaf7ff'],
    profileCover: ['#fff2f6', '#fff8ef', '#eaf7ff'],
  },
  rgba: {
    card: 'rgba(255,255,255,0.74)',
    cardStrong: 'rgba(255,255,255,0.92)',
    border: 'rgba(90,45,64,0.12)',
    overlay: 'rgba(36,17,29,0.72)',
    pinkGlow: 'rgba(219,39,119,0.14)',
    blueGlow: 'rgba(2,132,199,0.12)',
  },
  statusBarStyle: 'dark',
};

const themes: Record<ThemeName, AppTheme> = {
  dark: darkTheme,
  light: lightTheme,
};

interface ThemeContextValue {
  theme: AppTheme;
  themePreference: ThemePreference;
  resolvedThemeName: ThemeName;
  setThemePreference: (preference: ThemePreference) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function parseThemePreference(value: string | null): ThemePreference {
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value;
  }
  return 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    let active = true;

    void AsyncStorage.getItem(THEME_STORAGE_KEY).then((storedPreference) => {
      if (active) {
        setThemePreferenceState(parseThemePreference(storedPreference));
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const resolvedThemeName: ThemeName = themePreference === 'system'
    ? systemColorScheme === 'light'
      ? 'light'
      : 'dark'
    : themePreference;

  const setThemePreference = useCallback(async (preference: ThemePreference) => {
    setThemePreferenceState(preference);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, preference);
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({
    theme: themes[resolvedThemeName],
    themePreference,
    resolvedThemeName,
    setThemePreference,
  }), [resolvedThemeName, setThemePreference, themePreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme doit etre utilise dans ThemeProvider');
  }
  return context;
}

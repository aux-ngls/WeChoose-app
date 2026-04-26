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
    backgroundAlt: '#0d1724',
    surface: '#12151d',
    surfaceStrong: '#1d2430',
    text: '#ffffff',
    textMuted: '#94a3b8',
    textSoft: '#cbd5e1',
    border: 'rgba(255,255,255,0.08)',
    accent: '#c84a5f',
    accentSoft: 'rgba(200,74,95,0.16)',
    accentText: '#fff7ef',
    secondaryAccent: '#8ed3ff',
    secondaryAccentText: '#08111f',
    ratingText: '#fde68a',
    ratingBackground: 'rgba(251,191,36,0.14)',
    danger: '#fecaca',
    success: '#bbf7d0',
  },
  gradients: {
    appBackground: ['#07070A', '#101827', '#07070A'],
    profileCover: ['#1f2430', '#141822', '#34121c'],
  },
  rgba: {
    card: 'rgba(255,255,255,0.055)',
    cardStrong: 'rgba(255,255,255,0.09)',
    border: 'rgba(255,255,255,0.08)',
    overlay: 'rgba(0,0,0,0.74)',
    pinkGlow: 'rgba(200,74,95,0.13)',
    blueGlow: 'rgba(142,211,255,0.10)',
  },
  statusBarStyle: 'light',
};

const lightTheme: AppTheme = {
  name: 'light',
  isDark: false,
  colors: {
    background: '#fbf6ee',
    backgroundAlt: '#eef4f8',
    surface: '#ffffff',
    surfaceStrong: '#f4ede6',
    text: '#211a18',
    textMuted: '#74665f',
    textSoft: '#443936',
    border: 'rgba(51,40,36,0.13)',
    accent: '#9f2d3f',
    accentSoft: 'rgba(159,45,63,0.11)',
    accentText: '#fff8ef',
    secondaryAccent: '#1f6f9a',
    secondaryAccentText: '#ffffff',
    ratingText: '#92400e',
    ratingBackground: 'rgba(217,119,6,0.14)',
    danger: '#b91c1c',
    success: '#047857',
  },
  gradients: {
    appBackground: ['#fbf6ee', '#eef4f8', '#f8efe7'],
    profileCover: ['#f8efe7', '#eef4f8', '#fffaf5'],
  },
  rgba: {
    card: 'rgba(255,255,255,0.74)',
    cardStrong: 'rgba(255,255,255,0.92)',
    border: 'rgba(51,40,36,0.13)',
    overlay: 'rgba(36,17,29,0.72)',
    pinkGlow: 'rgba(159,45,63,0.10)',
    blueGlow: 'rgba(31,111,154,0.11)',
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

import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface ScreenHeaderProps {
  icon: keyof typeof Ionicons.glyphMap;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  accent?: 'pink' | 'blue' | 'amber' | 'violet' | 'emerald';
  trailing?: ReactNode;
}

const accentMap = {
  pink: {
    border: 'rgba(244,114,182,0.22)',
    background: 'rgba(244,114,182,0.12)',
    icon: '#f9a8d4',
  },
  blue: {
    border: 'rgba(56,189,248,0.22)',
    background: 'rgba(14,165,233,0.12)',
    icon: '#7dd3fc',
  },
  amber: {
    border: 'rgba(251,191,36,0.22)',
    background: 'rgba(245,158,11,0.12)',
    icon: '#fcd34d',
  },
  violet: {
    border: 'rgba(167,139,250,0.24)',
    background: 'rgba(139,92,246,0.12)',
    icon: '#c4b5fd',
  },
  emerald: {
    border: 'rgba(74,222,128,0.22)',
    background: 'rgba(34,197,94,0.12)',
    icon: '#86efac',
  },
} as const;

export default function ScreenHeader({
  icon,
  eyebrow,
  title,
  subtitle,
  accent = 'blue',
  trailing,
}: ScreenHeaderProps) {
  const accentTheme = accentMap[accent];
  const { theme } = useTheme();

  return (
    <View style={styles.wrapper}>
      <View style={styles.left}>
        <View style={[styles.iconWrap, { borderColor: accentTheme.border, backgroundColor: accentTheme.background }]}>
          <Ionicons name={icon} size={18} color={accentTheme.icon} />
        </View>
        <View style={styles.textBlock}>
          {eyebrow ? <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>{eyebrow}</Text> : null}
          <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text> : null}
        </View>
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  textBlock: {
    flex: 1,
    gap: 3,
  },
  eyebrow: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: 14,
    lineHeight: 21,
  },
  trailing: {
    alignSelf: 'center',
  },
});

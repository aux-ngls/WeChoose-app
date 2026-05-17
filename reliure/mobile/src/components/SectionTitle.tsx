import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface SectionTitleProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}

export default function SectionTitle({ eyebrow, title, subtitle }: SectionTitleProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.wrapper}>
      {eyebrow ? <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>{eyebrow}</Text> : null}
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 4,
  },
  eyebrow: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
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
});

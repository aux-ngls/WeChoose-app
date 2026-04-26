import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface EmptyStateCardProps {
  title: string;
  subtitle?: string;
}

export default function EmptyStateCard({ title, subtitle }: EmptyStateCardProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.card, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  title: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
});

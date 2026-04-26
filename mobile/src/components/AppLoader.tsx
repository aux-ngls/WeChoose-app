import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import AppScreen from './AppScreen';
import QulteMark from './QulteMark';
import { useTheme } from '../theme/ThemeContext';

export default function AppLoader({ label }: { label: string }) {
  const { theme } = useTheme();

  return (
    <AppScreen scroll={false} contentStyle={styles.content}>
      <View style={[styles.badge, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.cardStrong }]}>
        <QulteMark size={44} />
        <ActivityIndicator color={theme.colors.accent} />
        <Text style={[styles.label, { color: theme.colors.textSoft }]}>{label}</Text>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  label: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '600',
  },
});

import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import AppScreen from './AppScreen';

export default function AppLoader({ label }: { label: string }) {
  return (
    <AppScreen scroll={false} contentStyle={styles.content}>
      <View style={styles.badge}>
        <ActivityIndicator color="#ffffff" />
        <Text style={styles.label}>{label}</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 999,
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

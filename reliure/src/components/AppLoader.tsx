import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

export default function AppLoader() {
  return (
    <View style={styles.wrapper}>
      <View style={styles.mark}>
        <Text style={styles.markText}>R</Text>
      </View>
      <ActivityIndicator color={theme.colors.accent} />
      <Text style={styles.label}>Reliure</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    backgroundColor: theme.colors.background,
  },
  mark: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(69,208,139,0.32)',
    backgroundColor: 'rgba(69,208,139,0.13)',
  },
  markText: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '900',
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
});

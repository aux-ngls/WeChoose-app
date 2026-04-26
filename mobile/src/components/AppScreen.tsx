import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';

interface AppScreenProps {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}

export default function AppScreen({ children, scroll = true, contentStyle }: AppScreenProps) {
  const { theme } = useTheme();

  return (
    <LinearGradient
      colors={theme.gradients.appBackground}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.gradient, { backgroundColor: theme.colors.background }]}
    >
      <View pointerEvents="none" style={[styles.orbTop, { backgroundColor: theme.rgba.pinkGlow }]} />
      <View pointerEvents="none" style={[styles.orbBottom, { backgroundColor: theme.rgba.blueGlow }]} />
      <SafeAreaView style={styles.safeArea}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={[styles.content, contentStyle]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.content, styles.fill, contentStyle]}>{children}</View>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
    backgroundColor: '#07070A',
  },
  safeArea: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 26,
    gap: 18,
  },
  fill: {
    flex: 1,
  },
  orbTop: {
    position: 'absolute',
    top: -70,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: 'rgba(244,114,182,0.08)',
  },
  orbBottom: {
    position: 'absolute',
    left: -50,
    bottom: 110,
    width: 170,
    height: 170,
    borderRadius: 999,
    backgroundColor: 'rgba(56,189,248,0.06)',
  },
});

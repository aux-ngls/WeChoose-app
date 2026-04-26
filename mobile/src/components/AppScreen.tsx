import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';

interface AppScreenProps {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}

const RAIL_DOTS = Array.from({ length: 9 }, (_, index) => index);

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
      <View pointerEvents="none" style={styles.brandWatermark}>
        <Text
          style={[
            styles.brandGhost,
            { color: theme.isDark ? 'rgba(255,106,169,0.065)' : 'rgba(216,27,114,0.075)' },
          ]}
        >
          Q
        </Text>
      </View>
      <View
        pointerEvents="none"
        style={[
          styles.perfRail,
          { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.035)' : 'rgba(216,27,114,0.055)' },
        ]}
      >
        {RAIL_DOTS.map((dot) => (
          <View
            key={dot}
            style={[
              styles.perfDot,
              { backgroundColor: theme.isDark ? 'rgba(255,106,169,0.13)' : 'rgba(216,27,114,0.16)' },
            ]}
          />
        ))}
      </View>
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
    top: -86,
    right: -46,
    width: 210,
    height: 210,
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
  brandWatermark: {
    position: 'absolute',
    top: 44,
    right: -42,
  },
  brandGhost: {
    fontSize: 210,
    fontWeight: '900',
    letterSpacing: -22,
  },
  perfRail: {
    position: 'absolute',
    left: 12,
    top: 92,
    width: 10,
    borderRadius: 999,
    gap: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  perfDot: {
    width: 4,
    height: 4,
    borderRadius: 999,
  },
});

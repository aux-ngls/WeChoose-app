import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { theme } from '../theme';

interface AppScreenProps {
  children: ReactNode;
  scroll?: boolean;
  keyboardAware?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  safeAreaEdges?: readonly Edge[];
}

const DEFAULT_EDGES = ['top', 'right', 'left'] as const;

export default function AppScreen({
  children,
  scroll = true,
  keyboardAware = false,
  contentStyle,
  safeAreaEdges = DEFAULT_EDGES,
}: AppScreenProps) {
  const content = scroll ? (
    <ScrollView
      automaticallyAdjustKeyboardInsets={keyboardAware}
      contentContainerStyle={[styles.content, keyboardAware && styles.keyboardContent, contentStyle]}
      keyboardDismissMode={keyboardAware ? 'interactive' : 'on-drag'}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.fill, contentStyle]}>{children}</View>
  );

  return (
    <LinearGradient colors={theme.gradients.appBackground} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
      <SafeAreaView edges={safeAreaEdges} style={styles.fill}>
        {keyboardAware ? (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.fill}>
            {content}
          </KeyboardAvoidingView>
        ) : (
          content
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  fill: {
    flex: 1,
  },
  content: {
    gap: 18,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 28,
  },
  keyboardContent: {
    paddingBottom: 140,
  },
});

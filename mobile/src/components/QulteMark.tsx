import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface QulteMarkProps {
  size?: number;
  variant?: 'solid' | 'soft';
  style?: StyleProp<ViewStyle>;
}

export default function QulteMark({ size = 44, variant = 'solid', style }: QulteMarkProps) {
  const { theme } = useTheme();
  const isSolid = variant === 'solid';
  const foreground = isSolid ? theme.colors.accentText : theme.colors.accent;

  return (
    <View
      style={[
        styles.mark,
        {
          width: size,
          height: size,
          borderRadius: size * 0.36,
          borderColor: isSolid ? 'transparent' : theme.colors.accentSoft,
          backgroundColor: isSolid ? theme.colors.accent : theme.colors.accentSoft,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.letter,
          {
            color: foreground,
            fontSize: size * 0.52,
            lineHeight: size * 0.62,
          },
        ]}
      >
        Q
      </Text>
      <View
        style={[
          styles.tail,
          {
            right: size * 0.2,
            bottom: size * 0.2,
            width: size * 0.2,
            height: size * 0.075,
            borderRadius: size * 0.04,
            backgroundColor: foreground,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
  },
  letter: {
    fontWeight: '900',
    letterSpacing: -1.8,
  },
  tail: {
    position: 'absolute',
    transform: [{ rotate: '38deg' }],
  },
});

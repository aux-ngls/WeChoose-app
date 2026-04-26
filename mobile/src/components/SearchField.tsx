import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface SearchFieldProps extends TextInputProps {
  icon?: keyof typeof Ionicons.glyphMap;
}

export default function SearchField({ icon = 'search', ...props }: SearchFieldProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.wrapper, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
      <Ionicons name={icon} size={18} color={theme.colors.textMuted} />
      <TextInput
        {...props}
        placeholderTextColor={theme.colors.textMuted}
        style={[styles.input, { color: theme.colors.text }, props.style]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 14,
    paddingVertical: 2,
  },
  input: {
    flex: 1,
    color: '#ffffff',
    fontSize: 15,
    paddingVertical: 12,
  },
});

import { Ionicons } from '@expo/vector-icons';
import { forwardRef } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface SearchFieldProps extends TextInputProps {
  icon?: keyof typeof Ionicons.glyphMap;
}

const SearchField = forwardRef<TextInput, SearchFieldProps>(function SearchField({ icon = 'search', ...props }, ref) {
  const { theme } = useTheme();
  const canClear = typeof props.value === 'string' && props.value.length > 0 && typeof props.onChangeText === 'function';

  return (
    <View style={[styles.wrapper, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
      <Ionicons name={icon} size={18} color={theme.colors.textMuted} />
      <TextInput
        ref={ref}
        {...props}
        placeholderTextColor={theme.colors.textMuted}
        style={[styles.input, { color: theme.colors.text }, props.style]}
      />
      {canClear ? (
        <Pressable
          style={[styles.clearButton, { backgroundColor: theme.rgba.cardStrong }]}
          onPress={() => props.onChangeText?.('')}
          hitSlop={8}
        >
          <Ionicons name="close" size={14} color={theme.colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
});

export default SearchField;

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
  clearButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

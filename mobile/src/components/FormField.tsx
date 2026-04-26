import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface FormFieldProps extends TextInputProps {
  label: string;
}

export default function FormField({ label, ...props }: FormFieldProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: theme.colors.textSoft }]}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor={theme.colors.textMuted}
        style={[
          styles.input,
          {
            borderColor: theme.rgba.border,
            backgroundColor: theme.rgba.cardStrong,
            color: theme.colors.text,
          },
          props.style,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 8 },
  label: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    color: '#ffffff',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
});

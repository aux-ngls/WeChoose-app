import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

interface SearchFieldProps extends TextInputProps {
  icon?: keyof typeof Ionicons.glyphMap;
}

export default function SearchField({ icon = 'search', ...props }: SearchFieldProps) {
  return (
    <View style={styles.wrapper}>
      <Ionicons name={icon} size={18} color="#6b7280" />
      <TextInput
        {...props}
        placeholderTextColor="#6b7280"
        style={[styles.input, props.style]}
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

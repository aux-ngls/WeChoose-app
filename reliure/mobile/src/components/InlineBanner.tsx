import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface InlineBannerProps {
  message: string;
  tone?: 'error' | 'success' | 'info';
}

export default function InlineBanner({ message, tone = 'info' }: InlineBannerProps) {
  const { theme } = useTheme();
  const toneStyle = tone === 'error'
    ? { borderColor: 'rgba(251,113,133,0.30)', backgroundColor: theme.isDark ? 'rgba(239,68,68,0.10)' : 'rgba(254,226,226,0.90)', color: theme.isDark ? '#ffe4e6' : '#991b1b' }
    : tone === 'success'
      ? { borderColor: 'rgba(74,222,128,0.30)', backgroundColor: theme.isDark ? 'rgba(34,197,94,0.10)' : 'rgba(220,252,231,0.92)', color: theme.isDark ? '#dcfce7' : '#166534' }
      : { borderColor: 'rgba(125,211,252,0.30)', backgroundColor: theme.isDark ? 'rgba(14,165,233,0.10)' : 'rgba(224,242,254,0.92)', color: theme.isDark ? '#dbeafe' : '#075985' };

  return (
    <View style={[styles.banner, { borderColor: toneStyle.borderColor, backgroundColor: toneStyle.backgroundColor }]}>
      <Text style={[styles.label, { color: toneStyle.color }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  label: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
});

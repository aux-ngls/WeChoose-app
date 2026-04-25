import { StyleSheet, Text, View } from 'react-native';

interface InlineBannerProps {
  message: string;
  tone?: 'error' | 'success' | 'info';
}

export default function InlineBanner({ message, tone = 'info' }: InlineBannerProps) {
  return (
    <View style={[styles.banner, tone === 'error' ? styles.error : tone === 'success' ? styles.success : styles.info]}>
      <Text style={[styles.label, tone === 'error' ? styles.errorLabel : tone === 'success' ? styles.successLabel : styles.infoLabel]}>
        {message}
      </Text>
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
  info: {
    borderColor: 'rgba(125,211,252,0.24)',
    backgroundColor: 'rgba(14,165,233,0.10)',
  },
  success: {
    borderColor: 'rgba(74,222,128,0.22)',
    backgroundColor: 'rgba(34,197,94,0.10)',
  },
  error: {
    borderColor: 'rgba(251,113,133,0.22)',
    backgroundColor: 'rgba(239,68,68,0.10)',
  },
  label: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  infoLabel: {
    color: '#dbeafe',
  },
  successLabel: {
    color: '#dcfce7',
  },
  errorLabel: {
    color: '#ffe4e6',
  },
});

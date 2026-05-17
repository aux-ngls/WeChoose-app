import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

interface ScreenHeaderProps {
  icon: keyof typeof Ionicons.glyphMap;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
}

export default function ScreenHeader({ icon, eyebrow, title, subtitle, trailing }: ScreenHeaderProps) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.left}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={19} color={theme.colors.accent} />
        </View>
        <View style={styles.textBlock}>
          {eyebrow ? <Text style={styles.eyebrow} numberOfLines={1}>{eyebrow}</Text> : null}
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  iconWrap: {
    width: 43,
    height: 43,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(69,208,139,0.28)',
    backgroundColor: 'rgba(69,208,139,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  textBlock: {
    flex: 1,
    gap: 4,
  },
  eyebrow: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  title: {
    color: theme.colors.text,
    fontSize: 29,
    fontWeight: '900',
    letterSpacing: -0.8,
    lineHeight: 32,
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  trailing: {
    alignSelf: 'center',
  },
});

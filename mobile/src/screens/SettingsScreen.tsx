import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AppScreen from '../components/AppScreen';
import type { RootStackParamList } from '../navigation/types';
import { useTheme, type ThemePreference } from '../theme/ThemeContext';

const appearanceOptions: Array<{ value: ThemePreference; label: string; detail: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'system', label: 'Automatique', detail: 'Suit le reglage de ton iPhone.', icon: 'phone-portrait-outline' },
  { value: 'dark', label: 'Sombre', detail: 'Garde l ambiance cinema nocturne.', icon: 'moon-outline' },
  { value: 'light', label: 'Clair', detail: 'Base claire pour la future interface.', icon: 'sunny-outline' },
];

export default function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { theme, themePreference, resolvedThemeName, setThemePreference } = useTheme();
  const [savingThemePreference, setSavingThemePreference] = useState(false);

  const handleThemePreferenceChange = async (preference: ThemePreference) => {
    if (savingThemePreference || preference === themePreference) {
      return;
    }

    setSavingThemePreference(true);
    try {
      await setThemePreference(preference);
    } finally {
      setSavingThemePreference(false);
    }
  };

  return (
    <AppScreen>
      <Pressable style={[styles.backButton, { backgroundColor: theme.rgba.card }]} onPress={() => navigation.goBack()}>
        <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        <Text style={[styles.backLabel, { color: theme.colors.text }]}>Retour</Text>
      </Pressable>

      <View style={[styles.heroCard, { borderColor: theme.colors.accentSoft, backgroundColor: theme.colors.accentSoft }]}>
        <View style={[styles.heroIcon, { backgroundColor: theme.colors.accent }]}>
          <Ionicons name="settings-outline" size={22} color={theme.colors.accentText} />
        </View>
        <View style={styles.heroBody}>
          <Text style={[styles.heroTitle, { color: theme.colors.text }]}>Reglages</Text>
          <Text style={[styles.heroSubtitle, { color: theme.colors.textSoft }]}>Les preferences de l'app, sans encombrer ton profil.</Text>
        </View>
      </View>

      <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="color-palette-outline" size={18} color={theme.colors.accent} />
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Apparence</Text>
          </View>
          <Text style={[styles.currentBadge, { color: theme.colors.accent }]}>{resolvedThemeName === 'light' ? 'Clair' : 'Sombre'}</Text>
        </View>

        <View style={styles.optionsList}>
          {appearanceOptions.map((option) => {
            const isActive = themePreference === option.value;
            return (
              <Pressable
                key={option.value}
                style={[
                  styles.optionCard,
                  { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card },
                  isActive && { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentSoft },
                ]}
                onPress={() => void handleThemePreferenceChange(option.value)}
                disabled={savingThemePreference}
              >
                <View
                  style={[
                    styles.optionIcon,
                    { borderColor: theme.colors.accentSoft },
                    isActive && { backgroundColor: theme.colors.accent },
                  ]}
                >
                  <Ionicons name={option.icon} size={18} color={isActive ? theme.colors.accentText : theme.colors.accent} />
                </View>
                <View style={styles.optionBody}>
                  <Text style={[styles.optionTitle, { color: theme.colors.text }]}>{option.label}</Text>
                  <Text style={[styles.optionDetail, { color: theme.colors.textMuted }]}>{option.detail}</Text>
                </View>
                {isActive ? <Ionicons name="checkmark-circle" size={20} color={theme.colors.accent} /> : null}
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>
          Le choix est sauvegarde sur ce telephone et s applique aux ecrans principaux de l app.
        </Text>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  backLabel: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(249,168,212,0.20)',
    backgroundColor: 'rgba(249,168,212,0.10)',
    padding: 16,
  },
  heroIcon: {
    width: 50,
    height: 50,
    borderRadius: 18,
    backgroundColor: '#f9a8d4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '900',
  },
  heroSubtitle: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  sectionCard: {
    gap: 16,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  currentBadge: {
    color: '#f9a8d4',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  optionsList: {
    gap: 10,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 12,
  },
  optionCardActive: {
    borderColor: 'rgba(249,168,212,0.34)',
    backgroundColor: 'rgba(249,168,212,0.12)',
  },
  optionIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(249,168,212,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconActive: {
    backgroundColor: '#f9a8d4',
  },
  optionBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  optionTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  optionDetail: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  helperText: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
});

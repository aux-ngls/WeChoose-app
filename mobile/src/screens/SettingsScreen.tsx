import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError, resetTestUserData } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import AppScreen from '../components/AppScreen';
import InlineBanner from '../components/InlineBanner';
import type { RootStackParamList } from '../navigation/types';
import { registerForPushNotifications } from '../notifications/push';
import { useTheme, type ThemePreference } from '../theme/ThemeContext';

const appearanceOptions: Array<{ value: ThemePreference; label: string; detail: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'system', label: 'Automatique', detail: 'Suit le reglage de ton iPhone.', icon: 'phone-portrait-outline' },
  { value: 'dark', label: 'Sombre', detail: 'Garde l ambiance cinema nocturne.', icon: 'moon-outline' },
  { value: 'light', label: 'Clair', detail: 'Base claire pour la future interface.', icon: 'sunny-outline' },
];

type NotificationPermissionState = Notifications.PermissionStatus | 'loading';

function getAppVersionLabel() {
  return Constants.expoConfig?.version ?? '1.0.0';
}

async function clearRecommendationCaches(username: string) {
  const keys = await AsyncStorage.getAllKeys();
  const cacheKeys = keys.filter((key) => key.startsWith(`qulte:tinder-stack:${username}:`));
  if (cacheKeys.length > 0) {
    await AsyncStorage.multiRemove(cacheKeys);
  }
  return cacheKeys.length;
}

export default function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { session, refreshOnboardingState, reopenTutorial, signOut } = useAuth();
  const { theme, themePreference, resolvedThemeName, setThemePreference } = useTheme();
  const [savingThemePreference, setSavingThemePreference] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<NotificationPermissionState>('loading');
  const [updatingNotifications, setUpdatingNotifications] = useState(false);
  const [clearingRecommendationCache, setClearingRecommendationCache] = useState(false);
  const [resettingTestData, setResettingTestData] = useState(false);
  const [resetError, setResetError] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'error' | 'success' | 'info'; message: string } | null>(null);

  const isTestAccount = session?.username.trim().toLowerCase() === 'test';
  const appVersionLabel = useMemo(() => getAppVersionLabel(), []);

  useEffect(() => {
    if (!feedback) {
      return;
    }
    const timeout = setTimeout(() => setFeedback(null), 2600);
    return () => clearTimeout(timeout);
  }, [feedback]);

  const loadNotificationStatus = useCallback(async () => {
    const permissions = await Notifications.getPermissionsAsync();
    setNotificationStatus(permissions.status);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadNotificationStatus();
    }, [loadNotificationStatus]),
  );

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

  const clearTestLocalCaches = async () => {
    if (!session) {
      return;
    }
    await clearRecommendationCaches(session.username);
  };

  const notificationStateCopy = useMemo(() => {
    if (notificationStatus === 'granted') {
      return {
        title: 'Notifications actives',
        detail: 'Les messages et activites sociales peuvent arriver directement sur ce telephone.',
        action: 'Verifier la configuration',
        icon: 'notifications' as const,
      };
    }

    if (notificationStatus === 'denied') {
      return {
        title: 'Notifications bloquees',
        detail: 'Autorise-les dans les reglages du telephone pour recevoir les messages hors de l app.',
        action: 'Ouvrir les reglages du telephone',
        icon: 'notifications-off-outline' as const,
      };
    }

    if (notificationStatus === 'loading') {
      return {
        title: 'Notifications',
        detail: 'Verification des autorisations en cours.',
        action: 'Verifier',
        icon: 'notifications-outline' as const,
      };
    }

    return {
      title: 'Notifications desactivees',
      detail: 'Active-les pour recevoir les nouveaux messages et activites sociales.',
      action: 'Activer les notifications',
      icon: 'notifications-outline' as const,
    };
  }, [notificationStatus]);

  const handleNotificationAction = async () => {
    if (!session || updatingNotifications) {
      return;
    }

    setUpdatingNotifications(true);
    setFeedback(null);

    try {
      if (notificationStatus === 'denied') {
        await Linking.openSettings();
        setFeedback({
          tone: 'info',
          message: 'Ouvre les reglages du telephone puis reviens ici pour verifier les notifications.',
        });
        return;
      }

      await registerForPushNotifications(session.token);
      const permissions = await Notifications.getPermissionsAsync();
      setNotificationStatus(permissions.status);

      if (permissions.status === 'granted') {
        setFeedback({
          tone: 'success',
          message: 'Notifications actives sur ce telephone.',
        });
      } else {
        setFeedback({
          tone: 'info',
          message: 'Les notifications ne sont pas encore autorisees.',
        });
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await signOut();
        return;
      }
      setFeedback({
        tone: 'error',
        message: 'Impossible d actualiser les notifications.',
      });
    } finally {
      setUpdatingNotifications(false);
    }
  };

  const handleReplayTutorial = async () => {
    setFeedback(null);
    await reopenTutorial();
  };

  const handleClearRecommendationCache = async () => {
    if (!session || clearingRecommendationCache) {
      return;
    }

    setClearingRecommendationCache(true);
    setFeedback(null);

    try {
      const clearedKeys = await clearRecommendationCaches(session.username);
      setFeedback({
        tone: 'success',
        message: clearedKeys > 0 ? 'Cache des recommandations vide.' : 'Aucun cache de recommandations a vider.',
      });
    } catch {
      setFeedback({
        tone: 'error',
        message: 'Impossible de vider le cache des recommandations.',
      });
    } finally {
      setClearingRecommendationCache(false);
    }
  };

  const executeTestReset = async () => {
    if (!session || resettingTestData) {
      return;
    }

    setResettingTestData(true);
    setResetError('');

    try {
      await resetTestUserData(session.token);
      await clearTestLocalCaches();
      Alert.alert(
        'Compte test remis a zero',
        "Les donnees de test ont ete effacees. Tu vas repasser par l'onboarding.",
      );
      await refreshOnboardingState();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await signOut();
        return;
      }
      setResetError(error instanceof Error ? error.message : 'Impossible de reinitialiser le compte test.');
    } finally {
      setResettingTestData(false);
    }
  };

  const confirmTestReset = () => {
    Alert.alert(
      'Reinitialiser test ?',
      "Cela efface les notes, playlists, critiques, preferences IA, profil, follows et messages du compte test. Le compte reste utilisable.",
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Reinitialiser',
          style: 'destructive',
          onPress: () => void executeTestReset(),
        },
      ],
    );
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

      {feedback ? <InlineBanner message={feedback.message} tone={feedback.tone} /> : null}

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

      <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="notifications-outline" size={18} color={theme.colors.secondaryAccent} />
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Notifications</Text>
          </View>
          <Text style={[styles.currentBadge, { color: theme.colors.secondaryAccent }]}>
            {notificationStatus === 'granted' ? 'Actives' : notificationStatus === 'loading' ? '...' : 'Off'}
          </Text>
        </View>

        <Pressable
          style={[styles.optionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
          onPress={() => void handleNotificationAction()}
          disabled={updatingNotifications}
        >
          <View style={[styles.optionIcon, { borderColor: theme.colors.accentSoft }]}>
            <Ionicons name={notificationStateCopy.icon} size={18} color={theme.colors.secondaryAccent} />
          </View>
          <View style={styles.optionBody}>
            <Text style={[styles.optionTitle, { color: theme.colors.text }]}>{notificationStateCopy.title}</Text>
            <Text style={[styles.optionDetail, { color: theme.colors.textMuted }]}>{notificationStateCopy.detail}</Text>
            <Text style={[styles.inlineActionLabel, { color: theme.colors.secondaryAccent }]}>{notificationStateCopy.action}</Text>
          </View>
          {updatingNotifications ? (
            <ActivityIndicator color={theme.colors.secondaryAccent} />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
          )}
        </Pressable>
      </View>

      <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="sparkles-outline" size={18} color={theme.colors.accent} />
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Experience</Text>
          </View>
        </View>

        <View style={styles.optionsList}>
          <Pressable
            style={[styles.optionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
            onPress={() => void handleReplayTutorial()}
          >
            <View style={[styles.optionIcon, { borderColor: theme.colors.accentSoft }]}>
              <Ionicons name="play-circle-outline" size={18} color={theme.colors.accent} />
            </View>
            <View style={styles.optionBody}>
              <Text style={[styles.optionTitle, { color: theme.colors.text }]}>Revoir le tutoriel</Text>
              <Text style={[styles.optionDetail, { color: theme.colors.textMuted }]}>Relance la visite guidee de l app depuis le debut.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
          </Pressable>

          <Pressable
            style={[styles.optionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
            onPress={() => void handleClearRecommendationCache()}
            disabled={clearingRecommendationCache}
          >
            <View style={[styles.optionIcon, { borderColor: theme.colors.accentSoft }]}>
              <Ionicons name="refresh-circle-outline" size={18} color={theme.colors.accent} />
            </View>
            <View style={styles.optionBody}>
              <Text style={[styles.optionTitle, { color: theme.colors.text }]}>Vider le cache recos</Text>
              <Text style={[styles.optionDetail, { color: theme.colors.textMuted }]}>Force un rechargement plus propre des prochaines piles de recommandations.</Text>
            </View>
            {clearingRecommendationCache ? (
              <ActivityIndicator color={theme.colors.accent} />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
            )}
          </Pressable>
        </View>
      </View>

      <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="phone-portrait-outline" size={18} color={theme.colors.accent} />
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>App</Text>
          </View>
        </View>

        <View style={styles.infoList}>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.colors.textMuted }]}>Version</Text>
            <Text style={[styles.infoValue, { color: theme.colors.text }]}>{appVersionLabel}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.colors.textMuted }]}>Compte</Text>
            <Text style={[styles.infoValue, { color: theme.colors.text }]}>@{session?.username ?? '-'}</Text>
          </View>
        </View>
      </View>

      {isTestAccount ? (
        <View style={[styles.sectionCard, styles.dangerCard, { borderColor: theme.colors.danger, backgroundColor: theme.rgba.card }]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="flask-outline" size={18} color={theme.colors.danger} />
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Compte test</Text>
            </View>
          </View>

          {resetError ? <InlineBanner message={resetError} tone="error" /> : null}

          <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>
            Remet ce compte a zero pour retester l IA depuis un profil vierge.
          </Text>

          <Pressable
            style={[styles.labButton, { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentSoft }]}
            onPress={() => navigation.navigate('TestAiDashboard')}
          >
            <Ionicons name="analytics-outline" size={18} color={theme.colors.text} />
            <Text style={[styles.labButtonLabel, { color: theme.colors.text }]}>Ouvrir le labo IA</Text>
          </Pressable>

          <Pressable
            style={[styles.resetButton, { backgroundColor: '#dc2626' }]}
            onPress={confirmTestReset}
            disabled={resettingTestData}
          >
            {resettingTestData ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Ionicons name="refresh-circle-outline" size={20} color="#ffffff" />
                <Text style={styles.resetButtonLabel}>Reinitialiser les donnees</Text>
              </>
            )}
          </Pressable>
        </View>
      ) : null}
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
  inlineActionLabel: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '900',
  },
  helperText: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  infoList: {
    gap: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '900',
  },
  dangerCard: {
    marginTop: 4,
  },
  resetButton: {
    minHeight: 50,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
  },
  labButton: {
    minHeight: 48,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
  },
  labButtonLabel: {
    fontSize: 14,
    fontWeight: '900',
  },
  resetButtonLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
});

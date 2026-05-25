import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { API_URL } from '../api/config';
import {
  ApiError,
  deleteAccount,
  fetchBlockedUsers,
  fetchProfilePreferences,
  fetchRecoveryEmail,
  resetRecommendationProfile,
  resetTestUserData,
  saveRecoveryEmail,
  saveProfilePreferences,
  unblockUser,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';
import AppScreen from '../components/AppScreen';
import FormField from '../components/FormField';
import InlineBanner from '../components/InlineBanner';
import type { RootStackParamList } from '../navigation/types';
import { registerForPushNotifications } from '../notifications/push';
import { useTheme, type ThemePreference } from '../theme/ThemeContext';
import type { BlockedUser, ProfilePreferencesPayload } from '../types';
import { STREAMING_SERVICE_OPTIONS } from '../utils/streaming';

const appearanceOptions: Array<{ value: ThemePreference; label: string; detail: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'system', label: 'Automatique', detail: 'Suit le réglage de ton iPhone.', icon: 'phone-portrait-outline' },
  { value: 'dark', label: 'Sombre', detail: "Garde l'ambiance cinéma nocturne.", icon: 'moon-outline' },
  { value: 'light', label: 'Clair', detail: 'Base claire pour la future interface.', icon: 'sunny-outline' },
];

type NotificationPermissionState = Notifications.PermissionStatus | 'loading';

function getAppVersionLabel() {
  return Constants.expoConfig?.version ?? '1.0.0';
}

async function clearRecommendationCaches(username: string) {
  const keys = await AsyncStorage.getAllKeys();
  const cacheKeys = keys.filter((key) => {
    if (key.startsWith(`qulte:tinder-stack:${username}:`)) {
      return true;
    }
    if (!key.startsWith('qulte:persistent-cache:v1:')) {
      return false;
    }
    const segments = key.split(':');
    return segments[4] === username;
  });
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
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [loadingRecoveryEmail, setLoadingRecoveryEmail] = useState(false);
  const [savingRecoveryEmail, setSavingRecoveryEmail] = useState(false);
  const [profilePreferences, setProfilePreferences] = useState<ProfilePreferencesPayload | null>(null);
  const [loadingStreamingServices, setLoadingStreamingServices] = useState(false);
  const [savingStreamingServices, setSavingStreamingServices] = useState(false);
  const [ownedStreamingServices, setOwnedStreamingServices] = useState<string[]>([]);
  const [clearingRecommendationCache, setClearingRecommendationCache] = useState(false);
  const [resettingRecommendationProfile, setResettingRecommendationProfile] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loadingBlockedUsers, setLoadingBlockedUsers] = useState(false);
  const [updatingBlockedUserIds, setUpdatingBlockedUserIds] = useState<number[]>([]);
  const [deletingAccount, setDeletingAccount] = useState(false);
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

  const loadBlockedUsers = useCallback(async () => {
    if (!session) {
      setBlockedUsers([]);
      return;
    }

    setLoadingBlockedUsers(true);
    try {
      const payload = await fetchBlockedUsers(session.token);
      setBlockedUsers(payload);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await signOut();
        return;
      }
      setFeedback({
        tone: 'error',
        message: 'Impossible de charger les comptes bloqués.',
      });
    } finally {
      setLoadingBlockedUsers(false);
    }
  }, [session, signOut]);

  const loadProfilePreferences = useCallback(async () => {
    if (!session) {
      setProfilePreferences(null);
      setOwnedStreamingServices([]);
      return;
    }

    setLoadingStreamingServices(true);
    try {
      const payload = await fetchProfilePreferences(session.token);
      setProfilePreferences(payload);
      setOwnedStreamingServices(payload.owned_streaming_services ?? []);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await signOut();
        return;
      }
      setFeedback({
        tone: 'error',
        message: 'Impossible de charger tes plateformes streaming.',
      });
    } finally {
      setLoadingStreamingServices(false);
    }
  }, [session, signOut]);

  const loadRecoveryEmail = useCallback(async () => {
    if (!session) {
      setRecoveryEmail('');
      return;
    }

    setLoadingRecoveryEmail(true);
    try {
      const payload = await fetchRecoveryEmail(session.token);
      setRecoveryEmail(payload.email ?? '');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await signOut();
        return;
      }
      setFeedback({
        tone: 'error',
        message: "Impossible de charger l'e-mail de récupération.",
      });
    } finally {
      setLoadingRecoveryEmail(false);
    }
  }, [session, signOut]);

  useFocusEffect(
    useCallback(() => {
      void loadNotificationStatus();
      void loadBlockedUsers();
      void loadProfilePreferences();
      void loadRecoveryEmail();
    }, [loadBlockedUsers, loadNotificationStatus, loadProfilePreferences, loadRecoveryEmail]),
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

  const handleToggleStreamingService = async (service: string) => {
    if (!session || savingStreamingServices) {
      return;
    }

    const nextOwnedServices = ownedStreamingServices.includes(service)
      ? ownedStreamingServices.filter((item) => item !== service)
      : [...ownedStreamingServices, service];

    setSavingStreamingServices(true);
    setOwnedStreamingServices(nextOwnedServices);

    try {
      const nextPreferences = await saveProfilePreferences(session.token, {
        profile_description: profilePreferences?.profile_description ?? '',
        profile_genres: profilePreferences?.profile_genres ?? [],
        profile_people: profilePreferences?.profile_people ?? [],
        profile_movie_ids: profilePreferences?.profile_movie_ids ?? [],
        profile_soundtrack: profilePreferences?.profile_soundtrack ?? null,
        owned_streaming_services: nextOwnedServices,
      });
      setProfilePreferences(nextPreferences);
      setOwnedStreamingServices(nextPreferences.owned_streaming_services ?? []);
      setFeedback({
        tone: 'success',
        message: 'Plateformes streaming mises à jour.',
      });
    } catch (error) {
      setOwnedStreamingServices(profilePreferences?.owned_streaming_services ?? []);
      if (error instanceof ApiError && error.status === 401) {
        await signOut();
        return;
      }
      setFeedback({
        tone: 'error',
        message: 'Impossible de mettre à jour tes plateformes streaming.',
      });
    } finally {
      setSavingStreamingServices(false);
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
        detail: 'Les messages et activités sociales peuvent arriver directement sur ce téléphone.',
        action: 'Vérifier la configuration',
        icon: 'notifications' as const,
      };
    }

    if (notificationStatus === 'denied') {
      return {
        title: 'Notifications bloquées',
        detail: "Autorise-les dans les réglages du téléphone pour recevoir les messages hors de l'app.",
        action: 'Ouvrir les réglages du téléphone',
        icon: 'notifications-off-outline' as const,
      };
    }

    if (notificationStatus === 'loading') {
      return {
        title: 'Notifications',
        detail: 'Vérification des autorisations en cours.',
        action: 'Vérifier',
        icon: 'notifications-outline' as const,
      };
    }

    return {
      title: 'Notifications désactivées',
      detail: 'Active-les pour recevoir les nouveaux messages et activités sociales.',
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
          message: 'Ouvre les réglages du téléphone puis reviens ici pour vérifier les notifications.',
        });
        return;
      }

      await registerForPushNotifications(session.token);
      const permissions = await Notifications.getPermissionsAsync();
      setNotificationStatus(permissions.status);

      if (permissions.status === 'granted') {
        setFeedback({
          tone: 'success',
          message: 'Notifications actives sur ce téléphone.',
        });
      } else {
        setFeedback({
          tone: 'info',
          message: 'Les notifications ne sont pas encore autorisées.',
        });
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await signOut();
        return;
      }
      setFeedback({
        tone: 'error',
        message: "Impossible d'actualiser les notifications.",
      });
    } finally {
      setUpdatingNotifications(false);
    }
  };

  const handleReplayTutorial = async () => {
    setFeedback(null);
    await reopenTutorial();
  };

  const handleSaveRecoveryEmail = async () => {
    if (!session || savingRecoveryEmail) {
      return;
    }

    setSavingRecoveryEmail(true);
    setFeedback(null);
    try {
      const payload = await saveRecoveryEmail(session.token, recoveryEmail.trim());
      setRecoveryEmail(payload.email ?? '');
      setFeedback({
        tone: 'success',
        message: payload.email ? "E-mail de récupération mis à jour." : "E-mail de récupération supprimé.",
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await signOut();
        return;
      }
      setFeedback({
        tone: 'error',
        message: error instanceof ApiError ? error.message : "Impossible d'enregistrer l'e-mail de récupération.",
      });
    } finally {
      setSavingRecoveryEmail(false);
    }
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
        message: clearedKeys > 0 ? 'Cache des recommandations vidé.' : 'Aucun cache de recommandations à vider.',
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

  const executeRecommendationReset = async () => {
    if (!session || resettingRecommendationProfile) {
      return;
    }

    setResettingRecommendationProfile(true);
    setFeedback(null);

    try {
      await resetRecommendationProfile(session.token);
      await clearRecommendationCaches(session.username);
      Alert.alert(
        'IA des recos réinitialisée',
        "Tes signaux de recommandation ont été effacés. Tu vas repasser par l'onboarding pour recalibrer les recos.",
        [
          {
            text: 'Continuer',
            onPress: () => {
              void refreshOnboardingState();
            },
          },
        ],
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await signOut();
        return;
      }
      setFeedback({
        tone: 'error',
        message: "Impossible de réinitialiser l'IA des recommandations.",
      });
    } finally {
      setResettingRecommendationProfile(false);
    }
  };

  const confirmRecommendationReset = () => {
    Alert.alert(
      "Réinitialiser l'IA des recos ?",
      "Cela efface tes goûts d'onboarding, tes passes tinder, tes notes et ta liste À regarder plus tard pour repartir de zéro. Tes critiques, messages et le reste du compte restent intacts.",
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Réinitialiser',
          style: 'destructive',
          onPress: () => void executeRecommendationReset(),
        },
      ],
    );
  };

  const openSupportPage = async () => {
    await Linking.openURL(`${API_URL}/support`);
  };

  const openPrivacyPage = async () => {
    await Linking.openURL(`${API_URL}/privacy`);
  };

  const handleUnblockUser = async (targetUserId: number) => {
    if (!session || updatingBlockedUserIds.includes(targetUserId)) {
      return;
    }

    setUpdatingBlockedUserIds((current) => [...current, targetUserId]);
    try {
      await unblockUser(session.token, targetUserId);
      setBlockedUsers((current) => current.filter((user) => user.id !== targetUserId));
      setFeedback({
        tone: 'success',
        message: 'Compte débloqué.',
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await signOut();
        return;
      }
      setFeedback({
        tone: 'error',
        message: 'Impossible de débloquer ce compte.',
      });
    } finally {
      setUpdatingBlockedUserIds((current) => current.filter((id) => id !== targetUserId));
    }
  };

  const executeDeleteAccount = async () => {
    if (!session || deletingAccount) {
      return;
    }

    setDeletingAccount(true);
    try {
      await deleteAccount(session.token);
      await signOut();
      Alert.alert('Compte supprimé', 'Ton compte et ses données ont été supprimés.');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await signOut();
        return;
      }
      setFeedback({
        tone: 'error',
        message: 'Impossible de supprimer le compte pour le moment.',
      });
    } finally {
      setDeletingAccount(false);
    }
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Supprimer le compte ?',
      'Cette action est définitive. Tes notes, playlists, critiques, messages, profil et préférences seront supprimés.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => void executeDeleteAccount(),
        },
      ],
    );
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
        'Compte test remis à zéro',
        "Les données de test ont été effacées. Tu vas repasser par l'onboarding.",
      );
      await refreshOnboardingState();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await signOut();
        return;
      }
      setResetError(error instanceof Error ? error.message : 'Impossible de réinitialiser le compte test.');
    } finally {
      setResettingTestData(false);
    }
  };

  const confirmTestReset = () => {
    Alert.alert(
      'Réinitialiser test ?',
      'Cela efface les notes, playlists, critiques, préférences IA, profil, follows et messages du compte test. Le compte reste utilisable.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Réinitialiser',
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
          <Text style={[styles.heroTitle, { color: theme.colors.text }]}>Réglages</Text>
          <Text style={[styles.heroSubtitle, { color: theme.colors.textSoft }]}>Les préférences de l'app, sans encombrer ton profil.</Text>
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
          Le choix est sauvegardé sur ce téléphone et s'applique aux écrans principaux de l'app.
        </Text>
      </View>

      <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="mail-outline" size={18} color={theme.colors.secondaryAccent} />
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Compte</Text>
          </View>
        </View>

        {loadingRecoveryEmail ? (
          <View style={styles.inlineLoaderRow}>
            <ActivityIndicator color={theme.colors.text} />
            <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>Chargement de ton e-mail de récupération...</Text>
          </View>
        ) : (
          <View style={styles.accountForm}>
            <FormField
              label="E-mail de récupération"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={recoveryEmail}
              onChangeText={setRecoveryEmail}
              placeholder="toi@exemple.com"
            />
            <Pressable
              style={[styles.saveInlineButton, { backgroundColor: theme.colors.secondaryAccent }]}
              onPress={() => void handleSaveRecoveryEmail()}
              disabled={savingRecoveryEmail}
            >
              {savingRecoveryEmail ? (
                <ActivityIndicator color={theme.colors.secondaryAccentText} />
              ) : (
                <Text style={[styles.saveInlineButtonLabel, { color: theme.colors.secondaryAccentText }]}>Enregistrer l'e-mail</Text>
              )}
            </Pressable>
            <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>
              Sert à recevoir un code si tu oublies ton mot de passe.
            </Text>
          </View>
        )}
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
            <Ionicons name="tv-outline" size={18} color={theme.colors.accent} />
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Streaming</Text>
          </View>
          <Text style={[styles.currentBadge, { color: theme.colors.accent }]}>
            {ownedStreamingServices.length > 0 ? `${ownedStreamingServices.length}` : 'Aucune'}
          </Text>
        </View>

        {loadingStreamingServices ? (
          <View style={styles.inlineLoaderRow}>
            <ActivityIndicator color={theme.colors.text} />
            <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>Chargement de tes plateformes...</Text>
          </View>
        ) : (
          <>
            <View style={styles.streamingChipsRow}>
              {STREAMING_SERVICE_OPTIONS.map((service) => {
                const isActive = ownedStreamingServices.includes(service);
                return (
                  <Pressable
                    key={service}
                    style={[
                      styles.streamingChip,
                      { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card },
                      isActive && { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentSoft },
                    ]}
                    onPress={() => void handleToggleStreamingService(service)}
                    disabled={savingStreamingServices}
                  >
                    <Text
                      style={[
                        styles.streamingChipLabel,
                        { color: theme.colors.textSoft },
                        isActive && { color: theme.colors.text },
                      ]}
                    >
                      {service}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>
              Sert à filtrer la playlist À regarder plus tard selon les plateformes que tu as déjà.
            </Text>
          </>
        )}
      </View>

      <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="sparkles-outline" size={18} color={theme.colors.accent} />
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Expérience</Text>
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
              <Text style={[styles.optionDetail, { color: theme.colors.textMuted }]}>Relance la visite guidée de l'app depuis le début.</Text>
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

          <Pressable
            style={[styles.optionCard, { borderColor: theme.colors.danger, backgroundColor: theme.rgba.card }]}
            onPress={confirmRecommendationReset}
            disabled={resettingRecommendationProfile}
          >
            <View style={[styles.optionIcon, { borderColor: theme.colors.danger }]}>
              <Ionicons name="sparkles-outline" size={18} color={theme.colors.danger} />
            </View>
            <View style={styles.optionBody}>
              <Text style={[styles.optionTitle, { color: theme.colors.text }]}>Réinitialiser l'IA des recos</Text>
              <Text style={[styles.optionDetail, { color: theme.colors.textMuted }]}>
                Repars de zéro pour les recommandations en vidant les signaux utilisés par l'algorithme.
              </Text>
            </View>
            {resettingRecommendationProfile ? (
              <ActivityIndicator color={theme.colors.danger} />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
            )}
          </Pressable>
        </View>
      </View>

      <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="shield-checkmark-outline" size={18} color={theme.colors.secondaryAccent} />
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Sécurité</Text>
          </View>
        </View>

        <View style={styles.optionsList}>
          {loadingBlockedUsers ? (
            <View style={styles.inlineLoaderRow}>
              <ActivityIndicator color={theme.colors.text} />
              <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>Chargement des comptes bloqués...</Text>
            </View>
          ) : blockedUsers.length > 0 ? (
            blockedUsers.map((blockedUser) => {
              const isUpdating = updatingBlockedUserIds.includes(blockedUser.id);
              return (
                <View
                  key={blockedUser.id}
                  style={[styles.optionCard, styles.blockedRow, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
                >
                  <View style={[styles.optionIcon, { borderColor: theme.colors.accentSoft }]}>
                    <Ionicons name="ban-outline" size={18} color={theme.colors.secondaryAccent} />
                  </View>
                  <View style={styles.optionBody}>
                    <Text style={[styles.optionTitle, { color: theme.colors.text }]}>@{blockedUser.username}</Text>
                    <Text style={[styles.optionDetail, { color: theme.colors.textMuted }]}>Compte masqué dans le social et les messages.</Text>
                  </View>
                  <Pressable
                    style={[styles.unblockButton, { borderColor: theme.colors.secondaryAccent }]}
                    onPress={() => void handleUnblockUser(blockedUser.id)}
                    disabled={isUpdating}
                  >
                    {isUpdating ? (
                      <ActivityIndicator size="small" color={theme.colors.secondaryAccent} />
                    ) : (
                      <Text style={[styles.unblockButtonLabel, { color: theme.colors.secondaryAccent }]}>Débloquer</Text>
                    )}
                  </Pressable>
                </View>
              );
            })
          ) : (
            <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>Aucun compte bloqué pour le moment.</Text>
          )}
        </View>
      </View>

      <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="document-text-outline" size={18} color={theme.colors.accent} />
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Confidentialité</Text>
          </View>
        </View>

        <View style={styles.optionsList}>
          <Pressable
            style={[styles.optionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
            onPress={() => void openSupportPage()}
          >
            <View style={[styles.optionIcon, { borderColor: theme.colors.accentSoft }]}>
              <Ionicons name="help-buoy-outline" size={18} color={theme.colors.accent} />
            </View>
            <View style={styles.optionBody}>
              <Text style={[styles.optionTitle, { color: theme.colors.text }]}>Support</Text>
              <Text style={[styles.optionDetail, { color: theme.colors.textMuted }]}>Ouvre la page d'aide publique de Qulte.</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={theme.colors.textMuted} />
          </Pressable>

          <Pressable
            style={[styles.optionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
            onPress={() => void openPrivacyPage()}
          >
            <View style={[styles.optionIcon, { borderColor: theme.colors.accentSoft }]}>
              <Ionicons name="lock-closed-outline" size={18} color={theme.colors.accent} />
            </View>
            <View style={styles.optionBody}>
              <Text style={[styles.optionTitle, { color: theme.colors.text }]}>Politique de confidentialité</Text>
              <Text style={[styles.optionDetail, { color: theme.colors.textMuted }]}>Consulte les données utilisées par l'app et tes droits.</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={theme.colors.textMuted} />
          </Pressable>

          <Pressable
            style={[styles.optionCard, { borderColor: theme.colors.danger, backgroundColor: theme.rgba.card }]}
            onPress={confirmDeleteAccount}
            disabled={deletingAccount}
          >
            <View style={[styles.optionIcon, { borderColor: theme.colors.danger }]}>
              <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
            </View>
            <View style={styles.optionBody}>
              <Text style={[styles.optionTitle, { color: theme.colors.text }]}>Supprimer mon compte</Text>
              <Text style={[styles.optionDetail, { color: theme.colors.textMuted }]}>Lance la suppression définitive de ton compte depuis l'app.</Text>
            </View>
            {deletingAccount ? (
              <ActivityIndicator color={theme.colors.danger} />
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
            Remet ce compte à zéro pour retester l'IA depuis un profil vierge.
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
                <Text style={styles.resetButtonLabel}>Réinitialiser les données</Text>
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
  accountForm: {
    gap: 12,
  },
  inlineLoaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  blockedRow: {
    alignItems: 'center',
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
  saveInlineButton: {
    alignItems: 'center',
    borderRadius: 18,
    paddingVertical: 13,
  },
  saveInlineButtonLabel: {
    fontSize: 14,
    fontWeight: '800',
  },
  unblockButton: {
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  unblockButtonLabel: {
    fontSize: 12,
    fontWeight: '900',
  },
  helperText: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  streamingChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  streamingChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  streamingChipLabel: {
    fontSize: 12,
    fontWeight: '800',
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

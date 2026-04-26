import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { API_URL } from '../api/config';
import { ApiError, fetchSocialProfile, followUser, startConversation, unfollowUser } from '../api/client';
import AppScreen from '../components/AppScreen';
import EmptyStateCard from '../components/EmptyStateCard';
import InlineBanner from '../components/InlineBanner';
import MoviePosterTile from '../components/MoviePosterTile';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeContext';
import { FALLBACK_POSTER, type SocialProfile } from '../types';
import { formatDate } from '../utils/format';

function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return `${API_URL}${url.startsWith('/') ? url : `/${url}`}`;
}

export default function UserProfileScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'UserProfile'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { session, signOut } = useAuth();
  const { theme } = useTheme();
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  const loadProfile = useCallback(async () => {
    if (!session) {
      return;
    }

    try {
      const payload = await fetchSocialProfile(session.token, route.params.username);
      setProfile(payload);
      setError('');
    } catch (fetchError) {
      if (fetchError instanceof ApiError && fetchError.status === 401) {
        await signOut();
        return;
      }
      setError('Impossible de charger ce profil.');
    } finally {
      setLoading(false);
    }
  }, [route.params.username, session, signOut]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadProfile();
    }, [loadProfile]),
  );

  const toggleFollow = async () => {
    if (!session || !profile || profile.is_self || actionLoading) {
      return;
    }

    setActionLoading(true);
    try {
      if (profile.is_following) {
        await unfollowUser(session.token, profile.id);
        setProfile((current) => current ? { ...current, is_following: false, followers_count: Math.max(0, current.followers_count - 1) } : current);
      } else {
        await followUser(session.token, profile.id);
        setProfile((current) => current ? { ...current, is_following: true, followers_count: current.followers_count + 1 } : current);
      }
      setError('');
    } catch (followError) {
      if (followError instanceof ApiError && followError.status === 401) {
        await signOut();
        return;
      }
      setError("Impossible d'actualiser l'abonnement.");
    } finally {
      setActionLoading(false);
    }
  };

  const openConversation = async () => {
    if (!session || !profile || profile.is_self || actionLoading) {
      return;
    }

    setActionLoading(true);
    try {
      const conversation = await startConversation(session.token, profile.id);
      navigation.navigate('Conversation', {
        conversationId: conversation.id,
        participantId: profile.id,
        participantUsername: profile.username,
      });
    } catch (messageError) {
      if (messageError instanceof ApiError && messageError.status === 401) {
        await signOut();
        return;
      }
      setError('Impossible de lancer la conversation.');
    } finally {
      setActionLoading(false);
    }
  };

  const avatarUrl = resolveMediaUrl(profile?.avatar_url);
  const description = profile?.profile_description?.trim();

  return (
    <AppScreen>
      <Pressable style={[styles.backButton, { backgroundColor: theme.rgba.card }]} onPress={() => navigation.goBack()}>
        <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        <Text style={[styles.backLabel, { color: theme.colors.text }]}>Retour</Text>
      </Pressable>

      {error ? <InlineBanner message={error} tone="error" /> : null}
      {loading ? <ActivityIndicator color={theme.colors.text} /> : null}

      {!loading && !profile ? (
        <EmptyStateCard title="Profil introuvable" subtitle="Cet utilisateur n'existe peut-etre plus." />
      ) : null}

      {profile ? (
        <>
          <View style={[styles.heroCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.cardStrong }]}>
            <View style={[styles.heroGlow, { backgroundColor: theme.rgba.pinkGlow }]} />
            <View style={styles.identityRow}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatarFallback, { backgroundColor: theme.colors.accentSoft }]}>
                  <Text style={[styles.avatarInitial, { color: theme.colors.accent }]}>{profile.username.slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.identityBody}>
                <Text style={[styles.username, { color: theme.colors.text }]} numberOfLines={1}>@{profile.username}</Text>
                <Text style={[styles.description, { color: theme.colors.textSoft }]} numberOfLines={4}>
                  {description || 'Aucune description pour le moment.'}
                </Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={[styles.statPill, { backgroundColor: theme.rgba.card }]}>
                <Text style={[styles.statValue, { color: theme.colors.text }]}>{profile.reviews_count}</Text>
                <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>critiques</Text>
              </View>
              <View style={[styles.statPill, { backgroundColor: theme.rgba.card }]}>
                <Text style={[styles.statValue, { color: theme.colors.text }]}>{profile.followers_count}</Text>
                <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>abonnes</Text>
              </View>
              <View style={[styles.statPill, { backgroundColor: theme.rgba.card }]}>
                <Text style={[styles.statValue, { color: theme.colors.text }]}>{profile.following_count}</Text>
                <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>suit</Text>
              </View>
            </View>

            {!profile.is_self ? (
              <View style={styles.actionsRow}>
                <Pressable
                  style={[styles.primaryAction, { backgroundColor: theme.colors.accent }, profile.is_following && [styles.secondaryAction, { borderColor: theme.colors.accentSoft, backgroundColor: theme.colors.accentSoft }]]}
                  onPress={() => void toggleFollow()}
                  disabled={actionLoading}
                >
                  <Ionicons name={profile.is_following ? 'checkmark' : 'person-add-outline'} size={17} color={profile.is_following ? theme.colors.accent : theme.colors.accentText} />
                  <Text style={[styles.primaryActionLabel, { color: theme.colors.accentText }, profile.is_following && [styles.secondaryActionLabel, { color: theme.colors.accent }]]}>
                    {profile.is_following ? 'Abonne' : 'Suivre'}
                  </Text>
                </Pressable>
                <Pressable style={[styles.messageAction, { borderColor: theme.colors.secondaryAccent, backgroundColor: theme.rgba.card }]} onPress={() => void openConversation()} disabled={actionLoading}>
                  <Ionicons name="chatbubble-ellipses-outline" size={17} color={theme.colors.secondaryAccent} />
                  <Text style={[styles.messageActionLabel, { color: theme.colors.secondaryAccent }]}>Message</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          {profile.profile_movies.length > 0 ? (
            <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Films totems</Text>
              <View style={styles.posterGrid}>
                {profile.profile_movies.slice(0, 6).map((movie) => (
                  <View key={movie.id} style={styles.posterCell}>
                    <MoviePosterTile movie={movie} onPress={() => navigation.navigate('MovieDetails', { movieId: movie.id, title: movie.title })} />
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {profile.profile_people.length > 0 ? (
            <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Personnes clefs</Text>
              <FlatList
                data={profile.profile_people}
                horizontal
                keyExtractor={(item) => `${item.id ?? item.name}-${item.name}`}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 12 }}
                renderItem={({ item }) => (
                  <View style={[styles.personCard, { backgroundColor: theme.rgba.cardStrong }]}>
                    <Image source={{ uri: item.photo_url || FALLBACK_POSTER }} style={styles.personImage} />
                    <View style={styles.personOverlay}>
                      <Text style={styles.personName} numberOfLines={2}>{item.name}</Text>
                    </View>
                  </View>
                )}
              />
            </View>
          ) : null}

          <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Critiques</Text>
            {profile.reviews.length > 0 ? (
              <View style={styles.reviewsList}>
                {profile.reviews.map((review) => (
                  <Pressable
                    key={review.id}
                    style={[styles.reviewCard, { backgroundColor: theme.rgba.cardStrong }]}
                    onPress={() => navigation.navigate('MovieDetails', { movieId: review.movie_id, title: review.title })}
                  >
                    <Image source={{ uri: review.poster_url || FALLBACK_POSTER }} style={styles.reviewPoster} />
                    <View style={styles.reviewBody}>
                      <Text style={[styles.reviewTitle, { color: theme.colors.text }]} numberOfLines={1}>{review.title}</Text>
                      <Text style={[styles.reviewMeta, { color: theme.colors.ratingText }]}>{review.rating.toFixed(1)} / 5 · {formatDate(review.created_at)}</Text>
                      <Text style={[styles.reviewContent, { color: theme.colors.textSoft }]} numberOfLines={3}>{review.content}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : (
              <EmptyStateCard title="Aucune critique" subtitle="Ses critiques apparaitront ici." />
            )}
          </View>
        </>
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
    gap: 16,
    overflow: 'hidden',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: '#140917',
    padding: 18,
  },
  heroGlow: {
    position: 'absolute',
    width: 180,
    height: 180,
    right: -60,
    top: -70,
    borderRadius: 999,
    backgroundColor: 'rgba(249,168,212,0.22)',
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  avatarFallback: {
    width: 96,
    height: 96,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(249,168,212,0.18)',
  },
  avatarInitial: {
    color: '#ffffff',
    fontSize: 38,
    fontWeight: '900',
  },
  identityBody: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  username: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '900',
  },
  description: {
    color: '#fce7f3',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statPill: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: 10,
    paddingVertical: 11,
  },
  statValue: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  statLabel: {
    marginTop: 3,
    color: '#cbd5e1',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 18,
    backgroundColor: '#f9a8d4',
    paddingVertical: 13,
  },
  primaryActionLabel: {
    color: '#190713',
    fontSize: 13,
    fontWeight: '900',
  },
  secondaryAction: {
    borderWidth: 1,
    borderColor: 'rgba(249,168,212,0.26)',
    backgroundColor: 'rgba(249,168,212,0.10)',
  },
  secondaryActionLabel: {
    color: '#f9a8d4',
  },
  messageAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.24)',
    backgroundColor: 'rgba(14,165,233,0.10)',
    paddingVertical: 13,
  },
  messageActionLabel: {
    color: '#7dd3fc',
    fontSize: 13,
    fontWeight: '900',
  },
  sectionCard: {
    gap: 14,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 16,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  posterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  posterCell: {
    width: '31.2%',
  },
  personCard: {
    width: 92,
    aspectRatio: 2 / 3,
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  personImage: {
    width: '100%',
    height: '100%',
  },
  personOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.72)',
    padding: 8,
  },
  personName: {
    color: '#ffffff',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
  },
  reviewsList: {
    gap: 12,
  },
  reviewCard: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 12,
  },
  reviewPoster: {
    width: 54,
    height: 78,
    borderRadius: 14,
  },
  reviewBody: {
    flex: 1,
    minWidth: 0,
    gap: 7,
  },
  reviewTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  reviewMeta: {
    color: '#fde68a',
    fontSize: 11,
    fontWeight: '800',
  },
  reviewContent: {
    color: '#e5e7eb',
    fontSize: 13,
    lineHeight: 18,
  },
});

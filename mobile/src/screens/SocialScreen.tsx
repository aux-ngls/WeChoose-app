import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, DeviceEventEmitter, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AppScreen from '../components/AppScreen';
import EmptyStateCard from '../components/EmptyStateCard';
import InlineBanner from '../components/InlineBanner';
import MovieQuickAddModal from '../components/MovieQuickAddModal';
import ScreenHeader from '../components/ScreenHeader';
import {
  ApiError,
  fetchSocialFeed,
  reportReview,
  toggleReviewLike,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeContext';
import { FALLBACK_POSTER, type SocialReview } from '../types';
import { REPORT_REASONS, type ReportReason } from '../utils/reporting';
import { formatDate } from '../utils/format';
import { SOCIAL_REFRESH_EVENT } from '../utils/events';
import { buildUserCacheKey, readPersistentCache, writePersistentCache } from '../utils/persistentCache';

interface SocialCache {
  username: string;
  reviews: SocialReview[];
}

let socialCache: SocialCache | null = null;
const PERSISTED_SOCIAL_SCOPE = 'social-screen';
const MAX_PERSISTED_REVIEWS = 30;

export default function SocialScreen() {
  const { session, signOut } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const initialCache = socialCache?.username === session?.username ? socialCache : null;
  const persistentCacheKey = useMemo(
    () => buildUserCacheKey(PERSISTED_SOCIAL_SCOPE, session?.username),
    [session?.username],
  );
  const [reviews, setReviews] = useState<SocialReview[]>(() => initialCache?.reviews ?? []);
  const [loading, setLoading] = useState(() => !initialCache);
  const [likingReviewIds, setLikingReviewIds] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [quickAddMovie, setQuickAddMovie] = useState<{ id: number; title: string } | null>(null);
  const reviewsRef = useRef(reviews);

  useEffect(() => {
    reviewsRef.current = reviews;
  }, [reviews]);

  useEffect(() => {
    if (!session) {
      return;
    }

    let active = true;
    void (async () => {
      const cachedReviews = await readPersistentCache<SocialReview[]>(persistentCacheKey);
      if (!active || !cachedReviews || cachedReviews.length === 0) {
        return;
      }

      socialCache = {
        username: session.username,
        reviews: cachedReviews,
      };
      setReviews((current) => (current.length > 0 ? current : cachedReviews));
      setLoading((current) => (reviewsRef.current.length > 0 ? current : false));
    })();

    return () => {
      active = false;
    };
  }, [persistentCacheKey, session]);

  useEffect(() => {
    if (!session || reviews.length === 0) {
      return;
    }

    void writePersistentCache(
      persistentCacheKey,
      reviews.slice(0, MAX_PERSISTED_REVIEWS),
    );
  }, [persistentCacheKey, reviews, session]);

  useEffect(() => {
    if (!feedback) {
      return;
    }
    const timeout = setTimeout(() => setFeedback(''), 2400);
    return () => clearTimeout(timeout);
  }, [feedback]);

  const updateSocialCache = useCallback((next: Partial<Omit<SocialCache, 'username'>>) => {
    if (!session) {
      return;
    }

    socialCache = {
      username: session.username,
      reviews: next.reviews ?? reviewsRef.current,
    };
  }, [session]);

  const loadFeed = useCallback(async () => {
    if (!session) {
      return;
    }

    if (reviewsRef.current.length === 0) {
      setLoading(true);
    }

    try {
      const payload = await fetchSocialFeed(session.token);
      updateSocialCache({ reviews: payload });
      setReviews(payload);
      setError('');
    } catch (fetchError) {
      if (fetchError instanceof ApiError && fetchError.status === 401) {
        await signOut();
        return;
      }
      if (reviewsRef.current.length === 0) {
        setError('Impossible de charger le feed social.');
      }
    } finally {
      setLoading(false);
    }
  }, [session, signOut, updateSocialCache]);

  const refreshSocial = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadFeed();
    } finally {
      setRefreshing(false);
    }
  }, [loadFeed]);

  useFocusEffect(
    useCallback(() => {
      void loadFeed();
    }, [loadFeed]),
  );

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(SOCIAL_REFRESH_EVENT, () => {
      void loadFeed();
    });
    return () => subscription.remove();
  }, [loadFeed]);

  const handleToggleLike = useCallback(async (reviewId: number) => {
    if (!session || likingReviewIds.includes(reviewId)) {
      return;
    }

    setLikingReviewIds((current) => [...current, reviewId]);
    try {
      const payload = await toggleReviewLike(session.token, reviewId);
      setReviews((current) => {
        const nextReviews = current.map((review) =>
          review.id === reviewId
            ? { ...review, liked_by_me: payload.liked, likes_count: payload.likes_count }
            : review,
        );
        updateSocialCache({ reviews: nextReviews });
        return nextReviews;
      });
      setError('');
    } catch (likeError) {
      if (likeError instanceof ApiError && likeError.status === 401) {
        await signOut();
        return;
      }
      setError("Impossible d'actualiser le like.");
    } finally {
      setLikingReviewIds((current) => current.filter((id) => id !== reviewId));
    }
  }, [likingReviewIds, session, signOut, updateSocialCache]);

  const handleReportReview = useCallback(async (review: SocialReview, reason: ReportReason) => {
    if (!session || review.author.username === session.username) {
      return;
    }

    try {
      await reportReview(session.token, review.id, { reason });
      setFeedback('Merci, la critique a été signalée.');
    } catch (reportError) {
      if (reportError instanceof ApiError && reportError.status === 401) {
        await signOut();
        return;
      }
      setError('Impossible de signaler cette critique.');
    }
  }, [session, signOut]);

  const presentReviewReportPicker = useCallback((review: SocialReview) => {
    Alert.alert(
      'Signaler la critique',
      'Choisis une raison.',
      [
        ...REPORT_REASONS.map((reason) => ({
          text: reason.label,
          onPress: () => void handleReportReview(review, reason.value),
        })),
        { text: 'Annuler', style: 'cancel' as const },
      ],
    );
  }, [handleReportReview]);

  return (
    <AppScreen keyboardAware refreshing={refreshing} onRefresh={() => void refreshSocial()}>
      <ScreenHeader
        icon="people"
        accent="violet"
        title="Social"
      />

      {error ? <InlineBanner message={error} tone="error" /> : null}
      {feedback ? <InlineBanner message={feedback} tone="success" /> : null}

      <Pressable style={[styles.composeButton, { backgroundColor: theme.colors.accent }]} onPress={() => navigation.navigate('CreateReview')}>
        <View style={styles.composeButtonIcon}>
          <Ionicons name="create-outline" size={18} color={theme.colors.accentText} />
        </View>
        <View style={styles.composeButtonBody}>
          <Text style={[styles.composeButtonTitle, { color: theme.colors.accentText }]}>Nouvelle critique</Text>
          <Text style={[styles.composeButtonSubtitle, { color: theme.colors.accentText }]}>Ton avis, ton cercle.</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.accentText} />
      </Pressable>

      {loading && reviews.length === 0 ? <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>Chargement du feed...</Text> : null}

      {!loading && reviews.length === 0 ? (
        <EmptyStateCard title="Aucune critique" />
      ) : (
        <View style={styles.feedList}>
          {reviews.map((item) => (
            <Pressable
              key={item.id}
              style={[styles.reviewCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
              onPress={() => navigation.navigate('ReviewDetails', { reviewId: item.id })}
            >
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  navigation.navigate('MovieDetails', { movieId: item.movie_id, title: item.title });
                }}
                onLongPress={() => setQuickAddMovie({ id: item.movie_id, title: item.title })}
                delayLongPress={220}
              >
                <Image source={{ uri: item.poster_url || FALLBACK_POSTER }} style={styles.poster} />
              </Pressable>
              <View style={styles.reviewBody}>
                <View style={styles.reviewHeader}>
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <Text style={[styles.reviewTitle, { color: theme.colors.text }]}>{item.title}</Text>
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        navigation.navigate('UserProfile', { username: item.author.username });
                      }}
                    >
                      <Text style={[styles.reviewMeta, { color: theme.colors.textMuted }]}>@{item.author.username} · {formatDate(item.created_at)}</Text>
                    </Pressable>
                  </View>
                  {item.author.username !== session?.username ? (
                    <Pressable
                      style={[styles.reviewMenuButton, { backgroundColor: theme.rgba.cardStrong }]}
                      onPress={(event) => {
                        event.stopPropagation();
                        presentReviewReportPicker(item);
                      }}
                    >
                      <Ionicons name="ellipsis-horizontal" size={16} color={theme.colors.textMuted} />
                    </Pressable>
                  ) : null}
                </View>
                <View style={styles.inlinePills}>
                  <View style={[styles.ratingPill, { backgroundColor: theme.colors.ratingBackground }]}>
                    <Text style={[styles.ratingPillLabel, { color: theme.colors.ratingText }]}>{item.rating.toFixed(1)} / 5</Text>
                  </View>
                  <Pressable
                    style={[styles.likeButton, item.liked_by_me && { backgroundColor: theme.colors.accentSoft }]}
                    onPress={(event) => {
                      event.stopPropagation();
                      void handleToggleLike(item.id);
                    }}
                    disabled={likingReviewIds.includes(item.id)}
                  >
                    <Ionicons
                      name={item.liked_by_me ? 'heart' : 'heart-outline'}
                      size={14}
                      color={item.liked_by_me ? theme.colors.accent : theme.colors.textSoft}
                    />
                    <Text style={[styles.inlineMeta, { color: item.liked_by_me ? theme.colors.accent : theme.colors.textSoft }]}>{item.likes_count}</Text>
                  </Pressable>
                  <Text style={[styles.inlineMeta, { color: theme.colors.textSoft }]}>{item.comments_count} commentaires</Text>
                </View>
                <Text style={[styles.reviewContent, { color: theme.colors.textSoft }]} numberOfLines={4}>
                  {item.content}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
      <MovieQuickAddModal
        movie={quickAddMovie}
        onClose={() => setQuickAddMovie(null)}
        onAdded={(playlistName) => setFeedback(`Ajouté à ${playlistName}.`)}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  composeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 24,
    backgroundColor: '#f9a8d4',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  composeButtonIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: 'rgba(25,7,19,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  composeButtonBody: {
    flex: 1,
    gap: 2,
  },
  composeButtonTitle: {
    color: '#190713',
    fontSize: 15,
    fontWeight: '900',
  },
  composeButtonSubtitle: {
    color: 'rgba(25,7,19,0.70)',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  helperText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  feedList: {
    gap: 14,
  },
  reviewCard: {
    flexDirection: 'row',
    gap: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 12,
  },
  poster: {
    width: 80,
    height: 118,
    borderRadius: 18,
  },
  reviewBody: {
    flex: 1,
    gap: 8,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  reviewTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  reviewMeta: {
    color: '#94a3b8',
    fontSize: 12,
  },
  reviewMenuButton: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlinePills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  ratingPill: {
    borderRadius: 999,
    backgroundColor: 'rgba(251,191,36,0.14)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  ratingPillLabel: {
    color: '#fde68a',
    fontSize: 12,
    fontWeight: '800',
  },
  inlineMeta: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '700',
  },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  reviewContent: {
    color: '#e5e7eb',
    fontSize: 14,
    lineHeight: 21,
  },
  expandedArea: {
    gap: 12,
    paddingTop: 4,
  },
  commentsBox: {
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 12,
  },
  commentsTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  commentRow: {
    gap: 3,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 10,
  },
  commentAuthor: {
    color: '#f9a8d4',
    fontSize: 12,
    fontWeight: '800',
  },
  commentText: {
    color: '#e5e7eb',
    fontSize: 13,
    lineHeight: 19,
  },
  noComments: {
    color: '#94a3b8',
    fontSize: 12,
  },
  commentComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  commentInput: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  commentSendButton: {
    width: 40,
    height: 40,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

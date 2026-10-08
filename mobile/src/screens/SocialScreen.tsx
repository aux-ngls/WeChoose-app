import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, DeviceEventEmitter, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AppScreen from '../components/AppScreen';
import CachedPoster, { prefetchPosterUrls } from '../components/CachedPoster';
import EmptyStateCard from '../components/EmptyStateCard';
import InlineBanner from '../components/InlineBanner';
import MovieQuickAddModal, { type QuickAddMovieTarget } from '../components/MovieQuickAddModal';
import ScreenHeader from '../components/ScreenHeader';
import {
  ApiError,
  fetchSocialFeed,
  fetchSocialRankings,
  preloadMediaDetails,
  reportReview,
  toggleReviewLike,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeContext';
import { type SocialRankingsPayload, type SocialReview } from '../types';
import { REPORT_REASONS, type ReportReason } from '../utils/reporting';
import { formatDate } from '../utils/format';
import { SOCIAL_REFRESH_EVENT } from '../utils/events';
import { buildUserCacheKey, readPersistentCache, writePersistentCache } from '../utils/persistentCache';

interface SocialCache {
  username: string;
  feeds: Record<FeedScope, SocialReview[]>;
  rankings: SocialRankingsPayload | null;
}

type FeedScope = 'friends' | 'public';
type SocialSection = FeedScope | 'rankings';

let socialCache: SocialCache | null = null;
const PERSISTED_SOCIAL_SCOPE = 'social-screen';
const MAX_PERSISTED_REVIEWS = 30;
const EMPTY_FEEDS: Record<FeedScope, SocialReview[]> = { friends: [], public: [] };
const SOCIAL_SECTIONS: Array<{ value: SocialSection; label: string }> = [
  { value: 'friends', label: 'Amis' },
  { value: 'public', label: 'Public' },
  { value: 'rankings', label: 'Classements' },
];

export default function SocialScreen() {
  const { session, signOut } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const initialCache = socialCache?.username === session?.username ? socialCache : null;
  const [activeSection, setActiveSection] = useState<SocialSection>('friends');
  const activeFeed: FeedScope = activeSection === 'public' ? 'public' : 'friends';
  const persistentCacheKey = useMemo(
    () => buildUserCacheKey(`${PERSISTED_SOCIAL_SCOPE}:${activeFeed}`, session?.username),
    [activeFeed, session?.username],
  );
  const [feeds, setFeeds] = useState<Record<FeedScope, SocialReview[]>>(
    () => initialCache?.feeds ?? EMPTY_FEEDS,
  );
  const [rankings, setRankings] = useState<SocialRankingsPayload | null>(
    () => initialCache?.rankings ?? null,
  );
  const reviews = feeds[activeFeed];
  const [loadingFeeds, setLoadingFeeds] = useState<FeedScope[]>(
    () => initialCache?.feeds.friends.length ? [] : ['friends'],
  );
  const [loadingRankings, setLoadingRankings] = useState(false);
  const [likingReviewIds, setLikingReviewIds] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [quickAddMovie, setQuickAddMovie] = useState<QuickAddMovieTarget | null>(null);
  const feedsRef = useRef(feeds);
  const rankingsRef = useRef(rankings);

  useEffect(() => {
    feedsRef.current = feeds;
    if (activeSection === 'rankings') {
      const rankingItems = rankings?.sections.flatMap((section) => section.items) ?? [];
      void prefetchPosterUrls(rankingItems.map((item) => item.poster_url), 24);
      if (session) {
        preloadMediaDetails(session.token, rankingItems.slice(0, 8).map((item) => ({
          id: item.movie_id,
          media_type: item.media_type,
          title: item.title,
          poster_url: item.poster_url,
          rating: item.average_rating,
        })));
      }
      return;
    }

    void prefetchPosterUrls(reviews.map((review) => review.poster_url), 18);
    if (session) {
      preloadMediaDetails(session.token, reviews.slice(0, 8).map((review) => ({
        id: review.movie_id,
        media_type: review.media_type ?? 'movie',
        title: review.title,
        poster_url: review.poster_url,
        rating: review.rating,
      })));
    }
  }, [activeSection, feeds, rankings, reviews, session]);

  const commitFeeds = useCallback((updater: (current: Record<FeedScope, SocialReview[]>) => Record<FeedScope, SocialReview[]>) => {
    setFeeds((current) => {
      const nextFeeds = updater(current);
      feedsRef.current = nextFeeds;
      if (session) {
        socialCache = { username: session.username, feeds: nextFeeds, rankings: rankingsRef.current };
      }
      return nextFeeds;
    });
  }, [session]);

  const commitRankings = useCallback((payload: SocialRankingsPayload) => {
    rankingsRef.current = payload;
    setRankings(payload);
    if (session) {
      socialCache = { username: session.username, feeds: feedsRef.current, rankings: payload };
    }
  }, [session]);

  useEffect(() => {
    if (!session || activeSection === 'rankings') {
      return;
    }

    let active = true;
    void (async () => {
      const cachedReviews = await readPersistentCache<SocialReview[]>(persistentCacheKey);
      if (!active || !cachedReviews || cachedReviews.length === 0) {
        return;
      }

      commitFeeds((current) => current[activeFeed].length > 0
        ? current
        : { ...current, [activeFeed]: cachedReviews });
      setLoadingFeeds((current) => current.filter((scope) => scope !== activeFeed));
    })();

    return () => {
      active = false;
    };
  }, [activeFeed, activeSection, commitFeeds, persistentCacheKey, session]);

  useEffect(() => {
    if (!session || activeSection === 'rankings' || reviews.length === 0) {
      return;
    }

    void writePersistentCache(
      persistentCacheKey,
      reviews.slice(0, MAX_PERSISTED_REVIEWS),
    );
  }, [activeSection, persistentCacheKey, reviews, session]);

  useEffect(() => {
    if (!feedback) {
      return;
    }
    const timeout = setTimeout(() => setFeedback(''), 2400);
    return () => clearTimeout(timeout);
  }, [feedback]);

  const loadFeed = useCallback(async (scope: FeedScope) => {
    if (!session) {
      return;
    }

    if (feedsRef.current[scope].length === 0) {
      setLoadingFeeds((current) => current.includes(scope) ? current : [...current, scope]);
    }

    try {
      const payload = await fetchSocialFeed(session.token, scope);
      commitFeeds((current) => ({ ...current, [scope]: payload }));
      setError('');
    } catch (fetchError) {
      if (fetchError instanceof ApiError && fetchError.status === 401) {
        await signOut();
        return;
      }
      if (feedsRef.current[scope].length === 0) {
        setError('Impossible de charger le feed social.');
      }
    } finally {
      setLoadingFeeds((current) => current.filter((item) => item !== scope));
    }
  }, [commitFeeds, session, signOut]);

  const loadRankings = useCallback(async () => {
    if (!session) {
      return;
    }

    if (!rankingsRef.current) {
      setLoadingRankings(true);
    }
    try {
      const payload = await fetchSocialRankings(session.token);
      commitRankings(payload);
      setError('');
    } catch (fetchError) {
      if (fetchError instanceof ApiError && fetchError.status === 401) {
        await signOut();
        return;
      }
      if (!rankingsRef.current) {
        setError('Impossible de charger les classements.');
      }
    } finally {
      setLoadingRankings(false);
    }
  }, [commitRankings, session, signOut]);

  const refreshSocial = useCallback(async () => {
    setRefreshing(true);
    try {
      if (activeSection === 'rankings') {
        await loadRankings();
      } else {
        await loadFeed(activeFeed);
      }
    } finally {
      setRefreshing(false);
    }
  }, [activeFeed, activeSection, loadFeed, loadRankings]);

  useFocusEffect(
    useCallback(() => {
      if (activeSection === 'rankings') {
        void loadRankings();
      } else {
        void loadFeed(activeFeed);
      }
    }, [activeFeed, activeSection, loadFeed, loadRankings]),
  );

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(SOCIAL_REFRESH_EVENT, () => {
      if (activeSection === 'rankings') {
        void loadRankings();
      } else {
        void loadFeed(activeFeed);
      }
    });
    return () => subscription.remove();
  }, [activeFeed, activeSection, loadFeed, loadRankings]);

  const handleToggleLike = useCallback(async (reviewId: number) => {
    if (!session || likingReviewIds.includes(reviewId)) {
      return;
    }

    setLikingReviewIds((current) => [...current, reviewId]);
    try {
      const payload = await toggleReviewLike(session.token, reviewId);
      commitFeeds((current) => ({
        friends: current.friends.map((review) =>
          review.id === reviewId
            ? { ...review, liked_by_me: payload.liked, likes_count: payload.likes_count }
            : review,
        ),
        public: current.public.map((review) =>
          review.id === reviewId
            ? { ...review, liked_by_me: payload.liked, likes_count: payload.likes_count }
            : review,
        ),
      }));
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
  }, [commitFeeds, likingReviewIds, session, signOut]);

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

  const visibleRankingSections = rankings?.sections.filter((section) => section.items.length > 0) ?? [];
  const loadingFeed = loadingFeeds.includes(activeFeed);

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

      <View style={[styles.feedTabs, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
        {SOCIAL_SECTIONS.map((tab) => {
          const isActive = activeSection === tab.value;
          return (
            <Pressable
              key={tab.value}
              style={[
                styles.feedTab,
                isActive && { backgroundColor: theme.colors.accent },
              ]}
              onPress={() => {
                setError('');
                if (tab.value === 'rankings') {
                  if (!rankingsRef.current) {
                    setLoadingRankings(true);
                  }
                } else {
                  const feedScope: FeedScope = tab.value;
                  if (feedsRef.current[feedScope].length === 0) {
                    setLoadingFeeds((current) => current.includes(feedScope) ? current : [...current, feedScope]);
                  }
                }
                setActiveSection(tab.value);
              }}
            >
              <Text style={[styles.feedTabLabel, { color: isActive ? theme.colors.accentText : theme.colors.textMuted }]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.feedDescription, { color: theme.colors.textMuted }]}>
        {activeSection === 'friends'
          ? 'Les critiques des personnes que tu suis.'
          : activeSection === 'public'
            ? 'Des critiques publiques populaires ou proches de tes goûts.'
            : 'Les films et séries qui font vivre la communauté Qulte.'}
      </Text>

      {activeSection === 'rankings' ? (
        <>
          {loadingRankings && visibleRankingSections.length === 0 ? (
            <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>Calcul des classements...</Text>
          ) : null}
          {!loadingRankings && visibleRankingSections.length === 0 ? (
            <EmptyStateCard title="Pas encore assez d'activité pour établir les classements" />
          ) : null}
          {visibleRankingSections.length > 0 ? (
            <View style={styles.rankingSections}>
              {visibleRankingSections.map((section) => (
                <View key={section.key} style={styles.rankingSection}>
                  <View style={styles.rankingSectionHeader}>
                    <Text style={[styles.rankingSectionTitle, { color: theme.colors.text }]}>{section.title}</Text>
                    <Text style={[styles.rankingSectionSubtitle, { color: theme.colors.textMuted }]}>{section.subtitle}</Text>
                  </View>
                  <ScrollView
                    horizontal
                    nestedScrollEnabled
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.rankingRow}
                  >
                    {section.items.map((item) => (
                      <Pressable
                        key={`${section.key}:${item.media_type}:${item.movie_id}`}
                        style={styles.rankingCard}
                        onPress={() => navigation.navigate('MovieDetails', {
                          movieId: item.movie_id,
                          mediaType: item.media_type,
                          title: item.title,
                        })}
                        onLongPress={(event) => setQuickAddMovie({
                          id: item.movie_id,
                          media_type: item.media_type,
                          title: item.title,
                          anchorX: event.nativeEvent.pageX,
                          anchorY: event.nativeEvent.pageY,
                        })}
                        delayLongPress={220}
                      >
                        <View style={[styles.rankingPosterFrame, { backgroundColor: theme.rgba.card, borderColor: theme.rgba.border }]}>
                          <CachedPoster uri={item.poster_url} style={styles.rankingPoster} size="w342" />
                          <View style={[styles.rankBadge, { backgroundColor: theme.colors.accent }]}>
                            <Text style={[styles.rankBadgeText, { color: theme.colors.accentText }]}>#{item.rank}</Text>
                          </View>
                          <View style={styles.mediaTypeBadge}>
                            <Text style={styles.mediaTypeBadgeText}>{item.media_type === 'tv' ? 'Série' : 'Film'}</Text>
                          </View>
                        </View>
                        <Text style={[styles.rankingTitle, { color: theme.colors.text }]} numberOfLines={2}>{item.title}</Text>
                        <Text style={[styles.rankingMetric, { color: theme.colors.textMuted }]} numberOfLines={2}>{item.metric_label}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <>
          {loadingFeed && reviews.length === 0 ? (
            <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>Chargement du feed...</Text>
          ) : null}
          {!loadingFeed && reviews.length === 0 ? (
            <EmptyStateCard title={activeFeed === 'friends' ? 'Aucune critique de tes amis' : 'Aucune critique publique'} />
          ) : null}
          {reviews.length > 0 ? (
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
                  navigation.navigate('MovieDetails', {
                    movieId: item.movie_id,
                    mediaType: item.media_type ?? 'movie',
                    title: item.title,
                  });
                }}
                onLongPress={(event) => setQuickAddMovie({
                  id: item.movie_id,
                  media_type: item.media_type ?? 'movie',
                  title: item.title,
                  anchorX: event.nativeEvent.pageX,
                  anchorY: event.nativeEvent.pageY,
                })}
                delayLongPress={220}
              >
                <CachedPoster uri={item.poster_url} style={styles.poster} />
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
                {activeSection === 'public' && item.discovery_label ? (
                  <View style={[styles.discoveryPill, { backgroundColor: theme.colors.accentSoft }]}>
                    <Ionicons
                      name={item.discovery_reason === 'popular' ? 'flame-outline' : 'sparkles-outline'}
                      size={12}
                      color={theme.colors.accent}
                    />
                    <Text style={[styles.discoveryPillText, { color: theme.colors.accent }]}>{item.discovery_label}</Text>
                  </View>
                ) : null}
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
          ) : null}
        </>
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
  feedTabs: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 14,
    padding: 3,
  },
  feedTab: {
    flex: 1,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    paddingHorizontal: 5,
  },
  feedTabLabel: {
    fontSize: 12,
    fontWeight: '900',
  },
  feedDescription: {
    marginTop: -3,
    paddingHorizontal: 4,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
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
  rankingSections: {
    gap: 28,
  },
  rankingSection: {
    gap: 12,
  },
  rankingSectionHeader: {
    gap: 3,
  },
  rankingSectionTitle: {
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  rankingSectionSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  rankingRow: {
    gap: 12,
    paddingRight: 10,
  },
  rankingCard: {
    width: 124,
    gap: 6,
  },
  rankingPosterFrame: {
    width: 124,
    height: 186,
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 18,
  },
  rankingPoster: {
    width: '100%',
    height: '100%',
  },
  rankBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    minWidth: 33,
    height: 27,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingHorizontal: 7,
  },
  rankBadgeText: {
    fontSize: 12,
    fontWeight: '900',
  },
  mediaTypeBadge: {
    position: 'absolute',
    right: 7,
    bottom: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(4,5,9,0.78)',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  mediaTypeBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  rankingTitle: {
    minHeight: 36,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
  },
  rankingMetric: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
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
  discoveryPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  discoveryPillText: {
    fontSize: 10,
    fontWeight: '900',
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

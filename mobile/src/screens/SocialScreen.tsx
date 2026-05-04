import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, DeviceEventEmitter, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AppScreen from '../components/AppScreen';
import EmptyStateCard from '../components/EmptyStateCard';
import InlineBanner from '../components/InlineBanner';
import ScreenHeader from '../components/ScreenHeader';
import {
  ApiError,
  createReviewComment,
  fetchReviewComments,
  fetchSocialFeed,
  fetchSocialNotifications,
  markSocialNotificationsRead,
  toggleReviewLike,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeContext';
import { FALLBACK_POSTER, type SocialComment, type SocialNotification, type SocialReview } from '../types';
import { formatDate } from '../utils/format';
import { SOCIAL_REFRESH_EVENT } from '../utils/events';

interface SocialCache {
  username: string;
  reviews: SocialReview[];
  notifications: SocialNotification[];
  unreadNotifications: number;
}

let socialCache: SocialCache | null = null;

export default function SocialScreen() {
  const { session, signOut } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const initialCache = socialCache?.username === session?.username ? socialCache : null;
  const [reviews, setReviews] = useState<SocialReview[]>(() => initialCache?.reviews ?? []);
  const [notifications, setNotifications] = useState<SocialNotification[]>(() => initialCache?.notifications ?? []);
  const [unreadNotifications, setUnreadNotifications] = useState(() => initialCache?.unreadNotifications ?? 0);
  const [loading, setLoading] = useState(() => !initialCache);
  const [expandedReviewId, setExpandedReviewId] = useState<number | null>(null);
  const [commentsByReview, setCommentsByReview] = useState<Record<number, SocialComment[]>>({});
  const [loadingComments, setLoadingComments] = useState<Record<number, boolean>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [submittingCommentIds, setSubmittingCommentIds] = useState<number[]>([]);
  const [likingReviewIds, setLikingReviewIds] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const reviewsRef = useRef(reviews);
  const notificationsRef = useRef(notifications);
  const unreadNotificationsRef = useRef(unreadNotifications);

  useEffect(() => {
    reviewsRef.current = reviews;
  }, [reviews]);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  useEffect(() => {
    unreadNotificationsRef.current = unreadNotifications;
  }, [unreadNotifications]);

  const updateSocialCache = useCallback((next: Partial<Omit<SocialCache, 'username'>>) => {
    if (!session) {
      return;
    }

    socialCache = {
      username: session.username,
      reviews: next.reviews ?? reviewsRef.current,
      notifications: next.notifications ?? notificationsRef.current,
      unreadNotifications: next.unreadNotifications ?? unreadNotificationsRef.current,
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
      setError('Impossible de charger le feed social.');
    } finally {
      setLoading(false);
    }
  }, [session, signOut, updateSocialCache]);

  const loadNotifications = useCallback(async () => {
    if (!session) {
      return;
    }

    try {
      const payload = await fetchSocialNotifications(session.token);
      updateSocialCache({
        notifications: payload.items,
        unreadNotifications: payload.unread_count,
      });
      setNotifications(payload.items);
      setUnreadNotifications(payload.unread_count);
    } catch (notificationError) {
      if (notificationError instanceof ApiError && notificationError.status === 401) {
        await signOut();
      }
    }
  }, [session, signOut, updateSocialCache]);

  const refreshSocial = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadFeed(), loadNotifications()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadFeed, loadNotifications]);

  useFocusEffect(
    useCallback(() => {
      void loadFeed();
      void loadNotifications();
    }, [loadFeed, loadNotifications]),
  );

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(SOCIAL_REFRESH_EVENT, () => {
      void loadFeed();
      void loadNotifications();
    });
    return () => subscription.remove();
  }, [loadFeed, loadNotifications]);

  const stats = useMemo(() => ({
    reviews: reviews.length,
    liked: reviews.filter((review) => review.liked_by_me).length,
  }), [reviews]);

  const toggleReview = useCallback(async (reviewId: number) => {
    if (!session) {
      return;
    }

    if (expandedReviewId === reviewId) {
      setExpandedReviewId(null);
      return;
    }

    setExpandedReviewId(reviewId);
    if (commentsByReview[reviewId]) {
      return;
    }

    setLoadingComments((current) => ({ ...current, [reviewId]: true }));
    try {
      const payload = await fetchReviewComments(session.token, reviewId);
      setCommentsByReview((current) => ({ ...current, [reviewId]: payload }));
      setError('');
    } catch (commentsError) {
      if (commentsError instanceof ApiError && commentsError.status === 401) {
        await signOut();
        return;
      }
      setError('Impossible de charger les commentaires.');
    } finally {
      setLoadingComments((current) => ({ ...current, [reviewId]: false }));
    }
  }, [commentsByReview, expandedReviewId, session, signOut]);

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

  const handleSubmitComment = useCallback(async (reviewId: number) => {
    if (!session || submittingCommentIds.includes(reviewId)) {
      return;
    }

    const content = (commentDrafts[reviewId] ?? '').trim();
    if (content.length < 2) {
      return;
    }

    setSubmittingCommentIds((current) => [...current, reviewId]);
    try {
      const createdComment = await createReviewComment(session.token, reviewId, content);
      setCommentsByReview((current) => ({
        ...current,
        [reviewId]: [...(current[reviewId] ?? []), createdComment],
      }));
      setCommentDrafts((current) => ({ ...current, [reviewId]: '' }));
      setReviews((current) => {
        const nextReviews = current.map((review) =>
          review.id === reviewId
            ? { ...review, comments_count: review.comments_count + 1 }
            : review,
        );
        updateSocialCache({ reviews: nextReviews });
        return nextReviews;
      });
      setError('');
    } catch (commentError) {
      if (commentError instanceof ApiError && commentError.status === 401) {
        await signOut();
        return;
      }
      setError("Impossible d'ajouter le commentaire.");
    } finally {
      setSubmittingCommentIds((current) => current.filter((id) => id !== reviewId));
    }
  }, [commentDrafts, session, signOut, submittingCommentIds, updateSocialCache]);

  const handleMarkNotificationsRead = useCallback(async () => {
    if (!session) {
      return;
    }

    try {
      await markSocialNotificationsRead(session.token);
      updateSocialCache({ notifications: [], unreadNotifications: 0 });
      setNotifications([]);
      setUnreadNotifications(0);
    } catch (notificationError) {
      if (notificationError instanceof ApiError && notificationError.status === 401) {
        await signOut();
      }
    }
  }, [session, signOut, updateSocialCache]);

  return (
    <AppScreen keyboardAware refreshing={refreshing} onRefresh={() => void refreshSocial()}>
      <ScreenHeader
        icon="people"
        accent="violet"
        title="Social"
        trailing={
          <View style={[styles.statsBadge, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
            <Text style={[styles.statsBadgeLabel, { color: theme.colors.text }]}>{unreadNotifications || stats.reviews}</Text>
          </View>
        }
      />

      {error ? <InlineBanner message={error} tone="error" /> : null}

      {notifications.length > 0 ? (
        <View style={[styles.notificationsCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
          <View style={styles.notificationsHeader}>
            <Text style={[styles.notificationsTitle, { color: theme.colors.text }]}>Notifications</Text>
            <Pressable onPress={() => void handleMarkNotificationsRead()}>
              <Text style={[styles.notificationsAction, { color: theme.colors.secondaryAccent }]}>Tout lire</Text>
            </Pressable>
          </View>
          {notifications.map((notification) => (
            <Pressable
              key={notification.id}
              style={[styles.notificationRow, { backgroundColor: theme.rgba.cardStrong }]}
              onPress={() => navigation.navigate('UserProfile', { username: notification.actor.username })}
            >
              <Text style={[styles.notificationText, { color: theme.colors.textSoft }]} numberOfLines={2}>{notification.message}</Text>
              <Text style={[styles.notificationDate, { color: theme.colors.textMuted }]}>{formatDate(notification.created_at)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

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

      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
          <Text style={[styles.summaryValue, { color: theme.colors.text }]}>{stats.reviews}</Text>
          <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>critiques</Text>
        </View>
        <View style={[styles.summaryCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
          <Text style={[styles.summaryValue, { color: theme.colors.text }]}>{stats.liked}</Text>
          <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>likees</Text>
        </View>
      </View>

      {loading && reviews.length === 0 ? <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>Chargement du feed...</Text> : null}

      {!loading && reviews.length === 0 ? (
        <EmptyStateCard title="Aucune critique" />
      ) : (
        <View style={styles.feedList}>
          {reviews.map((item) => (
            <Pressable
              key={item.id}
              style={[styles.reviewCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
              onPress={() => void toggleReview(item.id)}
            >
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  navigation.navigate('MovieDetails', { movieId: item.movie_id, title: item.title });
                }}
              >
                <Image source={{ uri: item.poster_url || FALLBACK_POSTER }} style={styles.poster} />
              </Pressable>
              <View style={styles.reviewBody}>
                <Text style={[styles.reviewTitle, { color: theme.colors.text }]}>{item.title}</Text>
                <Pressable
                  onPress={(event) => {
                    event.stopPropagation();
                    navigation.navigate('UserProfile', { username: item.author.username });
                  }}
                >
                  <Text style={[styles.reviewMeta, { color: theme.colors.textMuted }]}>@{item.author.username} · {formatDate(item.created_at)}</Text>
                </Pressable>
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
                <Text style={[styles.reviewContent, { color: theme.colors.textSoft }]} numberOfLines={expandedReviewId === item.id ? undefined : 4}>
                  {item.content}
                </Text>
                {expandedReviewId === item.id ? (
                  <View style={styles.expandedArea}>
                    <View style={[styles.commentsBox, { borderTopColor: theme.rgba.border }]}>
                      <Text style={[styles.commentsTitle, { color: theme.colors.text }]}>Commentaires</Text>
                      {loadingComments[item.id] ? (
                        <ActivityIndicator color={theme.colors.text} />
                      ) : (commentsByReview[item.id] ?? []).length > 0 ? (
                        (commentsByReview[item.id] ?? []).map((comment) => (
                          <View key={comment.id} style={[styles.commentRow, { backgroundColor: theme.rgba.cardStrong }]}>
                            <Pressable
                              onPress={(event) => {
                                event.stopPropagation();
                                navigation.navigate('UserProfile', { username: comment.author.username });
                              }}
                            >
                              <Text style={[styles.commentAuthor, { color: theme.colors.accent }]}>@{comment.author.username}</Text>
                            </Pressable>
                            <Text style={[styles.commentText, { color: theme.colors.textSoft }]}>{comment.content}</Text>
                          </View>
                        ))
                      ) : (
                        <Text style={[styles.noComments, { color: theme.colors.textMuted }]}>Aucun commentaire pour le moment.</Text>
                      )}
                      <View style={styles.commentComposer}>
                        <TextInput
                          value={commentDrafts[item.id] ?? ''}
                          onChangeText={(value) => setCommentDrafts((current) => ({ ...current, [item.id]: value }))}
                          placeholder="Ajouter un commentaire"
                          placeholderTextColor={theme.colors.textMuted}
                          style={[styles.commentInput, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card, color: theme.colors.text }]}
                        />
                        <Pressable
                          style={[styles.commentSendButton, { backgroundColor: theme.colors.secondaryAccent }]}
                          onPress={() => void handleSubmitComment(item.id)}
                          disabled={submittingCommentIds.includes(item.id)}
                        >
                          <Ionicons name="send" size={15} color={theme.colors.secondaryAccentText} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  statsBadge: {
    minWidth: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  statsBadgeLabel: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  notificationsCard: {
    gap: 10,
    borderRadius: 22,
    borderWidth: 1,
    padding: 12,
  },
  notificationsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  notificationsTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  notificationsAction: {
    fontSize: 12,
    fontWeight: '900',
  },
  notificationRow: {
    borderRadius: 16,
    padding: 10,
    gap: 4,
  },
  notificationText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  notificationDate: {
    fontSize: 11,
    fontWeight: '700',
  },
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
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 16,
  },
  summaryValue: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '900',
  },
  summaryLabel: {
    marginTop: 6,
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
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
  reviewTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  reviewMeta: {
    color: '#94a3b8',
    fontSize: 12,
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

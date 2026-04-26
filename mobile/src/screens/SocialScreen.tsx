import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AppScreen from '../components/AppScreen';
import EmptyStateCard from '../components/EmptyStateCard';
import InlineBanner from '../components/InlineBanner';
import ScreenHeader from '../components/ScreenHeader';
import { ApiError, fetchReviewComments, fetchSocialFeed } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeContext';
import { FALLBACK_POSTER, type SocialComment, type SocialReview } from '../types';
import { formatDate } from '../utils/format';

export default function SocialScreen() {
  const { session, signOut } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [reviews, setReviews] = useState<SocialReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedReviewId, setExpandedReviewId] = useState<number | null>(null);
  const [commentsByReview, setCommentsByReview] = useState<Record<number, SocialComment[]>>({});
  const [loadingComments, setLoadingComments] = useState<Record<number, boolean>>({});
  const [error, setError] = useState('');

  const loadFeed = useCallback(async () => {
    if (!session) {
      return;
    }

    try {
      const payload = await fetchSocialFeed(session.token);
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
  }, [session, signOut]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadFeed();
    }, [loadFeed]),
  );

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

  return (
    <AppScreen>
      <ScreenHeader
        icon="people"
        accent="violet"
        eyebrow="Communaute"
        title="Social"
        subtitle="Le flux critiques et cinema de ton cercle, avec acces direct aux films."
        trailing={
          <View style={[styles.statsBadge, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
            <Text style={[styles.statsBadgeLabel, { color: theme.colors.text }]}>{stats.reviews}</Text>
          </View>
        }
      />

      {error ? <InlineBanner message={error} tone="error" /> : null}

      <Pressable style={[styles.composeButton, { backgroundColor: theme.colors.accent }]} onPress={() => navigation.navigate('CreateReview')}>
        <View style={styles.composeButtonIcon}>
          <Ionicons name="create-outline" size={18} color={theme.colors.accentText} />
        </View>
        <View style={styles.composeButtonBody}>
          <Text style={[styles.composeButtonTitle, { color: theme.colors.accentText }]}>Nouvelle critique</Text>
          <Text style={[styles.composeButtonSubtitle, { color: theme.colors.accentText }]}>Publie ton avis sur un film comme sur le site.</Text>
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

      {loading ? <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>Chargement du feed...</Text> : null}

      {!loading && reviews.length === 0 ? (
        <EmptyStateCard title="Aucune critique pour le moment" subtitle="Le feed se remplira quand ton cercle publiera des avis." />
      ) : (
        <View style={styles.feedList}>
          {reviews.map((item) => (
            <Pressable
              key={item.id}
              style={[styles.reviewCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
              onPress={() => void toggleReview(item.id)}
            >
              <Image source={{ uri: item.poster_url || FALLBACK_POSTER }} style={styles.poster} />
              <View style={styles.reviewBody}>
                <Text style={[styles.reviewTitle, { color: theme.colors.text }]}>{item.title}</Text>
                <Text style={[styles.reviewMeta, { color: theme.colors.textMuted }]}>@{item.author.username} · {formatDate(item.created_at)}</Text>
                <View style={styles.inlinePills}>
                  <View style={[styles.ratingPill, { backgroundColor: theme.colors.ratingBackground }]}>
                    <Text style={[styles.ratingPillLabel, { color: theme.colors.ratingText }]}>{item.rating.toFixed(1)} / 5</Text>
                  </View>
                  <Text style={[styles.inlineMeta, { color: theme.colors.textSoft }]}>{item.likes_count} likes</Text>
                  <Text style={[styles.inlineMeta, { color: theme.colors.textSoft }]}>{item.comments_count} commentaires</Text>
                </View>
                <Text style={[styles.reviewContent, { color: theme.colors.textSoft }]} numberOfLines={expandedReviewId === item.id ? undefined : 4}>
                  {item.content}
                </Text>
                {expandedReviewId === item.id ? (
                  <View style={styles.expandedArea}>
                    <Pressable
                      style={styles.movieLink}
                      onPress={() => navigation.navigate('MovieDetails', { movieId: item.movie_id, title: item.title })}
                    >
                      <Ionicons name="film-outline" size={15} color={theme.colors.secondaryAccent} />
                      <Text style={[styles.movieLinkLabel, { color: theme.colors.secondaryAccent }]}>Fiche film</Text>
                    </Pressable>

                    <View style={[styles.commentsBox, { borderTopColor: theme.rgba.border }]}>
                      <Text style={[styles.commentsTitle, { color: theme.colors.text }]}>Commentaires</Text>
                      {loadingComments[item.id] ? (
                        <ActivityIndicator color={theme.colors.text} />
                      ) : (commentsByReview[item.id] ?? []).length > 0 ? (
                        (commentsByReview[item.id] ?? []).map((comment) => (
                          <View key={comment.id} style={[styles.commentRow, { backgroundColor: theme.rgba.cardStrong }]}>
                            <Text style={[styles.commentAuthor, { color: theme.colors.accent }]}>@{comment.author.username}</Text>
                            <Text style={[styles.commentText, { color: theme.colors.textSoft }]}>{comment.content}</Text>
                          </View>
                        ))
                      ) : (
                        <Text style={[styles.noComments, { color: theme.colors.textMuted }]}>Aucun commentaire pour le moment.</Text>
                      )}
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
  reviewContent: {
    color: '#e5e7eb',
    fontSize: 14,
    lineHeight: 21,
  },
  expandedArea: {
    gap: 12,
    paddingTop: 4,
  },
  movieLink: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.22)',
    backgroundColor: 'rgba(14,165,233,0.10)',
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  movieLinkLabel: {
    color: '#7dd3fc',
    fontSize: 12,
    fontWeight: '800',
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
});

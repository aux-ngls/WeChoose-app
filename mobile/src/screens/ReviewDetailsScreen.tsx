import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, DeviceEventEmitter, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AppScreen from '../components/AppScreen';
import EmptyStateCard from '../components/EmptyStateCard';
import InlineBanner from '../components/InlineBanner';
import {
  ApiError,
  createReviewComment,
  fetchReview,
  fetchReviewComments,
  toggleReviewLike,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeContext';
import { FALLBACK_POSTER, type SocialComment, type SocialReview } from '../types';
import { formatDate } from '../utils/format';
import { SOCIAL_REFRESH_EVENT } from '../utils/events';

export default function ReviewDetailsScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'ReviewDetails'>) {
  const { session, signOut } = useAuth();
  const { theme } = useTheme();
  const [review, setReview] = useState<SocialReview | null>(null);
  const [comments, setComments] = useState<SocialComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [liking, setLiking] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [draft, setDraft] = useState('');
  const [replyTarget, setReplyTarget] = useState<SocialComment | null>(null);
  const [error, setError] = useState('');
  const threadedComments = useMemo(() => {
    const repliesByParent = new Map<number, SocialComment[]>();
    const rootComments: SocialComment[] = [];

    comments.forEach((comment) => {
      if (comment.parent_id) {
        const replies = repliesByParent.get(comment.parent_id) ?? [];
        replies.push(comment);
        repliesByParent.set(comment.parent_id, replies);
        return;
      }
      rootComments.push(comment);
    });

    return rootComments.map((comment) => ({
      comment,
      replies: repliesByParent.get(comment.id) ?? [],
    }));
  }, [comments]);

  const loadReviewThread = useCallback(async () => {
    if (!session) {
      return;
    }

    try {
      const [reviewPayload, commentsPayload] = await Promise.all([
        fetchReview(session.token, route.params.reviewId),
        fetchReviewComments(session.token, route.params.reviewId),
      ]);
      setReview(reviewPayload);
      setComments(commentsPayload);
      setError('');
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) {
        await signOut();
        return;
      }
      setError('Impossible de charger cette critique.');
    } finally {
      setLoading(false);
    }
  }, [route.params.reviewId, session, signOut]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadReviewThread();
    }, [loadReviewThread]),
  );

  const refreshThread = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadReviewThread();
    } finally {
      setRefreshing(false);
    }
  }, [loadReviewThread]);

  const handleToggleLike = useCallback(async () => {
    if (!session || !review || liking) {
      return;
    }

    setLiking(true);
    try {
      const payload = await toggleReviewLike(session.token, review.id);
      setReview((current) => current ? {
        ...current,
        liked_by_me: payload.liked,
        likes_count: payload.likes_count,
      } : current);
      DeviceEventEmitter.emit(SOCIAL_REFRESH_EVENT);
      setError('');
    } catch (likeError) {
      if (likeError instanceof ApiError && likeError.status === 401) {
        await signOut();
        return;
      }
      setError("Impossible d'actualiser le like.");
    } finally {
      setLiking(false);
    }
  }, [liking, review, session, signOut]);

  const handleSubmitComment = useCallback(async () => {
    const content = draft.trim();
    if (!session || !review || sendingComment || content.length < 1) {
      return;
    }

    setSendingComment(true);
    try {
      const createdComment = await createReviewComment(session.token, review.id, content, replyTarget?.id ?? null);
      setComments((current) => [...current, createdComment]);
      setReview((current) => current ? { ...current, comments_count: current.comments_count + 1 } : current);
      setDraft('');
      setReplyTarget(null);
      DeviceEventEmitter.emit(SOCIAL_REFRESH_EVENT);
      setError('');
    } catch (commentError) {
      if (commentError instanceof ApiError && commentError.status === 401) {
        await signOut();
        return;
      }
      setError("Impossible d'ajouter le commentaire.");
    } finally {
      setSendingComment(false);
    }
  }, [draft, replyTarget, review, sendingComment, session, signOut]);

  return (
    <AppScreen keyboardAware refreshing={refreshing} onRefresh={() => void refreshThread()}>
      <View style={styles.headerRow}>
        <Pressable style={[styles.iconButton, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        </Pressable>
        <View style={styles.headerBody}>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Critique</Text>
          <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]}>Discussion autour du film</Text>
        </View>
      </View>

      {error ? <InlineBanner message={error} tone="error" /> : null}

      {loading ? (
        <View style={[styles.loadingCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
          <ActivityIndicator color={theme.colors.text} />
        </View>
      ) : !review ? (
        <EmptyStateCard title="Critique introuvable" />
      ) : (
        <>
          <View style={[styles.reviewCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
            <Pressable onPress={() => navigation.navigate('MovieDetails', { movieId: review.movie_id, title: review.title })}>
              <Image source={{ uri: review.poster_url || FALLBACK_POSTER }} style={styles.poster} />
            </Pressable>
            <View style={styles.reviewBody}>
              <View style={styles.reviewHeader}>
                <View style={styles.reviewHeaderText}>
                  <Text style={[styles.reviewTitle, { color: theme.colors.text }]}>{review.title}</Text>
                  <Pressable onPress={() => navigation.navigate('UserProfile', { username: review.author.username })}>
                    <Text style={[styles.reviewMeta, { color: theme.colors.textMuted }]}>@{review.author.username} · {formatDate(review.created_at)}</Text>
                  </Pressable>
                </View>
                <View style={[styles.ratingPill, { backgroundColor: theme.colors.ratingBackground }]}>
                  <Text style={[styles.ratingPillLabel, { color: theme.colors.ratingText }]}>{review.rating.toFixed(1)} / 5</Text>
                </View>
              </View>

              <Pressable onPress={handleToggleLike} disabled={liking} style={[styles.likeButton, review.liked_by_me && { backgroundColor: theme.colors.accentSoft }]}>
                <Ionicons name={review.liked_by_me ? 'heart' : 'heart-outline'} size={15} color={review.liked_by_me ? theme.colors.accent : theme.colors.textSoft} />
                <Text style={[styles.likeLabel, { color: review.liked_by_me ? theme.colors.accent : theme.colors.textSoft }]}>
                  {review.likes_count} j'aime
                </Text>
              </Pressable>

              <Text style={[styles.reviewContent, { color: theme.colors.textSoft }]}>{review.content}</Text>
            </View>
          </View>

          <View style={[styles.commentsCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
            <View style={styles.commentsHeader}>
              <Text style={[styles.commentsTitle, { color: theme.colors.text }]}>Commentaires</Text>
              <Text style={[styles.commentsMeta, { color: theme.colors.textMuted }]}>{review.comments_count}</Text>
            </View>

            {threadedComments.length > 0 ? (
              <View style={styles.commentsList}>
                {threadedComments.map(({ comment, replies }) => {
                  const isHighlighted = route.params.highlightCommentId === comment.id;
                  return (
                    <View key={comment.id} style={styles.commentThread}>
                      <View
                        style={[
                          styles.commentRow,
                          {
                            backgroundColor: isHighlighted ? theme.colors.accentSoft : theme.rgba.cardStrong,
                            borderColor: isHighlighted ? theme.colors.accent : 'transparent',
                          },
                        ]}
                      >
                        <View style={styles.commentTopRow}>
                          <Pressable onPress={() => navigation.navigate('UserProfile', { username: comment.author.username })}>
                            <Text style={[styles.commentAuthor, { color: theme.colors.accent }]}>@{comment.author.username}</Text>
                          </Pressable>
                          <Pressable onPress={() => setReplyTarget(comment)} style={styles.commentReplyButton}>
                            <Ionicons name="return-up-back-outline" size={14} color={theme.colors.textMuted} />
                            <Text style={[styles.commentReplyLabel, { color: theme.colors.textMuted }]}>Répondre</Text>
                          </Pressable>
                        </View>
                        <Text style={[styles.commentText, { color: theme.colors.textSoft }]}>{comment.content}</Text>
                      </View>

                      {replies.length > 0 ? (
                        <View style={styles.replyList}>
                          {replies.map((reply) => {
                            const isReplyHighlighted = route.params.highlightCommentId === reply.id;
                            return (
                              <View
                                key={reply.id}
                                style={[
                                  styles.replyRow,
                                  {
                                    backgroundColor: isReplyHighlighted ? theme.colors.accentSoft : theme.rgba.card,
                                    borderColor: isReplyHighlighted ? theme.colors.accent : theme.rgba.border,
                                  },
                                ]}
                              >
                                <View style={styles.commentTopRow}>
                                  <Pressable onPress={() => navigation.navigate('UserProfile', { username: reply.author.username })}>
                                    <Text style={[styles.commentAuthor, { color: theme.colors.secondaryAccent }]}>@{reply.author.username}</Text>
                                  </Pressable>
                                  <Pressable onPress={() => setReplyTarget(reply)} style={styles.commentReplyButton}>
                                    <Ionicons name="return-up-back-outline" size={14} color={theme.colors.textMuted} />
                                    <Text style={[styles.commentReplyLabel, { color: theme.colors.textMuted }]}>Répondre</Text>
                                  </Pressable>
                                </View>
                                {reply.reply_to_username ? (
                                  <Text style={[styles.replyTargetLabel, { color: theme.colors.secondaryAccent }]}>à @{reply.reply_to_username}</Text>
                                ) : null}
                                <Text style={[styles.commentText, { color: theme.colors.textSoft }]}>{reply.content}</Text>
                              </View>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={[styles.emptyComments, { color: theme.colors.textMuted }]}>Aucun commentaire pour le moment.</Text>
            )}

            {replyTarget ? (
              <View style={[styles.replyBanner, { borderColor: theme.colors.secondaryAccent, backgroundColor: theme.rgba.cardStrong }]}>
                <View style={styles.replyBannerBody}>
                  <Text style={[styles.replyBannerTitle, { color: theme.colors.secondaryAccent }]}>Réponse à @{replyTarget.author.username}</Text>
                  <Text style={[styles.replyBannerPreview, { color: theme.colors.textMuted }]} numberOfLines={2}>{replyTarget.content}</Text>
                </View>
                <Pressable onPress={() => setReplyTarget(null)}>
                  <Ionicons name="close" size={18} color={theme.colors.textMuted} />
                </Pressable>
              </View>
            ) : null}

            <View style={styles.composerRow}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={replyTarget ? `Répondre à @${replyTarget.author.username}` : 'Ajouter un commentaire'}
                placeholderTextColor={theme.colors.textMuted}
                style={[styles.commentInput, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.cardStrong, color: theme.colors.text }]}
                multiline
              />
              <Pressable
                style={[styles.commentSendButton, { backgroundColor: theme.colors.secondaryAccent }, sendingComment && styles.disabledButton]}
                onPress={() => void handleSubmitComment()}
                disabled={sendingComment || draft.trim().length < 1}
              >
                <Ionicons name="send" size={15} color={theme.colors.secondaryAccentText} />
              </Pressable>
            </View>
          </View>
        </>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBody: {
    flex: 1,
    gap: 3,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -1,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '800',
  },
  loadingCard: {
    minHeight: 180,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewCard: {
    flexDirection: 'row',
    gap: 14,
    borderRadius: 24,
    borderWidth: 1,
    padding: 14,
  },
  poster: {
    width: 92,
    height: 132,
    borderRadius: 18,
  },
  reviewBody: {
    flex: 1,
    gap: 10,
  },
  reviewHeader: {
    gap: 8,
  },
  reviewHeaderText: {
    gap: 4,
  },
  reviewTitle: {
    fontSize: 18,
    fontWeight: '900',
  },
  reviewMeta: {
    fontSize: 12,
    fontWeight: '700',
  },
  ratingPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  ratingPillLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  likeButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  likeLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  reviewContent: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
  },
  commentsCard: {
    gap: 12,
    borderRadius: 24,
    borderWidth: 1,
    padding: 14,
  },
  commentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  commentsTitle: {
    fontSize: 18,
    fontWeight: '900',
  },
  commentsMeta: {
    fontSize: 12,
    fontWeight: '800',
  },
  commentsList: {
    gap: 10,
  },
  commentThread: {
    gap: 10,
  },
  commentRow: {
    gap: 5,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
  },
  replyList: {
    gap: 8,
    paddingLeft: 18,
  },
  replyRow: {
    gap: 5,
    borderRadius: 16,
    borderWidth: 1,
    padding: 11,
  },
  commentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '900',
  },
  commentReplyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  commentReplyLabel: {
    fontSize: 11,
    fontWeight: '800',
  },
  replyTargetLabel: {
    fontSize: 11,
    fontWeight: '800',
  },
  commentText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  emptyComments: {
    fontSize: 13,
    fontWeight: '700',
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
  },
  replyBannerBody: {
    flex: 1,
    gap: 3,
  },
  replyBannerTitle: {
    fontSize: 12,
    fontWeight: '900',
  },
  replyBannerPreview: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  commentInput: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  commentSendButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
});

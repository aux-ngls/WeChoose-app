import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { DeviceEventEmitter, Image, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AppScreen from '../components/AppScreen';
import InlineBanner from '../components/InlineBanner';
import SearchField from '../components/SearchField';
import {
  ApiError,
  searchMovies,
  searchSocialUsers,
  sendMessage,
  startConversation,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeContext';
import { FALLBACK_POSTER, type SearchMovie, type SocialUser } from '../types';
import { CONVERSATION_MESSAGE_EVENT, INBOX_CONVERSATION_EVENT } from '../utils/events';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function triggerMovieShareHaptic() {
  try {
    await Haptics.selectionAsync();
    await wait(28);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    await wait(42);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await wait(52);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
  } catch {
    Vibration.vibrate([0, 12, 30, 18, 42, 28]);
    return;
  }
}

export default function ShareMovieScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'ShareMovie'>) {
  const { session, signOut } = useAuth();
  const { theme } = useTheme();
  const isConversationShare = Boolean(route.params.conversationId && route.params.participantUsername);
  const initialMovie =
    route.params.movieId && route.params.title
      ? {
          id: route.params.movieId,
          title: route.params.title,
          poster_url: route.params.posterUrl ?? '',
          rating: route.params.rating ?? 0,
        }
      : null;
  const [query, setQuery] = useState('');
  const [userResults, setUserResults] = useState<SocialUser[]>([]);
  const [movieResults, setMovieResults] = useState<SearchMovie[]>([]);
  const [loading, setLoading] = useState(false);
  const [sharingUserIds, setSharingUserIds] = useState<number[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<SearchMovie | null>(initialMovie);
  const [error, setError] = useState('');
  const movieToShare = selectedMovie ?? initialMovie;

  useEffect(() => {
    if (!session) {
      return;
    }

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setUserResults([]);
      setMovieResults([]);
      return;
    }

    const handle = setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          if (isConversationShare) {
            const payload = await searchMovies(session.token, trimmed);
            setMovieResults(payload);
          } else {
            const payload = await searchSocialUsers(session.token, trimmed);
            setUserResults(payload);
          }
          setError('');
        } catch (searchError) {
          if (searchError instanceof ApiError && searchError.status === 401) {
            await signOut();
            return;
          }
          setError(
            isConversationShare
              ? 'Impossible de rechercher des films.'
              : 'Impossible de rechercher des utilisateurs.',
          );
        } finally {
          setLoading(false);
        }
      })();
    }, 250);

    return () => clearTimeout(handle);
  }, [isConversationShare, query, session, signOut]);

  const shareWithUser = async (user: SocialUser) => {
    if (!session || !movieToShare) {
      return;
    }

    setSharingUserIds((current) => [...current, user.id]);
    try {
      const conversationId =
        route.params.conversationId && route.params.participantId === user.id
          ? route.params.conversationId
          : (await startConversation(session.token, user.id)).id;
      const createdMessage = await sendMessage(session.token, conversationId, {
        movie_id: movieToShare.id,
        movie_title: movieToShare.title,
        movie_poster_url: movieToShare.poster_url,
        movie_rating: movieToShare.rating,
      });
      await triggerMovieShareHaptic();
      DeviceEventEmitter.emit(INBOX_CONVERSATION_EVENT, {
        type: 'messages.updated',
        conversation_id: conversationId,
        message_id: createdMessage.id,
        sender_id: createdMessage.sender.id,
        sender_username: createdMessage.sender.username,
        preview: `Film partage : ${movieToShare.title}`,
        message: createdMessage,
      });
      DeviceEventEmitter.emit(CONVERSATION_MESSAGE_EVENT, {
        conversation_id: conversationId,
        message: createdMessage,
      });
      if (isConversationShare) {
        navigation.goBack();
        return;
      }
      navigation.replace('Conversation', {
        conversationId,
        participantUsername: user.username,
        participantId: user.id,
      });
    } catch (shareError) {
      if (shareError instanceof ApiError && shareError.status === 401) {
        await signOut();
        return;
      }
      setError("Impossible de partager ce film.");
    } finally {
      setSharingUserIds((current) => current.filter((id) => id !== user.id));
    }
  };

  const selectMovie = (movie: SearchMovie) => {
    setSelectedMovie(movie);
    setMovieResults([]);
    setQuery('');
    setError('');
  };

  const handleShareToCurrentConversation = async () => {
    if (!route.params.participantId || !route.params.participantUsername) {
      setError("Impossible d'identifier cette conversation.");
      return;
    }

    await shareWithUser({
      id: route.params.participantId,
      username: route.params.participantUsername,
      avatar_url: null,
      followers_count: 0,
      following_count: 0,
      reviews_count: 0,
      is_following: false,
    });
  };

  return (
    <AppScreen>
      <View style={styles.headerRow}>
        <Pressable style={[styles.iconButton, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
          {isConversationShare ? 'Envoyer un film' : 'Partager'}
        </Text>
        <View style={styles.iconSpacer} />
      </View>

      {isConversationShare ? (
        <View style={[styles.targetCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
          <View style={[styles.targetAvatar, { backgroundColor: theme.colors.accentSoft }]}>
            <Text style={[styles.targetAvatarLabel, { color: theme.colors.accent }]}>
              {(route.params.participantUsername ?? '?').slice(0, 2).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.targetLabel, { color: theme.colors.textMuted }]}>Discussion</Text>
            <Text style={[styles.targetUsername, { color: theme.colors.text }]}>
              @{route.params.participantUsername}
            </Text>
          </View>
        </View>
      ) : null}

      {movieToShare ? (
        <View style={[styles.movieCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
          <Image source={{ uri: movieToShare.poster_url || FALLBACK_POSTER }} style={styles.poster} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.movieTitle, { color: theme.colors.text }]} numberOfLines={2}>
              {movieToShare.title}
            </Text>
            <Text style={[styles.movieMeta, { color: theme.colors.ratingText }]}>
              {movieToShare.rating.toFixed(1)} / 10
            </Text>
          </View>
          {isConversationShare ? (
            <Pressable
              style={styles.clearButton}
              onPress={() => {
                setSelectedMovie(null);
                setQuery('');
                setMovieResults([]);
              }}
            >
              <Ionicons name="refresh-outline" size={16} color={theme.colors.accent} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {error ? <InlineBanner message={error} tone="error" /> : null}

      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder={
          isConversationShare
            ? movieToShare
              ? 'Choisir un autre film'
              : 'Chercher un film'
            : 'Chercher une personne'
        }
        icon={isConversationShare ? 'film-outline' : 'person-add'}
      />
      {loading ? <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>Recherche en cours...</Text> : null}

      <View style={styles.resultsList}>
        {isConversationShare && movieToShare ? (
          <Pressable
            style={[styles.sendMovieButton, { backgroundColor: theme.colors.accent }]}
            onPress={() => void handleShareToCurrentConversation()}
          >
            <Ionicons name="send" size={16} color="#0b1020" />
            <Text style={styles.sendMovieButtonLabel}>
              Envoyer à @{route.params.participantUsername}
            </Text>
          </Pressable>
        ) : null}

        {isConversationShare
          ? movieResults.map((movie) => (
              <Pressable
                key={movie.id}
                style={[styles.userCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
                onPress={() => selectMovie(movie)}
              >
                <Image source={{ uri: movie.poster_url || FALLBACK_POSTER }} style={styles.resultPoster} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.username, { color: theme.colors.text }]} numberOfLines={2}>
                    {movie.title}
                  </Text>
                  <Text style={[styles.userMeta, { color: theme.colors.textMuted }]}>
                    Sélectionner pour l’envoyer
                  </Text>
                </View>
                <View style={[styles.resultRatingPill, { backgroundColor: theme.colors.ratingBackground }]}>
                  <Text style={[styles.resultRatingLabel, { color: theme.colors.ratingText }]}>
                    {movie.rating.toFixed(1)}
                  </Text>
                </View>
              </Pressable>
            ))
          : userResults.map((user) => {
          const isSharing = sharingUserIds.includes(user.id);
          return (
            <Pressable key={user.id} style={[styles.userCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]} onPress={() => void shareWithUser(user)}>
              <View style={[styles.avatar, { backgroundColor: theme.colors.accentSoft }]}>
                <Text style={[styles.avatarLabel, { color: theme.colors.accent }]}>{user.username.slice(0, 2).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.username, { color: theme.colors.text }]}>@{user.username}</Text>
                <Text style={[styles.userMeta, { color: theme.colors.textMuted }]}>{user.followers_count} abonnés</Text>
              </View>
              <Ionicons name={isSharing ? 'hourglass-outline' : 'send'} size={18} color={theme.colors.secondaryAccent} />
            </Pressable>
          );
        })}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSpacer: { width: 42 },
  headerTitle: {
    flex: 1,
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '900',
  },
  movieCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 14,
  },
  targetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 22,
    borderWidth: 1,
    padding: 12,
  },
  targetAvatar: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetAvatarLabel: {
    fontSize: 13,
    fontWeight: '900',
  },
  targetLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  targetUsername: {
    marginTop: 3,
    fontSize: 15,
    fontWeight: '900',
  },
  poster: {
    width: 62,
    height: 92,
    borderRadius: 16,
  },
  movieTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  movieMeta: {
    marginTop: 8,
    color: '#fde68a',
    fontSize: 13,
    fontWeight: '800',
  },
  helperText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  resultsList: {
    gap: 10,
  },
  sendMovieButton: {
    minHeight: 50,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
  },
  sendMovieButtonLabel: {
    color: '#0b1020',
    fontSize: 14,
    fontWeight: '900',
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 12,
  },
  resultPoster: {
    width: 44,
    height: 64,
    borderRadius: 12,
  },
  resultRatingPill: {
    minWidth: 44,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    alignItems: 'center',
  },
  resultRatingLabel: {
    fontSize: 12,
    fontWeight: '900',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLabel: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  username: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  userMeta: {
    marginTop: 4,
    color: '#94a3b8',
    fontSize: 12,
  },
  clearButton: {
    width: 34,
    height: 34,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

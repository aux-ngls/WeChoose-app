import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AppScreen from '../components/AppScreen';
import InlineBanner from '../components/InlineBanner';
import SearchField from '../components/SearchField';
import {
  ApiError,
  searchSocialUsers,
  sendMessage,
  startConversation,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeContext';
import { FALLBACK_POSTER, type SocialUser } from '../types';

export default function ShareMovieScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'ShareMovie'>) {
  const { session, signOut } = useAuth();
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SocialUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [sharingUserIds, setSharingUserIds] = useState<number[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session) {
      return;
    }

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }

    const handle = setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const payload = await searchSocialUsers(session.token, trimmed);
          setResults(payload);
          setError('');
        } catch (searchError) {
          if (searchError instanceof ApiError && searchError.status === 401) {
            await signOut();
            return;
          }
          setError('Impossible de rechercher des utilisateurs.');
        } finally {
          setLoading(false);
        }
      })();
    }, 250);

    return () => clearTimeout(handle);
  }, [query, session, signOut]);

  const shareWithUser = async (user: SocialUser) => {
    if (!session) {
      return;
    }

    setSharingUserIds((current) => [...current, user.id]);
    try {
      const conversation = await startConversation(session.token, user.id);
      await sendMessage(session.token, conversation.id, {
        movie_id: route.params.movieId,
        movie_title: route.params.title,
        movie_poster_url: route.params.posterUrl,
        movie_rating: route.params.rating,
      });
      navigation.replace('Conversation', {
        conversationId: conversation.id,
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

  return (
    <AppScreen>
      <View style={styles.headerRow}>
        <Pressable style={[styles.iconButton, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Partager</Text>
        <View style={styles.iconSpacer} />
      </View>

      <View style={[styles.movieCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
        <Image source={{ uri: route.params.posterUrl || FALLBACK_POSTER }} style={styles.poster} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.movieTitle, { color: theme.colors.text }]} numberOfLines={2}>{route.params.title}</Text>
          <Text style={[styles.movieMeta, { color: theme.colors.ratingText }]}>{route.params.rating.toFixed(1)} / 10</Text>
        </View>
      </View>

      {error ? <InlineBanner message={error} tone="error" /> : null}

      <SearchField value={query} onChangeText={setQuery} placeholder="Chercher une personne" icon="person-add" />
      {loading ? <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>Recherche en cours...</Text> : null}

      <View style={styles.resultsList}>
        {results.map((user) => {
          const isSharing = sharingUserIds.includes(user.id);
          return (
            <Pressable key={user.id} style={[styles.userCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]} onPress={() => void shareWithUser(user)}>
              <View style={[styles.avatar, { backgroundColor: theme.colors.accentSoft }]}>
                <Text style={[styles.avatarLabel, { color: theme.colors.accent }]}>{user.username.slice(0, 2).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.username, { color: theme.colors.text }]}>@{user.username}</Text>
                <Text style={[styles.userMeta, { color: theme.colors.textMuted }]}>{user.followers_count} abonnes</Text>
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
});

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ApiError, fetchMovieNewsHighlights } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import AppScreen from '../components/AppScreen';
import EmptyStateCard from '../components/EmptyStateCard';
import InlineBanner from '../components/InlineBanner';
import ScreenHeader from '../components/ScreenHeader';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeContext';
import { FALLBACK_POSTER, type FriendRatedMovie, type MovieNewsHighlights } from '../types';

export default function NewsScreen() {
  const { session, signOut } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [highlights, setHighlights] = useState<MovieNewsHighlights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadHighlights = useCallback(async () => {
    if (!session) {
      return;
    }

    try {
      const payload = await fetchMovieNewsHighlights(session.token);
      setHighlights(payload);
      setError('');
    } catch (fetchError) {
      if (fetchError instanceof ApiError && fetchError.status === 401) {
        await signOut();
        return;
      }
      setError("Impossible de charger l'affiche.");
    } finally {
      setLoading(false);
    }
  }, [session, signOut]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadHighlights();
    }, [loadHighlights]),
  );

  const rows = useMemo(
    () => [
      { key: 'popular', title: 'Sorties populaires', data: highlights?.popular_now ?? [] },
      { key: 'tailored', title: 'Pour toi', data: highlights?.tailored_for_you ?? [] },
      { key: 'discovery', title: 'A decouvrir', data: highlights?.discovery_for_you ?? [] },
      { key: 'friends', title: 'Notes des amis', data: highlights?.friends_recent_ratings ?? [] },
    ],
    [highlights],
  );

  const hasMovies = rows.some((row) => row.data.length > 0);

  return (
    <AppScreen>
      <ScreenHeader icon="newspaper" accent="amber" title="A l'affiche" />
      {error ? <InlineBanner message={error} tone="error" /> : null}

      {loading ? (
        <View style={[styles.stateCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
          <ActivityIndicator color={theme.colors.text} />
          <Text style={[styles.stateText, { color: theme.colors.textMuted }]}>Chargement...</Text>
        </View>
      ) : null}

      {!loading && !hasMovies ? <EmptyStateCard title="Aucun film" /> : null}

      {rows.map((row) => (
        row.data.length > 0 ? (
          <View key={row.key} style={styles.rowBlock}>
            <Text style={[styles.rowTitle, { color: theme.colors.text }]}>{row.title}</Text>
            <FlatList
              horizontal
              data={row.data}
              keyExtractor={(item) => `${row.key}-${item.id}`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.moviesRow}
              renderItem={({ item }) => {
                const friendMovie = item as FriendRatedMovie;
                return (
                  <Pressable
                    style={[styles.movieCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
                    onPress={() => navigation.navigate('MovieDetails', { movieId: item.id, title: item.title })}
                  >
                    <Image source={{ uri: item.poster_url || FALLBACK_POSTER }} style={styles.poster} />
                    <Text style={[styles.movieTitle, { color: theme.colors.text }]} numberOfLines={2}>{item.title}</Text>
                    <View style={styles.metaRow}>
                      <Ionicons name="star" size={12} color={theme.colors.ratingText} />
                      <Text style={[styles.movieMeta, { color: theme.colors.ratingText }]}>{item.rating.toFixed(1)}</Text>
                    </View>
                    {friendMovie.username ? (
                      <Text style={[styles.friendLabel, { color: theme.colors.textMuted }]} numberOfLines={1}>@{friendMovie.username}</Text>
                    ) : null}
                  </Pressable>
                );
              }}
            />
          </View>
        ) : null
      ))}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  stateCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  stateText: {
    fontSize: 13,
    fontWeight: '700',
  },
  rowBlock: {
    gap: 12,
  },
  rowTitle: {
    fontSize: 18,
    fontWeight: '900',
  },
  moviesRow: {
    gap: 12,
    paddingRight: 20,
  },
  movieCard: {
    width: 128,
    borderRadius: 20,
    borderWidth: 1,
    padding: 9,
    gap: 8,
  },
  poster: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: 16,
  },
  movieTitle: {
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  movieMeta: {
    fontSize: 11,
    fontWeight: '900',
  },
  friendLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
});

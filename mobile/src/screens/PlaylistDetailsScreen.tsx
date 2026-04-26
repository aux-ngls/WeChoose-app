import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AppScreen from '../components/AppScreen';
import EmptyStateCard from '../components/EmptyStateCard';
import InlineBanner from '../components/InlineBanner';
import SearchField from '../components/SearchField';
import {
  ApiError,
  fetchPlaylistMovies,
  removeMovieFromPlaylist,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeContext';
import {
  FALLBACK_POSTER,
  FAVORITES_PLAYLIST_ID,
  HISTORY_PLAYLIST_ID,
  type SearchMovie,
  WATCH_LATER_PLAYLIST_ID,
} from '../types';

const SORT_OPTIONS = [
  { key: 'genre', label: 'Genre' },
  { key: 'recent', label: 'Recents' },
  { key: 'oldest', label: 'Anciens' },
  { key: 'rating', label: 'Mieux notes' },
] as const;

type SortMode = (typeof SORT_OPTIONS)[number]['key'];

export default function PlaylistDetailsScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'PlaylistDetails'>) {
  const { session, signOut } = useAuth();
  const { theme } = useTheme();
  const [movies, setMovies] = useState<SearchMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>(route.params.playlistId === WATCH_LATER_PLAYLIST_ID ? 'genre' : 'recent');

  const canRemove = route.params.playlistId !== FAVORITES_PLAYLIST_ID && route.params.playlistId !== HISTORY_PLAYLIST_ID;

  const loadPlaylist = useCallback(async () => {
    if (!session) {
      return;
    }

    try {
      const payload = await fetchPlaylistMovies(session.token, route.params.playlistId);
      setMovies(payload);
      setError('');
    } catch (fetchError) {
      if (fetchError instanceof ApiError && fetchError.status === 401) {
        await signOut();
        return;
      }
      setError('Impossible de charger cette playlist.');
    } finally {
      setLoading(false);
    }
  }, [route.params.playlistId, session, signOut]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadPlaylist();
    }, [loadPlaylist]),
  );

  const sortedMovies = useMemo(() => {
    const copy = [...movies];
    if (sortMode === 'genre') {
      copy.sort((a, b) => {
        const genreA = (a.primary_genre ?? 'Autres').toLowerCase();
        const genreB = (b.primary_genre ?? 'Autres').toLowerCase();
        if (genreA !== genreB) {
          return genreA.localeCompare(genreB);
        }
        return a.title.localeCompare(b.title);
      });
    } else if (sortMode === 'oldest') {
      copy.sort((a, b) => String(a.added_at ?? '').localeCompare(String(b.added_at ?? '')));
    } else if (sortMode === 'rating') {
      copy.sort((a, b) => b.rating - a.rating);
    } else {
      copy.sort((a, b) => String(b.added_at ?? '').localeCompare(String(a.added_at ?? '')));
    }

    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return copy;
    }

    return copy.filter((movie) => movie.title.toLowerCase().includes(trimmed));
  }, [movies, query, sortMode]);

  const handleRemove = async (movieId: number) => {
    if (!session || !canRemove) {
      return;
    }

    try {
      await removeMovieFromPlaylist(session.token, route.params.playlistId, movieId);
      setMovies((current) => current.filter((movie) => movie.id !== movieId));
    } catch (actionError) {
      if (actionError instanceof ApiError && actionError.status === 401) {
        await signOut();
        return;
      }
      setError('Impossible de retirer ce film.');
    }
  };

  return (
    <AppScreen scroll={false} contentStyle={{ flex: 1 }}>
      <View style={styles.headerRow}>
        <Pressable style={[styles.iconButton, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]} numberOfLines={1}>{route.params.name ?? 'Playlist'}</Text>
          <Text style={[styles.headerMeta, { color: theme.colors.textMuted }]}>{movies.length} film(s)</Text>
        </View>
        <View style={styles.iconSpacer} />
      </View>

      {error ? <InlineBanner message={error} tone="error" /> : null}

      <FlatList
        data={sortedMovies}
        key={`playlist-${sortMode}`}
        numColumns={3}
        columnWrapperStyle={styles.columns}
        keyExtractor={(item) => String(item.id)}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <SearchField value={query} onChangeText={setQuery} placeholder="Filtrer les films" />
            <View style={styles.filtersRow}>
              {SORT_OPTIONS.map((option) => (
                <Pressable
                  key={option.key}
                  onPress={() => setSortMode(option.key)}
                  style={[
                    styles.filterChip,
                    { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card },
                    sortMode === option.key && { borderColor: theme.colors.secondaryAccent, backgroundColor: theme.colors.accentSoft },
                  ]}
                >
                  <Text style={[styles.filterChipLabel, { color: theme.colors.textSoft }, sortMode === option.key && { color: theme.colors.text }]}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {loading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator color={theme.colors.text} />
              </View>
            ) : null}
          </View>
        }
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.movieCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
            onPress={() => navigation.navigate('MovieDetails', { movieId: item.id, title: item.title })}
          >
            <Image source={{ uri: item.poster_url || FALLBACK_POSTER }} style={styles.poster} />
            {canRemove ? (
              <Pressable style={styles.removeBadge} onPress={() => void handleRemove(item.id)}>
                <Ionicons name="close" size={12} color="#ffffff" />
              </Pressable>
            ) : null}
            <View style={styles.overlay}>
              <Text style={styles.movieTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.movieMeta} numberOfLines={1}>
                {sortMode === 'genre' ? item.primary_genre ?? 'Autres' : `${item.rating.toFixed(1)} / 10`}
              </Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          !loading ? (
            <EmptyStateCard title="Aucun film" />
          ) : null
        }
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 6,
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
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  iconSpacer: { width: 42 },
  headerTitle: {
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
  },
  headerMeta: {
    color: '#94a3b8',
    fontSize: 12,
  },
  headerContent: {
    gap: 12,
    marginBottom: 10,
  },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    borderColor: 'rgba(125,211,252,0.35)',
    backgroundColor: 'rgba(14,165,233,0.18)',
  },
  filterChipLabel: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
  },
  filterChipLabelActive: {
    color: '#e0f2fe',
  },
  loadingState: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  listContent: {
    paddingBottom: 24,
  },
  columns: {
    gap: 10,
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  movieCard: {
    width: '31%',
    overflow: 'hidden',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  poster: {
    width: '100%',
    aspectRatio: 2 / 3,
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.76)',
    padding: 8,
  },
  movieTitle: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 14,
  },
  movieMeta: {
    marginTop: 4,
    color: '#cbd5e1',
    fontSize: 10,
    fontWeight: '700',
  },
  removeBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 2,
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.86)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

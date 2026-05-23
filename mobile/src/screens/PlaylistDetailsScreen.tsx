import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AppScreen from '../components/AppScreen';
import EmptyStateCard from '../components/EmptyStateCard';
import InlineBanner from '../components/InlineBanner';
import SearchField from '../components/SearchField';
import {
  ApiError,
  fetchProfilePreferences,
  fetchPlaylistMoviesPage,
  removeMovieFromPlaylist,
  reorderPlaylistMovies,
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
import { matchesOwnedStreamingServices } from '../utils/streaming';

const SORT_OPTIONS = [
  { key: 'manual', label: 'Ordre personnalisé' },
  { key: 'genre', label: 'Genre' },
  { key: 'recent', label: "Date d'ajout : le plus récent" },
  { key: 'oldest', label: "Date d'ajout : le plus ancien" },
  { key: 'rating', label: 'Mieux notés' },
] as const;

type SortMode = (typeof SORT_OPTIONS)[number]['key'];
const INITIAL_PLAYLIST_PAGE_SIZE = 200;
const PLAYLIST_PAGE_SIZE = 60;
const APPEND_BATCH_SIZE = 12;
const APPEND_BATCH_DELAY_MS = 28;

const playlistMoviesCache = new Map<
  number,
  {
    movies: SearchMovie[];
    totalCount: number;
    hasMore: boolean;
    nextOffset: number;
  }
>();

function compareManualOrder(a: SearchMovie, b: SearchMovie) {
  const orderA = a.sort_index ?? Number.MAX_SAFE_INTEGER;
  const orderB = b.sort_index ?? Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) {
    return orderA - orderB;
  }
  return a.title.localeCompare(b.title);
}

function formatPlaylistRating(rating: number, playlistId: number) {
  const scale = playlistId === FAVORITES_PLAYLIST_ID || playlistId === HISTORY_PLAYLIST_ID ? 5 : 10;
  return `${rating.toFixed(1)} / ${scale}`;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function PlaylistDetailsScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'PlaylistDetails'>) {
  const { session, signOut } = useAuth();
  const { theme } = useTheme();
  const supportsManualSort =
    route.params.playlistId !== FAVORITES_PLAYLIST_ID && route.params.playlistId !== HISTORY_PLAYLIST_ID;
  const initialCache = playlistMoviesCache.get(route.params.playlistId);
  const [movies, setMovies] = useState<SearchMovie[]>(() => initialCache?.movies ?? []);
  const [loading, setLoading] = useState(() => !initialCache || initialCache.movies.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>(
    route.params.playlistId === WATCH_LATER_PLAYLIST_ID ? 'genre' : supportsManualSort ? 'manual' : 'recent',
  );
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [onlyOwnedStreamingServices, setOnlyOwnedStreamingServices] = useState(false);
  const [ownedStreamingServices, setOwnedStreamingServices] = useState<string[]>([]);
  const [reorderingMovieId, setReorderingMovieId] = useState<number | null>(null);
  const [totalCount, setTotalCount] = useState(() => initialCache?.totalCount ?? 0);
  const [hasMore, setHasMore] = useState(() => initialCache?.hasMore ?? false);
  const [nextOffset, setNextOffset] = useState(() => initialCache?.nextOffset ?? 0);
  const moviesRef = useRef(movies);
  const paginationRef = useRef({
    totalCount: initialCache?.totalCount ?? 0,
    hasMore: initialCache?.hasMore ?? false,
    nextOffset: initialCache?.nextOffset ?? 0,
  });
  const isLoadingPageRef = useRef(false);
  const hiddenPrefetchRef = useRef(false);
  const appendSequenceRef = useRef(0);

  useEffect(() => {
    moviesRef.current = movies;
  }, [movies]);

  useEffect(() => {
    paginationRef.current = { totalCount, hasMore, nextOffset };
  }, [hasMore, nextOffset, totalCount]);

  useEffect(() => {
    if (Platform.OS === 'android') {
      UIManager.setLayoutAnimationEnabledExperimental?.(true);
    }
  }, []);

  const canRemove = route.params.playlistId !== FAVORITES_PLAYLIST_ID && route.params.playlistId !== HISTORY_PLAYLIST_ID;
  const canReorder = supportsManualSort && sortMode === 'manual' && !query.trim();
  const availableSortOptions = useMemo(
    () => (supportsManualSort ? SORT_OPTIONS : SORT_OPTIONS.filter((option) => option.key !== 'manual')),
    [supportsManualSort],
  );

  useEffect(() => {
    if (!canReorder && reorderingMovieId) {
      setReorderingMovieId(null);
    }
  }, [canReorder, reorderingMovieId]);

  const updatePlaylistCache = useCallback(
    (nextMovies: SearchMovie[], nextTotalCount: number, nextHasMore: boolean, nextNextOffset: number) => {
      playlistMoviesCache.set(route.params.playlistId, {
        movies: nextMovies,
        totalCount: nextTotalCount,
        hasMore: nextHasMore,
        nextOffset: nextNextOffset,
      });
    },
    [route.params.playlistId],
  );

  const loadPlaylistPage = useCallback(async (options?: { reset?: boolean; silent?: boolean }) => {
    if (!session || isLoadingPageRef.current) {
      return;
    }

    const shouldReset = Boolean(options?.reset);
    const silent = Boolean(options?.silent);
    if (shouldReset) {
      hiddenPrefetchRef.current = false;
    }
    const currentLoadedCount = shouldReset ? 0 : moviesRef.current.length;
    if (shouldReset || currentLoadedCount === 0) {
      setLoading(true);
    } else if (!silent) {
      setLoadingMore(true);
    }
    isLoadingPageRef.current = true;
    const appendSequence = appendSequenceRef.current + 1;
    appendSequenceRef.current = appendSequence;

    try {
      const requestLimit = shouldReset ? INITIAL_PLAYLIST_PAGE_SIZE : PLAYLIST_PAGE_SIZE;
      const payload = await fetchPlaylistMoviesPage(session.token, route.params.playlistId, {
        limit: requestLimit,
        offset: shouldReset ? 0 : paginationRef.current.nextOffset,
      });
      setTotalCount(payload.total_count);
      setHasMore(payload.has_more);
      setNextOffset(payload.next_offset);
      const existingMovies = shouldReset ? [] : moviesRef.current;
      const targetMovies = [...existingMovies, ...payload.items];

      if (!payload.has_more || targetMovies.length >= Math.min(payload.total_count, INITIAL_PLAYLIST_PAGE_SIZE)) {
        hiddenPrefetchRef.current = false;
      }

      if (payload.items.length === 0) {
        setMovies(existingMovies);
        updatePlaylistCache(existingMovies, payload.total_count, payload.has_more, payload.next_offset);
        setError('');
        return;
      }

      if (shouldReset || currentLoadedCount === 0) {
        setMovies(targetMovies);
        updatePlaylistCache(targetMovies, payload.total_count, payload.has_more, payload.next_offset);
        setError('');
        return;
      }

      for (let start = 0; start < payload.items.length; start += APPEND_BATCH_SIZE) {
        if (appendSequenceRef.current !== appendSequence) {
          return;
        }

        const visibleCount = Math.min(start + APPEND_BATCH_SIZE, payload.items.length);
        const nextMovies = [...existingMovies, ...payload.items.slice(0, visibleCount)];
        setMovies(nextMovies);
        updatePlaylistCache(nextMovies, payload.total_count, payload.has_more, payload.next_offset);

        if (start === 0) {
          setLoading(false);
        }

        if (visibleCount < payload.items.length) {
          await delay(APPEND_BATCH_DELAY_MS);
        }
      }

      if (appendSequenceRef.current === appendSequence) {
        setMovies(targetMovies);
        updatePlaylistCache(targetMovies, payload.total_count, payload.has_more, payload.next_offset);
      }
      setError('');
    } catch (fetchError) {
      if (fetchError instanceof ApiError && fetchError.status === 401) {
        await signOut();
        return;
      }
      setError('Impossible de charger cette playlist.');
    } finally {
      isLoadingPageRef.current = false;
      setLoading(false);
      setLoadingMore(false);
    }
  }, [route.params.playlistId, session, signOut, updatePlaylistCache]);

  const loadOwnedStreamingServices = useCallback(async () => {
    if (!session || route.params.playlistId !== WATCH_LATER_PLAYLIST_ID) {
      return;
    }

    try {
      const preferences = await fetchProfilePreferences(session.token);
      setOwnedStreamingServices(preferences.owned_streaming_services ?? []);
    } catch (fetchError) {
      if (fetchError instanceof ApiError && fetchError.status === 401) {
        await signOut();
      }
    }
  }, [route.params.playlistId, session, signOut]);

  useEffect(() => {
    if (hiddenPrefetchRef.current || loading || loadingMore || !hasMore) {
      return;
    }

    if (movies.length > 0 && movies.length < Math.min(totalCount, INITIAL_PLAYLIST_PAGE_SIZE)) {
      hiddenPrefetchRef.current = true;
      void loadPlaylistPage({ silent: true });
    }
  }, [hasMore, loading, loadingMore, loadPlaylistPage, movies.length, totalCount]);

  useFocusEffect(
    useCallback(() => {
      if (moviesRef.current.length === 0) {
        void loadPlaylistPage({ reset: true });
      }
      void loadOwnedStreamingServices();
    }, [loadOwnedStreamingServices, loadPlaylistPage]),
  );

  const refreshPlaylist = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadPlaylistPage({ reset: true });
    } finally {
      setRefreshing(false);
    }
  }, [loadPlaylistPage]);

  const sortedMovies = useMemo(() => {
    const copy = [...movies];
    if (sortMode === 'manual') {
      copy.sort(compareManualOrder);
    } else if (sortMode === 'genre') {
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

    let filtered = copy;
    if (onlyOwnedStreamingServices && route.params.playlistId === WATCH_LATER_PLAYLIST_ID && ownedStreamingServices.length > 0) {
      filtered = filtered.filter((movie) =>
        matchesOwnedStreamingServices(movie.subscription_provider_names, ownedStreamingServices),
      );
    }

    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return filtered;
    }

    return filtered.filter((movie) => movie.title.toLowerCase().includes(trimmed));
  }, [movies, onlyOwnedStreamingServices, ownedStreamingServices, query, route.params.playlistId, sortMode]);

  const handleRemove = useCallback(async (movieId: number) => {
    if (!session || !canRemove) {
      return;
    }

    try {
      await removeMovieFromPlaylist(session.token, route.params.playlistId, movieId);
      setMovies((current) => {
        const nextMovies = current.filter((movie) => movie.id !== movieId);
        const nextTotalCount = Math.max(0, paginationRef.current.totalCount - 1);
        setTotalCount(nextTotalCount);
        updatePlaylistCache(
          nextMovies,
          nextTotalCount,
          paginationRef.current.hasMore,
          paginationRef.current.nextOffset,
        );
        return nextMovies;
      });
    } catch (actionError) {
      if (actionError instanceof ApiError && actionError.status === 401) {
        await signOut();
        return;
      }
      setError('Impossible de retirer ce film.');
    }
  }, [canRemove, route.params.playlistId, session, signOut, updatePlaylistCache]);

  const persistManualOrder = useCallback(
    async (orderedMovies: SearchMovie[]) => {
      if (!session) {
        return;
      }

      const indexedMovies = orderedMovies.map((movie, index) => ({ ...movie, sort_index: index + 1 }));
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMovies(indexedMovies);
      updatePlaylistCache(
        indexedMovies,
        paginationRef.current.totalCount,
        paginationRef.current.hasMore,
        paginationRef.current.nextOffset,
      );

      try {
        await reorderPlaylistMovies(session.token, route.params.playlistId, indexedMovies.map((movie) => movie.id));
        setError('');
      } catch (actionError) {
        void loadPlaylistPage({ reset: true });
        if (actionError instanceof ApiError && actionError.status === 401) {
          await signOut();
          return;
        }
        setError('Impossible de réordonner cette playlist.');
      }
    },
    [loadPlaylistPage, route.params.playlistId, session, signOut, updatePlaylistCache],
  );

  const handleReorderPress = useCallback(
    (targetMovieId: number) => {
      if (!canReorder || !reorderingMovieId) {
        return false;
      }

      if (reorderingMovieId === targetMovieId) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setReorderingMovieId(null);
        return true;
      }

      const orderedMovies = [...sortedMovies];
      const sourceIndex = orderedMovies.findIndex((movie) => movie.id === reorderingMovieId);
      const targetIndex = orderedMovies.findIndex((movie) => movie.id === targetMovieId);
      if (sourceIndex < 0 || targetIndex < 0) {
        setReorderingMovieId(null);
        return true;
      }

      const [movedMovie] = orderedMovies.splice(sourceIndex, 1);
      orderedMovies.splice(targetIndex, 0, movedMovie);
      setReorderingMovieId(null);
      void persistManualOrder(orderedMovies);
      return true;
    },
    [canReorder, persistManualOrder, reorderingMovieId, sortedMovies],
  );

  const headerComponent = (
    <View style={styles.headerContent}>
      <SearchField value={query} onChangeText={setQuery} placeholder="Rechercher un film" />
      <View style={styles.filtersRow}>
        <Pressable
          onPress={() => setIsSortMenuOpen((current) => !current)}
          style={[
            styles.filterChip,
            styles.sortTriggerChip,
            { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card },
            isSortMenuOpen && { borderColor: theme.colors.secondaryAccent, backgroundColor: theme.colors.accentSoft },
          ]}
        >
          <Ionicons name="swap-vertical" size={14} color={isSortMenuOpen ? theme.colors.text : theme.colors.textSoft} />
          <Text
            style={[
              styles.filterChipLabel,
              { color: theme.colors.textSoft },
              isSortMenuOpen && { color: theme.colors.text },
            ]}
          >
            Trier
          </Text>
          <Ionicons
            name={isSortMenuOpen ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={isSortMenuOpen ? theme.colors.text : theme.colors.textSoft}
          />
        </Pressable>
        {route.params.playlistId === WATCH_LATER_PLAYLIST_ID && ownedStreamingServices.length > 0 ? (
          <Pressable
            onPress={() => setOnlyOwnedStreamingServices((current) => !current)}
            style={[
              styles.filterChip,
              { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card },
              onlyOwnedStreamingServices && {
                borderColor: theme.colors.secondaryAccent,
                backgroundColor: theme.colors.accentSoft,
              },
            ]}
          >
            <Text
              style={[
                styles.filterChipLabel,
                { color: theme.colors.textSoft },
                onlyOwnedStreamingServices && { color: theme.colors.text },
              ]}
            >
              Mes plateformes
            </Text>
          </Pressable>
        ) : null}
      </View>
      {isSortMenuOpen ? (
        <View style={[styles.sortMenu, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
          {availableSortOptions.map((option) => {
            const isActive = sortMode === option.key;
            return (
              <Pressable
                key={option.key}
                onPress={() => {
                  setSortMode(option.key);
                  setIsSortMenuOpen(false);
                }}
                style={[
                  styles.sortOptionRow,
                  { borderColor: theme.rgba.border },
                  isActive && { backgroundColor: theme.colors.accentSoft },
                ]}
              >
                <Text style={[styles.sortOptionLabel, { color: theme.colors.textSoft }, isActive && { color: theme.colors.text }]}>
                  {option.label}
                </Text>
                {isActive ? <Ionicons name="checkmark" size={16} color={theme.colors.secondaryAccent} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {loading && movies.length === 0 ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={theme.colors.text} />
        </View>
      ) : null}
    </View>
  );

  return (
    <AppScreen scroll={false} contentStyle={{ flex: 1 }}>
      <View style={styles.headerRow}>
        <Pressable style={[styles.iconButton, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]} numberOfLines={1}>{route.params.name ?? 'Playlist'}</Text>
          <Text style={[styles.headerMeta, { color: theme.colors.textMuted }]}>
            {`${totalCount || movies.length} film(s)`}
          </Text>
        </View>
        <View style={styles.iconSpacer} />
      </View>

      {error ? <InlineBanner message={error} tone="error" /> : null}

      <FlatList
        data={sortedMovies}
        key={`playlist-${sortMode}-grid`}
        numColumns={3}
        columnWrapperStyle={styles.columns}
        keyExtractor={(item) => String(item.id)}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={headerComponent}
        contentContainerStyle={styles.listContent}
        onEndReachedThreshold={0.9}
        onEndReached={() => {
          if (!loading && !loadingMore && hasMore) {
            void loadPlaylistPage({ silent: true });
          }
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refreshPlaylist()}
            tintColor={theme.colors.text}
            colors={[theme.colors.secondaryAccent]}
            progressViewOffset={16}
          />
        }
        renderItem={({ item }) => {
          const isReordering = reorderingMovieId === item.id;
          return (
            <Pressable
              onPress={() => {
                if (handleReorderPress(item.id)) {
                  return;
                }
                navigation.navigate('MovieDetails', { movieId: item.id, title: item.title });
              }}
              onLongPress={canReorder ? () => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setReorderingMovieId(item.id);
              } : undefined}
              delayLongPress={220}
              style={[
                styles.movieCard,
                { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card },
                isReordering && styles.movieCardActive,
              ]}
            >
              <Image source={{ uri: item.poster_url || FALLBACK_POSTER }} style={styles.poster} />
              {canReorder ? (
                <View style={styles.dragBadge}>
                  <Ionicons name={isReordering ? 'checkmark' : 'reorder-three'} size={14} color="#ffffff" />
                </View>
              ) : null}
              {canRemove ? (
                <Pressable
                  style={styles.removeBadge}
                  onPress={(event) => {
                    event.stopPropagation();
                    void handleRemove(item.id);
                  }}
                >
                  <Ionicons name="close" size={12} color="#ffffff" />
                </Pressable>
              ) : null}
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(2,6,23,0)', 'rgba(2,6,23,0.06)', 'rgba(2,6,23,0.28)', 'rgba(2,6,23,0.72)', 'rgba(2,6,23,0.97)']}
                locations={[0, 0.22, 0.48, 0.76, 1]}
                style={styles.overlay}
              />
              <View style={styles.overlayContent}>
                <Text style={styles.movieTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.movieMeta} numberOfLines={1}>
                  {sortMode === 'genre' ? item.primary_genre ?? 'Autres' : formatPlaylistRating(item.rating, route.params.playlistId)}
                </Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <EmptyStateCard title="Aucun film" />
          ) : null
        }
        ListFooterComponent={hasMore ? <View style={styles.footerSpacer} /> : null}
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
  sortTriggerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  footerLoader: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  footerSpacer: {
    height: 10,
  },
  sortMenu: {
    gap: 6,
    borderRadius: 20,
    borderWidth: 1,
    padding: 8,
  },
  sortOptionRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sortOptionLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
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
    height: '46%',
  },
  overlayContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
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
  dragBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 2,
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  movieCardActive: {
    borderColor: 'rgba(125,211,252,0.65)',
    backgroundColor: 'rgba(14,165,233,0.10)',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6,
  },
});

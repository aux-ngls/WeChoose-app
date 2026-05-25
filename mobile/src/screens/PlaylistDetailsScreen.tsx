import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  movePlaylistMovie,
  removeMovieFromPlaylist,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeContext';
import { buildUserCacheKey, readPersistentCache, writePersistentCache } from '../utils/persistentCache';
import {
  FALLBACK_POSTER,
  FAVORITES_PLAYLIST_ID,
  HISTORY_PLAYLIST_ID,
  type SearchMovie,
  WATCH_LATER_PLAYLIST_ID,
} from '../types';

const SORT_OPTIONS = [
  { key: 'manual', label: 'Ordre personnalisé' },
  { key: 'genre', label: 'Genre' },
  { key: 'recent', label: "Date d'ajout : le plus récent" },
  { key: 'oldest', label: "Date d'ajout : le plus ancien" },
  { key: 'rating', label: 'Mieux notés' },
] as const;

type SortMode = (typeof SORT_OPTIONS)[number]['key'];
type BufferedPage = {
  items: SearchMovie[];
  nextOffset: number;
  hasMore: boolean;
};

type PlaylistCacheEntry = {
  movies: SearchMovie[];
  totalCount: number;
  hasMore: boolean;
  nextOffset: number;
  bufferedPage: BufferedPage | null;
};

type PlaylistOfflineSnapshot = {
  movies: SearchMovie[];
  totalCount: number;
  updatedAt: string;
};

const INITIAL_PLAYLIST_PAGE_SIZE = 120;
const PLAYLIST_PAGE_SIZE = 72;
const SEARCH_DEBOUNCE_MS = 220;
const MAX_PERSISTED_PLAYLIST_MOVIES = 240;
const PERSISTED_PLAYLIST_SCOPE = 'playlist-screen';

const playlistMoviesCache = new Map<string, PlaylistCacheEntry>();

function buildPlaylistCacheKey(
  playlistId: number,
  sortMode: SortMode,
  query: string,
  onlyOwnedStreamingServices: boolean,
) {
  return [playlistId, sortMode, query.trim().toLowerCase(), onlyOwnedStreamingServices ? 'owned' : 'all'].join(':');
}

function mergeUniqueMovies(currentMovies: SearchMovie[], nextMovies: SearchMovie[]) {
  const mergedMovies = [...currentMovies];
  const knownMovieIds = new Set(currentMovies.map((movie) => movie.id));
  for (const movie of nextMovies) {
    if (knownMovieIds.has(movie.id)) {
      continue;
    }
    knownMovieIds.add(movie.id);
    mergedMovies.push(movie);
  }
  return mergedMovies;
}

function mergeSnapshotMovies(currentMovies: SearchMovie[], nextMovies: SearchMovie[]) {
  const mergedById = new Map<number, SearchMovie>();
  for (const movie of currentMovies) {
    mergedById.set(movie.id, movie);
  }
  for (const movie of nextMovies) {
    mergedById.set(movie.id, movie);
  }

  return Array.from(mergedById.values()).sort((leftMovie, rightMovie) => {
    if (typeof leftMovie.sort_index === 'number' && typeof rightMovie.sort_index === 'number') {
      return leftMovie.sort_index - rightMovie.sort_index;
    }
    const leftAddedAt = leftMovie.added_at ? Date.parse(leftMovie.added_at) : 0;
    const rightAddedAt = rightMovie.added_at ? Date.parse(rightMovie.added_at) : 0;
    if (leftAddedAt !== rightAddedAt) {
      return rightAddedAt - leftAddedAt;
    }
    return leftMovie.title.localeCompare(rightMovie.title, 'fr', { sensitivity: 'base' });
  });
}

function sortPlaylistMoviesLocally(movies: SearchMovie[], sortMode: SortMode) {
  return [...movies].sort((leftMovie, rightMovie) => {
    if (sortMode === 'manual') {
      const leftSortIndex = typeof leftMovie.sort_index === 'number' ? leftMovie.sort_index : Number.MAX_SAFE_INTEGER;
      const rightSortIndex = typeof rightMovie.sort_index === 'number' ? rightMovie.sort_index : Number.MAX_SAFE_INTEGER;
      if (leftSortIndex !== rightSortIndex) {
        return leftSortIndex - rightSortIndex;
      }
      return leftMovie.title.localeCompare(rightMovie.title, 'fr', { sensitivity: 'base' });
    }

    if (sortMode === 'genre') {
      const leftGenre = leftMovie.primary_genre?.trim().toLowerCase() ?? 'zzzz';
      const rightGenre = rightMovie.primary_genre?.trim().toLowerCase() ?? 'zzzz';
      if (leftGenre !== rightGenre) {
        return leftGenre.localeCompare(rightGenre, 'fr', { sensitivity: 'base' });
      }
      return leftMovie.title.localeCompare(rightMovie.title, 'fr', { sensitivity: 'base' });
    }

    if (sortMode === 'recent' || sortMode === 'oldest') {
      const leftAddedAt = leftMovie.added_at ? Date.parse(leftMovie.added_at) : 0;
      const rightAddedAt = rightMovie.added_at ? Date.parse(rightMovie.added_at) : 0;
      if (leftAddedAt !== rightAddedAt) {
        return sortMode === 'recent' ? rightAddedAt - leftAddedAt : leftAddedAt - rightAddedAt;
      }
      return leftMovie.title.localeCompare(rightMovie.title, 'fr', { sensitivity: 'base' });
    }

    if (rightMovie.rating !== leftMovie.rating) {
      return rightMovie.rating - leftMovie.rating;
    }

    return leftMovie.title.localeCompare(rightMovie.title, 'fr', { sensitivity: 'base' });
  });
}

function buildOfflinePlaylistEntry(
  snapshot: PlaylistOfflineSnapshot | null,
  sortMode: SortMode,
  query: string,
  onlyOwnedStreamingServices: boolean,
  ownedStreamingServices: string[],
): PlaylistCacheEntry | null {
  if (!snapshot || snapshot.movies.length === 0) {
    return null;
  }

  const normalizedQuery = query.trim().toLowerCase();
  const normalizedOwnedServices = new Set(ownedStreamingServices.map((service) => service.trim().toLowerCase()));
  const hasStreamingMetadata = snapshot.movies.some(
    (movie) => Array.isArray(movie.subscription_provider_names) && movie.subscription_provider_names.length > 0,
  );
  if (onlyOwnedStreamingServices && normalizedOwnedServices.size > 0 && !hasStreamingMetadata) {
    return null;
  }
  const filteredMovies = snapshot.movies.filter((movie) => {
    if (normalizedQuery && !movie.title.toLowerCase().includes(normalizedQuery)) {
      return false;
    }

    if (!onlyOwnedStreamingServices) {
      return true;
    }

    if (normalizedOwnedServices.size === 0) {
      return true;
    }

    const providerNames = movie.subscription_provider_names ?? [];
    if (providerNames.length === 0) {
      return false;
    }

    return providerNames.some((providerName) => normalizedOwnedServices.has(providerName.trim().toLowerCase()));
  });

  const sortedMovies = sortPlaylistMoviesLocally(filteredMovies, sortMode);
  const initialItems = sortedMovies.slice(0, INITIAL_PLAYLIST_PAGE_SIZE);
  const nextItems = sortedMovies.slice(INITIAL_PLAYLIST_PAGE_SIZE, INITIAL_PLAYLIST_PAGE_SIZE + PLAYLIST_PAGE_SIZE);
  const nextOffset = initialItems.length;
  const hasMore = sortedMovies.length > initialItems.length;

  return {
    movies: initialItems,
    totalCount: sortedMovies.length,
    hasMore,
    nextOffset,
    bufferedPage:
      nextItems.length > 0
        ? {
            items: nextItems,
            nextOffset: Math.min(sortedMovies.length, INITIAL_PLAYLIST_PAGE_SIZE + PLAYLIST_PAGE_SIZE),
            hasMore: sortedMovies.length > INITIAL_PLAYLIST_PAGE_SIZE + PLAYLIST_PAGE_SIZE,
          }
        : null,
  };
}

function formatPlaylistRating(rating: number, playlistId: number) {
  const scale = playlistId === FAVORITES_PLAYLIST_ID || playlistId === HISTORY_PLAYLIST_ID ? 5 : 10;
  return `${rating.toFixed(1)} / ${scale}`;
}

export default function PlaylistDetailsScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'PlaylistDetails'>) {
  const { session, signOut } = useAuth();
  const { theme } = useTheme();
  const supportsManualSort =
    route.params.playlistId !== FAVORITES_PLAYLIST_ID && route.params.playlistId !== HISTORY_PLAYLIST_ID;
  const initialSortMode: SortMode =
    route.params.playlistId === WATCH_LATER_PLAYLIST_ID ? 'genre' : supportsManualSort ? 'manual' : 'recent';
  const initialCacheKey = buildPlaylistCacheKey(route.params.playlistId, initialSortMode, '', false);
  const initialCache = playlistMoviesCache.get(initialCacheKey);
  const [movies, setMovies] = useState<SearchMovie[]>(() => initialCache?.movies ?? []);
  const [loading, setLoading] = useState(() => !initialCache || initialCache.movies.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>(initialSortMode);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [onlyOwnedStreamingServices, setOnlyOwnedStreamingServices] = useState(false);
  const [ownedStreamingServices, setOwnedStreamingServices] = useState<string[]>([]);
  const [reorderingMovieId, setReorderingMovieId] = useState<number | null>(null);
  const [totalCount, setTotalCount] = useState(() => initialCache?.totalCount ?? 0);
  const [hasMore, setHasMore] = useState(() => initialCache?.hasMore ?? false);
  const [nextOffset, setNextOffset] = useState(() => initialCache?.nextOffset ?? 0);
  const [bufferedPage, setBufferedPage] = useState<BufferedPage | null>(() => initialCache?.bufferedPage ?? null);
  const [dataCacheKey, setDataCacheKey] = useState(initialCacheKey);
  const listRef = useRef<FlatList<SearchMovie> | null>(null);
  const moviesRef = useRef(movies);
  const totalCountRef = useRef(totalCount);
  const hasMoreRef = useRef(hasMore);
  const nextOffsetRef = useRef(nextOffset);
  const bufferedPageRef = useRef(bufferedPage);
  const generationRef = useRef(0);
  const prefetchInFlightRef = useRef(false);
  const offlineSnapshotRef = useRef<PlaylistOfflineSnapshot | null>(null);
  const cacheKey = useMemo(
    () => buildPlaylistCacheKey(route.params.playlistId, sortMode, debouncedQuery, onlyOwnedStreamingServices),
    [debouncedQuery, onlyOwnedStreamingServices, route.params.playlistId, sortMode],
  );
  const persistentCacheKey = useMemo(
    () => buildUserCacheKey(PERSISTED_PLAYLIST_SCOPE, session?.username, String(route.params.playlistId)),
    [route.params.playlistId, session?.username],
  );

  useEffect(() => {
    moviesRef.current = movies;
  }, [movies]);

  useEffect(() => {
    totalCountRef.current = totalCount;
  }, [totalCount]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    nextOffsetRef.current = nextOffset;
  }, [nextOffset]);

  useEffect(() => {
    bufferedPageRef.current = bufferedPage;
  }, [bufferedPage]);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (Platform.OS === 'android') {
      UIManager.setLayoutAnimationEnabledExperimental?.(true);
    }
  }, []);

  const canRemove = route.params.playlistId !== FAVORITES_PLAYLIST_ID && route.params.playlistId !== HISTORY_PLAYLIST_ID;
  const canReorder = supportsManualSort && sortMode === 'manual' && !debouncedQuery && !onlyOwnedStreamingServices;
  const availableSortOptions = useMemo(
    () => (supportsManualSort ? SORT_OPTIONS : SORT_OPTIONS.filter((option) => option.key !== 'manual')),
    [supportsManualSort],
  );

  useEffect(() => {
    playlistMoviesCache.set(dataCacheKey, {
      movies,
      totalCount,
      hasMore,
      nextOffset,
      bufferedPage,
    });
  }, [bufferedPage, dataCacheKey, hasMore, movies, nextOffset, totalCount]);

  useEffect(() => {
    if (!session) {
      offlineSnapshotRef.current = null;
      return;
    }

    let isCancelled = false;

    const hydrateOfflineSnapshot = async () => {
      const cachedSnapshot = await readPersistentCache<PlaylistOfflineSnapshot>(persistentCacheKey);
      if (isCancelled || !cachedSnapshot) {
        return;
      }

      offlineSnapshotRef.current = cachedSnapshot;
      if (moviesRef.current.length > 0) {
        return;
      }

      const offlineEntry = buildOfflinePlaylistEntry(
        cachedSnapshot,
        sortMode,
        debouncedQuery,
        onlyOwnedStreamingServices,
        ownedStreamingServices,
      );

      if (!offlineEntry) {
        return;
      }

      startTransition(() => setMovies(offlineEntry.movies));
      setTotalCount(offlineEntry.totalCount);
      setHasMore(offlineEntry.hasMore);
      setNextOffset(offlineEntry.nextOffset);
      setBufferedPage(offlineEntry.bufferedPage);
      setDataCacheKey(cacheKey);
      setLoading(false);
      setLoadingMore(false);
      setError('');
    };

    void hydrateOfflineSnapshot();

    return () => {
      isCancelled = true;
    };
  }, [cacheKey, debouncedQuery, onlyOwnedStreamingServices, ownedStreamingServices, persistentCacheKey, session, sortMode]);

  useEffect(() => {
    if (!session || debouncedQuery || onlyOwnedStreamingServices || movies.length === 0) {
      return;
    }

    const mergedMovies = mergeSnapshotMovies(offlineSnapshotRef.current?.movies ?? [], movies).slice(
      0,
      MAX_PERSISTED_PLAYLIST_MOVIES,
    );
    const snapshot: PlaylistOfflineSnapshot = {
      movies: mergedMovies,
      totalCount: Math.max(totalCount, mergedMovies.length),
      updatedAt: new Date().toISOString(),
    };
    offlineSnapshotRef.current = snapshot;
    void writePersistentCache(persistentCacheKey, snapshot);
  }, [debouncedQuery, movies, onlyOwnedStreamingServices, persistentCacheKey, session, totalCount]);

  useEffect(() => {
    if (!canReorder && reorderingMovieId) {
      setReorderingMovieId(null);
    }
  }, [canReorder, reorderingMovieId]);

  const fetchPage = useCallback(
    async (offset: number, limit: number, generation: number) => {
      if (!session) {
        return null;
      }

      const payload = await fetchPlaylistMoviesPage(session.token, route.params.playlistId, {
        limit,
        offset,
        sort: sortMode,
        query: debouncedQuery,
        onlyOwnedStreamingServices,
      });

      if (generation !== generationRef.current) {
        return null;
      }

      return payload;
    },
    [debouncedQuery, onlyOwnedStreamingServices, route.params.playlistId, session, sortMode],
  );

  const applyVisiblePage = useCallback(
    (
      requestCacheKey: string,
      payload: Awaited<ReturnType<typeof fetchPlaylistMoviesPage>>,
      options?: { append?: boolean },
    ) => {
      const nextMovies = options?.append ? mergeUniqueMovies(moviesRef.current, payload.items) : payload.items;
      startTransition(() => setMovies(nextMovies));
      setTotalCount(payload.playlist_total_count);
      setHasMore(payload.has_more);
      setNextOffset(payload.next_offset);
      setDataCacheKey(requestCacheKey);
      setError('');
    },
    [],
  );

  const startBackgroundPrefetch = useCallback(
    async (generation: number, requestCacheKey: string, offset: number, shouldPrefetch: boolean) => {
      if (!shouldPrefetch || prefetchInFlightRef.current) {
        return;
      }

      prefetchInFlightRef.current = true;
      try {
        const payload = await fetchPage(offset, PLAYLIST_PAGE_SIZE, generation);
        if (!payload) {
          return;
        }
        setBufferedPage({
          items: payload.items,
          nextOffset: payload.next_offset,
          hasMore: payload.has_more,
        });
        setDataCacheKey(requestCacheKey);
      } catch (fetchError) {
        if (fetchError instanceof ApiError && fetchError.status === 401) {
          await signOut();
        }
      } finally {
        prefetchInFlightRef.current = false;
      }
    },
    [fetchPage, signOut],
  );

  const loadInitialPage = useCallback(
    async (generation: number, requestCacheKey: string, options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setLoading(true);
      }
      setLoadingMore(false);
      setBufferedPage(null);
      prefetchInFlightRef.current = false;

      try {
        const payload = await fetchPage(0, INITIAL_PLAYLIST_PAGE_SIZE, generation);
        if (!payload) {
          return;
        }

        applyVisiblePage(requestCacheKey, payload);
        if (payload.resolved_sort !== sortMode) {
          setSortMode(payload.resolved_sort);
        }
        if (payload.has_more) {
          void startBackgroundPrefetch(generation, requestCacheKey, payload.next_offset, payload.has_more);
        }
      } catch (fetchError) {
        if (fetchError instanceof ApiError && fetchError.status === 401) {
          await signOut();
          return;
        }
        if (generation === generationRef.current) {
          const offlineEntry = buildOfflinePlaylistEntry(
            offlineSnapshotRef.current,
            sortMode,
            debouncedQuery,
            onlyOwnedStreamingServices,
            ownedStreamingServices,
          );
          if (offlineEntry) {
            applyVisiblePage(requestCacheKey, {
              items: offlineEntry.movies,
              playlist_total_count: offlineEntry.totalCount,
              next_offset: offlineEntry.nextOffset,
              has_more: offlineEntry.hasMore,
              resolved_sort: sortMode,
            });
            setBufferedPage(offlineEntry.bufferedPage);
            return;
          }
          setError('Impossible de charger cette playlist.');
        }
      } finally {
        if (generation === generationRef.current) {
          setLoading(false);
        }
      }
    },
    [
      applyVisiblePage,
      debouncedQuery,
      fetchPage,
      onlyOwnedStreamingServices,
      ownedStreamingServices,
      signOut,
      sortMode,
      startBackgroundPrefetch,
    ],
  );

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
    if (!session) {
      return;
    }

    generationRef.current += 1;
    const generation = generationRef.current;
    const cachedPage = playlistMoviesCache.get(cacheKey);
    const offlineEntry = buildOfflinePlaylistEntry(
      offlineSnapshotRef.current,
      sortMode,
      debouncedQuery,
      onlyOwnedStreamingServices,
      ownedStreamingServices,
    );
    setError('');

    if (cachedPage) {
      startTransition(() => setMovies(cachedPage.movies));
      setTotalCount(cachedPage.totalCount);
      setHasMore(cachedPage.hasMore);
      setNextOffset(cachedPage.nextOffset);
      setBufferedPage(cachedPage.bufferedPage);
      setDataCacheKey(cacheKey);
      setLoading(false);
      setLoadingMore(false);
      if (!cachedPage.bufferedPage && cachedPage.hasMore) {
        void startBackgroundPrefetch(generation, cacheKey, cachedPage.nextOffset, cachedPage.hasMore);
        }
        return;
      }

    if (offlineEntry) {
      startTransition(() => setMovies(offlineEntry.movies));
      setTotalCount(offlineEntry.totalCount);
      setHasMore(offlineEntry.hasMore);
      setNextOffset(offlineEntry.nextOffset);
      setBufferedPage(offlineEntry.bufferedPage);
      setDataCacheKey(cacheKey);
      setLoading(false);
      setLoadingMore(false);
      void loadInitialPage(generation, cacheKey, { silent: true });
      return;
    }

    startTransition(() => setMovies([]));
    setTotalCount(0);
    setHasMore(false);
    setNextOffset(0);
    setBufferedPage(null);
    setDataCacheKey(cacheKey);
    void loadInitialPage(generation, cacheKey);
  }, [
    cacheKey,
    debouncedQuery,
    loadInitialPage,
    onlyOwnedStreamingServices,
    ownedStreamingServices,
    session,
    sortMode,
    startBackgroundPrefetch,
  ]);

  useFocusEffect(
    useCallback(() => {
      void loadOwnedStreamingServices();
      if (session && moviesRef.current.length === 0) {
        generationRef.current += 1;
        void loadInitialPage(generationRef.current, cacheKey);
      } else if (session && !bufferedPageRef.current && hasMoreRef.current) {
        void startBackgroundPrefetch(generationRef.current, cacheKey, nextOffsetRef.current, hasMoreRef.current);
      }
    }, [cacheKey, loadInitialPage, loadOwnedStreamingServices, session, startBackgroundPrefetch]),
  );

  const refreshPlaylist = useCallback(async () => {
    setRefreshing(true);
    try {
      generationRef.current += 1;
      await loadInitialPage(generationRef.current, cacheKey, { silent: moviesRef.current.length > 0 });
    } finally {
      setRefreshing(false);
    }
  }, [cacheKey, loadInitialPage]);

  const handleRemove = useCallback(async (movieId: number) => {
    if (!session || !canRemove) {
      return;
    }

    try {
      await removeMovieFromPlaylist(session.token, route.params.playlistId, movieId);
      setMovies((current) => {
        const nextMovies = current.filter((movie) => movie.id !== movieId);
        const nextTotalCount = Math.max(0, totalCountRef.current - 1);
        setTotalCount(nextTotalCount);
        setNextOffset((currentOffset) => Math.max(nextMovies.length, currentOffset - 1));
        setBufferedPage(null);
        return nextMovies;
      });
      setError('');
    } catch (actionError) {
      if (actionError instanceof ApiError && actionError.status === 401) {
        await signOut();
        return;
      }
      setError('Impossible de retirer ce film.');
    }
  }, [canRemove, route.params.playlistId, session, signOut]);

  const persistManualMove = useCallback(
    async (sourceMovieId: number, targetMovieId: number, orderedMovies: SearchMovie[]) => {
      if (!session) {
        return;
      }

      const indexedMovies = orderedMovies.map((movie, index) => ({ ...movie, sort_index: index + 1 }));
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      startTransition(() => setMovies(indexedMovies));
      setBufferedPage(null);

      try {
        await movePlaylistMovie(session.token, route.params.playlistId, sourceMovieId, targetMovieId);
        setError('');
        if (hasMoreRef.current) {
          void startBackgroundPrefetch(generationRef.current, cacheKey, nextOffsetRef.current, hasMoreRef.current);
        }
      } catch (actionError) {
        generationRef.current += 1;
        void loadInitialPage(generationRef.current, cacheKey, { silent: true });
        if (actionError instanceof ApiError && actionError.status === 401) {
          await signOut();
          return;
        }
        setError('Impossible de réordonner cette playlist.');
      }
    },
    [cacheKey, loadInitialPage, route.params.playlistId, session, signOut, startBackgroundPrefetch],
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

      const orderedMovies = [...moviesRef.current];
      const sourceIndex = orderedMovies.findIndex((movie) => movie.id === reorderingMovieId);
      const targetIndex = orderedMovies.findIndex((movie) => movie.id === targetMovieId);
      if (sourceIndex < 0 || targetIndex < 0) {
        setReorderingMovieId(null);
        return true;
      }

      const [movedMovie] = orderedMovies.splice(sourceIndex, 1);
      orderedMovies.splice(targetIndex, 0, movedMovie);
      setReorderingMovieId(null);
      void persistManualMove(reorderingMovieId, targetMovieId, orderedMovies);
      return true;
    },
    [cacheKey, canReorder, persistManualMove, reorderingMovieId],
  );

  const handleEndReached = useCallback(async () => {
    if (!session || loading || loadingMore || !hasMoreRef.current) {
      return;
    }

    const generation = generationRef.current;
    const currentBufferedPage = bufferedPageRef.current;
    if (currentBufferedPage?.items.length) {
      applyVisiblePage(
        cacheKey,
        {
          items: currentBufferedPage.items,
          playlist_total_count: totalCountRef.current,
          next_offset: currentBufferedPage.nextOffset,
          has_more: currentBufferedPage.hasMore,
          resolved_sort: sortMode,
        },
        { append: true },
      );
      setBufferedPage(null);
      if (currentBufferedPage.hasMore) {
        void startBackgroundPrefetch(generation, cacheKey, currentBufferedPage.nextOffset, currentBufferedPage.hasMore);
      }
      return;
    }

    setLoadingMore(true);
    try {
      const payload = await fetchPage(nextOffsetRef.current, PLAYLIST_PAGE_SIZE, generation);
      if (!payload) {
        return;
      }
      applyVisiblePage(cacheKey, payload, { append: true });
      if (payload.has_more) {
        void startBackgroundPrefetch(generation, cacheKey, payload.next_offset, payload.has_more);
      }
    } catch (fetchError) {
      if (fetchError instanceof ApiError && fetchError.status === 401) {
        await signOut();
        return;
      }
      setError('Impossible de charger la suite de cette playlist.');
    } finally {
      if (generation === generationRef.current) {
        setLoadingMore(false);
      }
    }
  }, [applyVisiblePage, cacheKey, fetchPage, loading, loadingMore, session, signOut, sortMode, startBackgroundPrefetch]);

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
        ref={listRef}
        data={movies}
        key={`playlist-${cacheKey}-grid`}
        numColumns={3}
        columnWrapperStyle={styles.columns}
        keyExtractor={(item) => String(item.id)}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        initialNumToRender={18}
        maxToRenderPerBatch={12}
        updateCellsBatchingPeriod={16}
        windowSize={9}
        removeClippedSubviews={Platform.OS !== 'web'}
        ListHeaderComponent={headerComponent}
        contentContainerStyle={styles.listContent}
        onEndReachedThreshold={0.65}
        onEndReached={() => void handleEndReached()}
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
        ListFooterComponent={
          loadingMore && !bufferedPage ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator color={theme.colors.textMuted} />
            </View>
          ) : hasMore ? (
            <View style={styles.footerSpacer} />
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

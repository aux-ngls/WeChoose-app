import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  DeviceEventEmitter,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AppScreen from '../components/AppScreen';
import EmptyStateCard from '../components/EmptyStateCard';
import InlineBanner from '../components/InlineBanner';
import StarRatingInput from '../components/StarRatingInput';
import {
  addToWatchLater,
  ApiError,
  fetchMovieFeed,
  getOnboardingPreferences,
  rateMovie,
  recordRecommendationImpression,
  removeMovieFromPlaylist,
  removeMovieRating,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeContext';
import { FALLBACK_POSTER, type SearchMovie, WATCH_LATER_PLAYLIST_ID } from '../types';

const TARGET_STACK_SIZE = 14;
const REFILL_THRESHOLD = 8;
const FEED_BATCH_SIZE = 24;
const CACHE_MAX_SIZE = 32;
const CACHE_VERSION = 2;
const SWIPE_THRESHOLD = 110;
const SWIPE_VELOCITY_THRESHOLD = 0.35;
const OFFSCREEN_DISTANCE = 420;
const TINDER_MOVIE_ACTION_EVENT = 'qulte:tinder-movie-action';

type SwipeDirection = 'left' | 'right';

interface UndoableAction {
  type: 'swipe-left' | 'swipe-right' | 'rating';
  movie: SearchMovie;
  rating?: number;
}

interface TinderMovieCache {
  version: number;
  username: string;
  movies: SearchMovie[];
  fetchedAt: number;
}

let tinderMovieCache: TinderMovieCache | null = null;

function getTinderCacheKey(username: string) {
  return `qulte:tinder-stack:${username}:v${CACHE_VERSION}`;
}

function isSearchMovie(value: unknown): value is SearchMovie {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const movie = value as Partial<SearchMovie>;
  return typeof movie.id === 'number' && typeof movie.title === 'string' && typeof movie.rating === 'number';
}

function parseCachedMovies(rawValue: string | null, username: string): SearchMovie[] {
  if (!rawValue) {
    return [];
  }

  try {
    const payload = JSON.parse(rawValue) as Partial<TinderMovieCache>;
    if (payload.version !== CACHE_VERSION || payload.username !== username || !Array.isArray(payload.movies)) {
      return [];
    }
    return payload.movies.filter(isSearchMovie).slice(0, CACHE_MAX_SIZE);
  } catch {
    return [];
  }
}

function prefetchMoviePosters(movies: SearchMovie[]) {
  movies.slice(0, 12).forEach((movie) => {
    if (movie.poster_url) {
      void Image.prefetch(movie.poster_url);
    }
  });
}

export default function HomeScreen() {
  const { session, signOut } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const initialCache =
    tinderMovieCache && tinderMovieCache.username === session?.username && tinderMovieCache.version === CACHE_VERSION
      ? tinderMovieCache
      : null;
  const [movies, setMovies] = useState<SearchMovie[]>(() => initialCache?.movies ?? []);
  const [loading, setLoading] = useState(() => !initialCache || initialCache.movies.length === 0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [selectedRating, setSelectedRating] = useState(0);
  const [lastUndoableAction, setLastUndoableAction] = useState<UndoableAction | null>(null);
  const isFetchingRef = useRef(false);
  const locallyExcludedMovieIdsRef = useRef<Set<number>>(new Set());
  const onboardingExcludedMovieIdsRef = useRef<Set<number>>(new Set());
  const hasLoadedOnboardingExcludesRef = useRef(false);
  const moviesRef = useRef(movies);
  const lastFetchAtRef = useRef(initialCache?.fetchedAt ?? 0);
  const lastRecordedImpressionMovieIdRef = useRef<number | null>(null);
  const pan = useRef(new Animated.ValueXY()).current;

  const currentMovie = useMemo(() => movies[0] ?? null, [movies]);
  const secondMovie = useMemo(() => movies[1] ?? null, [movies]);

  useEffect(() => {
    locallyExcludedMovieIdsRef.current.clear();
    onboardingExcludedMovieIdsRef.current.clear();
    hasLoadedOnboardingExcludesRef.current = false;
    lastRecordedImpressionMovieIdRef.current = null;
  }, [session?.username]);

  useEffect(() => {
    pan.setValue({ x: 0, y: 0 });
    setSelectedRating(0);
  }, [currentMovie?.id, pan]);

  useEffect(() => {
    if (!session || !currentMovie || lastRecordedImpressionMovieIdRef.current === currentMovie.id) {
      return;
    }

    lastRecordedImpressionMovieIdRef.current = currentMovie.id;
    void recordRecommendationImpression(session.token, currentMovie).catch((impressionError) => {
      if (impressionError instanceof ApiError && impressionError.status === 401) {
        void signOut();
      }
    });
  }, [currentMovie, session, signOut]);

  useEffect(() => {
    moviesRef.current = movies;
    prefetchMoviePosters(movies);

    if (!session || movies.length === 0) {
      return;
    }

    const payload: TinderMovieCache = {
      version: CACHE_VERSION,
      username: session.username,
      movies: movies.slice(0, CACHE_MAX_SIZE),
      fetchedAt: lastFetchAtRef.current || Date.now(),
    };
    tinderMovieCache = payload;
    void AsyncStorage.setItem(getTinderCacheKey(session.username), JSON.stringify(payload));
  }, [movies, session]);

  const rememberExcludedMovieIds = useCallback((movieIds: number[]) => {
    const excludedMovieIds = locallyExcludedMovieIdsRef.current;
    movieIds.forEach((movieId) => excludedMovieIds.add(movieId));

    while (excludedMovieIds.size > 120) {
      const oldestMovieId = excludedMovieIds.values().next().value;
      if (typeof oldestMovieId !== 'number') {
        break;
      }
      excludedMovieIds.delete(oldestMovieId);
    }
  }, []);

  const forgetExcludedMovieId = useCallback((movieId: number) => {
    locallyExcludedMovieIdsRef.current.delete(movieId);
  }, []);

  const getKnownExcludedMovieIds = useCallback(
    () => Array.from(new Set([...locallyExcludedMovieIdsRef.current, ...onboardingExcludedMovieIdsRef.current])),
    [],
  );

  const filterExcludedMovies = useCallback((movieStack: SearchMovie[]) => {
    const excludedMovieIds = new Set(getKnownExcludedMovieIds());
    return movieStack.filter((movie) => !excludedMovieIds.has(movie.id));
  }, [getKnownExcludedMovieIds]);

  const loadOnboardingExcludes = useCallback(async () => {
    if (!session || hasLoadedOnboardingExcludesRef.current) {
      return;
    }

    try {
      const preferences = await getOnboardingPreferences(session.token);
      const onboardingMovieIds = preferences.favorite_movie_ids.filter((movieId) => typeof movieId === 'number');
      hasLoadedOnboardingExcludesRef.current = true;
      onboardingMovieIds.forEach((movieId) => onboardingExcludedMovieIdsRef.current.add(movieId));

      if (onboardingMovieIds.length === 0) {
        return;
      }

      setMovies((current) => {
        const next = filterExcludedMovies(current);
        moviesRef.current = next;
        return next;
      });
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) {
        await signOut();
      }
    }
  }, [filterExcludedMovies, session, signOut]);

  const hydrateCachedMovies = useCallback(async () => {
    if (!session || moviesRef.current.length > 0) {
      return moviesRef.current.length > 0;
    }

    const cachedMovies = filterExcludedMovies(parseCachedMovies(
      await AsyncStorage.getItem(getTinderCacheKey(session.username)),
      session.username,
    ));
    if (cachedMovies.length === 0) {
      return false;
    }

    tinderMovieCache = {
      version: CACHE_VERSION,
      username: session.username,
      movies: cachedMovies,
      fetchedAt: Date.now(),
    };
    lastFetchAtRef.current = Date.now();
    moviesRef.current = cachedMovies;
    prefetchMoviePosters(cachedMovies);
    setMovies(cachedMovies);
    setLoading(false);
    return true;
  }, [filterExcludedMovies, session]);

  const loadFeed = useCallback(async (excludeIds: number[] = [], options?: { reset?: boolean }) => {
    if (!session || isFetchingRef.current) {
      return;
    }

    if (moviesRef.current.length === 0 && !options?.reset) {
      setLoading(true);
    }

    isFetchingRef.current = true;
    try {
      const effectiveExcludeIds = Array.from(new Set([...excludeIds, ...getKnownExcludedMovieIds()]));
      const payload = await fetchMovieFeed(session.token, {
        excludeIds: effectiveExcludeIds,
        limit: FEED_BATCH_SIZE,
        mode: 'tinder',
      });

      setMovies((current) => {
        const base = options?.reset ? [] : current;
        const existingIds = new Set(base.map((movie) => movie.id));
        const excludedIds = new Set(effectiveExcludeIds);
        const next = payload.filter((movie) => !existingIds.has(movie.id) && !excludedIds.has(movie.id));
        const nextStack = [...base, ...next].slice(0, CACHE_MAX_SIZE);
        moviesRef.current = nextStack;
        prefetchMoviePosters(nextStack);
        return nextStack;
      });
      lastFetchAtRef.current = Date.now();
      setError('');
    } catch (fetchError) {
      if (fetchError instanceof ApiError && fetchError.status === 401) {
        await signOut();
        return;
      }
      setError('Impossible de charger les recommandations.');
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  }, [getKnownExcludedMovieIds, session, signOut]);

  useFocusEffect(
    useCallback(() => {
      if (!session) {
        return;
      }
      void (async () => {
        await loadOnboardingExcludes();
        let hasMovies = moviesRef.current.length > 0;
        if (!hasMovies) {
          hasMovies = await hydrateCachedMovies();
        }

        const currentStack = moviesRef.current;
        if (!hasMovies || currentStack.length === 0) {
          setLoading(true);
          void loadFeed([], { reset: true });
          return;
        }

        const shouldTopUp = currentStack.length < TARGET_STACK_SIZE;
        const shouldRefreshQuietly = Date.now() - lastFetchAtRef.current > 60000;
        if (shouldTopUp || shouldRefreshQuietly) {
          void loadFeed(currentStack.map((movie) => movie.id));
        }
      })();
    }, [hydrateCachedMovies, loadFeed, loadOnboardingExcludes, session]),
  );

  const refillIfNeeded = useCallback((nextMovies: SearchMovie[]) => {
    if (nextMovies.length < REFILL_THRESHOLD) {
      void loadFeed(nextMovies.map((movie) => movie.id));
    }
  }, [loadFeed]);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      TINDER_MOVIE_ACTION_EVENT,
      (event: { type: 'rated' | 'watch-later'; movieId: number; rating?: number }) => {
        rememberExcludedMovieIds([event.movieId]);
        setMovies((current) => {
          const activeMovie = current[0];
          if (!activeMovie || activeMovie.id !== event.movieId) {
            return current;
          }

          if (event.type === 'rated') {
            setSelectedRating(event.rating ?? 0);
            return current;
          }

          const next = current.slice(1);
          moviesRef.current = next;
          refillIfNeeded(next);
          setLastUndoableAction({ type: 'swipe-right', movie: activeMovie });
          return next;
        });
      },
    );

    return () => subscription.remove();
  }, [refillIfNeeded, rememberExcludedMovieIds]);

  const consumeMovie = useCallback(() => {
    setMovies((current) => {
      const next = current.slice(1);
      moviesRef.current = next;
      refillIfNeeded(next);
      return next;
    });
  }, [refillIfNeeded]);

  const restoreMovieToFront = useCallback((movie: SearchMovie) => {
    setMovies((current) => {
      if (current.some((entry) => entry.id === movie.id)) {
        return current;
      }
      const next = [movie, ...current].slice(0, CACHE_MAX_SIZE);
      moviesRef.current = next;
      return next;
    });
  }, []);

  const animateCardBack = useCallback(() => {
    Animated.spring(pan, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
      friction: 8,
      tension: 90,
    }).start();
  }, [pan]);

  const animateCardOut = useCallback((direction: SwipeDirection, onFinished?: () => void) => {
    Animated.timing(pan, {
      toValue: { x: direction === 'right' ? OFFSCREEN_DISTANCE : -OFFSCREEN_DISTANCE, y: 0 },
      duration: 160,
      useNativeDriver: true,
    }).start(() => {
      pan.setValue({ x: 0, y: 0 });
      onFinished?.();
    });
  }, [pan]);

  const persistSwipeAction = useCallback(async (direction: SwipeDirection, movie: SearchMovie) => {
    if (!session) {
      return;
    }
    if (direction === 'right') {
      await addToWatchLater(session.token, movie.id);
      return;
    }
    await rateMovie(session.token, movie.id, 1);
  }, [session]);

  const undoSwipeAction = useCallback(async (action: UndoableAction) => {
    if (!session) {
      return;
    }

    if (action.type === 'swipe-right') {
      await removeMovieFromPlaylist(session.token, WATCH_LATER_PLAYLIST_ID, action.movie.id);
      return;
    }

    await removeMovieRating(session.token, action.movie.id);
  }, [session]);

  const triggerSwipe = useCallback(async (direction: SwipeDirection, movie: SearchMovie) => {
    if (!session || submitting) {
      return;
    }

    setSubmitting(true);
    setError('');
    rememberExcludedMovieIds([movie.id]);
    let didConsumeMovie = false;
    let shouldKeepMovie = false;
    animateCardOut(direction, () => {
      if (shouldKeepMovie) {
        return;
      }
      didConsumeMovie = true;
      consumeMovie();
    });

    try {
      await persistSwipeAction(direction, movie);
      setLastUndoableAction({
        type: direction === 'right' ? 'swipe-right' : 'swipe-left',
        movie,
      });
    } catch (submitError) {
      if (submitError instanceof ApiError && submitError.status === 401) {
        await signOut();
        return;
      }
      forgetExcludedMovieId(movie.id);
      if (didConsumeMovie) {
        restoreMovieToFront(movie);
      } else {
        shouldKeepMovie = true;
      }
      setError("Impossible d'enregistrer cette action.");
    } finally {
      setSubmitting(false);
    }
  }, [animateCardOut, consumeMovie, forgetExcludedMovieId, persistSwipeAction, rememberExcludedMovieIds, restoreMovieToFront, session, signOut, submitting]);

  const handleRate = useCallback(async (rating: number, movie: SearchMovie) => {
    if (!session || submitting) {
      return;
    }

    setSubmitting(true);
    setError('');
    setSelectedRating(rating);
    rememberExcludedMovieIds([movie.id]);
    let didConsumeMovie = false;
    let shouldKeepMovie = false;
    const animationTimeout = setTimeout(() => {
      animateCardOut(rating >= 4 ? 'right' : 'left', () => {
        if (shouldKeepMovie) {
          return;
        }
        didConsumeMovie = true;
        consumeMovie();
      });
    }, 140);

    try {
      await rateMovie(session.token, movie.id, rating);
      setLastUndoableAction({ type: 'rating', movie, rating });
    } catch (submitError) {
      if (submitError instanceof ApiError && submitError.status === 401) {
        await signOut();
        return;
      }
      forgetExcludedMovieId(movie.id);
      clearTimeout(animationTimeout);
      if (didConsumeMovie) {
        restoreMovieToFront(movie);
      } else {
        shouldKeepMovie = true;
      }
      setSelectedRating(0);
      setError("Impossible d'enregistrer cette note.");
    } finally {
      setSubmitting(false);
    }
  }, [animateCardOut, consumeMovie, forgetExcludedMovieId, rememberExcludedMovieIds, restoreMovieToFront, session, signOut, submitting]);

  const handleUndo = useCallback(async () => {
    if (!lastUndoableAction || !session || submitting) {
      return;
    }

    setSubmitting(true);
    try {
      await undoSwipeAction(lastUndoableAction);
      forgetExcludedMovieId(lastUndoableAction.movie.id);
      restoreMovieToFront(lastUndoableAction.movie);
      setLastUndoableAction(null);
      setError('');
    } catch (undoError) {
      if (undoError instanceof ApiError && undoError.status === 401) {
        await signOut();
        return;
      }
      setError("Impossible d'annuler cette action.");
    } finally {
      setSubmitting(false);
    }
  }, [forgetExcludedMovieId, lastUndoableAction, restoreMovieToFront, session, signOut, submitting, undoSwipeAction]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          !submitting && Math.abs(gestureState.dx) > 12 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: (_, gestureState) => {
          if (!currentMovie) {
            animateCardBack();
            return;
          }

          if (gestureState.dx > SWIPE_THRESHOLD || gestureState.vx > SWIPE_VELOCITY_THRESHOLD) {
            void triggerSwipe('right', currentMovie);
            return;
          }

          if (gestureState.dx < -SWIPE_THRESHOLD || gestureState.vx < -SWIPE_VELOCITY_THRESHOLD) {
            void triggerSwipe('left', currentMovie);
            return;
          }

          animateCardBack();
        },
      }),
    [animateCardBack, currentMovie, pan.x, pan.y, submitting, triggerSwipe],
  );

  const cardStyle = useMemo(
    () => ({
      transform: [
        { translateX: pan.x },
        { translateY: pan.y },
        {
          rotate: pan.x.interpolate({
            inputRange: [-240, 0, 240],
            outputRange: ['-12deg', '0deg', '12deg'],
          }),
        },
      ],
    }),
    [pan.x, pan.y],
  );

  return (
    <AppScreen scroll={false} contentStyle={styles.screen}>
      {error ? <InlineBanner message={error} tone="error" /> : null}

      <View style={styles.stackArea}>
        {loading && movies.length === 0 ? (
          <View style={[styles.loadingCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
            <ActivityIndicator color={theme.colors.text} />
            <Text style={[styles.loadingText, { color: theme.colors.textSoft }]}>Chargement de tes recos...</Text>
          </View>
        ) : currentMovie ? (
          <View style={styles.cardFrame}>
            {secondMovie ? (
              <View style={styles.backCard}>
                <Image source={{ uri: secondMovie.poster_url || FALLBACK_POSTER }} style={styles.heroPoster} />
                <View style={styles.backOverlay} />
              </View>
            ) : null}

            <Animated.View style={[styles.frontCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }, cardStyle]} {...panResponder.panHandlers}>
              <Pressable
                style={styles.pressableFill}
                onPress={() => navigation.navigate('MovieDetails', { movieId: currentMovie.id, title: currentMovie.title, source: 'tinder' })}
                disabled={submitting}
              >
                <Image source={{ uri: currentMovie.poster_url || FALLBACK_POSTER }} style={styles.heroPoster} />
                <View style={styles.heroGradient} />
                <View style={styles.heroBody}>
                  <View style={styles.pillsRow}>
                    <View style={[styles.ratingPill, { backgroundColor: theme.colors.ratingBackground }]}>
                      <Ionicons name="star" size={12} color={theme.colors.ratingText} />
                      <Text style={[styles.ratingPillLabel, { color: theme.colors.ratingText }]}>{currentMovie.rating.toFixed(1)}</Text>
                    </View>
                    {currentMovie.release_date ? (
                      <View style={styles.metaPill}>
                        <Text style={styles.metaPillLabel}>{currentMovie.release_date}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.title}>{currentMovie.title}</Text>
                </View>
              </Pressable>
            </Animated.View>
          </View>
        ) : (
          <EmptyStateCard title="Recharge en cours" />
        )}
      </View>

      <View style={styles.bottomArea}>
        {lastUndoableAction ? (
          <Pressable
            style={[styles.undoButton, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
            onPress={() => void handleUndo()}
            disabled={submitting}
          >
            <Ionicons name="arrow-undo" size={16} color={theme.colors.text} />
            <Text style={[styles.undoLabel, { color: theme.colors.text }]}>Annuler</Text>
          </Pressable>
        ) : <View style={styles.undoSpacer} />}

        <View style={[styles.card, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
          <StarRatingInput
            value={selectedRating}
            onChange={(rating) => currentMovie && void handleRate(rating, currentMovie)}
            size={34}
            disabled={submitting || !currentMovie}
          />
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 14,
  },
  stackArea: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardFrame: {
    width: '100%',
    maxWidth: 390,
    aspectRatio: 2 / 3,
    justifyContent: 'center',
  },
  loadingCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingVertical: 34,
    width: '100%',
  },
  loadingText: {
    color: '#cbd5e1',
    fontSize: 14,
  },
  backCard: {
    position: 'absolute',
    top: 16,
    left: 12,
    right: 12,
    bottom: -8,
    overflow: 'hidden',
    borderRadius: 32,
    opacity: 0.28,
    transform: [{ scale: 0.96 }],
  },
  backOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2,6,23,0.56)',
  },
  frontCard: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  pressableFill: {
    flex: 1,
  },
  heroPoster: {
    width: '100%',
    height: '100%',
  },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '42%',
    backgroundColor: 'rgba(2,6,23,0.76)',
  },
  heroBody: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: 6,
    padding: 18,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
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
  metaPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  metaPillLabel: {
    color: '#e5e7eb',
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  bottomArea: {
    gap: 10,
  },
  undoButton: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  undoSpacer: {
    height: 38,
  },
  undoLabel: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

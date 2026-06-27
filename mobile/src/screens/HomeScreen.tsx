import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  DeviceEventEmitter,
  Image,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
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
  dislikeMovie,
  fetchMovieFeed,
  fetchRuntimeAlerts,
  fetchUserMovieRating,
  getOnboardingPreferences,
  rateMovie,
  recordRecommendationImpression,
  undoDislikeMovie,
  removeMovieFromPlaylist,
  removeMovieRating,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { useTipJar } from '../support/TipJarContext';
import { useTheme } from '../theme/ThemeContext';
import { FALLBACK_POSTER, type RuntimeAlertItem, type SearchMovie, WATCH_LATER_PLAYLIST_ID } from '../types';
import { recordAppreciationInteraction, requestInAppReview } from '../utils/appSupport';

const TARGET_STACK_SIZE = 14;
const REFILL_THRESHOLD = 8;
const FEED_BATCH_SIZE = 24;
const CACHE_MAX_SIZE = 48;
const CACHE_VERSION = 4;
const SWIPE_THRESHOLD = 110;
const SWIPE_VELOCITY_THRESHOLD = 0.35;
const OFFSCREEN_DISTANCE = 420;
const TINDER_VERTICAL_SHIFT = 16;
const TINDER_MOVIE_ACTION_EVENT = 'qulte:tinder-movie-action';

type SwipeDirection = 'left' | 'right';

interface UndoableAction {
  type: 'swipe-left' | 'swipe-right' | 'skip-left' | 'rating';
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
  movies.slice(0, 16).forEach((movie) => {
    if (movie.poster_url) {
      void Image.prefetch(movie.poster_url);
    }
  });
}

export default function HomeScreen() {
  const { session, signOut } = useAuth();
  const { theme } = useTheme();
  const { openTipJar } = useTipJar();
  const { width, height } = useWindowDimensions();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const initialCache =
    tinderMovieCache && tinderMovieCache.username === session?.username && tinderMovieCache.version === CACHE_VERSION
      ? tinderMovieCache
      : null;
  const [movies, setMovies] = useState<SearchMovie[]>(() => initialCache?.movies ?? []);
  const [loading, setLoading] = useState(() => !initialCache || initialCache.movies.length === 0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [runtimeAlert, setRuntimeAlert] = useState<RuntimeAlertItem | null>(null);
  const [selectedRating, setSelectedRating] = useState(0);
  const [lastUndoableAction, setLastUndoableAction] = useState<UndoableAction | null>(null);
  const [showTinderHelp, setShowTinderHelp] = useState(false);
  const [showSupportPrompt, setShowSupportPrompt] = useState(false);
  const isFetchingRef = useRef(false);
  const locallyExcludedMovieIdsRef = useRef<Set<number>>(new Set());
  const onboardingExcludedMovieIdsRef = useRef<Set<number>>(new Set());
  const hasLoadedOnboardingExcludesRef = useRef(false);
  const moviesRef = useRef(movies);
  const submittingRef = useRef(submitting);
  const lastFetchAtRef = useRef(initialCache?.fetchedAt ?? 0);
  const lastRecordedImpressionMovieIdRef = useRef<number | null>(null);
  const pan = useRef(new Animated.ValueXY()).current;

  const currentMovie = useMemo(() => movies[0] ?? null, [movies]);
  const secondMovie = useMemo(() => movies[1] ?? null, [movies]);
  const isWideLayout = width >= 700;
  const tinderCardWidth = useMemo(() => {
    const contentWidth = Math.min(width, isWideLayout ? 760 : width);
    const availableWidth = contentWidth - (isWideLayout ? 80 : 28);
    const reservedVerticalSpace = isWideLayout ? 285 : 295;
    const maxCardHeight = Math.max(isWideLayout ? 420 : 300, height - reservedVerticalSpace);
    const maxCardWidthFromHeight = maxCardHeight * (2 / 3);
    const maxCardWidth = Math.min(isWideLayout ? 440 : 390, availableWidth, maxCardWidthFromHeight);
    const minCardWidth = Math.min(isWideLayout ? 320 : 210, availableWidth, maxCardWidthFromHeight);
    return Math.max(minCardWidth, maxCardWidth);
  }, [height, isWideLayout, width]);

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
    submittingRef.current = submitting;
  }, [submitting]);

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

  const loadRuntimeAlerts = useCallback(async () => {
    if (!session) {
      setRuntimeAlert(null);
      return;
    }

    try {
      const payload = await fetchRuntimeAlerts(session.token);
      setRuntimeAlert(payload.items[0] ?? null);
    } catch (runtimeAlertError) {
      if (runtimeAlertError instanceof ApiError && runtimeAlertError.status === 401) {
        await signOut();
      }
    }
  }, [session, signOut]);

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
    setError('');
    setLoading(false);
    return true;
  }, [filterExcludedMovies, session]);

  const loadFeed = useCallback(async (excludeIds: number[] = [], options?: { reset?: boolean }) => {
    if (!session || isFetchingRef.current) {
      return;
    }

    const hasVisibleStack = moviesRef.current.length > 0 && !options?.reset;

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
      if (!hasVisibleStack) {
        setError('Impossible de charger les recommandations.');
      }
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
        await loadRuntimeAlerts();
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
    }, [hydrateCachedMovies, loadFeed, loadOnboardingExcludes, loadRuntimeAlerts, session]),
  );

  const refillIfNeeded = useCallback((nextMovies: SearchMovie[]) => {
    if (nextMovies.length < REFILL_THRESHOLD) {
      void loadFeed(nextMovies.map((movie) => movie.id));
    }
  }, [loadFeed]);

  const removeMovieFromTinderStack = useCallback((movieId: number) => {
    setMovies((current) => {
      if (!current.some((movie) => movie.id === movieId)) {
        return current;
      }

      const next = current.filter((movie) => movie.id !== movieId);
      moviesRef.current = next;
      refillIfNeeded(next);
      return next;
    });
  }, [refillIfNeeded]);

  useEffect(() => {
    if (!session || !currentMovie) {
      return;
    }

    let active = true;
    const movieId = currentMovie.id;

    void (async () => {
      try {
        const payload = await fetchUserMovieRating(session.token, movieId);
        if (!active || moviesRef.current[0]?.id !== movieId) {
          return;
        }

        const rating = payload.rating ?? 0;
        if (rating > 0) {
          if (submittingRef.current) {
            setSelectedRating(rating);
            return;
          }
          rememberExcludedMovieIds([movieId]);
          removeMovieFromTinderStack(movieId);
          return;
        }

        setSelectedRating(0);
      } catch (ratingError) {
        if (ratingError instanceof ApiError && ratingError.status === 401) {
          await signOut();
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [currentMovie?.id, rememberExcludedMovieIds, removeMovieFromTinderStack, session, signOut]);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      TINDER_MOVIE_ACTION_EVENT,
      (event: { type: 'rated' | 'watch-later'; movieId: number; rating?: number }) => {
        rememberExcludedMovieIds([event.movieId]);
        if (event.type === 'rated') {
          const rating = event.rating ?? 0;
          setSelectedRating(rating);
          if (rating > 0) {
            removeMovieFromTinderStack(event.movieId);
          }
          return;
        }

        setMovies((current) => {
          const activeMovie = current[0];
          if (!activeMovie || activeMovie.id !== event.movieId) {
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
  }, [refillIfNeeded, rememberExcludedMovieIds, removeMovieFromTinderStack]);

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
      onFinished?.();
      requestAnimationFrame(() => {
        pan.setValue({ x: 0, y: 0 });
      });
    });
  }, [pan]);

  const persistSwipeAction = useCallback(async (
    direction: SwipeDirection,
    movie: SearchMovie,
  ): Promise<UndoableAction['type']> => {
    if (!session) {
      return direction === 'right' ? 'swipe-right' : 'skip-left';
    }
    if (direction === 'right') {
      await addToWatchLater(session.token, movie.id);
      return 'swipe-right';
    }
    if (selectedRating > 0) {
      return 'skip-left';
    }
    const response = await dislikeMovie(session.token, movie.id);
    return response.status === 'skipped_rated' ? 'skip-left' : 'swipe-left';
  }, [selectedRating, session]);

  const undoSwipeAction = useCallback(async (action: UndoableAction) => {
    if (!session) {
      return;
    }

    if (action.type === 'swipe-right') {
      await removeMovieFromPlaylist(session.token, WATCH_LATER_PLAYLIST_ID, action.movie.id);
      return;
    }

    if (action.type === 'swipe-left') {
      await undoDislikeMovie(session.token, action.movie.id);
      return;
    }

    if (action.type === 'skip-left') {
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
      const actionType = await persistSwipeAction(direction, movie);
      setLastUndoableAction({
        type: actionType,
        movie,
      });
      const shouldPrompt = await recordAppreciationInteraction(session.username);
      if (shouldPrompt) {
        setShowSupportPrompt(true);
      }
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
      const shouldPrompt = await recordAppreciationInteraction(session.username);
      if (shouldPrompt) {
        setShowSupportPrompt(true);
      }
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
  const rightSwipeFeedbackStyle = useMemo(
    () => ({
      opacity: pan.x.interpolate({
        inputRange: [18, SWIPE_THRESHOLD],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
      transform: [
        {
          scale: pan.x.interpolate({
            inputRange: [18, SWIPE_THRESHOLD],
            outputRange: [0.96, 1],
            extrapolate: 'clamp',
          }),
        },
      ],
    }),
    [pan.x],
  );
  const leftSwipeFeedbackStyle = useMemo(
    () => ({
      opacity: pan.x.interpolate({
        inputRange: [-SWIPE_THRESHOLD, -18],
        outputRange: [1, 0],
        extrapolate: 'clamp',
      }),
      transform: [
        {
          scale: pan.x.interpolate({
            inputRange: [-SWIPE_THRESHOLD, -18],
            outputRange: [1, 0.96],
            extrapolate: 'clamp',
          }),
        },
      ],
    }),
    [pan.x],
  );

  return (
    <AppScreen scroll={false} contentStyle={[styles.screen, isWideLayout && styles.tabletScreen]}>
      {runtimeAlert ? <InlineBanner message={`${runtimeAlert.title} - ${runtimeAlert.message}`} tone={runtimeAlert.tone} /> : null}
      {error ? <InlineBanner message={error} tone="error" /> : null}

      <View style={styles.stackArea}>
        {loading && movies.length === 0 ? (
          <View style={[styles.loadingCard, { width: tinderCardWidth, borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
            <ActivityIndicator color={theme.colors.text} />
            <Text style={[styles.loadingText, { color: theme.colors.textSoft }]}>Chargement de tes recos...</Text>
          </View>
        ) : currentMovie ? (
          <View style={styles.stackContent}>
            <View style={[styles.groupModeBar, { width: tinderCardWidth }]}>
              <Pressable
                style={[styles.groupModeButton, { backgroundColor: theme.rgba.card, borderColor: theme.rgba.border }]}
                onPress={() => setShowTinderHelp(true)}
                hitSlop={10}
              >
                <Text style={[styles.helpButtonLabel, { color: theme.colors.text }]}>?</Text>
              </Pressable>
              <Pressable
                style={[styles.groupModeButton, { backgroundColor: theme.rgba.card, borderColor: theme.rgba.border }]}
                onPress={() => navigation.navigate('GroupRecommendations')}
                hitSlop={10}
              >
                <Ionicons name="people-outline" size={16} color={theme.colors.text} />
              </Pressable>
            </View>
            <View style={[styles.cardFrame, { width: tinderCardWidth }]}>
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
                <LinearGradient
                  pointerEvents="none"
                  colors={['rgba(2,6,23,0)', 'rgba(2,6,23,0.06)', 'rgba(2,6,23,0.28)', 'rgba(2,6,23,0.72)', 'rgba(2,6,23,0.97)']}
                  locations={[0, 0.22, 0.48, 0.76, 1]}
                  style={styles.heroGradient}
                />
                <View style={styles.heroBody}>
                  <View style={styles.pillsRow}>
                    <View style={[styles.ratingPill, { backgroundColor: theme.colors.ratingBackground }]}>
                      <Ionicons name="star" size={12} color={theme.colors.ratingText} />
                      <Text style={[styles.ratingPillLabel, { color: theme.colors.ratingText }]}>{currentMovie.rating.toFixed(1)}</Text>
                    </View>
                    {currentMovie.is_now_playing ? (
                      <View style={styles.nowPlayingPill}>
                        <Ionicons name="ticket-outline" size={12} color="#fff7ed" />
                        <Text style={styles.nowPlayingPillLabel}>Actuellement au cinéma</Text>
                      </View>
                    ) : null}
                    {currentMovie.release_date ? (
                      <View style={styles.metaPill}>
                        <Text style={styles.metaPillLabel}>{currentMovie.release_date}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.title}>{currentMovie.title}</Text>
                </View>
                <Animated.View pointerEvents="none" style={[styles.swipeFeedbackBorder, styles.swipeRightBorder, rightSwipeFeedbackStyle]} />
                <Animated.View pointerEvents="none" style={[styles.swipeFeedbackBorder, styles.swipeLeftBorder, leftSwipeFeedbackStyle]} />
                <Animated.View pointerEvents="none" style={[styles.swipeFeedbackPill, styles.swipeRightPill, rightSwipeFeedbackStyle]}>
                  <Ionicons name="bookmark-outline" size={16} color="#eff6ff" />
                  <Text style={styles.swipeRightPillLabel}>À regarder plus tard</Text>
                </Animated.View>
                <Animated.View pointerEvents="none" style={[styles.swipeFeedbackPill, styles.swipeLeftPill, leftSwipeFeedbackStyle]}>
                  <Ionicons name="close" size={17} color="#fff1f2" />
                  <Text style={styles.swipeLeftPillLabel}>Passer</Text>
                </Animated.View>
              </Pressable>
            </Animated.View>
          </View>
          </View>
        ) : (
          <EmptyStateCard title="Recharge en cours" />
        )}
      </View>

      <View style={[styles.bottomArea, { width: tinderCardWidth }]}>
        <View style={styles.undoSlot}>
          {lastUndoableAction ? (
            <Pressable
              style={[styles.undoButton, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
              onPress={() => void handleUndo()}
              disabled={submitting}
            >
              <Ionicons name="arrow-undo" size={16} color={theme.colors.text} />
              <Text style={[styles.undoLabel, { color: theme.colors.text }]}>Annuler</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.card, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
          <StarRatingInput
            value={selectedRating}
            onChange={(rating) => currentMovie && void handleRate(rating, currentMovie)}
            size={isWideLayout ? 36 : 34}
            disabled={submitting || !currentMovie}
          />
        </View>
      </View>

      {showTinderHelp ? (
        <View style={styles.helpOverlay}>
          <Pressable style={styles.helpBackdrop} onPress={() => setShowTinderHelp(false)} />
          <View style={[styles.helpCard, { borderColor: theme.rgba.border, backgroundColor: theme.isDark ? '#0f172a' : '#ffffff' }]}>
            <View style={styles.helpHeader}>
              <Text style={[styles.helpTitle, { color: theme.colors.text }]}>Comment fonctionne le Tinder ?</Text>
              <Pressable onPress={() => setShowTinderHelp(false)} hitSlop={10}>
                <Ionicons name="close" size={20} color={theme.colors.text} />
              </Pressable>
            </View>
            <Text style={[styles.helpText, { color: theme.colors.textMuted }]}>
              Si tu as déjà vu le film, note-le avec les étoiles.
            </Text>
            <Text style={[styles.helpText, { color: theme.colors.textMuted }]}>
              Si tu ne l’as pas vu, swipe à droite pour l’ajouter à “À regarder plus tard”.
            </Text>
            <Text style={[styles.helpText, { color: theme.colors.textMuted }]}>
              Swipe à gauche si le film ne t’intéresse pas.
            </Text>
            <Text style={[styles.helpText, { color: theme.colors.textMuted }]}>
              Tu peux aussi toucher l’affiche pour voir le résumé, le trailer, le casting et plus.
            </Text>
          </View>
        </View>
      ) : null}

      {showSupportPrompt ? (
        <View style={styles.helpOverlay}>
          <Pressable style={styles.helpBackdrop} onPress={() => setShowSupportPrompt(false)} />
          <View style={[styles.helpCard, { borderColor: theme.rgba.border, backgroundColor: theme.isDark ? '#0f172a' : '#ffffff' }]}>
            <View style={styles.helpHeader}>
              <Text style={[styles.helpTitle, { color: theme.colors.text }]}>Tu apprécies Qulte ?</Text>
              <Pressable onPress={() => setShowSupportPrompt(false)} hitSlop={10}>
                <Ionicons name="close" size={20} color={theme.colors.text} />
              </Pressable>
            </View>
            <Text style={[styles.helpText, { color: theme.colors.textMuted }]}>
              Si l’app t’aide vraiment à trouver de bons films, tu peux nous donner un vrai coup de pouce.
            </Text>
            <View style={styles.supportActions}>
              <Pressable
                style={[styles.secondarySupportButton, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
                onPress={() => setShowSupportPrompt(false)}
              >
                <Text style={[styles.secondarySupportButtonLabel, { color: theme.colors.text }]}>Plus tard</Text>
              </Pressable>
              <Pressable
                style={[styles.primarySupportButton, { backgroundColor: theme.colors.secondaryAccent }]}
                onPress={() => {
                  setShowSupportPrompt(false);
                  void requestInAppReview();
                }}
              >
                <Text style={[styles.primarySupportButtonLabel, { color: theme.colors.secondaryAccentText }]}>Noter l’app</Text>
              </Pressable>
            </View>
            <Pressable
              style={[styles.donationButton, { borderColor: theme.colors.accentSoft, backgroundColor: theme.colors.accentSoft }]}
              onPress={() => {
                setShowSupportPrompt(false);
                openTipJar();
              }}
            >
              <Ionicons name="heart-outline" size={16} color={theme.colors.accent} />
              <Text style={[styles.donationButtonLabel, { color: theme.colors.accent }]}>Soutenir Qulte par un don</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 14,
  },
  tabletScreen: {
    maxWidth: 540,
    paddingTop: 12,
    paddingBottom: 14,
  },
  stackArea: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Platform.OS === 'ios' ? 24 : 10,
    transform: [{ translateY: TINDER_VERTICAL_SHIFT }],
  },
  stackContent: {
    alignItems: 'center',
    gap: 0,
  },
  groupModeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 36,
    marginBottom: 6,
  },
  cinemaFilterButton: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cinemaFilterButtonLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  cardFrame: {
    aspectRatio: 2 / 3,
    justifyContent: 'center',
  },
  groupModeButton: {
    width: 34,
    height: 34,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  helpButtonLabel: {
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 18,
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
    height: '46%',
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
    backgroundColor: 'rgba(15,23,42,0.48)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  ratingPillLabel: {
    color: '#fde68a',
    fontSize: 12,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.28)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  nowPlayingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: 'rgba(180, 83, 9, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255, 237, 213, 0.42)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  nowPlayingPillLabel: {
    color: '#fff7ed',
    fontSize: 11,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.22)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  metaPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.42)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  metaPillLabel: {
    color: '#e5e7eb',
    fontSize: 12,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.24)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  title: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.8,
    textShadowColor: 'rgba(0,0,0,0.34)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  swipeFeedbackBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
    borderWidth: 3,
  },
  swipeRightBorder: {
    borderColor: 'rgba(37, 99, 235, 0.95)',
    backgroundColor: 'rgba(37, 99, 235, 0.10)',
  },
  swipeLeftBorder: {
    borderColor: 'rgba(225, 29, 72, 0.95)',
    backgroundColor: 'rgba(225, 29, 72, 0.10)',
  },
  swipeFeedbackPill: {
    position: 'absolute',
    top: 22,
    minHeight: 42,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  swipeRightPill: {
    right: 18,
    backgroundColor: 'rgba(37, 99, 235, 0.92)',
    borderColor: 'rgba(191, 219, 254, 0.56)',
  },
  swipeLeftPill: {
    left: 18,
    backgroundColor: 'rgba(225, 29, 72, 0.92)',
    borderColor: 'rgba(255, 205, 210, 0.56)',
  },
  swipeRightPillLabel: {
    color: '#eff6ff',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  swipeLeftPillLabel: {
    color: '#fff1f2',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  bottomArea: {
    alignSelf: 'center',
    marginTop: 12,
    gap: 10,
    transform: [{ translateY: TINDER_VERTICAL_SHIFT }],
  },
  undoSlot: {
    height: 74,
    alignItems: 'center',
    justifyContent: 'flex-end',
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
  helpOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  helpBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2,6,23,0.72)',
  },
  helpCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 28,
    borderWidth: 1,
    padding: 18,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  helpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 2,
  },
  helpTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
  },
  helpText: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
  },
  supportActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  secondarySupportButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  secondarySupportButtonLabel: {
    fontSize: 14,
    fontWeight: '800',
  },
  primarySupportButton: {
    flex: 1.2,
    minHeight: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  primarySupportButtonLabel: {
    fontSize: 14,
    fontWeight: '900',
  },
  donationButton: {
    marginTop: 2,
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  donationButtonLabel: {
    fontSize: 14,
    fontWeight: '800',
  },
});

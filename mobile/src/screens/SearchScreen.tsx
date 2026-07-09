import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, InteractionManager, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { API_URL } from '../api/config';
import AppScreen from '../components/AppScreen';
import EmptyStateCard from '../components/EmptyStateCard';
import InlineBanner from '../components/InlineBanner';
import MovieQuickAddModal from '../components/MovieQuickAddModal';
import ScreenHeader from '../components/ScreenHeader';
import SearchField from '../components/SearchField';
import { ApiError, searchMovies, searchSocialUsers } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeContext';
import { FALLBACK_POSTER, type SearchMovie, type SocialUser } from '../types';

type SearchMode = 'movies' | 'users';
type SearchResult =
  | { kind: 'movie'; id: string; movie: SearchMovie }
  | { kind: 'user'; id: string; user: SocialUser };

const RECENT_MOVIES_LIMIT = 8;
const RECENT_USERS_LIMIT = 8;
const RECENT_SEARCHES_VERSION = 1;

type RecentMoviesPayload = {
  version: number;
  movies: SearchMovie[];
};

type RecentUsersPayload = {
  version: number;
  users: SocialUser[];
};

function getRecentMoviesKey(username: string) {
  return `qulte:recent-search-movies:${username}:v${RECENT_SEARCHES_VERSION}`;
}

function getRecentUsersKey(username: string) {
  return `qulte:recent-search-users:${username}:v${RECENT_SEARCHES_VERSION}`;
}

function parseRecentMovies(rawValue: string | null): SearchMovie[] {
  if (!rawValue) {
    return [];
  }

  try {
    const payload = JSON.parse(rawValue) as Partial<RecentMoviesPayload>;
    if (payload.version !== RECENT_SEARCHES_VERSION || !Array.isArray(payload.movies)) {
      return [];
    }

    return payload.movies
      .filter((movie): movie is SearchMovie =>
        typeof movie?.id === 'number' &&
        typeof movie?.title === 'string' &&
        typeof movie?.rating === 'number',
      )
      .slice(0, RECENT_MOVIES_LIMIT);
  } catch {
    return [];
  }
}

function parseRecentUsers(rawValue: string | null): SocialUser[] {
  if (!rawValue) {
    return [];
  }

  try {
    const payload = JSON.parse(rawValue) as Partial<RecentUsersPayload>;
    if (payload.version !== RECENT_SEARCHES_VERSION || !Array.isArray(payload.users)) {
      return [];
    }

    return payload.users
      .filter((user): user is SocialUser => typeof user?.id === 'number' && typeof user?.username === 'string')
      .slice(0, RECENT_USERS_LIMIT);
  } catch {
    return [];
  }
}

function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return `${API_URL}${url.startsWith('/') ? url : `/${url}`}`;
}

export default function SearchScreen() {
  const { session, signOut } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const searchInputRef = useRef<TextInput | null>(null);
  const [searchMode, setSearchMode] = useState<SearchMode>('movies');
  const [query, setQuery] = useState('');
  const [movieResults, setMovieResults] = useState<SearchMovie[]>([]);
  const [userResults, setUserResults] = useState<SocialUser[]>([]);
  const [recentMovies, setRecentMovies] = useState<SearchMovie[]>([]);
  const [recentUsers, setRecentUsers] = useState<SocialUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [quickAddMovie, setQuickAddMovie] = useState<{ id: number; title: string } | null>(null);

  useEffect(() => {
    if (!session) {
      setRecentMovies([]);
      setRecentUsers([]);
      return;
    }

    let cancelled = false;

    const loadRecentSearches = async () => {
      const [moviesRaw, usersRaw] = await Promise.all([
        AsyncStorage.getItem(getRecentMoviesKey(session.username)),
        AsyncStorage.getItem(getRecentUsersKey(session.username)),
      ]);

      if (cancelled) {
        return;
      }

      setRecentMovies(parseRecentMovies(moviesRaw));
      setRecentUsers(parseRecentUsers(usersRaw));
    };

    void loadRecentSearches();

    return () => {
      cancelled = true;
    };
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      const interaction = InteractionManager.runAfterInteractions(() => {
        searchInputRef.current?.focus();
      });

      return () => interaction.cancel();
    }, []),
  );

  useEffect(() => {
    if (!feedback) {
      return;
    }
    const timeout = setTimeout(() => setFeedback(''), 2200);
    return () => clearTimeout(timeout);
  }, [feedback]);

  const performSearch = useCallback(async (nextQuery: string, mode: SearchMode, options?: { forceRefresh?: boolean }) => {
    if (!session) {
      return;
    }

    const trimmedQuery = nextQuery.trim();
    if (trimmedQuery.length < 2) {
      setMovieResults([]);
      setUserResults([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (options?.forceRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      if (mode === 'movies') {
        const payload = await searchMovies(session.token, trimmedQuery);
        setMovieResults(payload);
      } else {
        const payload = await searchSocialUsers(session.token, trimmedQuery);
        setUserResults(payload);
      }
      setError('');
    } catch (searchError) {
      if (searchError instanceof ApiError && searchError.status === 401) {
        await signOut();
        return;
      }
      setError(mode === 'movies' ? 'Impossible de rechercher ce film.' : 'Impossible de rechercher cet utilisateur.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session, signOut]);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      setMovieResults([]);
      setUserResults([]);
      setLoading(false);
      return;
    }

    const handle = setTimeout(() => {
      void performSearch(trimmedQuery, searchMode);
    }, 250);

    return () => clearTimeout(handle);
  }, [performSearch, query, searchMode]);

  const resultsLabel = useMemo(() => {
    if (query.trim().length < 2) {
      return null;
    }
    const count = searchMode === 'movies' ? movieResults.length : userResults.length;
    return `${count} résultat${count > 1 ? 's' : ''}`;
  }, [movieResults.length, query, searchMode, userResults.length]);

  const results: SearchResult[] = searchMode === 'movies'
    ? movieResults.map((movie) => ({ kind: 'movie', id: `movie-${movie.id}`, movie }))
    : userResults.map((user) => ({ kind: 'user', id: `user-${user.id}`, user }));
  const recentResults: SearchResult[] = searchMode === 'movies'
    ? recentMovies.map((movie) => ({ kind: 'movie', id: `recent-movie-${movie.id}`, movie }))
    : recentUsers.map((user) => ({ kind: 'user', id: `recent-user-${user.id}`, user }));
  const displayedResults = query.trim().length >= 2 ? results : recentResults;

  const rememberRecentMovie = useCallback(async (movie: SearchMovie) => {
    if (!session) {
      return;
    }

    const nextMovies = [movie, ...recentMovies.filter((recentMovie) => recentMovie.id !== movie.id)].slice(0, RECENT_MOVIES_LIMIT);
    setRecentMovies(nextMovies);
    await AsyncStorage.setItem(
      getRecentMoviesKey(session.username),
      JSON.stringify({ version: RECENT_SEARCHES_VERSION, movies: nextMovies }),
    );
  }, [recentMovies, session]);

  const rememberRecentUser = useCallback(async (user: SocialUser) => {
    if (!session) {
      return;
    }

    const nextUsers = [user, ...recentUsers.filter((recentUser) => recentUser.id !== user.id)].slice(0, RECENT_USERS_LIMIT);
    setRecentUsers(nextUsers);
    await AsyncStorage.setItem(
      getRecentUsersKey(session.username),
      JSON.stringify({ version: RECENT_SEARCHES_VERSION, users: nextUsers }),
    );
  }, [recentUsers, session]);

  return (
    <AppScreen scroll={false} contentStyle={{ flex: 1 }}>
      <FlatList
        data={displayedResults}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void performSearch(query, searchMode, { forceRefresh: true })}
            enabled={query.trim().length >= 2}
            tintColor={theme.colors.text}
            colors={[theme.colors.secondaryAccent]}
            progressViewOffset={16}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <ScreenHeader
              icon="search"
              accent="amber"
              title="Recherche"
              trailing={
                resultsLabel ? (
                  <View style={[styles.resultsBadge, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
                    <Text style={[styles.resultsBadgeLabel, { color: theme.colors.text }]}>{resultsLabel}</Text>
                  </View>
                ) : null
              }
            />
            <View style={[styles.modeSwitcher, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
              {[
                ['movies', 'Films', 'film-outline'],
                ['users', 'Utilisateurs', 'people-outline'],
              ].map(([mode, label, icon]) => {
                const isActive = searchMode === mode;
                return (
                  <Pressable
                    key={mode}
                    style={[styles.modeButton, isActive && { backgroundColor: theme.colors.accent }]}
                    onPress={() => {
                      setSearchMode(mode as SearchMode);
                      setMovieResults([]);
                      setUserResults([]);
                    }}
                  >
                    <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={16} color={isActive ? theme.colors.accentText : theme.colors.textSoft} />
                    <Text style={[styles.modeButtonLabel, { color: theme.colors.textSoft }, isActive && { color: theme.colors.accentText }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <SearchField
              ref={searchInputRef}
              value={query}
              onChangeText={setQuery}
              placeholder={searchMode === 'movies' ? 'Chercher un film' : 'Chercher un utilisateur'}
              icon={searchMode === 'movies' ? 'search' : 'person-outline'}
            />
            {query.trim().length < 2 && recentResults.length > 0 ? (
              <View style={styles.recentHeader}>
                <Ionicons name="time-outline" size={15} color={theme.colors.textMuted} />
                <Text style={[styles.recentHeaderLabel, { color: theme.colors.textMuted }]}>Recherches recentes</Text>
              </View>
            ) : null}
            {error ? <InlineBanner message={error} tone="error" /> : null}
            {feedback ? <InlineBanner message={feedback} tone="success" /> : null}
            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={theme.colors.text} />
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          item.kind === 'movie' ? (
            <Pressable
              style={[styles.itemCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
              onPress={() => {
                void rememberRecentMovie(item.movie);
                navigation.navigate('MovieDetails', { movieId: item.movie.id, title: item.movie.title });
              }}
            >
              <Pressable
                onPress={() => {
                  void rememberRecentMovie(item.movie);
                  navigation.navigate('MovieDetails', { movieId: item.movie.id, title: item.movie.title });
                }}
                onLongPress={() => setQuickAddMovie({ id: item.movie.id, title: item.movie.title })}
                delayLongPress={220}
              >
                <Image source={{ uri: item.movie.poster_url || FALLBACK_POSTER }} style={styles.poster} />
              </Pressable>
              <View style={styles.itemBody}>
                <Text style={[styles.itemTitle, { color: theme.colors.text }]}>{item.movie.title}</Text>
                <View style={[styles.ratingPill, { backgroundColor: theme.colors.ratingBackground }]}>
                  <Text style={[styles.ratingPillLabel, { color: theme.colors.ratingText }]}>{item.movie.rating.toFixed(1)} / 10</Text>
                </View>
                <Text style={[styles.itemHint, { color: theme.colors.textMuted }]}>Ouvrir la fiche</Text>
              </View>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.itemCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
              onPress={() => {
                void rememberRecentUser(item.user);
                navigation.navigate('UserProfile', { username: item.user.username });
              }}
            >
              {resolveMediaUrl(item.user.avatar_url) ? (
                <Image source={{ uri: resolveMediaUrl(item.user.avatar_url) ?? '' }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatarFallback, { backgroundColor: theme.colors.accentSoft }]}>
                  <Text style={[styles.avatarInitial, { color: theme.colors.accent }]}>{item.user.username.slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.itemBody}>
                <Text style={[styles.itemTitle, { color: theme.colors.text }]}>@{item.user.username}</Text>
                <View style={styles.userMetaRow}>
                  <Text style={[styles.userMeta, { color: theme.colors.textSoft }]}>{item.user.reviews_count} critiques</Text>
                  <Text style={[styles.userMeta, { color: theme.colors.textSoft }]}>{item.user.followers_count} abonnés</Text>
                </View>
                <Text style={[styles.itemHint, { color: theme.colors.textMuted }]}>{item.user.is_following ? 'Profil suivi' : 'Voir le profil'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
            </Pressable>
          )
        )}
        ListEmptyComponent={
          !loading ? (
            query.trim().length >= 2 ? (
              <EmptyStateCard title={searchMode === 'movies' ? 'Aucun film' : 'Aucun profil'} />
            ) : (
              <EmptyStateCard title="Aucune recherche recente" />
            )
          ) : null
        }
      />
      <MovieQuickAddModal
        movie={quickAddMovie}
        onClose={() => setQuickAddMovie(null)}
        onAdded={(playlistName) => setFeedback(`Ajouté à ${playlistName}.`)}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  headerBlock: {
    gap: 16,
    marginBottom: 12,
  },
  listContent: {
    paddingBottom: 24,
    gap: 12,
  },
  resultsBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  resultsBadgeLabel: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  modeSwitcher: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 5,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 17,
    paddingVertical: 10,
  },
  modeButtonActive: {
    backgroundColor: '#f9a8d4',
  },
  modeButtonLabel: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '900',
  },
  modeButtonLabelActive: {
    color: '#190713',
  },
  loadingWrap: {
    paddingVertical: 4,
    alignItems: 'center',
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recentHeaderLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  itemCard: {
    flexDirection: 'row',
    gap: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 12,
    marginBottom: 12,
  },
  poster: {
    width: 74,
    height: 108,
    borderRadius: 16,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 24,
  },
  avatarFallback: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(249,168,212,0.16)',
  },
  avatarInitial: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
  },
  itemBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 10,
  },
  itemTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
  },
  ratingPill: {
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
  itemHint: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  userMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  userMeta: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '800',
  },
});

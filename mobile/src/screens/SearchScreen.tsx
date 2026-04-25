import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { API_URL } from '../api/config';
import AppScreen from '../components/AppScreen';
import EmptyStateCard from '../components/EmptyStateCard';
import InlineBanner from '../components/InlineBanner';
import ScreenHeader from '../components/ScreenHeader';
import SearchField from '../components/SearchField';
import { ApiError, searchMovies, searchSocialUsers } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { FALLBACK_POSTER, type SearchMovie, type SocialUser } from '../types';

type SearchMode = 'movies' | 'users';
type SearchResult =
  | { kind: 'movie'; id: string; movie: SearchMovie }
  | { kind: 'user'; id: string; user: SocialUser };

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
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [searchMode, setSearchMode] = useState<SearchMode>('movies');
  const [query, setQuery] = useState('');
  const [movieResults, setMovieResults] = useState<SearchMovie[]>([]);
  const [userResults, setUserResults] = useState<SocialUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session) {
      return;
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      setMovieResults([]);
      setUserResults([]);
      setLoading(false);
      return;
    }

    const handle = setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          if (searchMode === 'movies') {
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
          setError(searchMode === 'movies' ? 'Impossible de rechercher ce film.' : 'Impossible de rechercher cet utilisateur.');
        } finally {
          setLoading(false);
        }
      })();
    }, 250);

    return () => clearTimeout(handle);
  }, [query, searchMode, session, signOut]);

  const resultsLabel = useMemo(() => {
    if (query.trim().length < 2) {
      return null;
    }
    const count = searchMode === 'movies' ? movieResults.length : userResults.length;
    return `${count} resultat${count > 1 ? 's' : ''}`;
  }, [movieResults.length, query, searchMode, userResults.length]);

  const results: SearchResult[] = searchMode === 'movies'
    ? movieResults.map((movie) => ({ kind: 'movie', id: `movie-${movie.id}`, movie }))
    : userResults.map((user) => ({ kind: 'user', id: `user-${user.id}`, user }));

  return (
    <AppScreen scroll={false} contentStyle={{ flex: 1 }}>
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <ScreenHeader
              icon="search"
              accent="amber"
              eyebrow="Trouver"
              title="Recherche"
              subtitle="Retrouve un film ou un membre de Qulte en quelques secondes."
              trailing={
                resultsLabel ? (
                  <View style={styles.resultsBadge}>
                    <Text style={styles.resultsBadgeLabel}>{resultsLabel}</Text>
                  </View>
                ) : null
              }
            />
            <View style={styles.modeSwitcher}>
              {[
                ['movies', 'Films', 'film-outline'],
                ['users', 'Utilisateurs', 'people-outline'],
              ].map(([mode, label, icon]) => {
                const isActive = searchMode === mode;
                return (
                  <Pressable
                    key={mode}
                    style={[styles.modeButton, isActive && styles.modeButtonActive]}
                    onPress={() => {
                      setSearchMode(mode as SearchMode);
                      setMovieResults([]);
                      setUserResults([]);
                    }}
                  >
                    <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={16} color={isActive ? '#190713' : '#cbd5e1'} />
                    <Text style={[styles.modeButtonLabel, isActive && styles.modeButtonLabelActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder={searchMode === 'movies' ? 'Chercher un film' : 'Chercher un utilisateur'}
              icon={searchMode === 'movies' ? 'search' : 'person-outline'}
            />
            {error ? <InlineBanner message={error} tone="error" /> : null}
            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color="#ffffff" />
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          item.kind === 'movie' ? (
            <Pressable
              style={styles.itemCard}
              onPress={() => navigation.navigate('MovieDetails', { movieId: item.movie.id, title: item.movie.title })}
            >
              <Image source={{ uri: item.movie.poster_url || FALLBACK_POSTER }} style={styles.poster} />
              <View style={styles.itemBody}>
                <Text style={styles.itemTitle}>{item.movie.title}</Text>
                <View style={styles.ratingPill}>
                  <Text style={styles.ratingPillLabel}>{item.movie.rating.toFixed(1)} / 10</Text>
                </View>
                <Text style={styles.itemHint}>Ouvrir la fiche</Text>
              </View>
            </Pressable>
          ) : (
            <Pressable
              style={styles.itemCard}
              onPress={() => navigation.navigate('UserProfile', { username: item.user.username })}
            >
              {resolveMediaUrl(item.user.avatar_url) ? (
                <Image source={{ uri: resolveMediaUrl(item.user.avatar_url) ?? '' }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitial}>{item.user.username.slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.itemBody}>
                <Text style={styles.itemTitle}>@{item.user.username}</Text>
                <View style={styles.userMetaRow}>
                  <Text style={styles.userMeta}>{item.user.reviews_count} critiques</Text>
                  <Text style={styles.userMeta}>{item.user.followers_count} abonnes</Text>
                </View>
                <Text style={styles.itemHint}>{item.user.is_following ? 'Profil suivi' : 'Voir le profil'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
            </Pressable>
          )
        )}
        ListEmptyComponent={
          !loading ? (
            query.trim().length >= 2 ? (
              <EmptyStateCard
                title={searchMode === 'movies' ? 'Aucun film trouve' : 'Aucun utilisateur trouve'}
                subtitle={searchMode === 'movies' ? 'Essaie un autre titre ou un mot-cle plus large.' : 'Essaie un pseudo plus court ou une autre orthographe.'}
              />
            ) : (
              <EmptyStateCard title="Commence une recherche" subtitle="Entre au moins deux caracteres pour lancer la recherche." />
            )
          ) : null
        }
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

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AppScreen from '../components/AppScreen';
import EmptyStateCard from '../components/EmptyStateCard';
import InlineBanner from '../components/InlineBanner';
import ScreenHeader from '../components/ScreenHeader';
import SearchField from '../components/SearchField';
import { ApiError, searchMovies } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { FALLBACK_POSTER, type SearchMovie } from '../types';

export default function SearchScreen() {
  const { session, signOut } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchMovie[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session) {
      return;
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const handle = setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const payload = await searchMovies(session.token, trimmedQuery);
          setResults(payload);
          setError('');
        } catch (searchError) {
          if (searchError instanceof ApiError && searchError.status === 401) {
            await signOut();
            return;
          }
          setError('Impossible de rechercher ce film.');
        } finally {
          setLoading(false);
        }
      })();
    }, 250);

    return () => clearTimeout(handle);
  }, [query, session, signOut]);

  const resultsLabel = useMemo(() => {
    if (query.trim().length < 2) {
      return null;
    }
    return `${results.length} resultat${results.length > 1 ? 's' : ''}`;
  }, [query, results.length]);

  return (
    <AppScreen scroll={false} contentStyle={{ flex: 1 }}>
      <FlatList
        data={results}
        keyExtractor={(item) => String(item.id)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <ScreenHeader
              icon="search"
              accent="amber"
              eyebrow="Trouver"
              title="Recherche"
              subtitle="Retrouve vite un film et ouvre directement sa fiche complete."
              trailing={
                resultsLabel ? (
                  <View style={styles.resultsBadge}>
                    <Text style={styles.resultsBadgeLabel}>{resultsLabel}</Text>
                  </View>
                ) : null
              }
            />
            <SearchField value={query} onChangeText={setQuery} placeholder="Chercher un film" />
            {error ? <InlineBanner message={error} tone="error" /> : null}
            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color="#ffffff" />
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.itemCard}
            onPress={() => navigation.navigate('MovieDetails', { movieId: item.id, title: item.title })}
          >
            <Image source={{ uri: item.poster_url || FALLBACK_POSTER }} style={styles.poster} />
            <View style={styles.itemBody}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <View style={styles.ratingPill}>
                <Text style={styles.ratingPillLabel}>{item.rating.toFixed(1)} / 10</Text>
              </View>
              <Text style={styles.itemHint}>Ouvrir la fiche</Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          !loading ? (
            query.trim().length >= 2 ? (
              <EmptyStateCard title="Aucun film trouve" subtitle="Essaie un autre titre ou un mot-cle plus large." />
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
});

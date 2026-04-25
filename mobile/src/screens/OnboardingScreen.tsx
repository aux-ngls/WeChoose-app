import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AppScreen from '../components/AppScreen';
import EmptyStateCard from '../components/EmptyStateCard';
import InlineBanner from '../components/InlineBanner';
import ScreenHeader from '../components/ScreenHeader';
import SearchField from '../components/SearchField';
import { ApiError, getOnboardingPreferences, saveOnboardingPreferences, searchMovies } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { FALLBACK_POSTER, type SearchMovie } from '../types';

const GENRES = [
  'Action',
  'Aventure',
  'Animation',
  'Comedie',
  'Crime',
  'Documentaire',
  'Drame',
  'Fantastique',
  'Horreur',
  'Mystere',
  'Romance',
  'Science-Fiction',
  'Thriller',
];

export default function OnboardingScreen() {
  const { session, completeOnboarding, signOut } = useAuth();
  const [genres, setGenres] = useState<string[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [personDraft, setPersonDraft] = useState('');
  const [movies, setMovies] = useState<SearchMovie[]>([]);
  const [movieQuery, setMovieQuery] = useState('');
  const [movieResults, setMovieResults] = useState<SearchMovie[]>([]);
  const [bootLoading, setBootLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  const selectedMovieIds = useMemo(() => new Set(movies.map((movie) => movie.id)), [movies]);

  useEffect(() => {
    if (!session) {
      return;
    }

    let active = true;

    void (async () => {
      try {
        const payload = await getOnboardingPreferences(session.token);
        if (!active) {
          return;
        }
        setGenres(payload.favorite_genres ?? []);
        setPeople(payload.favorite_people ?? []);
      } catch (bootstrapError) {
        if (bootstrapError instanceof ApiError && bootstrapError.status === 401) {
          await signOut();
          return;
        }
        if (active) {
          setError('Impossible de charger tes gouts de depart.');
        }
      } finally {
        if (active) {
          setBootLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [session, signOut]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const trimmedQuery = movieQuery.trim();
    if (trimmedQuery.length < 2) {
      setMovieResults([]);
      setSearching(false);
      return;
    }

    const handle = setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          const results = await searchMovies(session.token, trimmedQuery);
          setMovieResults(results.filter((movie) => !selectedMovieIds.has(movie.id)).slice(0, 6));
        } catch (searchError) {
          if (searchError instanceof ApiError && searchError.status === 401) {
            await signOut();
            return;
          }
          setError('Impossible de rechercher ce film.');
        } finally {
          setSearching(false);
        }
      })();
    }, 250);

    return () => clearTimeout(handle);
  }, [movieQuery, selectedMovieIds, session, signOut]);

  const toggleGenre = (genre: string) => {
    setGenres((current) =>
      current.includes(genre)
        ? current.filter((entry) => entry !== genre)
        : [...current, genre].slice(0, 8),
    );
  };

  const addPerson = () => {
    const normalized = personDraft.trim();
    if (!normalized) {
      return;
    }
    setPeople((current) => (current.includes(normalized) ? current : [...current, normalized].slice(0, 6)));
    setPersonDraft('');
  };

  const handleSubmit = async () => {
    if (!session) {
      return;
    }

    if (genres.length === 0 && movies.length === 0 && people.length === 0) {
      setError('Choisis au moins quelques genres, films ou personnes pour demarrer.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await saveOnboardingPreferences(session.token, {
        favorite_genres: genres,
        favorite_people: people,
        favorite_movie_ids: movies.map((movie) => movie.id),
      });
      await completeOnboarding();
    } catch (submitError) {
      if (submitError instanceof ApiError && submitError.status === 401) {
        await signOut();
        return;
      }
      setError(submitError instanceof Error ? submitError.message : 'Impossible d enregistrer tes gouts.');
    } finally {
      setSaving(false);
    }
  };

  if (bootLoading) {
    return (
      <AppScreen scroll={false} contentStyle={styles.centered}>
        <ActivityIndicator color="#ffffff" />
        <Text style={styles.helperText}>Preparation de ton profil cinema...</Text>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <ScreenHeader
        icon="sparkles"
        accent="pink"
        eyebrow="Bienvenue"
        title="Configure ton Qulte"
        subtitle="Choisis quelques genres, personnes et films. L'app affinera ensuite les recommandations tres vite."
      />

      <View style={styles.progressRow}>
        <View style={styles.progressPill}><Text style={styles.progressValue}>{genres.length}</Text><Text style={styles.progressLabel}>genres</Text></View>
        <View style={styles.progressPill}><Text style={styles.progressValue}>{people.length}</Text><Text style={styles.progressLabel}>personnes</Text></View>
        <View style={styles.progressPill}><Text style={styles.progressValue}>{movies.length}</Text><Text style={styles.progressLabel}>films</Text></View>
      </View>

      {error ? <InlineBanner message={error} tone="error" /> : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Genres</Text>
        <View style={styles.chipsWrap}>
          {GENRES.map((genre) => {
            const isActive = genres.includes(genre);
            return (
              <Pressable key={genre} onPress={() => toggleGenre(genre)} style={[styles.chip, isActive && styles.chipActive]}>
                <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>{genre}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Acteurs et realisateurs</Text>
        <View style={styles.personComposer}>
          <TextInput
            value={personDraft}
            onChangeText={setPersonDraft}
            placeholder="Ajouter un nom"
            placeholderTextColor="#6b7280"
            style={styles.personInput}
            onSubmitEditing={addPerson}
          />
          <Pressable onPress={addPerson} style={styles.personAddButton}>
            <Text style={styles.personAddButtonLabel}>Ajouter</Text>
          </Pressable>
        </View>
        {people.length > 0 ? (
          <View style={styles.chipsWrap}>
            {people.map((person) => (
              <Pressable key={person} onPress={() => setPeople((current) => current.filter((entry) => entry !== person))} style={styles.personChip}>
                <Text style={styles.personChipLabel}>{person}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.helperText}>Ajoute quelques noms pour mieux demarrer.</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Films qui te ressemblent</Text>
        <SearchField value={movieQuery} onChangeText={setMovieQuery} placeholder="Chercher un film" />

        {searching ? <ActivityIndicator color="#ffffff" style={{ marginTop: 12 }} /> : null}

        {movieResults.length > 0 ? (
          <View style={styles.resultsList}>
            {movieResults.map((movie) => (
              <Pressable
                key={movie.id}
                onPress={() => {
                  setMovies((current) => [...current, movie].slice(0, 6));
                  setMovieResults((current) => current.filter((entry) => entry.id !== movie.id));
                  setMovieQuery('');
                }}
                style={styles.resultItem}
              >
                <Image source={{ uri: movie.poster_url || FALLBACK_POSTER }} style={styles.resultPoster} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultTitle}>{movie.title}</Text>
                  <Text style={styles.resultMeta}>{movie.rating.toFixed(1)}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}

        {movies.length > 0 ? (
          <View style={styles.selectedMoviesGrid}>
            {movies.map((movie) => (
              <Pressable key={movie.id} onPress={() => setMovies((current) => current.filter((entry) => entry.id !== movie.id))} style={styles.selectedMovie}>
                <Image source={{ uri: movie.poster_url || FALLBACK_POSTER }} style={styles.selectedPoster} />
                <View style={styles.selectedOverlay}>
                  <Text style={styles.selectedTitle} numberOfLines={2}>{movie.title}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <EmptyStateCard title="Ajoute quelques films" subtitle="Quelques references suffisent pour lancer un premier feed deja pertinent." />
        )}
      </View>

      <Pressable onPress={() => void handleSubmit()} style={styles.primaryButton} disabled={saving}>
        {saving ? <ActivityIndicator color="#09090b" /> : <Text style={styles.primaryButtonLabel}>Entrer dans l'app</Text>}
      </Pressable>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  helperText: {
    color: '#9ca3af',
    fontSize: 14,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 10,
  },
  progressPill: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 14,
    alignItems: 'center',
  },
  progressValue: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
  },
  progressLabel: {
    marginTop: 4,
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: {
    gap: 14,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 18,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipActive: {
    backgroundColor: '#34d399',
    borderColor: '#34d399',
  },
  chipLabel: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '700',
  },
  chipLabelActive: {
    color: '#09090b',
  },
  personComposer: {
    flexDirection: 'row',
    gap: 10,
  },
  personInput: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(0,0,0,0.25)',
    color: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
  },
  personAddButton: {
    borderRadius: 18,
    backgroundColor: 'rgba(244,114,182,0.16)',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personAddButtonLabel: {
    color: '#f9a8d4',
    fontWeight: '800',
    fontSize: 13,
  },
  personChip: {
    borderRadius: 999,
    backgroundColor: 'rgba(244,114,182,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  personChipLabel: {
    color: '#fbcfe8',
    fontSize: 13,
    fontWeight: '700',
  },
  resultsList: {
    gap: 10,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 10,
  },
  resultPoster: {
    width: 46,
    height: 68,
    borderRadius: 12,
  },
  resultTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  resultMeta: {
    color: '#fde68a',
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
  },
  selectedMoviesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  selectedMovie: {
    width: '31%',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  selectedPoster: {
    width: '100%',
    aspectRatio: 2 / 3,
  },
  selectedOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  selectedTitle: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 14,
  },
  primaryButton: {
    borderRadius: 24,
    backgroundColor: '#f472b6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  primaryButtonLabel: {
    color: '#09090b',
    fontSize: 15,
    fontWeight: '900',
  },
});

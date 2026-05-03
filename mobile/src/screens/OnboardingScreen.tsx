import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AppScreen from '../components/AppScreen';
import EmptyStateCard from '../components/EmptyStateCard';
import InlineBanner from '../components/InlineBanner';
import ScreenHeader from '../components/ScreenHeader';
import SearchField from '../components/SearchField';
import { ApiError, getOnboardingPreferences, saveOnboardingPreferences, searchMovies, searchPeople } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { FALLBACK_POSTER, type ProfileShowcasePerson, type SearchMovie } from '../types';

const MIN_FAVORITE_MOVIES = 5;
const MAX_FAVORITE_MOVIES = 8;
const MAX_FAVORITE_PEOPLE = 6;

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

function personFromName(name: string): ProfileShowcasePerson {
  return {
    id: null,
    name,
    photo_url: null,
    known_for_department: null,
  };
}

export default function OnboardingScreen() {
  const { session, completeOnboarding, signOut } = useAuth();
  const { theme } = useTheme();
  const [genres, setGenres] = useState<string[]>([]);
  const [people, setPeople] = useState<ProfileShowcasePerson[]>([]);
  const [movies, setMovies] = useState<SearchMovie[]>([]);
  const [movieQuery, setMovieQuery] = useState('');
  const [personQuery, setPersonQuery] = useState('');
  const [movieResults, setMovieResults] = useState<SearchMovie[]>([]);
  const [personResults, setPersonResults] = useState<ProfileShowcasePerson[]>([]);
  const [bootLoading, setBootLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchingMovies, setSearchingMovies] = useState(false);
  const [searchingPeople, setSearchingPeople] = useState(false);
  const [error, setError] = useState('');

  const selectedMovieIds = useMemo(() => new Set(movies.map((movie) => movie.id)), [movies]);
  const selectedPeopleKeys = useMemo(
    () => new Set(people.map((person) => String(person.id ?? person.name.toLowerCase()))),
    [people],
  );
  const missingMoviesCount = Math.max(0, MIN_FAVORITE_MOVIES - movies.length);
  const canContinue = movies.length >= MIN_FAVORITE_MOVIES && !saving;

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
        setPeople((payload.favorite_people ?? []).map(personFromName));
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
      setSearchingMovies(false);
      return;
    }

    const handle = setTimeout(() => {
      void (async () => {
        setSearchingMovies(true);
        try {
          const results = await searchMovies(session.token, trimmedQuery);
          setMovieResults(results.filter((movie) => !selectedMovieIds.has(movie.id)).slice(0, 8));
          setError('');
        } catch (searchError) {
          if (searchError instanceof ApiError && searchError.status === 401) {
            await signOut();
            return;
          }
          setError('Impossible de rechercher ce film.');
        } finally {
          setSearchingMovies(false);
        }
      })();
    }, 220);

    return () => clearTimeout(handle);
  }, [movieQuery, selectedMovieIds, session, signOut]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const trimmedQuery = personQuery.trim();
    if (trimmedQuery.length < 2) {
      setPersonResults([]);
      setSearchingPeople(false);
      return;
    }

    const handle = setTimeout(() => {
      void (async () => {
        setSearchingPeople(true);
        try {
          const results = await searchPeople(session.token, trimmedQuery);
          setPersonResults(
            results
              .filter((person) => !selectedPeopleKeys.has(String(person.id ?? person.name.toLowerCase())))
              .slice(0, 8),
          );
          setError('');
        } catch (searchError) {
          if (searchError instanceof ApiError && searchError.status === 401) {
            await signOut();
            return;
          }
          setError('Impossible de rechercher cette personne.');
        } finally {
          setSearchingPeople(false);
        }
      })();
    }, 220);

    return () => clearTimeout(handle);
  }, [personQuery, selectedPeopleKeys, session, signOut]);

  const toggleGenre = (genre: string) => {
    setGenres((current) =>
      current.includes(genre)
        ? current.filter((entry) => entry !== genre)
        : [...current, genre].slice(0, 8),
    );
  };

  const addMovie = (movie: SearchMovie) => {
    setMovies((current) => {
      if (current.some((entry) => entry.id === movie.id) || current.length >= MAX_FAVORITE_MOVIES) {
        return current;
      }
      return [...current, movie];
    });
    setMovieResults((current) => current.filter((entry) => entry.id !== movie.id));
    setMovieQuery('');
    setError('');
  };

  const addPerson = (person: ProfileShowcasePerson) => {
    setPeople((current) => {
      const personKey = String(person.id ?? person.name.toLowerCase());
      if (current.some((entry) => String(entry.id ?? entry.name.toLowerCase()) === personKey) || current.length >= MAX_FAVORITE_PEOPLE) {
        return current;
      }
      return [...current, person];
    });
    setPersonResults((current) => current.filter((entry) => String(entry.id ?? entry.name.toLowerCase()) !== String(person.id ?? person.name.toLowerCase())));
    setPersonQuery('');
    setError('');
  };

  const handleSubmit = async () => {
    if (!session) {
      return;
    }

    if (movies.length < MIN_FAVORITE_MOVIES) {
      setError(`Choisis encore ${missingMoviesCount} film${missingMoviesCount > 1 ? 's' : ''} pour lancer une IA correcte.`);
      return;
    }

    setSaving(true);
    setError('');

    try {
      await saveOnboardingPreferences(session.token, {
        favorite_genres: genres,
        favorite_people: people.map((person) => person.name),
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
        <ActivityIndicator color={theme.colors.text} />
        <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>Preparation de ton profil cinema...</Text>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <ScreenHeader
        icon="sparkles"
        accent="pink"
        title="Tes gouts de depart"
        subtitle="5 films minimum pour lancer une vraie reco."
      />

      <View style={styles.progressRow}>
        <View style={[styles.progressPill, { borderColor: movies.length >= MIN_FAVORITE_MOVIES ? theme.colors.success : theme.rgba.border, backgroundColor: theme.rgba.card }]}>
          <Text style={[styles.progressValue, { color: theme.colors.text }]}>{movies.length}/{MIN_FAVORITE_MOVIES}</Text>
          <Text style={[styles.progressLabel, { color: theme.colors.textMuted }]}>films requis</Text>
        </View>
        <View style={[styles.progressPill, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
          <Text style={[styles.progressValue, { color: theme.colors.text }]}>{people.length}</Text>
          <Text style={[styles.progressLabel, { color: theme.colors.textMuted }]}>personnes</Text>
        </View>
        <View style={[styles.progressPill, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
          <Text style={[styles.progressValue, { color: theme.colors.text }]}>{genres.length}</Text>
          <Text style={[styles.progressLabel, { color: theme.colors.textMuted }]}>genres</Text>
        </View>
      </View>

      {error ? <InlineBanner message={error} tone="error" /> : null}

      <View style={[styles.card, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Tes 5 films preferes</Text>
            <Text style={[styles.cardSubtitle, { color: theme.colors.textMuted }]}>{missingMoviesCount > 0 ? `Encore ${missingMoviesCount} a choisir` : 'Base IA prete'}</Text>
          </View>
          <View style={[styles.requiredBadge, { backgroundColor: movies.length >= MIN_FAVORITE_MOVIES ? theme.colors.success : theme.colors.accentSoft }]}>
            <Text style={[styles.requiredBadgeLabel, { color: movies.length >= MIN_FAVORITE_MOVIES ? '#08111f' : theme.colors.accent }]}>{movies.length}/{MAX_FAVORITE_MOVIES}</Text>
          </View>
        </View>

        <SearchField value={movieQuery} onChangeText={setMovieQuery} placeholder="Chercher un film indispensable" />
        {searchingMovies ? <ActivityIndicator color={theme.colors.text} style={{ marginTop: 6 }} /> : null}

        {movieResults.length > 0 ? (
          <View style={styles.resultsList}>
            {movieResults.map((movie) => (
              <Pressable
                key={movie.id}
                onPress={() => addMovie(movie)}
                style={[styles.resultItem, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.cardStrong }]}
              >
                <Image source={{ uri: movie.poster_url || FALLBACK_POSTER }} style={styles.resultPoster} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.resultTitle, { color: theme.colors.text }]} numberOfLines={1}>{movie.title}</Text>
                  <Text style={[styles.resultMeta, { color: theme.colors.ratingText }]}>{movie.rating.toFixed(1)} / 10</Text>
                </View>
                <Ionicons name="add-circle" size={22} color={theme.colors.accent} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {movies.length > 0 ? (
          <View style={styles.selectedMoviesGrid}>
            {movies.map((movie) => (
              <Pressable key={movie.id} onPress={() => setMovies((current) => current.filter((entry) => entry.id !== movie.id))} style={styles.selectedMovie}>
                <Image source={{ uri: movie.poster_url || FALLBACK_POSTER }} style={styles.selectedPoster} />
                <View style={styles.removeBubble}>
                  <Ionicons name="close" size={13} color="#ffffff" />
                </View>
                <View style={styles.selectedOverlay}>
                  <Text style={styles.selectedTitle} numberOfLines={2}>{movie.title}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <EmptyStateCard title="Ajoute tes films cultes" />
        )}
      </View>

      <View style={[styles.card, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Acteurs et realisateurs</Text>
            <Text style={[styles.cardSubtitle, { color: theme.colors.textMuted }]}>Optionnel, mais tres utile.</Text>
          </View>
          <Text style={[styles.counterLabel, { color: theme.colors.textMuted }]}>{people.length}/{MAX_FAVORITE_PEOPLE}</Text>
        </View>

        <SearchField value={personQuery} onChangeText={setPersonQuery} placeholder="Chercher une personne" icon="person-outline" />
        {searchingPeople ? <ActivityIndicator color={theme.colors.text} style={{ marginTop: 6 }} /> : null}

        {personResults.length > 0 ? (
          <View style={styles.peopleResults}>
            {personResults.map((person) => (
              <Pressable key={`${person.id ?? person.name}-${person.name}`} style={[styles.personResult, { backgroundColor: theme.rgba.cardStrong }]} onPress={() => addPerson(person)}>
                <Image source={{ uri: person.photo_url || FALLBACK_POSTER }} style={styles.personImage} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.personName, { color: theme.colors.text }]} numberOfLines={1}>{person.name}</Text>
                  <Text style={[styles.personMeta, { color: theme.colors.textMuted }]}>{person.known_for_department ?? 'Cinema'}</Text>
                </View>
                <Ionicons name="add" size={18} color={theme.colors.accent} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {people.length > 0 ? (
          <View style={styles.selectedPeopleGrid}>
            {people.map((person) => (
              <Pressable key={`${person.id ?? person.name}-${person.name}`} style={[styles.selectedPerson, { backgroundColor: theme.colors.accentSoft }]} onPress={() => setPeople((current) => current.filter((entry) => String(entry.id ?? entry.name.toLowerCase()) !== String(person.id ?? person.name.toLowerCase())))}>
                <Image source={{ uri: person.photo_url || FALLBACK_POSTER }} style={styles.selectedPersonImage} />
                <Text style={[styles.selectedPersonName, { color: theme.colors.text }]} numberOfLines={1}>{person.name}</Text>
                <Ionicons name="close" size={14} color={theme.colors.accent} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <View style={[styles.card, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Genres bonus</Text>
            <Text style={[styles.cardSubtitle, { color: theme.colors.textMuted }]}>Pour affiner sans enfermer.</Text>
          </View>
          <Text style={[styles.counterLabel, { color: theme.colors.textMuted }]}>{genres.length}/8</Text>
        </View>
        <View style={styles.chipsWrap}>
          {GENRES.map((genre) => {
            const isActive = genres.includes(genre);
            return (
              <Pressable
                key={genre}
                onPress={() => toggleGenre(genre)}
                style={[
                  styles.chip,
                  { borderColor: theme.rgba.border, backgroundColor: theme.rgba.cardStrong },
                  isActive && { borderColor: theme.colors.success, backgroundColor: theme.colors.success },
                ]}
              >
                <Text style={[styles.chipLabel, { color: theme.colors.textSoft }, isActive && { color: theme.isDark ? '#09090b' : '#ffffff' }]}>{genre}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable onPress={() => void handleSubmit()} style={[styles.primaryButton, { backgroundColor: canContinue ? theme.colors.accent : theme.rgba.cardStrong }]} disabled={!canContinue}>
        {saving ? <ActivityIndicator color={theme.colors.accentText} /> : <Text style={[styles.primaryButtonLabel, { color: canContinue ? theme.colors.accentText : theme.colors.textMuted }]}>{canContinue ? "Entrer dans l'app" : `Encore ${missingMoviesCount} film${missingMoviesCount > 1 ? 's' : ''}`}</Text>}
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
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  card: {
    gap: 14,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 18,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  cardSubtitle: {
    marginTop: 4,
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '700',
  },
  requiredBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  requiredBadgeLabel: {
    fontSize: 12,
    fontWeight: '900',
  },
  counterLabel: {
    fontSize: 12,
    fontWeight: '900',
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
    fontWeight: '800',
  },
  resultMeta: {
    color: '#fde68a',
    marginTop: 4,
    fontSize: 12,
    fontWeight: '800',
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
  removeBubble: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2,6,23,0.72)',
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
  peopleResults: {
    gap: 10,
  },
  personResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    padding: 10,
  },
  personImage: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  personName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  personMeta: {
    marginTop: 3,
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '700',
  },
  selectedPeopleGrid: {
    gap: 9,
  },
  selectedPerson: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  selectedPersonImage: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  selectedPersonName: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
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
  chipLabel: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '800',
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

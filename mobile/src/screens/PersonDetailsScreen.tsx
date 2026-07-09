import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError, fetchPersonDetails } from '../api/client';
import AppScreen from '../components/AppScreen';
import InlineBanner from '../components/InlineBanner';
import MovieQuickAddModal, { type QuickAddMovieTarget } from '../components/MovieQuickAddModal';
import MoviePosterTile from '../components/MoviePosterTile';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeContext';
import { FALLBACK_POSTER, type PersonDetails } from '../types';

function formatSimpleDate(value: string | null): string {
  if (!value) {
    return '';
  }

  const [year, month, day] = value.split('-');
  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

function formatDepartment(value: string | null): string {
  const departments: Record<string, string> = {
    Acting: 'Interprétation',
    Directing: 'Réalisation',
    Writing: 'Scénario',
    Production: 'Production',
  };

  return value ? departments[value] ?? value : '';
}

export default function PersonDetailsScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'PersonDetails'>) {
  const { session, signOut } = useAuth();
  const { theme } = useTheme();
  const [person, setPerson] = useState<PersonDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [quickAddMovie, setQuickAddMovie] = useState<QuickAddMovieTarget | null>(null);

  useEffect(() => {
    if (!session) {
      return;
    }

    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const payload = await fetchPersonDetails(session.token, route.params.personId);
        if (!active) {
          return;
        }
        setPerson(payload);
        setError('');
      } catch (fetchError) {
        if (fetchError instanceof ApiError && fetchError.status === 401) {
          await signOut();
          return;
        }
        if (active) {
          setError('Impossible de charger cette fiche.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [route.params.personId, session, signOut]);

  useEffect(() => {
    if (!feedback) {
      return;
    }
    const timeout = setTimeout(() => setFeedback(''), 2200);
    return () => clearTimeout(timeout);
  }, [feedback]);

  const metaItems = useMemo(() => {
    if (!person) {
      return [];
    }

    return [
      formatDepartment(person.known_for_department),
      person.birthday ? `Né(e) le ${formatSimpleDate(person.birthday)}` : '',
      person.deathday ? `Décès le ${formatSimpleDate(person.deathday)}` : '',
      person.place_of_birth,
    ].filter((item): item is string => Boolean(item));
  }, [person]);

  return (
    <AppScreen contentStyle={styles.screen}>
      <View style={styles.headerRow}>
        <Pressable style={[styles.iconButton, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]} numberOfLines={1}>
          {person?.name ?? route.params.name ?? 'Fiche acteur'}
        </Text>
        <View style={styles.iconSpacer} />
      </View>

      {loading ? (
        <View style={[styles.stateCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
          <ActivityIndicator color={theme.colors.text} />
          <Text style={[styles.stateText, { color: theme.colors.textSoft }]}>Chargement de la fiche...</Text>
        </View>
      ) : person ? (
        <>
          <View style={[styles.heroCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
            <Image source={{ uri: person.photo_url || route.params.photoUrl || FALLBACK_POSTER }} style={styles.heroImage} />
            <View style={styles.heroBody}>
              <Text style={[styles.name, { color: theme.colors.text }]}>{person.name}</Text>
              {metaItems.length > 0 ? (
                <View style={styles.metaWrap}>
                  {metaItems.slice(0, 4).map((item) => (
                    <View key={item} style={[styles.metaChip, { backgroundColor: theme.rgba.cardStrong }]}>
                      <Text style={[styles.metaChipText, { color: theme.colors.textSoft }]} numberOfLines={1}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </View>

          {error ? <InlineBanner message={error} tone="error" /> : null}
          {feedback ? <InlineBanner message={feedback} tone="success" /> : null}

          {person.biography ? (
            <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Bio</Text>
              <Text style={[styles.bodyText, { color: theme.colors.textSoft }]}>{person.biography}</Text>
            </View>
          ) : null}

          {person.known_for_movies.length > 0 ? (
            <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Films marquants</Text>
              <View style={styles.moviesGrid}>
                {person.known_for_movies.slice(0, 12).map((movie) => (
                  <View key={movie.id} style={styles.movieCell}>
                    <MoviePosterTile
                      movie={movie}
                      onPress={() => navigation.navigate('MovieDetails', { movieId: movie.id, title: movie.title })}
                      onLongPress={(event) => setQuickAddMovie({
                        id: movie.id,
                        title: movie.title,
                        anchorX: event.nativeEvent.pageX,
                        anchorY: event.nativeEvent.pageY,
                      })}
                    />
                    {movie.character || movie.job || movie.release_date ? (
                      <Text style={[styles.movieCredit, { color: theme.colors.textMuted }]} numberOfLines={2}>
                        {[movie.character || movie.job, movie.release_date].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </>
      ) : (
        <View style={[styles.stateCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
          <Ionicons name="person-circle-outline" size={32} color={theme.colors.textMuted} />
          <Text style={[styles.stateText, { color: theme.colors.textSoft }]}>Fiche indisponible.</Text>
        </View>
      )}
      <MovieQuickAddModal
        movie={quickAddMovie}
        onClose={() => setQuickAddMovie(null)}
        onAdded={(playlistName) => setFeedback(`Ajouté à ${playlistName}.`)}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSpacer: {
    width: 42,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '900',
  },
  stateCard: {
    minHeight: 190,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  stateText: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  heroCard: {
    overflow: 'hidden',
    borderRadius: 30,
    borderWidth: 1,
  },
  heroImage: {
    width: '100%',
    aspectRatio: 0.82,
  },
  heroBody: {
    gap: 12,
    padding: 16,
  },
  name: {
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -1.1,
  },
  metaWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaChip: {
    maxWidth: '100%',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  metaChipText: {
    fontSize: 12,
    fontWeight: '800',
  },
  sectionCard: {
    borderRadius: 26,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
  },
  moviesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  movieCell: {
    flexGrow: 1,
    flexBasis: '31%',
    minWidth: 0,
    gap: 6,
  },
  movieCredit: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
});

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  DeviceEventEmitter,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AppScreen from '../components/AppScreen';
import EmptyStateCard from '../components/EmptyStateCard';
import InlineBanner from '../components/InlineBanner';
import SearchField from '../components/SearchField';
import StarRatingInput from '../components/StarRatingInput';
import { ApiError, createReview, searchMovies, updateReview } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeContext';
import { FALLBACK_POSTER, type SearchMovie } from '../types';
import { PROFILE_REFRESH_EVENT, SOCIAL_REFRESH_EVENT } from '../utils/events';

export default function CreateReviewScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'CreateReview'>) {
  const { session, signOut } = useAuth();
  const { theme } = useTheme();
  const reviewId = route.params?.reviewId;
  const isEditMode = Boolean(reviewId);
  const initialMovie = route.params?.movieId
    ? {
        id: route.params.movieId,
        title: route.params.title ?? 'Film',
        poster_url: route.params.posterUrl ?? '',
        rating: route.params.rating ?? 0,
      }
    : null;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchMovie[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<SearchMovie | null>(initialMovie);
  const [reviewRating, setReviewRating] = useState(route.params?.reviewRating ?? 0);
  const [reviewContent, setReviewContent] = useState(route.params?.content ?? '');
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
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

  const canPublish = useMemo(
    () => Boolean(selectedMovie) && reviewRating > 0 && reviewContent.trim().length >= 10 && !publishing,
    [publishing, reviewContent, reviewRating, selectedMovie],
  );

  const selectMovie = (movie: SearchMovie) => {
    setSelectedMovie(movie);
    setQuery('');
    setResults([]);
    setError('');
  };

  const handlePublish = async () => {
    if (!session) {
      return;
    }

    const trimmedContent = reviewContent.trim();
    if (!selectedMovie) {
      setError('Choisis un film avant de publier ta critique.');
      return;
    }
    if (trimmedContent.length < 10) {
      setError('Ta critique doit contenir au moins 10 caracteres.');
      return;
    }
    if (reviewRating <= 0) {
      setError('Ajoute une note avant de publier ta critique.');
      return;
    }

    setPublishing(true);
    try {
      if (isEditMode && reviewId) {
        await updateReview(session.token, reviewId, {
          rating: reviewRating,
          content: trimmedContent,
        });
      } else {
        await createReview(session.token, {
          movie_id: selectedMovie.id,
          title: selectedMovie.title,
          poster_url: selectedMovie.poster_url || FALLBACK_POSTER,
          rating: reviewRating,
          content: trimmedContent,
        });
      }
      DeviceEventEmitter.emit(PROFILE_REFRESH_EVENT);
      DeviceEventEmitter.emit(SOCIAL_REFRESH_EVENT);
      navigation.goBack();
    } catch (publishError) {
      if (publishError instanceof ApiError && publishError.status === 401) {
        await signOut();
        return;
      }
      setError(
        publishError instanceof Error
          ? publishError.message
          : isEditMode ? 'Impossible de modifier cette critique.' : 'Impossible de publier cette critique.',
      );
    } finally {
      setPublishing(false);
    }
  };

  const resultsLabel = useMemo(() => {
    if (query.trim().length < 2) {
      return null;
    }
    return `${results.length} resultat${results.length > 1 ? 's' : ''}`;
  }, [query, results.length]);

  return (
    <AppScreen keyboardAware>
      <View style={styles.headerRow}>
        <Pressable style={[styles.iconButton, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        </Pressable>
        <View style={styles.headerBody}>
          <Text style={[styles.headerEyebrow, { color: theme.colors.accent }]}>Social</Text>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>{isEditMode ? 'Modifier la critique' : 'Nouvelle critique'}</Text>
          <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]}>{isEditMode ? 'Ajuste ta note et ton avis.' : 'Note. Ecris. Publie.'}</Text>
        </View>
      </View>

      {error ? <InlineBanner message={error} tone="error" /> : null}

      <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
        <View style={styles.rowBetween}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Film</Text>
          {resultsLabel ? <Text style={[styles.metaLabel, { color: theme.colors.textMuted }]}>{resultsLabel}</Text> : null}
        </View>
        {!isEditMode ? (
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder={selectedMovie ? 'Choisir un autre film' : 'Chercher un film'}
          />
        ) : null}

        {selectedMovie ? (
          <View style={[styles.selectedMovieCard, { borderColor: theme.colors.accentSoft, backgroundColor: theme.colors.accentSoft }]}>
            <Image
              source={{ uri: selectedMovie.poster_url || FALLBACK_POSTER }}
              style={styles.selectedMoviePoster}
            />
            <View style={styles.selectedMovieBody}>
              <Text style={[styles.selectedMovieTitle, { color: theme.colors.text }]}>{selectedMovie.title}</Text>
              {!isEditMode ? (
                <View style={[styles.ratingPill, { backgroundColor: theme.colors.ratingBackground }]}>
                  <Text style={[styles.ratingPillLabel, { color: theme.colors.ratingText }]}>{selectedMovie.rating.toFixed(1)} / 10</Text>
                </View>
              ) : null}
            </View>
            {!isEditMode ? (
              <Pressable
                style={styles.clearButton}
                onPress={() => {
                  setSelectedMovie(null);
                  setQuery('');
                  setResults([]);
                }}
              >
                <Ionicons name="refresh-outline" size={16} color={theme.colors.accent} />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={theme.colors.text} />
          </View>
        ) : null}

        {results.length > 0 ? (
          <View style={styles.resultsList}>
            {results.map((movie) => (
              <Pressable
                key={movie.id}
                style={[styles.resultCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.cardStrong }]}
                onPress={() => selectMovie(movie)}
              >
                <Image source={{ uri: movie.poster_url || FALLBACK_POSTER }} style={styles.resultPoster} />
                <View style={styles.resultBody}>
                  <Text style={[styles.resultTitle, { color: theme.colors.text }]}>{movie.title}</Text>
                  <Text style={[styles.resultHint, { color: theme.colors.textMuted }]}>Selectionner pour critiquer</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </Pressable>
            ))}
          </View>
        ) : !loading && !selectedMovie && query.trim().length >= 2 ? (
          <EmptyStateCard title="Aucun film" />
        ) : null}
      </View>

      <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Ta note</Text>
        <StarRatingInput
          value={reviewRating}
          onChange={setReviewRating}
          size={30}
        />
      </View>

      <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
        <View style={styles.rowBetween}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Ton avis</Text>
          <Text style={[styles.metaLabel, { color: theme.colors.textMuted }]}>{reviewContent.trim().length} caracteres</Text>
        </View>
        <TextInput
          value={reviewContent}
          onChangeText={setReviewContent}
          placeholder="Ecris ce que tu as ressenti, ce qui t'a marque, ce que tu recommandes..."
          placeholderTextColor={theme.colors.textMuted}
          multiline
          textAlignVertical="top"
          style={[styles.reviewInput, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.cardStrong, color: theme.colors.text }]}
          maxLength={600}
        />
      </View>

      <Pressable
        style={[styles.publishButton, { backgroundColor: theme.colors.secondaryAccent }, !canPublish && { backgroundColor: theme.rgba.cardStrong }]}
        onPress={() => void handlePublish()}
        disabled={!canPublish}
      >
        <Ionicons name="send" size={17} color={canPublish ? theme.colors.secondaryAccentText : theme.colors.textMuted} />
        <Text style={[styles.publishButtonLabel, { color: theme.colors.secondaryAccentText }, !canPublish && { color: theme.colors.textMuted }]}>
          {publishing ? (isEditMode ? 'Enregistrement...' : 'Publication...') : (isEditMode ? 'Enregistrer' : 'Publier la critique')}
        </Text>
      </Pressable>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
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
  headerBody: {
    flex: 1,
    gap: 4,
  },
  headerEyebrow: {
    color: '#c4b5fd',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  headerSubtitle: {
    color: '#9ca3af',
    fontSize: 14,
    lineHeight: 20,
  },
  sectionCard: {
    gap: 14,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 18,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
  },
  metaLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  selectedMovieCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(249,168,212,0.18)',
    backgroundColor: 'rgba(249,168,212,0.10)',
    padding: 10,
  },
  selectedMoviePoster: {
    width: 58,
    height: 84,
    borderRadius: 14,
  },
  selectedMovieBody: {
    flex: 1,
    gap: 8,
  },
  selectedMovieTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  clearButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingWrap: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  resultsList: {
    gap: 10,
  },
  resultCard: {
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
    width: 44,
    height: 66,
    borderRadius: 12,
  },
  resultBody: {
    flex: 1,
    gap: 4,
  },
  resultTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  resultHint: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
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
  reviewInput: {
    minHeight: 150,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    color: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    lineHeight: 22,
  },
  publishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 22,
    backgroundColor: '#7dd3fc',
    paddingVertical: 15,
  },
  publishButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  publishButtonLabel: {
    color: '#08111f',
    fontSize: 15,
    fontWeight: '900',
  },
  publishButtonLabelDisabled: {
    color: '#94a3b8',
  },
});

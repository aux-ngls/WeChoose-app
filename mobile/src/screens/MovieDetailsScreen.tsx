import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  DeviceEventEmitter,
  FlatList,
  Image,
  Linking,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { WEB_URL } from '../api/config';
import AppScreen from '../components/AppScreen';
import InlineBanner from '../components/InlineBanner';
import StarRatingInput from '../components/StarRatingInput';
import {
  addMovieToPlaylist,
  addToWatchLater,
  ApiError,
  createPlaylist,
  fetchMovieDetails,
  fetchPlaylists,
  fetchUserMovieRating,
  rateMovie,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeContext';
import { FALLBACK_POSTER, type PlaylistSummary } from '../types';

const TINDER_MOVIE_ACTION_EVENT = 'qulte:tinder-movie-action';
const MODAL_DISMISS_THRESHOLD = 90;
const MODAL_DISMISS_VELOCITY = 0.75;
const MODAL_OFFSCREEN_Y = 480;

function extractYouTubeVideoId(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  const patterns = [
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{6,})/,
    /youtu\.be\/([a-zA-Z0-9_-]{6,})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

export default function MovieDetailsScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'MovieDetails'>) {
  const { session, signOut } = useAuth();
  const { theme } = useTheme();
  const [movie, setMovie] = useState<Awaited<ReturnType<typeof fetchMovieDetails>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [userRating, setUserRating] = useState(0);
  const [showTrailer, setShowTrailer] = useState(false);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const trailerTranslateY = useState(() => new Animated.Value(0))[0];
  const playlistTranslateY = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    if (!feedback) {
      return;
    }
    const timeout = setTimeout(() => setFeedback(''), 2200);
    return () => clearTimeout(timeout);
  }, [feedback]);

  useEffect(() => {
    setShowTrailer(false);
  }, [route.params.movieId]);

  useEffect(() => {
    if (showTrailer) {
      trailerTranslateY.setValue(0);
    }
  }, [showTrailer, trailerTranslateY]);

  useEffect(() => {
    if (showPlaylistPicker) {
      playlistTranslateY.setValue(0);
    }
  }, [playlistTranslateY, showPlaylistPicker]);

  useEffect(() => {
    if (!session) {
      return;
    }

    let active = true;
    setLoading(true);
    setActionLoading(false);
    setMovie(null);
    setUserRating(0);
    setError('');
    setFeedback('');
    setShowPlaylistPicker(false);
    setNewPlaylistName('');

    void (async () => {
      try {
        const [payload, ratingPayload] = await Promise.all([
          fetchMovieDetails(session.token, route.params.movieId),
          fetchUserMovieRating(session.token, route.params.movieId),
        ]);
        if (active) {
          setMovie(payload);
          setUserRating(ratingPayload.rating ?? 0);
          setError('');
        }
      } catch (fetchError) {
        if (fetchError instanceof ApiError && fetchError.status === 401) {
          await signOut();
          return;
        }
        if (active) {
          setError('Impossible de charger cette fiche film.');
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
  }, [route.params.movieId, session, signOut]);

  const metaLine = useMemo(() => {
    if (!movie) {
      return '';
    }
    const parts = [
      movie.release_date,
      movie.runtime ? `${movie.runtime} min` : '',
      movie.rating ? `${movie.rating.toFixed(1)} / 10` : '',
    ]
      .map((part) => part.trim())
      .filter(Boolean);
    return parts.join(' • ');
  }, [movie]);

  const trailerPlayerUrl = useMemo(() => {
    const videoId = extractYouTubeVideoId(movie?.trailer_url);
    if (!videoId) {
      return null;
    }
    return `${WEB_URL}/mobile-trailer-player.html?videoId=${encodeURIComponent(videoId)}`;
  }, [movie?.trailer_url]);

  const handleWatchLater = async () => {
    if (!session || !movie) {
      return;
    }

    setActionLoading(true);
    try {
      await addToWatchLater(session.token, movie.id);
      if (route.params.source === 'tinder') {
        DeviceEventEmitter.emit(TINDER_MOVIE_ACTION_EVENT, {
          type: 'watch-later',
          movieId: movie.id,
        });
      }
      setFeedback('Ajoute a regarder plus tard.');
      setError('');
    } catch (actionError) {
      if (actionError instanceof ApiError && actionError.status === 401) {
        await signOut();
        return;
      }
      setError('Impossible d ajouter ce film a ta liste.');
    } finally {
      setActionLoading(false);
    }
  };

  const openPlaylistPicker = async () => {
    if (!session) {
      return;
    }

    setShowPlaylistPicker(true);
    setLoadingPlaylists(true);
    try {
      const payload = await fetchPlaylists(session.token);
      setPlaylists(payload.filter((playlist) => !playlist.readonly));
      setError('');
    } catch (playlistError) {
      if (playlistError instanceof ApiError && playlistError.status === 401) {
        await signOut();
        return;
      }
      setError('Impossible de charger les playlists.');
    } finally {
      setLoadingPlaylists(false);
    }
  };

  const handleAddToPlaylist = async (playlist: PlaylistSummary) => {
    if (!session || !movie) {
      return;
    }

    setActionLoading(true);
    try {
      await addMovieToPlaylist(session.token, playlist.id, movie.id);
      if (route.params.source === 'tinder' && playlist.system_key === 'watch-later') {
        DeviceEventEmitter.emit(TINDER_MOVIE_ACTION_EVENT, {
          type: 'watch-later',
          movieId: movie.id,
        });
      }
      setShowPlaylistPicker(false);
      setFeedback(`Ajoute a ${playlist.name}.`);
      setError('');
    } catch (playlistError) {
      if (playlistError instanceof ApiError && playlistError.status === 401) {
        await signOut();
        return;
      }
      setError("Impossible d'ajouter ce film a cette playlist.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreatePlaylist = async () => {
    if (!session || !newPlaylistName.trim()) {
      return;
    }

    setLoadingPlaylists(true);
    try {
      const created = await createPlaylist(session.token, newPlaylistName.trim());
      setPlaylists((current) => [created, ...current]);
      setNewPlaylistName('');
      setFeedback('Playlist creee.');
      setError('');
    } catch (createError) {
      if (createError instanceof ApiError && createError.status === 401) {
        await signOut();
        return;
      }
      setError('Impossible de creer cette playlist.');
    } finally {
      setLoadingPlaylists(false);
    }
  };

  const handleRate = async (value: number) => {
    if (!session || !movie) {
      return;
    }

    setActionLoading(true);
    setUserRating(value);
    try {
      await rateMovie(session.token, movie.id, value);
      if (route.params.source === 'tinder') {
        DeviceEventEmitter.emit(TINDER_MOVIE_ACTION_EVENT, {
          type: 'rated',
          movieId: movie.id,
          rating: value,
        });
      }
      setFeedback(`Note enregistree : ${value.toFixed(1)} / 5.`);
      setError('');
    } catch (actionError) {
      if (actionError instanceof ApiError && actionError.status === 401) {
        await signOut();
        return;
      }
      setUserRating(0);
      setError('Impossible d enregistrer la note.');
    } finally {
      setActionLoading(false);
    }
  };

  const openProviderLink = async () => {
    if (!movie?.watch_providers.link) {
      return;
    }
    await Linking.openURL(movie.watch_providers.link);
  };

  const openTrailer = () => {
    if (!trailerPlayerUrl) {
      setError('Bande-annonce indisponible dans l application.');
      return;
    }

    setError('');
    setShowTrailer(true);
  };

  const resetModalPosition = (translateY: Animated.Value) => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      friction: 8,
      tension: 90,
    }).start();
  };

  const dismissModal = (translateY: Animated.Value, onHidden: () => void) => {
    Animated.timing(translateY, {
      toValue: MODAL_OFFSCREEN_Y,
      duration: 170,
      useNativeDriver: true,
    }).start(() => {
      translateY.setValue(0);
      onHidden();
    });
  };

  const trailerPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dy) > 10 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && gestureState.dy > 0,
        onPanResponderMove: (_, gestureState) => {
          trailerTranslateY.setValue(Math.max(0, gestureState.dy));
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy > MODAL_DISMISS_THRESHOLD || gestureState.vy > MODAL_DISMISS_VELOCITY) {
            dismissModal(trailerTranslateY, () => setShowTrailer(false));
            return;
          }
          resetModalPosition(trailerTranslateY);
        },
        onPanResponderTerminate: () => resetModalPosition(trailerTranslateY),
      }),
    [trailerTranslateY],
  );

  const playlistPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dy) > 10 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && gestureState.dy > 0,
        onPanResponderMove: (_, gestureState) => {
          playlistTranslateY.setValue(Math.max(0, gestureState.dy));
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy > MODAL_DISMISS_THRESHOLD || gestureState.vy > MODAL_DISMISS_VELOCITY) {
            dismissModal(playlistTranslateY, () => setShowPlaylistPicker(false));
            return;
          }
          resetModalPosition(playlistTranslateY);
        },
        onPanResponderTerminate: () => resetModalPosition(playlistTranslateY),
      }),
    [playlistTranslateY],
  );

  const providers = movie
    ? [
        { label: 'Abonnement', items: movie.watch_providers.subscription },
        { label: 'Location', items: movie.watch_providers.rent },
        { label: 'Achat', items: movie.watch_providers.buy },
      ].filter((group) => group.items.length > 0)
    : [];

  return (
    <>
      <AppScreen>
        <View style={styles.headerRow}>
          <Pressable style={[styles.iconButton, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]} numberOfLines={1}>
            {movie?.title ?? route.params.title ?? 'Fiche film'}
          </Text>
          <View style={styles.iconSpacer} />
        </View>

        {loading ? (
          <View style={[styles.stateCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
            <ActivityIndicator color={theme.colors.text} />
            <Text style={[styles.stateText, { color: theme.colors.textSoft }]}>Chargement de la fiche...</Text>
          </View>
        ) : movie ? (
          <>
            <View style={[styles.heroCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
              <Image source={{ uri: movie.poster_url || FALLBACK_POSTER }} style={styles.heroPoster} />
              <View style={styles.heroBody}>
                <Text style={[styles.movieTitle, { color: theme.colors.text }]}>{movie.title}</Text>
                {metaLine ? <Text style={[styles.metaLine, { color: theme.colors.textSoft }]}>{metaLine}</Text> : null}
                {movie.tagline ? <Text style={[styles.tagline, { color: theme.colors.accent }]}>{movie.tagline}</Text> : null}
                <View style={styles.genreRow}>
                  {movie.genres.map((genre) => (
                    <View key={genre} style={[styles.genreChip, { backgroundColor: theme.rgba.cardStrong }]}>
                      <Text style={[styles.genreChipLabel, { color: theme.colors.text }]}>{genre}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            {error ? <InlineBanner message={error} tone="error" /> : null}
            {feedback ? <InlineBanner message={feedback} tone="success" /> : null}

            <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Actions</Text>
              <View style={styles.actionsRow}>
                <Pressable
                  style={[styles.movieActionButton, styles.movieActionButtonPrimary, { backgroundColor: theme.colors.accent }, actionLoading && styles.movieActionButtonDisabled]}
                  onPress={() => void handleWatchLater()}
                  disabled={actionLoading}
                >
                  <View style={[styles.movieActionIcon, styles.movieActionIconPrimary]}>
                    <Ionicons name="time-outline" size={21} color={theme.colors.accentText} />
                  </View>
                  <Text style={[styles.movieActionLabel, styles.movieActionLabelPrimary, { color: theme.colors.accentText }]} numberOfLines={1}>Plus tard</Text>
                </Pressable>
                <Pressable style={[styles.movieActionButton, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.cardStrong }]} onPress={() => void openPlaylistPicker()}>
                  <View style={[styles.movieActionIcon, { backgroundColor: theme.rgba.card }]}>
                    <Ionicons name="albums-outline" size={21} color={theme.colors.text} />
                  </View>
                  <Text style={[styles.movieActionLabel, { color: theme.colors.text }]} numberOfLines={1}>Playlist</Text>
                </Pressable>
                {movie.trailer_url ? (
                  <Pressable style={[styles.movieActionButton, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.cardStrong }]} onPress={openTrailer}>
                    <View style={[styles.movieActionIcon, { backgroundColor: theme.rgba.card }]}>
                      <Ionicons name="play-circle-outline" size={22} color={theme.colors.text} />
                    </View>
                    <Text style={[styles.movieActionLabel, { color: theme.colors.text }]} numberOfLines={1}>Trailer</Text>
                  </Pressable>
                ) : null}
              </View>
              <Pressable
                style={[styles.shareButton, { backgroundColor: theme.colors.secondaryAccent }]}
                onPress={() => navigation.navigate('ShareMovie', {
                  movieId: movie.id,
                  title: movie.title,
                  posterUrl: movie.poster_url,
                  rating: movie.rating,
                })}
              >
                <Ionicons name="send" size={16} color={theme.colors.secondaryAccentText} />
                <Text style={[styles.shareButtonLabel, { color: theme.colors.secondaryAccentText }]}>Partager</Text>
              </Pressable>
              <Pressable
                style={[styles.reviewButton, { borderColor: theme.colors.accentSoft, backgroundColor: theme.colors.accentSoft }]}
                onPress={() => navigation.navigate('CreateReview', {
                  movieId: movie.id,
                  title: movie.title,
                  posterUrl: movie.poster_url,
                  rating: movie.rating,
                })}
              >
                <Ionicons name="create-outline" size={16} color={theme.colors.accent} />
                <Text style={[styles.reviewButtonLabel, { color: theme.colors.accent }]}>Ecrire une critique</Text>
              </Pressable>
              <View style={styles.ratingBlock}>
                <Text style={[styles.ratingLabel, { color: theme.colors.textSoft }]}>Ta note</Text>
                <StarRatingInput
                  value={userRating}
                  onChange={(value) => void handleRate(value)}
                  size={30}
                  disabled={actionLoading}
                />
              </View>
            </View>

            {movie.overview ? (
              <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Synopsis</Text>
                <Text style={[styles.bodyText, { color: theme.colors.textSoft }]}>{movie.overview}</Text>
              </View>
            ) : null}

            {movie.directors.length > 0 ? (
              <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Realisation</Text>
                <Text style={[styles.bodyText, { color: theme.colors.textSoft }]}>{movie.directors.join(', ')}</Text>
              </View>
            ) : null}

            {providers.length > 0 ? (
              <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Ou le regarder</Text>
                  {movie.watch_providers.link ? (
                    <Pressable onPress={() => void openProviderLink()}>
                      <Text style={[styles.inlineLink, { color: theme.colors.secondaryAccent }]}>Voir</Text>
                    </Pressable>
                  ) : null}
                </View>
                {providers.map((group) => (
                  <View key={group.label} style={styles.providerGroup}>
                    <Text style={[styles.providerLabel, { color: theme.colors.textSoft }]}>{group.label}</Text>
                    <FlatList
                      horizontal
                      data={group.items}
                      keyExtractor={(item) => String(item.id)}
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.providersList}
                      renderItem={({ item }) => (
                        <View style={[styles.providerCard, { backgroundColor: theme.rgba.cardStrong }]}>
                          {item.logo_url ? <Image source={{ uri: item.logo_url }} style={styles.providerLogo} /> : null}
                          <Text style={[styles.providerName, { color: theme.colors.text }]} numberOfLines={2}>{item.name}</Text>
                        </View>
                      )}
                    />
                  </View>
                ))}
              </View>
            ) : null}

            {movie.cast.length > 0 ? (
              <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Casting</Text>
                <FlatList
                  horizontal
                  data={movie.cast}
                  keyExtractor={(item) => `${item.name}-${item.character}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.castList}
                  renderItem={({ item }) => (
                    <View style={styles.castCard}>
                      <Image source={{ uri: item.photo || FALLBACK_POSTER }} style={styles.castPhoto} />
                      <Text style={[styles.castName, { color: theme.colors.text }]} numberOfLines={2}>{item.name}</Text>
                      <Text style={[styles.castCharacter, { color: theme.colors.textMuted }]} numberOfLines={2}>{item.character}</Text>
                    </View>
                  )}
                />
              </View>
            ) : null}
          </>
        ) : (
          <View style={[styles.stateCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
            <Text style={[styles.stateText, { color: theme.colors.textSoft }]}>Cette fiche est indisponible pour le moment.</Text>
          </View>
        )}
      </AppScreen>

      <Modal visible={showTrailer} animationType="slide" presentationStyle="fullScreen">
        <Animated.View style={[styles.trailerModal, { transform: [{ translateY: trailerTranslateY }] }]}>
          <View style={styles.modalHandleZone} {...trailerPanResponder.panHandlers}>
            <View style={styles.modalHandle} />
          </View>
          <View style={styles.trailerHeader}>
            <Text style={styles.trailerTitle} numberOfLines={1}>{movie?.title ?? 'Bande-annonce'}</Text>
            <Pressable style={styles.iconButton} onPress={() => dismissModal(trailerTranslateY, () => setShowTrailer(false))}>
              <Ionicons name="close" size={22} color="#ffffff" />
            </Pressable>
          </View>
          {trailerPlayerUrl ? (
            <WebView
              source={{ uri: trailerPlayerUrl }}
              allowsInlineMediaPlayback
              allowsFullscreenVideo
              mediaPlaybackRequiresUserAction={false}
              style={styles.trailerWebview}
            />
          ) : (
            <View style={styles.stateCard}>
              <Text style={styles.stateText}>Aucune bande-annonce disponible.</Text>
            </View>
          )}
        </Animated.View>
      </Modal>

      <Modal visible={showPlaylistPicker} animationType="slide" transparent>
        <Pressable style={styles.sheetBackdrop} onPress={() => dismissModal(playlistTranslateY, () => setShowPlaylistPicker(false))}>
          <Animated.View style={[styles.sheetWrap, { transform: [{ translateY: playlistTranslateY }] }]}>
            <Pressable style={[styles.sheet, { borderColor: theme.rgba.border, backgroundColor: theme.colors.surface }]} onPress={(event) => event.stopPropagation()}>
            <View style={styles.modalHandleZone} {...playlistPanResponder.panHandlers}>
              <View style={[styles.modalHandle, { backgroundColor: theme.rgba.border }]} />
            </View>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: theme.colors.text }]}>Ajouter a une playlist</Text>
              <Pressable style={[styles.sheetCloseButton, { backgroundColor: theme.rgba.cardStrong }]} onPress={() => dismissModal(playlistTranslateY, () => setShowPlaylistPicker(false))}>
                <Ionicons name="close" size={20} color={theme.colors.text} />
              </Pressable>
            </View>

            <View style={styles.createRow}>
              <TextInput
                value={newPlaylistName}
                onChangeText={setNewPlaylistName}
                placeholder="Nouvelle playlist"
                placeholderTextColor={theme.colors.textMuted}
                style={[styles.createInput, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.cardStrong, color: theme.colors.text }]}
              />
              <Pressable style={[styles.createButton, { backgroundColor: theme.colors.secondaryAccent }]} onPress={() => void handleCreatePlaylist()}>
                <Ionicons name="add" size={20} color={theme.colors.secondaryAccentText} />
              </Pressable>
            </View>

            {loadingPlaylists ? <Text style={[styles.sheetHelper, { color: theme.colors.textMuted }]}>Chargement...</Text> : null}
            <View style={styles.playlistList}>
              {playlists.map((playlist) => (
                <Pressable
                  key={playlist.id}
                  style={[styles.playlistRow, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
                  onPress={() => void handleAddToPlaylist(playlist)}
                  disabled={actionLoading}
                >
                  <Ionicons name={playlist.system_key === 'watch-later' ? 'time-outline' : 'albums-outline'} size={19} color={theme.colors.secondaryAccent} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.playlistName, { color: theme.colors.text }]}>{playlist.name}</Text>
                    <Text style={[styles.playlistMeta, { color: theme.colors.textMuted }]}>{playlist.type === 'custom' ? 'Playlist perso' : 'Liste systeme'}</Text>
                  </View>
                  <Ionicons name="add-circle" size={21} color={theme.colors.accent} />
                </Pressable>
              ))}
            </View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  iconSpacer: {
    width: 42,
  },
  headerTitle: {
    flex: 1,
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
  },
  stateCard: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  stateText: {
    color: '#cbd5e1',
    textAlign: 'center',
  },
  heroCard: {
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  heroPoster: {
    width: '100%',
    aspectRatio: 0.82,
  },
  heroBody: {
    padding: 18,
    gap: 10,
  },
  movieTitle: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -1,
  },
  metaLine: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 20,
  },
  tagline: {
    color: '#f9a8d4',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  genreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  genreChip: {
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  genreChipLabel: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionCard: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 18,
    gap: 14,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  movieActionButton: {
    flex: 1,
    minHeight: 78,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.055)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 8,
  },
  movieActionButtonPrimary: {
    borderColor: 'rgba(244,114,182,0.46)',
    backgroundColor: '#f472b6',
  },
  movieActionButtonDisabled: {
    opacity: 0.55,
  },
  movieActionIcon: {
    width: 34,
    height: 34,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  movieActionIconPrimary: {
    backgroundColor: 'rgba(20,5,15,0.12)',
  },
  movieActionLabel: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  movieActionLabelPrimary: {
    color: '#14050f',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 18,
    backgroundColor: '#7dd3fc',
    paddingVertical: 13,
  },
  shareButtonLabel: {
    color: '#08111f',
    fontSize: 14,
    fontWeight: '900',
  },
  reviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(249,168,212,0.22)',
    backgroundColor: 'rgba(249,168,212,0.10)',
    paddingVertical: 13,
  },
  reviewButtonLabel: {
    color: '#f9a8d4',
    fontSize: 14,
    fontWeight: '900',
  },
  ratingBlock: {
    gap: 10,
  },
  ratingLabel: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
  },
  bodyText: {
    color: '#e5e7eb',
    fontSize: 14,
    lineHeight: 22,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  inlineLink: {
    color: '#7dd3fc',
    fontWeight: '700',
  },
  providerGroup: {
    gap: 8,
  },
  providerLabel: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
  },
  providersList: {
    gap: 12,
  },
  providerCard: {
    width: 96,
    gap: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 10,
  },
  providerLogo: {
    width: 40,
    height: 40,
    borderRadius: 12,
  },
  providerName: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  castList: {
    gap: 12,
  },
  castCard: {
    width: 116,
    gap: 8,
  },
  castPhoto: {
    width: '100%',
    aspectRatio: 0.74,
    borderRadius: 18,
  },
  castName: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  castCharacter: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 17,
  },
  trailerModal: {
    flex: 1,
    backgroundColor: '#050507',
  },
  modalHandleZone: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  modalHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  trailerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 16,
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  trailerTitle: {
    flex: 1,
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
  },
  trailerWebview: {
    flex: 1,
    backgroundColor: '#000000',
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.68)',
  },
  sheetWrap: {
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '78%',
    gap: 14,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: '#09090b',
    padding: 18,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sheetTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  sheetCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  createInput: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  createButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#7dd3fc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetHelper: {
    color: '#94a3b8',
    fontSize: 13,
  },
  playlistList: {
    gap: 10,
  },
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 12,
  },
  playlistName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  playlistMeta: {
    marginTop: 3,
    color: '#94a3b8',
    fontSize: 12,
  },
});

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Audio, type AVPlaybackStatus, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { API_URL } from '../api/config';
import AppScreen from '../components/AppScreen';
import EmptyStateCard from '../components/EmptyStateCard';
import InlineBanner from '../components/InlineBanner';
import MoviePosterTile from '../components/MoviePosterTile';
import {
  ApiError,
  createPlaylist,
  deleteReview,
  fetchPlaylistMovies,
  fetchPlaylists,
  fetchSocialProfile,
  saveProfilePreferences,
  searchMovies,
  searchPeople,
  searchSoundtracks,
  uploadProfilePhoto,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeContext';
import {
  FALLBACK_POSTER,
  type PlaylistSummary,
  type ProfileShowcaseMovie,
  type ProfileShowcasePerson,
  type ProfileShowcaseSoundtrack,
  type SearchMovie,
  type SocialProfile,
} from '../types';
import { formatDate } from '../utils/format';

interface PlaylistWithPreview extends PlaylistSummary {
  count: number;
  preview_movies: SearchMovie[];
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

function guessImageType(uri: string, mimeType?: string | null): string {
  if (mimeType) {
    return mimeType;
  }
  const loweredUri = uri.toLowerCase();
  if (loweredUri.endsWith('.png')) {
    return 'image/png';
  }
  if (loweredUri.endsWith('.webp')) {
    return 'image/webp';
  }
  return 'image/jpeg';
}

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistWithPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playerMessage, setPlayerMessage] = useState('');
  const [isSoundtrackPlaying, setIsSoundtrackPlaying] = useState(false);
  const [activeSoundtrackUrl, setActiveSoundtrackUrl] = useState<string | null>(null);
  const [isEditingShowcase, setIsEditingShowcase] = useState(false);
  const [savingShowcase, setSavingShowcase] = useState(false);
  const [draftDescription, setDraftDescription] = useState('');
  const [draftGenresText, setDraftGenresText] = useState('');
  const [draftMovies, setDraftMovies] = useState<ProfileShowcaseMovie[]>([]);
  const [draftPeople, setDraftPeople] = useState<ProfileShowcasePerson[]>([]);
  const [draftSoundtrack, setDraftSoundtrack] = useState<ProfileShowcaseSoundtrack | null>(null);
  const [movieQuery, setMovieQuery] = useState('');
  const [movieResults, setMovieResults] = useState<SearchMovie[]>([]);
  const [personQuery, setPersonQuery] = useState('');
  const [personResults, setPersonResults] = useState<ProfileShowcasePerson[]>([]);
  const [soundtrackQuery, setSoundtrackQuery] = useState('');
  const [soundtrackResults, setSoundtrackResults] = useState<ProfileShowcaseSoundtrack[]>([]);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [savingPlaylist, setSavingPlaylist] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [showAllPlaylists, setShowAllPlaylists] = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [expandedProfileReviewId, setExpandedProfileReviewId] = useState<number | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    void Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      interruptionModeIOS: InterruptionModeIOS.DuckOthers,
    });

    return () => {
      const currentSound = soundRef.current;
      soundRef.current = null;
      if (currentSound) {
        void currentSound.unloadAsync();
      }
    };
  }, []);

  useEffect(() => {
    if (!playerMessage) {
      return;
    }
    const timeout = setTimeout(() => setPlayerMessage(''), 2200);
    return () => clearTimeout(timeout);
  }, [playerMessage]);

  const loadProfile = useCallback(async () => {
    if (!session) {
      return;
    }

    try {
      const [profilePayload, playlistsPayload] = await Promise.all([
        fetchSocialProfile(session.token, session.username),
        fetchPlaylists(session.token),
      ]);

      const playlistsWithPreview = await Promise.all(
        playlistsPayload.map(async (playlist) => {
          const movies = await fetchPlaylistMovies(session.token, playlist.id);
          return {
            ...playlist,
            count: movies.length,
            preview_movies: movies.slice(0, 3),
          } satisfies PlaylistWithPreview;
        }),
      );

      setProfile(profilePayload);
      setPlaylists(playlistsWithPreview);
      setError('');
    } catch (fetchError) {
      if (fetchError instanceof ApiError && fetchError.status === 401) {
        await signOut();
        return;
      }
      setError('Impossible de charger ton profil mobile.');
    } finally {
      setLoading(false);
    }
  }, [session, signOut]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadProfile();
    }, [loadProfile]),
  );

  const handlePlaybackStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      setIsSoundtrackPlaying(false);
      return;
    }

    setIsSoundtrackPlaying(status.isPlaying);
    if (status.didJustFinish) {
      setIsSoundtrackPlaying(false);
    }
  }, []);

  const openSoundtrack = async () => {
    const previewUrl = profile?.profile_soundtrack?.preview_url;
    if (!previewUrl) {
      setPlayerMessage('Aucun extrait audio disponible.');
      return;
    }

    try {
      if (soundRef.current && activeSoundtrackUrl === previewUrl) {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded && status.isPlaying) {
          await soundRef.current.pauseAsync();
          return;
        }
        await soundRef.current.playAsync();
        return;
      }

      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      const createdSound = new Audio.Sound();
      createdSound.setOnPlaybackStatusUpdate(handlePlaybackStatus);
      await createdSound.loadAsync(
        { uri: previewUrl },
        {
          shouldPlay: true,
          progressUpdateIntervalMillis: 250,
        },
      );

      soundRef.current = createdSound;
      setActiveSoundtrackUrl(previewUrl);
      setPlayerMessage('');
    } catch {
      setIsSoundtrackPlaying(false);
      setActiveSoundtrackUrl(null);
      setPlayerMessage("Impossible de lancer l'extrait.");
    }
  };

  const openShowcaseEditor = () => {
    if (!profile) {
      return;
    }

    setDraftGenresText(profile.profile_genres.join(', '));
    setDraftDescription(profile.profile_description ?? '');
    setDraftMovies(profile.profile_movies.slice(0, 6));
    setDraftPeople(profile.profile_people.slice(0, 6));
    setDraftSoundtrack(profile.profile_soundtrack);
    setMovieQuery('');
    setMovieResults([]);
    setPersonQuery('');
    setPersonResults([]);
    setSoundtrackQuery('');
    setSoundtrackResults([]);
    setIsEditingShowcase(true);
  };

  const runMovieSearch = async () => {
    if (!session || movieQuery.trim().length < 2) {
      setMovieResults([]);
      return;
    }

    try {
      const results = await searchMovies(session.token, movieQuery.trim());
      setMovieResults(results.slice(0, 6));
    } catch {
      setMovieResults([]);
    }
  };

  const runPersonSearch = async () => {
    if (!session || personQuery.trim().length < 2) {
      setPersonResults([]);
      return;
    }

    try {
      const results = await searchPeople(session.token, personQuery.trim());
      setPersonResults(results.slice(0, 6));
    } catch {
      setPersonResults([]);
    }
  };

  const runSoundtrackSearch = async () => {
    if (!session || soundtrackQuery.trim().length < 2) {
      setSoundtrackResults([]);
      return;
    }

    try {
      const results = await searchSoundtracks(session.token, soundtrackQuery.trim());
      setSoundtrackResults(results.slice(0, 6));
    } catch {
      setSoundtrackResults([]);
    }
  };

  const addDraftMovie = (movie: SearchMovie) => {
    setDraftMovies((current) => {
      if (current.some((entry) => entry.id === movie.id) || current.length >= 6) {
        return current;
      }
      return [
        ...current,
        {
          id: movie.id,
          title: movie.title,
          poster_url: movie.poster_url,
          rating: movie.rating,
        },
      ];
    });
  };

  const addDraftPerson = (person: ProfileShowcasePerson) => {
    setDraftPeople((current) => {
      if (current.some((entry) => (entry.id && entry.id === person.id) || entry.name === person.name) || current.length >= 6) {
        return current;
      }
      return [...current, person];
    });
  };

  const saveShowcase = async () => {
    if (!session) {
      return;
    }

    const profileGenres = draftGenresText
      .split(',')
      .map((genre) => genre.trim())
      .filter(Boolean)
      .slice(0, 5);

    setSavingShowcase(true);
    try {
      await saveProfilePreferences(session.token, {
        profile_description: draftDescription.trim(),
        profile_genres: profileGenres,
        profile_people: draftPeople.slice(0, 6),
        profile_movie_ids: draftMovies.slice(0, 6).map((movie) => movie.id),
        profile_soundtrack: draftSoundtrack,
      });
      setIsEditingShowcase(false);
      await loadProfile();
    } catch {
      setError("Impossible d'enregistrer la vitrine.");
    } finally {
      setSavingShowcase(false);
    }
  };

  const changeProfilePhoto = async () => {
    if (!session || savingAvatar) {
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Autorise l acces aux photos pour changer ta photo de profil.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.82,
    });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    const asset = result.assets[0];
    setSavingAvatar(true);
    try {
      await uploadProfilePhoto(session.token, {
        uri: asset.uri,
        name: asset.fileName ?? `profile-${Date.now()}.jpg`,
        type: guessImageType(asset.uri, asset.mimeType),
      });
      await loadProfile();
      setError('');
    } catch (uploadError) {
      if (uploadError instanceof ApiError && uploadError.status === 401) {
        await signOut();
        return;
      }
      setError('Impossible de changer la photo de profil.');
    } finally {
      setSavingAvatar(false);
    }
  };

  const handleCreatePlaylist = async () => {
    if (!session || !newPlaylistName.trim()) {
      return;
    }

    setSavingPlaylist(true);
    try {
      await createPlaylist(session.token, newPlaylistName.trim());
      setNewPlaylistName('');
      setIsCreatingPlaylist(false);
      await loadProfile();
      setError('');
    } catch (createError) {
      if (createError instanceof ApiError && createError.status === 401) {
        await signOut();
        return;
      }
      setError('Impossible de creer cette playlist.');
    } finally {
      setSavingPlaylist(false);
    }
  };

  const handleDeleteReview = (reviewId: number) => {
    if (!session) {
      return;
    }

    Alert.alert(
      'Supprimer cette critique ?',
      'Cette action retirera la critique de ton profil et du feed social.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deleteReview(session.token, reviewId);
                await loadProfile();
                setError('');
              } catch (deleteError) {
                if (deleteError instanceof ApiError && deleteError.status === 401) {
                  await signOut();
                  return;
                }
                setError('Impossible de supprimer cette critique.');
              }
            })();
          },
        },
      ],
    );
  };

  const profileAvatarUrl = resolveMediaUrl(profile?.avatar_url);
  const profileInitial = (profile?.username ?? session?.username ?? '?').trim().slice(0, 1).toUpperCase() || '?';
  const visiblePlaylists = showAllPlaylists ? playlists : playlists.slice(0, 2);
  const profileReviews = profile?.reviews ?? [];
  const visibleReviews = showAllReviews ? profileReviews : profileReviews.slice(0, 2);
  const profileDescription = profile?.profile_description?.trim() ?? '';

  return (
    <AppScreen>
      {error ? <InlineBanner message={error} tone="error" /> : null}
      {playerMessage ? <InlineBanner message={playerMessage} tone="error" /> : null}
      {loading ? <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>Chargement de ton profil...</Text> : null}

      {!loading && !profile ? <EmptyStateCard title="Profil indisponible" /> : null}

      {profile ? (
        <>
          <LinearGradient
            colors={theme.gradients.profileCover}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.profileCover, { borderColor: theme.colors.accentSoft }]}
          >
            <View style={[styles.profileGlowOne, { backgroundColor: theme.rgba.pinkGlow }]} />
            <View style={[styles.profileGlowTwo, { backgroundColor: theme.rgba.blueGlow }]} />

            <View style={styles.profileTopBar}>
              <View style={[styles.profileKicker, { borderColor: theme.colors.accentSoft, backgroundColor: theme.rgba.card }]}>
                <Ionicons name="sparkles" size={14} color={theme.colors.accent} />
                <Text style={[styles.profileKickerLabel, { color: theme.colors.text }]}>Profil Qulte</Text>
              </View>
              <View style={styles.profileTopActions}>
                <Pressable style={[styles.profileEditButton, { backgroundColor: theme.colors.accent }]} onPress={openShowcaseEditor} disabled={isEditingShowcase}>
                  <Ionicons name={isEditingShowcase ? 'checkmark' : 'create-outline'} size={18} color={theme.colors.accentText} />
                </Pressable>
                <Pressable style={[styles.settingsIconButton, { borderColor: theme.colors.accentSoft, backgroundColor: theme.colors.accentSoft }]} onPress={() => navigation.navigate('Settings')}>
                  <Ionicons name="settings-outline" size={18} color={theme.colors.accent} />
                </Pressable>
              </View>
            </View>

            <View style={styles.profileIdentityRow}>
              <Pressable
                style={styles.avatarShell}
                onPress={() => {
                  if (isEditingShowcase) {
                    void changeProfilePhoto();
                  }
                }}
                disabled={!isEditingShowcase || savingAvatar}
              >
                {profileAvatarUrl ? (
                  <Image source={{ uri: profileAvatarUrl }} style={styles.avatarImage} />
                ) : (
                  <View style={[styles.avatarFallback, { backgroundColor: theme.colors.accentSoft }]}>
                    <Text style={[styles.avatarInitial, { color: theme.colors.accent }]}>{profileInitial}</Text>
                  </View>
                )}
                {isEditingShowcase ? (
                  <View style={[styles.avatarCameraBadge, { backgroundColor: theme.colors.accent }]}>
                    <Ionicons name={savingAvatar ? 'hourglass-outline' : 'camera'} size={16} color={theme.colors.accentText} />
                  </View>
                ) : null}
              </Pressable>

              <View style={styles.profileHeroBody}>
                <Text style={[styles.profileHeroName, { color: theme.colors.text }]} numberOfLines={1}>@{profile.username}</Text>
                <Text
                  style={[
                    styles.profileHeroDescription,
                    { color: theme.colors.textSoft },
                    !profileDescription && [styles.profileHeroDescriptionEmpty, { color: theme.colors.accent }],
                  ]}
                  numberOfLines={4}
                >
                  {profileDescription || 'Ajoute une courte description pour raconter ton univers cine.'}
                </Text>
              </View>
            </View>

            {isEditingShowcase ? (
              <Pressable style={[styles.changePhotoButton, { borderColor: theme.colors.accentSoft, backgroundColor: theme.colors.accentSoft }]} onPress={() => void changeProfilePhoto()} disabled={savingAvatar}>
                <Ionicons name="image-outline" size={15} color={theme.colors.accent} />
                <Text style={[styles.changePhotoLabel, { color: theme.colors.accent }]}>{savingAvatar ? 'Envoi...' : 'Changer la photo'}</Text>
              </Pressable>
            ) : null}
          </LinearGradient>

          <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
            {isEditingShowcase ? (
              <View style={[styles.editorPanel, { borderColor: theme.colors.accentSoft, backgroundColor: theme.rgba.cardStrong }]}>
                <View style={styles.editorHeader}>
                  <Text style={[styles.editorTitle, { color: theme.colors.text }]}>Personnalisation</Text>
                  <Pressable onPress={() => setIsEditingShowcase(false)}>
                    <Ionicons name="close" size={20} color={theme.colors.text} />
                  </Pressable>
                </View>

                <View style={styles.editorBlock}>
                  <Text style={[styles.editorLabel, { color: theme.colors.textSoft }]}>Description</Text>
                  <TextInput
                    value={draftDescription}
                    onChangeText={(value) => setDraftDescription(value.slice(0, 180))}
                    placeholder="Ex: romance tragique, thrillers nerveux et BO qui restent en tete..."
                    placeholderTextColor={theme.colors.textMuted}
                    multiline
                    maxLength={180}
                    style={[
                      styles.editorInput,
                      styles.editorTextarea,
                      { borderColor: theme.rgba.border, backgroundColor: theme.rgba.cardStrong, color: theme.colors.text },
                    ]}
                  />
                  <Text style={[styles.editorCounter, { color: theme.colors.textMuted }]}>{draftDescription.trim().length}/180</Text>
                </View>

                <View style={styles.editorBlock}>
                  <Text style={[styles.editorLabel, { color: theme.colors.textSoft }]}>Genres</Text>
                  <TextInput
                    value={draftGenresText}
                    onChangeText={setDraftGenresText}
                    placeholder="Comedie, thriller, romance..."
                    placeholderTextColor={theme.colors.textMuted}
                    style={[styles.editorInput, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.cardStrong, color: theme.colors.text }]}
                  />
                </View>

                <View style={styles.editorBlock}>
                  <Text style={[styles.editorLabel, { color: theme.colors.textSoft }]}>Films totems</Text>
                  <View style={styles.selectedRow}>
                    {draftMovies.map((movie) => (
                      <Pressable
                        key={movie.id}
                        style={styles.selectedPoster}
                        onPress={() => setDraftMovies((current) => current.filter((entry) => entry.id !== movie.id))}
                      >
                        <Image source={{ uri: movie.poster_url || FALLBACK_POSTER }} style={styles.selectedPosterImage} />
                        <Ionicons name="close-circle" size={18} color="#ffffff" style={styles.removeIcon} />
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.searchRow}>
                    <TextInput
                      value={movieQuery}
                      onChangeText={setMovieQuery}
                      placeholder="Chercher un film"
                      placeholderTextColor={theme.colors.textMuted}
                      style={[styles.editorInput, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.cardStrong, color: theme.colors.text }]}
                    />
                    <Pressable style={[styles.searchButton, { backgroundColor: theme.colors.secondaryAccent }]} onPress={() => void runMovieSearch()}>
                      <Ionicons name="search" size={18} color={theme.colors.secondaryAccentText} />
                    </Pressable>
                  </View>
                  {movieResults.length > 0 ? (
                    <View style={styles.resultsGrid}>
                      {movieResults.map((movie) => (
                        <Pressable key={movie.id} style={styles.resultPoster} onPress={() => addDraftMovie(movie)}>
                          <Image source={{ uri: movie.poster_url || FALLBACK_POSTER }} style={styles.resultPosterImage} />
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>

                <View style={styles.editorBlock}>
                  <Text style={[styles.editorLabel, { color: theme.colors.textSoft }]}>Personnes clefs</Text>
                  <View style={styles.selectedPeopleRow}>
                    {draftPeople.map((person) => (
                      <Pressable
                        key={`${person.id ?? person.name}-${person.name}`}
                        style={[styles.selectedPersonChip, { backgroundColor: theme.colors.accentSoft }]}
                        onPress={() => setDraftPeople((current) => current.filter((entry) => entry.name !== person.name))}
                      >
                        <Text style={[styles.selectedPersonName, { color: theme.colors.text }]}>{person.name}</Text>
                        <Ionicons name="close" size={14} color={theme.colors.accent} />
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.searchRow}>
                    <TextInput
                      value={personQuery}
                      onChangeText={setPersonQuery}
                      placeholder="Chercher une personne"
                      placeholderTextColor={theme.colors.textMuted}
                      style={[styles.editorInput, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.cardStrong, color: theme.colors.text }]}
                    />
                    <Pressable style={[styles.searchButton, { backgroundColor: theme.colors.secondaryAccent }]} onPress={() => void runPersonSearch()}>
                      <Ionicons name="search" size={18} color={theme.colors.secondaryAccentText} />
                    </Pressable>
                  </View>
                  {personResults.length > 0 ? (
                    <View style={styles.personResults}>
                      {personResults.map((person) => (
                        <Pressable
                          key={`${person.id ?? person.name}-${person.name}`}
                          style={[styles.personResult, { backgroundColor: theme.rgba.cardStrong }]}
                          onPress={() => addDraftPerson(person)}
                        >
                          <Image source={{ uri: person.photo_url || FALLBACK_POSTER }} style={styles.personResultImage} />
                          <Text style={[styles.personResultName, { color: theme.colors.text }]} numberOfLines={1}>{person.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>

                <View style={styles.editorBlock}>
                  <Text style={[styles.editorLabel, { color: theme.colors.textSoft }]}>Musique favorite</Text>
                  {draftSoundtrack ? (
                    <Pressable style={[styles.selectedSoundtrack, { backgroundColor: theme.colors.accentSoft }]} onPress={() => setDraftSoundtrack(null)}>
                      <Image source={{ uri: draftSoundtrack.artwork_url || FALLBACK_POSTER }} style={styles.selectedSoundtrackArt} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.soundtrackTitle, { color: theme.colors.text }]} numberOfLines={1}>{draftSoundtrack.track_name}</Text>
                        <Text style={[styles.soundtrackArtist, { color: theme.colors.textMuted }]} numberOfLines={1}>{draftSoundtrack.artist_name}</Text>
                      </View>
                      <Ionicons name="close" size={18} color={theme.colors.accent} />
                    </Pressable>
                  ) : null}
                  <View style={styles.searchRow}>
                    <TextInput
                      value={soundtrackQuery}
                      onChangeText={setSoundtrackQuery}
                      placeholder="Chercher une musique"
                      placeholderTextColor={theme.colors.textMuted}
                      style={[styles.editorInput, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.cardStrong, color: theme.colors.text }]}
                    />
                    <Pressable style={[styles.searchButton, { backgroundColor: theme.colors.secondaryAccent }]} onPress={() => void runSoundtrackSearch()}>
                      <Ionicons name="search" size={18} color={theme.colors.secondaryAccentText} />
                    </Pressable>
                  </View>
                  {soundtrackResults.length > 0 ? (
                    <View style={styles.soundtrackResults}>
                      {soundtrackResults.map((track) => (
                        <Pressable
                          key={`${track.track_name}-${track.artist_name}`}
                          style={[styles.soundtrackResult, { backgroundColor: theme.rgba.cardStrong }]}
                          onPress={() => setDraftSoundtrack(track)}
                        >
                          <Image source={{ uri: track.artwork_url || FALLBACK_POSTER }} style={styles.selectedSoundtrackArt} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.soundtrackTitle, { color: theme.colors.text }]} numberOfLines={1}>{track.track_name}</Text>
                            <Text style={[styles.soundtrackArtist, { color: theme.colors.textMuted }]} numberOfLines={1}>{track.artist_name}</Text>
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>

                <Pressable style={[styles.saveButton, { backgroundColor: theme.colors.accent }]} onPress={() => void saveShowcase()} disabled={savingShowcase}>
                  <Text style={[styles.saveButtonLabel, { color: theme.colors.accentText }]}>{savingShowcase ? 'Enregistrement...' : 'Enregistrer'}</Text>
                </Pressable>
              </View>
            ) : null}

            {profile.profile_movies.length > 0 ? (
              <View style={styles.subsection}>
                <Text style={[styles.subsectionTitle, { color: theme.colors.textSoft }]}>Films totems</Text>
                <View style={styles.posterGrid}>
                  {profile.profile_movies.slice(0, 6).map((movie) => (
                    <View key={movie.id} style={styles.posterCell}>
                      <MoviePosterTile
                        movie={movie}
                        onPress={() => navigation.navigate('MovieDetails', { movieId: movie.id, title: movie.title })}
                      />
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {profile.profile_people.length > 0 ? (
              <View style={styles.subsection}>
                <Text style={[styles.subsectionTitle, { color: theme.colors.textSoft }]}>Personnes clefs</Text>
                <FlatList
                  data={profile.profile_people}
                  horizontal
                  keyExtractor={(item) => `${item.id ?? item.name}-${item.name}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 12 }}
                  renderItem={({ item }) => (
                      <View style={[styles.personCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
                      <Image source={{ uri: item.photo_url || FALLBACK_POSTER }} style={styles.personImage} />
                      <View style={styles.personOverlay}>
                        <Text style={styles.personName} numberOfLines={2}>{item.name}</Text>
                      </View>
                    </View>
                  )}
                />
              </View>
            ) : null}

            {profile.profile_soundtrack ? (
              <Pressable style={[styles.soundtrackCard, { backgroundColor: theme.rgba.cardStrong }]} onPress={() => void openSoundtrack()}>
                <Image
                  source={{ uri: profile.profile_soundtrack.artwork_url || FALLBACK_POSTER }}
                  style={styles.soundtrackArt}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.soundtrackLabel, { color: theme.colors.accent }]}>Musique favorite</Text>
                  <Text style={[styles.soundtrackTitle, { color: theme.colors.text }]} numberOfLines={2}>{profile.profile_soundtrack.track_name}</Text>
                  <Text style={[styles.soundtrackArtist, { color: theme.colors.textMuted }]} numberOfLines={1}>{profile.profile_soundtrack.artist_name}</Text>
                </View>
                <Ionicons
                  name={isSoundtrackPlaying && activeSoundtrackUrl === profile.profile_soundtrack.preview_url ? 'pause-circle' : 'play-circle'}
                  size={30}
                  color={theme.colors.accent}
                />
              </Pressable>
            ) : null}
          </View>

          <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
            <View style={styles.playlistsHeader}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Playlists</Text>
              <Pressable
                style={[styles.addPlaylistButton, { backgroundColor: theme.colors.secondaryAccent }]}
                onPress={() => {
                  setIsCreatingPlaylist((current) => !current);
                  setNewPlaylistName('');
                }}
              >
                <Ionicons name={isCreatingPlaylist ? 'close' : 'add'} size={18} color={theme.colors.secondaryAccentText} />
              </Pressable>
            </View>

            {isCreatingPlaylist ? (
              <View style={styles.createPlaylistPanel}>
                <TextInput
                  value={newPlaylistName}
                  onChangeText={setNewPlaylistName}
                  placeholder="Nom de la playlist"
                  placeholderTextColor={theme.colors.textMuted}
                  style={[styles.editorInput, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.cardStrong, color: theme.colors.text }]}
                />
                <Pressable
                  style={[
                    styles.createPlaylistButton,
                    { backgroundColor: theme.colors.accent },
                    (!newPlaylistName.trim() || savingPlaylist) && styles.createPlaylistButtonDisabled,
                  ]}
                  onPress={() => void handleCreatePlaylist()}
                  disabled={!newPlaylistName.trim() || savingPlaylist}
                >
                  <Text style={[styles.createPlaylistButtonLabel, { color: theme.colors.accentText }]}>{savingPlaylist ? '...' : 'Creer'}</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.playlistList}>
              {visiblePlaylists.map((playlist) => (
                <Pressable
                  key={playlist.id}
                  style={[styles.playlistCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.cardStrong }]}
                  onPress={() => navigation.navigate('PlaylistDetails', { playlistId: playlist.id, name: playlist.name })}
                >
                  <View style={styles.playlistHeader}>
                    <View>
                      <Text style={[styles.playlistName, { color: theme.colors.text }]}>{playlist.name}</Text>
                      <Text style={[styles.playlistMeta, { color: theme.colors.textMuted }]}>{playlist.count} film(s)</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                  </View>
                  {playlist.preview_movies.length > 0 ? (
                    <View style={styles.previewRow}>
                      {playlist.preview_movies.map((movie) => (
                        <Image key={movie.id} source={{ uri: movie.poster_url || FALLBACK_POSTER }} style={styles.previewPoster} />
                      ))}
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </View>
            {playlists.length > 2 ? (
              <Pressable
                style={[styles.showMoreButton, { borderColor: theme.colors.secondaryAccent, backgroundColor: theme.rgba.cardStrong }]}
                onPress={() => setShowAllPlaylists((current) => !current)}
              >
                <Text style={[styles.showMoreButtonLabel, { color: theme.colors.secondaryAccent }]}>
                  {showAllPlaylists ? 'Afficher moins' : `Afficher toutes les playlists (${playlists.length})`}
                </Text>
                <Ionicons name={showAllPlaylists ? 'chevron-up' : 'chevron-down'} size={16} color={theme.colors.secondaryAccent} />
              </Pressable>
            ) : null}
          </View>

          <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
            <View style={styles.playlistsHeader}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Critiques</Text>
              <Pressable
                style={[styles.addPlaylistButton, { backgroundColor: theme.colors.secondaryAccent }]}
                onPress={() => navigation.navigate('CreateReview')}
              >
                <Ionicons name="create-outline" size={18} color={theme.colors.secondaryAccentText} />
              </Pressable>
            </View>

            {visibleReviews.length > 0 ? (
              <View style={styles.profileReviewsList}>
                {visibleReviews.map((review) => (
                  <Pressable
                    key={review.id}
                    style={[styles.profileReviewCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.cardStrong }]}
                    onPress={() => setExpandedProfileReviewId((current) => (current === review.id ? null : review.id))}
                  >
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        navigation.navigate('MovieDetails', { movieId: review.movie_id, title: review.title });
                      }}
                    >
                      <Image source={{ uri: review.poster_url || FALLBACK_POSTER }} style={styles.reviewPoster} />
                    </Pressable>
                    <View style={styles.reviewBody}>
                      <View style={styles.reviewHeaderRow}>
                        <Text style={[styles.reviewTitle, { color: theme.colors.text }]} numberOfLines={1}>{review.title}</Text>
                        <View style={styles.reviewActions}>
                          <Pressable
                            style={[styles.reviewActionButton, { backgroundColor: theme.rgba.card }]}
                            onPress={(event) => {
                              event.stopPropagation();
                              navigation.navigate('CreateReview', {
                                reviewId: review.id,
                                movieId: review.movie_id,
                                title: review.title,
                                posterUrl: review.poster_url,
                                reviewRating: review.rating,
                                content: review.content,
                              });
                            }}
                          >
                            <Ionicons name="create-outline" size={14} color={theme.colors.secondaryAccent} />
                          </Pressable>
                          <Pressable
                            style={[styles.reviewActionButton, { backgroundColor: theme.rgba.card }]}
                            onPress={(event) => {
                              event.stopPropagation();
                              handleDeleteReview(review.id);
                            }}
                          >
                            <Ionicons name="trash-outline" size={14} color="#fca5a5" />
                          </Pressable>
                        </View>
                      </View>
                      <View style={styles.reviewMetaRow}>
                        <View style={[styles.reviewRatingPill, { backgroundColor: theme.colors.ratingBackground }]}>
                          <Text style={[styles.reviewRatingLabel, { color: theme.colors.ratingText }]}>{review.rating.toFixed(1)} / 5</Text>
                        </View>
                        <Text style={[styles.reviewDate, { color: theme.colors.textMuted }]}>{formatDate(review.created_at)}</Text>
                      </View>
                      <Text
                        style={[styles.reviewContent, { color: theme.colors.textSoft }]}
                        numberOfLines={expandedProfileReviewId === review.id ? undefined : 3}
                      >
                        {review.content}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : (
              <EmptyStateCard title="Aucune critique" />
            )}

            {profileReviews.length > 2 ? (
              <Pressable
                style={[styles.showMoreButton, { borderColor: theme.colors.secondaryAccent, backgroundColor: theme.rgba.cardStrong }]}
                onPress={() => setShowAllReviews((current) => !current)}
              >
                <Text style={[styles.showMoreButtonLabel, { color: theme.colors.secondaryAccent }]}>
                  {showAllReviews ? 'Afficher moins' : `Afficher toutes les critiques (${profileReviews.length})`}
                </Text>
                <Ionicons name={showAllReviews ? 'chevron-up' : 'chevron-down'} size={16} color={theme.colors.secondaryAccent} />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.statsGrid}>
            {[
              ['Critiques', profile.reviews_count],
              ['Favoris', profile.favorites_count],
              ['Abonnes', profile.followers_count],
              ['Abonnements', profile.following_count],
            ].map(([label, value]) => (
              <View key={label} style={[styles.statCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
                <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>{label}</Text>
                <Text style={[styles.statValue, { color: theme.colors.text }]}>{value}</Text>
              </View>
            ))}
          </View>

          <Pressable style={styles.logoutButton} onPress={() => void signOut()}>
            <Ionicons name="log-out-outline" size={18} color="#fecaca" />
            <Text style={styles.logoutButtonLabel}>Se deconnecter</Text>
          </Pressable>
        </>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  profileCover: {
    position: 'relative',
    overflow: 'hidden',
    gap: 18,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(249,168,212,0.22)',
    padding: 16,
  },
  profileGlowOne: {
    position: 'absolute',
    top: -70,
    right: -56,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(249,168,212,0.18)',
  },
  profileGlowTwo: {
    position: 'absolute',
    left: -44,
    bottom: -70,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(125,211,252,0.10)',
  },
  profileTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  profileKicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(249,168,212,0.24)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  profileKickerLabel: {
    color: '#fce7f3',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  profileTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingsIconButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(249,168,212,0.22)',
    backgroundColor: 'rgba(249,168,212,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileEditButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: '#f9a8d4',
  },
  profileIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarShell: {
    width: 104,
    height: 104,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(249,168,212,0.18)',
  },
  avatarInitial: {
    color: '#ffffff',
    fontSize: 40,
    fontWeight: '900',
  },
  avatarCameraBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 30,
    height: 30,
    borderRadius: 12,
    backgroundColor: '#f9a8d4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHeroBody: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  profileHeroName: {
    color: '#ffffff',
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  profileHeroDescription: {
    color: '#fce7f3',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  profileHeroDescriptionEmpty: {
    color: '#f9a8d4',
    opacity: 0.78,
  },
  changePhotoButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(249,168,212,0.22)',
    backgroundColor: 'rgba(249,168,212,0.10)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  changePhotoLabel: {
    color: '#f9a8d4',
    fontSize: 12,
    fontWeight: '900',
  },
  helperText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  sectionCard: {
    gap: 16,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 18,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  editorPanel: {
    gap: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(249,168,212,0.18)',
    backgroundColor: 'rgba(15,23,42,0.66)',
    padding: 14,
  },
  editorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  editorTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  editorBlock: {
    gap: 10,
  },
  editorLabel: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  editorInput: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: '#ffffff',
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14,
  },
  editorTextarea: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  editorCounter: {
    alignSelf: 'flex-end',
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '800',
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#7dd3fc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectedPoster: {
    width: 52,
    aspectRatio: 2 / 3,
    borderRadius: 12,
    overflow: 'hidden',
  },
  selectedPosterImage: {
    width: '100%',
    height: '100%',
  },
  removeIcon: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  resultsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  resultPoster: {
    width: 54,
    aspectRatio: 2 / 3,
    borderRadius: 12,
    overflow: 'hidden',
  },
  resultPosterImage: {
    width: '100%',
    height: '100%',
  },
  selectedPeopleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectedPersonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(249,168,212,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  selectedPersonName: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  personResults: {
    gap: 8,
  },
  personResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 8,
  },
  personResultImage: {
    width: 34,
    height: 46,
    borderRadius: 10,
  },
  personResultName: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  selectedSoundtrack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(249,168,212,0.10)',
    padding: 10,
  },
  selectedSoundtrackArt: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },
  soundtrackResults: {
    gap: 8,
  },
  soundtrackResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 8,
  },
  saveButton: {
    borderRadius: 18,
    backgroundColor: '#f9a8d4',
    paddingVertical: 13,
    alignItems: 'center',
  },
  saveButtonLabel: {
    color: '#190713',
    fontSize: 14,
    fontWeight: '900',
  },
  subsection: {
    gap: 12,
  },
  subsectionTitle: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  posterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  posterCell: {
    width: '31.2%',
  },
  personCard: {
    width: 92,
    aspectRatio: 2 / 3,
    overflow: 'hidden',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  personImage: {
    width: '100%',
    height: '100%',
  },
  personOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.74)',
    padding: 8,
  },
  personName: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 15,
  },
  soundtrackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 12,
  },
  soundtrackArt: {
    width: 64,
    height: 64,
    borderRadius: 16,
  },
  soundtrackLabel: {
    color: '#f9a8d4',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  soundtrackTitle: {
    marginTop: 4,
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  soundtrackArtist: {
    marginTop: 4,
    color: '#94a3b8',
    fontSize: 12,
  },
  playlistList: {
    gap: 12,
  },
  playlistsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  addPlaylistButton: {
    width: 40,
    height: 40,
    borderRadius: 15,
    backgroundColor: '#7dd3fc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createPlaylistPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  createPlaylistButton: {
    borderRadius: 16,
    backgroundColor: '#f9a8d4',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  createPlaylistButtonDisabled: {
    opacity: 0.45,
  },
  createPlaylistButtonLabel: {
    color: '#190713',
    fontSize: 13,
    fontWeight: '900',
  },
  playlistCard: {
    gap: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 14,
  },
  playlistHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  playlistName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  playlistMeta: {
    marginTop: 4,
    color: '#9ca3af',
    fontSize: 12,
  },
  previewRow: {
    flexDirection: 'row',
    gap: 8,
  },
  previewPoster: {
    width: 48,
    height: 72,
    borderRadius: 14,
  },
  showMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.22)',
    backgroundColor: 'rgba(14,165,233,0.10)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  showMoreButtonLabel: {
    color: '#7dd3fc',
    fontSize: 13,
    fontWeight: '900',
  },
  profileReviewsList: {
    gap: 12,
  },
  profileReviewCard: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 12,
  },
  reviewPoster: {
    width: 54,
    height: 78,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  reviewBody: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  reviewTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
    flex: 1,
  },
  reviewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reviewActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reviewActionButton: {
    width: 30,
    height: 30,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  reviewMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  reviewRatingPill: {
    borderRadius: 999,
    backgroundColor: 'rgba(251,191,36,0.14)',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  reviewRatingLabel: {
    color: '#fde68a',
    fontSize: 11,
    fontWeight: '800',
  },
  reviewDate: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
  },
  reviewContent: {
    color: '#e5e7eb',
    fontSize: 13,
    lineHeight: 19,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    width: '47%',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 16,
  },
  statLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  statValue: {
    marginTop: 8,
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '900',
  },
  logoutButton: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(252,165,165,0.20)',
    backgroundColor: 'rgba(127,29,29,0.16)',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  logoutButtonLabel: {
    color: '#fecaca',
    fontSize: 12,
    fontWeight: '800',
  },
});

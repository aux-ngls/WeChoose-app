import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { addMovieToPlaylist, ApiError, fetchPlaylists } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import type { PlaylistSummary } from '../types';

export interface QuickAddMovieTarget {
  id: number;
  title: string;
  anchorX?: number;
  anchorY?: number;
}

interface MovieQuickAddModalProps {
  movie: QuickAddMovieTarget | null;
  onClose: () => void;
  onAdded?: (playlistName: string) => void;
}

function sortPlaylists(playlists: PlaylistSummary[]) {
  return [...playlists].sort((left, right) => {
    if (left.system_key === 'watch-later') {
      return -1;
    }
    if (right.system_key === 'watch-later') {
      return 1;
    }
    return left.name.localeCompare(right.name, 'fr', { sensitivity: 'base' });
  });
}

export default function MovieQuickAddModal({ movie, onClose, onAdded }: MovieQuickAddModalProps) {
  const { session, signOut } = useAuth();
  const { theme } = useTheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [activePlaylistId, setActivePlaylistId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const panelWidth = Math.min(286, screenWidth - 24);
  const estimatedPanelHeight = Math.min(screenHeight * 0.58, 340);
  const horizontalPadding = 12;
  const verticalPadding = 10;
  const left = movie?.anchorX == null
    ? (screenWidth - panelWidth) / 2
    : Math.min(
        Math.max(horizontalPadding, movie.anchorX + 12),
        screenWidth - panelWidth - horizontalPadding,
      );
  const top = movie?.anchorY == null
    ? (screenHeight - estimatedPanelHeight) / 2
    : Math.min(
        Math.max(verticalPadding + 40, movie.anchorY < screenHeight * 0.52 ? movie.anchorY + 10 : movie.anchorY - estimatedPanelHeight + 18),
        screenHeight - estimatedPanelHeight - verticalPadding,
      );

  useEffect(() => {
    if (!movie || !session) {
      setPlaylists([]);
      setLoading(false);
      setActivePlaylistId(null);
      setError('');
      return;
    }

    let active = true;
    setLoading(true);
    setActivePlaylistId(null);
    setError('');

    void (async () => {
      try {
        const payload = await fetchPlaylists(session.token);
        if (!active) {
          return;
        }
        setPlaylists(sortPlaylists(payload.filter((playlist) => !playlist.readonly)));
      } catch (fetchError) {
        if (fetchError instanceof ApiError && fetchError.status === 401) {
          await signOut();
          return;
        }
        if (active) {
          setError('Impossible de charger les playlists.');
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
  }, [movie, session, signOut]);

  const handleAdd = async (playlist: PlaylistSummary) => {
    if (!movie || !session || activePlaylistId) {
      return;
    }

    setActivePlaylistId(playlist.id);
    setError('');
    try {
      await addMovieToPlaylist(session.token, playlist.id, movie.id);
      onAdded?.(playlist.name);
      onClose();
    } catch (addError) {
      if (addError instanceof ApiError && addError.status === 401) {
        await signOut();
        return;
      }
      setError("Impossible d'ajouter ce film à cette playlist.");
    } finally {
      setActivePlaylistId(null);
    }
  };

  return (
    <Modal visible={Boolean(movie)} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              left,
              top,
              width: panelWidth,
              maxHeight: estimatedPanelHeight,
              borderColor: theme.rgba.border,
              backgroundColor: theme.colors.surface,
              shadowColor: '#000000',
            },
          ]}
        >
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text style={[styles.kicker, { color: theme.colors.secondaryAccent }]}>Ajouter à une playlist</Text>
              <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={2}>
                {movie?.title ?? 'Choisir une playlist'}
              </Text>
            </View>
          </View>

          {error ? <Text style={[styles.errorText, { color: '#fca5a5' }]}>{error}</Text> : null}
          {loading ? (
            <View style={styles.stateWrap}>
              <ActivityIndicator color={theme.colors.text} />
              <Text style={[styles.stateText, { color: theme.colors.textMuted }]}>Chargement des playlists...</Text>
            </View>
          ) : (
            <FlatList
              data={playlists}
              keyExtractor={(item) => String(item.id)}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const isActive = activePlaylistId === item.id;
                return (
                  <Pressable
                    style={[styles.row, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
                    onPress={() => void handleAdd(item)}
                    disabled={Boolean(activePlaylistId)}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: theme.rgba.cardStrong }]}>
                      <Ionicons
                        name={item.system_key === 'watch-later' ? 'time-outline' : 'albums-outline'}
                        size={18}
                        color={theme.colors.secondaryAccent}
                      />
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={[styles.rowTitle, { color: theme.colors.text }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={[styles.rowMeta, { color: theme.colors.textMuted }]} numberOfLines={1}>
                        {item.type === 'custom' ? 'Playlist perso' : 'Liste système'}
                      </Text>
                    </View>
                    {isActive ? (
                      <ActivityIndicator size="small" color={theme.colors.secondaryAccent} />
                    ) : (
                      <Ionicons name="add-circle" size={20} color={theme.colors.secondaryAccent} />
                    )}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <View style={[styles.emptyState, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
                  <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>Aucune playlist disponible</Text>
                  <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                    Crée d’abord une playlist depuis ton profil.
                  </Text>
                </View>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  sheet: {
    position: 'absolute',
    borderRadius: 24,
    borderWidth: 1,
    padding: 14,
    gap: 12,
    shadowOffset: {
      width: 0,
      height: 14,
    },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
  },
  title: {
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 19,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '700',
  },
  stateWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 26,
  },
  stateText: {
    fontSize: 12,
    textAlign: 'center',
  },
  listContent: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  rowMeta: {
    fontSize: 11,
    fontWeight: '600',
  },
  emptyState: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
});

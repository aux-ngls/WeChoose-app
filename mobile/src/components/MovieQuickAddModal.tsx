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
  const panelWidth = Math.min(252, screenWidth - 20);
  const estimatedPanelHeight = Math.min(screenHeight * 0.5, 280);
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
          {error ? <Text style={[styles.errorText, { color: '#fca5a5' }]}>{error}</Text> : null}
          {loading ? (
            <View style={styles.stateWrap}>
              <ActivityIndicator color={theme.colors.text} />
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
                    <View style={styles.rowBody}>
                      <Text style={[styles.rowTitle, { color: theme.colors.text }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                    </View>
                    <View style={[styles.rowDot, { backgroundColor: item.system_key === 'watch-later' ? theme.colors.secondaryAccent : theme.rgba.cardStrong }]}>
                      {isActive ? <ActivityIndicator size="small" color={theme.colors.secondaryAccentText} /> : null}
                    </View>
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
    borderRadius: 18,
    borderWidth: 1,
    padding: 10,
    gap: 8,
    shadowOffset: {
      width: 0,
      height: 14,
    },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 16,
  },
  errorText: {
    fontSize: 11,
    fontWeight: '700',
  },
  stateWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
  },
  listContent: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: '900',
  },
  rowDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 5,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
});

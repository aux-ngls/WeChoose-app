import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AppScreen from '../components/AppScreen';
import EmptyState from '../components/EmptyState';
import ScreenHeader from '../components/ScreenHeader';
import { useLibrary } from '../state/LibraryContext';
import { theme } from '../theme';

export default function ProfileScreen() {
  const { books, catalog, library, genres, profile, selectedGenres, toggleGenre, clearGenreFilters } = useLibrary();

  const stats = useMemo(() => {
    const visibleEntries = Object.entries(library)
      .map(([bookId, entry]) => {
        const book = catalog[bookId];
        return book ? { book, entry } : null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const finished = visibleEntries.filter(({ entry }) => entry.shelf === 'finished' || entry.shelf === 'favorite');
    const rated = finished.filter(({ entry }) => typeof entry.rating === 'number');
    const average = rated.length > 0 ? rated.reduce((total, { entry }) => total + (entry.rating ?? 0), 0) / rated.length : 0;
    const genreCounts = finished.reduce<Record<string, number>>((counts, { book }) => {
      counts[book.genre] = (counts[book.genre] ?? 0) + 1;
      return counts;
    }, {});
    const topGenres = Object.entries(genreCounts).sort((first, second) => second[1] - first[1]).slice(0, 5);

    return {
      toRead: visibleEntries.filter(({ entry }) => entry.shelf === 'toRead').length,
      reading: visibleEntries.filter(({ entry }) => entry.shelf === 'reading').length,
      finished: finished.length,
      favorite: visibleEntries.filter(({ entry }) => entry.shelf === 'favorite').length,
      average,
      topGenres,
    };
  }, [catalog, library]);

  const maxGenre = Math.max(1, ...stats.topGenres.map(([, count]) => count));

  return (
    <AppScreen>
      <ScreenHeader
        icon="person-circle-outline"
        eyebrow="Profil local"
        title={profile.name}
        subtitle={`${books.length} livres dans le catalogue Reliure`}
        trailing={
          <Pressable style={styles.resetButton} onPress={clearGenreFilters}>
            <Ionicons name="options-outline" size={18} color={theme.colors.textSoft} />
          </Pressable>
        }
      />

      <View style={styles.statsGrid}>
        <StatCard icon="bookmark-outline" label="A lire" value={stats.toRead.toString()} />
        <StatCard icon="book-outline" label="En cours" value={stats.reading.toString()} />
        <StatCard icon="checkmark" label="Lus" value={stats.finished.toString()} />
        <StatCard icon="star-outline" label="Moyenne" value={stats.average ? stats.average.toFixed(1) : '-'} />
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Affinites de recommandation</Text>
        <View style={styles.genreWrap}>
          {genres.map((genre) => {
            const active = selectedGenres.includes(genre);
            return (
              <Pressable key={genre} style={[styles.genrePill, active && styles.genrePillActive]} onPress={() => toggleGenre(genre)}>
                <Text style={[styles.genreText, active && styles.genreTextActive]}>{genre}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Genres dominants</Text>
        {stats.topGenres.length > 0 ? (
          <View style={styles.barList}>
            {stats.topGenres.map(([genre, count]) => (
              <View key={genre} style={styles.barItem}>
                <View style={styles.barHeader}>
                  <Text style={styles.barLabel}>{genre}</Text>
                  <Text style={styles.barCount}>{count}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${(count / maxGenre) * 100}%` }]} />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <EmptyState icon="analytics-outline" title="Profil en construction" body="Note quelques livres pour faire apparaitre tes tendances." />
        )}
      </View>
    </AppScreen>
  );
}

function StatCard({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={20} color={theme.colors.accent} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  resetButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.065)',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    flexGrow: 1,
    flexBasis: '46%',
    gap: 8,
    padding: 14,
    borderRadius: theme.radii.panel,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.055)',
  },
  statLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  statValue: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '900',
  },
  panel: {
    gap: 13,
    padding: 14,
    borderRadius: theme.radii.panel,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  panelTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  genreWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  genrePill: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  genrePillActive: {
    borderColor: 'rgba(69,208,139,0.48)',
    backgroundColor: 'rgba(69,208,139,0.14)',
  },
  genreText: {
    color: theme.colors.textMuted,
    fontWeight: '800',
  },
  genreTextActive: {
    color: theme.colors.text,
  },
  barList: {
    gap: 12,
  },
  barItem: {
    gap: 7,
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  barLabel: {
    color: theme.colors.textSoft,
    fontWeight: '900',
  },
  barCount: {
    color: theme.colors.textMuted,
    fontWeight: '900',
  },
  barTrack: {
    height: 9,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: theme.colors.accent,
  },
});

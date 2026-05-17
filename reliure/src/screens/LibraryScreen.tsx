import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AppScreen from '../components/AppScreen';
import BookCover from '../components/BookCover';
import EmptyState from '../components/EmptyState';
import ScreenHeader from '../components/ScreenHeader';
import { useLibrary } from '../state/LibraryContext';
import { theme } from '../theme';
import type { Book, LibraryEntry, RootStackParamList, Shelf } from '../types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

const shelfLabels: Record<Shelf, string> = {
  toRead: 'A lire',
  reading: 'En cours',
  finished: 'Lus',
  favorite: 'Favoris',
  ignored: 'Passes',
};

const visibleShelves: Shelf[] = ['toRead', 'reading', 'finished', 'favorite'];

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Recemment';
  }
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

export default function LibraryScreen() {
  const navigation = useNavigation<Navigation>();
  const { catalog, library, saveToShelf, removeBook } = useLibrary();

  const items = useMemo(() => {
    return Object.entries(library)
      .map(([bookId, entry]) => {
        const book = catalog[bookId];
        return book ? { book, entry } : null;
      })
      .filter((item): item is { book: Book; entry: LibraryEntry } => item !== null)
      .sort((first, second) => new Date(second.entry.addedAt).getTime() - new Date(first.entry.addedAt).getTime());
  }, [catalog, library]);

  const visibleItems = items.filter(({ entry }) => entry.shelf !== 'ignored');

  return (
    <AppScreen>
      <ScreenHeader
        icon="library-outline"
        eyebrow="Etageres"
        title="Bibliotheque"
        subtitle={`${visibleItems.length} livre${visibleItems.length > 1 ? 's' : ''} garde${visibleItems.length > 1 ? 's' : ''}`}
      />

      {visibleItems.length === 0 ? (
        <EmptyState icon="bookmark-outline" title="Aucune lecture encore" body="Sauvegarde des livres depuis Decouvrir ou Recherche pour remplir tes etageres." />
      ) : null}

      {visibleShelves.map((shelf) => {
        const shelfItems = items.filter(({ entry }) => entry.shelf === shelf);
        return (
          <View key={shelf} style={styles.shelf}>
            <View style={styles.shelfHeader}>
              <Text style={styles.shelfTitle}>{shelfLabels[shelf]}</Text>
              <Text style={styles.shelfCount}>{shelfItems.length}</Text>
            </View>

            {shelfItems.length > 0 ? (
              shelfItems.map(({ book, entry }) => (
                <Pressable key={`${shelf}-${book.id}`} style={styles.bookRow} onPress={() => navigation.navigate('BookDetails', { bookId: book.id })}>
                  <BookCover book={book} size="small" />
                  <View style={styles.bookCopy}>
                    <Text style={styles.bookTitle} numberOfLines={2}>{book.title}</Text>
                    <Text style={styles.bookAuthor} numberOfLines={1}>{book.author}</Text>
                    <View style={styles.metaRow}>
                      <Text style={styles.metaText}>{formatDate(entry.addedAt)}</Text>
                      {typeof entry.rating === 'number' ? (
                        <Text style={styles.ratingText}>★ {entry.rating.toFixed(1)}</Text>
                      ) : null}
                    </View>
                    <View style={styles.actionRow}>
                      <IconAction icon="book-outline" label="En cours" onPress={() => saveToShelf(book, 'reading')} />
                      <IconAction icon="checkmark" label="Lu" onPress={() => saveToShelf(book, 'finished', entry.rating ?? 4)} />
                      <IconAction icon="heart-outline" label="Favori" onPress={() => saveToShelf(book, 'favorite', 5)} />
                      <IconAction icon="trash-outline" label="Retirer" onPress={() => removeBook(book.id)} danger />
                    </View>
                  </View>
                </Pressable>
              ))
            ) : (
              <Text style={styles.emptyShelf}>Vide</Text>
            )}
          </View>
        );
      })}
    </AppScreen>
  );
}

function IconAction({
  icon,
  label,
  onPress,
  danger = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      hitSlop={8}
      style={styles.iconAction}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
    >
      <Ionicons name={icon} size={15} color={danger ? theme.colors.danger : theme.colors.textSoft} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shelf: {
    gap: 10,
    padding: 13,
    borderRadius: theme.radii.panel,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  shelfHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shelfTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  shelfCount: {
    minWidth: 28,
    overflow: 'hidden',
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: theme.colors.textSoft,
    paddingHorizontal: 8,
    paddingVertical: 5,
    textAlign: 'center',
    fontWeight: '900',
  },
  bookRow: {
    flexDirection: 'row',
    gap: 12,
    padding: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.055)',
  },
  bookCopy: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  bookTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 21,
  },
  bookAuthor: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metaText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  ratingText: {
    color: theme.colors.amber,
    fontSize: 12,
    fontWeight: '900',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  iconAction: {
    width: 31,
    height: 31,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.065)',
  },
  emptyShelf: {
    color: theme.colors.textMuted,
    fontWeight: '800',
  },
});

import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import AppScreen from '../components/AppScreen';
import BookCover from '../components/BookCover';
import EmptyState from '../components/EmptyState';
import RatingStars from '../components/RatingStars';
import { useLibrary } from '../state/LibraryContext';
import { theme } from '../theme';
import type { RootStackParamList, Shelf } from '../types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;
type Route = NativeStackScreenProps<RootStackParamList, 'BookDetails'>['route'];

const shelfLabels: Record<Shelf, string> = {
  toRead: 'A lire',
  reading: 'En cours',
  finished: 'Lu',
  favorite: 'Favori',
  ignored: 'Passe',
};

export default function BookDetailsScreen() {
  const navigation = useNavigation<Navigation>();
  const route = useRoute<Route>();
  const { catalog, library, saveToShelf, removeBook } = useLibrary();
  const book = catalog[route.params.bookId];
  const entry = library[route.params.bookId];

  if (!book) {
    return (
      <AppScreen>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </Pressable>
        <EmptyState icon="alert-circle-outline" title="Livre introuvable" body="Ce livre n existe plus dans le catalogue local." />
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <View style={styles.topRow}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </Pressable>
        {entry ? (
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>{shelfLabels[entry.shelf]}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.hero}>
        <View style={styles.coverWrap}>
          <BookCover book={book} size="large" />
        </View>
        <View style={styles.heroCopy}>
          <View style={styles.metaRow}>
            <Text style={styles.metaPill}>{book.genre}</Text>
            {book.year ? <Text style={styles.metaPill}>{book.year}</Text> : null}
            {book.pages ? <Text style={styles.metaPill}>{book.pages} pages</Text> : null}
          </View>
          <Text style={styles.title}>{book.title}</Text>
          <Text style={styles.author}>{book.author}</Text>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={17} color={theme.colors.amber} />
            <Text style={styles.ratingText}>{book.rating.toFixed(1)} recommandation</Text>
          </View>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Pourquoi ce livre</Text>
        <Text style={styles.bodyText}>{book.reason}</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Synopsis</Text>
        <Text style={styles.bodyText}>{book.synopsis}</Text>
      </View>

      <View style={styles.tagWrap}>
        {book.themes.map((themeName) => (
          <Text key={themeName} style={styles.tag}>{themeName}</Text>
        ))}
        <Text style={styles.tag}>{book.mood}</Text>
        <Text style={styles.tag}>{book.pace}</Text>
      </View>

      <View style={styles.actionPanel}>
        <View style={styles.actionRow}>
          <ActionButton icon="bookmark-outline" label="A lire" onPress={() => saveToShelf(book, 'toRead')} />
          <ActionButton icon="book-outline" label="En cours" onPress={() => saveToShelf(book, 'reading')} />
          <ActionButton icon="heart-outline" label="Favori" onPress={() => saveToShelf(book, 'favorite', 5)} />
        </View>
        <View style={styles.ratingBlock}>
          <Text style={styles.panelTitle}>Ta note</Text>
          <RatingStars value={entry?.rating ?? 0} onChange={(rating) => saveToShelf(book, rating >= 5 ? 'favorite' : 'finished', rating)} size={28} />
        </View>
      </View>

      <View style={styles.footerActions}>
        {book.sourceUrl ? (
          <Pressable style={styles.secondaryButton} onPress={() => void Linking.openURL(book.sourceUrl!)}>
            <Ionicons name="open-outline" size={17} color={theme.colors.textSoft} />
            <Text style={styles.secondaryButtonText}>Open Library</Text>
          </Pressable>
        ) : null}
        {entry ? (
          <Pressable style={styles.removeButton} onPress={() => removeBook(book.id)}>
            <Ionicons name="trash-outline" size={17} color={theme.colors.danger} />
            <Text style={styles.removeButtonText}>Retirer</Text>
          </Pressable>
        ) : null}
      </View>
    </AppScreen>
  );
}

function ActionButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.actionButton} onPress={onPress}>
      <Ionicons name={icon} size={20} color={theme.colors.accentText} />
      <Text style={styles.actionButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 43,
    height: 43,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.065)',
  },
  statusPill: {
    borderRadius: 999,
    backgroundColor: 'rgba(69,208,139,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(69,208,139,0.32)',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  statusText: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 12,
  },
  hero: {
    gap: 16,
  },
  coverWrap: {
    overflow: 'hidden',
    borderRadius: theme.radii.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  heroCopy: {
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  metaPill: {
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.07)',
    color: theme.colors.textMuted,
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: '800',
  },
  title: {
    color: theme.colors.text,
    fontSize: 34,
    lineHeight: 36,
    fontWeight: '900',
    letterSpacing: -1,
  },
  author: {
    color: theme.colors.textSoft,
    fontSize: 17,
    fontWeight: '900',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ratingText: {
    color: theme.colors.amber,
    fontWeight: '900',
  },
  panel: {
    gap: 8,
    padding: 14,
    borderRadius: theme.radii.panel,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  panelTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  bodyText: {
    color: theme.colors.textSoft,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '700',
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.055)',
    color: theme.colors.textSoft,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontWeight: '800',
  },
  actionPanel: {
    gap: 15,
    padding: 14,
    borderRadius: theme.radii.panel,
    backgroundColor: 'rgba(255,255,255,0.055)',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 9,
  },
  actionButton: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: theme.radii.control,
    backgroundColor: theme.colors.accent,
  },
  actionButtonText: {
    color: theme.colors.accentText,
    fontSize: 12,
    fontWeight: '900',
  },
  ratingBlock: {
    gap: 9,
  },
  footerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  secondaryButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: theme.radii.control,
    paddingHorizontal: 13,
    backgroundColor: 'rgba(255,255,255,0.065)',
  },
  secondaryButtonText: {
    color: theme.colors.textSoft,
    fontWeight: '900',
  },
  removeButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: theme.radii.control,
    paddingHorizontal: 13,
    backgroundColor: 'rgba(255,142,134,0.10)',
  },
  removeButtonText: {
    color: theme.colors.danger,
    fontWeight: '900',
  },
});

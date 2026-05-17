import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AppScreen from '../components/AppScreen';
import BookCover from '../components/BookCover';
import EmptyState from '../components/EmptyState';
import ScreenHeader from '../components/ScreenHeader';
import { coverByIsbn } from '../data/books';
import { useLibrary } from '../state/LibraryContext';
import { theme } from '../theme';
import type { Book, RootStackParamList } from '../types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

interface OpenLibraryDoc {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  isbn?: string[];
  subject?: string[];
  number_of_pages_median?: number;
}

interface OpenLibraryResponse {
  docs?: OpenLibraryDoc[];
}

function inferGenre(subjects: string[] | undefined) {
  const joined = (subjects ?? []).slice(0, 30).join(' ').toLowerCase();
  if (joined.includes('science fiction')) return 'Science-fiction';
  if (joined.includes('fantasy') || joined.includes('magic')) return 'Fantasy';
  if (joined.includes('mystery') || joined.includes('detective')) return 'Polar';
  if (joined.includes('history') || joined.includes('historical')) return 'Historique';
  if (joined.includes('biography') || joined.includes('memoir')) return 'Memoire';
  if (joined.includes('comic') || joined.includes('graphic')) return 'Graphique';
  if (joined.includes('romance')) return 'Romance';
  if (joined.includes('poetry')) return 'Poesie';
  if (joined.includes('philosophy') || joined.includes('essay')) return 'Essai';
  return 'Litteraire';
}

function mapOpenLibraryBook(doc: OpenLibraryDoc): Book | null {
  if (!doc.key || !doc.title) {
    return null;
  }

  const author = doc.author_name?.slice(0, 2).join(', ') || 'Auteur inconnu';
  const firstIsbn = doc.isbn?.find((isbn) => isbn.length >= 10);
  const coverUrl = doc.cover_i
    ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
    : firstIsbn
      ? coverByIsbn(firstIsbn)
      : undefined;
  const genre = inferGenre(doc.subject);
  const pages = doc.number_of_pages_median;

  return {
    id: `ol:${doc.key}`,
    title: doc.title,
    author,
    coverUrl,
    year: doc.first_publish_year,
    rating: 4,
    pages,
    genre,
    mood: doc.first_publish_year && doc.first_publish_year < 1950 ? 'Classique' : 'A explorer',
    pace: pages && pages > 520 ? 'Long' : pages && pages < 220 ? 'Court' : 'Equilibre',
    reason: `Une piste ${genre.toLowerCase()} reperee dans Open Library.`,
    synopsis: 'Resume indisponible pour ce titre. Garde-le dans ta bibliotheque pour le retrouver et le noter plus tard.',
    themes: (doc.subject ?? []).slice(0, 3).map((subject) => subject.slice(0, 34)),
    sourceUrl: `https://openlibrary.org${doc.key}`,
  };
}

export default function SearchScreen() {
  const navigation = useNavigation<Navigation>();
  const { library, upsertBook, saveToShelf } = useLibrary();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      setResults([]);
      setError('');
      setLoading(false);
      return;
    }

    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError('');

      const params = new URLSearchParams({
        q: trimmedQuery,
        limit: '16',
        fields: 'key,title,author_name,first_publish_year,cover_i,isbn,subject,number_of_pages_median',
      });

      void fetch(`https://openlibrary.org/search.json?${params.toString()}`)
        .then((response) => {
          if (!response.ok) {
            throw new Error('Search failed');
          }
          return response.json() as Promise<OpenLibraryResponse>;
        })
        .then((payload) => {
          if (!active) {
            return;
          }
          const mapped = (payload.docs ?? [])
            .map(mapOpenLibraryBook)
            .filter((book): book is Book => book !== null)
            .filter((book) => library[book.id]?.shelf !== 'ignored')
            .slice(0, 12);
          setResults(mapped);
        })
        .catch(() => {
          if (active) {
            setError('Recherche indisponible pour le moment.');
          }
        })
        .finally(() => {
          if (active) {
            setLoading(false);
          }
        });
    }, 260);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [library, query]);

  const openBook = (book: Book) => {
    upsertBook(book);
    navigation.navigate('BookDetails', { bookId: book.id });
  };

  return (
    <AppScreen scroll={false} keyboardAware contentStyle={styles.screen}>
      <ScreenHeader
        icon="search-outline"
        eyebrow="Catalogue"
        title="Recherche"
        subtitle="Cherche un titre ou un auteur, puis ajoute-le directement a tes etageres."
      />

      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={20} color={theme.colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Titre, auteur, saga..."
          placeholderTextColor={theme.colors.textMuted}
          autoCorrect={false}
          style={styles.input}
          returnKeyType="search"
        />
        {loading ? <ActivityIndicator color={theme.colors.accent} /> : null}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={results}
        keyExtractor={(book) => book.id}
        contentContainerStyle={styles.resultsContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          query.trim().length < 2 ? (
            <EmptyState icon="book-outline" title="Trouve un livre" body="La recherche utilise Open Library et fonctionne sans compte ni cle API." />
          ) : loading ? null : (
            <EmptyState icon="search-outline" title="Aucun resultat" body="Essaie un titre plus court ou le nom de l auteur." />
          )
        }
        renderItem={({ item }) => {
          const entry = library[item.id];
          return (
            <Pressable style={styles.resultCard} onPress={() => openBook(item)}>
              <BookCover book={item} size="small" />
              <View style={styles.resultCopy}>
                <View style={styles.metaRow}>
                  <Text style={styles.metaPill}>{item.genre}</Text>
                  {item.year ? <Text style={styles.metaPill}>{item.year}</Text> : null}
                </View>
                <Text style={styles.resultTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.resultAuthor} numberOfLines={1}>{item.author}</Text>
                <View style={styles.buttonRow}>
                  <Pressable
                    style={styles.smallButton}
                    onPress={(event) => {
                      event.stopPropagation();
                      saveToShelf(item, 'toRead');
                    }}
                  >
                    <Ionicons name={entry?.shelf === 'toRead' ? 'checkmark' : 'bookmark-outline'} size={16} color={theme.colors.accentText} />
                    <Text style={styles.smallButtonText}>A lire</Text>
                  </Pressable>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={(event) => {
                      event.stopPropagation();
                      openBook(item);
                    }}
                  >
                    <Text style={styles.secondaryButtonText}>Detail</Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  searchBox: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: theme.colors.danger,
    fontWeight: '800',
  },
  resultsContent: {
    gap: 12,
    paddingBottom: 22,
  },
  resultCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 11,
    borderRadius: theme.radii.panel,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.055)',
  },
  resultCopy: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaPill: {
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.07)',
    color: theme.colors.textMuted,
    paddingHorizontal: 7,
    paddingVertical: 3,
    fontSize: 10,
    fontWeight: '800',
  },
  resultTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 21,
  },
  resultAuthor: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  smallButton: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingHorizontal: 10,
    backgroundColor: theme.colors.accent,
  },
  smallButtonText: {
    color: theme.colors.accentText,
    fontWeight: '900',
    fontSize: 12,
  },
  secondaryButton: {
    minHeight: 34,
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.075)',
  },
  secondaryButtonText: {
    color: theme.colors.textSoft,
    fontWeight: '900',
    fontSize: 12,
  },
});

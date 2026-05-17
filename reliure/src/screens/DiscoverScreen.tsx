import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AppScreen from '../components/AppScreen';
import BookCover from '../components/BookCover';
import EmptyState from '../components/EmptyState';
import RatingStars from '../components/RatingStars';
import ScreenHeader from '../components/ScreenHeader';
import { theme } from '../theme';
import type { Book, RootStackParamList, Shelf } from '../types';
import { useLibrary } from '../state/LibraryContext';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_LIMIT = 92;

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export default function DiscoverScreen() {
  const navigation = useNavigation<Navigation>();
  const { feed, genres, selectedGenres, toggleGenre, clearGenreFilters, saveToShelf, undoLastAction, resetIgnored, lastActionLabel } = useLibrary();
  const activeBook = feed[0] ?? null;
  const nextBook = feed[1] ?? null;
  const x = useRef(new Animated.Value(0)).current;
  const isCommittingRef = useRef(false);

  useEffect(() => {
    x.setValue(0);
  }, [activeBook?.id, x]);

  const rotate = x.interpolate({
    inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
    outputRange: ['-18deg', '0deg', '18deg'],
  });

  const animateAndCommit = useCallback((book: Book, shelf: Shelf, toValue: number, rating?: number) => {
    if (isCommittingRef.current) {
      return;
    }

    isCommittingRef.current = true;
    Animated.timing(x, { toValue, duration: 170, useNativeDriver: true }).start(() => {
      saveToShelf(book, shelf, rating);
      x.setValue(0);
      isCommittingRef.current = false;
    });
  }, [saveToShelf, x]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 8,
        onPanResponderMove: (_, gesture) => {
          x.setValue(Math.max(-160, Math.min(160, gesture.dx)));
        },
        onPanResponderRelease: (_, gesture) => {
          if (!activeBook) {
            return;
          }

          if (gesture.dx > SWIPE_LIMIT || gesture.vx > 0.75) {
            animateAndCommit(activeBook, 'toRead', 500);
            return;
          }

          if (gesture.dx < -SWIPE_LIMIT || gesture.vx < -0.75) {
            animateAndCommit(activeBook, 'ignored', -500);
            return;
          }

          Animated.spring(x, { toValue: 0, useNativeDriver: true, tension: 70, friction: 9 }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(x, { toValue: 0, useNativeDriver: true, tension: 70, friction: 9 }).start();
        },
      }),
    [activeBook, animateAndCommit, x],
  );

  const rateBook = (rating: number) => {
    if (!activeBook) {
      return;
    }
    animateAndCommit(activeBook, rating >= 5 ? 'favorite' : 'finished', rating >= 4 ? 500 : -500, rating);
  };

  return (
    <AppScreen scroll={false} contentStyle={styles.screen}>
      <ScreenHeader
        icon="sparkles-outline"
        eyebrow="Reliure"
        title="Decouvrir"
        subtitle="Swipe, sauvegarde et note les livres qui collent a ton humeur."
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.genreScroller}>
          <Pressable style={[styles.genrePill, selectedGenres.length === 0 && styles.genrePillActive]} onPress={clearGenreFilters}>
            <Text style={[styles.genreText, selectedGenres.length === 0 && styles.genreTextActive]}>Tout</Text>
          </Pressable>
          {genres.map((genre) => {
            const active = selectedGenres.includes(genre);
            return (
              <Pressable key={genre} style={[styles.genrePill, active && styles.genrePillActive]} onPress={() => toggleGenre(genre)}>
                <Text style={[styles.genreText, active && styles.genreTextActive]}>{genre}</Text>
              </Pressable>
            );
          })}
      </ScrollView>

      <View style={styles.stage}>
        {nextBook ? <BookCard book={nextBook} muted /> : null}
        {activeBook ? (
          <Animated.View
            {...panResponder.panHandlers}
            style={[styles.animatedCard, { transform: [{ translateX: x }, { rotate }] }]}
          >
            <BookCard book={activeBook} onPress={() => navigation.navigate('BookDetails', { bookId: activeBook.id })} />
          </Animated.View>
        ) : (
          <EmptyState icon="library-outline" title="Pile terminee" body="Relance les livres passes pour retrouver de nouvelles pistes." />
        )}
      </View>

      {activeBook ? (
        <View style={styles.controls}>
          <Pressable style={[styles.actionButton, styles.passButton]} onPress={() => animateAndCommit(activeBook, 'ignored', -500)}>
            <Ionicons name="close" size={23} color={theme.colors.danger} />
            <Text style={[styles.actionLabel, { color: theme.colors.danger }]}>Passer</Text>
          </Pressable>
          <Pressable style={[styles.actionButton, styles.readingButton]} onPress={() => animateAndCommit(activeBook, 'reading', 500)}>
            <Ionicons name="book-outline" size={22} color={theme.colors.blue} />
            <Text style={[styles.actionLabel, { color: theme.colors.blue }]}>En cours</Text>
          </Pressable>
          <Pressable style={[styles.actionButton, styles.saveButton]} onPress={() => animateAndCommit(activeBook, 'toRead', 500)}>
            <Ionicons name="bookmark-outline" size={22} color={theme.colors.accent} />
            <Text style={[styles.actionLabel, { color: theme.colors.accent }]}>A lire</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.primaryButton} onPress={resetIgnored}>
          <Ionicons name="refresh" size={18} color={theme.colors.accentText} />
          <Text style={styles.primaryButtonText}>Relancer la pile</Text>
        </Pressable>
      )}

      <View style={styles.bottomPanel}>
        <View>
          <Text style={styles.panelTitle}>Note rapide</Text>
          <Text style={styles.panelHint}>{lastActionLabel ?? 'Aucune action recente'}</Text>
        </View>
        <RatingStars onChange={rateBook} />
        <Pressable style={styles.undoButton} onPress={undoLastAction}>
          <Ionicons name="arrow-undo-outline" size={18} color={theme.colors.textSoft} />
        </Pressable>
      </View>
    </AppScreen>
  );
}

function BookCard({ book, muted = false, onPress }: { book: Book; muted?: boolean; onPress?: () => void }) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={[styles.card, muted && styles.cardMuted]}>
      <LinearGradient colors={theme.gradients.card} style={styles.cardInner}>
        <BookCover book={book} size="large" />
        <View style={styles.cardCopy}>
          <View style={styles.metaRow}>
            <Text style={styles.metaPill}>{book.genre}</Text>
            {book.year ? <Text style={styles.metaPill}>{book.year}</Text> : null}
            <Text style={styles.metaPill}>{book.pace}</Text>
          </View>
          <Text style={styles.bookTitle} numberOfLines={2}>{book.title}</Text>
          <Text style={styles.bookAuthor} numberOfLines={1}>{book.author}</Text>
          <Text style={styles.bookReason} numberOfLines={2}>{book.reason}</Text>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={16} color={theme.colors.amber} />
            <Text style={styles.ratingText}>{book.rating.toFixed(1)}</Text>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: 18,
  },
  genreScroller: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 6,
  },
  genrePill: {
    minHeight: 34,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  genrePillActive: {
    borderColor: 'rgba(69,208,139,0.48)',
    backgroundColor: 'rgba(69,208,139,0.14)',
  },
  genreText: {
    color: theme.colors.textMuted,
    fontWeight: '800',
    fontSize: 12,
  },
  genreTextActive: {
    color: theme.colors.text,
  },
  stage: {
    flex: 1,
    minHeight: 390,
    alignItems: 'center',
    justifyContent: 'center',
  },
  animatedCard: {
    position: 'absolute',
    width: '100%',
    alignItems: 'center',
  },
  card: {
    width: '91%',
    maxWidth: 390,
    borderRadius: theme.radii.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.34,
    shadowRadius: 24,
    elevation: 8,
  },
  cardMuted: {
    position: 'absolute',
    opacity: 0.38,
    transform: [{ translateY: 16 }, { scale: 0.96 }],
  },
  cardInner: {
    overflow: 'hidden',
    borderRadius: theme.radii.card,
  },
  cardCopy: {
    gap: 6,
    padding: 14,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaPill: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.07)',
    color: theme.colors.textMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '800',
  },
  bookTitle: {
    color: theme.colors.text,
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  bookAuthor: {
    color: theme.colors.textSoft,
    fontSize: 14,
    fontWeight: '800',
  },
  bookReason: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  ratingText: {
    color: theme.colors.amber,
    fontWeight: '900',
  },
  controls: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.055)',
  },
  passButton: {
    borderColor: 'rgba(255,142,134,0.22)',
  },
  readingButton: {
    borderColor: 'rgba(142,203,255,0.22)',
  },
  saveButton: {
    borderColor: 'rgba(69,208,139,0.25)',
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '900',
  },
  bottomPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 13,
    borderRadius: theme.radii.panel,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.055)',
  },
  panelTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  panelHint: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  undoButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  primaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderRadius: theme.radii.control,
    backgroundColor: theme.colors.accent,
  },
  primaryButtonText: {
    color: theme.colors.accentText,
    fontWeight: '900',
  },
});

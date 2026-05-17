import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AppScreen from '../components/AppScreen';
import BookCover from '../components/BookCover';
import { useLibrary } from '../state/LibraryContext';
import { theme } from '../theme';

export default function OnboardingScreen() {
  const { books, genres, completeOnboarding } = useLibrary();
  const [name, setName] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [favoriteBookIds, setFavoriteBookIds] = useState<string[]>([]);

  const starterBooks = useMemo(() => books.slice(0, 8), [books]);
  const canContinue = selectedGenres.length > 0 || favoriteBookIds.length > 0;

  const toggleGenre = (genre: string) => {
    setSelectedGenres((current) => {
      const next = new Set(current);
      if (next.has(genre)) {
        next.delete(genre);
      } else {
        next.add(genre);
      }
      return Array.from(next);
    });
  };

  const toggleBook = (bookId: string) => {
    setFavoriteBookIds((current) => {
      if (current.includes(bookId)) {
        return current.filter((id) => id !== bookId);
      }
      return [...current, bookId].slice(0, 4);
    });
  };

  return (
    <AppScreen>
      <View style={styles.hero}>
        <View style={styles.mark}>
          <Text style={styles.markText}>R</Text>
        </View>
        <Text style={styles.eyebrow}>Reliure</Text>
        <Text style={styles.title}>Construis ton premier rayon</Text>
        <Text style={styles.subtitle}>
          Choisis quelques genres ou livres de depart. L app s ouvre ensuite sur des recommandations plus proches de tes envies.
        </Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Ton profil</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="person-outline" size={18} color={theme.colors.textMuted} />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Prenom ou pseudo"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
          />
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Genres que tu veux voir</Text>
        <View style={styles.chipWrap}>
          {genres.map((genre) => {
            const active = selectedGenres.includes(genre);
            return (
              <Pressable key={genre} style={[styles.chip, active && styles.chipActive]} onPress={() => toggleGenre(genre)}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{genre}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Livres deja dans ton mood</Text>
        <View style={styles.bookGrid}>
          {starterBooks.map((book) => {
            const active = favoriteBookIds.includes(book.id);
            return (
              <Pressable key={book.id} style={[styles.bookChoice, active && styles.bookChoiceActive]} onPress={() => toggleBook(book.id)}>
                <BookCover book={book} size="small" />
                <Text style={styles.bookTitle} numberOfLines={2}>{book.title}</Text>
                {active ? (
                  <View style={styles.checkBadge}>
                    <Ionicons name="checkmark" size={14} color={theme.colors.accentText} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable
        disabled={!canContinue}
        style={[styles.primaryButton, !canContinue && styles.primaryButtonDisabled]}
        onPress={() => completeOnboarding({ name, selectedGenres, favoriteBookIds })}
      >
        <Text style={styles.primaryButtonText}>{canContinue ? 'Entrer dans Reliure' : 'Choisis au moins un signal'}</Text>
        <Ionicons name="arrow-forward" size={18} color={theme.colors.accentText} />
      </Pressable>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    gap: 9,
    paddingTop: 12,
    paddingBottom: 4,
  },
  mark: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(69,208,139,0.32)',
    backgroundColor: 'rgba(69,208,139,0.13)',
  },
  markText: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '900',
  },
  eyebrow: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    color: theme.colors.text,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 37,
    textAlign: 'center',
  },
  subtitle: {
    color: theme.colors.textMuted,
    maxWidth: 330,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    textAlign: 'center',
  },
  panel: {
    gap: 12,
    padding: 14,
    borderRadius: theme.radii.panel,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  panelTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  inputWrap: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: theme.radii.control,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  chipActive: {
    borderColor: 'rgba(69,208,139,0.48)',
    backgroundColor: 'rgba(69,208,139,0.14)',
  },
  chipText: {
    color: theme.colors.textMuted,
    fontWeight: '800',
  },
  chipTextActive: {
    color: theme.colors.text,
  },
  bookGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  bookChoice: {
    position: 'relative',
    width: '22.7%',
    minWidth: 72,
    gap: 7,
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
    padding: 6,
  },
  bookChoiceActive: {
    borderColor: 'rgba(69,208,139,0.5)',
    backgroundColor: 'rgba(69,208,139,0.08)',
  },
  bookTitle: {
    color: theme.colors.textSoft,
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
    textAlign: 'center',
  },
  checkBadge: {
    position: 'absolute',
    right: 2,
    top: 2,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: theme.colors.accent,
  },
  primaryButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: theme.radii.control,
    backgroundColor: theme.colors.accent,
  },
  primaryButtonDisabled: {
    opacity: 0.48,
  },
  primaryButtonText: {
    color: theme.colors.accentText,
    fontSize: 15,
    fontWeight: '900',
  },
});

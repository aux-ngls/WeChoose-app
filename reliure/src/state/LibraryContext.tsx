import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { seedBooks } from '../data/books';
import type { Book, LibraryEntry, ReaderProfile, Shelf } from '../types';

const STORAGE_KEY = 'reliure-library-v1';

interface PersistedState {
  catalog: Record<string, Book>;
  library: Record<string, LibraryEntry>;
  selectedGenres: string[];
  profile: ReaderProfile;
}

interface UndoSnapshot {
  bookId: string;
  previousEntry: LibraryEntry | null;
}

interface LibraryContextValue extends PersistedState {
  hydrated: boolean;
  books: Book[];
  feed: Book[];
  genres: string[];
  lastActionLabel: string | null;
  upsertBook: (book: Book) => void;
  saveToShelf: (book: Book, shelf: Shelf, rating?: number) => void;
  removeBook: (bookId: string) => void;
  toggleGenre: (genre: string) => void;
  clearGenreFilters: () => void;
  completeOnboarding: (payload: { name: string; selectedGenres: string[]; favoriteBookIds: string[] }) => void;
  updateProfileName: (name: string) => void;
  resetIgnored: () => void;
  undoLastAction: () => void;
}

const seedCatalog = seedBooks.reduce<Record<string, Book>>((catalog, book) => {
  catalog[book.id] = book;
  return catalog;
}, {});

const defaultProfile: ReaderProfile = {
  name: 'Lecteur',
  hasCompletedOnboarding: false,
};

const LibraryContext = createContext<LibraryContextValue | undefined>(undefined);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<Record<string, Book>>(seedCatalog);
  const [library, setLibrary] = useState<Record<string, LibraryEntry>>({});
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [profile, setProfile] = useState<ReaderProfile>(defaultProfile);
  const [hydrated, setHydrated] = useState(false);
  const [lastSnapshot, setLastSnapshot] = useState<UndoSnapshot | null>(null);
  const [lastActionLabel, setLastActionLabel] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void AsyncStorage.getItem(STORAGE_KEY).then((rawValue) => {
      if (!active) {
        return;
      }

      if (rawValue) {
        try {
          const parsed = JSON.parse(rawValue) as Partial<PersistedState>;
          setCatalog({ ...seedCatalog, ...(parsed.catalog ?? {}) });
          setLibrary(parsed.library ?? {});
          setSelectedGenres(Array.isArray(parsed.selectedGenres) ? parsed.selectedGenres : []);
          setProfile({
            ...defaultProfile,
            ...(parsed.profile ?? {}),
            name: parsed.profile?.name?.trim() || defaultProfile.name,
          });
        } catch {
          setCatalog(seedCatalog);
        }
      }

      setHydrated(true);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const payload: PersistedState = { catalog, library, selectedGenres, profile };
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [catalog, hydrated, library, profile, selectedGenres]);

  const books = useMemo(() => Object.values(catalog), [catalog]);

  const genres = useMemo(
    () => Array.from(new Set(books.map((book) => book.genre))).sort((first, second) => first.localeCompare(second)),
    [books],
  );

  const feed = useMemo(() => {
    const activeGenres = new Set(selectedGenres);
    return books
      .filter((book) => {
        const entry = library[book.id];
        return !entry || entry.shelf === 'reading';
      })
      .sort((first, second) => {
        const firstGenreScore = activeGenres.has(first.genre) ? 1 : 0;
        const secondGenreScore = activeGenres.has(second.genre) ? 1 : 0;
        if (firstGenreScore !== secondGenreScore) {
          return secondGenreScore - firstGenreScore;
        }
        return second.rating - first.rating;
      });
  }, [books, library, selectedGenres]);

  const upsertBook = useCallback((book: Book) => {
    setCatalog((current) => ({ ...current, [book.id]: book }));
  }, []);

  const saveToShelf = useCallback((book: Book, shelf: Shelf, rating?: number) => {
    setCatalog((current) => ({ ...current, [book.id]: book }));
    setLibrary((current) => {
      setLastSnapshot({
        bookId: book.id,
        previousEntry: current[book.id] ?? null,
      });
      return {
        ...current,
        [book.id]: {
          shelf,
          rating,
          addedAt: new Date().toISOString(),
        },
      };
    });
    setLastActionLabel(shelf === 'ignored' ? 'Livre passe' : 'Livre enregistre');
  }, []);

  const removeBook = useCallback((bookId: string) => {
    setLibrary((current) => {
      setLastSnapshot({
        bookId,
        previousEntry: current[bookId] ?? null,
      });
      const next = { ...current };
      delete next[bookId];
      return next;
    });
    setLastActionLabel('Livre retire');
  }, []);

  const toggleGenre = useCallback((genre: string) => {
    setSelectedGenres((current) => {
      const next = new Set(current);
      if (next.has(genre)) {
        next.delete(genre);
      } else {
        next.add(genre);
      }
      return Array.from(next);
    });
  }, []);

  const clearGenreFilters = useCallback(() => {
    setSelectedGenres([]);
  }, []);

  const completeOnboarding = useCallback((payload: { name: string; selectedGenres: string[]; favoriteBookIds: string[] }) => {
    const cleanName = payload.name.trim() || 'Lecteur';
    const favoriteBookIds = new Set(payload.favoriteBookIds);
    setSelectedGenres(payload.selectedGenres);
    setLibrary((current) => {
      const next = { ...current };
      favoriteBookIds.forEach((bookId) => {
        next[bookId] = {
          shelf: 'favorite',
          rating: 5,
          addedAt: new Date().toISOString(),
        };
      });
      return next;
    });
    setProfile({ name: cleanName, hasCompletedOnboarding: true });
    setLastActionLabel('Profil initialise');
  }, []);

  const updateProfileName = useCallback((name: string) => {
    setProfile((current) => ({ ...current, name: name.trim() || current.name }));
  }, []);

  const resetIgnored = useCallback(() => {
    setLibrary((current) => {
      const next = { ...current };
      Object.entries(next).forEach(([bookId, entry]) => {
        if (entry.shelf === 'ignored') {
          delete next[bookId];
        }
      });
      return next;
    });
    setLastActionLabel('Pile relancee');
  }, []);

  const undoLastAction = useCallback(() => {
    if (!lastSnapshot) {
      return;
    }

    setLibrary((current) => {
      const next = { ...current };
      if (lastSnapshot.previousEntry) {
        next[lastSnapshot.bookId] = lastSnapshot.previousEntry;
      } else {
        delete next[lastSnapshot.bookId];
      }
      return next;
    });
    setLastSnapshot(null);
    setLastActionLabel('Action annulee');
  }, [lastSnapshot]);

  const value = useMemo<LibraryContextValue>(
    () => ({
      catalog,
      library,
      selectedGenres,
      profile,
      hydrated,
      books,
      feed,
      genres,
      lastActionLabel,
      upsertBook,
      saveToShelf,
      removeBook,
      toggleGenre,
      clearGenreFilters,
      completeOnboarding,
      updateProfileName,
      resetIgnored,
      undoLastAction,
    }),
    [
      books,
      catalog,
      clearGenreFilters,
      completeOnboarding,
      feed,
      genres,
      hydrated,
      lastActionLabel,
      library,
      profile,
      removeBook,
      resetIgnored,
      saveToShelf,
      selectedGenres,
      toggleGenre,
      undoLastAction,
      updateProfileName,
      upsertBook,
    ],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const context = useContext(LibraryContext);
  if (!context) {
    throw new Error('useLibrary must be used inside LibraryProvider');
  }
  return context;
}

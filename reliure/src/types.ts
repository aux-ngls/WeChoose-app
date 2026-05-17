export type Shelf = 'toRead' | 'reading' | 'finished' | 'favorite' | 'ignored';

export interface Book {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  year?: number;
  rating: number;
  pages?: number;
  genre: string;
  mood: string;
  pace: string;
  reason: string;
  synopsis: string;
  themes: string[];
  sourceUrl?: string;
}

export interface LibraryEntry {
  shelf: Shelf;
  rating?: number;
  addedAt: string;
}

export interface ReaderProfile {
  name: string;
  hasCompletedOnboarding: boolean;
}

export type RootStackParamList = {
  Onboarding: undefined;
  MainTabs: undefined;
  BookDetails: { bookId: string };
};

export type MainTabParamList = {
  Discover: undefined;
  Search: undefined;
  Library: undefined;
  Profile: undefined;
};

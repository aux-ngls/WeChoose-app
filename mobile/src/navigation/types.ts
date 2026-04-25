import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Home: undefined;
  Search: undefined;
  Social: undefined;
  Messages: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Onboarding: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  MovieDetails: { movieId: number; title?: string; source?: 'tinder' | 'default' };
  PlaylistDetails: { playlistId: number; name?: string };
  ShareMovie: {
    movieId: number;
    title: string;
    posterUrl: string;
    rating: number;
  };
  CreateReview: {
    movieId?: number;
    title?: string;
    posterUrl?: string;
    rating?: number;
  } | undefined;
  Conversation: {
    conversationId: number;
    participantUsername?: string;
    participantId?: number;
  };
};

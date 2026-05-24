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
  Tutorial: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  MovieDetails: { movieId: number; title?: string; source?: 'tinder' | 'default' };
  PersonDetails: { personId: number; name?: string; photoUrl?: string | null };
  PlaylistDetails: { playlistId: number; name?: string };
  ShareMovie: {
    movieId?: number;
    title?: string;
    posterUrl?: string;
    rating?: number;
    conversationId?: number;
    participantUsername?: string;
    participantId?: number;
  };
  Notifications: undefined;
  Settings: undefined;
  TestAiDashboard: undefined;
  GroupRecommendations: undefined;
  UserProfile: {
    username: string;
  };
  ReviewDetails: {
    reviewId: number;
    highlightCommentId?: number;
  };
  CreateReview: {
    reviewId?: number;
    movieId?: number;
    title?: string;
    posterUrl?: string;
    rating?: number;
    reviewRating?: number;
    content?: string;
  } | undefined;
  Conversation: {
    conversationId: number;
    participantUsername?: string;
    participantId?: number;
  };
};

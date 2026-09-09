import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';
import type { MediaType } from '../types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

type NotificationData = Record<string, unknown>;
let pendingNotificationData: NotificationData | null = null;
let pendingMovieNavigation:
  | {
      movieId: number;
      mediaType: MediaType;
    }
  | null = null;

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsedValue = Number.parseInt(value, 10);
    return Number.isFinite(parsedValue) ? parsedValue : undefined;
  }
  return undefined;
}

function canOpenMovieDetails() {
  if (!navigationRef.isReady()) {
    return false;
  }

  const currentRoute = navigationRef.getCurrentRoute();
  if (!currentRoute) {
    return false;
  }

  return currentRoute.name !== 'Auth' && currentRoute.name !== 'Onboarding' && currentRoute.name !== 'Tutorial';
}

function navigateToMovieDetails(movieId: number, mediaType: MediaType = 'movie') {
  if (!canOpenMovieDetails()) {
    pendingMovieNavigation = { movieId, mediaType };
    return;
  }

  pendingMovieNavigation = null;
  navigationRef.navigate('MovieDetails', { movieId, mediaType, source: 'default' });
}

function parseMediaFromUrl(url: string): { movieId: number; mediaType: MediaType } | null {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    return null;
  }

  const directMovieMatch = trimmedUrl.match(/^qulte:\/\/movie\/(\d+)(?:[/?#]|$)/i);
  if (directMovieMatch?.[1]) {
    const movieId = readNumber(directMovieMatch[1]);
    return movieId ? { movieId, mediaType: 'movie' } : null;
  }

  const directTvMatch = trimmedUrl.match(/^qulte:\/\/(?:tv|series)\/(\d+)(?:[/?#]|$)/i);
  if (directTvMatch?.[1]) {
    const movieId = readNumber(directTvMatch[1]);
    return movieId ? { movieId, mediaType: 'tv' } : null;
  }

  const webMovieMatch = trimmedUrl.match(/\/movie\/(\d+)(?:[/?#]|$)/i);
  if (webMovieMatch?.[1]) {
    const movieId = readNumber(webMovieMatch[1]);
    if (!movieId) {
      return null;
    }
    const mediaType = /[?&]media_type=tv(?:&|$)/i.test(trimmedUrl) ? 'tv' : 'movie';
    return { movieId, mediaType };
  }

  return null;
}

export function navigateFromNotificationData(data: NotificationData) {
  if (!navigationRef.isReady()) {
    pendingNotificationData = data;
    return;
  }
  pendingNotificationData = null;

  const conversationId = readNumber(data.conversationId);
  if (conversationId) {
    navigationRef.navigate('Conversation', { conversationId });
    return;
  }

  const reviewId = readNumber(data.reviewId);
  const commentId = readNumber(data.commentId);

  const route = readString(data.route);
  if (route?.startsWith('/messages')) {
    navigationRef.navigate('MainTabs', { screen: 'Messages' });
    return;
  }

  if (route?.startsWith('/social')) {
    if (reviewId) {
      navigationRef.navigate('ReviewDetails', {
        reviewId,
        highlightCommentId: commentId,
      });
      return;
    }
    navigationRef.navigate('Notifications');
  }
}

export function navigateFromExternalUrl(url: string) {
  const media = parseMediaFromUrl(url);
  if (!media) {
    return;
  }

  navigateToMovieDetails(media.movieId, media.mediaType);
}

export function flushPendingNotificationNavigation() {
  if (pendingNotificationData) {
    navigateFromNotificationData(pendingNotificationData);
  }
  if (pendingMovieNavigation?.movieId) {
    navigateToMovieDetails(pendingMovieNavigation.movieId, pendingMovieNavigation.mediaType);
  }
}

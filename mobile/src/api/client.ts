import { API_URL } from './config';
import type {
  AuthPayload,
  DirectConversationDetails,
  DirectConversationSummary,
  MovieDetails,
  OnboardingPreferencesResponse,
  PlaylistSummary,
  ProfilePreferencesPayload,
  ProfileShowcasePerson,
  ProfileShowcaseSoundtrack,
  SearchMovie,
  SocialComment,
  SocialNotificationsPayload,
  SocialProfile,
  SocialReview,
  SocialUser,
  UserMovieRating,
} from '../types';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function request<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
  });

  const payload = await parseJson<unknown>(response);

  if (!response.ok) {
    const errorPayload = payload as { detail?: string; message?: string } | null;
    throw new ApiError(
      errorPayload?.detail ?? errorPayload?.message ?? 'Une erreur API est survenue.',
      response.status,
    );
  }

  return payload as T;
}

export async function login(username: string, password: string): Promise<AuthPayload> {
  const formData = new URLSearchParams();
  formData.append('username', username);
  formData.append('password', password);

  return request<AuthPayload>(
    '/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    },
  );
}

export async function signup(username: string, password: string): Promise<AuthPayload> {
  return request<AuthPayload>('/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}

export async function getMe(token: string): Promise<{ has_completed_onboarding: boolean; has_completed_tutorial: boolean }> {
  return request<{ has_completed_onboarding: boolean; has_completed_tutorial: boolean }>('/users/me', undefined, token);
}

export async function completeTutorial(token: string): Promise<void> {
  await request<null>('/tutorial/complete', { method: 'POST' }, token);
}

export async function getOnboardingPreferences(token: string): Promise<OnboardingPreferencesResponse> {
  return request<OnboardingPreferencesResponse>('/onboarding/preferences', undefined, token);
}

export async function saveOnboardingPreferences(
  token: string,
  preferences: {
    favorite_genres: string[];
    favorite_people: string[];
    favorite_movie_ids: number[];
  },
): Promise<OnboardingPreferencesResponse> {
  return request<OnboardingPreferencesResponse>(
    '/onboarding/preferences',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preferences),
    },
    token,
  );
}

export async function fetchMovieFeed(
  token: string,
  options?: { excludeIds?: number[]; limit?: number; mode?: string },
): Promise<SearchMovie[]> {
  const params = new URLSearchParams();
  params.set('limit', String(options?.limit ?? 8));
  params.set('mode', options?.mode ?? 'tinder');
  if (options?.excludeIds?.length) {
    params.set('exclude_ids', options.excludeIds.join(','));
  }

  return request<SearchMovie[]>(`/movies/feed?${params.toString()}`, undefined, token);
}

export async function fetchMovieDetails(token: string, movieId: number): Promise<MovieDetails> {
  return request<MovieDetails>(`/movie/${movieId}`, undefined, token);
}

export async function fetchUserMovieRating(token: string, movieId: number): Promise<UserMovieRating> {
  return request<UserMovieRating>(`/movies/user-rating/${movieId}`, undefined, token);
}

export async function rateMovie(token: string, movieId: number, rating: number): Promise<void> {
  await request<null>(`/movies/rate/${movieId}/${rating}`, { method: 'POST' }, token);
}

export async function removeMovieRating(token: string, movieId: number): Promise<void> {
  await request<null>(`/movies/rate/${movieId}`, { method: 'DELETE' }, token);
}

export async function addToWatchLater(token: string, movieId: number): Promise<void> {
  await request<null>(`/playlists/-1/add/${movieId}`, { method: 'POST' }, token);
}

export async function addMovieToPlaylist(token: string, playlistId: number, movieId: number): Promise<void> {
  await request<null>(`/playlists/${playlistId}/add/${movieId}`, { method: 'POST' }, token);
}

export async function searchMovies(token: string, query: string): Promise<SearchMovie[]> {
  return request<SearchMovie[]>(`/search?query=${encodeURIComponent(query)}`, undefined, token);
}

export async function fetchSocialFeed(token: string): Promise<SocialReview[]> {
  return request<SocialReview[]>('/social/feed', undefined, token);
}

export async function createReview(
  token: string,
  payload: {
    movie_id: number;
    title: string;
    poster_url: string;
    rating: number;
    content: string;
  },
): Promise<SocialReview> {
  return request<SocialReview>(
    '/social/reviews',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    token,
  );
}

export async function fetchReviewComments(token: string, reviewId: number): Promise<SocialComment[]> {
  return request<SocialComment[]>(`/social/reviews/${reviewId}/comments`, undefined, token);
}

export async function createReviewComment(
  token: string,
  reviewId: number,
  content: string,
  parentId?: number | null,
): Promise<SocialComment> {
  return request<SocialComment>(
    `/social/reviews/${reviewId}/comments`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, parent_id: parentId ?? null }),
    },
    token,
  );
}

export async function toggleReviewLike(
  token: string,
  reviewId: number,
): Promise<{ liked: boolean; likes_count: number }> {
  return request<{ liked: boolean; likes_count: number }>(
    `/social/reviews/${reviewId}/like`,
    { method: 'POST' },
    token,
  );
}

export async function fetchSocialNotifications(token: string): Promise<SocialNotificationsPayload> {
  return request<SocialNotificationsPayload>('/social/notifications?limit=12', undefined, token);
}

export async function markSocialNotificationsRead(token: string): Promise<{ updated: number }> {
  return request<{ updated: number }>('/social/notifications/read-all', { method: 'POST' }, token);
}

export async function searchSocialUsers(token: string, query: string): Promise<SocialUser[]> {
  return request<SocialUser[]>(`/social/users?query=${encodeURIComponent(query)}&limit=10`, undefined, token);
}

export async function followUser(token: string, targetUserId: number): Promise<void> {
  await request<null>(`/social/follow/${targetUserId}`, { method: 'POST' }, token);
}

export async function unfollowUser(token: string, targetUserId: number): Promise<void> {
  await request<null>(`/social/follow/${targetUserId}`, { method: 'DELETE' }, token);
}

export async function startConversation(token: string, targetUserId: number): Promise<{ id: number }> {
  return request<{ id: number }>(`/messages/conversations/start/${targetUserId}`, { method: 'POST' }, token);
}

export async function fetchUnreadDirectMessagesCount(token: string): Promise<{ unread_count: number }> {
  return request<{ unread_count: number }>('/messages/unread-count', undefined, token);
}

export async function fetchConversations(token: string): Promise<DirectConversationSummary[]> {
  return request<DirectConversationSummary[]>('/messages/conversations', undefined, token);
}

export async function fetchConversation(token: string, conversationId: number): Promise<DirectConversationDetails> {
  return request<DirectConversationDetails>(`/messages/conversations/${conversationId}`, undefined, token);
}

export async function sendMessage(
  token: string,
  conversationId: number,
  payload: {
    content?: string;
    movie_id?: number;
    movie_title?: string;
    movie_poster_url?: string;
    movie_rating?: number;
  },
): Promise<void> {
  await request<null>(
    `/messages/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    token,
  );
}

export async function registerMobileDevice(
  token: string,
  payload: { device_token: string; platform: 'ios' | 'android'; app_version?: string },
): Promise<void> {
  await request<null>(
    '/mobile/devices/register',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: payload.device_token,
        platform: payload.platform,
        app_version: payload.app_version,
      }),
    },
    token,
  );
}

export async function unregisterMobileDevice(token: string, deviceToken: string): Promise<void> {
  await request<null>(
    '/mobile/devices/unregister',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: deviceToken }),
    },
    token,
  );
}

export async function fetchSocialProfile(token: string, username: string): Promise<SocialProfile> {
  return request<SocialProfile>(
    `/social/profile/${encodeURIComponent(username)}?limit=8`,
    undefined,
    token,
  );
}

export async function fetchProfilePreferences(token: string): Promise<ProfilePreferencesPayload> {
  return request<ProfilePreferencesPayload>('/profile/preferences', undefined, token);
}

export async function fetchPlaylists(token: string): Promise<PlaylistSummary[]> {
  return request<PlaylistSummary[]>('/playlists', undefined, token);
}

export async function createPlaylist(token: string, name: string): Promise<PlaylistSummary> {
  return request<PlaylistSummary>(
    '/playlists/create',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    },
    token,
  );
}

export async function fetchPlaylistMovies(token: string, playlistId: number): Promise<SearchMovie[]> {
  return request<SearchMovie[]>(`/playlists/${playlistId}`, undefined, token);
}

export async function removeMovieFromPlaylist(token: string, playlistId: number, movieId: number): Promise<void> {
  await request<null>(`/playlists/${playlistId}/remove/${movieId}`, { method: 'DELETE' }, token);
}

export async function reorderPlaylistMovies(token: string, playlistId: number, movieIds: number[]): Promise<void> {
  await request<null>(
    `/playlists/${playlistId}/reorder`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movie_ids: movieIds }),
    },
    token,
  );
}

export async function saveProfilePreferences(
  token: string,
  payload: ProfilePreferencesPayload,
): Promise<ProfilePreferencesPayload> {
  return request<ProfilePreferencesPayload>(
    '/profile/preferences',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    token,
  );
}

export async function uploadProfilePhoto(
  token: string,
  file: { uri: string; name: string; type: string },
): Promise<{ avatar_url: string | null }> {
  const formData = new FormData();
  formData.append('file', file as unknown as Blob);

  return request<{ avatar_url: string | null }>(
    '/profile/avatar',
    {
      method: 'POST',
      body: formData,
    },
    token,
  );
}

export async function searchPeople(token: string, query: string): Promise<ProfileShowcasePerson[]> {
  return request<ProfileShowcasePerson[]>(`/search/people?query=${encodeURIComponent(query)}`, undefined, token);
}

export async function searchSoundtracks(token: string, query: string): Promise<ProfileShowcaseSoundtrack[]> {
  return request<ProfileShowcaseSoundtrack[]>(`/search/soundtracks?query=${encodeURIComponent(query)}`, undefined, token);
}

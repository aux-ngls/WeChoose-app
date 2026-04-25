export interface SearchMovie {
  id: number;
  title: string;
  poster_url: string;
  rating: number;
  recommendation_reason?: string;
  overview?: string;
  release_date?: string;
  added_at?: string;
  sort_index?: number;
  primary_genre?: string;
}

export interface AuthPayload {
  access_token: string;
  has_completed_onboarding: boolean;
  has_completed_tutorial: boolean;
}

export interface SessionState {
  token: string;
  username: string;
  hasCompletedOnboarding: boolean;
  hasCompletedTutorial: boolean;
}

export interface OnboardingPreferencesResponse {
  favorite_genres: string[];
  favorite_people: string[];
  favorite_movie_ids: number[];
  has_completed_onboarding: boolean;
}

export interface SocialUser {
  id: number;
  username: string;
  avatar_url: string | null;
  followers_count: number;
  following_count: number;
  reviews_count: number;
  is_following: boolean;
}

export interface SocialReview {
  id: number;
  movie_id: number;
  title: string;
  poster_url: string;
  rating: number;
  content: string;
  created_at: string;
  author: {
    id: number;
    username: string;
    avatar_url: string | null;
  };
  likes_count: number;
  liked_by_me: boolean;
  comments_count: number;
}

export interface SocialComment {
  id: number;
  review_id: number;
  parent_id: number | null;
  content: string;
  created_at: string;
  author: {
    id: number;
    username: string;
    avatar_url: string | null;
  };
  reply_to_username: string | null;
}

export interface ProfileShowcaseMovie {
  id: number;
  title: string;
  poster_url: string;
  rating: number;
}

export interface ProfileShowcasePerson {
  id: number | null;
  name: string;
  photo_url: string | null;
  known_for_department: string | null;
}

export interface ProfileShowcaseSoundtrack {
  track_name: string;
  artist_name: string;
  preview_url: string;
  artwork_url: string | null;
  source_url: string | null;
  collection_name: string | null;
}

export interface SocialProfile {
  id: number;
  username: string;
  avatar_url: string | null;
  followers_count: number;
  following_count: number;
  reviews_count: number;
  favorites_count: number;
  is_following: boolean;
  is_self: boolean;
  profile_description: string;
  profile_genres: string[];
  profile_people: ProfileShowcasePerson[];
  profile_movie_ids: number[];
  profile_movies: ProfileShowcaseMovie[];
  profile_soundtrack: ProfileShowcaseSoundtrack | null;
  reviews: SocialReview[];
}

export interface PlaylistSummary {
  id: number;
  name: string;
  type: 'custom' | 'system';
  system_key: 'watch-later' | 'favorites' | 'history' | null;
  readonly: boolean;
}

export interface DirectConversationSummary {
  id: number;
  created_at: string;
  updated_at: string;
  participant: {
    id: number;
    username: string;
    avatar_url: string | null;
  };
  last_message: {
    id: number;
    content: string;
    created_at: string;
    sender_id: number;
    preview: string;
    movie: {
      id: number;
      title: string;
      poster_url: string;
    } | null;
  } | null;
  unread_count: number;
}

export interface MovieWatchProvider {
  id: number;
  name: string;
  logo_url: string | null;
}

export interface MovieWatchProviders {
  region: string;
  link: string;
  subscription: MovieWatchProvider[];
  rent: MovieWatchProvider[];
  buy: MovieWatchProvider[];
}

export interface MovieCastMember {
  name: string;
  character: string;
  photo: string | null;
}

export interface MovieDetails {
  id: number;
  title: string;
  overview: string;
  rating: number;
  poster_url: string;
  trailer_url: string | null;
  cast: MovieCastMember[];
  release_date: string;
  runtime: number;
  tagline: string;
  genres: string[];
  directors: string[];
  watch_providers: MovieWatchProviders;
}

export interface UserMovieRating {
  rating: number | null;
}

export interface DirectMessage {
  id: number;
  content: string;
  created_at: string;
  is_mine: boolean;
  sender: {
    id: number;
    username: string;
  };
  movie: {
    id: number;
    title: string;
    poster_url: string;
    rating: number;
  } | null;
}

export interface DirectConversationDetails {
  conversation: {
    id: number;
    participant: {
      id: number;
      username: string;
      avatar_url: string | null;
    };
  };
  messages: DirectMessage[];
}

export interface ProfilePreferencesPayload {
  profile_description: string;
  profile_genres: string[];
  profile_people: ProfileShowcasePerson[];
  profile_movie_ids: number[];
  profile_soundtrack: ProfileShowcaseSoundtrack | null;
}

export const FALLBACK_POSTER = 'https://via.placeholder.com/500x750?text=No+Image';
export const WATCH_LATER_PLAYLIST_ID = -1;
export const FAVORITES_PLAYLIST_ID = -2;
export const HISTORY_PLAYLIST_ID = -3;

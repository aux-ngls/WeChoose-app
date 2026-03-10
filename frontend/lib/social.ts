export interface SearchMovie {
  id: number;
  title: string;
  poster_url: string;
  rating: number;
}

export interface SocialUser {
  id: number;
  username: string;
  followers_count: number;
  following_count: number;
  reviews_count: number;
  is_following: boolean;
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
  };
  reply_to_username: string | null;
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
  };
  likes_count: number;
  liked_by_me: boolean;
  comments_count: number;
}

export interface SocialNotification {
  id: number;
  type: string;
  created_at: string;
  is_read: boolean;
  message: string;
  actor: {
    id: number;
    username: string;
  };
  review: {
    id: number;
    title: string;
    poster_url: string;
  } | null;
  comment_preview: string;
}

export interface SocialProfile {
  id: number;
  username: string;
  followers_count: number;
  following_count: number;
  reviews_count: number;
  favorites_count: number;
  is_following: boolean;
  is_self: boolean;
  reviews: SocialReview[];
}

export const FALLBACK_POSTER = "https://via.placeholder.com/500x750?text=No+Image";

export function formatSocialDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

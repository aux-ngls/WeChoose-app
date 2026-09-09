import { Image as ExpoImage, type ImageContentFit, type ImageStyle } from 'expo-image';
import { type StyleProp } from 'react-native';
import { FALLBACK_POSTER } from '../types';

export type PosterImageSize = 'w154' | 'w185' | 'w342' | 'w500' | 'w780' | 'original';

interface CachedPosterProps {
  uri?: string | null;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  transition?: number;
  size?: PosterImageSize;
}

const TMDB_IMAGE_URL_PATTERN = /^(https?:\/\/image\.tmdb\.org\/t\/p\/)([^/]+)(\/.+)$/i;

export function getOptimizedPosterUrl(uri: string | null | undefined, size: PosterImageSize = 'w342') {
  const fallbackUri = uri || FALLBACK_POSTER;
  const match = fallbackUri.match(TMDB_IMAGE_URL_PATTERN);
  if (!match) {
    return fallbackUri;
  }

  return `${match[1]}${size}${match[3]}`;
}

export function prefetchPosterUrls(urls: Array<string | null | undefined>, limit = 16, size: PosterImageSize = 'w342') {
  const uniqueUrls = Array.from(
    new Set(urls.map((url) => getOptimizedPosterUrl(url, size)).filter((url): url is string => Boolean(url))),
  ).slice(0, limit);
  if (uniqueUrls.length === 0) {
    return Promise.resolve(false);
  }

  return ExpoImage.prefetch(uniqueUrls, 'memory-disk');
}

export default function CachedPoster({
  uri,
  style,
  contentFit = 'cover',
  transition = 160,
  size = 'w342',
}: CachedPosterProps) {
  const sourceUri = getOptimizedPosterUrl(uri, size);

  return (
    <ExpoImage
      source={{ uri: sourceUri }}
      style={style}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      recyclingKey={sourceUri}
      transition={transition}
    />
  );
}

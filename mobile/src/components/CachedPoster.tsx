import { Image as ExpoImage, type ImageContentFit, type ImageStyle } from 'expo-image';
import { type StyleProp } from 'react-native';
import { FALLBACK_POSTER } from '../types';

interface CachedPosterProps {
  uri?: string | null;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  transition?: number;
}

export function prefetchPosterUrls(urls: Array<string | null | undefined>, limit = 16) {
  const uniqueUrls = Array.from(new Set(urls.filter((url): url is string => Boolean(url)))).slice(0, limit);
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
}: CachedPosterProps) {
  return (
    <ExpoImage
      source={{ uri: uri || FALLBACK_POSTER }}
      style={style}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      recyclingKey={uri || FALLBACK_POSTER}
      transition={transition}
    />
  );
}

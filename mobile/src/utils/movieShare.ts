import type { MediaType } from '../types';

const QULTE_WEB_BASE_URL = 'https://wechoose.dury.dev';

export function buildPublicMovieShareUrl(movieId: number, mediaType: MediaType = 'movie') {
  const suffix = mediaType === 'movie' ? '' : `?media_type=${mediaType}`;
  return `${QULTE_WEB_BASE_URL}/movie/${movieId}${suffix}`;
}

export function buildPublicMovieShareMessage(movieTitle: string, movieId: number, mediaType: MediaType = 'movie') {
  return `Découvre ${movieTitle} sur Qulte\n${buildPublicMovieShareUrl(movieId, mediaType)}`;
}

const QULTE_WEB_BASE_URL = 'https://wechoose.dury.dev';

export function buildPublicMovieShareUrl(movieId: number) {
  return `${QULTE_WEB_BASE_URL}/movie/${movieId}`;
}

export function buildPublicMovieShareMessage(movieTitle: string, movieId: number) {
  return `Découvre ${movieTitle} sur Qulte\n${buildPublicMovieShareUrl(movieId)}`;
}

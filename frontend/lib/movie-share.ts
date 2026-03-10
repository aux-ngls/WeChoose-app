interface ShareableMovie {
  id: number;
  title: string;
  poster_url: string;
  rating: number;
}

export function buildMessageShareHref(movie: ShareableMovie): string {
  const params = new URLSearchParams({
    shareMovieId: String(movie.id),
    shareMovieTitle: movie.title,
    shareMoviePoster: movie.poster_url,
    shareMovieRating: String(movie.rating),
  });

  return `/messages?${params.toString()}`;
}

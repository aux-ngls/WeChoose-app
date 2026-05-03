"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  ListPlus,
  Loader2,
  PlaySquare,
  Share2,
  Star,
  Tv2,
  X,
} from "lucide-react";
import { API_URL } from "@/config";
import { buildAuthHeaders, clearStoredSession, getStoredToken } from "@/lib/auth";
import { buildMessageShareHref } from "@/lib/movie-share";
import { canAddToPlaylist, type PlaylistSummary } from "@/lib/playlists";

interface CastMember {
  name: string;
  character: string;
  photo: string | null;
}

interface MovieDetails {
  id: number;
  title: string;
  poster_url: string;
  rating: number;
  recommendation_reason?: string;
  overview?: string;
  trailer_url?: string;
  cast?: CastMember[];
  release_date?: string;
  runtime?: number;
  tagline?: string;
  genres?: string[];
  directors?: string[];
  watch_providers?: {
    region?: string;
    link?: string;
    subscription?: Provider[];
    rent?: Provider[];
    buy?: Provider[];
  };
}

interface Provider {
  id: number;
  name: string;
  logo_url: string | null;
}

interface MovieDetailsModalProps {
  movie: MovieDetails | null;
  loading?: boolean;
  onClose: () => void;
  onRateSuccess?: (movieId: number, rating: number) => void | Promise<void>;
}

const FALLBACK_POSTER = "https://via.placeholder.com/500x750?text=No+Image";

function formatRuntime(runtime?: number) {
  if (!runtime || runtime <= 0) {
    return null;
  }

  const hours = Math.floor(runtime / 60);
  const minutes = runtime % 60;
  if (hours <= 0) {
    return `${minutes} min`;
  }

  return `${hours}h${String(minutes).padStart(2, "0")}`;
}

function formatReleaseYear(releaseDate?: string) {
  if (!releaseDate) {
    return null;
  }

  return releaseDate.slice(0, 4);
}

function ProviderRow({
  title,
  providers,
}: {
  title: string;
  providers?: Provider[];
}) {
  if (!providers?.length) {
    return null;
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">{title}</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {providers.map((provider) => (
          <div
            key={`${title}-${provider.id}`}
            className="flex min-w-[96px] flex-shrink-0 items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.03] px-2.5 py-2"
          >
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-gray-900">
              {provider.logo_url ? (
                <img
                  src={provider.logo_url}
                  alt={provider.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Tv2 className="h-4 w-4 text-gray-500" />
              )}
            </div>
            <span className="line-clamp-2 text-xs font-medium text-gray-100">{provider.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MovieDetailsModal({
  movie,
  loading = false,
  onClose,
  onRateSuccess,
}: MovieDetailsModalProps) {
  const router = useRouter();
  const [showPlaylistSelector, setShowPlaylistSelector] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);

  useEffect(() => {
    setShowPlaylistSelector(false);
    setPlaylists([]);
    setError("");
    setSubmitting(false);
    setSelectedRating(null);
  }, [movie?.id]);

  useEffect(() => {
    if (!movie?.id) {
      setSelectedRating(null);
      return;
    }

    const token = getStoredToken();
    if (!token) {
      setSelectedRating(null);
      return;
    }

    let isActive = true;

    void fetch(`${API_URL}/movies/user-rating/${movie.id}`, {
      headers: buildAuthHeaders(token),
    })
      .then(async (res) => {
        if (res.status === 401) {
          return { rating: null };
        }
        if (!res.ok) {
          throw new Error("Impossible de relire la note");
        }
        return res.json();
      })
      .then((payload) => {
        if (!isActive) {
          return;
        }
        const nextRating =
          typeof payload?.rating === "number" ? Number(payload.rating) : null;
        setSelectedRating(nextRating);
      })
      .catch(() => {
        if (!isActive) {
          return;
        }
        setSelectedRating(null);
      });

    return () => {
      isActive = false;
    };
  }, [movie?.id]);

  const redirectToLogin = () => {
    clearStoredSession();
    router.push("/login");
  };

  const getTokenOrRedirect = () => {
    const token = getStoredToken();
    if (!token) {
      redirectToLogin();
      return null;
    }

    return token;
  };

  const openPlaylistSelector = async () => {
    const token = getTokenOrRedirect();
    if (!token) {
      return;
    }

    try {
      const res = await fetch(`${API_URL}/playlists`, {
        headers: buildAuthHeaders(token),
      });

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      const data = await res.json();
      if (!Array.isArray(data)) {
        throw new Error("Réponse invalide pour les playlists");
      }

      setPlaylists(data.filter(canAddToPlaylist));
      setShowPlaylistSelector(true);
      setError("");
    } catch (playlistError) {
      console.error(playlistError);
      setError("Impossible de charger les playlists.");
    }
  };

  const addToPlaylist = async (playlistId: number) => {
    if (!movie || submitting) {
      return;
    }

    const token = getTokenOrRedirect();
    if (!token) {
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(`${API_URL}/playlists/${playlistId}/add/${movie.id}`, {
        method: "POST",
        headers: buildAuthHeaders(token),
      });

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.detail ?? "Impossible d'ajouter ce film");
      }

      setShowPlaylistSelector(false);
      setError("");
    } catch (playlistError) {
      console.error(playlistError);
      setError(playlistError instanceof Error ? playlistError.message : "Ajout impossible.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitRating = async (rating: number) => {
    if (!movie || submitting) {
      return;
    }

    const token = getTokenOrRedirect();
    if (!token) {
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(`${API_URL}/movies/rate/${movie.id}/${rating}`, {
        method: "POST",
        headers: buildAuthHeaders(token),
      });

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.detail ?? "Impossible d'enregistrer cette note");
      }

      setSelectedRating(rating);
      setError("");
      await Promise.resolve(onRateSuccess?.(movie.id, rating));
    } catch (rateError) {
      console.error(rateError);
      setError(rateError instanceof Error ? rateError.message : "Note impossible.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!loading && !movie) {
    return null;
  }

  const releaseYear = formatReleaseYear(movie?.release_date);
  const runtimeLabel = formatRuntime(movie?.runtime);
  const hasProviders =
    !!movie?.watch_providers?.subscription?.length ||
    !!movie?.watch_providers?.rent?.length ||
    !!movie?.watch_providers?.buy?.length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/90 p-0 backdrop-blur-sm md:items-center md:p-4">
      {loading && !movie ? (
        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-gray-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement du film...
        </div>
      ) : movie ? (
        <div className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[30px] border border-gray-800 bg-gray-950 shadow-2xl md:max-h-[85vh] md:rounded-3xl">
          {!showPlaylistSelector ? (
            <>
              <button
                onClick={onClose}
                className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-1.5 transition hover:bg-red-600"
                aria-label="Fermer"
              >
                <X className="h-5 w-5 text-white" />
              </button>

              <div className="aspect-video bg-black">
                {movie.trailer_url ? (
                  <iframe
                    src={movie.trailer_url}
                    className="h-full w-full"
                    allowFullScreen
                    title={movie.title}
                  />
                ) : (
                  <img
                    src={movie.poster_url || FALLBACK_POSTER}
                    alt={movie.title}
                    className="h-full w-full object-cover opacity-70"
                  />
                )}
              </div>

              <div className="space-y-5 p-5">
                <div className="space-y-3">
                  <h2 className="text-2xl font-black">{movie.title}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                    {releaseYear ? <span>{releaseYear}</span> : null}
                    {runtimeLabel ? <span>{runtimeLabel}</span> : null}
                    <span className="flex items-center text-yellow-400">
                      <Star className="mr-1 h-3 w-3 fill-current" />
                      {movie.rating.toFixed(1)}
                    </span>
                    {movie.directors?.length ? (
                      <span className="text-gray-300">De {movie.directors.join(", ")}</span>
                    ) : null}
                  </div>
                  {movie.tagline ? (
                    <p className="text-sm italic leading-relaxed text-gray-300/80">{movie.tagline}</p>
                  ) : null}
                  {movie.genres?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {movie.genres.map((genre) => (
                        <span
                          key={genre}
                          className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold text-gray-200"
                        >
                          {genre}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {movie.recommendation_reason ? (
                    <div className="inline-flex max-w-full rounded-full border border-emerald-900/50 bg-emerald-950/40 px-3 py-1 text-[11px] font-semibold text-emerald-100">
                      <span className="truncate">Pourquoi ce film : {movie.recommendation_reason}</span>
                    </div>
                  ) : null}
                </div>

                {error && (
                  <div className="rounded-2xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-100">
                    {error}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => void openPlaylistSelector()}
                    disabled={submitting}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3 text-sm font-bold transition hover:bg-blue-500 disabled:opacity-60"
                  >
                    <ListPlus className="h-4 w-4" />
                    Playlist
                  </button>
                  <button
                    onClick={() => router.push(buildMessageShareHref(movie))}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-amber-700 bg-amber-950/60 py-3 text-sm font-bold text-amber-100 transition hover:bg-amber-700"
                  >
                    <Share2 className="h-4 w-4" />
                    Partager
                  </button>
                </div>

                <div className="space-y-3 rounded-[26px] border border-white/8 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Ta note</p>
                      <p className="text-xs text-gray-400">Même système que sur le Tinder</p>
                    </div>
                    {selectedRating ? (
                      <div className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-3 py-1 text-xs font-semibold text-yellow-200">
                        {selectedRating.toFixed(1)} / 5
                      </div>
                    ) : null}
                  </div>
                  <div className="flex justify-between gap-1.5 sm:gap-2">
                    {[1, 2, 3, 4, 5].map((starIndex) => {
                      const activeRating = selectedRating ?? 0;
                      const fillRatio = Math.max(0, Math.min(1, activeRating - (starIndex - 1)));

                      return (
                        <div key={starIndex} className="relative h-11 w-11 sm:h-12 sm:w-12">
                          <Star className="h-11 w-11 text-gray-700 sm:h-12 sm:w-12" />
                          <div
                            className="pointer-events-none absolute inset-0 overflow-hidden"
                            style={{ width: `${fillRatio * 100}%` }}
                          >
                            <Star className="h-11 w-11 fill-current text-yellow-400 sm:h-12 sm:w-12" />
                          </div>
                          <button
                            type="button"
                            onClick={() => void submitRating(starIndex - 0.5)}
                            disabled={submitting}
                            className="absolute inset-y-0 left-0 w-1/2"
                            aria-label={`Noter ${starIndex - 0.5} sur 5`}
                          />
                          <button
                            type="button"
                            onClick={() => void submitRating(starIndex)}
                            disabled={submitting}
                            className="absolute inset-y-0 right-0 w-1/2"
                            aria-label={`Noter ${starIndex} sur 5`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <p className="text-sm leading-relaxed text-gray-300">{movie.overview}</p>

                <div className="space-y-3 rounded-[26px] border border-white/8 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Ou le regarder</p>
                      <p className="text-xs text-gray-400">
                        {movie.watch_providers?.region
                          ? `Disponibilites TMDB pour ${movie.watch_providers.region}`
                          : "Disponibilites en cours de recuperation"}
                      </p>
                    </div>
                    {movie.watch_providers?.link ? (
                      <a
                        href={movie.watch_providers.link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-gray-200 transition hover:bg-white/10"
                      >
                        <PlaySquare className="h-3.5 w-3.5" />
                        Voir
                      </a>
                    ) : null}
                  </div>

                  {hasProviders ? (
                    <div className="space-y-4">
                      <ProviderRow title="Abonnement" providers={movie.watch_providers?.subscription} />
                      <ProviderRow title="Location" providers={movie.watch_providers?.rent} />
                      <ProviderRow title="Achat" providers={movie.watch_providers?.buy} />
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed text-gray-400">
                      Aucune plateforme n&apos;est disponible pour le moment sur TMDB pour ce film.
                    </p>
                  )}
                </div>

                <div className="flex gap-3 overflow-x-auto pb-2">
                  {movie.cast?.map((actor) => (
                    <div key={`${actor.name}-${actor.character}`} className="w-16 flex-shrink-0 text-center">
                      <img
                        src={actor.photo || "https://via.placeholder.com/100"}
                        alt={actor.name}
                        className="mx-auto mb-2 h-12 w-12 rounded-full border border-gray-800 object-cover"
                      />
                      <p className="truncate text-[10px] font-medium">{actor.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="p-6">
              <div className="mb-6 flex items-center gap-3">
                <button
                  onClick={() => setShowPlaylistSelector(false)}
                  className="rounded-full p-1 transition hover:bg-gray-800"
                  aria-label="Retour"
                >
                  <X className="h-5 w-5" />
                </button>
                <h3 className="text-lg font-bold">Ajouter a une playlist</h3>
              </div>

              {error && (
                <div className="mb-4 rounded-2xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-100">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                {playlists.map((playlist) => (
                  <button
                    key={playlist.id}
                    onClick={() => void addToPlaylist(playlist.id)}
                    disabled={submitting}
                    className="flex w-full items-center justify-between rounded-2xl bg-gray-900 px-4 py-4 text-left transition hover:bg-gray-800 disabled:opacity-60"
                  >
                    <span className="font-medium">{playlist.name}</span>
                    {playlist.system_key === "watch-later" ? (
                      <Clock className="h-4 w-4 text-blue-400" />
                    ) : (
                      <ListPlus className="h-4 w-4 text-gray-500" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

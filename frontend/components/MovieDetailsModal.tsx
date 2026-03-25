"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Heart, ListPlus, Loader2, Share2, Star, X } from "lucide-react";
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
}

interface MovieDetailsModalProps {
  movie: MovieDetails | null;
  loading?: boolean;
  onClose: () => void;
  onLikeSuccess?: () => void;
}

const FALLBACK_POSTER = "https://via.placeholder.com/500x750?text=No+Image";

export default function MovieDetailsModal({
  movie,
  loading = false,
  onClose,
  onLikeSuccess,
}: MovieDetailsModalProps) {
  const router = useRouter();
  const [showPlaylistSelector, setShowPlaylistSelector] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setShowPlaylistSelector(false);
    setPlaylists([]);
    setError("");
    setSubmitting(false);
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

  const rateAsLiked = async () => {
    if (!movie || submitting) {
      return;
    }

    const token = getTokenOrRedirect();
    if (!token) {
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(`${API_URL}/movies/rate/${movie.id}/5`, {
        method: "POST",
        headers: buildAuthHeaders(token),
      });

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.detail ?? "Impossible d'enregistrer ce like");
      }

      setError("");
      onLikeSuccess?.();
      onClose();
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
                <div>
                  <h2 className="text-2xl font-black">{movie.title}</h2>
                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                    <span>{movie.release_date}</span>
                    <span className="flex items-center text-yellow-400">
                      <Star className="mr-1 h-3 w-3 fill-current" />
                      {movie.rating.toFixed(1)}
                    </span>
                  </div>
                  {movie.recommendation_reason ? (
                    <div className="mt-3 inline-flex max-w-full rounded-full border border-emerald-900/50 bg-emerald-950/40 px-3 py-1 text-[11px] font-semibold text-emerald-100">
                      <span className="truncate">{movie.recommendation_reason}</span>
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
                    onClick={() => void rateAsLiked()}
                    disabled={submitting}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-emerald-700 bg-emerald-950/60 py-3 text-sm font-bold text-emerald-100 transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <Heart className="h-4 w-4" />
                    J&apos;adore
                  </button>
                  <button
                    onClick={() => router.push(buildMessageShareHref(movie))}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-amber-700 bg-amber-950/60 py-3 text-sm font-bold text-amber-100 transition hover:bg-amber-700"
                  >
                    <Share2 className="h-4 w-4" />
                    Partager
                  </button>
                </div>

                <p className="text-sm leading-relaxed text-gray-300">{movie.overview}</p>

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

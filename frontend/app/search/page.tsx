"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Heart, ListPlus, Search, Share2, Star, X } from "lucide-react";
import { API_URL } from "@/config";
import { buildAuthHeaders, getStoredToken } from "@/lib/auth";
import { canAddToPlaylist, type PlaylistSummary } from "@/lib/playlists";
import { buildMessageShareHref } from "@/lib/movie-share";

interface MovieDetail {
  id: number;
  title: string;
  poster_url: string;
  rating: number;
  overview?: string;
  trailer_url?: string;
  cast?: { name: string; character: string; photo: string | null }[];
  release_date?: string;
}

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MovieDetail[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<MovieDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPlaylistSelector, setShowPlaylistSelector] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [error, setError] = useState("");

  const redirectToLogin = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
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

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/search?query=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch (searchError) {
      console.error(searchError);
      setError("Impossible de lancer la recherche.");
    } finally {
      setLoading(false);
    }
  };

  const openDetails = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/movie/${id}`);
      const data = await res.json();
      setSelectedMovie(data);
      setShowPlaylistSelector(false);
      setError("");
    } catch (detailError) {
      console.error(detailError);
      setError("Impossible de charger les détails de ce film.");
    }
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
    } catch (playlistError) {
      console.error(playlistError);
      setError("Impossible de charger les playlists.");
    }
  };

  const addToSpecificPlaylist = async (playlistId: number) => {
    if (!selectedMovie) {
      return;
    }

    const token = getTokenOrRedirect();
    if (!token) {
      return;
    }

    try {
      const res = await fetch(`${API_URL}/playlists/${playlistId}/add/${selectedMovie.id}`, {
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
    }
  };

  const rateAsLiked = async () => {
    if (!selectedMovie) {
      return;
    }

    const token = getTokenOrRedirect();
    if (!token) {
      return;
    }

    try {
      const res = await fetch(`${API_URL}/movies/rate/${selectedMovie.id}/5`, {
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
    } catch (rateError) {
      console.error(rateError);
      setError(rateError instanceof Error ? rateError.message : "Note impossible.");
    }
  };

  return (
    <main className="min-h-screen bg-black p-4 pb-24 text-white">
      <div className="sticky top-0 z-10 mb-2 bg-black/95 py-2">
        <form onSubmit={handleSearch} className="relative mx-auto max-w-lg">
          <input
            type="text"
            placeholder="Rechercher un film..."
            className="w-full rounded-lg border border-gray-800 bg-gray-900 px-10 py-3 text-sm text-white transition-colors focus:border-red-600 focus:outline-none"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
        </form>
      </div>

      {error && (
        <div className="mx-auto mb-4 max-w-lg rounded-2xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}

      {loading ? (
        <p className="mt-10 text-center text-gray-500">Recherche en cours...</p>
      ) : (
        <div className="grid grid-cols-3 gap-3 md:grid-cols-5 lg:grid-cols-7">
          {results.map((movie) => (
            <button
              key={movie.id}
              onClick={() => void openDetails(movie.id)}
              className="group relative cursor-pointer text-left"
            >
              <div className="aspect-[2/3] overflow-hidden rounded-lg border border-gray-800">
                <img
                  src={movie.poster_url || "https://via.placeholder.com/500x750?text=No+Image"}
                  alt={movie.title}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                />
              </div>
              <h3 className="mt-1 truncate text-[10px] font-bold text-gray-300 group-hover:text-white md:text-xs">
                {movie.title}
              </h3>
            </button>
          ))}
        </div>
      )}

      {selectedMovie && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
          <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl">
            {!showPlaylistSelector ? (
              <>
                <button
                  onClick={() => setSelectedMovie(null)}
                  className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-1.5 transition hover:bg-red-600"
                >
                  <X className="h-5 w-5 text-white" />
                </button>

                <div className="aspect-video w-full bg-black">
                  {selectedMovie.trailer_url ? (
                    <iframe
                      src={selectedMovie.trailer_url}
                      className="h-full w-full"
                      allowFullScreen
                      title={selectedMovie.title}
                    />
                  ) : (
                    <img
                      src={selectedMovie.poster_url || "https://via.placeholder.com/500"}
                      alt={selectedMovie.title}
                      className="h-full w-full object-cover opacity-60"
                    />
                  )}
                </div>

                <div className="p-5">
                  <h2 className="mb-1 text-xl font-bold">{selectedMovie.title}</h2>
                  <div className="mb-4 flex items-center gap-2 text-xs text-gray-400">
                    <span>{selectedMovie.release_date}</span>
                    <span className="flex items-center text-yellow-400">
                      <Star className="mr-1 h-3 w-3 fill-current" />
                      {selectedMovie.rating.toFixed(1)}
                    </span>
                  </div>

                  <div className="mb-4 flex gap-2">
                    <button
                      onClick={() => void openPlaylistSelector()}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 text-sm font-bold transition hover:bg-blue-500"
                    >
                      <ListPlus className="h-4 w-4" />
                      Playlist
                    </button>
                    <button
                      onClick={() => void rateAsLiked()}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-700 bg-gray-800 py-2 text-sm font-bold transition hover:bg-green-600"
                    >
                      <Heart className="h-4 w-4" />
                      J&apos;adore
                    </button>
                    <button
                      onClick={() => router.push(buildMessageShareHref(selectedMovie))}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-amber-700 bg-amber-950/60 py-2 text-sm font-bold text-amber-100 transition hover:bg-amber-700"
                    >
                      <Share2 className="h-4 w-4" />
                      Partager
                    </button>
                  </div>

                  <p className="mb-6 text-sm leading-relaxed text-gray-300">{selectedMovie.overview}</p>

                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {selectedMovie.cast?.map((actor) => (
                      <div key={`${actor.name}-${actor.character}`} className="w-16 flex-shrink-0 text-center">
                        <img
                          src={actor.photo || "https://via.placeholder.com/100"}
                          alt={actor.name}
                          className="mx-auto mb-1 h-12 w-12 rounded-full border border-gray-700 object-cover"
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
                    className="rounded p-1 transition hover:bg-gray-800"
                  >
                    <X className="h-5 w-5" />
                  </button>
                  <h3 className="text-lg font-bold">Ajouter a...</h3>
                </div>
                <div className="space-y-2">
                  {playlists.length === 0 && (
                    <p className="text-center text-sm text-gray-500">Aucune playlist disponible.</p>
                  )}

                  {playlists.map((playlist) => (
                    <button
                      key={playlist.id}
                      onClick={() => void addToSpecificPlaylist(playlist.id)}
                      className="flex w-full items-center justify-between rounded-xl bg-gray-800 p-4 transition hover:bg-gray-700"
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
        </div>
      )}
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, ListPlus, Share2, Star, X } from "lucide-react";
import { API_URL } from "@/config";
import { buildAuthHeaders, getStoredToken } from "@/lib/auth";
import { canAddToPlaylist, type PlaylistSummary } from "@/lib/playlists";
import { buildMessageShareHref } from "@/lib/movie-share";

interface Movie {
  id: number;
  title: string;
  poster_url: string;
  rating: number;
  overview?: string;
}

interface MovieDetail extends Movie {
  trailer_url?: string;
  cast?: { name: string; character: string; photo: string | null }[];
  release_date?: string;
}

export default function NewsPage() {
  const router = useRouter();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMovie, setSelectedMovie] = useState<MovieDetail | null>(null);
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

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const res = await fetch(`${API_URL}/movies/news`);
        const data = await res.json();
        setMovies(Array.isArray(data) ? data : []);
      } catch (fetchError) {
        console.error(fetchError);
        setError("Impossible de charger les sorties du moment.");
      } finally {
        setLoading(false);
      }
    };

    void fetchNews();
  }, []);

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

  const addToPlaylist = async (playlistId: number) => {
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

  return (
    <main className="min-h-screen bg-black p-4 pb-24 text-white">
      <h1 className="mb-6 text-2xl font-bold tracking-tighter text-red-600">A l&apos;affiche</h1>

      {error && (
        <div className="mx-auto mb-4 max-w-lg rounded-2xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}

      {loading ? (
        <p className="mt-10 text-center text-gray-500">Chargement des sorties...</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
          {movies.map((movie) => (
            <button
              key={movie.id}
              onClick={() => void openDetails(movie.id)}
              className="group cursor-pointer text-left"
            >
              <div className="relative mb-2 aspect-[2/3] overflow-hidden rounded-xl border border-gray-800">
                <img
                  src={movie.poster_url}
                  alt={movie.title}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                />
                <div className="absolute right-2 top-2 flex items-center rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-yellow-400 backdrop-blur-sm">
                  <Star className="mr-1 h-3 w-3 fill-current" />
                  {movie.rating.toFixed(1)}
                </div>
              </div>
              <h3 className="text-sm font-bold leading-tight text-gray-200 transition-colors group-hover:text-white">
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
                  <X className="h-5 w-5" />
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
                      src={selectedMovie.poster_url}
                      alt={selectedMovie.title}
                      className="h-full w-full object-cover opacity-60"
                    />
                  )}
                </div>

                <div className="p-6">
                  <h2 className="mb-2 text-2xl font-bold">{selectedMovie.title}</h2>
                  <div className="mb-6 flex gap-3 text-xs text-gray-400">
                    <span>{selectedMovie.release_date}</span>
                    <span className="flex items-center text-yellow-400">
                      <Star className="mr-1 h-3 w-3 fill-current" />
                      {selectedMovie.rating}
                    </span>
                  </div>

                  <div className="mb-6 flex gap-2">
                    <button
                      onClick={() => void openPlaylistSelector()}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-bold transition hover:bg-blue-500"
                    >
                      <ListPlus className="h-5 w-5" />
                      Ajouter a une liste
                    </button>
                    <button
                      onClick={() => router.push(buildMessageShareHref(selectedMovie))}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-700 bg-amber-950/60 py-3 font-bold text-amber-100 transition hover:bg-amber-700"
                    >
                      <Share2 className="h-5 w-5" />
                      Partager
                    </button>
                  </div>

                  <p className="mb-6 text-sm leading-relaxed text-gray-300">{selectedMovie.overview}</p>

                  <div className="flex gap-4 overflow-x-auto pb-4">
                    {selectedMovie.cast?.map((actor) => (
                      <div key={`${actor.name}-${actor.character}`} className="w-16 flex-shrink-0 text-center">
                        <img
                          src={actor.photo || ""}
                          alt={actor.name}
                          className="mx-auto mb-2 h-14 w-14 rounded-full border border-gray-700 object-cover"
                        />
                        <p className="truncate text-[10px] text-gray-400">{actor.name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="p-6">
                <div className="mb-6 flex items-center gap-3">
                  <button onClick={() => setShowPlaylistSelector(false)}>
                    <X className="h-5 w-5" />
                  </button>
                  <h3 className="text-lg font-bold">Choisir une playlist</h3>
                </div>
                <div className="space-y-2">
                  {playlists.map((playlist) => (
                    <button
                      key={playlist.id}
                      onClick={() => void addToPlaylist(playlist.id)}
                      className="flex w-full items-center justify-between rounded-xl bg-gray-800 p-4 transition hover:bg-gray-700"
                    >
                      <span className="font-medium">{playlist.name}</span>
                      {playlist.system_key === "watch-later" && (
                        <Clock className="h-4 w-4 text-blue-400" />
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

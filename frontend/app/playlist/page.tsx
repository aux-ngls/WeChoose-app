"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, Film, Folder, Plus, Star, X } from "lucide-react";
import { API_URL } from "@/config";
import { buildAuthHeaders, clearStoredSession, getStoredToken } from "@/lib/auth";
import {
  FAVORITES_PLAYLIST_ID,
  HISTORY_PLAYLIST_ID,
  WATCH_LATER_PLAYLIST_ID,
  type PlaylistSummary,
} from "@/lib/playlists";
import MobilePageHeader from "@/components/MobilePageHeader";

interface Movie {
  id: number;
  title: string;
  poster_url: string;
  rating: number;
  overview?: string;
  trailer_url?: string;
  cast?: { name: string; character: string; photo: string | null }[];
  release_date?: string;
}

export default function PlaylistsPage() {
  const router = useRouter();
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistSummary | null>(null);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const fetchPlaylists = async () => {
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

      setPlaylists(data);
      setError("");
    } catch (fetchError) {
      console.error(fetchError);
      setError("Impossible de charger les playlists.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPlaylists();
  }, []);

  const openPlaylist = async (playlist: PlaylistSummary) => {
    const token = getTokenOrRedirect();
    if (!token) {
      return;
    }

    try {
      const res = await fetch(`${API_URL}/playlists/${playlist.id}`, {
        headers: buildAuthHeaders(token),
      });

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      const data = await res.json();
      if (!Array.isArray(data)) {
        throw new Error("Réponse invalide pour le contenu de la playlist");
      }

      setSelectedPlaylist(playlist);
      setMovies(data);
      setError("");
    } catch (openError) {
      console.error(openError);
      setError("Impossible d'ouvrir cette playlist.");
    }
  };

  const createPlaylist = async () => {
    const playlistName = newPlaylistName.trim();
    if (!playlistName) {
      return;
    }

    const token = getTokenOrRedirect();
    if (!token) {
      return;
    }

    try {
      const res = await fetch(`${API_URL}/playlists/create`, {
        method: "POST",
        headers: new Headers({
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        }),
        body: JSON.stringify({ name: playlistName }),
      });

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.detail ?? "Création impossible");
      }

      setNewPlaylistName("");
      setShowCreate(false);
      await fetchPlaylists();
      setError("");
    } catch (createError) {
      console.error(createError);
      setError(createError instanceof Error ? createError.message : "Création impossible.");
    }
  };

  const openDetails = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/movie/${id}`);
      const data = await res.json();
      setSelectedMovie(data);
    } catch (detailError) {
      console.error(detailError);
      setError("Impossible de charger les détails de ce film.");
    }
  };

  const getIcon = (playlist: PlaylistSummary) => {
    if (playlist.id === WATCH_LATER_PLAYLIST_ID) {
      return <Clock className="text-blue-500" />;
    }
    if (playlist.id === FAVORITES_PLAYLIST_ID) {
      return <Star className="text-yellow-500" />;
    }
    if (playlist.id === HISTORY_PLAYLIST_ID) {
      return <Film className="text-gray-500" />;
    }
    return <Folder className="text-white" />;
  };

  return (
    <main className="min-h-screen bg-black px-4 pb-24 pt-3 text-white md:p-4 md:pb-24">
      <MobilePageHeader
        title={selectedPlaylist ? selectedPlaylist.name : "Mes listes"}
        subtitle={selectedPlaylist ? `${movies.length} films dans cette liste` : "Organise tes films par envies"}
        icon={selectedPlaylist ? Film : Folder}
        accent="sky"
        trailing={
          !selectedPlaylist ? (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white"
              aria-label="Nouvelle liste"
            >
              <Plus className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSelectedPlaylist(null);
                setMovies([]);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white"
              aria-label="Retour aux listes"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )
        }
      />

      {!selectedPlaylist ? (
        <>
          <h1 className="mb-6 hidden text-center text-2xl font-bold md:block">Mes Listes</h1>

          {error && (
            <div className="mx-auto mb-4 max-w-md rounded-2xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}

          {loading ? (
            <p className="mt-16 text-center text-gray-500">Chargement des playlists...</p>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex w-full items-center gap-3 rounded-[24px] border border-dashed border-white/15 bg-[linear-gradient(145deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-4 text-left shadow-[0_16px_34px_rgba(0,0,0,0.28)] transition active:scale-[0.99]"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/12 text-sky-200">
                    <Plus className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-base font-bold text-white">Nouvelle liste</div>
                    <div className="mt-1 text-xs text-gray-400">Cree une nouvelle collection perso</div>
                  </div>
                </button>

                {playlists.map((playlist) => (
                  <button
                    key={playlist.id}
                    onClick={() => void openPlaylist(playlist)}
                    className="flex w-full items-center gap-3 rounded-[24px] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-4 text-left shadow-[0_16px_34px_rgba(0,0,0,0.28)] transition active:scale-[0.99]"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.06]">
                      {getIcon(playlist)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-bold text-white">{playlist.name}</div>
                      <div className="mt-1 text-xs text-gray-500">Ouvrir la liste</div>
                    </div>
                    <ArrowLeft className="h-4 w-4 rotate-180 text-gray-500" />
                  </button>
                ))}
              </div>

              <div className="hidden grid-cols-2 gap-4 md:grid">
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-600 bg-gray-800 p-6 transition hover:bg-gray-700"
                >
                  <Plus className="h-8 w-8 text-gray-400" />
                  <span className="text-xs font-bold text-gray-400">Nouvelle Liste</span>
                </button>

                {playlists.map((playlist) => (
                  <button
                    key={playlist.id}
                    onClick={() => void openPlaylist(playlist)}
                    className="flex flex-col items-center justify-center gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4 text-center transition hover:bg-gray-800"
                  >
                    {getIcon(playlist)}
                    <span className="w-full truncate text-sm font-bold">{playlist.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {showCreate && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
              <div className="w-full max-w-xs rounded-2xl border border-gray-700 bg-gray-900 p-6">
                <h3 className="mb-4 font-bold">Nom de la playlist</h3>
                <input
                  className="mb-4 w-full rounded border border-gray-700 bg-black p-2 text-white"
                  autoFocus
                  value={newPlaylistName}
                  onChange={(event) => setNewPlaylistName(event.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCreate(false)}
                    className="flex-1 rounded bg-gray-700 py-2"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={() => void createPlaylist()}
                    className="flex-1 rounded bg-blue-600 py-2 font-bold"
                  >
                    Creer
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mb-6 hidden items-center gap-4 md:flex">
            <button
              onClick={() => {
                setSelectedPlaylist(null);
                setMovies([]);
              }}
              className="rounded-full bg-gray-800 p-2"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="truncate text-xl font-bold">{selectedPlaylist.name}</h1>
          </div>

          {error && (
            <div className="mx-auto mb-4 max-w-md rounded-2xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}

          {movies.length === 0 ? (
            <p className="mt-20 text-center text-gray-500">Cette liste est vide.</p>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {movies.map((movie) => (
                  <button
                    key={movie.id}
                    onClick={() => void openDetails(movie.id)}
                    className="flex w-full items-center gap-3 rounded-[24px] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-3 text-left shadow-[0_16px_34px_rgba(0,0,0,0.28)] transition active:scale-[0.99]"
                  >
                    <img
                      src={movie.poster_url}
                      alt={movie.title}
                      className="h-24 w-16 rounded-2xl object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-bold text-white">{movie.title}</div>
                      <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-yellow-400/20 bg-yellow-400/10 px-2.5 py-1 text-xs font-semibold text-yellow-300">
                        <Star className="h-3.5 w-3.5 fill-current" />
                        {movie.rating.toFixed(1)}
                      </div>
                      <div className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                        Voir la fiche
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="hidden grid-cols-3 gap-3 md:grid md:grid-cols-4 lg:grid-cols-6">
                {movies.map((movie) => (
                  <button
                    key={movie.id}
                    onClick={() => void openDetails(movie.id)}
                    className="group relative text-left transition-transform hover:scale-105"
                  >
                    <img
                      src={movie.poster_url}
                      alt={movie.title}
                      className="aspect-[2/3] w-full rounded-lg object-cover"
                    />
                    <p className="mt-1 truncate text-[10px] text-gray-400">{movie.title}</p>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {selectedMovie && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/90 p-0 backdrop-blur-sm md:items-center md:p-4">
          <div className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[30px] border border-gray-800 bg-gray-900 md:max-h-[85vh] md:rounded-2xl">
            <button
              onClick={() => setSelectedMovie(null)}
              className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-1.5 transition hover:bg-red-600"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="aspect-video bg-black">
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

            <div className="p-5">
              <h2 className="mb-1 text-xl font-bold">{selectedMovie.title}</h2>
              <div className="mb-4 flex gap-2 text-xs text-gray-400">
                <span>{selectedMovie.release_date}</span>
                <span className="flex items-center text-yellow-400">
                  <Star className="mr-1 h-3 w-3 fill-current" />
                  {selectedMovie.rating}
                </span>
              </div>

              <p className="mb-4 text-sm text-gray-300">{selectedMovie.overview}</p>

              <div className="flex gap-3 overflow-x-auto pb-2">
                {selectedMovie.cast?.map((actor) => (
                  <div key={`${actor.name}-${actor.character}`} className="w-16 flex-shrink-0 text-center">
                    <img
                      src={actor.photo || ""}
                      alt={actor.name}
                      className="mx-auto mb-1 h-12 w-12 rounded-full bg-gray-800 object-cover"
                    />
                    <p className="truncate text-[10px]">{actor.name}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

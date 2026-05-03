"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, Film, Folder, Plus, Star, Trash2 } from "lucide-react";
import { API_URL } from "@/config";
import { buildAuthHeaders, clearStoredSession, getStoredToken } from "@/lib/auth";
import {
  FAVORITES_PLAYLIST_ID,
  HISTORY_PLAYLIST_ID,
  WATCH_LATER_PLAYLIST_ID,
  type PlaylistSummary,
} from "@/lib/playlists";
import MobilePageHeader from "@/components/MobilePageHeader";
import MovieDetailsModal from "@/components/MovieDetailsModal";

interface Movie {
  id: number;
  title: string;
  poster_url: string;
  rating: number;
  primary_genre?: string;
  added_at?: string;
  sort_index?: number;
  overview?: string;
  trailer_url?: string;
  cast?: { name: string; character: string; photo: string | null }[];
  release_date?: string;
}

type SortMode = "genre" | "recent" | "oldest" | "rating" | "manual";

export default function PlaylistsPage() {
  const router = useRouter();
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistSummary | null>(null);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("genre");
  const [filterQuery, setFilterQuery] = useState("");
  const [removingMovieId, setRemovingMovieId] = useState<number | null>(null);
  const [draggedMovieId, setDraggedMovieId] = useState<number | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const touchDragStateRef = useRef<{
    movieId: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const touchTapStateRef = useRef<{
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const suppressNextTapRef = useRef(false);
  const [requestedPlaylistId, setRequestedPlaylistId] = useState<number | null>(null);

  useEffect(() => {
    const updateRequestedPlaylistId = () => {
      const params = new URLSearchParams(window.location.search);
      const rawPlaylistId = Number(params.get("playlistId") || "");
      setRequestedPlaylistId(Number.isFinite(rawPlaylistId) && rawPlaylistId !== 0 ? rawPlaylistId : null);
    };

    updateRequestedPlaylistId();
    window.addEventListener("popstate", updateRequestedPlaylistId);
    return () => window.removeEventListener("popstate", updateRequestedPlaylistId);
  }, []);

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
      setSortMode(playlist.type === "custom" ? "manual" : playlist.id === WATCH_LATER_PLAYLIST_ID ? "genre" : "recent");
      setFilterQuery("");
      setError("");
      setRequestedPlaylistId(playlist.id);
      router.replace(`/playlist?playlistId=${playlist.id}`, { scroll: false });
    } catch (openError) {
      console.error(openError);
      setError("Impossible d'ouvrir cette playlist.");
    }
  };

  useEffect(() => {
    if (!requestedPlaylistId) {
      return;
    }
    if (!playlists.length || selectedPlaylist?.id === requestedPlaylistId) {
      return;
    }

    const matchingPlaylist = playlists.find((playlist) => playlist.id === requestedPlaylistId);
    if (matchingPlaylist) {
      void openPlaylist(matchingPlaylist);
    }
  }, [playlists, requestedPlaylistId, selectedPlaylist]);

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

  const refreshPlaylistsAfterRating = async () => {
    await fetchPlaylists();
    if (selectedPlaylist) {
      await openPlaylist(selectedPlaylist);
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

  const isWatchLaterSelected = selectedPlaylist?.id === WATCH_LATER_PLAYLIST_ID;
  const canRemoveMovies = Boolean(selectedPlaylist && !selectedPlaylist.readonly);
  const canReorderMovies = selectedPlaylist?.type === "custom" && sortMode === "manual";

  const sortedMovies = [...movies].sort((left, right) => {
    if (sortMode === "manual") {
      return Number(left.sort_index ?? Number.MAX_SAFE_INTEGER) - Number(right.sort_index ?? Number.MAX_SAFE_INTEGER);
    }

    if (sortMode === "rating") {
      return right.rating - left.rating;
    }

    if (sortMode === "oldest") {
      return String(left.added_at || "").localeCompare(String(right.added_at || ""));
    }

    if (sortMode === "recent") {
      return String(right.added_at || "").localeCompare(String(left.added_at || ""));
    }

    const genreCompare = String(left.primary_genre || "Autres").localeCompare(
      String(right.primary_genre || "Autres"),
      "fr",
    );
    if (genreCompare !== 0) {
      return genreCompare;
    }
    return String(left.title).localeCompare(String(right.title), "fr");
  });

  const filteredMovies = sortedMovies.filter((movie) =>
    movie.title.toLowerCase().includes(filterQuery.trim().toLowerCase()),
  );

  const movieGroups =
    sortMode === "genre"
      ? filteredMovies.reduce<Array<{ genre: string; movies: Movie[] }>>((groups, movie) => {
          const genre = movie.primary_genre || "Autres";
          const existingGroup = groups.find((group) => group.genre === genre);
          if (existingGroup) {
            existingGroup.movies.push(movie);
          } else {
            groups.push({ genre, movies: [movie] });
          }
          return groups;
        }, [])
      : [{ genre: "", movies: filteredMovies }];

  const removeMovieFromPlaylist = async (movieId: number) => {
    if (!selectedPlaylist || selectedPlaylist.readonly) {
      return;
    }

    if (!window.confirm("Retirer ce film de la playlist ?")) {
      return;
    }

    const token = getTokenOrRedirect();
    if (!token) {
      return;
    }

    setRemovingMovieId(movieId);

    try {
      const res = await fetch(`${API_URL}/playlists/${selectedPlaylist.id}/remove/${movieId}`, {
        method: "DELETE",
        headers: buildAuthHeaders(token),
      });

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.detail ?? "Suppression impossible");
      }

      setMovies((current) => current.filter((movie) => movie.id !== movieId));
      setSelectedMovie((current) => (current?.id === movieId ? null : current));
      setError("");
    } catch (removeError) {
      console.error(removeError);
      setError(removeError instanceof Error ? removeError.message : "Suppression impossible.");
    } finally {
      setRemovingMovieId(null);
    }
  };

  const persistManualOrder = async (nextMovies: Movie[]) => {
    if (!selectedPlaylist || selectedPlaylist.type !== "custom") {
      return;
    }

    const token = getTokenOrRedirect();
    if (!token) {
      return;
    }

    setSavingOrder(true);

    try {
      const res = await fetch(`${API_URL}/playlists/${selectedPlaylist.id}/reorder`, {
        method: "POST",
        headers: new Headers({
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        }),
        body: JSON.stringify({ movie_ids: nextMovies.map((movie) => movie.id) }),
      });

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.detail ?? "Reorganisation impossible");
      }

      setError("");
    } catch (reorderError) {
      console.error(reorderError);
      setError(reorderError instanceof Error ? reorderError.message : "Reorganisation impossible.");
    } finally {
      setSavingOrder(false);
    }
  };

  const moveMovieBefore = (targetMovieId: number) => {
    if (!canReorderMovies || draggedMovieId === null || draggedMovieId === targetMovieId) {
      return;
    }

    const currentIndex = movies.findIndex((movie) => movie.id === draggedMovieId);
    const targetIndex = movies.findIndex((movie) => movie.id === targetMovieId);
    if (currentIndex < 0 || targetIndex < 0) {
      return;
    }

    const nextMovies = [...movies];
    const [draggedMovie] = nextMovies.splice(currentIndex, 1);
    nextMovies.splice(targetIndex, 0, draggedMovie);
    const normalizedMovies = nextMovies.map((movie, index) => ({ ...movie, sort_index: index + 1 }));
    setMovies(normalizedMovies);
    void persistManualOrder(normalizedMovies);
  };

  const startTouchDrag = (movieId: number, clientX: number, clientY: number) => {
    if (!canReorderMovies) {
      return;
    }

    touchDragStateRef.current = {
      movieId,
      startX: clientX,
      startY: clientY,
      moved: false,
    };
    setDraggedMovieId(movieId);
  };

  const updateTouchDrag = (clientX: number, clientY: number) => {
    const state = touchDragStateRef.current;
    if (!state) {
      return false;
    }

    const deltaX = clientX - state.startX;
    const deltaY = clientY - state.startY;
    if (!state.moved && Math.hypot(deltaX, deltaY) > 10) {
      state.moved = true;
    }

    return state.moved;
  };

  const finishTouchDrag = (clientX: number, clientY: number) => {
    const state = touchDragStateRef.current;
    touchDragStateRef.current = null;

    if (!state) {
      setDraggedMovieId(null);
      return false;
    }

    if (!state.moved) {
      setDraggedMovieId(null);
      return false;
    }

    const targetElement = document.elementFromPoint(clientX, clientY);
    const dropTarget = targetElement?.closest("[data-playlist-movie-id]");
    const rawTargetMovieId = dropTarget?.getAttribute("data-playlist-movie-id");
    const targetMovieId = rawTargetMovieId ? Number(rawTargetMovieId) : NaN;

    setDraggedMovieId(state.movieId);
    if (Number.isFinite(targetMovieId) && targetMovieId !== state.movieId) {
      moveMovieBefore(targetMovieId);
    }
    suppressNextTapRef.current = true;
    window.setTimeout(() => {
      suppressNextTapRef.current = false;
    }, 250);
    setDraggedMovieId(null);
    return true;
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
                setRequestedPlaylistId(null);
                router.replace("/playlist", { scroll: false });
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
                setRequestedPlaylistId(null);
                router.replace("/playlist", { scroll: false });
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
              <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">
                    Trier
                  </span>
                  <select
                    value={sortMode}
                    onChange={(event) => setSortMode(event.target.value as SortMode)}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white outline-none transition focus:border-sky-500"
                  >
                    {selectedPlaylist.type === "custom" && <option value="manual">Ordre manuel</option>}
                    <option value="genre">Par genre</option>
                    <option value="recent">Ajoutes recemment</option>
                    <option value="oldest">Ajoutes il y a longtemps</option>
                    <option value="rating">Mieux notes</option>
                  </select>
                  {canReorderMovies && (
                    <span className="text-xs text-gray-500">
                      {savingOrder ? "Sauvegarde..." : "Glisse les films pour changer l'ordre"}
                    </span>
                  )}
                </div>

                <input
                  type="text"
                  value={filterQuery}
                  onChange={(event) => setFilterQuery(event.target.value)}
                  placeholder="Filtrer par nom"
                  className="w-full rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white outline-none transition focus:border-sky-500 md:max-w-xs"
                />
              </div>

              <div className="space-y-6">
                {movieGroups.map((group) => (
                  <section key={group.genre || "all"} className="space-y-3">
                    {sortMode === "genre" && (
                      <div className="px-1 text-xs font-semibold uppercase tracking-[0.22em] text-sky-300/80">
                        {group.genre}
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
                      {group.movies.map((movie) => (
                        <div
                          key={movie.id}
                          className="group relative"
                          data-playlist-movie-id={movie.id}
                        >
                          {canRemoveMovies && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void removeMovieFromPlaylist(movie.id);
                              }}
                              disabled={removingMovieId === movie.id}
                              className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-red-500/30 bg-black/70 text-red-200 backdrop-blur transition hover:bg-red-600 hover:text-white disabled:opacity-60"
                              aria-label={`Retirer ${movie.title}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              if (suppressNextTapRef.current) {
                                return;
                              }
                              void openDetails(movie.id);
                            }}
                            draggable={canReorderMovies}
                            onDragStart={() => setDraggedMovieId(movie.id)}
                            onDragOver={(event) => {
                              if (canReorderMovies) {
                                event.preventDefault();
                              }
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              moveMovieBefore(movie.id);
                            }}
                            onDragEnd={() => setDraggedMovieId(null)}
                            onTouchStart={(event) => {
                              const touch = event.touches[0];
                              if (!touch) {
                                return;
                              }
                              touchTapStateRef.current = {
                                startX: touch.clientX,
                                startY: touch.clientY,
                                moved: false,
                              };
                              startTouchDrag(movie.id, touch.clientX, touch.clientY);
                            }}
                            onTouchMove={(event) => {
                              const touch = event.touches[0];
                              if (!touch) {
                                return;
                              }
                              const tapState = touchTapStateRef.current;
                              if (tapState) {
                                if (
                                  Math.abs(touch.clientX - tapState.startX) > 8 ||
                                  Math.abs(touch.clientY - tapState.startY) > 8
                                ) {
                                  tapState.moved = true;
                                }
                              }
                              const moved = updateTouchDrag(touch.clientX, touch.clientY);
                              if (moved) {
                                event.preventDefault();
                              }
                            }}
                            onTouchEnd={(event) => {
                              const touch = event.changedTouches[0];
                              if (!touch) {
                                return;
                              }
                              const moved = finishTouchDrag(touch.clientX, touch.clientY);
                              const tapMoved = touchTapStateRef.current?.moved ?? false;
                              touchTapStateRef.current = null;
                              if (!moved && !tapMoved) {
                                void openDetails(movie.id);
                              }
                            }}
                            onTouchCancel={() => {
                              touchDragStateRef.current = null;
                              touchTapStateRef.current = null;
                              setDraggedMovieId(null);
                            }}
                            className="w-full text-left transition-transform hover:scale-[1.02]"
                          >
                            <img
                              src={movie.poster_url}
                              alt={movie.title}
                              className={`aspect-[2/3] w-full rounded-xl object-cover shadow-[0_12px_28px_rgba(0,0,0,0.28)] ${
                                draggedMovieId === movie.id ? "opacity-50" : ""
                              }`}
                            />
                            <p className="mt-2 truncate text-xs font-semibold text-gray-200">{movie.title}</p>
                            <div className="mt-1 flex items-center gap-1 text-[11px] text-yellow-300">
                              <Star className="h-3.5 w-3.5 fill-current" />
                              {movie.rating.toFixed(1)}
                            </div>
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <MovieDetailsModal
        movie={selectedMovie}
        onClose={() => setSelectedMovie(null)}
        onRateSuccess={() => void refreshPlaylistsAfterRating()}
      />
    </main>
  );
}

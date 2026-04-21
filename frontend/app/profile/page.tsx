"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bookmark,
  Clock3,
  Disc3,
  Film,
  Heart,
  Loader2,
  LogOut,
  Music4,
  Pencil,
  Save,
  Search,
  Sparkles,
  Star,
  Users,
  X,
} from "lucide-react";
import { API_URL } from "@/config";
import { buildAuthHeaders, clearStoredSession, getStoredToken } from "@/lib/auth";
import MobilePageHeader from "@/components/MobilePageHeader";
import SoundtrackPreviewCard from "@/components/SoundtrackPreviewCard";
import { unregisterNativePushToken } from "@/lib/native-app";
import {
  FAVORITES_PLAYLIST_ID,
  HISTORY_PLAYLIST_ID,
  WATCH_LATER_PLAYLIST_ID,
  type PlaylistSummary,
} from "@/lib/playlists";
import {
  FALLBACK_POSTER,
  formatSocialDate,
  type ProfileShowcaseMovie,
  type ProfileShowcasePerson,
  type ProfileShowcaseSoundtrack,
  type SearchMovie,
  type SocialProfile,
} from "@/lib/social";
import { unregisterWebPushSubscription } from "@/lib/web-push";

interface PlaylistMoviePreview {
  id: number;
  title: string;
  poster_url: string;
  rating: number;
}

interface PlaylistWithPreview extends PlaylistSummary {
  count: number;
  preview_movies: PlaylistMoviePreview[];
}

interface ProfilePreferencesResponse {
  profile_genres: string[];
  profile_people: ProfileShowcasePerson[];
  profile_movie_ids: number[];
  profile_movies: ProfileShowcaseMovie[];
  profile_soundtrack: ProfileShowcaseSoundtrack | null;
}

const PLAYLIST_ORDER = [
  WATCH_LATER_PLAYLIST_ID,
  FAVORITES_PLAYLIST_ID,
  HISTORY_PLAYLIST_ID,
] as const;

const COMMON_GENRES = [
  "Action",
  "Aventure",
  "Animation",
  "Comedie",
  "Crime",
  "Documentaire",
  "Drame",
  "Fantastique",
  "Horreur",
  "Mystere",
  "Romance",
  "Science-fiction",
  "Thriller",
] as const;

function sortPlaylists(playlists: PlaylistSummary[]): PlaylistSummary[] {
  return [...playlists].sort((left, right) => {
    const leftOrder = PLAYLIST_ORDER.indexOf(left.id as (typeof PLAYLIST_ORDER)[number]);
    const rightOrder = PLAYLIST_ORDER.indexOf(right.id as (typeof PLAYLIST_ORDER)[number]);

    if (leftOrder !== -1 || rightOrder !== -1) {
      if (leftOrder === -1) return 1;
      if (rightOrder === -1) return -1;
      return leftOrder - rightOrder;
    }

    return left.name.localeCompare(right.name, "fr");
  });
}

function getPlaylistTone(playlist: PlaylistSummary): string {
  if (playlist.id === WATCH_LATER_PLAYLIST_ID) return "from-sky-500/18 to-sky-500/4 border-sky-500/20";
  if (playlist.id === FAVORITES_PLAYLIST_ID) return "from-amber-500/18 to-amber-500/4 border-amber-500/20";
  if (playlist.id === HISTORY_PLAYLIST_ID) return "from-zinc-400/14 to-white/4 border-white/10";
  return "from-fuchsia-500/14 to-white/4 border-white/10";
}

function buildPlaylistHref(playlistId: number): string {
  return `/playlist?playlistId=${playlistId}`;
}

function createEmptyShowcase(): ProfilePreferencesResponse {
  return {
    profile_genres: [],
    profile_people: [],
    profile_movie_ids: [],
    profile_movies: [],
    profile_soundtrack: null,
  };
}

export default function ProfilePage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [showcase, setShowcase] = useState<ProfilePreferencesResponse>(createEmptyShowcase());
  const [playlists, setPlaylists] = useState<PlaylistWithPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingShowcase, setEditingShowcase] = useState(false);
  const [draftGenres, setDraftGenres] = useState<string[]>([]);
  const [draftPeople, setDraftPeople] = useState<ProfileShowcasePerson[]>([]);
  const [draftMovies, setDraftMovies] = useState<ProfileShowcaseMovie[]>([]);
  const [draftSoundtrack, setDraftSoundtrack] = useState<ProfileShowcaseSoundtrack | null>(null);
  const [personSearchQuery, setPersonSearchQuery] = useState("");
  const [personSearchResults, setPersonSearchResults] = useState<ProfileShowcasePerson[]>([]);
  const [personSearchLoading, setPersonSearchLoading] = useState(false);
  const [movieSearchQuery, setMovieSearchQuery] = useState("");
  const [movieSearchResults, setMovieSearchResults] = useState<SearchMovie[]>([]);
  const [movieSearchLoading, setMovieSearchLoading] = useState(false);
  const [soundtrackSearchQuery, setSoundtrackSearchQuery] = useState("");
  const [soundtrackSearchResults, setSoundtrackSearchResults] = useState<
    ProfileShowcaseSoundtrack[]
  >([]);
  const [soundtrackSearchLoading, setSoundtrackSearchLoading] = useState(false);
  const [savingShowcase, setSavingShowcase] = useState(false);

  const redirectToLogin = () => {
    clearStoredSession();
    router.push("/login");
  };

  const handleLogout = async () => {
    const token = getStoredToken();
    await unregisterWebPushSubscription(token);
    await unregisterNativePushToken();
    clearStoredSession();
    router.push("/login");
  };

  useEffect(() => {
    const storedUsername = localStorage.getItem("username") || "";
    if (!storedUsername) {
      redirectToLogin();
      return;
    }

    setUsername(storedUsername);

    const token = getStoredToken();
    if (!token) {
      redirectToLogin();
      return;
    }

    const fetchProfileData = async () => {
      setLoading(true);
      try {
        const [profileRes, playlistsRes, preferencesRes] = await Promise.all([
          fetch(`${API_URL}/social/profile/${encodeURIComponent(storedUsername)}?limit=8`, {
            headers: buildAuthHeaders(token),
          }),
          fetch(`${API_URL}/playlists`, {
            headers: buildAuthHeaders(token),
          }),
          fetch(`${API_URL}/profile/preferences`, {
            headers: buildAuthHeaders(token),
          }),
        ]);

        if (
          profileRes.status === 401 ||
          playlistsRes.status === 401 ||
          preferencesRes.status === 401
        ) {
          redirectToLogin();
          return;
        }

        const profilePayload = await profileRes.json();
        const playlistsPayload = await playlistsRes.json();
        const preferencesPayload = await preferencesRes.json();

        if (!profileRes.ok) {
          throw new Error(profilePayload?.detail ?? "Impossible de charger ton profil");
        }
        if (!Array.isArray(playlistsPayload)) {
          throw new Error("Impossible de charger tes playlists");
        }
        if (!preferencesRes.ok) {
          throw new Error(preferencesPayload?.detail ?? "Impossible de charger ta vitrine");
        }

        const orderedPlaylists = sortPlaylists(playlistsPayload as PlaylistSummary[]);
        const playlistWithPreview = await Promise.all(
          orderedPlaylists.map(async (playlist) => {
            const res = await fetch(`${API_URL}/playlists/${playlist.id}`, {
              headers: buildAuthHeaders(token),
            });
            if (res.status === 401) {
              redirectToLogin();
              return {
                ...playlist,
                count: 0,
                preview_movies: [],
              };
            }
            const payload = await res.json().catch(() => []);
            const movies = Array.isArray(payload) ? (payload as PlaylistMoviePreview[]) : [];
            return {
              ...playlist,
              count: movies.length,
              preview_movies: movies.slice(0, 6),
            };
          }),
        );

        setProfile(profilePayload as SocialProfile);
        setShowcase(preferencesPayload as ProfilePreferencesResponse);
        setPlaylists(playlistWithPreview);
        setError("");
      } catch (fetchError) {
        console.error(fetchError);
        setError(fetchError instanceof Error ? fetchError.message : "Impossible de charger ton profil");
      } finally {
        setLoading(false);
      }
    };

    void fetchProfileData();
  }, [router]);

  useEffect(() => {
    if (!editingShowcase) {
      return;
    }

    const trimmedQuery = movieSearchQuery.trim();
    if (trimmedQuery.length < 2) {
      setMovieSearchResults([]);
      setMovieSearchLoading(false);
      return;
    }

    const handle = window.setTimeout(async () => {
      setMovieSearchLoading(true);
      try {
        const res = await fetch(`${API_URL}/search?query=${encodeURIComponent(trimmedQuery)}`);
        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload?.detail ?? "Impossible de rechercher ce film");
        }

        const selectedMovieIds = new Set(draftMovies.map((movie) => movie.id));
        const nextResults = Array.isArray(payload) ? (payload as SearchMovie[]) : [];
        setMovieSearchResults(nextResults.filter((movie) => !selectedMovieIds.has(movie.id)));
      } catch (searchError) {
        console.error(searchError);
        setError(
          searchError instanceof Error ? searchError.message : "Impossible de rechercher ce film",
        );
      } finally {
        setMovieSearchLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(handle);
  }, [draftMovies, editingShowcase, movieSearchQuery]);

  useEffect(() => {
    if (!editingShowcase) {
      return;
    }

    const trimmedQuery = personSearchQuery.trim();
    if (trimmedQuery.length < 2) {
      setPersonSearchResults([]);
      setPersonSearchLoading(false);
      return;
    }

    const handle = window.setTimeout(async () => {
      setPersonSearchLoading(true);
      try {
        const res = await fetch(
          `${API_URL}/search/people?query=${encodeURIComponent(trimmedQuery)}`,
        );
        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload?.detail ?? "Impossible de rechercher cette personne");
        }

        const selectedKeys = new Set(
          draftPeople.map((person) => String(person.id ?? person.name.toLowerCase())),
        );
        const nextResults = Array.isArray(payload)
          ? (payload as ProfileShowcasePerson[])
          : [];
        setPersonSearchResults(
          nextResults.filter(
            (person) => !selectedKeys.has(String(person.id ?? person.name.toLowerCase())),
          ),
        );
      } catch (searchError) {
        console.error(searchError);
        setError(
          searchError instanceof Error
            ? searchError.message
            : "Impossible de rechercher cette personne",
        );
      } finally {
        setPersonSearchLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(handle);
  }, [draftPeople, editingShowcase, personSearchQuery]);

  useEffect(() => {
    if (!editingShowcase) {
      return;
    }

    const trimmedQuery = soundtrackSearchQuery.trim();
    if (trimmedQuery.length < 2) {
      setSoundtrackSearchResults([]);
      setSoundtrackSearchLoading(false);
      return;
    }

    const handle = window.setTimeout(async () => {
      setSoundtrackSearchLoading(true);
      try {
        const res = await fetch(
          `${API_URL}/search/soundtracks?query=${encodeURIComponent(trimmedQuery)}`,
        );
        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload?.detail ?? "Impossible de rechercher cette musique");
        }

        setSoundtrackSearchResults(
          Array.isArray(payload) ? (payload as ProfileShowcaseSoundtrack[]) : [],
        );
      } catch (searchError) {
        console.error(searchError);
        setError(
          searchError instanceof Error
            ? searchError.message
            : "Impossible de rechercher cette musique",
        );
      } finally {
        setSoundtrackSearchLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(handle);
  }, [editingShowcase, soundtrackSearchQuery]);

  const totalMoviesSaved = useMemo(
    () => playlists.reduce((sum, playlist) => sum + playlist.count, 0),
    [playlists],
  );
  const showcaseMovies = editingShowcase ? draftMovies : showcase.profile_movies;
  const showcasePeople = editingShowcase ? draftPeople : showcase.profile_people;
  const showcaseSoundtrack =
    (editingShowcase ? draftSoundtrack : showcase.profile_soundtrack) ?? null;
  const watchLaterPlaylist = useMemo(
    () => playlists.find((playlist) => playlist.id === WATCH_LATER_PLAYLIST_ID) ?? null,
    [playlists],
  );
  const favoritesPlaylist = useMemo(
    () => playlists.find((playlist) => playlist.id === FAVORITES_PLAYLIST_ID) ?? null,
    [playlists],
  );
  const historyPlaylist = useMemo(
    () => playlists.find((playlist) => playlist.id === HISTORY_PLAYLIST_ID) ?? null,
    [playlists],
  );

  const startEditingShowcase = () => {
    setDraftGenres(showcase.profile_genres);
    setDraftPeople(showcase.profile_people);
    setDraftMovies(showcase.profile_movies);
    setDraftSoundtrack(showcase.profile_soundtrack);
    setMovieSearchQuery("");
    setMovieSearchResults([]);
    setPersonSearchQuery("");
    setPersonSearchResults([]);
    setSoundtrackSearchQuery("");
    setSoundtrackSearchResults([]);
    setEditingShowcase(true);
  };

  const cancelEditingShowcase = () => {
    setDraftGenres([]);
    setDraftPeople([]);
    setDraftMovies([]);
    setDraftSoundtrack(null);
    setMovieSearchQuery("");
    setMovieSearchResults([]);
    setPersonSearchQuery("");
    setPersonSearchResults([]);
    setSoundtrackSearchQuery("");
    setSoundtrackSearchResults([]);
    setEditingShowcase(false);
  };

  const toggleDraftGenre = (genre: string) => {
    setDraftGenres((current) =>
      current.includes(genre)
        ? current.filter((value) => value !== genre)
        : current.length >= 5
          ? current
          : [...current, genre],
    );
  };

  const removeDraftMovie = (movieId: number) => {
    setDraftMovies((current) => current.filter((movie) => movie.id !== movieId));
  };

  const saveShowcase = async () => {
    const token = getStoredToken();
    if (!token) {
      redirectToLogin();
      return;
    }

    setSavingShowcase(true);
    try {
      const res = await fetch(`${API_URL}/profile/preferences`, {
        method: "POST",
        headers: buildAuthHeaders(token, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          profile_genres: draftGenres,
          profile_people: draftPeople,
          profile_movie_ids: draftMovies.map((movie) => movie.id),
          profile_soundtrack: draftSoundtrack,
        }),
      });
      const payload = await res.json();

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      if (!res.ok) {
        throw new Error(payload?.detail ?? "Impossible d'enregistrer ta vitrine");
      }

      setShowcase(payload as ProfilePreferencesResponse);
      setProfile((current) =>
        current
          ? {
              ...current,
              profile_genres: payload.profile_genres,
              profile_people: payload.profile_people,
              profile_movie_ids: payload.profile_movie_ids,
              profile_movies: payload.profile_movies,
              profile_soundtrack: payload.profile_soundtrack,
            }
          : current,
      );
      setError("");
      setEditingShowcase(false);
    } catch (saveError) {
      console.error(saveError);
      setError(
        saveError instanceof Error ? saveError.message : "Impossible d'enregistrer ta vitrine",
      );
    } finally {
      setSavingShowcase(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-gray-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement de ton espace...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),_transparent_26%),radial-gradient(circle_at_top_right,_rgba(244,63,94,0.10),_transparent_28%),#000] px-4 pb-28 pt-3 text-white md:p-6 md:pt-24">
      <div className="mx-auto max-w-6xl">
        <MobilePageHeader
          title="Mon profil"
          subtitle={username ? `Ton espace perso, @${username}` : "Ton espace perso"}
          icon={Users}
          accent="emerald"
          trailing={
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-red-300"
              aria-label="Se déconnecter"
            >
              <LogOut className="h-4 w-4" />
            </button>
          }
        />

        {error ? (
          <div className="mb-5 rounded-[24px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <section className="overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-5 shadow-[0_26px_70px_rgba(0,0,0,0.38)] backdrop-blur-xl md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="mb-3 inline-flex rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-emerald-200">
                Espace personnel
              </div>
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-white text-2xl font-black text-black md:h-20 md:w-20 md:text-3xl">
                  {(username || "?").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-3xl font-black tracking-tight md:text-5xl">@{username}</h1>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 md:min-w-[300px]">
              <Link
                href="/playlist"
                className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
              >
                <Bookmark className="h-4 w-4 text-sky-300" />
                Mes listes
              </Link>
              <Link
                href="/news"
                className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
              >
                <Star className="h-4 w-4 text-emerald-300" />
                A l&apos;affiche
              </Link>
            </div>
          </div>
        </section>

        <section data-tutorial="profile-showcase" className="mt-6 space-y-4 md:hidden">
          <div
            data-tutorial="profile-showcase-header"
            className="flex items-center justify-between gap-3"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200">
              <Sparkles className="h-3.5 w-3.5" />
              Ce qui te definit
            </div>

            {editingShowcase ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cancelEditingShowcase}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void saveShowcase()}
                  disabled={savingShowcase}
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400 px-3 py-2 text-xs font-bold text-black disabled:opacity-60"
                >
                  {savingShowcase ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  OK
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={startEditingShowcase}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white"
                aria-label="Personnaliser la vitrine"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="rounded-[24px] border border-white/10 bg-black/20 p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
              Films totems
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {showcaseMovies.length > 0 ? (
                showcaseMovies.map((movie) => (
                  <div
                    key={movie.id}
                    className="relative overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.04]"
                  >
                    <img
                      src={movie.poster_url || FALLBACK_POSTER}
                      alt={movie.title}
                      className="aspect-[2/3] w-full object-cover"
                    />
                    {editingShowcase ? (
                      <button
                        type="button"
                        onClick={() => removeDraftMovie(movie.id)}
                        className="absolute right-2 top-2 rounded-full bg-black/70 p-1.5 text-white"
                        aria-label={`Retirer ${movie.title}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 to-transparent px-2 py-2">
                      <div className="line-clamp-2 text-xs font-bold text-white">{movie.title}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="w-full rounded-[20px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-gray-500">
                  Ajoute quelques films qui te representent vraiment.
                </div>
              )}
            </div>

            {editingShowcase ? (
              <div className="mt-4 rounded-[20px] border border-white/10 bg-black/30 p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-500" />
                  <input
                    value={movieSearchQuery}
                    onChange={(event) => setMovieSearchQuery(event.target.value)}
                    placeholder="Ajouter un film"
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-10 py-3 text-sm text-white outline-none transition focus:border-emerald-500/70"
                  />
                  {movieSearchLoading ? (
                    <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-gray-400" />
                  ) : null}
                </div>

                {movieSearchResults.length > 0 ? (
                  <div className="mt-3 max-h-[28svh] space-y-2 overflow-y-auto rounded-[18px] border border-white/10 bg-black/30 p-2">
                    {movieSearchResults.slice(0, 8).map((movie) => (
                      <button
                        key={movie.id}
                        type="button"
                        onClick={() => {
                          if (draftMovies.length >= 6) {
                            return;
                          }
                          setDraftMovies((current) => [...current, movie]);
                          setMovieSearchQuery("");
                          setMovieSearchResults([]);
                        }}
                        disabled={draftMovies.length >= 6}
                        className="flex w-full items-center gap-3 rounded-2xl border border-transparent bg-white/[0.03] p-2 text-left disabled:opacity-50"
                      >
                        <img
                          src={movie.poster_url || FALLBACK_POSTER}
                          alt={movie.title}
                          className="h-16 w-12 rounded-xl object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-white">{movie.title}</div>
                          <div className="mt-1 text-xs text-yellow-300">{movie.rating.toFixed(1)}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-[24px] border border-white/10 bg-black/20 p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
              Personnes clefs
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {showcasePeople.length > 0 ? (
                showcasePeople.map((person) => (
                  <div
                    key={`${person.id ?? person.name}-${person.name}`}
                    className="relative aspect-[2/3] overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.05] text-white"
                  >
                    <div className="h-full w-full overflow-hidden bg-white/[0.04]">
                      {person.photo_url ? (
                        <img
                          src={person.photo_url}
                          alt={person.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-gray-500">
                          <Users className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/78 to-transparent px-2 py-2">
                      <div className="line-clamp-2 text-xs font-bold leading-4 text-white">
                        {person.name}
                      </div>
                      <div className="mt-1 line-clamp-1 text-[10px] uppercase tracking-[0.14em] text-gray-300">
                        {person.known_for_department || "Cinema"}
                      </div>
                    </div>
                    {editingShowcase ? (
                      <button
                        type="button"
                        onClick={() =>
                          setDraftPeople((current) =>
                            current.filter(
                              (value) => (value.id ?? value.name) !== (person.id ?? person.name),
                            ),
                          )
                        }
                        className="absolute right-2 top-2 inline-flex rounded-full bg-black/70 p-1.5 text-white"
                        aria-label={`Retirer ${person.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="w-full rounded-[20px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-gray-500">
                  Acteurs, actrices, realisateurs, compositrices: les visages de ton cinema.
                </div>
              )}
            </div>

            {editingShowcase ? (
              <div className="mt-4 rounded-[20px] border border-white/10 bg-black/30 p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-500" />
                  <input
                    value={personSearchQuery}
                    onChange={(event) => setPersonSearchQuery(event.target.value)}
                    placeholder="Ajouter une personne"
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-10 py-3 text-sm text-white outline-none transition focus:border-emerald-500/70"
                  />
                  {personSearchLoading ? (
                    <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-gray-400" />
                  ) : null}
                </div>

                {personSearchResults.length > 0 ? (
                  <div className="mt-3 max-h-[28svh] space-y-2 overflow-y-auto rounded-[18px] border border-white/10 bg-black/30 p-2">
                    {personSearchResults.slice(0, 8).map((person) => (
                      <button
                        key={`${person.id ?? person.name}-${person.name}`}
                        type="button"
                        onClick={() => {
                          if (draftPeople.length >= 6) {
                            return;
                          }
                          setDraftPeople((current) => [...current, person]);
                          setPersonSearchQuery("");
                          setPersonSearchResults([]);
                        }}
                        disabled={draftPeople.length >= 6}
                        className="flex w-full items-center gap-3 rounded-2xl border border-transparent bg-white/[0.03] p-2 text-left disabled:opacity-50"
                      >
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
                          {person.photo_url ? (
                            <img
                              src={person.photo_url}
                              alt={person.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-gray-500">
                              <Users className="h-4 w-4" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-white">{person.name}</div>
                          <div className="mt-1 text-xs text-gray-400">
                            {person.known_for_department || "Cinema"}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-[24px] border border-white/10 bg-black/20 p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
              Musique de film favorite
            </div>

            {editingShowcase ? (
              <div className="mt-3 rounded-[20px] border border-white/10 bg-black/30 p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-500" />
                  <input
                    value={soundtrackSearchQuery}
                    onChange={(event) => setSoundtrackSearchQuery(event.target.value)}
                    placeholder="Ajouter une musique"
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-10 py-3 text-sm text-white outline-none transition focus:border-emerald-500/70"
                  />
                  {soundtrackSearchLoading ? (
                    <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-gray-400" />
                  ) : null}
                </div>

                {soundtrackSearchResults.length > 0 ? (
                  <div className="mt-3 max-h-[30svh] space-y-2 overflow-y-auto rounded-[18px] border border-white/10 bg-black/30 p-2">
                    {soundtrackSearchResults.slice(0, 8).map((track) => (
                      <button
                        key={`${track.preview_url}-${track.track_name}`}
                        type="button"
                        onClick={() => {
                          setDraftSoundtrack(track);
                          setSoundtrackSearchQuery("");
                          setSoundtrackSearchResults([]);
                        }}
                        className="flex w-full items-start gap-3 rounded-2xl border border-transparent bg-white/[0.03] p-2 text-left"
                      >
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
                          {track.artwork_url ? (
                            <img
                              src={track.artwork_url}
                              alt={track.track_name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-gray-500">
                              <Music4 className="h-4 w-4" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-white">{track.track_name}</div>
                          <div className="mt-1 truncate text-xs text-gray-400">{track.artist_name}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {showcaseSoundtrack ? (
              <SoundtrackPreviewCard
                soundtrack={showcaseSoundtrack}
                onRemove={editingShowcase ? () => setDraftSoundtrack(null) : undefined}
              />
            ) : !editingShowcase ? (
              <div className="mt-3 rounded-[20px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-gray-500">
                Ajoute un theme ou une musique de film pour donner une vraie ambiance a ton profil.
              </div>
            ) : null}
          </div>

          <div className="rounded-[24px] border border-white/10 bg-black/20 p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
              Genres qui te ressemblent
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(editingShowcase ? COMMON_GENRES : showcase.profile_genres).map((genre) => {
                const isSelected = editingShowcase
                  ? draftGenres.includes(genre)
                  : showcase.profile_genres.includes(genre);

                return editingShowcase ? (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => toggleDraftGenre(genre)}
                    className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
                      isSelected
                        ? "bg-emerald-400 text-black"
                        : "border border-white/10 bg-white/[0.04] text-white"
                    }`}
                  >
                    {genre}
                  </button>
                ) : (
                  <span
                    key={genre}
                    className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-medium text-white"
                  >
                    {genre}
                  </span>
                );
              })}
              {!editingShowcase && showcase.profile_genres.length === 0 ? (
                <div className="w-full rounded-[20px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-gray-500">
                  Ajoute quelques genres pour donner le ton de ton profil.
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section data-tutorial="profile-showcase" className="mt-6 hidden overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.35)] sm:rounded-[30px] sm:p-5 md:block">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div data-tutorial="profile-showcase-header">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200 sm:text-[11px] sm:tracking-[0.2em]">
                <Sparkles className="h-3.5 w-3.5" />
                Ce qui te definit
              </div>
              <h2 className="mt-3 text-xl font-black tracking-tight text-white sm:text-2xl">
                Ta vitrine cine
              </h2>
            </div>

            {editingShowcase ? (
              <div className="flex w-full flex-wrap gap-2 md:w-auto">
                <button
                  type="button"
                  onClick={cancelEditingShowcase}
                  className="flex-1 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.08] md:flex-none"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void saveShowcase()}
                  disabled={savingShowcase}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-emerald-400 px-4 py-2 text-sm font-bold text-black transition hover:bg-emerald-300 disabled:opacity-60 md:flex-none"
                >
                  {savingShowcase ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Enregistrer
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={startEditingShowcase}
                className="w-full rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.08] md:w-auto"
              >
                Personnaliser
              </button>
            )}
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4 rounded-[24px] border border-white/10 bg-black/18 p-3.5 sm:rounded-[26px] sm:p-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                  Films totems
                </div>
                <div className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-5 sm:gap-3 sm:overflow-visible sm:pb-0">
                  {(editingShowcase ? draftMovies : showcase.profile_movies).length > 0 ? (
                    (editingShowcase ? draftMovies : showcase.profile_movies).map((movie) => (
                      <div key={movie.id} className="relative w-[31vw] min-w-[96px] max-w-[122px] shrink-0 snap-start overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.04] sm:w-auto sm:min-w-0 sm:max-w-none sm:rounded-[22px]">
                        <img
                          src={movie.poster_url || FALLBACK_POSTER}
                          alt={movie.title}
                          className="aspect-[2/3] w-full object-cover"
                        />
                        {editingShowcase ? (
                          <button
                            type="button"
                            onClick={() => removeDraftMovie(movie.id)}
                            className="absolute right-2 top-2 rounded-full bg-black/70 p-1.5 text-white"
                            aria-label={`Retirer ${movie.title}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 to-transparent px-2 py-2">
                          <div className="line-clamp-2 text-xs font-bold text-white">{movie.title}</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-full rounded-[22px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-sm text-gray-500">
                      Ajoute quelques films qui te representent vraiment.
                    </div>
                  )}
                </div>
              </div>

              {editingShowcase ? (
                <div className="rounded-[22px] border border-white/10 bg-black/30 p-3.5 sm:p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                    Ajouter un film
                  </div>
                  <div className="relative mt-3">
                    <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-500" />
                    <input
                      value={movieSearchQuery}
                      onChange={(event) => setMovieSearchQuery(event.target.value)}
                      placeholder="Chercher un film a mettre en avant"
                      className="w-full rounded-2xl border border-white/10 bg-black/40 px-10 py-3 text-sm text-white outline-none transition focus:border-emerald-500/70"
                    />
                    {movieSearchLoading ? (
                      <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-gray-400" />
                    ) : null}
                  </div>

                  {movieSearchResults.length > 0 ? (
                    <div className="mt-3 max-h-[28svh] space-y-2 overflow-y-auto rounded-[20px] border border-white/10 bg-black/30 p-2 sm:max-h-64">
                      {movieSearchResults.slice(0, 8).map((movie) => (
                        <button
                          key={movie.id}
                          type="button"
                          onClick={() => {
                            if (draftMovies.length >= 6) {
                              return;
                            }
                            setDraftMovies((current) => [...current, movie]);
                            setMovieSearchQuery("");
                            setMovieSearchResults([]);
                          }}
                          disabled={draftMovies.length >= 6}
                          className="flex w-full items-center gap-3 rounded-2xl border border-transparent bg-white/[0.03] p-2 text-left transition hover:border-emerald-500/40 hover:bg-white/[0.06] disabled:opacity-50"
                        >
                          <img
                            src={movie.poster_url || FALLBACK_POSTER}
                            alt={movie.title}
                            className="h-16 w-12 rounded-xl object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-white">{movie.title}</div>
                            <div className="mt-1 text-xs text-yellow-300">{movie.rating.toFixed(1)}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="min-w-0 space-y-4">
              <div className="min-w-0 rounded-[24px] border border-white/10 bg-black/18 p-3.5 sm:rounded-[26px] sm:p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                  Personnes clefs
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {(editingShowcase ? draftPeople : showcase.profile_people).length > 0 ? (
                    (editingShowcase ? draftPeople : showcase.profile_people).map((person) => (
                      <div
                        key={`${person.id ?? person.name}-${person.name}`}
                        className="flex items-center gap-3 rounded-[20px] border border-white/10 bg-white/[0.05] px-3 py-3 text-white"
                      >
                        <div className="h-12 w-12 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
                          {person.photo_url ? (
                            <img
                              src={person.photo_url}
                              alt={person.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-gray-500">
                              <Users className="h-4 w-4" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-white">
                            {person.name}
                          </div>
                          <div className="mt-1 text-xs text-gray-400">
                            {person.known_for_department || "Cinema"}
                          </div>
                        </div>
                        {editingShowcase ? (
                          <button
                            type="button"
                            onClick={() =>
                              setDraftPeople((current) =>
                                current.filter(
                                  (value) =>
                                    (value.id ?? value.name) !== (person.id ?? person.name),
                                ),
                              )
                            }
                            className="text-gray-400 transition hover:text-white"
                            aria-label={`Retirer ${person.name}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    ))
                  ) : (
                  <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-gray-500">
                      Acteurs, actrices, realisateurs, compositrices: les visages de ton cinema.
                    </div>
                  )}
                </div>

                {editingShowcase ? (
                  <div className="mt-4 rounded-[22px] border border-white/10 bg-black/30 p-3.5 sm:p-4">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-500" />
                      <input
                        value={personSearchQuery}
                        onChange={(event) => setPersonSearchQuery(event.target.value)}
                        placeholder="Chercher une personne"
                        className="w-full rounded-2xl border border-white/10 bg-black/40 px-10 py-3 text-sm text-white outline-none transition focus:border-emerald-500/70"
                      />
                      {personSearchLoading ? (
                        <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-gray-400" />
                      ) : null}
                    </div>

                    {personSearchResults.length > 0 ? (
                      <div className="mt-3 max-h-[28svh] space-y-2 overflow-y-auto rounded-[20px] border border-white/10 bg-black/30 p-2 sm:max-h-64">
                        {personSearchResults.slice(0, 8).map((person) => (
                          <button
                            key={`${person.id ?? person.name}-${person.name}`}
                            type="button"
                            onClick={() => {
                              if (draftPeople.length >= 6) {
                                return;
                              }
                              setDraftPeople((current) => [...current, person]);
                              setPersonSearchQuery("");
                              setPersonSearchResults([]);
                            }}
                            disabled={draftPeople.length >= 6}
                            className="flex w-full items-center gap-3 rounded-2xl border border-transparent bg-white/[0.03] p-2 text-left transition hover:border-emerald-500/40 hover:bg-white/[0.06] disabled:opacity-50"
                          >
                            <div className="h-12 w-12 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] sm:h-14 sm:w-14">
                              {person.photo_url ? (
                                <img
                                  src={person.photo_url}
                                  alt={person.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-gray-500">
                                  <Users className="h-4 w-4" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-white">
                                {person.name}
                              </div>
                              <div className="mt-1 text-xs text-gray-400">
                                {person.known_for_department || "Cinema"}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="min-w-0 rounded-[24px] border border-white/10 bg-black/18 p-3.5 sm:rounded-[26px] sm:p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                  Musique de film favorite
                </div>

                {editingShowcase ? (
                  <div className="mt-3 rounded-[22px] border border-white/10 bg-black/30 p-3.5 sm:p-4">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-500" />
                      <input
                        value={soundtrackSearchQuery}
                        onChange={(event) => setSoundtrackSearchQuery(event.target.value)}
                        placeholder="Chercher une musique ou un score"
                        className="w-full rounded-2xl border border-white/10 bg-black/40 px-10 py-3 text-sm text-white outline-none transition focus:border-emerald-500/70"
                      />
                      {soundtrackSearchLoading ? (
                        <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-gray-400" />
                      ) : null}
                    </div>

                    {soundtrackSearchResults.length > 0 ? (
                      <div className="mt-3 max-h-[30svh] space-y-2 overflow-y-auto rounded-[20px] border border-white/10 bg-black/30 p-2 sm:max-h-72">
                        {soundtrackSearchResults.slice(0, 8).map((track) => (
                          <button
                            key={`${track.preview_url}-${track.track_name}`}
                            type="button"
                            onClick={() => {
                              setDraftSoundtrack(track);
                              setSoundtrackSearchQuery("");
                              setSoundtrackSearchResults([]);
                            }}
                            className="flex w-full items-start gap-3 rounded-2xl border border-transparent bg-white/[0.03] p-2 text-left transition hover:border-emerald-500/40 hover:bg-white/[0.06] sm:items-center"
                          >
                            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] sm:h-14 sm:w-14">
                              {track.artwork_url ? (
                                <img
                                  src={track.artwork_url}
                                  alt={track.track_name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-gray-500">
                                  <Music4 className="h-4 w-4" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-white">
                                {track.track_name}
                              </div>
                              <div className="mt-1 truncate text-xs text-gray-400">
                                {track.artist_name}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {((editingShowcase ? draftSoundtrack : showcase.profile_soundtrack) ?? null) ? (
                  <div className="mt-3 min-w-0 overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.04] sm:rounded-[22px]">
                    <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] sm:h-16 sm:w-16">
                        {(editingShowcase ? draftSoundtrack : showcase.profile_soundtrack)?.artwork_url ? (
                          <img
                            src={(editingShowcase ? draftSoundtrack : showcase.profile_soundtrack)?.artwork_url || ""}
                            alt={(editingShowcase ? draftSoundtrack : showcase.profile_soundtrack)?.track_name || "Artwork"}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-gray-500">
                            <Disc3 className="h-5 w-5" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold text-white">
                          {(editingShowcase ? draftSoundtrack : showcase.profile_soundtrack)?.track_name}
                        </div>
                        <div className="mt-1 truncate text-xs text-gray-400">
                          {(editingShowcase ? draftSoundtrack : showcase.profile_soundtrack)?.artist_name}
                        </div>
                        {(editingShowcase ? draftSoundtrack : showcase.profile_soundtrack)?.collection_name ? (
                          <div className="mt-1 truncate text-[11px] uppercase tracking-[0.16em] text-emerald-200/80">
                            {(editingShowcase ? draftSoundtrack : showcase.profile_soundtrack)?.collection_name}
                          </div>
                        ) : null}
                      </div>
                      {editingShowcase ? (
                        <button
                          type="button"
                          onClick={() => setDraftSoundtrack(null)}
                          className="self-end rounded-full bg-black/50 p-2 text-white sm:self-auto"
                          aria-label="Retirer cette musique"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                    <div className="min-w-0 overflow-hidden border-t border-white/10 bg-black/20 px-2 py-3 sm:p-3">
                      <audio
                        controls
                        preload="none"
                        className="block h-10 w-full min-w-0 max-w-full sm:h-12"
                        style={{ maxWidth: "100%" }}
                        src={(editingShowcase ? draftSoundtrack : showcase.profile_soundtrack)?.preview_url || ""}
                      />
                    </div>
                  </div>
                ) : !editingShowcase ? (
                  <div className="mt-3 rounded-[22px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-gray-500">
                    Ajoute un theme ou une musique de film pour donner une vraie ambiance a ton profil.
                  </div>
                ) : null}
              </div>

              <div className="rounded-[24px] border border-white/10 bg-black/18 p-3.5 sm:rounded-[26px] sm:p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                  Genres qui te ressemblent
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(editingShowcase ? COMMON_GENRES : showcase.profile_genres).map((genre) => {
                    const isSelected = editingShowcase
                      ? draftGenres.includes(genre)
                      : showcase.profile_genres.includes(genre);

                    return editingShowcase ? (
                      <button
                        key={genre}
                        type="button"
                        onClick={() => toggleDraftGenre(genre)}
                        className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
                          isSelected
                            ? "bg-emerald-400 text-black"
                            : "border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                        }`}
                      >
                        {genre}
                      </button>
                    ) : (
                      <span
                        key={genre}
                        className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-medium text-white"
                      >
                        {genre}
                      </span>
                    );
                  })}
                  {!editingShowcase && showcase.profile_genres.length === 0 ? (
                    <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-gray-500">
                      Ajoute quelques genres pour donner le ton de ton profil.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black tracking-tight md:text-2xl">Mes playlists</h2>
            </div>
            <Link
              href="/playlist"
              className="hidden rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.08] md:inline-flex"
            >
              Gerer
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {playlists.map((playlist) => (
              <Link
                key={playlist.id}
                href={buildPlaylistHref(playlist.id)}
                className={`overflow-hidden rounded-[28px] border bg-[linear-gradient(145deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.28)] transition active:scale-[0.99] md:hover:-translate-y-0.5 ${getPlaylistTone(playlist)}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-black text-white">{playlist.name}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.22em] text-gray-400">
                      {playlist.count} film{playlist.count > 1 ? "s" : ""}
                    </div>
                  </div>
                  <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold text-white/85">
                    {playlist.type === "custom" ? "Perso" : "Systeme"}
                  </div>
                </div>

                {playlist.preview_movies.length > 0 ? (
                  <div className="mt-4 grid grid-cols-6 gap-2">
                    {playlist.preview_movies.map((movie) => (
                      <div
                        key={`${playlist.id}-${movie.id}`}
                        className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]"
                      >
                        <img
                          src={movie.poster_url || FALLBACK_POSTER}
                          alt={movie.title}
                          className="aspect-[2/3] h-full w-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-[22px] border border-dashed border-white/10 bg-black/10 px-4 py-6 text-sm text-gray-400">
                    Aucune affiche pour le moment. Ouvre la playlist pour commencer a la remplir.
                  </div>
                )}
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-6 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.28)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-white md:text-xl">Dernieres critiques</h2>
              </div>
            </div>

            {profile?.reviews?.length ? (
              <div className="space-y-3">
                {profile.reviews.slice(0, 4).map((review) => (
                  <article key={review.id} className="flex gap-3 rounded-[22px] border border-white/10 bg-black/16 p-3">
                    <img
                      src={review.poster_url || FALLBACK_POSTER}
                      alt={review.title}
                      className="h-24 w-16 flex-shrink-0 rounded-2xl object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-white">{review.title}</div>
                          <div className="mt-1 text-xs text-gray-500">{formatSocialDate(review.created_at)}</div>
                        </div>
                        <div className="rounded-full bg-amber-500/14 px-2.5 py-1 text-xs font-bold text-amber-200">
                          {review.rating}/5
                        </div>
                      </div>
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-300">{review.content}</p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-[22px] border border-dashed border-white/10 bg-black/10 px-4 py-8 text-sm text-gray-400">
                Aucune critique publiee pour le moment.
              </div>
            )}
          </div>

          <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.28)]">
            <div className="mb-4">
              <h2 className="text-lg font-black text-white md:text-xl">Raccourcis</h2>
            </div>

            <div className="grid gap-3">
              <ContextCard
                title="A regarder plus tard"
                description="file d'attente"
                meta={watchLaterPlaylist ? `${watchLaterPlaylist.count} films` : "0 film"}
                href={watchLaterPlaylist ? buildPlaylistHref(watchLaterPlaylist.id) : "/playlist"}
                posterUrl={watchLaterPlaylist?.preview_movies[0]?.poster_url}
              />
              <ContextCard
                title="Favoris"
                description="notes hautes"
                meta={favoritesPlaylist ? `${favoritesPlaylist.count} films` : "0 film"}
                href={favoritesPlaylist ? buildPlaylistHref(favoritesPlaylist.id) : "/playlist"}
                posterUrl={favoritesPlaylist?.preview_movies[0]?.poster_url}
              />
              <ContextCard
                title="Historique"
                description="vus et notes"
                meta={historyPlaylist ? `${historyPlaylist.count} films` : "0 film"}
                href={historyPlaylist ? buildPlaylistHref(historyPlaylist.id) : "/playlist"}
                posterUrl={historyPlaylist?.preview_movies[0]?.poster_url}
              />
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[28px] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.28)]">
          <div className="mb-4">
            <h2 className="text-lg font-black text-white md:text-xl">Statistiques</h2>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard label="Playlists" value={String(playlists.length)} icon={Film} />
            <StatCard label="Films sauves" value={String(totalMoviesSaved)} icon={Clock3} />
            <StatCard label="Critiques" value={String(profile?.reviews_count ?? 0)} icon={Star} />
            <StatCard label="Abonnes" value={String(profile?.followers_count ?? 0)} icon={Users} />
            <StatCard label="Favoris" value={String(profile?.favorites_count ?? 0)} icon={Heart} />
          </div>
        </section>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Film;
}) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-black/16 px-4 py-3">
      <div className="flex items-center gap-2 text-gray-400">
        <Icon className="h-4 w-4" />
        <span className="text-xs uppercase tracking-[0.18em]">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-black text-white">{value}</div>
    </div>
  );
}

function ContextCard({
  href,
  title,
  description,
  meta,
  posterUrl,
}: {
  href: string;
  title: string;
  description: string;
  meta: string;
  posterUrl?: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-black/16 p-3 transition hover:bg-white/[0.06]"
    >
      <div className="h-16 w-12 flex-shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
        {posterUrl ? (
          <img src={posterUrl} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-500">
            <Film className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-white">{title}</div>
        <div className="mt-1 text-xs text-gray-400">{description}</div>
        <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300/85">{meta}</div>
      </div>
      <ArrowRight className="h-4 w-4 text-gray-500" />
    </Link>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Film, Loader2, Search, Sparkles, UserRoundPlus, X } from "lucide-react";
import { API_URL } from "@/config";
import {
  buildAuthHeaders,
  clearStoredSession,
  getStoredToken,
  markOnboardingCompleted,
} from "@/lib/auth";
import { FALLBACK_POSTER, type SearchMovie } from "@/lib/social";
import MobilePageHeader from "@/components/MobilePageHeader";

const GENRE_OPTIONS = [
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
  "Science-Fiction",
  "Thriller",
];

interface OnboardingPreferencesResponse {
  favorite_genres: string[];
  favorite_people: string[];
  favorite_movie_ids: number[];
  has_completed_onboarding: boolean;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [favoriteGenres, setFavoriteGenres] = useState<string[]>([]);
  const [favoritePeople, setFavoritePeople] = useState<string[]>([]);
  const [favoriteMovies, setFavoriteMovies] = useState<SearchMovie[]>([]);
  const [peopleInput, setPeopleInput] = useState("");
  const [movieQuery, setMovieQuery] = useState("");
  const [movieResults, setMovieResults] = useState<SearchMovie[]>([]);
  const [bootLoading, setBootLoading] = useState(true);
  const [movieSearchLoading, setMovieSearchLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedMovieIds = useMemo(
    () => new Set(favoriteMovies.map((movie) => movie.id)),
    [favoriteMovies],
  );

  const redirectToLogin = () => {
    clearStoredSession();
    router.push("/login");
  };

  useEffect(() => {
    const bootstrap = async () => {
      const token = getStoredToken();
      if (!token) {
        redirectToLogin();
        return;
      }

      try {
        const [preferencesRes, meRes] = await Promise.all([
          fetch(`${API_URL}/onboarding/preferences`, {
            headers: buildAuthHeaders(token),
          }),
          fetch(`${API_URL}/users/me`, {
            headers: buildAuthHeaders(token),
          }),
        ]);

        if (preferencesRes.status === 401 || meRes.status === 401) {
          redirectToLogin();
          return;
        }

        const preferencesPayload =
          (await preferencesRes.json()) as OnboardingPreferencesResponse;
        const mePayload = await meRes.json();

        if (!preferencesRes.ok || !meRes.ok) {
          throw new Error("Impossible de charger tes preferences.");
        }

        setFavoriteGenres(Array.isArray(preferencesPayload.favorite_genres) ? preferencesPayload.favorite_genres : []);
        setFavoritePeople(Array.isArray(preferencesPayload.favorite_people) ? preferencesPayload.favorite_people : []);

        const existingMovieIds = Array.isArray(preferencesPayload.favorite_movie_ids)
          ? preferencesPayload.favorite_movie_ids
          : [];

        if (existingMovieIds.length > 0) {
          const movieDetails = await Promise.all(
            existingMovieIds.slice(0, 6).map(async (movieId) => {
              const res = await fetch(`${API_URL}/movie/${movieId}`);
              const payload = await res.json();
              if (!res.ok) {
                return null;
              }

              return {
                id: Number(payload.id),
                title: String(payload.title),
                poster_url: payload.poster_url || FALLBACK_POSTER,
                rating: Number(payload.rating ?? 0),
              } satisfies SearchMovie;
            }),
          );
          setFavoriteMovies(movieDetails.filter((movie): movie is SearchMovie => movie !== null));
        }

        if (mePayload?.has_completed_onboarding) {
          markOnboardingCompleted();
        }
      } catch (bootstrapError) {
        console.error(bootstrapError);
        setError("Impossible de charger l'onboarding.");
      } finally {
        setBootLoading(false);
      }
    };

    void bootstrap();
  }, [router]);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      return;
    }

    const trimmedQuery = movieQuery.trim();
    if (trimmedQuery.length < 2) {
      setMovieResults([]);
      setMovieSearchLoading(false);
      return;
    }

    const handle = window.setTimeout(async () => {
      setMovieSearchLoading(true);
      try {
        const res = await fetch(`${API_URL}/search?query=${encodeURIComponent(trimmedQuery)}`, {
          headers: buildAuthHeaders(token),
        });
        const payload = await res.json();

        if (res.status === 401) {
          redirectToLogin();
          return;
        }

        if (!res.ok) {
          throw new Error(payload?.detail ?? "Impossible de rechercher ce film.");
        }

        const results = Array.isArray(payload) ? (payload as SearchMovie[]) : [];
        setMovieResults(results.filter((movie) => !selectedMovieIds.has(movie.id)).slice(0, 8));
      } catch (searchError) {
        console.error(searchError);
        setError(
          searchError instanceof Error
            ? searchError.message
            : "Impossible de rechercher ce film.",
        );
      } finally {
        setMovieSearchLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(handle);
  }, [movieQuery, selectedMovieIds]);

  const toggleGenre = (genre: string) => {
    setFavoriteGenres((current) =>
      current.includes(genre)
        ? current.filter((entry) => entry !== genre)
        : [...current, genre].slice(0, 8),
    );
  };

  const addPerson = () => {
    const normalizedValue = peopleInput.trim();
    if (!normalizedValue) {
      return;
    }

    setFavoritePeople((current) =>
      current.includes(normalizedValue)
        ? current
        : [...current, normalizedValue].slice(0, 6),
    );
    setPeopleInput("");
  };

  const removePerson = (personName: string) => {
    setFavoritePeople((current) => current.filter((entry) => entry !== personName));
  };

  const addMovie = (movie: SearchMovie) => {
    setFavoriteMovies((current) => [...current, movie].slice(0, 6));
    setMovieResults((current) => current.filter((entry) => entry.id !== movie.id));
    setMovieQuery("");
  };

  const removeMovie = (movieId: number) => {
    setFavoriteMovies((current) => current.filter((movie) => movie.id !== movieId));
  };

  const handleSubmit = async () => {
    const token = getStoredToken();
    if (!token) {
      redirectToLogin();
      return;
    }

    if (
      favoriteGenres.length === 0 &&
      favoritePeople.length === 0 &&
      favoriteMovies.length === 0
    ) {
      setError("Selectionne au moins quelques gouts pour demarrer.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/onboarding/preferences`, {
        method: "POST",
        headers: buildAuthHeaders(token, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          favorite_genres: favoriteGenres,
          favorite_people: favoritePeople,
          favorite_movie_ids: favoriteMovies.map((movie) => movie.id),
        }),
      });
      const payload = await res.json();

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      if (!res.ok) {
        throw new Error(payload?.detail ?? "Impossible d'enregistrer tes preferences.");
      }

      markOnboardingCompleted();
      router.push("/");
    } catch (submitError) {
      console.error(submitError);
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Impossible d'enregistrer tes preferences.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (bootLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-gray-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Preparation de ton profil cinema...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(239,68,68,0.20),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.16),_transparent_24%),#000] px-4 py-6 text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <MobilePageHeader
          title="Onboarding IA"
          subtitle="Configure ton premier feed cinema"
          icon={Sparkles}
          accent="red"
        />

        <section className="hidden overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.38)] backdrop-blur-md md:block md:p-7">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-red-200">
            <Sparkles className="h-3.5 w-3.5" />
            Onboarding IA
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">
            Donne quelques signaux a Qulte
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-300 md:text-base">
            Selectionne des genres, des acteurs ou realisateurs que tu aimes, puis quelques
            films references. Le feed d&apos;accueil partira de la.
          </p>
        </section>

        {error && (
          <div className="rounded-[24px] border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-100">
            {error}
          </div>
        )}

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <div className="rounded-[28px] border border-white/10 bg-zinc-950/90 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-500/12 text-red-200">
                  <Check className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Genres preferes</h2>
                  <p className="text-sm text-gray-400">Choisis jusqu&apos;a 8 ambiances.</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {GENRE_OPTIONS.map((genre) => {
                  const isActive = favoriteGenres.includes(genre);
                  return (
                    <button
                      key={genre}
                      type="button"
                      onClick={() => toggleGenre(genre)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        isActive
                          ? "bg-red-600 text-white"
                          : "border border-white/10 bg-white/[0.04] text-gray-300 hover:bg-white/[0.08]"
                      }`}
                    >
                      {genre}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-zinc-950/90 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/12 text-amber-200">
                  <UserRoundPlus className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Acteurs et realisateurs</h2>
                  <p className="text-sm text-gray-400">Ajoute jusqu&apos;a 6 noms.</p>
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  value={peopleInput}
                  onChange={(event) => setPeopleInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addPerson();
                    }
                  }}
                  placeholder="Ex. Denis Villeneuve, Margot Robbie"
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-500/70"
                />
                <button
                  type="button"
                  onClick={addPerson}
                  className="rounded-2xl bg-amber-500 px-4 py-3 text-sm font-bold text-black transition hover:bg-amber-400"
                >
                  Ajouter
                </button>
              </div>

              {favoritePeople.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {favoritePeople.map((personName) => (
                    <button
                      key={personName}
                      type="button"
                      onClick={() => removePerson(personName)}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white transition hover:bg-white/[0.08]"
                    >
                      {personName}
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[28px] border border-white/10 bg-zinc-950/90 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/12 text-sky-200">
                  <Film className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Films de reference</h2>
                  <p className="text-sm text-gray-400">Ajoute jusqu&apos;a 6 films.</p>
                </div>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-500" />
                <input
                  value={movieQuery}
                  onChange={(event) => setMovieQuery(event.target.value)}
                  placeholder="Recherche un film que tu aimes"
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-10 py-3 text-sm text-white outline-none transition focus:border-sky-500/70"
                />
                {movieSearchLoading && (
                  <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-gray-400" />
                )}
              </div>

              {movieResults.length > 0 && (
                <div className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-black/50 p-2">
                  {movieResults.map((movie) => (
                    <button
                      key={movie.id}
                      type="button"
                      onClick={() => addMovie(movie)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-transparent bg-white/[0.03] p-2 text-left transition hover:border-sky-500/40 hover:bg-white/[0.06]"
                    >
                      <img
                        src={movie.poster_url || FALLBACK_POSTER}
                        alt={movie.title}
                        className="h-16 w-12 rounded-xl object-cover"
                      />
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{movie.title}</div>
                        <div className="mt-1 text-xs text-yellow-400">{movie.rating.toFixed(1)} / 10</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-4 space-y-3">
                {favoriteMovies.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-8 text-center text-sm text-gray-500">
                    Aucun film selectionne pour l&apos;instant.
                  </div>
                ) : (
                  favoriteMovies.map((movie) => (
                    <div
                      key={movie.id}
                      className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-white/[0.03] p-3"
                    >
                      <img
                        src={movie.poster_url || FALLBACK_POSTER}
                        alt={movie.title}
                        className="h-16 w-12 rounded-xl object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{movie.title}</div>
                        <div className="mt-1 text-xs text-yellow-400">{movie.rating.toFixed(1)} / 10</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeMovie(movie.id)}
                        className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-gray-300 transition hover:bg-white/[0.08] hover:text-white"
                        aria-label={`Retirer ${movie.title}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-gradient-to-br from-red-600/12 via-white/[0.03] to-amber-500/10 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                Resume
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-center">
                  <div className="text-2xl font-black">{favoriteGenres.length}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-gray-500">Genres</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-center">
                  <div className="text-2xl font-black">{favoritePeople.length}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-gray-500">Personnes</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-center">
                  <div className="text-2xl font-black">{favoriteMovies.length}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-gray-500">Films</div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={saving}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-950/70 disabled:text-red-200/60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Lancer mon feed
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

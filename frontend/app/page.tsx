"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "framer-motion";
import { Clock, Loader2, Sparkles, Star, X } from "lucide-react";
import { API_URL } from "@/config";
import { buildAuthHeaders, clearStoredSession, getStoredToken } from "@/lib/auth";
import {
  WATCH_LATER_PLAYLIST_ID,
} from "@/lib/playlists";
import MovieDetailsModal from "@/components/MovieDetailsModal";

interface CastMember {
  name: string;
  character: string;
  photo: string | null;
}

interface Movie {
  id: number;
  title: string;
  poster_url: string;
  rating: number;
  overview?: string;
  trailer_url?: string;
  cast?: CastMember[];
  release_date?: string;
}

type SwipeDirection = "left" | "right";

export default function Home() {
  const router = useRouter();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exitDirection, setExitDirection] = useState(0);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const isFetchingRef = useRef(false);
  const isSwipingRef = useRef(false);

  const redirectToLogin = () => {
    clearStoredSession();
    router.push("/login");
  };

  const fetchMovies = async (excludeMovieIds: number[] = []) => {
    const token = getStoredToken();
    if (!token) {
      redirectToLogin();
      return;
    }

    if (isFetchingRef.current) {
      return;
    }

    isFetchingRef.current = true;

    try {
      const params = new URLSearchParams({ limit: "10" });
      if (excludeMovieIds.length > 0) {
        params.set("exclude_ids", excludeMovieIds.join(","));
      }

      const res = await fetch(`${API_URL}/movies/feed?${params.toString()}`, {
        headers: buildAuthHeaders(token),
      });

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      const data = await res.json();
      if (!Array.isArray(data)) {
        throw new Error("Réponse invalide pour les recommandations");
      }

      let addedCount = 0;
      setMovies((current) => {
        const knownIds = new Set(current.map((movie) => movie.id));
        const nextMovies = data.filter(
          (movie: Movie) => !knownIds.has(movie.id),
        );
        addedCount = nextMovies.length;
        return [...current, ...nextMovies];
      });

      if (addedCount === 0 && excludeMovieIds.length > 0) {
        setError("L'IA cherche encore de nouveaux films. Réessaie dans quelques secondes.");
      } else {
        setError("");
      }
    } catch (fetchError) {
      console.error(fetchError);
      setError("Impossible de charger les recommandations pour le moment.");
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    const bootstrapHome = async () => {
      const token = getStoredToken();
      if (!token) {
        redirectToLogin();
        return;
      }

      try {
        const res = await fetch(`${API_URL}/users/me`, {
          headers: buildAuthHeaders(token),
        });

        if (res.status === 401) {
          redirectToLogin();
          return;
        }

        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload?.detail ?? "Impossible de charger le profil utilisateur");
        }

        if (!payload?.has_completed_onboarding) {
          router.push("/onboarding");
          return;
        }

        void fetchMovies();
      } catch (bootstrapError) {
        console.error(bootstrapError);
        setError("Impossible de charger ton profil pour le moment.");
        setLoading(false);
      }
    };

    void bootstrapHome();
  }, [router]);

  useEffect(() => {
    if (loading || movies.length >= 4) {
      return;
    }

    const queuedIds = movies.map((movie) => movie.id);
    const refillDelay = movies.length === 0 ? 500 : 150;
    const refillTimer = window.setTimeout(() => {
      void fetchMovies(queuedIds);
    }, refillDelay);

    return () => window.clearTimeout(refillTimer);
  }, [loading, movies]);

  const removeFrontCard = () => {
    let shouldLoadMore = false;
    let remainingIds: number[] = [];

    setMovies((current) => {
      const nextMovies = current.slice(1);
      shouldLoadMore = nextMovies.length < 4;
      remainingIds = nextMovies.map((movie) => movie.id);
      return nextMovies;
    });

    if (shouldLoadMore) {
      void fetchMovies(remainingIds);
    }

    window.setTimeout(() => setExitDirection(0), 220);
  };

  const rateMovie = async (movieId: number, rating: number) => {
    const token = getStoredToken();
    if (!token) {
      redirectToLogin();
      return false;
    }

    const res = await fetch(`${API_URL}/movies/rate/${movieId}/${rating}`, {
      method: "POST",
      headers: buildAuthHeaders(token),
    });

    if (res.status === 401) {
      redirectToLogin();
      return false;
    }

    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.detail ?? "Impossible d'enregistrer la note");
    }

    return true;
  };

  const addToPlaylist = async (playlistId: number, movieId: number) => {
    const token = getStoredToken();
    if (!token) {
      redirectToLogin();
      return false;
    }

    const res = await fetch(`${API_URL}/playlists/${playlistId}/add/${movieId}`, {
      method: "POST",
      headers: buildAuthHeaders(token),
    });

    if (res.status === 401) {
      redirectToLogin();
      return false;
    }

    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.detail ?? "Impossible d'ajouter ce film");
    }

    return true;
  };

  const restoreMovieToFront = (movie: Movie) => {
    setMovies((current) => {
      if (current.some((entry) => entry.id === movie.id)) {
        return current;
      }
      return [movie, ...current];
    });
  };

  const persistSwipeAction = async (direction: SwipeDirection, movie: Movie) => {
    if (direction === "right") {
      const added = await addToPlaylist(WATCH_LATER_PLAYLIST_ID, movie.id);
      if (!added) {
        throw new Error("Ajout a la liste impossible");
      }
      return;
    }

    const rated = await rateMovie(movie.id, 1);
    if (!rated) {
      throw new Error("Notation impossible");
    }
  };

  const triggerSwipe = (direction: SwipeDirection, movie: Movie) => {
    if (isSwipingRef.current) {
      return;
    }

    isSwipingRef.current = true;
    setExitDirection(direction === "left" ? -1000 : 1000);
    window.setTimeout(() => removeFrontCard(), 28);

    void persistSwipeAction(direction, movie)
      .then(() => {
        setError("");
      })
      .catch((swipeError) => {
        console.error(swipeError);
        restoreMovieToFront(movie);
        setError("Impossible d'enregistrer cette action.");
        setExitDirection(0);
      })
      .finally(() => {
        window.setTimeout(() => {
          isSwipingRef.current = false;
        }, 140);
      });
  };

  const handleRate = async (rating: number, movie: Movie) => {
    try {
      const rated = await rateMovie(movie.id, rating);
      if (!rated) {
        return;
      }

      setExitDirection(rating >= 4 ? 1000 : -1000);
      window.setTimeout(() => removeFrontCard(), 60);
      setError("");
    } catch (rateError) {
      console.error(rateError);
      setError("Impossible d'enregistrer cette note.");
      setExitDirection(0);
    }
  };

  const manualSwipe = (direction: SwipeDirection) => {
    const frontMovie = movies[0];
    if (!frontMovie || isSwipingRef.current) {
      return;
    }
    triggerSwipe(direction, frontMovie);
  };

  const openDetails = async (id: number) => {
    if (exitDirection !== 0) {
      return;
    }

    try {
      const res = await fetch(`${API_URL}/movie/${id}`);
      const data = await res.json();
      setSelectedMovie(data);
    } catch (detailError) {
      console.error(detailError);
      setError("Impossible de charger les détails de ce film.");
    }
  };

  if (loading && movies.length === 0) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin text-red-500" />
          <p>Chargement des recommandations IA...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="h-[calc(100svh-6.3rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] overflow-hidden bg-black px-3 pb-1 text-white md:h-[calc(100svh-6.8rem)] md:px-4">
      <section className="mx-auto flex h-full w-full max-w-5xl flex-col items-center justify-between gap-2 pt-0 md:gap-3 md:pt-3">
        <div className="hidden w-full max-w-sm flex-col gap-3 md:flex md:max-w-md">
          <span className="inline-flex items-center gap-2 rounded-full border border-red-900/60 bg-red-950/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-red-200">
            <Sparkles className="h-3.5 w-3.5" />
            Recommandations IA
          </span>
        </div>

        {error && (
          <div className="w-full max-w-sm rounded-2xl border border-red-900/60 bg-red-950/50 px-4 py-2.5 text-sm text-red-100 md:max-w-md">
            {error}
          </div>
        )}

        <div className="relative flex min-h-0 flex-1 w-full max-w-sm items-center justify-center md:max-w-md">
          {movies.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-3xl border border-gray-800 bg-gray-950 px-8 py-10 text-center text-gray-400">
              <p>Chargement de nouveaux films...</p>
              <button
                onClick={() => {
                  setLoading(true);
                  void fetchMovies();
                }}
                className="rounded-full border border-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600"
              >
                Recharger le feed
              </button>
            </div>
          ) : (
            <AnimatePresence initial={false} mode="popLayout">
              {movies
                .slice(0, 2)
                .map((movie, index) => (
                  <MovieCard
                    key={movie.id}
                    movie={movie}
                    isFront={index === 0}
                    exitDirection={exitDirection}
                    onInfoClick={() => void openDetails(movie.id)}
                    onRate={(rating) => void handleRate(rating, movie)}
                    onSwipe={(direction) => triggerSwipe(direction, movie)}
                  />
                ))
                .reverse()}
            </AnimatePresence>
          )}
        </div>

        {movies.length > 0 && !selectedMovie && (
          <div className="grid w-full max-w-sm grid-cols-2 items-center gap-2 md:max-w-md md:gap-3">
            <button
              onClick={() => manualSwipe("left")}
              className="flex items-center justify-center gap-2 rounded-2xl border border-gray-800 bg-gray-950 px-4 py-3 text-red-500 transition hover:scale-105 hover:border-red-700 md:py-4"
              aria-label="Passer ce film"
            >
              <X size={22} />
              <span className="text-xs font-semibold md:text-sm">Passer</span>
            </button>
            <button
              onClick={() => manualSwipe("right")}
              className="flex items-center justify-center gap-2 rounded-2xl border border-gray-800 bg-gray-950 px-4 py-3 text-blue-400 transition hover:scale-105 hover:border-blue-700 md:py-4"
              aria-label="Ajouter a regarder plus tard"
            >
              <Clock size={22} />
              <span className="text-xs font-semibold md:text-sm">Plus tard</span>
            </button>
          </div>
        )}
      </section>

      <MovieDetailsModal
        movie={selectedMovie}
        onClose={() => setSelectedMovie(null)}
        onLikeSuccess={() => void fetchMovies()}
      />
    </main>
  );
}

interface MovieCardProps {
  movie: Movie;
  isFront: boolean;
  exitDirection: number;
  onInfoClick: () => void;
  onRate: (rating: number) => void;
  onSwipe: (direction: SwipeDirection) => void;
}

function MovieCard({
  movie,
  isFront,
  exitDirection,
  onInfoClick,
  onRate,
  onSwipe,
}: MovieCardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-180, 180], [-18, 18]);
  const opacity = useTransform(x, [-200, -120, 0, 120, 200], [0.15, 1, 1, 1, 0.15]);
  const blueOverlay = useTransform(x, [0, 80], [0, 0.55]);
  const redOverlay = useTransform(x, [-80, 0], [0.55, 0]);

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x > 78 || info.velocity.x > 520) {
      onSwipe("right");
      return;
    }

    if (info.offset.x < -78 || info.velocity.x < -520) {
      onSwipe("left");
    }
  };

  return (
    <motion.div
      style={{ x, rotate, opacity, zIndex: isFront ? 1 : 0 }}
      drag={isFront ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.12}
      dragMomentum={true}
      onDragEnd={handleDragEnd}
      whileDrag={isFront ? { scale: 1.015 } : undefined}
      animate={{ scale: isFront ? 1 : 0.965, opacity: 1 }}
      exit={{ x: exitDirection || (x.get() < 0 ? -1000 : 1000), opacity: 0 }}
      transition={{ type: "spring", stiffness: 340, damping: 28, mass: 0.8 }}
      className={`absolute top-0 h-full w-[95%] overflow-hidden rounded-[2rem] border border-gray-800 bg-gray-950 shadow-2xl md:w-[88%] ${
        isFront ? "" : "pointer-events-none"
      }`}
    >
      <div className="relative flex h-full flex-col">
        <button
          onClick={onInfoClick}
          className="relative h-[79%] w-full overflow-hidden bg-black text-left md:h-[76%]"
        >
          <img
            src={movie.poster_url}
            alt={movie.title}
            className="h-full w-full object-cover"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-gray-950 via-transparent to-transparent" />
          <div className="absolute bottom-3 left-3 right-3 md:bottom-4 md:left-4 md:right-4">
            <h2 className="text-[1.45rem] font-black text-white drop-shadow-lg md:text-2xl">{movie.title}</h2>
            <div className="mt-1 flex items-center text-sm text-yellow-400">
              <Star className="mr-1 h-4 w-4 fill-current" />
              {movie.rating.toFixed(1)} / 10
            </div>
          </div>
        </button>

        <div className="flex h-[21%] flex-col justify-between px-3 py-3 md:h-[24%] md:px-4 md:py-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500 md:text-[11px] md:tracking-[0.22em]">
              Deja vu ? Note-le pour affiner l&apos;IA
            </p>
          </div>

          <div className="flex justify-between gap-1">
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                onClick={() => onRate(rating)}
                className="rounded-full p-1.5 text-gray-600 transition hover:scale-110 hover:text-yellow-400 md:p-2"
                aria-label={`Noter ${rating} sur 5`}
              >
                <Star className="h-5 w-5 fill-current md:h-6 md:w-6" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {isFront && (
        <>
          <motion.div
            style={{ opacity: blueOverlay }}
            className="pointer-events-none absolute inset-0 bg-blue-500 mix-blend-overlay"
          />
          <motion.div
            style={{ opacity: redOverlay }}
            className="pointer-events-none absolute inset-0 bg-red-500 mix-blend-overlay"
          />
        </>
      )}
    </motion.div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Clock3, Flame, Sparkles, Star, Users } from "lucide-react";
import { API_URL } from "@/config";
import { buildAuthHeaders, clearStoredSession, getStoredToken } from "@/lib/auth";
import MobilePageHeader from "@/components/MobilePageHeader";
import MovieDetailsModal from "@/components/MovieDetailsModal";

interface MovieCardData {
  id: number;
  title: string;
  poster_url: string;
  rating: number;
  overview?: string;
  username?: string;
  added_at?: string;
}

interface MovieDetail extends MovieCardData {
  trailer_url?: string;
  cast?: { name: string; character: string; photo: string | null }[];
  release_date?: string;
}

interface HighlightsPayload {
  popular_now: MovieCardData[];
  tailored_for_you: MovieCardData[];
  discovery_for_you: MovieCardData[];
  friends_recent_ratings: MovieCardData[];
}

interface MovieRailProps {
  title: string;
  subtitle: string;
  icon: typeof Flame;
  movies: MovieCardData[];
  onOpenMovie: (movieId: number) => void;
  emptyLabel: string;
  accentClass: string;
  metaRenderer?: (movie: MovieCardData) => string | null;
}

function formatFriendMeta(movie: MovieCardData): string | null {
  if (!movie.username) {
    return null;
  }
  return `Note par @${movie.username}`;
}

function MovieRail({
  title,
  subtitle,
  icon: Icon,
  movies,
  onOpenMovie,
  emptyLabel,
  accentClass,
  metaRenderer,
}: MovieRailProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] ${accentClass}`}>
            <Icon className="h-3.5 w-3.5" />
            {title}
          </div>
          <p className="mt-2 text-sm text-gray-400">{subtitle}</p>
        </div>
        <ArrowRight className="hidden h-4 w-4 text-gray-600 md:block" />
      </div>

      {movies.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] px-5 py-8 text-sm text-gray-500">
          {emptyLabel}
        </div>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max gap-3">
            {movies.map((movie) => {
              const meta = metaRenderer?.(movie);
              return (
                <button
                  key={`${title}-${movie.id}-${movie.username ?? ""}-${movie.added_at ?? ""}`}
                  onClick={() => onOpenMovie(movie.id)}
                  className="w-32 flex-shrink-0 text-left transition-transform hover:scale-[1.02] md:w-40"
                >
                  <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.03] shadow-[0_14px_32px_rgba(0,0,0,0.28)]">
                    <img
                      src={movie.poster_url}
                      alt={movie.title}
                      className="aspect-[2/3] w-full object-cover"
                    />
                    <div className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[10px] font-bold text-yellow-300 backdrop-blur">
                      <Star className="h-3 w-3 fill-current" />
                      {movie.rating.toFixed(1)}
                    </div>
                  </div>
                  <div className="mt-2 px-1">
                    <div className="line-clamp-2 text-sm font-bold text-white">{movie.title}</div>
                    {meta ? <div className="mt-1 text-xs text-gray-400">{meta}</div> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

export default function NewsPage() {
  const router = useRouter();
  const [payload, setPayload] = useState<HighlightsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMovie, setSelectedMovie] = useState<MovieDetail | null>(null);
  const [error, setError] = useState("");

  const totalMovies = useMemo(() => {
    if (!payload) {
      return 0;
    }
    return (
      payload.popular_now.length
      + payload.tailored_for_you.length
      + payload.discovery_for_you.length
      + payload.friends_recent_ratings.length
    );
  }, [payload]);

  const redirectToLogin = () => {
    clearStoredSession();
    router.push("/login");
  };

  useEffect(() => {
    const fetchHighlights = async () => {
      const token = getStoredToken();
      if (!token) {
        redirectToLogin();
        return;
      }

      try {
        const res = await fetch(`${API_URL}/movies/news/highlights`, {
          headers: buildAuthHeaders(token),
        });

        if (res.status === 401) {
          redirectToLogin();
          return;
        }

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.detail ?? "Impossible de charger les collections de films");
        }

        setPayload(data);
        setError("");
      } catch (fetchError) {
        console.error(fetchError);
        setError("Impossible de charger les selections du moment.");
      } finally {
        setLoading(false);
      }
    };

    void fetchHighlights();
  }, [router]);

  const openDetails = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/movie/${id}`);
      const data = await res.json();
      setSelectedMovie(data);
      setError("");
    } catch (detailError) {
      console.error(detailError);
      setError("Impossible de charger les détails de ce film.");
    }
  };

  return (
    <main className="min-h-screen bg-black px-4 pb-24 pt-3 text-white md:p-4 md:pb-24">
      <MobilePageHeader
        title="A l'affiche"
        subtitle="Des rails penses pour tes envies, ta curiosite et tes amis"
        icon={Clock3}
        accent="amber"
        trailing={
          totalMovies > 0 ? (
            <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[11px] font-semibold text-white">
              {totalMovies}
            </div>
          ) : null
        }
      />

      <h1 className="mb-6 hidden text-2xl font-bold tracking-tighter text-red-600 md:block">A l&apos;affiche</h1>

      {error && (
        <div className="mx-auto mb-4 max-w-3xl rounded-2xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}

      {loading || !payload ? (
        <p className="mt-10 text-center text-gray-500">Chargement des collections...</p>
      ) : (
        <div className="space-y-8 md:space-y-10">
          <MovieRail
            title="Nouvelles Sorties"
            subtitle="Les sorties les plus populaires du moment"
            icon={Flame}
            movies={payload.popular_now}
            onOpenMovie={(movieId) => void openDetails(movieId)}
            emptyLabel="Aucune sortie populaire disponible pour le moment."
            accentClass="border-amber-500/20 bg-amber-500/10 text-amber-200"
          />

          <MovieRail
            title="Pour Toi"
            subtitle="Une selection IA qui colle a ce que tu aimes deja"
            icon={Sparkles}
            movies={payload.tailored_for_you}
            onOpenMovie={(movieId) => void openDetails(movieId)}
            emptyLabel="L'IA n'a pas encore assez de signaux pour personnaliser cette ligne."
            accentClass="border-red-500/20 bg-red-500/10 text-red-200"
          />

          <MovieRail
            title="Decouverte"
            subtitle="Des films plus inattendus que tu pourrais quand meme aimer"
            icon={Sparkles}
            movies={payload.discovery_for_you}
            onOpenMovie={(movieId) => void openDetails(movieId)}
            emptyLabel="La ligne decouverte est vide pour l'instant."
            accentClass="border-sky-500/20 bg-sky-500/10 text-sky-200"
          />

          <MovieRail
            title="Notes Par Tes Amis"
            subtitle="Les derniers films notes par les personnes que tu suis"
            icon={Users}
            movies={payload.friends_recent_ratings}
            onOpenMovie={(movieId) => void openDetails(movieId)}
            emptyLabel="Aucun ami suivi n'a encore note de film recemment."
            accentClass="border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
            metaRenderer={formatFriendMeta}
          />
        </div>
      )}

      <MovieDetailsModal
        movie={selectedMovie}
        onClose={() => setSelectedMovie(null)}
      />
    </main>
  );
}

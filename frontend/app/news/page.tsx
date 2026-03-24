"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Star } from "lucide-react";
import { API_URL } from "@/config";
import { clearStoredSession } from "@/lib/auth";
import MobilePageHeader from "@/components/MobilePageHeader";
import MovieDetailsModal from "@/components/MovieDetailsModal";

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
  const [error, setError] = useState("");

  const redirectToLogin = () => {
    clearStoredSession();
    router.push("/login");
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
        subtitle="Les sorties a surveiller en ce moment"
        icon={Clock}
        accent="amber"
        trailing={
          movies.length > 0 ? (
            <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[11px] font-semibold text-white">
              {movies.length}
            </div>
          ) : null
        }
      />

      <h1 className="mb-6 hidden text-2xl font-bold tracking-tighter text-red-600 md:block">A l&apos;affiche</h1>

      {error && (
        <div className="mx-auto mb-4 max-w-lg rounded-2xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}

      {loading ? (
        <p className="mt-10 text-center text-gray-500">Chargement des sorties...</p>
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

          <div className="hidden grid-cols-2 gap-4 md:grid md:grid-cols-4 lg:grid-cols-5">
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
        </>
      )}

      <MovieDetailsModal
        movie={selectedMovie}
        onClose={() => setSelectedMovie(null)}
      />
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Clock3, PlayCircle, Star, Tv2 } from "lucide-react";
import OpenInQulteButton from "@/components/OpenInQulteButton";
import { API_URL } from "@/config";

interface MovieWatchProvider {
  id: number;
  name: string;
  logo_url: string | null;
  web_url?: string | null;
}

interface PublicMovieDetails {
  id: number;
  title: string;
  overview: string;
  rating: number;
  poster_url: string;
  trailer_url: string | null;
  release_date: string;
  runtime: number;
  tagline: string;
  genres: string[];
  directors: string[];
  watch_providers: {
    link: string;
    subscription: MovieWatchProvider[];
    rent: MovieWatchProvider[];
    buy: MovieWatchProvider[];
  };
}

const FALLBACK_POSTER = "https://via.placeholder.com/500x750?text=No+Image";

async function fetchPublicMovie(movieId: string): Promise<PublicMovieDetails | null> {
  const res = await fetch(`${API_URL}/movie/${movieId}`, {
    cache: "no-store",
  }).catch(() => null);

  if (!res || !res.ok) {
    return null;
  }

  const payload = (await res.json()) as PublicMovieDetails;
  if (!payload || typeof payload.id !== "number") {
    return null;
  }

  return payload;
}

function formatMeta(movie: PublicMovieDetails) {
  const items = [
    movie.release_date?.slice(0, 4),
    movie.runtime ? `${movie.runtime} min` : "",
    movie.rating ? `${movie.rating.toFixed(1)} / 10` : "",
  ].filter(Boolean);

  return items.join(" • ");
}

function ProviderStrip({
  title,
  providers,
}: {
  title: string;
  providers: MovieWatchProvider[];
}) {
  if (!providers.length) {
    return null;
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-gray-500">{title}</h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {providers.map((provider) => (
          <a
            key={`${title}-${provider.id}`}
            href={provider.web_url || undefined}
            target={provider.web_url ? "_blank" : undefined}
            rel={provider.web_url ? "noreferrer" : undefined}
            className="flex min-w-[120px] flex-shrink-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3"
          >
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-black/40">
              {provider.logo_url ? (
                <img src={provider.logo_url} alt={provider.name} className="h-full w-full object-cover" />
              ) : (
                <Tv2 className="h-4 w-4 text-gray-500" />
              )}
            </div>
            <span className="line-clamp-2 text-xs font-semibold text-gray-100">{provider.name}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const movie = await fetchPublicMovie(id);

  if (!movie) {
    return {
      title: "Film introuvable",
    };
  }

  return {
    title: movie.title,
    description: movie.overview || `Découvre ${movie.title} sur Qulte.`,
    openGraph: {
      title: movie.title,
      description: movie.overview || `Découvre ${movie.title} sur Qulte.`,
      images: movie.poster_url ? [{ url: movie.poster_url }] : [],
    },
  };
}

export default async function MovieSharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const movie = await fetchPublicMovie(id);

  if (!movie) {
    return (
      <main className="min-h-screen bg-black px-4 pb-20 pt-6 text-white">
        <div className="mx-auto flex max-w-xl flex-col items-center gap-4 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-gray-500">Qulte</p>
          <h1 className="text-3xl font-black">Fiche film indisponible</h1>
          <p className="max-w-md text-sm text-gray-400">
            Ce lien n&apos;est plus disponible pour le moment.
          </p>
          <Link
            href="/"
            className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/10 px-5 py-3 text-sm font-bold text-white"
          >
            Revenir à Qulte
          </Link>
        </div>
      </main>
    );
  }

  const metaLine = formatMeta(movie);

  return (
    <main className="min-h-screen bg-black px-4 pb-20 pt-4 text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <div className="grid gap-6 md:grid-cols-[320px_minmax(0,1fr)] md:items-start">
          <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] shadow-[0_24px_60px_rgba(0,0,0,0.34)]">
            <img
              src={movie.poster_url || FALLBACK_POSTER}
              alt={movie.title}
              className="h-full w-full object-cover"
            />
          </div>

          <div className="space-y-5">
            <div className="space-y-3">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-300">Qulte</p>
              <h1 className="text-4xl font-black tracking-tight text-white md:text-5xl">{movie.title}</h1>
              {metaLine ? <p className="text-sm font-medium text-gray-300">{metaLine}</p> : null}
              {movie.tagline ? <p className="text-base font-semibold text-pink-200">{movie.tagline}</p> : null}
              {movie.genres.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {movie.genres.map((genre) => (
                    <span
                      key={genre}
                      className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-gray-100"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <OpenInQulteButton movieId={movie.id} />

            <div className="flex flex-wrap gap-3">
              {movie.trailer_url ? (
                <a
                  href={movie.trailer_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white"
                >
                  <PlayCircle className="h-4 w-4" />
                  Bande-annonce
                </a>
              ) : null}
              {movie.watch_providers.link ? (
                <a
                  href={movie.watch_providers.link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white"
                >
                  <Tv2 className="h-4 w-4" />
                  Où le regarder
                </a>
              ) : null}
            </div>

            {movie.overview ? (
              <section className="space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-gray-500">Synopsis</h2>
                <p className="max-w-2xl text-base leading-7 text-gray-200">{movie.overview}</p>
              </section>
            ) : null}

            {movie.directors.length > 0 ? (
              <section className="space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-gray-500">Réalisation</h2>
                <p className="text-base text-gray-200">{movie.directors.join(", ")}</p>
              </section>
            ) : null}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] px-5 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-yellow-400/12 text-yellow-300">
                <Star className="h-5 w-5 fill-current" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Note</p>
                <p className="text-lg font-black text-white">{movie.rating.toFixed(1)} / 10</p>
              </div>
            </div>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] px-5 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/12 text-cyan-300">
                <Clock3 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Durée</p>
                <p className="text-lg font-black text-white">{movie.runtime ? `${movie.runtime} min` : "Inconnue"}</p>
              </div>
            </div>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] px-5 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-fuchsia-400/12 text-fuchsia-300">
                <Tv2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Plateformes</p>
                <p className="text-lg font-black text-white">
                  {movie.watch_providers.subscription.length +
                    movie.watch_providers.rent.length +
                    movie.watch_providers.buy.length}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <ProviderStrip title="Abonnement" providers={movie.watch_providers.subscription} />
          <ProviderStrip title="Location" providers={movie.watch_providers.rent} />
          <ProviderStrip title="Achat" providers={movie.watch_providers.buy} />
        </div>
      </div>
    </main>
  );
}

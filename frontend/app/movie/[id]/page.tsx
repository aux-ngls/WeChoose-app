import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PlayCircle, Tv2 } from "lucide-react";
import { API_URL } from "@/config";

interface MovieWatchProvider {
  id: number;
  name: string;
  logo_url: string | null;
  web_url?: string | null;
}

interface MovieCastMember {
  id: number | null;
  name: string;
  character: string;
  photo: string | null;
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
  cast: MovieCastMember[];
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
    movie.release_date?.trim(),
    movie.runtime ? `${movie.runtime} min` : "",
    movie.rating ? `${movie.rating.toFixed(1)} / 10` : "",
  ].filter(Boolean);

  return items.join(" • ");
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-[18px] font-extrabold tracking-[-0.03em] text-white">{children}</h2>;
}

function ActionButton({
  href,
  icon,
  label,
}: {
  href: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex min-h-[78px] flex-1 flex-col items-center justify-center gap-[7px] rounded-[22px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.09)] px-2 py-4 text-center transition hover:border-white/20 hover:bg-[rgba(255,255,255,0.12)]"
    >
      <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[13px] bg-[rgba(255,255,255,0.055)] text-white">
        {icon}
      </span>
      <span className="text-xs font-black tracking-[0.02em] text-white">{label}</span>
    </a>
  );
}

function ProviderGroup({
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
      <p className="text-sm font-bold text-slate-300">{title}</p>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {providers.map((provider) => (
          <a
            key={`${title}-${provider.id}`}
            href={provider.web_url || undefined}
            target={provider.web_url ? "_blank" : undefined}
            rel={provider.web_url ? "noreferrer" : undefined}
            className="flex w-24 flex-shrink-0 flex-col gap-2 rounded-[18px] bg-white/[0.05] p-2.5 transition hover:bg-white/[0.08]"
          >
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white/[0.06]">
              {provider.logo_url ? (
                <img src={provider.logo_url} alt={provider.name} className="h-full w-full object-cover" />
              ) : (
                <Tv2 className="h-4 w-4 text-slate-500" />
              )}
            </div>
            <span className="text-xs font-bold leading-4 text-white">{provider.name}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

function CastStrip({ cast }: { cast: MovieCastMember[] }) {
  if (!cast.length) {
    return null;
  }

  return (
    <section className="space-y-3">
      <SectionTitle>Casting</SectionTitle>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {cast.map((member) => (
          <div key={`${member.id ?? member.name}-${member.character}`} className="flex w-[116px] flex-shrink-0 flex-col gap-2">
            <img
              src={member.photo || FALLBACK_POSTER}
              alt={member.name}
              className="aspect-[0.74] w-full rounded-[18px] object-cover"
            />
            <p className="text-sm font-extrabold leading-4 text-white">{member.name}</p>
            <p className="text-xs leading-4 text-slate-400">{member.character}</p>
          </div>
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
      <main className="min-h-screen bg-[#07070A] px-4 pb-20 pt-8 text-white">
        <div className="mx-auto flex max-w-xl flex-col items-center gap-4 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#8ed3ff]">Qulte</p>
          <h1 className="text-3xl font-black tracking-[-0.05em]">Fiche film indisponible</h1>
          <p className="max-w-md text-sm text-slate-400">
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
  const providerGroups = [
    { title: "Abonnement", items: movie.watch_providers.subscription },
    { title: "Location", items: movie.watch_providers.rent },
    { title: "Achat", items: movie.watch_providers.buy },
  ].filter((group) => group.items.length > 0);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07070A] px-4 pb-20 pt-5 text-white">
      <div className="pointer-events-none absolute -right-12 top-[-72px] h-[210px] w-[210px] rounded-full bg-[rgba(200,74,95,0.13)]" />
      <div className="pointer-events-none absolute -left-12 bottom-24 h-[170px] w-[170px] rounded-full bg-[rgba(142,211,255,0.10)]" />
      <div className="pointer-events-none absolute right-[-32px] top-10 text-[210px] font-black tracking-[-22px] text-[rgba(200,74,95,0.055)]">
        Q
      </div>
      <div className="pointer-events-none absolute left-3 top-24 hidden w-[10px] flex-col items-center gap-2 rounded-full bg-[rgba(255,255,255,0.032)] py-2 md:flex">
        {Array.from({ length: 9 }).map((_, index) => (
          <span key={index} className="h-1 w-1 rounded-full bg-[rgba(200,74,95,0.18)]" />
        ))}
      </div>

      <div className="relative z-[1] mx-auto flex max-w-[620px] flex-col gap-[18px]">
        <div className="space-y-3">
          <p className="text-center text-sm font-semibold uppercase tracking-[0.24em] text-[#8ed3ff]">Qulte</p>
          <div className="overflow-hidden rounded-[30px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.055)] shadow-[0_24px_60px_rgba(0,0,0,0.34)]">
            <div className="relative">
              <img
                src={movie.poster_url || FALLBACK_POSTER}
                alt={movie.title}
                className="aspect-[2/3] w-full object-cover"
              />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to bottom, rgba(7,10,18,0.02) 0%, rgba(7,10,18,0.18) 38%, rgba(7,10,18,0.68) 72%, rgba(7,10,18,0.96) 100%)",
                }}
              />
              <div className="absolute inset-x-0 bottom-0 flex flex-col gap-[10px] px-[18px] pb-[18px] pt-14">
                <h1 className="text-[30px] font-black tracking-[-0.06em] text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.42)] md:text-[34px]">
                  {movie.title}
                </h1>
                {metaLine ? (
                  <p className="text-[13px] leading-5 text-[#e2e8f0] drop-shadow-[0_1px_8px_rgba(0,0,0,0.36)]">
                    {metaLine}
                  </p>
                ) : null}
                {movie.tagline ? (
                  <p className="text-[14px] font-bold leading-5 text-[#f9d2e7] drop-shadow-[0_1px_6px_rgba(0,0,0,0.34)]">
                    {movie.tagline}
                  </p>
                ) : null}
                {movie.genres.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {movie.genres.map((genre) => (
                      <span
                        key={genre}
                        className="rounded-full border border-[rgba(255,255,255,0.10)] bg-[rgba(15,23,42,0.40)] px-3 py-2 text-xs font-bold text-white backdrop-blur-sm"
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {movie.trailer_url ? (
          <section className="space-y-[14px] px-0.5 py-0.5">
            <ActionButton href={movie.trailer_url} icon={<PlayCircle className="h-[22px] w-[22px]" />} label="Trailer" />
          </section>
        ) : null}

        {movie.overview ? (
          <section className="space-y-[14px] px-0.5 py-0.5">
            <SectionTitle>Synopsis</SectionTitle>
            <p className="text-[14px] leading-[22px] text-[#cbd5e1]">{movie.overview}</p>
          </section>
        ) : null}

        {movie.directors.length > 0 ? (
          <section className="space-y-[14px] px-0.5 py-0.5">
            <SectionTitle>Réalisation</SectionTitle>
            <p className="text-[14px] leading-[22px] text-[#cbd5e1]">{movie.directors.join(", ")}</p>
          </section>
        ) : null}

        {providerGroups.length > 0 ? (
          <section className="space-y-[14px] px-0.5 py-0.5">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle>Où le regarder</SectionTitle>
              {movie.watch_providers.link ? (
                <a
                  href={movie.watch_providers.link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-bold text-[#8ed3ff] transition hover:brightness-110"
                >
                  Voir
                </a>
              ) : null}
            </div>
            <div className="space-y-4">
              {providerGroups.map((group) => (
                <ProviderGroup key={group.title} title={group.title} providers={group.items} />
              ))}
            </div>
          </section>
        ) : null}

        <CastStrip cast={movie.cast} />
      </div>
    </main>
  );
}

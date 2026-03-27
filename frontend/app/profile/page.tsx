"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Clock3,
  Film,
  Heart,
  Loader2,
  LogOut,
  Bookmark,
  Star,
  Users,
} from "lucide-react";
import { API_URL } from "@/config";
import { buildAuthHeaders, clearStoredSession, getStoredToken } from "@/lib/auth";
import MobilePageHeader from "@/components/MobilePageHeader";
import {
  FAVORITES_PLAYLIST_ID,
  HISTORY_PLAYLIST_ID,
  WATCH_LATER_PLAYLIST_ID,
  type PlaylistSummary,
} from "@/lib/playlists";
import { FALLBACK_POSTER, formatSocialDate, type SocialProfile } from "@/lib/social";

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

const PLAYLIST_ORDER = [
  WATCH_LATER_PLAYLIST_ID,
  FAVORITES_PLAYLIST_ID,
  HISTORY_PLAYLIST_ID,
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

export default function ProfilePage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistWithPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const redirectToLogin = () => {
    clearStoredSession();
    router.push("/login");
  };

  const handleLogout = () => {
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
        const [profileRes, playlistsRes] = await Promise.all([
          fetch(`${API_URL}/social/profile/${encodeURIComponent(storedUsername)}?limit=8`, {
            headers: buildAuthHeaders(token),
          }),
          fetch(`${API_URL}/playlists`, {
            headers: buildAuthHeaders(token),
          }),
        ]);

        if (profileRes.status === 401 || playlistsRes.status === 401) {
          redirectToLogin();
          return;
        }

        const profilePayload = await profileRes.json();
        const playlistsPayload = await playlistsRes.json();

        if (!profileRes.ok) {
          throw new Error(profilePayload?.detail ?? "Impossible de charger ton profil");
        }
        if (!Array.isArray(playlistsPayload)) {
          throw new Error("Impossible de charger tes playlists");
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

  const totalMoviesSaved = useMemo(
    () => playlists.reduce((sum, playlist) => sum + playlist.count, 0),
    [playlists],
  );
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
  const nextWatchMovie = watchLaterPlaylist?.preview_movies[0] ?? null;
  const recentFavoriteMovie = favoritesPlaylist?.preview_movies[0] ?? null;
  const customPlaylistsCount = useMemo(
    () => playlists.filter((playlist) => playlist.type === "custom").length,
    [playlists],
  );

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
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-300 md:text-base">
                    Tes espaces secondaires vivent ici : listes, apercus personnels et points de reprise.
                  </p>
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
                A l'affiche
              </Link>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard label="Playlists" value={String(playlists.length)} icon={Film} />
            <StatCard label="Films sauves" value={String(totalMoviesSaved)} icon={Clock3} />
            <StatCard label="Critiques" value={String(profile?.reviews_count ?? 0)} icon={Star} />
            <StatCard label="Abonnes" value={String(profile?.followers_count ?? 0)} icon={Users} />
            <StatCard label="Favoris" value={String(profile?.favorites_count ?? 0)} icon={Heart} />
          </div>
        </section>

        <section className="mt-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black tracking-tight md:text-2xl">Mes playlists</h2>
              <p className="mt-1 text-sm text-gray-400">Retrouve toutes tes listes avec un apercu rapide.</p>
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
                      <div key={`${playlist.id}-${movie.id}`} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
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
                <p className="mt-1 text-sm text-gray-400">Tes avis recents visibles depuis le social.</p>
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
              <h2 className="text-lg font-black text-white md:text-xl">En ce moment</h2>
              <p className="mt-1 text-sm text-gray-400">Une vue rapide sur ce que tu as envie de regarder et sur ton rythme d'usage.</p>
            </div>

            <div className="grid gap-3">
              <ContextCard
                title={nextWatchMovie ? "Ta prochaine séance" : "Ta watchlist t'attend"}
                description={
                  nextWatchMovie
                    ? `${nextWatchMovie.title} ouvre la file, avec ${watchLaterPlaylist?.count ?? 0} film${(watchLaterPlaylist?.count ?? 0) > 1 ? "s" : ""} en attente.`
                    : "Ajoute quelques films à regarder plus tard pour te créer une vraie file d'envies."
                }
                meta={watchLaterPlaylist ? `${watchLaterPlaylist.count} en attente` : "0 en attente"}
                href={watchLaterPlaylist ? buildPlaylistHref(watchLaterPlaylist.id) : "/playlist"}
                posterUrl={nextWatchMovie?.poster_url}
              />
              <ContextCard
                title={recentFavoriteMovie ? "Ton humeur du moment" : "Tes coups de coeur"}
                description={
                  recentFavoriteMovie
                    ? `${recentFavoriteMovie.title} donne le ton de tes favoris recents.`
                    : "Quand tu notes des films 4 ou 5, on les retrouve ici pour construire ton profil cine."
                }
                meta={favoritesPlaylist ? `${favoritesPlaylist.count} favoris` : "0 favoris"}
                href={favoritesPlaylist ? buildPlaylistHref(favoritesPlaylist.id) : "/playlist"}
                posterUrl={recentFavoriteMovie?.poster_url}
              />
              <MiniInsight
                label="Historique"
                value={String(historyPlaylist?.count ?? 0)}
                caption="films deja notes ou passes"
              />
              <MiniInsight
                label="Listes perso"
                value={String(customPlaylistsCount)}
                caption="collections que tu as creees"
              />
            </div>
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

function MiniInsight({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-black/16 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">{label}</div>
      <div className="mt-2 text-2xl font-black text-white">{value}</div>
      <div className="mt-1 text-xs text-gray-400">{caption}</div>
    </div>
  );
}

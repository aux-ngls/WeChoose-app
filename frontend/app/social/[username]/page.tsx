"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Heart, Loader2, Sparkles, Star, UserMinus, UserPlus, Users } from "lucide-react";
import { API_URL } from "@/config";
import { buildAuthHeaders, getStoredToken } from "@/lib/auth";
import SoundtrackPreviewCard from "@/components/SoundtrackPreviewCard";
import {
  FALLBACK_POSTER,
  type SocialProfile,
  type SocialReview,
  formatSocialDate,
} from "@/lib/social";

export default function SocialProfilePage() {
  const params = useParams<{ username: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingFollow, setPendingFollow] = useState(false);
  const [pendingReviewIds, setPendingReviewIds] = useState<number[]>([]);

  const username = Array.isArray(params?.username) ? params.username[0] : params?.username;

  const redirectToLogin = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
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

  const fetchProfile = async () => {
    if (!username) {
      setError("Profil introuvable.");
      setLoading(false);
      return;
    }

    const token = getTokenOrRedirect();
    if (!token) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/social/profile/${encodeURIComponent(username)}?limit=30`, {
        headers: buildAuthHeaders(token),
      });
      const payload = await res.json();

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      if (!res.ok) {
        throw new Error(payload?.detail ?? "Impossible de charger ce profil");
      }

      setProfile(payload as SocialProfile);
      setError("");
    } catch (fetchError) {
      console.error(fetchError);
      setError(fetchError instanceof Error ? fetchError.message : "Impossible de charger ce profil");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchProfile();
  }, [username]);

  const toggleFollow = async () => {
    if (!profile || profile.is_self) {
      return;
    }

    const token = getTokenOrRedirect();
    if (!token) {
      return;
    }

    setPendingFollow(true);
    try {
      const res = await fetch(`${API_URL}/social/follow/${profile.id}`, {
        method: profile.is_following ? "DELETE" : "POST",
        headers: buildAuthHeaders(token),
      });
      const payload = await res.json().catch(() => ({}));

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      if (!res.ok) {
        throw new Error(payload?.detail ?? "Impossible de modifier cet abonnement");
      }

      setProfile((current) =>
        current
          ? {
              ...current,
              is_following: !current.is_following,
              followers_count: Math.max(
                0,
                current.followers_count + (current.is_following ? -1 : 1),
              ),
            }
          : current,
      );
      setError("");
    } catch (followError) {
      console.error(followError);
      setError(
        followError instanceof Error
          ? followError.message
          : "Impossible de modifier cet abonnement",
      );
    } finally {
      setPendingFollow(false);
    }
  };

  const toggleLike = async (review: SocialReview) => {
    const token = getTokenOrRedirect();
    if (!token) {
      return;
    }

    setPendingReviewIds((current) => [...current, review.id]);
    try {
      const res = await fetch(`${API_URL}/social/reviews/${review.id}/like`, {
        method: "POST",
        headers: buildAuthHeaders(token),
      });
      const payload = await res.json();

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      if (!res.ok) {
        throw new Error(payload?.detail ?? "Impossible de liker cette critique");
      }

      setProfile((current) =>
        current
          ? {
              ...current,
              reviews: current.reviews.map((entry) =>
                entry.id !== review.id
                  ? entry
                  : {
                      ...entry,
                      liked_by_me: Boolean(payload.liked),
                      likes_count: Number(payload.likes_count ?? entry.likes_count),
                    },
              ),
            }
          : current,
      );
      setError("");
    } catch (likeError) {
      console.error(likeError);
      setError(
        likeError instanceof Error ? likeError.message : "Impossible de liker cette critique",
      );
    } finally {
      setPendingReviewIds((current) => current.filter((id) => id !== review.id));
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-gray-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement du profil...
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-black px-4 py-10 text-white">
        <div className="mx-auto max-w-3xl rounded-[28px] border border-red-500/20 bg-red-500/10 p-6 text-red-100">
          {error || "Profil introuvable."}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.20),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(239,68,68,0.18),_transparent_30%),#000] px-4 py-4 text-white md:py-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex items-center justify-between gap-2 md:gap-3">
          <Link
            href="/social"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.08] md:px-4"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Retour au social</span>
            <span className="sm:hidden">Retour</span>
          </Link>

          <button
            type="button"
            onClick={() => void fetchProfile()}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.08] md:px-4"
          >
            Actualiser
          </button>
        </div>

        <section className="overflow-hidden rounded-[26px] border border-white/10 bg-white/[0.04] shadow-[0_25px_80px_rgba(0,0,0,0.45)] backdrop-blur-md md:rounded-[32px]">
          <div className="grid gap-4 p-4 md:grid-cols-[1.2fr_0.8fr] md:gap-6 md:p-8">
            <div>
              <div className="mb-3 inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200">
                Profil public
              </div>
              <h1 className="text-3xl font-black tracking-tight md:text-5xl">@{profile.username}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-300 md:mt-3 md:text-base">
                Toutes les critiques publiees par ce compte restent visibles ici, avec ses
                statistiques sociales et ses reactions.
              </p>

              {!profile.is_self && (
                <div className="mt-5 grid gap-2 sm:flex sm:flex-wrap sm:gap-3 md:mt-6">
                  <button
                    type="button"
                    onClick={() => void toggleFollow()}
                    disabled={pendingFollow}
                    className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold transition ${
                      profile.is_following
                        ? "border border-white/10 bg-white/[0.06] text-white hover:bg-white/[0.12]"
                        : "bg-amber-500 text-black hover:bg-amber-400"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {pendingFollow ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : profile.is_following ? (
                      <UserMinus className="h-4 w-4" />
                    ) : (
                      <UserPlus className="h-4 w-4" />
                    )}
                    {profile.is_following ? "Ne plus suivre" : "Suivre ce profil"}
                  </button>

                  <Link
                    href={`/messages?userId=${profile.id}`}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-white transition hover:bg-white/[0.08]"
                  >
                    Ecrire
                  </Link>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 md:gap-3">
              <div className="rounded-[22px] border border-white/10 bg-black/30 p-3.5 md:rounded-[26px] md:p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Critiques</div>
                <div className="mt-2 text-2xl font-black md:text-3xl">{profile.reviews_count}</div>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-black/30 p-3.5 md:rounded-[26px] md:p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Favoris notes</div>
                <div className="mt-2 text-2xl font-black md:text-3xl">{profile.favorites_count}</div>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-black/30 p-3.5 md:rounded-[26px] md:p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Abonnes</div>
                <div className="mt-2 text-2xl font-black md:text-3xl">{profile.followers_count}</div>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-black/30 p-3.5 md:rounded-[26px] md:p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Abonnements</div>
                <div className="mt-2 text-2xl font-black md:text-3xl">{profile.following_count}</div>
              </div>
            </div>
          </div>
        </section>

        {(profile.profile_movies.length > 0 ||
          profile.profile_people.length > 0 ||
          profile.profile_genres.length > 0 ||
          profile.profile_soundtrack) && (
          <section className="rounded-[24px] border border-white/10 bg-zinc-950/85 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.4)] md:rounded-[32px] md:p-6">
            <div className="mb-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">
                <Sparkles className="h-3.5 w-3.5" />
                Vitrine cine
              </div>
              <h2 className="mt-3 text-xl font-black tracking-tight md:text-2xl">
                Ce qui definit @{profile.username}
              </h2>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                  Films totems
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
                  {profile.profile_movies.map((movie) => (
                    <div key={movie.id} className="overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.04]">
                      <img
                        src={movie.poster_url || FALLBACK_POSTER}
                        alt={movie.title}
                        className="aspect-[2/3] w-full object-cover"
                      />
                      <div className="px-2 py-2 text-xs font-semibold text-white line-clamp-2">
                        {movie.title}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Personnes clefs
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-2">
                    {profile.profile_people.map((person) => (
                      <div
                        key={`${person.id ?? person.name}-${person.name}`}
                        className="overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.04] p-2.5 sm:flex sm:items-center sm:gap-3 sm:px-3 sm:py-3"
                      >
                        <div className="aspect-[2/3] w-full overflow-hidden rounded-[16px] border border-white/10 bg-white/[0.04] sm:h-12 sm:w-12 sm:rounded-2xl">
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
                        <div className="mt-2 min-w-0 flex-1 sm:mt-0">
                          <div className="truncate text-sm font-semibold text-white">
                            {person.name}
                          </div>
                          <div className="mt-1 text-xs text-gray-400">
                            {person.known_for_department || "Cinema"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {profile.profile_soundtrack ? (
                  <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                      Musique favorite
                    </div>
                    <SoundtrackPreviewCard soundtrack={profile.profile_soundtrack} />
                  </div>
                ) : null}

                <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Genres
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {profile.profile_genres.map((genre) => (
                      <span
                        key={genre}
                        className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-white"
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {error && (
          <div className="rounded-[24px] border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-100">
            {error}
          </div>
        )}

        <section className="rounded-[24px] border border-white/10 bg-zinc-950/85 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.4)] md:rounded-[32px] md:p-6">
          <div className="mb-4 md:mb-6">
            <div className="mb-2 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-gray-300">
              Film log
            </div>
            <h2 className="text-xl font-black tracking-tight md:text-2xl">
              Les critiques publiees par @{profile.username}
            </h2>
          </div>

          {profile.reviews.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-white/10 bg-black/20 px-6 py-14 text-center text-sm text-gray-500">
              Ce profil n&apos;a pas encore publie de critique.
            </div>
          ) : (
            <div className="space-y-4">
              {profile.reviews.map((review) => {
                const isPendingLike = pendingReviewIds.includes(review.id);
                return (
                  <article
                    key={review.id}
                    className="overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))]"
                  >
                    <div className="p-3.5 md:hidden">
                      <div className="flex items-start gap-3">
                        <img
                          src={review.poster_url || FALLBACK_POSTER}
                          alt={review.title}
                          className="h-24 w-16 flex-shrink-0 rounded-[18px] object-cover"
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                                Film
                              </div>
                              <div className="line-clamp-2 text-sm font-bold leading-5 text-white">
                                {review.title}
                              </div>
                            </div>

                            <div className="flex flex-shrink-0 items-center gap-1 rounded-full border border-yellow-400/20 bg-yellow-400/10 px-2.5 py-1 text-xs font-semibold text-yellow-300">
                              {Array.from({ length: 5 }).map((_, index) => (
                                <Star
                                  key={index}
                                  className={`h-3 w-3 ${
                                    index < review.rating ? "fill-current" : "text-yellow-600/40"
                                  }`}
                                />
                              ))}
                            </div>
                          </div>

                          <div className="mt-3 text-sm font-semibold text-amber-200">@{profile.username}</div>
                          <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-gray-500">
                            {formatSocialDate(review.created_at)}
                          </div>
                        </div>
                      </div>

                      <p className="mt-4 text-sm leading-6 text-gray-100">{review.content}</p>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <div className="text-xs text-gray-500">{review.comments_count} commentaires</div>

                        <button
                          type="button"
                          onClick={() => void toggleLike(review)}
                          disabled={isPendingLike}
                          className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition ${
                            review.liked_by_me
                              ? "bg-red-600 text-white hover:bg-red-500"
                              : "border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                          } disabled:cursor-not-allowed disabled:opacity-60`}
                        >
                          {isPendingLike ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Heart className={`h-4 w-4 ${review.liked_by_me ? "fill-current" : ""}`} />
                          )}
                          {review.likes_count}
                        </button>
                      </div>
                    </div>

                    <div className="hidden md:grid md:grid-cols-[160px_minmax(0,1fr)]">
                      <div className="relative min-h-[220px] bg-black">
                        <img
                          src={review.poster_url || FALLBACK_POSTER}
                          alt={review.title}
                          className="h-full w-full object-cover"
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-4 py-4">
                          <div className="text-xs uppercase tracking-[0.18em] text-gray-300">Film</div>
                          <div className="line-clamp-2 text-sm font-bold">{review.title}</div>
                        </div>
                      </div>

                      <div className="p-6">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-amber-200">@{profile.username}</div>
                            <div className="mt-1 text-xs uppercase tracking-[0.16em] text-gray-500">
                              {formatSocialDate(review.created_at)}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 rounded-full border border-yellow-400/20 bg-yellow-400/10 px-3 py-1 text-sm font-semibold text-yellow-300">
                            {Array.from({ length: 5 }).map((_, index) => (
                              <Star
                                key={index}
                                className={`h-3.5 w-3.5 ${
                                  index < review.rating ? "fill-current" : "text-yellow-600/40"
                                }`}
                              />
                            ))}
                          </div>
                        </div>

                        <p className="mt-5 text-[15px] leading-7 text-gray-100">{review.content}</p>

                        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-400">
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                              {review.comments_count} commentaires
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                              Critique sur {review.title}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => void toggleLike(review)}
                            disabled={isPendingLike}
                            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                              review.liked_by_me
                                ? "bg-red-600 text-white hover:bg-red-500"
                                : "border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                            } disabled:cursor-not-allowed disabled:opacity-60`}
                          >
                            {isPendingLike ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Heart className={`h-4 w-4 ${review.liked_by_me ? "fill-current" : ""}`} />
                            )}
                            {review.likes_count}
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

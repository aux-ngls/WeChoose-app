"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Heart, Loader2, Star, UserMinus, UserPlus } from "lucide-react";
import { API_URL } from "@/config";
import { buildAuthHeaders, getStoredToken } from "@/lib/auth";
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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.20),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(239,68,68,0.18),_transparent_30%),#000] px-4 py-6 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/social"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour au social
          </Link>

          <button
            type="button"
            onClick={() => void fetchProfile()}
            className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
          >
            Actualiser
          </button>
        </div>

        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.04] shadow-[0_25px_80px_rgba(0,0,0,0.45)] backdrop-blur-md">
          <div className="grid gap-6 p-6 md:grid-cols-[1.2fr_0.8fr] md:p-8">
            <div>
              <div className="mb-3 inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">
                Profil public
              </div>
              <h1 className="text-4xl font-black tracking-tight md:text-5xl">@{profile.username}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-300 md:text-base">
                Toutes les critiques publiees par ce compte restent visibles ici, avec ses
                statistiques sociales et ses reactions.
              </p>

              {!profile.is_self && (
                <button
                  type="button"
                  onClick={() => void toggleFollow()}
                  disabled={pendingFollow}
                  className={`mt-6 inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold transition ${
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
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[26px] border border-white/10 bg-black/30 p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Critiques</div>
                <div className="mt-2 text-3xl font-black">{profile.reviews_count}</div>
              </div>
              <div className="rounded-[26px] border border-white/10 bg-black/30 p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Favoris notes</div>
                <div className="mt-2 text-3xl font-black">{profile.favorites_count}</div>
              </div>
              <div className="rounded-[26px] border border-white/10 bg-black/30 p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Abonnes</div>
                <div className="mt-2 text-3xl font-black">{profile.followers_count}</div>
              </div>
              <div className="rounded-[26px] border border-white/10 bg-black/30 p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Abonnements</div>
                <div className="mt-2 text-3xl font-black">{profile.following_count}</div>
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-[24px] border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-100">
            {error}
          </div>
        )}

        <section className="rounded-[32px] border border-white/10 bg-zinc-950/85 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.4)] md:p-6">
          <div className="mb-6">
            <div className="mb-2 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-gray-300">
              Film log
            </div>
            <h2 className="text-2xl font-black tracking-tight">Les critiques publiees par @{profile.username}</h2>
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
                    <div className="grid gap-0 md:grid-cols-[160px_minmax(0,1fr)]">
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

                      <div className="p-5 md:p-6">
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

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Film,
  Heart,
  Loader2,
  MessageCircle,
  PenSquare,
  RefreshCcw,
  Search,
  Send,
  Star,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { API_URL } from "@/config";
import { buildAuthHeaders, getStoredToken } from "@/lib/auth";
import {
  FALLBACK_POSTER,
  type SearchMovie,
  type SocialComment,
  type SocialNotification,
  type SocialReview,
  type SocialUser,
  formatSocialDate,
} from "@/lib/social";
import MobilePageHeader from "@/components/MobilePageHeader";

interface NotificationsPayload {
  items: SocialNotification[];
  unread_count: number;
}

interface ReplyTarget {
  id: number;
  username: string;
}

export default function SocialPage() {
  const router = useRouter();
  const [feed, setFeed] = useState<SocialReview[]>([]);
  const [users, setUsers] = useState<SocialUser[]>([]);
  const [notifications, setNotifications] = useState<SocialNotification[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [movieQuery, setMovieQuery] = useState("");
  const [movieResults, setMovieResults] = useState<SearchMovie[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<SearchMovie | null>(null);
  const [reviewContent, setReviewContent] = useState("");
  const [reviewRating, setReviewRating] = useState(4);
  const [composerSearchMode, setComposerSearchMode] = useState<"movies" | "people">("movies");
  const [userQuery, setUserQuery] = useState("");
  const [commentsByReview, setCommentsByReview] = useState<Record<number, SocialComment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [replyTargets, setReplyTargets] = useState<Record<number, ReplyTarget | null>>({});
  const [openCommentReviews, setOpenCommentReviews] = useState<number[]>([]);
  const [mobileSection, setMobileSection] = useState<"feed" | "write" | "alerts">("feed");
  const [feedLoading, setFeedLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [movieSearchLoading, setMovieSearchLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [markingNotifications, setMarkingNotifications] = useState(false);
  const [composerError, setComposerError] = useState("");
  const [feedError, setFeedError] = useState("");
  const [usersError, setUsersError] = useState("");
  const [notificationsError, setNotificationsError] = useState("");
  const [searchError, setSearchError] = useState("");
  const [commentErrors, setCommentErrors] = useState<Record<number, string>>({});
  const [pendingReviewIds, setPendingReviewIds] = useState<number[]>([]);
  const [pendingUserIds, setPendingUserIds] = useState<number[]>([]);
  const [loadingCommentReviewIds, setLoadingCommentReviewIds] = useState<number[]>([]);
  const [submittingCommentReviewIds, setSubmittingCommentReviewIds] = useState<number[]>([]);

  const formattedNow = useMemo(
    () =>
      new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium",
      }).format(new Date()),
    [],
  );

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

  const isCommentsOpen = (reviewId: number) => openCommentReviews.includes(reviewId);

  const fetchFeed = async () => {
    const token = getTokenOrRedirect();
    if (!token) {
      return;
    }

    setFeedLoading(true);
    try {
      const res = await fetch(`${API_URL}/social/feed?limit=40`, {
        headers: buildAuthHeaders(token),
      });

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.detail ?? "Impossible de charger le feed");
      }

      setFeed(Array.isArray(payload) ? payload : []);
      setFeedError("");
    } catch (error) {
      console.error(error);
      setFeedError(error instanceof Error ? error.message : "Impossible de charger le feed");
    } finally {
      setFeedLoading(false);
    }
  };

  const fetchUsers = async (query: string) => {
    const token = getTokenOrRedirect();
    if (!token) {
      return;
    }

    setUsersLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/social/users?query=${encodeURIComponent(query.trim())}&limit=12`,
        {
          headers: buildAuthHeaders(token),
        },
      );

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.detail ?? "Impossible de charger les utilisateurs");
      }

      setUsers(Array.isArray(payload) ? payload : []);
      setUsersError("");
    } catch (error) {
      console.error(error);
      setUsersError(
        error instanceof Error ? error.message : "Impossible de charger les utilisateurs",
      );
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchNotifications = async () => {
    const token = getTokenOrRedirect();
    if (!token) {
      return;
    }

    setNotificationsLoading(true);
    try {
      const res = await fetch(`${API_URL}/social/notifications?limit=12`, {
        headers: buildAuthHeaders(token),
      });

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      const payload = (await res.json()) as NotificationsPayload;
      if (!res.ok) {
        throw new Error((payload as { detail?: string }).detail ?? "Impossible de charger les notifications");
      }

      setNotifications(Array.isArray(payload.items) ? payload.items : []);
      setUnreadNotifications(Number(payload.unread_count ?? 0));
      setNotificationsError("");
    } catch (error) {
      console.error(error);
      setNotificationsError(
        error instanceof Error ? error.message : "Impossible de charger les notifications",
      );
    } finally {
      setNotificationsLoading(false);
    }
  };

  const loadComments = async (reviewId: number) => {
    const token = getTokenOrRedirect();
    if (!token) {
      return;
    }

    setLoadingCommentReviewIds((current) => [...current, reviewId]);
    try {
      const res = await fetch(`${API_URL}/social/reviews/${reviewId}/comments`, {
        headers: buildAuthHeaders(token),
      });

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.detail ?? "Impossible de charger les commentaires");
      }

      setCommentsByReview((current) => ({
        ...current,
        [reviewId]: Array.isArray(payload) ? (payload as SocialComment[]) : [],
      }));
      setCommentErrors((current) => ({ ...current, [reviewId]: "" }));
    } catch (error) {
      console.error(error);
      setCommentErrors((current) => ({
        ...current,
        [reviewId]:
          error instanceof Error ? error.message : "Impossible de charger les commentaires",
      }));
    } finally {
      setLoadingCommentReviewIds((current) => current.filter((id) => id !== reviewId));
    }
  };

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      redirectToLogin();
      return;
    }

    void fetchFeed();
    void fetchNotifications();
  }, []);

  useEffect(() => {
    if (composerSearchMode !== "people") {
      return;
    }

    const handle = window.setTimeout(() => {
      void fetchUsers(userQuery);
    }, 250);

    return () => window.clearTimeout(handle);
  }, [composerSearchMode, userQuery]);

  useEffect(() => {
    if (composerSearchMode !== "movies") {
      setMovieSearchLoading(false);
      setSearchError("");
      return;
    }

    const trimmedQuery = movieQuery.trim();

    if (!trimmedQuery || trimmedQuery.length < 2) {
      setMovieResults([]);
      setMovieSearchLoading(false);
      setSearchError("");
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

        setMovieResults(Array.isArray(payload) ? payload : []);
        setSearchError("");
      } catch (error) {
        console.error(error);
        setSearchError(
          error instanceof Error ? error.message : "Impossible de rechercher ce film",
        );
      } finally {
        setMovieSearchLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(handle);
  }, [movieQuery]);

  const submitReview = async () => {
    if (!selectedMovie) {
      setComposerError("Selectionne d'abord un film.");
      return;
    }

    const token = getTokenOrRedirect();
    if (!token) {
      return;
    }

    setPublishing(true);
    try {
      const res = await fetch(`${API_URL}/social/reviews`, {
        method: "POST",
        headers: buildAuthHeaders(token, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          movie_id: selectedMovie.id,
          title: selectedMovie.title,
          poster_url: selectedMovie.poster_url,
          rating: reviewRating,
          content: reviewContent.trim(),
        }),
      });

      const payload = await res.json();

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      if (!res.ok) {
        throw new Error(payload?.detail ?? "Impossible de publier la critique");
      }

      setFeed((current) => [payload as SocialReview, ...current]);
      setSelectedMovie(null);
      setMovieQuery("");
      setMovieResults([]);
      setReviewContent("");
      setReviewRating(4);
      setComposerError("");
      setFeedError("");
    } catch (error) {
      console.error(error);
      setComposerError(
        error instanceof Error ? error.message : "Impossible de publier la critique",
      );
    } finally {
      setPublishing(false);
    }
  };

  const toggleFollow = async (user: SocialUser) => {
    const token = getTokenOrRedirect();
    if (!token) {
      return;
    }

    setPendingUserIds((current) => [...current, user.id]);
    try {
      const res = await fetch(`${API_URL}/social/follow/${user.id}`, {
        method: user.is_following ? "DELETE" : "POST",
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

      setUsers((current) =>
        current.map((entry) =>
          entry.id !== user.id
            ? entry
            : {
                ...entry,
                is_following: !entry.is_following,
                followers_count: Math.max(
                  0,
                  entry.followers_count + (entry.is_following ? -1 : 1),
                ),
              },
        ),
      );
      setUsersError("");
      void fetchFeed();
    } catch (error) {
      console.error(error);
      setUsersError(
        error instanceof Error ? error.message : "Impossible de modifier cet abonnement",
      );
    } finally {
      setPendingUserIds((current) => current.filter((id) => id !== user.id));
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

      setFeed((current) =>
        current.map((entry) =>
          entry.id !== review.id
            ? entry
            : {
                ...entry,
                liked_by_me: Boolean(payload.liked),
                likes_count: Number(payload.likes_count ?? entry.likes_count),
              },
        ),
      );
      setFeedError("");
    } catch (error) {
      console.error(error);
      setFeedError(
        error instanceof Error ? error.message : "Impossible de liker cette critique",
      );
    } finally {
      setPendingReviewIds((current) => current.filter((id) => id !== review.id));
    }
  };

  const toggleComments = async (reviewId: number) => {
    if (isCommentsOpen(reviewId)) {
      setOpenCommentReviews((current) => current.filter((id) => id !== reviewId));
      return;
    }

    setOpenCommentReviews((current) => [...current, reviewId]);
    if (!commentsByReview[reviewId]) {
      await loadComments(reviewId);
    }
  };

  const submitComment = async (reviewId: number) => {
    const token = getTokenOrRedirect();
    if (!token) {
      return;
    }

    const draft = (commentDrafts[reviewId] ?? "").trim();
    if (draft.length < 2) {
      setCommentErrors((current) => ({
        ...current,
        [reviewId]: "Le commentaire doit contenir au moins 2 caracteres.",
      }));
      return;
    }

    const replyTarget = replyTargets[reviewId];
    setSubmittingCommentReviewIds((current) => [...current, reviewId]);

    try {
      const res = await fetch(`${API_URL}/social/reviews/${reviewId}/comments`, {
        method: "POST",
        headers: buildAuthHeaders(token, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          content: draft,
          parent_id: replyTarget?.id ?? null,
        }),
      });
      const payload = await res.json();

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      if (!res.ok) {
        throw new Error(payload?.detail ?? "Impossible de publier ce commentaire");
      }

      setCommentsByReview((current) => ({
        ...current,
        [reviewId]: [...(current[reviewId] ?? []), payload as SocialComment],
      }));
      setCommentDrafts((current) => ({ ...current, [reviewId]: "" }));
      setReplyTargets((current) => ({ ...current, [reviewId]: null }));
      setCommentErrors((current) => ({ ...current, [reviewId]: "" }));
      setFeed((current) =>
        current.map((entry) =>
          entry.id === reviewId
            ? { ...entry, comments_count: entry.comments_count + 1 }
            : entry,
        ),
      );
    } catch (error) {
      console.error(error);
      setCommentErrors((current) => ({
        ...current,
        [reviewId]:
          error instanceof Error ? error.message : "Impossible de publier ce commentaire",
      }));
    } finally {
      setSubmittingCommentReviewIds((current) => current.filter((id) => id !== reviewId));
    }
  };

  const markAllNotificationsAsRead = async () => {
    const token = getTokenOrRedirect();
    if (!token) {
      return;
    }

    setMarkingNotifications(true);
    try {
      const res = await fetch(`${API_URL}/social/notifications/read-all`, {
        method: "POST",
        headers: buildAuthHeaders(token),
      });
      const payload = await res.json().catch(() => ({}));

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      if (!res.ok) {
        throw new Error(payload?.detail ?? "Impossible de marquer les notifications comme lues");
      }

      setUnreadNotifications(0);
      setNotifications([]);
      setNotificationsError("");
    } catch (error) {
      console.error(error);
      setNotificationsError(
        error instanceof Error
          ? error.message
          : "Impossible de marquer les notifications comme lues",
      );
    } finally {
      setMarkingNotifications(false);
    }
  };

  const renderCommentTree = (reviewId: number, parentId: number | null = null, depth = 0) => {
    const comments = commentsByReview[reviewId] ?? [];
    const branch = comments.filter((comment) => comment.parent_id === parentId);

    return branch.map((comment) => {
      const isReplyTarget = replyTargets[reviewId]?.id === comment.id;
      return (
        <div
          key={comment.id}
          className={`${depth > 0 ? "ml-5 border-l border-white/10 pl-4" : ""} mt-3`}
        >
          <div className="rounded-[22px] border border-white/10 bg-black/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Link
                  href={`/social/${encodeURIComponent(comment.author.username)}`}
                  className="text-sm font-semibold text-red-200 transition hover:text-red-100"
                >
                  @{comment.author.username}
                </Link>
                <div className="mt-1 text-[11px] uppercase tracking-[0.15em] text-gray-500">
                  {formatSocialDate(comment.created_at)}
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  setReplyTargets((current) => ({
                    ...current,
                    [reviewId]: isReplyTarget
                      ? null
                      : { id: comment.id, username: comment.author.username },
                  }))
                }
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-gray-300 transition hover:bg-white/[0.08] hover:text-white"
              >
                {isReplyTarget ? "Annuler" : "Repondre"}
              </button>
            </div>

            {comment.reply_to_username && (
              <div className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-amber-300">
                En reponse a @{comment.reply_to_username}
              </div>
            )}

            <p className="mt-3 text-sm leading-6 text-gray-100">{comment.content}</p>
          </div>

          {renderCommentTree(reviewId, comment.id, depth + 1)}
        </div>
      );
    });
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(239,68,68,0.22),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.16),_transparent_26%),#000] px-4 py-3 text-white md:py-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 md:gap-6">
        <MobilePageHeader
          title="Social"
          subtitle="Critiques, profils et alertes"
          icon={Users}
          accent="red"
          trailing={
            <div className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-[11px] font-semibold text-white">
              {unreadNotifications}
            </div>
          }
        />

        <section className="hidden overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.04] shadow-[0_18px_50px_rgba(0,0,0,0.32)] backdrop-blur-md md:block">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:p-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-500/12 text-red-200">
                <Users className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                  Reseau
                </div>
                <h1 className="truncate text-base font-black tracking-tight md:text-2xl">Social</h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-semibold text-white">
                {formattedNow}
              </div>
              <div className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-white">
                {unreadNotifications} alertes
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-2 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md lg:hidden">
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: "feed", label: "Feed", icon: Film },
              { key: "write", label: "Critique", icon: PenSquare },
              { key: "alerts", label: "Alertes", icon: Bell },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = mobileSection === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setMobileSection(tab.key as "feed" | "write" | "alerts")}
                  className={`relative rounded-[18px] px-2 py-3 text-xs font-semibold transition ${
                    isActive
                      ? "bg-red-600 text-white"
                      : "border border-white/10 bg-white/[0.04] text-gray-300"
                  }`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <Icon className="h-4 w-4" />
                    <span>{tab.label}</span>
                  </div>
                  {tab.key === "alerts" && unreadNotifications > 0 && (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold text-black">
                      {unreadNotifications > 9 ? "9+" : unreadNotifications}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
          <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <section
              className={`rounded-[28px] border border-white/10 bg-zinc-950/90 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.4)] ${
                mobileSection === "write" ? "block" : "hidden lg:block"
              }`}
            >
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-600/15 text-red-300">
                  <PenSquare className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Recherche et critique</h2>
                  <p className="text-sm text-gray-400">Films et profils sont maintenant dans la meme barre.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Recherche
                  </label>
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setComposerSearchMode("movies")}
                      className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                        composerSearchMode === "movies"
                          ? "bg-red-600 text-white"
                          : "border border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.06]"
                      }`}
                    >
                      Films
                    </button>
                    <button
                      type="button"
                      onClick={() => setComposerSearchMode("people")}
                      className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                        composerSearchMode === "people"
                          ? "bg-amber-500 text-black"
                          : "border border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.06]"
                      }`}
                    >
                      Profils
                    </button>
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-500" />
                    <input
                      value={composerSearchMode === "movies" ? movieQuery : userQuery}
                      onChange={(event) => {
                        if (composerSearchMode === "movies") {
                          setMovieQuery(event.target.value);
                          setSelectedMovie(null);
                          return;
                        }
                        setUserQuery(event.target.value);
                      }}
                      placeholder={
                        composerSearchMode === "movies"
                          ? "Recherche un film a chroniquer"
                          : "Recherche un pseudo"
                      }
                      className="w-full rounded-2xl border border-white/10 bg-black/40 px-10 py-3 text-sm text-white outline-none transition focus:border-red-500/70"
                    />
                    {(composerSearchMode === "movies" ? movieSearchLoading : usersLoading) && (
                      <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-gray-400" />
                    )}
                  </div>

                  {composerSearchMode === "movies" && searchError && (
                    <p className="mt-2 text-sm text-red-300">{searchError}</p>
                  )}
                  {composerSearchMode === "people" && usersError && (
                    <p className="mt-2 text-sm text-red-300">{usersError}</p>
                  )}

                  {composerSearchMode === "movies" && !selectedMovie && movieResults.length > 0 && (
                    <div className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-black/50 p-2">
                      {movieResults.map((movie) => (
                        <button
                          key={movie.id}
                          type="button"
                          onClick={() => {
                            setSelectedMovie(movie);
                            setMovieQuery(movie.title);
                            setMovieResults([]);
                            setSearchError("");
                          }}
                          className="flex w-full items-center gap-3 rounded-2xl border border-transparent bg-white/[0.03] p-2 text-left transition hover:border-red-500/40 hover:bg-white/[0.06]"
                        >
                          <img
                            src={movie.poster_url || FALLBACK_POSTER}
                            alt={movie.title}
                            className="h-16 w-12 rounded-xl object-cover"
                          />
                          <div className="min-w-0">
                            <div className="truncate font-semibold">{movie.title}</div>
                            <div className="mt-1 flex items-center gap-1 text-xs text-yellow-400">
                              <Star className="h-3.5 w-3.5 fill-current" />
                              {movie.rating.toFixed(1)}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {composerSearchMode === "people" && (
                    <div className="mt-3 space-y-3">
                      {usersLoading ? (
                        <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-black/30 px-4 py-8 text-sm text-gray-400">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Chargement des profils...
                        </div>
                      ) : users.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-8 text-center text-sm text-gray-500">
                          Aucun profil ne correspond a cette recherche.
                        </div>
                      ) : (
                        users.map((user) => {
                          const isPending = pendingUserIds.includes(user.id);
                          return (
                            <div
                              key={user.id}
                              className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <Link
                                    href={`/social/${encodeURIComponent(user.username)}`}
                                    className="truncate text-base font-semibold transition hover:text-amber-300"
                                  >
                                    @{user.username}
                                  </Link>
                                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-400">
                                    <span className="rounded-full bg-white/[0.04] px-2 py-1">
                                      {user.reviews_count} critiques
                                    </span>
                                    <span className="rounded-full bg-white/[0.04] px-2 py-1">
                                      {user.followers_count} abonnes
                                    </span>
                                    <span className="rounded-full bg-white/[0.04] px-2 py-1">
                                      {user.following_count} abonnements
                                    </span>
                                  </div>
                                </div>

                                <div className="flex flex-col items-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void toggleFollow(user)}
                                    disabled={isPending}
                                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                                      user.is_following
                                        ? "border border-white/10 bg-white/[0.06] text-white hover:bg-white/[0.12]"
                                        : "bg-amber-500 text-black hover:bg-amber-400"
                                    } disabled:cursor-not-allowed disabled:opacity-60`}
                                  >
                                    {isPending ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : user.is_following ? (
                                      <UserMinus className="h-4 w-4" />
                                    ) : (
                                      <UserPlus className="h-4 w-4" />
                                    )}
                                    {user.is_following ? "Suivi" : "Suivre"}
                                  </button>

                                  <Link
                                    href={`/messages?userId=${user.id}`}
                                    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
                                  >
                                    Message
                                  </Link>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {composerSearchMode === "movies" && selectedMovie && (
                  <div className="flex items-center gap-3 rounded-[22px] border border-red-500/20 bg-red-500/[0.08] p-3">
                    <img
                      src={selectedMovie.poster_url || FALLBACK_POSTER}
                      alt={selectedMovie.title}
                      className="h-20 w-14 rounded-xl object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-red-200">
                        Film selectionne
                      </div>
                      <div className="truncate text-base font-bold">{selectedMovie.title}</div>
                      <div className="mt-1 flex items-center gap-1 text-sm text-yellow-400">
                        <Star className="h-4 w-4 fill-current" />
                        {selectedMovie.rating.toFixed(1)}
                      </div>
                    </div>
                  </div>
                )}

                <div className={composerSearchMode === "movies" ? "block" : "hidden"}>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Ta note
                  </label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setReviewRating(value)}
                        className={`rounded-2xl border px-3 py-2 transition ${
                          reviewRating >= value
                            ? "border-yellow-400/60 bg-yellow-400/10 text-yellow-300"
                            : "border-white/10 bg-white/[0.03] text-gray-400 hover:text-white"
                        }`}
                      >
                        <Star className={`h-4 w-4 ${reviewRating >= value ? "fill-current" : ""}`} />
                      </button>
                    ))}
                  </div>
                </div>

                <div className={composerSearchMode === "movies" ? "block" : "hidden"}>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Ton avis
                  </label>
                  <textarea
                    value={reviewContent}
                    onChange={(event) => setReviewContent(event.target.value)}
                    placeholder="Explique pourquoi ce film vaut le coup, ou pas."
                    rows={6}
                    className="w-full rounded-[22px] border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 text-white outline-none transition focus:border-red-500/70"
                  />
                  <div className="mt-2 text-right text-xs text-gray-500">
                    {reviewContent.trim().length} caracteres
                  </div>
                </div>

                {composerError && (
                  <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {composerError}
                  </div>
                )}

                {composerSearchMode === "movies" ? (
                  <button
                    type="button"
                    onClick={() => void submitReview()}
                    disabled={publishing || !selectedMovie || reviewContent.trim().length < 10}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-950/70 disabled:text-red-200/60"
                  >
                    {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Publier la critique
                  </button>
                ) : (
                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-100">
                    Selectionne l&apos;onglet Films pour choisir un film et publier une critique.
                  </div>
                )}
              </div>
            </section>

            <section
              className={`rounded-[28px] border border-white/10 bg-zinc-950/90 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.4)] ${
                mobileSection === "alerts" ? "block" : "hidden lg:block"
              }`}
            >
              <div className="mb-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white">
                    <Bell className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">Notifications</h2>
                    <p className="text-sm text-gray-400">Likes, abonnements et nouvelles critiques.</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void fetchNotifications()}
                  className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-gray-300 transition hover:bg-white/[0.08] hover:text-white"
                  title="Actualiser"
                >
                  <RefreshCcw className="h-4 w-4" />
                </button>
              </div>

              {notificationsError && (
                <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {notificationsError}
                </div>
              )}

              <div className="mb-4 flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">A traiter</div>
                  <div className="mt-1 text-lg font-semibold text-white">{unreadNotifications} non lues</div>
                </div>
                <button
                  type="button"
                  onClick={() => void markAllNotificationsAsRead()}
                  disabled={markingNotifications || unreadNotifications === 0}
                  className="rounded-full bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {markingNotifications ? "Traitement..." : "Tout marquer lu"}
                </button>
              </div>

              <div className="space-y-3">
                {notificationsLoading ? (
                  <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-black/30 px-4 py-8 text-sm text-gray-400">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Chargement des notifications...
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-8 text-center text-sm text-gray-500">
                    Aucune notification pour le moment.
                  </div>
                ) : (
                  notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`rounded-[22px] border p-4 ${
                        notification.is_read
                          ? "border-white/10 bg-white/[0.03]"
                          : "border-red-500/20 bg-red-500/[0.08]"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {notification.review ? (
                          <img
                            src={notification.review.poster_url || FALLBACK_POSTER}
                            alt={notification.review.title}
                            className="h-16 w-12 rounded-xl object-cover"
                          />
                        ) : (
                          <div className="flex h-16 w-12 items-center justify-center rounded-xl bg-white/[0.06] text-white">
                            <Bell className="h-4 w-4" />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/social/${encodeURIComponent(notification.actor.username)}`}
                            className="text-sm font-semibold text-white transition hover:text-red-200"
                          >
                            {notification.message}
                          </Link>
                          <div className="mt-2 text-xs uppercase tracking-[0.15em] text-gray-500">
                            {formatSocialDate(notification.created_at)}
                          </div>

                          {notification.review && (
                            <div className="mt-3 text-sm text-gray-300">
                              Film concerne:{" "}
                              <span className="font-semibold text-white">{notification.review.title}</span>
                            </div>
                          )}

                          {notification.comment_preview && (
                            <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-gray-300">
                              “{notification.comment_preview}”
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

          </div>

          <section
            className={`rounded-[32px] border border-white/10 bg-zinc-950/85 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.4)] md:p-6 ${
              mobileSection === "feed" ? "block" : "hidden lg:block"
            }`}
          >
            <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-gray-300">
                  <Film className="h-3.5 w-3.5" />
                  Feed cine
                </div>
                <h2 className="text-2xl font-black tracking-tight">Les dernieres critiques de ton cercle</h2>
              </div>

              <button
                type="button"
                onClick={() => void fetchFeed()}
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
              >
                Actualiser
              </button>
            </div>

            {feedError && (
              <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {feedError}
              </div>
            )}

            {feedLoading ? (
              <div className="flex min-h-[280px] items-center justify-center rounded-[28px] border border-white/10 bg-black/20 text-sm text-gray-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Chargement des critiques...
              </div>
            ) : feed.length === 0 ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-black/20 px-6 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.05] text-gray-300">
                  <Users className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-bold">Le feed attend tes premieres voix.</h3>
                <p className="mt-3 max-w-md text-sm leading-6 text-gray-400">
                  Publie une critique ou suis d&apos;autres profils pour voir apparaitre un vrai flux social.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {feed.map((review) => {
                  const isPendingLike = pendingReviewIds.includes(review.id);
                  const commentsLoading = loadingCommentReviewIds.includes(review.id);
                  const commentSubmitting = submittingCommentReviewIds.includes(review.id);
                  const commentDraft = commentDrafts[review.id] ?? "";
                  const replyTarget = replyTargets[review.id];

                  return (
                    <article
                      key={review.id}
                      className="overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))]"
                    >
                      <div className="grid gap-0 grid-cols-[82px_minmax(0,1fr)] md:grid-cols-[112px_minmax(0,1fr)]">
                        <div className="relative min-h-[126px] bg-black md:min-h-[176px]">
                          <img
                            src={review.poster_url || FALLBACK_POSTER}
                            alt={review.title}
                            className="h-full w-full object-cover"
                          />
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2.5 py-2.5 md:px-4 md:py-4">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-gray-300">Film</div>
                            <div className="line-clamp-2 text-[11px] font-bold leading-4 md:text-sm">{review.title}</div>
                          </div>
                        </div>

                        <div className="p-3.5 md:p-5">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                              <Link
                                href={`/social/${encodeURIComponent(review.author.username)}`}
                                className="text-sm font-semibold text-red-200 transition hover:text-red-100"
                              >
                                @{review.author.username}
                              </Link>
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

                          <p className="mt-3 text-sm leading-6 text-gray-100 md:mt-4 md:text-[15px] md:leading-7">
                            {review.content}
                          </p>

                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 md:mt-5">
                            <div className="text-xs text-gray-500 md:text-sm">
                              Critique sur <span className="font-semibold text-gray-300">{review.title}</span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void toggleComments(review.id)}
                                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                                  isCommentsOpen(review.id)
                                    ? "bg-amber-500 text-black hover:bg-amber-400"
                                    : "border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                                }`}
                              >
                                <MessageCircle className="h-4 w-4" />
                                {review.comments_count}
                              </button>

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

                          {isCommentsOpen(review.id) && (
                            <div className="mt-6 rounded-[26px] border border-white/10 bg-black/30 p-4 md:p-5">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-gray-200">
                                    Discussion
                                  </h3>
                                  <p className="mt-1 text-sm text-gray-500">
                                    Les reponses restent attachees a la critique.
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenCommentReviews((current) =>
                                      current.filter((id) => id !== review.id),
                                    )
                                  }
                                  className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-gray-300 transition hover:bg-white/[0.08] hover:text-white"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>

                              {commentErrors[review.id] && (
                                <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                                  {commentErrors[review.id]}
                                </div>
                              )}

                              <div className="mt-4">
                                {commentsLoading ? (
                                  <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-black/20 px-4 py-8 text-sm text-gray-400">
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Chargement des commentaires...
                                  </div>
                                ) : (commentsByReview[review.id] ?? []).length === 0 ? (
                                  <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-8 text-center text-sm text-gray-500">
                                    Personne n&apos;a encore reagi a cette critique.
                                  </div>
                                ) : (
                                  <div className="space-y-1">{renderCommentTree(review.id)}</div>
                                )}
                              </div>

                              <div className="mt-5 rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                                {replyTarget && (
                                  <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                                    <span>Reponse a @{replyTarget.username}</span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setReplyTargets((current) => ({ ...current, [review.id]: null }))
                                      }
                                      className="rounded-full bg-white/10 p-1 text-white transition hover:bg-white/20"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                )}

                                <textarea
                                  value={commentDraft}
                                  onChange={(event) =>
                                    setCommentDrafts((current) => ({
                                      ...current,
                                      [review.id]: event.target.value,
                                    }))
                                  }
                                  rows={3}
                                  placeholder={
                                    replyTarget
                                      ? `Reponds a @${replyTarget.username}`
                                      : "Ajoute ton commentaire"
                                  }
                                  className="w-full rounded-[20px] border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 text-white outline-none transition focus:border-amber-500/70"
                                />

                                <div className="mt-3 flex items-center justify-between gap-3">
                                  <div className="text-xs text-gray-500">
                                    {commentDraft.trim().length} caracteres
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => void submitComment(review.id)}
                                    disabled={commentSubmitting || commentDraft.trim().length < 2}
                                    className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-sm font-bold text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-amber-900/40 disabled:text-amber-100/50"
                                  >
                                    {commentSubmitting ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Send className="h-4 w-4" />
                                    )}
                                    Envoyer
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

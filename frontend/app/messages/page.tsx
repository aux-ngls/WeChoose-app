"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Film,
  Loader2,
  MessageCircle,
  Search,
  Send,
  Share2,
  Star,
  X,
} from "lucide-react";
import { API_URL } from "@/config";
import { buildAuthHeaders, getStoredToken } from "@/lib/auth";
import {
  FALLBACK_POSTER,
  type SearchMovie,
  type SocialUser,
  formatSocialDate,
} from "@/lib/social";
import {
  type DirectConversationDetail,
  type DirectConversationSummary,
  type DirectMessage,
} from "@/lib/messages";
import { buildRealtimeWebSocketUrl } from "@/lib/realtime";
import MobilePageHeader from "@/components/MobilePageHeader";

interface MovieDetail extends SearchMovie {
  overview?: string;
  trailer_url?: string;
  cast?: { name: string; character: string; photo: string | null }[];
  release_date?: string;
}

function MessagesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const shouldAutoScrollNextUpdateRef = useRef(false);
  const previousConversationIdRef = useRef<number | null>(null);
  const previousMessageCountRef = useRef(0);

  const [conversations, setConversations] = useState<DirectConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [activeConversation, setActiveConversation] = useState<DirectConversationDetail | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [movieQuery, setMovieQuery] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [userResults, setUserResults] = useState<SocialUser[]>([]);
  const [movieResults, setMovieResults] = useState<SearchMovie[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<SearchMovie | null>(null);
  const [showMoviePicker, setShowMoviePicker] = useState(false);
  const [handledTargetUserId, setHandledTargetUserId] = useState<number | null>(null);
  const [handledSharedMovieKey, setHandledSharedMovieKey] = useState<string | null>(null);
  const [mobileSidebarTab, setMobileSidebarTab] = useState<"inbox" | "discover">("inbox");
  const [mobileView, setMobileView] = useState<"sidebar" | "chat">("sidebar");
  const [openedMovieDetail, setOpenedMovieDetail] = useState<MovieDetail | null>(null);
  const [movieDetailLoading, setMovieDetailLoading] = useState(false);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(true);
  const [movieSearchLoading, setMovieSearchLoading] = useState(false);
  const [startingConversationIds, setStartingConversationIds] = useState<number[]>([]);
  const [sending, setSending] = useState(false);
  const [pageError, setPageError] = useState("");
  const [conversationError, setConversationError] = useState("");

  const targetUserId = useMemo(() => {
    const raw = searchParams.get("userId");
    if (!raw) {
      return null;
    }

    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }, [searchParams]);

  const requestedConversationId = useMemo(() => {
    const raw = searchParams.get("conversationId");
    if (!raw) {
      return null;
    }

    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }, [searchParams]);

  const sharedMovieSeed = useMemo(() => {
    const rawMovieId = searchParams.get("shareMovieId");
    if (!rawMovieId) {
      return null;
    }

    const movieId = Number(rawMovieId);
    if (!Number.isFinite(movieId)) {
      return null;
    }

    const movieTitle = searchParams.get("shareMovieTitle");
    const moviePoster = searchParams.get("shareMoviePoster");
    const movieRating = Number(searchParams.get("shareMovieRating") ?? "0");
    const key = `${movieId}:${movieTitle ?? ""}:${moviePoster ?? ""}:${movieRating}`;

    return {
      key,
      movie: {
        id: movieId,
        title: movieTitle ?? "Film partage",
        poster_url: moviePoster ?? FALLBACK_POSTER,
        rating: Number.isFinite(movieRating) ? movieRating : 0,
      } satisfies SearchMovie,
    };
  }, [searchParams]);

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

  const updateStickToBottom = () => {
    const container = messagesContainerRef.current;
    if (!container) {
      shouldStickToBottomRef.current = true;
      return;
    }

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 120;
  };

  const activeConversationTitle =
    activeConversation?.conversation.participant.username ??
    conversations.find((conversation) => conversation.id === activeConversationId)?.participant
      .username ??
    "Conversation";

  const fetchConversations = async (options?: { silent?: boolean }) => {
    const token = getTokenOrRedirect();
    if (!token) {
      return;
    }

    if (!options?.silent) {
      setConversationsLoading(true);
    }
    try {
      const res = await fetch(`${API_URL}/messages/conversations`, {
        headers: buildAuthHeaders(token),
      });
      const payload = await res.json();

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      if (!res.ok) {
        throw new Error(payload?.detail ?? "Impossible de charger les conversations");
      }

      const nextConversations = Array.isArray(payload)
        ? (payload as DirectConversationSummary[])
        : [];
      setConversations(nextConversations);
      setPageError("");

      if (!activeConversationId && !requestedConversationId && nextConversations.length > 0) {
        setActiveConversationId(nextConversations[0].id);
      }
    } catch (error) {
      console.error(error);
      setPageError(
        error instanceof Error ? error.message : "Impossible de charger les conversations",
      );
    } finally {
      if (!options?.silent) {
        setConversationsLoading(false);
      }
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
        `${API_URL}/social/users?query=${encodeURIComponent(query.trim())}&limit=10`,
        {
          headers: buildAuthHeaders(token),
        },
      );
      const payload = await res.json();

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      if (!res.ok) {
        throw new Error(payload?.detail ?? "Impossible de charger les utilisateurs");
      }

      setUserResults(Array.isArray(payload) ? (payload as SocialUser[]) : []);
      setPageError("");
    } catch (error) {
      console.error(error);
      setPageError(
        error instanceof Error ? error.message : "Impossible de charger les utilisateurs",
      );
    } finally {
      setUsersLoading(false);
    }
  };

  const openConversation = async (conversationId: number, options?: { silent?: boolean }) => {
    const token = getTokenOrRedirect();
    if (!token) {
      return;
    }

    if (!options?.silent) {
      setConversationLoading(true);
    }
    setActiveConversationId(conversationId);
    try {
      const res = await fetch(`${API_URL}/messages/conversations/${conversationId}`, {
        headers: buildAuthHeaders(token),
      });
      const payload = await res.json();

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      if (!res.ok) {
        throw new Error(payload?.detail ?? "Impossible de charger la conversation");
      }

      const detail = payload as DirectConversationDetail;
      setActiveConversation(detail);
      setConversations((current) =>
        current.map((entry) =>
          entry.id === conversationId ? { ...entry, unread_count: 0 } : entry,
        ),
      );
      setConversationError("");
    } catch (error) {
      console.error(error);
      setConversationError(
        error instanceof Error ? error.message : "Impossible de charger la conversation",
      );
    } finally {
      if (!options?.silent) {
        setConversationLoading(false);
      }
    }
  };

  const startConversation = async (user: SocialUser) => {
    const token = getTokenOrRedirect();
    if (!token) {
      return;
    }

    setStartingConversationIds((current) => [...current, user.id]);
    try {
      const res = await fetch(`${API_URL}/messages/conversations/start/${user.id}`, {
        method: "POST",
        headers: buildAuthHeaders(token),
      });
      const payload = await res.json();

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      if (!res.ok) {
        throw new Error(payload?.detail ?? "Impossible d'ouvrir cette conversation");
      }

      const conversationId = Number(payload.id);
      await fetchConversations();
      setActiveConversationId(conversationId);
      setMobileSidebarTab("inbox");
      setMobileView("chat");
      setHandledTargetUserId(user.id);
      setUserQuery("");
      void fetchUsers("");
    } catch (error) {
      console.error(error);
      setPageError(
        error instanceof Error ? error.message : "Impossible d'ouvrir cette conversation",
      );
    } finally {
      setStartingConversationIds((current) => current.filter((id) => id !== user.id));
    }
  };

  const sendMessage = async () => {
    if (!activeConversationId) {
      return;
    }

    const token = getTokenOrRedirect();
    if (!token) {
      return;
    }

    const trimmedDraft = messageDraft.trim();
    if (!trimmedDraft && !selectedMovie) {
      setConversationError("Ajoute un texte ou partage un film.");
      return;
    }

    setSending(true);
    try {
      const res = await fetch(`${API_URL}/messages/conversations/${activeConversationId}/messages`, {
        method: "POST",
        headers: buildAuthHeaders(token, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          content: trimmedDraft,
          movie_id: selectedMovie?.id ?? null,
          movie_title: selectedMovie?.title ?? null,
          movie_poster_url: selectedMovie?.poster_url ?? null,
          movie_rating: selectedMovie?.rating ?? null,
        }),
      });
      const payload = await res.json();

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      if (!res.ok) {
        throw new Error(payload?.detail ?? "Impossible d'envoyer ce message");
      }

      const createdMessage = payload as DirectMessage;
      shouldAutoScrollNextUpdateRef.current = true;
      setActiveConversation((current) =>
        current
          ? {
              ...current,
              messages: [...current.messages, createdMessage],
            }
          : current,
      );

      setConversations((current) =>
        current.map((entry) =>
          entry.id !== activeConversationId
            ? entry
            : {
                ...entry,
                updated_at: createdMessage.created_at,
                unread_count: 0,
                last_message: {
                  id: createdMessage.id,
                  content: createdMessage.content,
                  created_at: createdMessage.created_at,
                  sender_id: createdMessage.sender.id,
                  preview: createdMessage.content
                    ? createdMessage.content
                    : createdMessage.movie
                      ? `A partage ${createdMessage.movie.title}`
                      : "Nouveau message",
                  movie: createdMessage.movie
                    ? {
                        id: createdMessage.movie.id,
                        title: createdMessage.movie.title,
                        poster_url: createdMessage.movie.poster_url,
                      }
                    : null,
                },
              },
        ),
      );

      setMessageDraft("");
      setSelectedMovie(null);
      setMovieQuery("");
      setMovieResults([]);
      setShowMoviePicker(false);
      setConversationError("");
    } catch (error) {
      console.error(error);
      setConversationError(
        error instanceof Error ? error.message : "Impossible d'envoyer ce message",
      );
    } finally {
      setSending(false);
    }
  };

  const openMovieDetails = async (movieId: number) => {
    setMovieDetailLoading(true);
    try {
      const res = await fetch(`${API_URL}/movie/${movieId}`);
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.detail ?? "Impossible de charger les détails de ce film");
      }

      setOpenedMovieDetail(payload as MovieDetail);
      setConversationError("");
    } catch (error) {
      console.error(error);
      setConversationError(
        error instanceof Error
          ? error.message
          : "Impossible de charger les détails de ce film",
      );
    } finally {
      setMovieDetailLoading(false);
    }
  };

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      redirectToLogin();
      return;
    }

    void fetchConversations();
    void fetchUsers("");
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      return;
    }

    const socket = new WebSocket(buildRealtimeWebSocketUrl(token));
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { type?: string; conversation_id?: number };
        if (payload.type !== "messages.updated") {
          return;
        }

        void fetchConversations({ silent: true });
        if (payload.conversation_id && payload.conversation_id === activeConversationId) {
          void openConversation(payload.conversation_id, { silent: true });
        }
      } catch (error) {
        console.error(error);
      }
    };

    return () => {
      socket.close();
    };
  }, [activeConversationId]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void fetchUsers(userQuery);
    }, 250);

    return () => window.clearTimeout(handle);
  }, [userQuery]);

  useEffect(() => {
    if (!activeConversationId) {
      return;
    }

    shouldAutoScrollNextUpdateRef.current = true;
    void openConversation(activeConversationId);
  }, [activeConversationId]);

  useEffect(() => {
    if (!activeConversationId) {
      return;
    }

    const interval = window.setInterval(() => {
      void fetchConversations({ silent: true });
      void openConversation(activeConversationId, { silent: true });
    }, 5000);

    return () => window.clearInterval(interval);
  }, [activeConversationId]);

  useEffect(() => {
    if (!targetUserId) {
      return;
    }

    if (handledTargetUserId === targetUserId) {
      return;
    }

    const targetUser = userResults.find((user) => user.id === targetUserId);
    if (!targetUser) {
      return;
    }

    void startConversation(targetUser);
  }, [handledTargetUserId, targetUserId, userResults]);

  useEffect(() => {
    if (!requestedConversationId || activeConversationId === requestedConversationId) {
      return;
    }

    setActiveConversationId(requestedConversationId);
    setMobileView("chat");
    setMobileSidebarTab("inbox");
  }, [activeConversationId, requestedConversationId]);

  useEffect(() => {
    if (!sharedMovieSeed) {
      return;
    }

    if (handledSharedMovieKey === sharedMovieSeed.key) {
      return;
    }

    setSelectedMovie(sharedMovieSeed.movie);
    setShowMoviePicker(true);
    setMovieQuery(sharedMovieSeed.movie.title);
    setHandledSharedMovieKey(sharedMovieSeed.key);
  }, [handledSharedMovieKey, sharedMovieSeed]);

  useEffect(() => {
    if (!showMoviePicker) {
      return;
    }

    const trimmedQuery = movieQuery.trim();
    if (!trimmedQuery || trimmedQuery.length < 2) {
      setMovieResults([]);
      setMovieSearchLoading(false);
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
        setMovieResults(Array.isArray(payload) ? (payload as SearchMovie[]) : []);
      } catch (error) {
        console.error(error);
        setConversationError(
          error instanceof Error ? error.message : "Impossible de rechercher ce film",
        );
      } finally {
        setMovieSearchLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(handle);
  }, [movieQuery, showMoviePicker]);

  useEffect(() => {
    if (!activeConversation) {
      previousConversationIdRef.current = null;
      previousMessageCountRef.current = 0;
      return;
    }

    const currentMessageCount = activeConversation.messages.length;
    const conversationChanged =
      previousConversationIdRef.current !== activeConversation.conversation.id;
    const newMessagesArrived = currentMessageCount > previousMessageCountRef.current;

    const shouldScroll =
      shouldAutoScrollNextUpdateRef.current ||
      conversationChanged ||
      (newMessagesArrived && shouldStickToBottomRef.current);

    if (shouldScroll) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      shouldStickToBottomRef.current = true;
    }

    shouldAutoScrollNextUpdateRef.current = false;
    previousConversationIdRef.current = activeConversation.conversation.id;
    previousMessageCountRef.current = currentMessageCount;
  }, [activeConversation]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(239,68,68,0.18),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.14),_transparent_28%),#000] px-4 py-3 text-white md:py-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 md:gap-6">
        <MobilePageHeader
          title="Messages"
          subtitle={mobileView === "chat" ? `@${activeConversationTitle}` : "Inbox et nouveaux DM"}
          icon={MessageCircle}
          accent="sky"
          trailing={
            <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[11px] font-semibold text-white">
              {conversations.length}
            </div>
          }
        />

        <section className="hidden overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.04] shadow-[0_18px_50px_rgba(0,0,0,0.32)] backdrop-blur-md md:block">
          <div className="flex items-center justify-between gap-3 px-4 py-3 md:p-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/12 text-sky-200">
                <MessageCircle className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                  DM
                </div>
                <h1 className="truncate text-base font-black tracking-tight md:text-2xl">Messages</h1>
              </div>
            </div>

            <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-semibold text-white md:rounded-2xl md:px-3 md:py-2 md:text-sm">
              {conversations.length} inbox
            </div>
          </div>
        </section>

        {pageError && (
          <div className="rounded-[24px] border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-100">
            {pageError}
          </div>
        )}

        <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-2 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md lg:hidden">
          {mobileView === "chat" ? (
            <div className="flex items-center justify-between gap-3 px-2 py-1">
              <button
                type="button"
                onClick={() => setMobileView("sidebar")}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-semibold text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Inbox
              </button>
              <div className="min-w-0 text-right">
                <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">
                  Conversation
                </div>
                <div className="truncate text-sm font-bold text-white">@{activeConversationTitle}</div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMobileSidebarTab("inbox")}
                className={`rounded-[18px] px-4 py-3 text-sm font-semibold transition ${
                  mobileSidebarTab === "inbox"
                    ? "bg-sky-500 text-black"
                    : "border border-white/10 bg-white/[0.04] text-white"
                }`}
              >
                Inbox
              </button>
              <button
                type="button"
                onClick={() => setMobileSidebarTab("discover")}
                className={`rounded-[18px] px-4 py-3 text-sm font-semibold transition ${
                  mobileSidebarTab === "discover"
                    ? "bg-sky-500 text-black"
                    : "border border-white/10 bg-white/[0.04] text-white"
                }`}
              >
                Nouveau DM
              </button>
            </div>
          )}
        </section>

        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div
            className={`space-y-4 lg:sticky lg:top-24 lg:flex lg:max-h-[calc(100svh-11rem)] lg:flex-col lg:self-start ${
              mobileView === "chat" ? "hidden lg:block" : ""
            }`}
          >
            <section
              className={`relative rounded-[24px] border border-white/10 bg-zinc-950/90 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.4)] ${
                mobileSidebarTab === "discover" ? "block" : "hidden lg:block"
              }`}
            >
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-500" />
                <input
                  value={userQuery}
                  onChange={(event) => setUserQuery(event.target.value)}
                  placeholder="Nouveau message: chercher un utilisateur"
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-10 py-3 text-sm text-white outline-none transition focus:border-sky-500/70"
                />
              </div>

              {(userQuery.trim().length >= 2 || usersLoading) && (
                <div className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-[22px] border border-white/10 bg-black/85 p-2 lg:absolute lg:left-3 lg:right-3 lg:top-[4.7rem] lg:z-20 lg:mt-0 lg:shadow-[0_20px_50px_rgba(0,0,0,0.45)]">
                  {usersLoading ? (
                    <div className="flex items-center justify-center rounded-2xl bg-black/30 px-4 py-8 text-sm text-gray-400">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Chargement des utilisateurs...
                    </div>
                  ) : userResults.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-8 text-center text-sm text-gray-500">
                      Aucun utilisateur disponible.
                    </div>
                  ) : (
                    userResults.map((user) => {
                      const isStarting = startingConversationIds.includes(user.id);
                      return (
                        <div
                          key={user.id}
                          className="flex items-center justify-between gap-3 rounded-[18px] border border-white/10 bg-white/[0.03] p-3"
                        >
                          <div className="min-w-0">
                            <Link
                              href={`/social/${encodeURIComponent(user.username)}`}
                              className="truncate text-sm font-semibold transition hover:text-sky-300"
                            >
                              @{user.username}
                            </Link>
                            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-gray-400">
                              <span>{user.reviews_count} critiques</span>
                              <span>{user.followers_count} abonnes</span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => void startConversation(user)}
                            disabled={isStarting}
                            className="rounded-full bg-sky-500 px-3 py-2 text-xs font-bold text-black transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isStarting ? "..." : "DM"}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </section>

            <section
              className={`rounded-[28px] border border-white/10 bg-zinc-950/90 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.4)] lg:flex lg:min-h-0 lg:flex-1 lg:flex-col ${
                mobileSidebarTab === "inbox" ? "block" : "hidden lg:block"
              }`}
            >
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Inbox</h2>
                  <p className="text-sm text-gray-400">Tes conversations privees recentes.</p>
                </div>
              </div>

              <div className="space-y-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                {conversationsLoading ? (
                  <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-black/30 px-4 py-8 text-sm text-gray-400">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Chargement des conversations...
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-8 text-center text-sm text-gray-500">
                    Aucune conversation pour le moment.
                  </div>
                ) : (
                  conversations.map((conversation) => (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => {
                        setActiveConversationId(conversation.id);
                        setMobileView("chat");
                        setMobileSidebarTab("inbox");
                      }}
                      className={`w-full rounded-[22px] border p-4 text-left transition ${
                        activeConversationId === conversation.id
                          ? "border-sky-500/40 bg-sky-500/10"
                          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-base font-semibold">
                            @{conversation.participant.username}
                          </div>
                          <div className="mt-2 line-clamp-2 text-sm text-gray-400">
                            {conversation.last_message?.preview ?? "Commencer la discussion"}
                          </div>
                        </div>

                        {conversation.unread_count > 0 && (
                          <span className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white">
                            {conversation.unread_count}
                          </span>
                        )}
                      </div>

                      <div className="mt-3 text-xs uppercase tracking-[0.14em] text-gray-500">
                        {formatSocialDate(conversation.updated_at)}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>
          </div>

          <section
            className={`rounded-[32px] border border-white/10 bg-zinc-950/85 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.4)] md:p-6 ${
              mobileView === "sidebar" ? "hidden lg:block" : "block"
            }`}
          >
            {conversationError && (
              <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {conversationError}
              </div>
            )}

            {!activeConversationId ? (
              <div className="flex min-h-[520px] flex-col items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-black/20 px-6 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.05] text-gray-300">
                  <MessageCircle className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-bold">Choisis une conversation.</h3>
                <p className="mt-3 max-w-md text-sm leading-6 text-gray-400">
                  Tu peux ouvrir un nouveau DM depuis la colonne de gauche et partager un film en un
                  message.
                </p>
              </div>
            ) : conversationLoading || !activeConversation ? (
              <div className="flex min-h-[520px] items-center justify-center rounded-[28px] border border-white/10 bg-black/20 text-sm text-gray-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Chargement de la conversation...
              </div>
            ) : (
              <div className="flex min-h-[520px] flex-col">
                <div className="mb-5 flex items-center justify-between gap-4 rounded-[24px] border border-white/10 bg-black/20 px-5 py-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-gray-500">Conversation privee</div>
                    <Link
                      href={`/social/${encodeURIComponent(activeConversation.conversation.participant.username)}`}
                      className="mt-1 block text-xl font-black tracking-tight transition hover:text-sky-300 md:text-2xl"
                    >
                      @{activeConversation.conversation.participant.username}
                    </Link>
                  </div>

                  <Link
                    href={`/social/${encodeURIComponent(activeConversation.conversation.participant.username)}`}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
                  >
                    Voir profil
                  </Link>
                </div>

                <div
                  ref={messagesContainerRef}
                  onScroll={updateStickToBottom}
                  className="flex-1 space-y-4 overflow-y-auto rounded-[28px] border border-white/10 bg-black/20 p-4 md:p-5"
                >
                  {activeConversation.messages.length === 0 ? (
                    <div className="flex min-h-[280px] flex-col items-center justify-center text-center text-sm text-gray-500">
                      <Film className="mb-4 h-10 w-10 text-gray-400" />
                      La conversation est vide. Envoie un message ou partage un film pour lancer la discussion.
                    </div>
                  ) : (
                    activeConversation.messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.is_mine ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[92%] rounded-[26px] px-4 py-3 md:max-w-[70%] ${
                            message.is_mine
                              ? "bg-sky-500 text-black"
                              : "border border-white/10 bg-white/[0.05] text-white"
                          }`}
                        >
                          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] opacity-70">
                            {message.is_mine ? "Toi" : `@${message.sender.username}`}
                          </div>

                          {message.movie && (
                            <button
                              type="button"
                              onClick={() => void openMovieDetails(message.movie!.id)}
                              className={`mb-3 block w-full overflow-hidden rounded-[22px] border text-left transition hover:scale-[1.01] ${
                                message.is_mine
                                  ? "border-black/10 bg-black/10 hover:bg-black/15"
                                  : "border-white/10 bg-black/20 hover:bg-black/30"
                              }`}
                            >
                              <div className="grid grid-cols-[78px_minmax(0,1fr)] gap-0">
                                <img
                                  src={message.movie.poster_url || FALLBACK_POSTER}
                                  alt={message.movie.title}
                                  className="h-full w-full object-cover"
                                />
                                <div className="p-3">
                                  <div className="text-[11px] uppercase tracking-[0.16em] opacity-70">
                                    Film partage
                                  </div>
                                  <div className="mt-1 font-bold">{message.movie.title}</div>
                                  {message.movie.rating !== null && (
                                    <div className="mt-2 flex items-center gap-1 text-sm">
                                      <Star className="h-3.5 w-3.5 fill-current" />
                                      {Number(message.movie.rating).toFixed(1)}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </button>
                          )}

                          {message.content && <p className="text-sm leading-6">{message.content}</p>}

                          <div className="mt-3 text-[11px] uppercase tracking-[0.14em] opacity-60">
                            {formatSocialDate(message.created_at)}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={bottomRef} />
                </div>

                <div className="mt-5 rounded-[28px] border border-white/10 bg-black/20 p-4 md:p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-gray-200">
                        Composer
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Texte libre ou partage de film integre.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowMoviePicker((current) => !current)}
                      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                        showMoviePicker
                          ? "bg-amber-500 text-black hover:bg-amber-400"
                          : "border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                      }`}
                    >
                      <Share2 className="h-4 w-4" />
                      Partager un film
                    </button>
                  </div>

                  {showMoviePicker && (
                    <div className="mb-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-500" />
                        <input
                          value={movieQuery}
                          onChange={(event) => {
                            setMovieQuery(event.target.value);
                            setSelectedMovie(null);
                          }}
                          placeholder="Chercher un film a partager"
                          className="w-full rounded-2xl border border-white/10 bg-black/40 px-10 py-3 text-sm text-white outline-none transition focus:border-amber-500/70"
                        />
                        {movieSearchLoading && (
                          <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-gray-400" />
                        )}
                      </div>

                      {selectedMovie && (
                        <div className="mt-4 flex items-center gap-3 rounded-[22px] border border-amber-500/20 bg-amber-500/10 p-3">
                          <img
                            src={selectedMovie.poster_url || FALLBACK_POSTER}
                            alt={selectedMovie.title}
                            className="h-20 w-14 rounded-xl object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">
                              Film a partager
                            </div>
                            <div className="truncate text-base font-bold">{selectedMovie.title}</div>
                            <div className="mt-1 flex items-center gap-1 text-sm text-yellow-400">
                              <Star className="h-4 w-4 fill-current" />
                              {selectedMovie.rating.toFixed(1)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedMovie(null);
                              setMovieQuery("");
                            }}
                            className="rounded-full border border-white/10 bg-white/10 p-2 text-white transition hover:bg-white/20"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      )}

                      {!selectedMovie && movieResults.length > 0 && (
                        <div className="mt-4 max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-black/30 p-2">
                          {movieResults.map((movie) => (
                            <button
                              key={movie.id}
                              type="button"
                              onClick={() => {
                                setSelectedMovie(movie);
                                setMovieQuery(movie.title);
                                setMovieResults([]);
                              }}
                              className="flex w-full items-center gap-3 rounded-2xl border border-transparent bg-white/[0.03] p-2 text-left transition hover:border-amber-500/40 hover:bg-white/[0.06]"
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
                    </div>
                  )}

                  <textarea
                    value={messageDraft}
                    onChange={(event) => setMessageDraft(event.target.value)}
                    rows={4}
                    placeholder="Ecris ton message ici"
                    className="w-full rounded-[22px] border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 text-white outline-none transition focus:border-sky-500/70"
                  />

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="text-xs text-gray-500">
                      {messageDraft.trim().length} caracteres
                    </div>
                    <button
                      type="button"
                      onClick={() => void sendMessage()}
                      disabled={sending || (!messageDraft.trim() && !selectedMovie)}
                      className="inline-flex items-center gap-2 rounded-full bg-sky-500 px-5 py-3 text-sm font-bold text-black transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-sky-900/40 disabled:text-sky-100/50"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Envoyer
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {(movieDetailLoading || openedMovieDetail) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
          {movieDetailLoading && !openedMovieDetail ? (
            <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-gray-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement du film...
            </div>
          ) : openedMovieDetail ? (
            <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl">
              <button
                onClick={() => setOpenedMovieDetail(null)}
                className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-1.5 transition hover:bg-red-600"
              >
                <X className="h-5 w-5 text-white" />
              </button>

              <div className="aspect-video w-full bg-black">
                {openedMovieDetail.trailer_url ? (
                  <iframe
                    src={openedMovieDetail.trailer_url}
                    className="h-full w-full"
                    allowFullScreen
                    title={openedMovieDetail.title}
                  />
                ) : (
                  <img
                    src={openedMovieDetail.poster_url || FALLBACK_POSTER}
                    alt={openedMovieDetail.title}
                    className="h-full w-full object-cover opacity-60"
                  />
                )}
              </div>

              <div className="p-5">
                <h2 className="mb-1 text-xl font-bold">{openedMovieDetail.title}</h2>
                <div className="mb-4 flex items-center gap-2 text-xs text-gray-400">
                  <span>{openedMovieDetail.release_date}</span>
                  <span className="flex items-center text-yellow-400">
                    <Star className="mr-1 h-3 w-3 fill-current" />
                    {openedMovieDetail.rating.toFixed(1)}
                  </span>
                </div>

                <p className="mb-6 text-sm leading-relaxed text-gray-300">
                  {openedMovieDetail.overview}
                </p>

                <div className="flex gap-3 overflow-x-auto pb-2">
                  {openedMovieDetail.cast?.map((actor) => (
                    <div key={`${actor.name}-${actor.character}`} className="w-16 flex-shrink-0 text-center">
                      <img
                        src={actor.photo || "https://via.placeholder.com/100"}
                        alt={actor.name}
                        className="mx-auto mb-1 h-12 w-12 rounded-full border border-gray-700 object-cover"
                      />
                      <p className="truncate text-[10px] font-medium">{actor.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
}

export default function MessagesPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
          <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-gray-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement de la messagerie...
          </div>
        </main>
      }
    >
      <MessagesPageContent />
    </Suspense>
  );
}

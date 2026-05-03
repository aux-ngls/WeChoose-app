"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Home, Search, LogOut, Users, MessageCircle, UserCircle2 } from "lucide-react";
import QulteLogo from "@/components/QulteLogo";
import { API_URL } from "@/config";
import { buildAuthHeaders, clearStoredSession, getStoredToken } from "@/lib/auth";
import { unregisterNativePushToken } from "@/lib/native-app";
import { buildRealtimeWebSocketUrl } from "@/lib/realtime";
import { unregisterWebPushSubscription } from "@/lib/web-push";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [showMobileHeader, setShowMobileHeader] = useState(true);
  const [messageToast, setMessageToast] = useState<{
    conversationId: number;
    senderUsername: string;
    preview: string;
  } | null>(null);
  const isIsaTheme = username?.toLowerCase() === "isa.belaaa";
  const lastNotifiedMessageIdRef = useRef<number | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const checkAuth = () => {
        const user = localStorage.getItem("username");
        setUsername(user);
    };
    checkAuth();
    window.addEventListener("storage", checkAuth);
    const interval = setInterval(checkAuth, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchUnreadMessages = async () => {
      const token = getStoredToken();
      if (!token) {
        setUnreadMessages(0);
        return;
      }

      try {
        const res = await fetch(`${API_URL}/messages/unread-count`, {
          headers: buildAuthHeaders(token),
        });
        if (!res.ok) {
          return;
        }

        const payload = await res.json();
        setUnreadMessages(Number(payload?.unread_count ?? 0));
      } catch {
        setUnreadMessages(0);
      }
    };

    void fetchUnreadMessages();
    const token = getStoredToken();
    const socket = token ? new WebSocket(buildRealtimeWebSocketUrl(token)) : null;
    if (socket) {
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as {
            type?: string;
            conversation_id?: number;
            message_id?: number;
            sender_username?: string;
            preview?: string;
          };

          if (
            payload.type === "messages.updated" &&
            payload.message_id &&
            payload.sender_username &&
            payload.sender_username.toLowerCase() !== username?.toLowerCase() &&
            payload.message_id !== lastNotifiedMessageIdRef.current
          ) {
            lastNotifiedMessageIdRef.current = payload.message_id;

            const activeConversationId =
              pathname === "/messages"
                ? Number(new URLSearchParams(window.location.search).get("conversationId") || "0")
                : null;
            const isReadingSameConversation =
              pathname === "/messages" &&
              activeConversationId &&
              activeConversationId === payload.conversation_id &&
              document.visibilityState === "visible";

            if (!isReadingSameConversation && payload.conversation_id) {
              const nextToast = {
                conversationId: payload.conversation_id,
                senderUsername: payload.sender_username,
                preview: payload.preview || "Nouveau message",
              };
              setMessageToast(nextToast);

              if (toastTimeoutRef.current) {
                window.clearTimeout(toastTimeoutRef.current);
              }
              toastTimeoutRef.current = window.setTimeout(() => {
                setMessageToast(null);
              }, 5500);

            }
          }
        } catch {
          // no-op
        }

        void fetchUnreadMessages();
      };
    }

    const interval = window.setInterval(() => {
      void fetchUnreadMessages();
    }, 30000);

    return () => {
      window.clearInterval(interval);
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
      socket?.close();
    };
  }, [pathname, username]);

  useEffect(() => {
    let lastScrollY = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (pathname === "/") {
        setShowMobileHeader(false);
      } else if (currentScrollY <= 24 || currentScrollY < lastScrollY) {
        setShowMobileHeader(true);
      } else if (currentScrollY > lastScrollY) {
        setShowMobileHeader(false);
      }
      lastScrollY = currentScrollY;
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [pathname]);

  const handleLogout = async () => {
    const token = getStoredToken();
    await unregisterWebPushSubscription(token);
    await unregisterNativePushToken();
    clearStoredSession();
    setUsername(null);
    router.push("/login");
  };

  const isActive = (path: string) => {
    const active =
      pathname === path || (path !== "/" && pathname.startsWith(`${path}/`));
    if (isIsaTheme) {
      return active ? "text-pink-300" : "text-pink-100/55 hover:text-pink-100";
    }
    return active ? "text-red-500" : "text-gray-400 hover:text-white";
  };

  const mobileNavItems = [
    { href: "/", label: "Accueil", icon: Home },
    { href: "/search", label: "Recherche", icon: Search },
    { href: "/social", label: "Social", icon: Users },
    { href: "/messages", label: "Messages", icon: MessageCircle },
    ...(username ? [{ href: "/profile", label: "Profil", icon: UserCircle2 }] : []),
  ] as const;

  return (
    <>
      <nav data-tutorial="primary-nav" className={`hidden md:fixed md:inset-x-0 md:top-0 md:z-50 md:block md:px-6 md:py-3 md:backdrop-blur-xl ${isIsaTheme ? "md:border-b md:border-pink-200/15 md:bg-[#1a0a13]/88" : "md:border-b md:border-white/10 md:bg-zinc-950/88"}`}>
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <Link href="/" className="hidden md:flex items-center">
            <QulteLogo variant={isIsaTheme ? "isa-love" : "default"} />
          </Link>

          <div className="grid flex-1 grid-cols-5 gap-1 md:flex md:w-auto md:flex-none md:gap-8">
            <Link data-tutorial="nav-home" href="/" title="Accueil" aria-label="Accueil" className={`flex items-center justify-center ${isActive("/")}`}>
              <Home size={22} />
            </Link>

            <Link data-tutorial="nav-search" href="/search" title="Recherche" aria-label="Recherche" className={`flex items-center justify-center ${isActive("/search")}`}>
              <Search size={22} />
            </Link>

            <Link data-tutorial="nav-social" href="/social" title="Social" aria-label="Social" className={`flex items-center justify-center ${isActive("/social")}`}>
              <Users size={22} />
            </Link>

            <Link data-tutorial="nav-messages" href="/messages" title="Messages" aria-label="Messages" className={`flex items-center justify-center ${isActive("/messages")}`}>
              <span className="relative">
                <MessageCircle size={22} />
                {unreadMessages > 0 && (
                  <span className="absolute -right-2 -top-2 rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
                    {unreadMessages > 9 ? "9+" : unreadMessages}
                  </span>
                )}
              </span>
            </Link>

            {username ? (
              <Link data-tutorial="nav-profile" href="/profile" title="Profil" aria-label="Profil" className={`flex items-center justify-center ${isActive("/profile")}`}>
                <UserCircle2 size={22} />
              </Link>
            ) : (
              <span className="hidden md:block" />
            )}
          </div>

          <div className="hidden md:flex items-center gap-4">
            {username ? (
              <>
                <Link
                  href="/profile"
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-bold text-white transition ${
                    isIsaTheme
                      ? "border-pink-200/20 bg-pink-400/10 hover:bg-pink-400/18"
                      : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                  }`}
                >
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${
                    isIsaTheme ? "bg-pink-200 text-[#5c0d33]" : "bg-white text-black"
                  }`}>
                    {username.charAt(0).toUpperCase()}
                  </span>
                  <span>@{username}</span>
                </Link>
                <button onClick={handleLogout} title="Déconnexion">
                  <LogOut size={20} />
                </button>
              </>
            ) : (
              <div className="flex gap-2">
                <Link href="/login" className="text-sm font-bold text-gray-300 hover:text-white">
                  Connexion
                </Link>
                <Link
                  href="/signup"
                  className={`rounded px-3 py-1 text-sm font-bold ${isIsaTheme ? "bg-pink-500 text-[#320315]" : "bg-red-600"}`}
                >
                  Inscription
                </Link>
              </div>
            )}
          </div>
        </div>
      </nav>

      <nav data-tutorial="primary-nav" className="fixed inset-x-3 bottom-[calc(0.7rem+env(safe-area-inset-bottom))] z-50 md:hidden">
        <div className={`mx-auto max-w-lg rounded-[30px] border p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.38)] backdrop-blur-2xl ${
          isIsaTheme ? "border-pink-200/18 bg-[#1a0a13]/88" : "border-white/10 bg-zinc-950/88"
        }`}>
          <div className="flex items-center gap-1">
            {mobileNavItems.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(`${item.href}/`));

              return (
                <Link
                  key={item.href}
                  data-tutorial={
                    item.href === "/"
                      ? "nav-home"
                      : item.href === "/search"
                        ? "nav-search"
                        : item.href === "/social"
                          ? "nav-social"
                          : item.href === "/messages"
                            ? "nav-messages"
                            : item.href === "/profile"
                              ? "nav-profile"
                              : undefined
                  }
                  href={item.href}
                  title={item.label}
                  aria-label={item.label}
                  className={`relative flex h-10 flex-1 items-center justify-center rounded-full transition ${
                    active
                      ? isIsaTheme
                        ? "bg-pink-200 text-[#4d0929] shadow-[0_10px_24px_rgba(255,185,220,0.24)]"
                        : "bg-white text-black shadow-[0_10px_24px_rgba(255,255,255,0.12)]"
                      : isIsaTheme
                        ? "text-pink-100/60 hover:bg-pink-200/8 hover:text-pink-100"
                        : "text-gray-400 hover:bg-white/[0.04] hover:text-white"
                  }`}
                >
                  <span className="relative">
                    <Icon size={17} />
                    {item.href === "/messages" && unreadMessages > 0 && (
                      <span className="absolute -right-2 -top-2 rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
                        {unreadMessages > 9 ? "9+" : unreadMessages}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {!username ? (
        <div
          className={`fixed right-4 top-[calc(env(safe-area-inset-top)+0.45rem)] z-50 transition duration-200 md:hidden ${
            pathname === "/" || !showMobileHeader
              ? "pointer-events-none -translate-y-4 opacity-0"
              : "translate-y-0 opacity-100"
          }`}
        >
          <Link
            href="/login"
            className={`inline-flex items-center rounded-full border px-3 py-2 text-[11px] font-semibold text-white shadow-[0_12px_28px_rgba(0,0,0,0.28)] backdrop-blur-xl ${
              isIsaTheme ? "border-pink-200/18 bg-[#1a0a13]/80" : "border-white/10 bg-zinc-950/78"
            }`}
          >
            Connexion
          </Link>
        </div>
      ) : null}

      {messageToast ? (
        <button
          type="button"
          onClick={() => {
            setMessageToast(null);
            router.push(`/messages?conversationId=${messageToast.conversationId}`);
          }}
          className={`fixed right-4 top-4 z-[70] w-[min(92vw,360px)] rounded-[24px] border px-4 py-3 text-left shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl transition hover:scale-[1.01] ${
            isIsaTheme
              ? "border-pink-200/20 bg-[#220d18]/92"
              : "border-white/10 bg-zinc-950/92"
          } md:top-24`}
        >
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ${
              isIsaTheme ? "bg-pink-400/16 text-pink-200" : "bg-red-500/12 text-red-200"
            }`}>
              <MessageCircle className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                Nouveau message
              </div>
              <div className="mt-1 truncate text-sm font-bold text-white">
                @{messageToast.senderUsername}
              </div>
              <div className="mt-1 line-clamp-2 text-sm text-gray-300">
                {messageToast.preview}
              </div>
            </div>
          </div>
        </button>
      ) : null}
    </>
  );
}

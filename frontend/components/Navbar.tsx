"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, Search, LogOut, Users, MessageCircle, UserCircle2 } from "lucide-react";
import QulteLogo from "@/components/QulteLogo";
import { API_URL } from "@/config";
import { buildAuthHeaders, clearStoredSession, getStoredToken } from "@/lib/auth";
import { unregisterNativePushToken } from "@/lib/native-app";
import { buildRealtimeWebSocketUrl } from "@/lib/realtime";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [showMobileHeader, setShowMobileHeader] = useState(true);

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
      socket.onmessage = () => {
        void fetchUnreadMessages();
      };
    }

    const interval = window.setInterval(() => {
      void fetchUnreadMessages();
    }, 30000);

    return () => {
      window.clearInterval(interval);
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
    await unregisterNativePushToken();
    clearStoredSession();
    setUsername(null);
    router.push("/login");
  };

  const isActive = (path: string) => {
    const active =
      pathname === path || (path !== "/" && pathname.startsWith(`${path}/`));
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
      <nav className="hidden md:fixed md:inset-x-0 md:top-0 md:z-50 md:block md:border-b md:border-white/10 md:bg-zinc-950/88 md:px-6 md:py-3 md:backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <Link href="/" className="hidden md:flex items-center">
            <QulteLogo />
          </Link>

          <div className="grid flex-1 grid-cols-5 gap-1 md:flex md:w-auto md:flex-none md:gap-8">
            <Link href="/" title="Accueil" aria-label="Accueil" className={`flex items-center justify-center ${isActive("/")}`}>
              <Home size={22} />
            </Link>

            <Link href="/search" title="Recherche" aria-label="Recherche" className={`flex items-center justify-center ${isActive("/search")}`}>
              <Search size={22} />
            </Link>

            <Link href="/social" title="Social" aria-label="Social" className={`flex items-center justify-center ${isActive("/social")}`}>
              <Users size={22} />
            </Link>

            <Link href="/messages" title="Messages" aria-label="Messages" className={`flex items-center justify-center ${isActive("/messages")}`}>
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
              <Link href="/profile" title="Profil" aria-label="Profil" className={`flex items-center justify-center ${isActive("/profile")}`}>
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
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-bold text-white transition hover:bg-white/[0.08]"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-black text-black">
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
                <Link href="/signup" className="rounded bg-red-600 px-3 py-1 text-sm font-bold">
                  Inscription
                </Link>
              </div>
            )}
          </div>
        </div>
      </nav>

      <nav className="fixed inset-x-3 bottom-[calc(0.7rem+env(safe-area-inset-bottom))] z-50 md:hidden">
        <div className="mx-auto max-w-lg rounded-[30px] border border-white/10 bg-zinc-950/88 p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.38)] backdrop-blur-2xl">
          <div className="flex items-center gap-1">
            {mobileNavItems.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(`${item.href}/`));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  aria-label={item.label}
                  className={`relative flex h-10 flex-1 items-center justify-center rounded-full transition ${
                    active
                      ? "bg-white text-black shadow-[0_10px_24px_rgba(255,255,255,0.12)]"
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
            className="inline-flex items-center rounded-full border border-white/10 bg-zinc-950/78 px-3 py-2 text-[11px] font-semibold text-white shadow-[0_12px_28px_rgba(0,0,0,0.28)] backdrop-blur-xl"
          >
            Connexion
          </Link>
        </div>
      ) : null}
    </>
  );
}

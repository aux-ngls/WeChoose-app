"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, Search, Film, List, LogIn, LogOut, Users, MessageCircle } from "lucide-react";
import QulteLogo from "@/components/QulteLogo";
import { API_URL } from "@/config";
import { buildAuthHeaders, getStoredToken } from "@/lib/auth";
import { unregisterNativePushToken } from "@/lib/native-app";
import { buildRealtimeWebSocketUrl } from "@/lib/realtime";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [unreadMessages, setUnreadMessages] = useState(0);

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

  const handleLogout = async () => {
    await unregisterNativePushToken();
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    setUsername(null);
    router.push("/login");
  };

  const isActive = (path: string) => {
    const active =
      pathname === path || (path !== "/" && pathname.startsWith(`${path}/`));
    return active ? "text-red-500" : "text-gray-400 hover:text-white";
  };

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-zinc-950/88 px-3 pb-[calc(0.8rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl md:top-0 md:bottom-auto md:border-b md:border-t-0 md:px-6 md:pb-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <Link href="/" className="hidden md:flex items-center">
            <QulteLogo />
          </Link>

          <div className="grid flex-1 grid-cols-6 gap-1 md:flex md:w-auto md:flex-none md:gap-8">
            <Link href="/" className={`flex flex-col items-center gap-1 ${isActive("/")}`}>
              <Home size={22} />
              <span className="text-[9px] md:text-xs">Accueil</span>
            </Link>

            <Link href="/news" className={`flex flex-col items-center gap-1 ${isActive("/news")}`}>
              <Film size={22} />
              <span className="text-[9px] md:text-xs">Sorties</span>
            </Link>

            <Link href="/search" className={`flex flex-col items-center gap-1 ${isActive("/search")}`}>
              <Search size={22} />
              <span className="text-[9px] md:text-xs">Cherche</span>
            </Link>

            <Link href="/playlist" className={`flex flex-col items-center gap-1 ${isActive("/playlist")}`}>
              <List size={22} />
              <span className="text-[9px] md:text-xs">Listes</span>
            </Link>

            <Link href="/social" className={`flex flex-col items-center gap-1 ${isActive("/social")}`}>
              <Users size={22} />
              <span className="text-[9px] md:text-xs">Social</span>
            </Link>

            <Link href="/messages" className={`flex flex-col items-center gap-1 ${isActive("/messages")}`}>
              <span className="relative">
                <MessageCircle size={22} />
                {unreadMessages > 0 && (
                  <span className="absolute -right-2 -top-2 rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
                    {unreadMessages > 9 ? "9+" : unreadMessages}
                  </span>
                )}
              </span>
              <span className="text-[9px] md:text-xs">DM</span>
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-4">
            {username ? (
              <>
                <span className="text-sm font-bold text-white">@{username}</span>
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

      <div className="fixed inset-x-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 md:hidden">
        <div className="flex items-center justify-between rounded-[24px] border border-white/10 bg-zinc-950/82 px-4 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.4)] backdrop-blur-xl">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <QulteLogo compact />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-white">Qulte</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-amber-300/80">
                Mobile
              </div>
            </div>
          </Link>

          {username ? (
            <div className="flex items-center gap-2">
              <span className="max-w-24 truncate text-xs font-medium text-gray-400">
                @{username}
              </span>
              <button
                onClick={handleLogout}
                className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-red-400"
                aria-label="Se déconnecter"
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white"
              >
                Connexion
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-red-600 px-3 py-2 text-xs font-semibold text-white"
              >
                Creer
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

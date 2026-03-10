"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, Search, Film, List, LogIn, LogOut, Users, MessageCircle } from "lucide-react";
import QulteLogo from "@/components/QulteLogo";
import { API_URL } from "@/config";
import { buildAuthHeaders, getStoredToken } from "@/lib/auth";
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

  const handleLogout = () => {
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
      {/* --- BARRE DE NAVIGATION (Bas sur Mobile / Haut sur PC) --- */}
      <nav className="fixed bottom-0 w-full bg-gray-900 border-t border-gray-800 p-3 md:top-0 md:bottom-auto md:border-b md:border-t-0 z-50 transition-all">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
            
            {/* Logo (Visible seulement sur PC) */}
            <Link href="/" className="hidden md:flex items-center">
                <QulteLogo />
            </Link>

            {/* Liens de Navigation */}
            <div className="flex justify-around w-full md:w-auto md:gap-8">
                <Link href="/" className={`flex flex-col items-center gap-1 ${isActive("/")}`}>
                    <Home size={24} />
                    <span className="text-[10px] md:text-xs">Accueil</span>
                </Link>
                
                <Link href="/news" className={`flex flex-col items-center gap-1 ${isActive("/news")}`}>
                    <Film size={24} />
                    <span className="text-[10px] md:text-xs">A l'affiche</span>
                </Link>

                <Link href="/search" className={`flex flex-col items-center gap-1 ${isActive("/search")}`}>
                    <Search size={24} />
                    <span className="text-[10px] md:text-xs">Recherche</span>
                </Link>
                
                <Link href="/playlist" className={`flex flex-col items-center gap-1 ${isActive("/playlist")}`}>
                    <List size={24} />
                    <span className="text-[10px] md:text-xs">Listes</span>
                </Link>

                <Link href="/social" className={`flex flex-col items-center gap-1 ${isActive("/social")}`}>
                    <Users size={24} />
                    <span className="text-[10px] md:text-xs">Social</span>
                </Link>

                <Link href="/messages" className={`flex flex-col items-center gap-1 ${isActive("/messages")}`}>
                    <span className="relative">
                        <MessageCircle size={24} />
                        {unreadMessages > 0 && (
                            <span className="absolute -right-2 -top-2 rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
                                {unreadMessages > 9 ? "9+" : unreadMessages}
                            </span>
                        )}
                    </span>
                    <span className="text-[10px] md:text-xs">Messages</span>
                </Link>
            </div>

            {/* Zone Utilisateur (PC uniquement ici, Mobile géré en dessous) */}
            <div className="hidden md:flex items-center gap-4">
                {username ? (
                    <>
                        <span className="text-sm font-bold">👤 {username}</span>
                        <button onClick={handleLogout} title="Déconnexion"><LogOut size={20}/></button>
                    </>
                ) : (
                    <div className="flex gap-2">
                        <Link href="/login" className="text-sm font-bold text-gray-300 hover:text-white">Connexion</Link>
                        <Link href="/signup" className="px-3 py-1 bg-red-600 rounded text-sm font-bold">Inscription</Link>
                    </div>
                )}
            </div>
        </div>
      </nav>

      {/* --- BOUTON CONNEXION MOBILE (Flottant en haut à droite) --- */}
      <div className="md:hidden fixed top-4 left-4 z-50">
        <Link href="/" className="flex items-center">
          <QulteLogo compact />
        </Link>
      </div>

      <div className="md:hidden fixed top-4 right-4 z-50">
        {username ? (
             <button onClick={handleLogout} className="bg-gray-800/80 p-2 rounded-full text-red-500 backdrop-blur-sm border border-gray-700">
                <LogOut size={20}/>
             </button>
        ) : (
             <Link href="/login" className="flex items-center justify-center bg-red-600 p-2 rounded-full text-white shadow-lg">
                <LogIn size={20}/>
             </Link>
        )}
      </div>
    </>
  );
}

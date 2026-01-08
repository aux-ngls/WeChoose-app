"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flame, Clock, Clapperboard, Search } from "lucide-react"; // Clock au lieu de Heart

export default function Navbar() {
  const pathname = usePathname();
  const getLinkClass = (path: string) => `flex flex-col items-center gap-1 ${pathname === path ? "text-blue-500 scale-110" : "text-gray-500"} transition-all`;

  return (
    <nav className="fixed bottom-0 left-0 w-full bg-gray-950 border-t border-gray-800 p-4 z-50 pb-6">
      <div className="flex justify-around items-center max-w-md mx-auto">
        
        {/* Swipe */}
        <Link href="/" className={`flex flex-col items-center gap-1 ${pathname === "/" ? "text-red-500 scale-110" : "text-gray-500"} transition-all`}>
          <Flame size={24} />
          <span className="text-[10px]">Swipe</span>
        </Link>

        {/* Recherche */}
        <Link href="/search" className={getLinkClass("/search")}>
          <Search size={24} />
          <span className="text-[10px]">Chercher</span>
        </Link>

        {/* Actu */}
        <Link href="/news" className={getLinkClass("/news")}>
          <Clapperboard size={24} />
          <span className="text-[10px]">Actu</span>
        </Link>

        {/* PLAYLIST (Nouveau) */}
        <Link href="/playlist" className={getLinkClass("/playlist")}>
          <Clock size={24} />
          <span className="text-[10px]">Playlist</span>
        </Link>

      </div>
    </nav>
  );
}
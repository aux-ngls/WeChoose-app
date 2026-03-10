import Link from "next/link";
import { WifiOff } from "lucide-react";
import QulteLogo from "@/components/QulteLogo";

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.14),transparent_30%),radial-gradient(circle_at_bottom,_rgba(239,68,68,0.12),transparent_35%),#020203] px-6 text-white">
      <div className="w-full max-w-md rounded-[32px] border border-white/10 bg-white/[0.04] p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-md">
        <div className="mb-6 flex justify-center">
          <QulteLogo />
        </div>
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300">
          <WifiOff className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-black tracking-tight">Connexion indisponible</h1>
        <p className="mt-3 text-sm leading-6 text-gray-300">
          Qulte garde l&apos;interface disponible, mais cette page a besoin du reseau pour charger
          tes films, messages et critiques.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Link
            href="/"
            className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-500"
          >
            Reessayer
          </Link>
          <p className="text-xs uppercase tracking-[0.18em] text-gray-500">
            Astuce: installe Qulte sur ton ecran d&apos;accueil pour l&apos;ouvrir comme une app.
          </p>
        </div>
      </div>
    </main>
  );
}

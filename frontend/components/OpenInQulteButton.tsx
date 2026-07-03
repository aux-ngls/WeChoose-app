"use client";

import { Smartphone } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

function isMobileBrowser() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /iphone|ipad|ipod|android/i.test(navigator.userAgent);
}

export default function OpenInQulteButton({ movieId }: { movieId: number }) {
  const [showFallbackHint, setShowFallbackHint] = useState(false);
  const didAttemptOpenRef = useRef(false);
  const deepLinkUrl = useMemo(() => `qulte://movie/${movieId}`, [movieId]);

  const openApp = () => {
    didAttemptOpenRef.current = true;
    setShowFallbackHint(false);
    window.location.href = deepLinkUrl;
    window.setTimeout(() => {
      setShowFallbackHint(true);
    }, 1200);
  };

  useEffect(() => {
    if (!isMobileBrowser() || didAttemptOpenRef.current) {
      return;
    }

    didAttemptOpenRef.current = true;
    window.location.href = deepLinkUrl;
    const timeout = window.setTimeout(() => {
      setShowFallbackHint(true);
    }, 1200);

    return () => window.clearTimeout(timeout);
  }, [deepLinkUrl]);

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={openApp}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-extrabold text-slate-950 transition hover:bg-cyan-200"
      >
        <Smartphone className="h-4 w-4" />
        Ouvrir dans Qulte
      </button>
      {showFallbackHint ? (
        <p className="text-center text-xs font-medium text-gray-400">
          Si l&apos;app n&apos;est pas installée, cette fiche reste disponible ici sur le web.
        </p>
      ) : null}
    </div>
  );
}

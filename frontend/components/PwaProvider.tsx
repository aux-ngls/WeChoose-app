"use client";

import { useEffect, useState } from "react";
import { Download, Share2, X } from "lucide-react";
import QulteLogo from "@/components/QulteLogo";

const DISMISS_STORAGE_KEY = "qulte-install-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

function isStandalone() {
  if (typeof window === "undefined") {
    return false;
  }

  const navigatorWithStandalone = window.navigator as Navigator & {
    standalone?: boolean;
  };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

export default function PwaProvider() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installDismissed, setInstallDismissed] = useState(true);
  const [standalone, setStandalone] = useState(true);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setInstallDismissed(window.localStorage.getItem(DISMISS_STORAGE_KEY) === "1");
    setStandalone(isStandalone());

    const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    const isSafari =
      /^((?!chrome|android).)*safari/i.test(window.navigator.userAgent) ||
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
    setShowIosHint(isIos && isSafari && !isStandalone());

    if ("serviceWorker" in window.navigator) {
      void window.navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("Service worker registration failed", error);
      });
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setStandalone(false);
    };

    const handleInstalled = () => {
      setInstallPrompt(null);
      setStandalone(true);
      setShowIosHint(false);
      window.localStorage.removeItem(DISMISS_STORAGE_KEY);
      setInstallDismissed(false);
    };

    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const handleDisplayModeChange = () => {
      setStandalone(isStandalone());
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    mediaQuery.addEventListener("change", handleDisplayModeChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      mediaQuery.removeEventListener("change", handleDisplayModeChange);
    };
  }, []);

  const dismiss = () => {
    setInstallDismissed(true);
    window.localStorage.setItem(DISMISS_STORAGE_KEY, "1");
  };

  const handleInstall = async () => {
    if (!installPrompt) {
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setInstallPrompt(null);
      setShowIosHint(false);
      setInstallDismissed(false);
    }
  };

  if (standalone || installDismissed || (!installPrompt && !showIosHint)) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-[calc(var(--safe-bottom)+5.9rem)] z-[70] md:bottom-6 md:left-auto md:right-6 md:max-w-sm">
      <div className="pointer-events-auto rounded-[28px] border border-white/10 bg-zinc-950/92 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <QulteLogo compact />
            <div className="min-w-0">
              <div className="text-sm font-bold text-white">Installer Qulte</div>
              <p className="mt-1 text-xs leading-5 text-gray-400">
                {showIosHint
                  ? "Ajoute Qulte a l'ecran d'accueil pour une vraie ouverture plein ecran."
                  : "Ouvre Qulte comme une app mobile, avec navigation rapide et ecran dedie."}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={dismiss}
            className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-gray-300 transition hover:bg-white/[0.08] hover:text-white"
            aria-label="Fermer la suggestion d'installation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3">
          {showIosHint ? (
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-3 py-3 text-xs text-amber-100">
              <Share2 className="h-4 w-4 flex-none" />
              <span>Safari: touche Partager puis "Sur l'ecran d'accueil".</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void handleInstall()}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-500"
            >
              <Download className="h-4 w-4" />
              Installer
            </button>
          )}

          <button
            type="button"
            onClick={dismiss}
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
          >
            Plus tard
          </button>
        </div>
      </div>
    </div>
  );
}

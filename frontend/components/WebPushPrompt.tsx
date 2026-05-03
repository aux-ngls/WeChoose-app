"use client";

import { useEffect, useState } from "react";
import { BellRing, CheckCircle2, X } from "lucide-react";
import { getStoredToken } from "@/lib/auth";
import {
  canUseWebPush,
  requestWebPushPermissionAndSubscribe,
  syncWebPushSubscription,
} from "@/lib/web-push";

function isStandalone(): boolean {
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

export default function WebPushPrompt() {
  const [token, setToken] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "unsupported",
  );
  const [standalone, setStandalone] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const refreshSession = () => {
      setToken(getStoredToken());
    };

    refreshSession();
    window.addEventListener("storage", refreshSession);
    window.addEventListener("qulte-session-changed", refreshSession as EventListener);
    return () => {
      window.removeEventListener("storage", refreshSession);
      window.removeEventListener("qulte-session-changed", refreshSession as EventListener);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const refreshDisplayState = () => {
      setStandalone(isStandalone());
      setPermission(canUseWebPush() ? Notification.permission : "unsupported");
    };

    refreshDisplayState();

    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    mediaQuery.addEventListener("change", refreshDisplayState);
    document.addEventListener("visibilitychange", refreshDisplayState);

    return () => {
      mediaQuery.removeEventListener("change", refreshDisplayState);
      document.removeEventListener("visibilitychange", refreshDisplayState);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncSubscription = async () => {
      if (!token || !canUseWebPush()) {
        if (!cancelled) {
          setSubscribed(false);
        }
        return;
      }

      if (!standalone) {
        if (!cancelled) {
          setSubscribed(false);
        }
        return;
      }

      if (Notification.permission !== "granted") {
        if (!cancelled) {
          setSubscribed(false);
          setPermission(Notification.permission);
        }
        return;
      }

      try {
        const active = await syncWebPushSubscription(token);
        if (!cancelled) {
          setSubscribed(active);
          setPermission(Notification.permission);
        }
      } catch {
        if (!cancelled) {
          setSubscribed(false);
        }
      }
    };

    void syncSubscription();

    return () => {
      cancelled = true;
    };
  }, [token, standalone]);

  const handleEnable = async () => {
    if (!token) {
      return;
    }

    setLoading(true);
    setError("");
    try {
      const active = await requestWebPushPermissionAndSubscribe(token);
      setSubscribed(active);
      setPermission(canUseWebPush() ? Notification.permission : "unsupported");
      if (active) {
        setDismissed(true);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Impossible d'activer les notifications",
      );
    } finally {
      setLoading(false);
    }
  };

  if (!token || dismissed || permission === "unsupported") {
    return null;
  }

  if (!standalone) {
    return null;
  }

  if (permission === "granted" && subscribed) {
    return null;
  }

  if (permission === "denied") {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-[calc(var(--safe-bottom)+5.9rem)] z-[72] md:bottom-6 md:left-auto md:right-6 md:max-w-sm">
      <div className="pointer-events-auto rounded-[28px] border border-white/10 bg-zinc-950/92 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500/12 text-red-200">
              {permission === "granted" ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <BellRing className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-white">Active les notifications</div>
              <p className="mt-1 text-xs leading-5 text-gray-400">
                Recois les nouveaux messages meme quand Qulte est ferme.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-gray-300 transition hover:bg-white/[0.08] hover:text-white"
            aria-label="Fermer la suggestion de notifications"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error ? <div className="mt-3 text-xs text-rose-300">{error}</div> : null}

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleEnable()}
            disabled={loading}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Activation..." : permission === "granted" ? "Finaliser" : "Activer"}
          </button>

          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
          >
            Plus tard
          </button>
        </div>
      </div>
    </div>
  );
}

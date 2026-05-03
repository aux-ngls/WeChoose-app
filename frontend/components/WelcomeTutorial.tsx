"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Home,
  Loader2,
  MessageCircle,
  Search,
  Sparkles,
  UserCircle2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { API_URL } from "@/config";
import {
  buildAuthHeaders,
  getStoredOnboardingCompleted,
  getStoredToken,
  getStoredTutorialCompleted,
  markTutorialCompleted,
} from "@/lib/auth";

type TutorialMode = "normal" | "replay";

interface TutorialSection {
  icon: LucideIcon;
  title: string;
  description: string;
}

const HIDDEN_PATHS = new Set(["/login", "/signup", "/onboarding"]);

const TUTORIAL_SECTIONS: TutorialSection[] = [
  {
    icon: Home,
    title: "Accueil",
    description: "Swipe, note des films et garde ceux qui t'interessent pour plus tard.",
  },
  {
    icon: Search,
    title: "Recherche",
    description: "Trouve rapidement un film si tu as deja un titre en tete.",
  },
  {
    icon: Users,
    title: "Social",
    description: "Lis des critiques, publie les tiennes et suis d'autres profils.",
  },
  {
    icon: MessageCircle,
    title: "Messages",
    description: "Partage un film ou reprends une conversation en prive.",
  },
  {
    icon: UserCircle2,
    title: "Profil",
    description: "Retrouve ta vitrine cine, tes playlists et ton espace perso.",
  },
];

export default function WelcomeTutorial() {
  const pathname = usePathname();
  const [checkedStatus, setCheckedStatus] = useState(false);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [tutorialMode, setTutorialMode] = useState<TutorialMode | null>(null);

  useEffect(() => {
    const shouldHide = HIDDEN_PATHS.has(pathname);
    const token = getStoredToken();
    const hasCompletedOnboarding = getStoredOnboardingCompleted();
    const hasCompletedTutorial = getStoredTutorialCompleted();
    const replayRequested =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("tutorial") === "1";

    if (shouldHide || !token || !hasCompletedOnboarding) {
      setOpen(false);
      setCheckedStatus(true);
      return;
    }

    if (replayRequested) {
      setTutorialMode("replay");
      setOpen(true);
      setCheckedStatus(true);
      setLoading(false);
      return;
    }

    if (hasCompletedTutorial === true) {
      setOpen(false);
      setCheckedStatus(true);
      return;
    }

    let isActive = true;
    setLoading(true);

    void fetch(`${API_URL}/users/me`, {
      headers: buildAuthHeaders(token),
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Impossible de verifier le tutoriel");
        }
        return res.json();
      })
      .then((payload) => {
        if (!isActive) {
          return;
        }

        if (payload?.has_completed_tutorial) {
          markTutorialCompleted();
          setOpen(false);
        } else {
          setTutorialMode("normal");
          setOpen(true);
        }
      })
      .catch(() => {
        if (!isActive) {
          return;
        }
        setOpen(false);
      })
      .finally(() => {
        if (!isActive) {
          return;
        }
        setLoading(false);
        setCheckedStatus(true);
      });

    return () => {
      isActive = false;
    };
  }, [pathname]);

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }

    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [open]);

  const handleComplete = async () => {
    const token = getStoredToken();
    if (!token) {
      setOpen(false);
      setTutorialMode(null);
      return;
    }

    setCompleting(true);
    try {
      if (tutorialMode !== "replay") {
        await fetch(`${API_URL}/tutorial/complete`, {
          method: "POST",
          headers: buildAuthHeaders(token),
        });
      }
    } catch {
      // On garde le marquage local pour ne pas bloquer l'utilisateur.
    } finally {
      markTutorialCompleted();
      setCompleting(false);
      setOpen(false);
      setTutorialMode(null);
    }
  };

  if (!checkedStatus || loading || !open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm">
      <div className="flex min-h-screen items-center justify-center px-4 py-6">
        <div className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/10 bg-zinc-950/96 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
          <div className="border-b border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.20),transparent_38%),radial-gradient(circle_at_top_right,rgba(251,191,36,0.16),transparent_34%),linear-gradient(145deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] px-5 py-5 md:px-6">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-400/12 text-rose-200">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-100/70">
                  Premiere visite
                </div>
                <h2 className="mt-1 text-xl font-black tracking-tight text-white md:text-2xl">
                  Bienvenue sur Qulte
                </h2>
                <p className="mt-2 text-sm leading-6 text-gray-200">
                  Voici les espaces principaux pour bien demarrer. Plus tu notes de films,
                  plus les recommandations deviennent personnelles.
                </p>
              </div>
            </div>
          </div>

          <div className="px-5 py-5 md:px-6">
            <div className="grid gap-3 sm:grid-cols-2">
              {TUTORIAL_SECTIONS.map((section) => {
                const Icon = section.icon;
                return (
                  <div
                    key={section.title}
                    className="rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-white">
                        <Icon className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white">{section.title}</div>
                        <p className="mt-1 text-sm leading-6 text-gray-300">
                          {section.description}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-400">
                Commence simplement par quelques swipes et quelques notes.
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleComplete}
                  disabled={completing}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-gray-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Fermer
                </button>
                <button
                  type="button"
                  onClick={handleComplete}
                  disabled={completing}
                  className="inline-flex items-center gap-2 rounded-full bg-rose-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:bg-rose-950/70 disabled:text-rose-200/60"
                >
                  {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  C&apos;est parti
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

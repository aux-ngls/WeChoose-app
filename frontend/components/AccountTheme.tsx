"use client";

import { useEffect, useMemo, useState } from "react";

const ISA_THEME_USERNAME = "isa.belaaa";

const HEARTS = [
  { left: "6%", top: "13%", size: "1.2rem", delay: "0s", duration: "12s", opacity: 0.28 },
  { left: "18%", top: "72%", size: "0.95rem", delay: "1.4s", duration: "15s", opacity: 0.22 },
  { left: "31%", top: "22%", size: "0.8rem", delay: "2.8s", duration: "11s", opacity: 0.19 },
  { left: "43%", top: "84%", size: "1.05rem", delay: "0.9s", duration: "14s", opacity: 0.24 },
  { left: "57%", top: "18%", size: "1.3rem", delay: "3.1s", duration: "13s", opacity: 0.2 },
  { left: "69%", top: "66%", size: "0.9rem", delay: "2.2s", duration: "12.5s", opacity: 0.16 },
  { left: "82%", top: "28%", size: "1.1rem", delay: "1.1s", duration: "16s", opacity: 0.18 },
  { left: "91%", top: "78%", size: "0.85rem", delay: "3.8s", duration: "10.5s", opacity: 0.2 },
];

function resolveThemeUsername() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem("username");
}

export default function AccountTheme() {
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    const syncTheme = () => {
      const nextUsername = resolveThemeUsername();
      setUsername(nextUsername);

      const root = document.documentElement;
      if (nextUsername?.toLowerCase() === ISA_THEME_USERNAME) {
        root.dataset.accountTheme = "isa-love";
      } else {
        delete root.dataset.accountTheme;
      }
    };

    syncTheme();
    window.addEventListener("storage", syncTheme);
    const interval = window.setInterval(syncTheme, 1000);

    return () => {
      window.removeEventListener("storage", syncTheme);
      window.clearInterval(interval);
    };
  }, []);

  const isIsaTheme = useMemo(
    () => username?.toLowerCase() === ISA_THEME_USERNAME,
    [username],
  );

  if (!isIsaTheme) {
    return null;
  }

  return (
    <div className="isa-love-hearts" aria-hidden="true">
      {HEARTS.map((heart, index) => (
        <span
          key={`${heart.left}-${heart.top}-${index}`}
          className="isa-love-heart"
          style={{
            left: heart.left,
            top: heart.top,
            fontSize: heart.size,
            animationDelay: heart.delay,
            animationDuration: heart.duration,
            opacity: heart.opacity,
          }}
        >
          ❤
        </span>
      ))}
    </div>
  );
}
